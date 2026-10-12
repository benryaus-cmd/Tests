import assetsData from '@/config/assets';
import { useEffect, useMemo, useState } from 'react';
import manifest from 'virtual:project-file-manifest';
import type { ProjectFileEntry } from '@/gameHost/manifestTypes';
import { buildCopySelectedText, copyText, generateTree, searchFiles } from '@/gameHost/viewerUtils';
import { ProjectFileList } from '@/components/ProjectFileList';
import { ProjectFilePreview } from '@/components/ProjectFilePreview';
import { ProjectFileToolbar } from '@/components/ProjectFileToolbar';

interface ProjectFileViewerProps {
  onBack: () => void;
  onClickSound: () => void;
  onCopySound: () => void;
}
type SearchMode = 'names' | 'content';
type Tab = 'project' | 'map' | 'proof';
const PAGE_SIZE = 250;
const MAP_FILE = 'filesystem-map/FILE_TREE.txt';

// A mapped path is NOT the contents of the file at that path.
// The browser only receives data included in the build-generated manifest.
function parseMap(text: string): ProjectFileEntry[] {
  const entries: ProjectFileEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const matched = /^([DFLOE]) (\/.*)$/.exec(line);
    if (!matched) continue;
    const kind = matched[1];
    const absolutePath = matched[2];
    const name = absolutePath.split('/').filter(Boolean).pop() || '/';
    const label = kind === 'D' ? 'DIRECTORY' : kind === 'F' ? 'FILE' :
      kind === 'L' ? 'SYMLINK' : kind === 'E' ? 'ERROR' : 'OTHER';
    const content = 'RECORDED TYPE: ' + label + '\nABSOLUTE PATH: ' +
      absolutePath + '\n\nThis is a pathname captured at build time. ' +
      'The map does not contain the actual file contents.';
    entries.push({
      path: kind + ' ' + absolutePath,
      name: (kind === 'D' ? '📁 ' : kind === 'F' ? '📄 ' : '🔗 ') + name,
      dir: absolutePath.slice(0, Math.max(1, absolutePath.lastIndexOf('/'))),
      ext: '', size: 0, status: 'TEXT', content,
    });
  }
  return entries;
}

