import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import type { ProjectFileEntry, ProjectManifest } from './src/gameHost/manifestTypes';

// The current Vite config.root is authoritative. Never assume a published
// project ID, editor path, or a particular /build/project/<id> directory.
const virtualModuleId = 'virtual:project-file-manifest';
const resolvedVirtualModuleId = '\0' + virtualModuleId;
const textExtensions = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json',
  '.css', '.scss', '.html', '.md', '.txt', '.yaml', '.yml', '.svg',
]);
const excludedDirectories = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.cache', '.pnpm', '.turbo',
]);
const sensitiveName = /(?:^|[._-])(?:secrets?|credentials?|tokens?|passwords?|api[_-]?keys?|access[_-]?keys?|private[_-]?keys?|cert(?:ificates?|s?))(?:[._-]|$)/i;
const privateKeyName = /(?:^|[._-])(?:id_rsa|id_ed25519|id_ecdsa|ssh_host_.*_key)(?:$|\.)/i;
const certificateExtensions = new Set([
  '.pem', '.key', '.crt', '.cer', '.cert', '.der', '.csr', '.p7b', '.p7c',
  '.p12', '.pfx', '.jks', '.keystore',
]);
const secretPatterns = [
  /-----BEGIN (?:(?:RSA |EC |OPENSSH )?PRIVATE KEY(?: BLOCK)?|PGP PRIVATE KEY BLOCK)-----/i,
  /-----BEGIN (?:X509 )?CERTIFICATE-----/i,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|secret|credentials?|_auth[_-]?token|npm[_-]?token)\b["']?\s*[:=]\s*["'`][^"'`\r\n]{8,}["'`]/i,
  /\bauthorization\s*[:=]\s*["']?\s*bearer\s+[A-Za-z0-9._~-]{12,}["']?/i,
];

function excluded(relativePath: string): boolean {
  const parts = relativePath.split('/');
  const filename = parts[parts.length - 1] || '';
  if (parts.some(item => excludedDirectories.has(item) ||
      item === '.env' || item.startsWith('.env.'))) return true;
  if (parts.some(item => {
    const normalized = item.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
    return sensitiveName.test(normalized) || privateKeyName.test(normalized);
  })) return true;
  return certificateExtensions.has(path.posix.extname(filename).toLowerCase());
}
const isSensitive = (content: string) => secretPatterns.some(pattern => pattern.test(content));
const sortNames = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

function virtualText(relativePath: string, content: string): ProjectFileEntry {
  return {
    path: relativePath, name: path.posix.basename(relativePath),
    dir: path.posix.dirname(relativePath), ext: '.json',
    size: Buffer.byteLength(content), status: 'TEXT', content,
  };
}

