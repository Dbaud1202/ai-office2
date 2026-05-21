import React, { useMemo, useState } from 'react';
import { useAgents } from '../contexts/AgentContext.js';
import { ALL_CHANNEL_ID, MEETING_CHANNEL_ID, WORK_CHANNEL_ID, useChat } from '../contexts/ChatContext.js';
import type { ViewMode } from '../types/index.js';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onViewChange: (view: ViewMode) => void;
  onOpenPipeline: () => void;
}

export default function CommandPalette({ open, onClose, onViewChange, onOpenPipeline }: CommandPaletteProps) {
  const { agents } = useAgents();
  const { setActiveChannel } = useChat();
  const [query, setQuery] = useState('');

  const commands = useMemo(() => {
    const base: { id: string; label: string; hint: string; run: () => void }[] = [
      { id: 'chat', label: 'Open all chat', hint: 'channel', run: () => { setActiveChannel(ALL_CHANNEL_ID); onViewChange('chat'); } },
      { id: 'meeting', label: 'Open meeting room', hint: 'channel', run: () => { setActiveChannel(MEETING_CHANNEL_ID); onViewChange('chat'); } },
      { id: 'work', label: 'Open workroom', hint: 'channel', run: () => { setActiveChannel(WORK_CHANNEL_ID); onViewChange('chat'); } },
      { id: 'timeline', label: 'Open execution timeline', hint: 'view', run: () => onViewChange('timeline') },
      { id: 'vault', label: 'Search Vault', hint: 'view', run: () => onViewChange('vault') },
      { id: 'providers', label: 'Provider diagnostics', hint: 'settings', run: () => onViewChange('settings') },
      { id: 'usage', label: 'Usage and budget guard', hint: 'view', run: () => onViewChange('usage') },
      { id: 'tasks', label: 'Task board', hint: 'view', run: () => onViewChange('tasks') },
      { id: 'pipeline', label: 'Run pipeline', hint: 'action', run: onOpenPipeline },
    ];

    return [
      ...base,
      ...agents.map((agent) => ({
        id: `agent-${agent.id}`,
        label: `Chat with ${agent.name}`,
        hint: agent.role,
        run: () => {
          setActiveChannel(`ch-${agent.id}`);
          onViewChange('chat');
        },
      })),
    ];
  }, [agents, onOpenPipeline, onViewChange, setActiveChannel]);

  const filtered = query.trim()
    ? commands.filter((command) => `${command.label} ${command.hint}`.toLowerCase().includes(query.toLowerCase()))
    : commands;

  if (!open) return null;

  function run(command: typeof commands[number]) {
    command.run();
    setQuery('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24" onMouseDown={onClose}>
      <div className="w-full max-w-xl rounded-lg border border-chat-border bg-[#222529] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Enter' && filtered[0]) run(filtered[0]);
          }}
          placeholder="Search commands"
          className="w-full border-b border-chat-border bg-transparent px-4 py-3 text-sm text-white outline-none placeholder-sidebar-muted"
        />
        <div className="max-h-96 overflow-y-auto p-2">
          {filtered.map((command) => (
            <button
              key={command.id}
              onClick={() => run(command)}
              className="flex w-full items-center gap-3 rounded px-3 py-2 text-left hover:bg-sidebar-hover"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-white">{command.label}</span>
              <span className="text-xs text-sidebar-muted">{command.hint}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="px-3 py-8 text-center text-sm text-sidebar-muted">No commands found.</div>}
        </div>
      </div>
    </div>
  );
}
