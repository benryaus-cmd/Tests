/**
 * AIPPY BUILD-CONTAINER FILESYSTEM MAP
 *
 * Integrate in existing vite.config.ts:
 *   import { filesystemMapPlugin } from './vite-plugin-filesystem-map';
 *   // Add filesystemMapPlugin() to the existing plugins array.
 * Build normally. The plugin runs with real Node.js in buildStart().
 *
 * Read-only directory-entry map starting at '/', with NO hardcoded directory
 * allowlist, depth limit, or file count limit. It does not read file contents,
 * follow symlinks, modify permissions, or write outside this project.
 * Inventory only environments you have permission to inspect.
 *
 * Output: filesystem-map/FILE_TREE.txt (D/F/L/O/E + absolute path)
 *         filesystem-map/STATUS.json (progress)
 *         filesystem-map/CHECKPOINT.json (resumable queue)
 *
 * A partial scan continues during the next build. No extra dependencies.
 * A separate AI worker is not necessary: Node executes this directly.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

interface State {
  schema: number;
  startedAt: string;
  queue: string[];
  cursor: number;
  foldersVisited: number;
  entriesRecorded: number;
  errors: number;
  complete: boolean;
}

const BUDGET_MS = 20000;
const CHUNK_SIZE = 256000;

function message(e: unknown): string {
  const x = e as { code?: string; message?: string };
  return String((x?.code ?? 'ERROR') + ': ' + (x?.message ?? e)).replace(/[\r\n]/g, ' ');
}
function escaped(p: string): string {
  return p.replace(/[\r\n\t]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
async function atomicJson(file: string, object: unknown): Promise<void> {
  await fs.writeFile(file + '.tmp', JSON.stringify(object, null, 2), 'utf8');
  await fs.rename(file + '.tmp', file);
}

export function filesystemMapPlugin(): Plugin {
  let projectRoot = process.cwd();
  let ran = false;

  async function scan(phase: string): Promise<void> {
    if (ran) return;
    ran = true;

    const out = path.join(projectRoot, 'filesystem-map');
    await fs.mkdir(out, { recursive: true });
    const checkpoint = path.join(out, 'CHECKPOINT.json');
    const report = path.join(out, 'FILE_TREE.txt');
    const status = path.join(out, 'STATUS.json');

    let state: State;
    try {
      state = JSON.parse(await fs.readFile(checkpoint, 'utf8')) as State;
      if (state.schema !== 1 || !Array.isArray(state.queue) || typeof state.cursor !== 'number') {
        throw new Error('Invalid filesystem map checkpoint');
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      state = {
        schema: 1, startedAt: new Date().toISOString(), queue: ['/'],
        cursor: 0, foldersVisited: 0, entriesRecorded: 1, errors: 0, complete: false
      };
      await fs.writeFile(report, '# Read-only build-container directory map\n# D directory, F file, L symlink, O other, E error\nD /\n', 'utf8');
    }

    const started = Date.now();
    let buf = '';
    const flush = async () => {
      if (buf) { await fs.appendFile(report, buf, 'utf8'); buf = ''; }
    };
    const emit = async (line: string) => {
      buf += line + '\n';
      if (buf.length >= CHUNK_SIZE) await flush();
    };
    let visitedThisRun = 0;
    while (!state.complete && state.cursor < state.queue.length &&
           Date.now() - started < BUDGET_MS) {
      const dir = state.queue[state.cursor];
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          const name = escaped(full);
          if (entry.isSymbolicLink()) {
            await emit('L ' + name);
          } else if (entry.isDirectory()) {
            await emit('D ' + name);
            state.queue.push(full);
          } else if (entry.isFile()) {
            await emit('F ' + name);
          } else {
            try {
              // lstat does not follow symlinks.
              const info = await fs.lstat(full);
              const type = info.isSymbolicLink() ? 'L' : info.isFile() ? 'F' :
                info.isDirectory() ? 'D' : 'O';
              await emit(type + ' ' + name);
              if (type === 'D') state.queue.push(full);
            } catch (e) {
              await emit('E ' + name + ' ' + message(e));
              state.errors++;
            }
          }
          state.entriesRecorded++;
        }
      } catch (e) {
        await emit('E ' + escaped(dir) + ' ' + message(e));
        state.errors++;
      }
      state.cursor++;
      state.foldersVisited++;
      visitedThisRun++;
      if (visitedThisRun % 100 === 0) {
        await flush();
        await atomicJson(checkpoint, state);
      }
    }
    await flush();
    state.complete = state.cursor >= state.queue.length;
    if (state.complete) {
      state.queue = []; state.cursor = 0;
    } else if (state.cursor > 10000) {
      state.queue = state.queue.slice(state.cursor); state.cursor = 0;
    }
    await atomicJson(checkpoint, state);
    await atomicJson(status, {
      scope: 'Filesystem visible to this build container, not the underlying host',
      projectRoot, phase, nodeVersion: process.version,
      startedAt: state.startedAt, updatedAt: new Date().toISOString(),
      complete: state.complete, entriesRecorded: state.entriesRecorded,
      foldersVisited: state.foldersVisited, errors: state.errors,
      remainingFolders: state.queue.length - state.cursor,
      report
    });
    console.log('[Aippy FS map] ' + (state.complete ? 'COMPLETE' : 'PARTIAL') +
      ': ' + state.entriesRecorded + ' paths, ' + state.foldersVisited +
      ' folders, ' + state.errors + ' errors. Report: ' + report);
  }

  return {
    name: 'aippy-filesystem-map',
    enforce: 'pre',
    configResolved(config) { projectRoot = config.root; },
    async buildStart() { await scan('buildStart'); },
    async configureServer() { await scan('configureServer'); }
  };
}
