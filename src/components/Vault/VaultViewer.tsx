import React, { useCallback, useEffect, useState } from 'react';

interface VaultEntry {
  name: string;
  isDir: boolean;
  path: string;
}

interface SearchResult {
  path: string;
  title: string;
  snippet: string;
}

function renderMarkdown(text: string): React.ReactNode[] {
  return text.split('\n').map((line, index) => {
    if (line.startsWith('# ')) {
      return <h1 key={index} className="mb-3 mt-4 text-xl font-bold text-white">{line.slice(2)}</h1>;
    }
    if (line.startsWith('## ')) {
      return <h2 key={index} className="mb-2 mt-4 text-base font-bold text-white">{line.slice(3)}</h2>;
    }
    if (line.startsWith('### ')) {
      return <h3 key={index} className="mb-1 mt-3 text-sm font-bold text-white">{line.slice(4)}</h3>;
    }
    if (line.startsWith('- ')) {
      return <li key={index} className="ml-4 list-disc text-sm text-sidebar-text">{line.slice(2)}</li>;
    }
    if (line.trim() === '') {
      return <div key={index} className="h-2" />;
    }
    return <p key={index} className="text-sm leading-relaxed text-sidebar-text">{line}</p>;
  });
}

function TreeNode({
  entry,
  depth,
  onSelect,
  selectedPath,
  vaultRoot,
}: {
  entry: VaultEntry;
  depth: number;
  onSelect: (path: string) => void;
  selectedPath: string;
  vaultRoot: string;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [children, setChildren] = useState<VaultEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function loadChildren() {
    if (!entry.isDir || loaded) return;
    const api = (window as any).electronAPI;
    const res = await api?.vaultList({ vaultRoot, folder: entry.path });
    if (!res?.ok) return;

    setChildren(
      (res.data as { name: string; isDir: boolean }[])
        .filter((item) => item.name !== '.obsidian' && !item.name.startsWith('.'))
        .map((item) => ({ ...item, path: `${entry.path}/${item.name}` }))
        .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
    );
    setLoaded(true);
  }

  async function handleClick() {
    if (entry.isDir) {
      if (!loaded) await loadChildren();
      setExpanded((value) => !value);
      return;
    }
    onSelect(entry.path);
  }

  const selected = !entry.isDir && entry.path === selectedPath;

  return (
    <div>
      <button
        onClick={handleClick}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors ${
          selected ? 'bg-brand-primary/20 text-white' : 'text-sidebar-text hover:bg-sidebar-hover'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        title={entry.path}
      >
        <span className="w-4 flex-shrink-0 text-xs">{entry.isDir ? (expanded ? '▾' : '▸') : '·'}</span>
        <span className="truncate">{entry.isDir ? entry.name : entry.name.replace(/\.md$/, '')}</span>
      </button>

      {entry.isDir && expanded && children.map((child) => (
        <TreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          onSelect={onSelect}
          selectedPath={selectedPath}
          vaultRoot={vaultRoot}
        />
      ))}
    </div>
  );
}

export default function VaultViewer() {
  const [vaultRoot, setVaultRoot] = useState('');
  const [rootEntries, setRootEntries] = useState<VaultEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [content, setContent] = useState('');
  const [draft, setDraft] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    async function loadRoot() {
      const rootResult = await api.vaultRoot?.();
      const root = rootResult?.ok ? rootResult.data : (import.meta.env?.VITE_VAULT_ROOT ?? 'vault');
      setVaultRoot(root);

      const listResult = await api.vaultList({ vaultRoot: root, folder: '' });
      if (listResult?.ok) {
        setRootEntries(
          (listResult.data as { name: string; isDir: boolean }[])
            .filter((item) => item.name !== '.obsidian' && !item.name.startsWith('.'))
            .map((item) => ({ ...item, path: item.name }))
            .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
        );
      }
    }

    loadRoot();
  }, []);

  const handleSelect = useCallback(async (path: string) => {
    setSelectedPath(path);
    setSearchResults([]);
    setLoading(true);

    const api = (window as any).electronAPI;
    const res = await api?.vaultRead({ vaultRoot, filePath: path });
    const nextContent = res?.ok ? res.data : `파일을 불러올 수 없습니다: ${path}`;
    setContent(nextContent);
    setDraft(nextContent);
    setEditMode(false);
    setSummary('');
    setLoading(false);
  }, [vaultRoot]);

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const api = (window as any).electronAPI;
    const res = await api?.vaultSearch({ vaultRoot, query: searchQuery });
    setSearchResults(res?.ok ? res.data : []);
    setIsSearching(false);
  }

  async function handleOpenFolder() {
    await (window as any).electronAPI?.openVaultFolder?.();
  }

  async function handleOpenObsidian() {
    await (window as any).electronAPI?.openObsidianVault?.();
  }

  async function handleSave() {
    if (!selectedPath) return;
    const api = (window as any).electronAPI;
    const res = await api?.vaultWrite?.({ path: selectedPath, content: draft });
    if (res?.ok) {
      setContent(draft);
      setEditMode(false);
    }
  }

  function makeSummary(text: string) {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const headings = lines.filter((line) => line.startsWith('#')).slice(0, 5);
    const body = lines.filter((line) => !line.startsWith('#')).slice(0, 5);
    return [
      '## AI 요약',
      headings.length ? `- 주요 섹션: ${headings.map((line) => line.replace(/^#+\s*/, '')).join(', ')}` : '',
      ...body.map((line) => `- ${line.replace(/^[-*]\s*/, '').slice(0, 140)}`),
    ].filter(Boolean).join('\n');
  }

  function handleSummarize() {
    setSummary(makeSummary(editMode ? draft : content));
  }

  function insertSummary() {
    const nextSummary = summary || makeSummary(editMode ? draft : content);
    setDraft(`${nextSummary}\n\n---\n\n${editMode ? draft : content}`);
    setSummary(nextSummary);
    setEditMode(true);
  }

  if (!(window as any).electronAPI) {
    return (
      <div className="flex flex-1 items-center justify-center text-sidebar-muted">
        Vault 뷰어는 Electron 앱에서 사용할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 overflow-hidden bg-chat-bg">
      <aside className="flex w-72 flex-shrink-0 flex-col border-r border-[#2c2d30] bg-sidebar-bg">
        <div className="border-b border-[#2c2d30] px-3 py-3">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-white">Obsidian Vault</h2>
            <button
              onClick={handleOpenObsidian}
              className="rounded bg-brand-primary/20 px-2 py-1 text-xs text-brand-primary hover:bg-brand-primary/30"
            >
              Obsidian
            </button>
            <button
              onClick={handleOpenFolder}
              className="rounded bg-sidebar-hover px-2 py-1 text-xs text-sidebar-text hover:text-white"
            >
              폴더 열기
            </button>
          </div>
          <p className="mb-2 truncate text-[11px] text-sidebar-muted" title={vaultRoot}>{vaultRoot}</p>
          <div className="flex gap-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Vault 검색"
              className="flex-1 rounded border border-transparent bg-[#2c2d30] px-2 py-1 text-sm text-white outline-none placeholder-sidebar-muted focus:border-brand-primary/50"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="rounded bg-brand-primary/20 px-2 py-1 text-xs text-brand-primary hover:bg-brand-primary/30 disabled:opacity-50"
            >
              {isSearching ? '...' : '검색'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {searchResults.length > 0 ? (
            <div>
              <p className="px-3 py-1 text-xs text-sidebar-muted">검색 결과 {searchResults.length}개</p>
              {searchResults.map((result) => (
                <button
                  key={result.path}
                  onClick={() => handleSelect(result.path)}
                  className={`w-full px-3 py-2 text-left hover:bg-sidebar-hover ${
                    selectedPath === result.path ? 'bg-brand-primary/20' : ''
                  }`}
                >
                  <p className="truncate text-xs font-medium text-white">{result.title}</p>
                  <p className="mt-0.5 truncate text-xs text-sidebar-muted">{result.snippet}</p>
                </button>
              ))}
            </div>
          ) : (
            rootEntries.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                onSelect={handleSelect}
                selectedPath={selectedPath}
                vaultRoot={vaultRoot}
              />
            ))
          )}
        </div>
      </aside>

      <section className="flex flex-1 flex-col overflow-hidden">
        {selectedPath ? (
          <>
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-[#2c2d30] px-5 py-3">
              <span className="truncate font-mono text-xs text-sidebar-muted">{selectedPath}</span>
              <button onClick={() => setEditMode((value) => !value)} className="ml-auto rounded bg-sidebar-hover px-2 py-1 text-xs text-sidebar-text hover:text-white">
                {editMode ? 'Preview' : 'Edit'}
              </button>
              <button onClick={handleSummarize} className="rounded bg-sidebar-hover px-2 py-1 text-xs text-sidebar-text hover:text-white">
                Summary
              </button>
              <button onClick={insertSummary} className="rounded bg-brand-primary/20 px-2 py-1 text-xs text-brand-primary hover:bg-brand-primary/30">
                Insert
              </button>
              {editMode && (
                <button onClick={handleSave} className="rounded bg-brand-primary px-2 py-1 text-xs text-white hover:bg-blue-700">
                  Save
                </button>
              )}
              <button
                onClick={() => setSelectedPath('')}
                className="text-lg leading-none text-sidebar-muted hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {loading ? (
                <div className="text-sm text-sidebar-muted">불러오는 중...</div>
              ) : editMode ? (
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="min-h-full w-full resize-none rounded-lg border border-chat-border bg-[#1e1f24] p-4 font-mono text-sm leading-relaxed text-white outline-none focus:border-brand-primary/50"
                />
              ) : (
                <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                  <div className="max-w-3xl">{renderMarkdown(content)}</div>
                  {summary && (
                    <aside className="h-fit rounded-lg border border-chat-border bg-[#222529] p-3">
                      <h3 className="mb-2 text-sm font-semibold text-white">AI 요약</h3>
                      <div className="text-xs leading-relaxed text-sidebar-text">{renderMarkdown(summary)}</div>
                    </aside>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sidebar-muted">
            <div className="text-center">
              <div className="mb-3 text-4xl">📚</div>
              <p className="text-sm">파일을 선택하거나 검색어를 입력하세요.</p>
              <p className="mt-1 text-xs text-sidebar-muted/70">
                AI가 자동 저장한 작업, 장기기억, 위키를 여기서 바로 확인할 수 있습니다.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