async function createManifest(root: string): Promise<ProjectManifest> {
  const files: ProjectFileEntry[] = [];
  const folders = new Set<string>();

  const scan = async (directory: string, relativeDirectory: string): Promise<void> => {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? relativeDirectory + '/' + entry.name : entry.name;
      if (excluded(relativePath) || entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        folders.add(relativePath);
        await scan(full, relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.posix.extname(entry.name).toLowerCase();
      let size = 0;
      try {
        size = (await stat(full)).size;
        if (size === 0) {
          files.push({ path: relativePath, name: entry.name,
            dir: path.posix.dirname(relativePath), ext, size, status: 'EMPTY' });
          continue;
        }
        const bytes = await readFile(full);
        if (!textExtensions.has(ext) || bytes.includes(0)) {
          files.push({ path: relativePath, name: entry.name,
            dir: path.posix.dirname(relativePath), ext, size: bytes.length,
            status: 'BINARY' });
          continue;
        }
        let content: string;
        try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch {
          files.push({ path: relativePath, name: entry.name,
            dir: path.posix.dirname(relativePath), ext, size: bytes.length,
            status: 'BINARY' });
          continue;
        }
        if (isSensitive(content)) continue;
        files.push({ path: relativePath, name: entry.name,
          dir: path.posix.dirname(relativePath), ext, size: bytes.length,
          status: 'TEXT', content });
      } catch {
        files.push({ path: relativePath, name: entry.name,
          dir: path.posix.dirname(relativePath), ext, size,
          status: 'FAILED', error: 'Unable to read file.' });
      }
    }
  };

  await scan(root, '');

  // This always appears in the viewer, even if a prior mapping report did
  // not survive into this build's snapshot.
  const candidates = [
    'filesystem-map/FILE_TREE.txt',
    'filesystem-map/STATUS.json',
    'filesystem-map/CHECKPOINT.json',
    'filesystem-map/SUMMARY.md',
    'filesystem-map-workspace.mjs',
    'vite-plugin-filesystem-map.ts',
    'BUILD_SOURCE_PROOF.json',
    'README.md',
    'src/games/importedGame/README.md',
  ];
  const checks = await Promise.all(candidates.map(async relative => {
    const absolute = path.resolve(root, relative);
    try {
      const s = await stat(absolute);
      return { relative, absolute, exists: true, size: s.size,
        type: s.isFile() ? 'FILE' : s.isDirectory() ? 'DIRECTORY' : 'OTHER' };
    } catch (error) {
      return { relative, absolute, exists: false,
        reason: (error as NodeJS.ErrnoException)?.code ?? 'UNKNOWN' };
    }
  }));
  const context = {
    note: 'Build-time facts from Vite. No assumed project ID.',
    generatedAt: new Date().toISOString(),
    viteRoot: root,
    nodeCwd: process.cwd(),
    checks,
    mapFileIncluded: files.some(file => file.path === 'filesystem-map/FILE_TREE.txt'),
    warning: 'An index of paths does not provide the contents of files outside the project.',
  };
  folders.add('__build_environment__');
  files.push(virtualText('__build_environment__/BUILD_CONTEXT.json', JSON.stringify(context, null, 2)));
  files.sort((a, b) => sortNames(a.path, b.path));
  return { generatedAt: Date.now(), files, folders: [...folders].sort(sortNames) };
}

function refreshManifest(file: string, server: ViteDevServer, root: string): void {
  const relative = path.relative(root, path.resolve(file)).split(path.sep).join('/');
  if (relative.startsWith('../') || relative === '..' || excluded(relative)) return;
  const module = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
  if (!module) return;
  server.moduleGraph.invalidateModule(module);
  server.ws.send({ type: 'full-reload' });
}

export function projectFileManifestPlugin(): Plugin {
  let projectRoot = process.cwd();
  return {
    name: 'project-file-manifest',
    enforce: 'pre',
    configResolved(config: ResolvedConfig) { projectRoot = config.root; },
    resolveId(id) { return id === virtualModuleId ? resolvedVirtualModuleId : undefined; },
    async load(id) {
      if (id !== resolvedVirtualModuleId) return undefined;
      const readmePath = path.join(projectRoot, 'README.md');
      let readme: Buffer | null = null;
      try { readme = await readFile(readmePath); } catch { /* missing */ }
      const digest = (bytes: Buffer | null) =>
        bytes ? createHash('sha256').update(bytes).digest('hex') : null;
      const first = (content?: string) => content?.split(/\r?\n/, 1)[0] ?? null;
      const report: Record<string, unknown> = {
        schemaVersion: 3, generatedAt: new Date().toISOString(),
        conversationalFileReader: { status: 'UNVERIFIED', firstLine: null,
          fileSizeBytes: null, sha256: null,
          note: 'Node cannot measure the conversational file-reading tool.' },
        nodeBuildFilesystem: { source: 'Node during this Vite build',
          absolutePath: readmePath, firstLine: first(readme?.toString('utf8')),
          fileSizeBytes: readme?.length ?? null, sha256: digest(readme) },
      };
      // Preserve original sequencing: write before scanning so it appears.
      await writeFile(path.join(projectRoot, 'README_SOURCE_CHECK.json'),
        JSON.stringify(report, null, 2) + '\n', 'utf8');
      const manifest = await createManifest(projectRoot);
      const file = manifest.files.find(f => f.path === 'README.md');
      const viewerBytes = file?.content === undefined
        ? null : Buffer.from(file.content, 'utf8');
      report.projectFileViewerManifest = {
        source: 'Vite virtual manifest', path: file?.path ?? null,
        status: file?.status ?? 'NOT FOUND', firstLine: first(file?.content),
        fileSizeBytes: viewerBytes?.length ?? null, sha256: digest(viewerBytes),
      };
      const same = readme?.equals(viewerBytes ?? Buffer.alloc(0)) ?? false;
      report.comparisons = {
        conversationalReaderVsNodeFilesystem: { sameContents: null, basis: 'UNVERIFIED' },
        conversationalReaderVsViewerManifest: { sameContents: null, basis: 'UNVERIFIED' },
        nodeFilesystemVsViewerManifest: { sameContents: same, byteForByte: same },
        allThreeMethodsReturnSameContents: null,
      };
      report.includedInViewerManifest =
        manifest.files.some(f => f.path === 'README_SOURCE_CHECK.json');
      await writeFile(path.join(projectRoot, 'README_SOURCE_CHECK.json'),
        JSON.stringify(report, null, 2) + '\n', 'utf8');
      console.log('[VIEWER-FILESYSTEM-PROOF] ' + JSON.stringify({
        root: projectRoot, cwd: process.cwd(), files: manifest.files.length,
        hasBuildContext: manifest.files.some(f => f.path === '__build_environment__/BUILD_CONTEXT.json'),
        hasMap: manifest.files.some(f => f.path === 'filesystem-map/FILE_TREE.txt'),
        nodeReadmeMatchesViewer: same,
      }));
      const serialized = JSON.stringify(manifest).replace(/</g, '\\u003c');
      return 'const manifest = ' + serialized + ';\nexport default manifest;';
    },
    configureServer(server) {
      const changed = (file: string) => refreshManifest(file, server, projectRoot);
      server.watcher.on('add', changed);
      server.watcher.on('unlink', changed);
      server.httpServer?.once('close', () => {
        server.watcher.off('add', changed);
        server.watcher.off('unlink', changed);
      });
    },
    handleHotUpdate(ctx) { refreshManifest(ctx.file, ctx.server, projectRoot); },
  };
}
