import React, { useState, useEffect, useCallback } from 'react';

// ????????????????????????????????????????????????????????????????
// Types
// ????????????????????????????????????????????????????????????????

interface SkillInfo {
  dirName: string;
  name: string;
  description: string;
  category: string;
  path: string;
  source: 'codex' | 'agents';
}

interface McpServer {
  key: string;         // actual key in JSON (may start with _disabled_)
  displayName: string; // clean name for display
  disabled: boolean;
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface SystemPaths {
  appData: string;
  home: string;
}

interface LogLine {
  text: string;
  type: 'info' | 'error' | 'success';
}

// ????????????????????????????????????????????????????????????????
// IPC helpers
// ????????????????????????????????????????????????????????????????

async function callTool(name: string, input: Record<string, unknown>): Promise<string> {
  const api = (window as any).electronAPI;
  if (!api) return '[electronAPI not available]';
  const result = await api.computerTool({ name, input });
  return result.ok ? String(result.data ?? '') : `Error: ${result.error}`;
}

async function readFile(path: string): Promise<string | null> {
  const api = (window as any).electronAPI;
  if (!api) return null;
  const result = await api.computerTool({ name: 'computer_read_file', input: { path } });
  return result.ok ? String(result.data ?? '') : null;
}

async function writeFile(path: string, content: string): Promise<boolean> {
  const api = (window as any).electronAPI;
  if (!api) return false;
  const result = await api.computerTool({ name: 'computer_write_file', input: { path, content } });
  return result.ok;
}

async function runCmd(command: string): Promise<string> {
  return callTool('computer_execute_command', { command, timeoutMs: 60000 });
}

async function listDir(path: string): Promise<string[]> {
  const raw = await callTool('computer_list_directory', { path });
  return raw.split('\n').filter(Boolean);
}

// ????????????????????????????????????????????????????????????????
// Parsers
// ????????????????????????????????????????????????????????????????

function parseSkillMd(content: string): { name: string; description: string; category: string } {
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  const descMatch = content.match(/^description:\s*(.+)$/m);
  const catMatch  = content.match(/^  category:\s*(.+)$/m);
  return {
    name:        nameMatch?.[1]?.trim() ?? '',
    description: descMatch?.[1]?.trim() ?? '',
    category:    catMatch?.[1]?.trim()  ?? 'general',
  };
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeSkillSource(value: string): string | null {
  const raw = value.trim().replace(/\/$/, '');
  const githubMatch = raw.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\.git)?(?:\/.*)?$/i);
  const normalized = githubMatch?.[1] ?? raw.replace(/\.git$/i, '');
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized) ? normalized : null;
}

