/**
 * Aippy build-time project file map (Node 20+, no dependencies).
 *
 * Run by the existing GitHub importer after this file is downloaded.
 * Only visits the active project workspace; it never traverses into
 * sibling project workspaces or follows symlinks.
 * Does not read file contents.
 *
 * Outputs:
 *   filesystem-map/FILE_TREE.txt
 *   filesystem-map/STATUS.json
 *   filesystem-map/CHECKPOINT.json
 *
 * Resumes after another build if the checkpoint persists.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectRoot = await fs.realpath(process.cwd());
const outputDir = path.join(projectRoot, 'filesystem-map');
const treeFile = path.join(outputDir, 'FILE_TREE.txt');
const statusFile = path.join(outputDir, 'STATUS.json');
const checkpointFile = path.join(outputDir, 'CHECKPOINT.json');
const MAX_RUN_MS = 15000;

const encodePath = (value) => value.replace(/[\r\n\t]/g, (ch) =>
  '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
const errorText = (error) => String(error?.code ?? 'ERROR') + ': ' +
  String(error?.message ?? error).replace(/[\r\n]/g, ' ').slice(0, 180);

async function saveJson(filename, value) {
  const temporary = filename + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temporary, filename);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  let state;
  try {
    state = JSON.parse(await fs.readFile(checkpointFile, 'utf8'));
    if (state.version !== 1 || state.root !== projectRoot ||
        !Array.isArray(state.queue) || !Number.isInteger(state.cursor)) {
      throw new Error('Incompatible checkpoint. Remove checkpoint to restart.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    state = {
      version: 1,
      root: projectRoot,
      startedAt: new Date().toISOString(),
      queue: [projectRoot],
      cursor: 0,
      directoriesVisited: 0,
      entriesRecorded: 1,
      errors: 0,
      complete: false,
    };
    await fs.writeFile(treeFile,
      '# Aippy project workspace map (read-only)\n' +
      '# D folder | F file | L symlink | O other | E error\n' +
      'D ' + encodePath(projectRoot) + '\n', 'utf8');
    await saveJson(checkpointFile, state);
  }

  const started = Date.now();
  async function status(phase) {
    await saveJson(statusFile, {
      phase,
      scanRoot: projectRoot,
      nodeVersion: process.version,
      cwd: process.cwd(),
      report: treeFile,
      startedAt: state.startedAt,
      updatedAt: new Date().toISOString(),
      complete: state.complete,
      directoriesVisited: state.directoriesVisited,
      entriesRecorded: state.entriesRecorded,
      errors: state.errors,
      remainingDirectories: state.queue.length - state.cursor,
    });
  }
  await status('running');
  const lines = [];
  async function flush() {
    if (lines.length) {
      await fs.appendFile(treeFile, lines.join('\n') + '\n', 'utf8');
      lines.length = 0;
    }
  }
  while (!state.complete && state.cursor < state.queue.length &&
         Date.now() - started < MAX_RUN_MS) {
    const directory = state.queue[state.cursor];
    try {
      const children = await fs.readdir(directory, { withFileTypes: true });
      children.sort((a, b) => a.name.localeCompare(b.name));
      for (const child of children) {
        const full = path.join(directory, child.name);
        const kind = child.isSymbolicLink() ? 'L' :
          child.isDirectory() ? 'D' : child.isFile() ? 'F' : 'O';
        lines.push(kind + ' ' + encodePath(full));
        if (kind === 'D' && full !== outputDir) state.queue.push(full);
        state.entriesRecorded++;
      }
    } catch (error) {
      lines.push('E ' + encodePath(directory) + ' ' + errorText(error));
      state.errors++;
    }
    state.cursor++;
    state.directoriesVisited++;
    if (state.directoriesVisited % 25 === 0) {
      await flush();
      await saveJson(checkpointFile, state);
      await status('running');
    }
  }
  await flush();
  state.complete = state.cursor >= state.queue.length;
  if (state.complete) {
    state.queue = [];
    state.cursor = 0;
  } else if (state.cursor >= 10000) {
    state.queue = state.queue.slice(state.cursor);
    state.cursor = 0;
  }
  await saveJson(checkpointFile, state);
  await status(state.complete ? 'complete' : 'partial');
  console.log('[Aippy FS map] ' + (state.complete ? 'COMPLETE' : 'PARTIAL') +
    ': ' + state.entriesRecorded + ' entries; ' +
    state.directoriesVisited + ' folders; ' + state.errors + ' errors.');
}
main().catch((error) => {
  console.error('[Aippy FS map] FAILED: ' + errorText(error));
  process.exitCode = 1;
});