export function ProjectFileViewer({ onBack, onClickSound, onCopySound }: ProjectFileViewerProps) {
  const [tab, setTab] = useState<Tab>('project');
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('names');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);

  const mapSource = manifest.files.find(file => file.path === MAP_FILE && file.status === 'TEXT');
  const mapEntries = useMemo(() => parseMap(mapSource?.content ?? ''), [mapSource?.content]);
  const proofFiles = useMemo(() => manifest.files.filter(file =>
    file.path.startsWith('filesystem-map/') ||
    file.path.startsWith('instruction-probe/') ||
    file.path === 'BUILD_SOURCE_PROOF.json' ||
    file.path === 'README_SOURCE_CHECK.json' ||
    file.path.startsWith('__build_environment__/')), []);
  const files = tab === 'map' ? mapEntries : tab === 'proof' ? proofFiles : manifest.files;
  const results = useMemo(() => searchFiles(files, query, searchMode === 'content'),
    [files, query, searchMode]);
  const visibleResults = results.slice(0, shown);
  const selectedFiles = files.filter(file => selectedPaths.has(file.path));
  const previewFile = previewPath ? files.find(file => file.path === previewPath) ?? null : null;

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(''), 1500);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  const reportCopy = async (value: string, label: string) => {
    onClickSound();
    const copied = await copyText(value);
    setFeedback(copied ? label : 'COPY FAILED');
    if (copied) onCopySound();
  };
  const chooseTab = (value: Tab) => {
    onClickSound(); setTab(value); setQuery(''); setShown(PAGE_SIZE);
    setSelectedPaths(new Set()); setPreviewPath(null);
  };
  const toggleSelection = (filePath: string) => {
    setSelectedPaths(current => {
      const next = new Set(current);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };
  const selectVisible = () => {
    setSelectedPaths(current => {
      const next = new Set(current);
      visibleResults.forEach(({ file }) => next.add(file.path));
      return next;
    });
  };
  const copySelected = () => {
    if (!selectedFiles.length) return;
    void reportCopy(buildCopySelectedText(selectedFiles), 'COPIED ✓');
  };
  const copyTree = () => {
    if (tab === 'map' && !selectedFiles.length && mapSource?.content) {
      void reportCopy(mapSource.content, 'MAP COPIED ✓'); return;
    }
    const paths = selectedFiles.length ? selectedFiles.map(f => f.path) : files.map(f => f.path);
    const folders = !selectedFiles.length && tab === 'project' ? manifest.folders : [];
    void reportCopy(generateTree(paths, folders), 'COPIED ✓');
  };
  const copyFile = (file: ProjectFileEntry) => {
    if (file.status === 'TEXT' || file.status === 'EMPTY')
      void reportCopy(file.content ?? '', 'FILE ✓');
  };
  const copyPath = (filePath: string) => {
    void reportCopy(filePath.replace(/^[DFLOE] (?=\/)/, ''), 'PATH ✓');
  };
  if (previewFile) return <main className="viewer-shell">
    <ProjectFilePreview file={previewFile} onBack={() => setPreviewPath(null)}
      onCopyFile={copyFile} onCopyPath={copyPath} onClickSound={onClickSound} />
    {feedback && <div className="copy-feedback" role="status">{feedback}</div>}
  </main>;
  return <main className="viewer-shell">
    <header className="viewer-header">
      <button className="viewer-back-button" type="button" onClick={() => { onClickSound(); onBack(); }}>
        <img src={assetsData.IMAGE_CLDH} alt="" width="24" height="24" />BACK
      </button>
      <h1>PROJECT FILES</h1>
      <span className="file-count">{files.length} FILES</span>
    </header>
    <nav aria-label="File viewer sections" style={{ display: 'flex', gap: 6, padding: 10, flexWrap: 'wrap' }}>
      {([
        ['project', 'PROJECT'],
        ['map', 'BUILD MAP (' + mapEntries.length + ')'],
        ['proof', 'PROOF'],
      ] as const).map(([id, label]) =>
        <button key={id} type="button" className="viewer-action-button"
          aria-pressed={tab === id} onClick={() => chooseTab(id)}
          style={{ opacity: tab === id ? 1 : 0.6, fontWeight: tab === id ? 800 : 400 }}>
          {label}
        </button>)}
    </nav>
    {tab === 'map' && <div className="viewer-empty" role="status" style={{ padding: '5px 12px' }}>
      {mapSource
        ? 'Searchable build-time path index. Entries are names only, not live filesystem reads.'
        : 'FILE_TREE.txt was not included in the Vite build manifest. Check the PROOF tab. A successful build message alone is not evidence that the map exists.'}
    </div>}
    <ProjectFileToolbar query={query} searchMode={searchMode} resultCount={results.length}
      selectedCount={selectedPaths.size} canCopySelected={selectedPaths.size > 0}
      onQueryChange={value => { setQuery(value); setShown(PAGE_SIZE); }}
      onSearchModeChange={value => { setSearchMode(value); setShown(PAGE_SIZE); }}
      onSelectAll={selectVisible} onClearSelection={() => setSelectedPaths(new Set())}
      onCopySelected={copySelected} onCopyTree={copyTree} onClickSound={onClickSound} />
    <ProjectFileList results={visibleResults} selectedPaths={selectedPaths}
      onToggle={toggleSelection} onOpen={file => setPreviewPath(file.path)}
      onClickSound={onClickSound} />
    {results.length > shown && <button type="button" className="viewer-action-button"
      style={{ margin: '12px auto', display: 'block' }}
      onClick={() => setShown(count => count + PAGE_SIZE)}>
      SHOW NEXT {Math.min(PAGE_SIZE, results.length - shown)} · {shown}/{results.length}
    </button>}
    {feedback && <div className="copy-feedback" role="status">{feedback}</div>}
  </main>;
}