function slugifySkillName(value: string): string | null {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.length >= 2 ? slug.slice(0, 64) : null;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function parentDir(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  parts.pop();
  return parts.at(-1) ?? path;
}

function parseMcpConfig(json: string): McpServer[] {
  try {
    const cfg = JSON.parse(json);
    const servers: McpServer[] = [];
    for (const [key, val] of Object.entries(cfg.mcpServers ?? {})) {
      const v = val as any;
      const disabled = key.startsWith('_disabled_');
      servers.push({
        key,
        displayName: disabled ? key.replace(/^_disabled_/, '') : key,
        disabled,
        command: v.command ?? '',
        args:    Array.isArray(v.args) ? v.args : [],
        env:     v.env ?? {},
      });
    }
    return servers;
  } catch {
    return [];
  }
}

// ????????????????????????????????????????????????????????????????
// Sub-components
// ????????????????????????????????????????????????????????????????

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${color}`}>
      {text}
    </span>
  );
}

function SkillCard({
  skill,
  onDelete,
  onUpdate,
  loading,
}: {
  skill: SkillInfo;
  onDelete: () => void;
  onUpdate: () => void;
  loading: boolean;
}) {
  const catColor: Record<string, string> = {
    setup: 'bg-purple-500/20 text-purple-300',
    search: 'bg-blue-500/20 text-blue-300',
    booking: 'bg-orange-500/20 text-orange-300',
    finance: 'bg-emerald-500/20 text-emerald-300',
    management: 'bg-yellow-500/20 text-yellow-300',
    general: 'bg-gray-500/20 text-gray-300',
  };
  const colorClass = catColor[skill.category] ?? catColor.general;

  return (
    <div className="rounded-lg border border-chat-border bg-[#222529] p-4 flex flex-col gap-3 hover:border-[#4a4b50] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{skill.name || skill.dirName}</p>
          {skill.category && <Badge text={skill.category} color={colorClass} />}
        </div>
        <span className="text-lg flex-shrink-0">?㎥</span>
      </div>
      <p className="text-[11px] text-sidebar-muted truncate" title={skill.path}>
        {skill.source === 'codex' ? 'Codex' : 'Agents'} 쨌 {skill.dirName}
      </p>
      {skill.description && (
        <p className="text-xs text-sidebar-muted leading-relaxed line-clamp-2">{skill.description}</p>
      )}
      <div className="flex gap-1.5 mt-auto">
        <button
          onClick={onUpdate}
          disabled={loading}
          className="flex-1 py-1 text-xs rounded bg-brand-primary/20 text-blue-300 hover:bg-brand-primary/30 disabled:opacity-40 transition-colors"
        >
          ?낅뜲?댄듃
        </button>
        <button
          onClick={onDelete}
          disabled={loading}
          className="flex-1 py-1 text-xs rounded bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
        >
          ??젣
        </button>
      </div>
    </div>
  );
}

function McpRow({
  server,
  onToggle,
  onDelete,
  loading,
}: {
  server: McpServer;
  onToggle: () => void;
  onDelete: () => void;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-lg border transition-colors ${server.disabled ? 'border-chat-border bg-[#1e2023] opacity-60' : 'border-chat-border bg-[#222529] hover:border-[#4a4b50]'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-lg flex-shrink-0">{server.disabled ? '?뵶' : '?윟'}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{server.displayName}</p>
          <p className="text-xs text-sidebar-muted truncate font-mono">
            {server.command} {server.args.slice(0, 3).join(' ')}{server.args.length > 3 ? ' ...' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 text-sidebar-muted hover:text-sidebar-text rounded hover:bg-sidebar-hover text-xs"
            title="?곸꽭 蹂닿린"
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={onToggle}
            disabled={loading}
            className={`px-3 py-1 text-xs rounded disabled:opacity-40 transition-colors ${
              server.disabled
                ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20'
            }`}
          >
            {server.disabled ? 'Enable' : 'Disable'}
          </button>
          <button
            onClick={onDelete}
            disabled={loading}
            className="px-3 py-1 text-xs rounded bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
          >
            ??젣
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-chat-border px-4 py-3 space-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-sidebar-muted mb-1">command</p>
            <code className="text-xs text-emerald-300 font-mono bg-[#1a1d21] px-2 py-1 rounded block">
              {server.command}
            </code>
          </div>
          {server.args.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-sidebar-muted mb-1">args</p>
              <code className="text-xs text-blue-300 font-mono bg-[#1a1d21] px-2 py-1 rounded block whitespace-pre-wrap">
                {server.args.join('\n')}
              </code>
            </div>
          )}
          {Object.keys(server.env).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-sidebar-muted mb-1">env</p>
              <code className="text-xs text-yellow-300 font-mono bg-[#1a1d21] px-2 py-1 rounded block whitespace-pre-wrap">
                {Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n')}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ????????????????????????????????????????????????????????????????
// Add Skill Modal
// ????????????????????????????????????????????????????????????????

function AddSkillModal({ onClose, onInstall }: { onClose: () => void; onInstall: (repo: string) => void }) {
  const [repo, setRepo] = useState('');
  const normalized = normalizeSkillSource(repo);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-chat-border bg-[#222529] p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-white mb-4">?ㅽ궗 ?⑦궎吏 異붽?</h2>
        <label className="block text-xs text-sidebar-muted mb-1">GitHub ??μ냼</label>
        <input
          type="text"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="?? NomaDamas/k-skill"
          className="w-full rounded-lg bg-[#1a1d21] border border-chat-border px-3 py-2 text-sm text-white placeholder-sidebar-muted focus:outline-none focus:border-brand-primary"
          autoFocus
        />
        <p className="mt-2 text-[11px] text-sidebar-muted">GitHub URL ?먮뒗 owner/repo ?뺤떇?쇰줈 ?낅젰?섏꽭?? ?꾩껜 ?ㅽ궗??紐⑤뱺 ?먯씠?꾪듃???ㅼ튂?⑸땲??</p>
        <p className="mt-2 text-[11px] text-sidebar-muted">
          Only GitHub HTTPS URLs or owner/repo values are accepted. Other command shapes are blocked.
        </p>
        {repo.trim() && !normalized && (
          <p className="mt-2 text-[11px] text-red-300">Use a valid GitHub repository such as owner/repo.</p>
        )}
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="btn-ghost">痍⑥냼</button>
          <button
            onClick={() => { if (normalized) { onInstall(normalized); onClose(); } }}
            disabled={!normalized}
            className="btn-primary disabled:opacity-40"
          >
            ?ㅼ튂
          </button>
        </div>
      </div>
    </div>
  );
}

// ????????????????????????????????????????????????????????????????
// Add MCP Modal
// ????????????????????????????????????????????????????????????????

function CreateSkillModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const slug = slugifySkillName(name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-chat-border bg-[#222529] p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-white mb-4">Create local skill</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-sidebar-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="research-helper"
              className="w-full rounded-lg bg-[#1a1d21] border border-chat-border px-3 py-2 text-sm text-white placeholder-sidebar-muted focus:outline-none focus:border-brand-primary"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-sidebar-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Use when an agent needs..."
              rows={4}
              className="w-full rounded-lg bg-[#1a1d21] border border-chat-border px-3 py-2 text-sm text-white placeholder-sidebar-muted focus:outline-none focus:border-brand-primary resize-none"
            />
          </div>
        </div>
        {name.trim() && !slug && (
          <p className="mt-2 text-[11px] text-red-300">Use at least two letters, numbers, dashes, or underscores.</p>
        )}
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => { if (slug) { onCreate(slug, description.trim()); onClose(); } }}
            disabled={!slug}
            className="btn-primary disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function AddMcpModal({ onClose, onAdd }: { onClose: () => void; onAdd: (s: Omit<McpServer, 'key' | 'disabled'>) => void }) {
  const [name, setName]       = useState('');
  const [command, setCommand] = useState('npx');
  const [args, setArgs]       = useState('-y ');
  const [env, setEnv]         = useState('');

  function parseEnv(raw: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return result;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-chat-border bg-[#222529] p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-white mb-4">MCP ?쒕쾭 異붽?</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-sidebar-muted mb-1">?쒕쾭 ?대쫫 (怨좎쑀 ?앸퀎??</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="?? my-server"
              className="w-full rounded-lg bg-[#1a1d21] border border-chat-border px-3 py-2 text-sm text-white placeholder-sidebar-muted focus:outline-none focus:border-brand-primary"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-sidebar-muted mb-1">command</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npx, uv, node, python ..."
              className="w-full rounded-lg bg-[#1a1d21] border border-chat-border px-3 py-2 text-sm text-white font-mono placeholder-sidebar-muted focus:outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-sidebar-muted mb-1">args (怨듬갚?쇰줈 援щ텇)</label>
            <input
              type="text"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder="-y @modelcontextprotocol/server-xxx"
              className="w-full rounded-lg bg-[#1a1d21] border border-chat-border px-3 py-2 text-sm text-white font-mono placeholder-sidebar-muted focus:outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-sidebar-muted mb-1">?섍꼍蹂??(?좏깮, KEY=VALUE ??以꾩뵫)</label>
            <textarea
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              placeholder="API_KEY=xxx&#10;BASE_URL=https://..."
              rows={3}
              className="w-full rounded-lg bg-[#1a1d21] border border-chat-border px-3 py-2 text-sm text-white font-mono placeholder-sidebar-muted focus:outline-none focus:border-brand-primary resize-none"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="btn-ghost">痍⑥냼</button>
          <button
            onClick={() => {
              if (name.trim() && command.trim()) {
                onAdd({
                  displayName: name.trim(),
                  command: command.trim(),
                  args: args.trim().split(/\s+/).filter(Boolean),
                  env: parseEnv(env),
                });
                onClose();
              }
            }}
            disabled={!name.trim() || !command.trim()}
            className="btn-primary disabled:opacity-40"
          >
            異붽?
          </button>
        </div>
      </div>
    </div>
  );
}

// ????????????????????????????????????????????????????????????????
// Terminal Log Panel
// ????????????????????????????????????????????????????????????????

function LogPanel({ lines, onClear }: { lines: LogLine[]; onClear: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  if (lines.length === 0) return null;

  return (
    <div className="border-t border-chat-border bg-[#161719] flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-1.5">
        <span className="text-[11px] font-semibold text-sidebar-muted uppercase tracking-wider">?곕???異쒕젰</span>
        <button onClick={onClear} className="text-[11px] text-sidebar-muted hover:text-sidebar-text">吏?곌린</button>
      </div>
      <div ref={ref} className="px-4 pb-3 max-h-44 overflow-y-auto font-mono text-xs space-y-0.5">
        {lines.map((l, i) => (
          <p
            key={i}
            className={`leading-relaxed whitespace-pre-wrap ${
              l.type === 'error' ? 'text-red-300' : l.type === 'success' ? 'text-emerald-300' : 'text-sidebar-text'
            }`}
          >
            {l.text}
          </p>
        ))}
      </div>
    </div>
  );
}

// ????????????????????????????????????????????????????????????????
// Main Component
// ????????????????????????????????????????????????????????????????

export default function ToolManager() {
  const [tab, setTab]           = useState<'skills' | 'mcp'>('skills');
  const [skills, setSkills]     = useState<SkillInfo[]>([]);
  const [mcpList, setMcpList]   = useState<McpServer[]>([]);
  const [paths, setPaths]       = useState<SystemPaths | null>(null);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [loadingMcp, setLoadingMcp]       = useState(false);
  const [busyKey, setBusyKey]   = useState<string | null>(null);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [showCreateSkill, setShowCreateSkill] = useState(false);
  const [showAddMcp, setShowAddMcp]     = useState(false);
  const [skillSearch, setSkillSearch]   = useState('');

  function log(text: string, type: LogLine['type'] = 'info') {
    setLogLines((prev) => [...prev, { text, type }]);
  }

  // ?? Fetch system paths ??????????????????????????????????????
  useEffect(() => {
    (async () => {
      const raw = await callTool('computer_get_system_info', {});
      try {
        const info = JSON.parse(raw);
        setPaths({ appData: info.appData, home: info.home });
      } catch { /* fallback handled */ }
    })();
  }, []);

  // ?? Load skills ?????????????????????????????????????????????
  const loadSkills = useCallback(async () => {
    if (!paths) return;
    setLoadingSkills(true);
    try {
      const roots = [
        { source: 'codex' as const, path: `${paths.home}\\.codex\\skills` },
        { source: 'agents' as const, path: `${paths.home}\\.agents\\skills` },
      ];
      const discovered: { source: SkillInfo['source']; skillPath: string }[] = [];

      for (const root of roots) {
        const command =
          `if (Test-Path -LiteralPath ${psQuote(root.path)}) { ` +
          `Get-ChildItem -LiteralPath ${psQuote(root.path)} -Recurse -Filter SKILL.md -File | ` +
          `ForEach-Object { $_.FullName } }`;
        const raw = await runCmd(command);
        for (const line of raw.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('STDOUT:') && !trimmed.startsWith('STDERR:')) {
            discovered.push({ source: root.source, skillPath: trimmed });
          }
        }
      }

      const infos: SkillInfo[] = await Promise.all(
        discovered.map(async ({ source, skillPath }) => {
          const content = await readFile(skillPath);
          const dirName = parentDir(skillPath);
          if (!content) {
            return { dirName, name: dirName, description: '', category: 'general', path: skillPath, source };
          }
          const parsed = parseSkillMd(content);
          return { dirName, ...parsed, path: skillPath, source };
        })
      );
      setSkills(infos.sort((a, b) => (a.name || a.dirName).localeCompare(b.name || b.dirName)));
    } finally {
      setLoadingSkills(false);
    }
  }, [paths]);

  // ?? Load MCP config ?????????????????????????????????????????
  const loadMcp = useCallback(async () => {
    if (!paths) return;
    setLoadingMcp(true);
    try {
      const cfgPath = `${paths.appData}\\Claude\\claude_desktop_config.json`;
      const content = await readFile(cfgPath);
      if (content) setMcpList(parseMcpConfig(content));
    } finally {
      setLoadingMcp(false);
    }
  }, [paths]);

  useEffect(() => {
    if (paths) { loadSkills(); loadMcp(); }
  }, [paths, loadSkills, loadMcp]);

  // ?? Save MCP config ?????????????????????????????????????????
  async function saveMcpList(updated: McpServer[]) {
    if (!paths) return false;
    const cfgPath = `${paths.appData}\\Claude\\claude_desktop_config.json`;
    const existing = await readFile(cfgPath);
    let cfg: any = {};
    try { cfg = JSON.parse(existing ?? '{}'); } catch { /* ignore */ }

    cfg.mcpServers = {};
    for (const s of updated) {
      const entry: any = { command: s.command, args: s.args };
      if (Object.keys(s.env).length > 0) entry.env = s.env;
      cfg.mcpServers[s.key] = entry;
    }
    return writeFile(cfgPath, JSON.stringify(cfg, null, 2));
  }

  // ?? Skills actions ???????????????????????????????????????????
  async function deleteSkill(skill: SkillInfo) {
    if (!window.confirm(`"${skill.name || skill.dirName}" ?ㅽ궗????젣?좉퉴??`)) return;
    setBusyKey(`del-${skill.dirName}`);
    const folder = skill.path.replace(/\\SKILL\.md$/i, '').replace(/\/SKILL\.md$/i, '');
    log(`> Remove-Item ${folder}`);
    const out = await runCmd(`Remove-Item -LiteralPath ${psQuote(folder)} -Recurse -Force 2>&1`);
    log(out, out.toLowerCase().includes('error') ? 'error' : 'success');
    await loadSkills();
    setBusyKey(null);
  }

  async function updateSkill(skill: SkillInfo) {
    setBusyKey(`upd-${skill.dirName}`);
    log(`> npx skills update -g -s "${skill.dirName}" -y`);
    const out = await runCmd(`npx skills update -g -s "${skill.dirName}" -y`);
    log(out, out.toLowerCase().includes('error') ? 'error' : 'success');
    await loadSkills();
    setBusyKey(null);
  }

  async function updateAllSkills() {
    setBusyKey('update-all');
    log('> npx skills update -g -y');
    const out = await runCmd('npx skills update -g -y');
    log(out, out.toLowerCase().includes('error') ? 'error' : 'success');
    await loadSkills();
    setBusyKey(null);
  }

  async function installSkill(repo: string) {
    const normalized = normalizeSkillSource(repo);
    if (!normalized) {
      log(`Blocked unsafe skill source: ${repo}`, 'error');
      return;
    }
    setBusyKey('install');
    log(`> npx --yes skills add ${normalized} --all -g`);
    const out = await runCmd(`npx --yes skills add ${normalized} --all -g`);
    log(out, out.toLowerCase().includes('error') ? 'error' : 'success');
    await loadSkills();
    setBusyKey(null);
  }

  async function createLocalSkill(name: string, description: string) {
    if (!paths) return;
    const slug = slugifySkillName(name);
    if (!slug) {
      log(`Blocked invalid skill name: ${name}`, 'error');
      return;
    }
    setBusyKey('create-skill');
    const skillPath = `${paths.home}\\.agents\\skills\\${slug}\\SKILL.md`;
    const content = [
      '---',
      `name: ${slug}`,
      `description: ${description || 'Use when an agent needs this local skill.'}`,
      'metadata:',
      '  category: general',
      '---',
      '',
      `# ${slug}`,
      '',
      description || 'Describe when to use this skill and the workflow the agent should follow.',
      '',
      '## Workflow',
      '',
      '1. Confirm the user request matches this skill.',
      '2. Gather only the context needed for the task.',
      '3. Prefer safe, inspectable actions and report blockers clearly.',
      '',
    ].join('\n');
    const ok = await writeFile(skillPath, content);
    log(ok ? `Created local skill: ${skillPath}` : `Failed to create local skill: ${skillPath}`, ok ? 'success' : 'error');
    await loadSkills();
    setBusyKey(null);
  }

  // ?? MCP actions ??????????????????????????????????????????????
  async function toggleMcp(server: McpServer) {
    const updated = mcpList.map((s) => {
      if (s.key !== server.key) return s;
      const newDisabled = !s.disabled;
      const newKey = newDisabled ? `_disabled_${s.displayName}` : s.displayName;
      return { ...s, key: newKey, disabled: newDisabled };
    });
    setMcpList(updated);
    const ok = await saveMcpList(updated);
    log(
      ok
        ? `${server.displayName} ${server.disabled ? 'enabled' : 'disabled'}; restart Claude Desktop to apply.`
        : `${server.displayName} settings save failed.`,
      ok ? 'success' : 'error'
    );
  }

  async function deleteMcp(server: McpServer) {
    if (!window.confirm(`"${server.displayName}" MCP ?쒕쾭瑜???젣?좉퉴??`)) return;
    const updated = mcpList.filter((s) => s.key !== server.key);
    setMcpList(updated);
    const ok = await saveMcpList(updated);
    log(ok ? `${server.displayName} ??젣 ?꾨즺 ??Claude Desktop ?ъ떆???꾩슂` : `${server.displayName} ??젣 ?ㅽ뙣`, ok ? 'success' : 'error');
  }

  async function addMcp(serverData: Omit<McpServer, 'key' | 'disabled'>) {
    const newServer: McpServer = { ...serverData, key: serverData.displayName, disabled: false };
    const updated = [...mcpList, newServer];
    setMcpList(updated);
    const ok = await saveMcpList(updated);
    log(ok ? `${serverData.displayName} 異붽? ?꾨즺 ??Claude Desktop ?ъ떆???꾩슂` : `${serverData.displayName} 異붽? ?ㅽ뙣`, ok ? 'success' : 'error');
  }

  // ?? Filter skills ????????????????????????????????????????????
  const filteredSkills = skills.filter((s) => {
    const q = skillSearch.toLowerCase();
    return !q
      || (s.name || s.dirName).toLowerCase().includes(q)
      || s.dirName.toLowerCase().includes(q)
      || s.description.toLowerCase().includes(q)
      || s.path.toLowerCase().includes(q)
      || s.source.toLowerCase().includes(q);
  });

  const enabledMcp  = mcpList.filter((s) => !s.disabled).length;
  const disabledMcp = mcpList.filter((s) => s.disabled).length;

  // ?? Render ???????????????????????????????????????????????????
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">Tool Manager</span>
        <div className="no-drag flex items-center gap-2 ml-auto">
          <span className="text-xs text-sidebar-muted">{skills.length} skills</span>
          <span className="text-xs text-sidebar-muted">·</span>
          <span className="text-xs text-sidebar-muted">MCP {enabledMcp} enabled / {disabledMcp} disabled</span>
          <button
            onClick={() => { loadSkills(); loadMcp(); }}
            disabled={loadingSkills || loadingMcp}
            className="btn-ghost ml-1"
          >
            ?덈줈怨좎묠
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-chat-border px-5 flex-shrink-0">
        <button
          onClick={() => setTab('skills')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'skills'
              ? 'border-brand-primary text-white'
              : 'border-transparent text-sidebar-muted hover:text-sidebar-text'
          }`}
        >
          ?㎥ ?ㅽ궗 ({skills.length})
        </button>
        <button
          onClick={() => setTab('mcp')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'mcp'
              ? 'border-brand-primary text-white'
              : 'border-transparent text-sidebar-muted hover:text-sidebar-text'
          }`}
        >
          ??MCP ?쒕쾭 ({mcpList.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'skills' && (
          <div className="max-w-5xl mx-auto space-y-4">
            {/* Actions */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
                placeholder="?ㅽ궗 寃??.."
                className="flex-1 rounded-lg bg-[#222529] border border-chat-border px-3 py-2 text-sm text-white placeholder-sidebar-muted focus:outline-none focus:border-brand-primary"
              />
              <button
                onClick={updateAllSkills}
                disabled={busyKey !== null || loadingSkills}
                className="px-3 py-2 text-sm rounded-lg bg-brand-primary/20 text-blue-300 hover:bg-brand-primary/30 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {busyKey === 'update-all' ? '?낅뜲?댄듃 以?..' : '?꾩껜 ?낅뜲?댄듃'}
              </button>
              <button
                onClick={() => setShowAddSkill(true)}
                disabled={busyKey !== null}
                className="btn-primary whitespace-nowrap"
              >
                + ?⑦궎吏 異붽?
              </button>
              <button
                onClick={() => setShowCreateSkill(true)}
                disabled={busyKey !== null}
                className="px-3 py-2 text-sm rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                Create skill
              </button>
            </div>

            {/* Loading */}
            {loadingSkills && (
              <div className="flex h-40 items-center justify-center text-sm text-sidebar-muted">
                ?ㅽ궗 紐⑸줉 遺덈윭?ㅻ뒗 以?..
              </div>
            )}

            {/* Install in progress */}
            {busyKey === 'install' && (
              <div className="rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-4 py-3 text-sm text-blue-300">
                ?ㅽ궗 ?ㅼ튂 以?.. ?곕???異쒕젰???뺤씤?섏꽭??
              </div>
            )}

            {/* Grid */}
            {!loadingSkills && (
              <>
                {filteredSkills.length === 0 ? (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-chat-border text-sm text-sidebar-muted">
                    {skillSearch ? '寃??寃곌낵媛 ?놁뒿?덈떎.' : '?ㅼ튂???ㅽ궗???놁뒿?덈떎.'}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredSkills.map((skill) => (
                      <SkillCard
                        key={skill.dirName}
                        skill={skill}
                        loading={busyKey !== null}
                        onDelete={() => deleteSkill(skill)}
                        onUpdate={() => updateSkill(skill)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'mcp' && (
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Actions */}
            <div className="flex items-center gap-3 justify-between">
              <div className="flex gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                  ?윟 ?쒖꽦 {enabledMcp}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
                  ?뵶 鍮꾪솢??{disabledMcp}
                </span>
              </div>
              <button onClick={() => setShowAddMcp(true)} className="btn-primary">
                + MCP 異붽?
              </button>
            </div>

            {loadingMcp && (
              <div className="flex h-40 items-center justify-center text-sm text-sidebar-muted">
                MCP ?ㅼ젙 遺덈윭?ㅻ뒗 以?..
              </div>
            )}

            {!loadingMcp && (
              <>
                {mcpList.length === 0 ? (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-chat-border text-sm text-sidebar-muted">
                    ?깅줉??MCP ?쒕쾭媛 ?놁뒿?덈떎.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mcpList.map((s) => (
                      <McpRow
                        key={s.key}
                        server={s}
                        loading={loadingMcp}
                        onToggle={() => toggleMcp(s)}
                        onDelete={() => deleteMcp(s)}
                      />
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-sidebar-muted text-center pt-2">
                  MCP 蹂寃쎌궗??? Claude Desktop ?ъ떆?????곸슜?⑸땲??
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Terminal log */}
      <LogPanel lines={logLines} onClear={() => setLogLines([])} />

      {/* Modals */}
      {showAddSkill && (
        <AddSkillModal onClose={() => setShowAddSkill(false)} onInstall={installSkill} />
      )}
      {showCreateSkill && (
        <CreateSkillModal onClose={() => setShowCreateSkill(false)} onCreate={createLocalSkill} />
      )}
      {showAddMcp && (
        <AddMcpModal onClose={() => setShowAddMcp(false)} onAdd={addMcp} />
      )}
    </div>
  );
}
