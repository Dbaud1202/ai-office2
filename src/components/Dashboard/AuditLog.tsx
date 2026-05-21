import React, { useState, useEffect } from 'react';
import type { AuditEntry } from '../../types/index.js';

const STORAGE_KEY = 'ao2-audit';

export function appendAuditLog(entry: Omit<AuditEntry, 'id' | 'timestamp'>) {
  try {
    const existing: AuditEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    const next: AuditEntry[] = [
      { ...entry, id: Math.random().toString(36).slice(2), timestamp: new Date().toISOString() },
      ...existing,
    ].slice(0, 500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

const ACTION_COLORS: Record<string, string> = {
  task_created:   'text-blue-400',
  task_updated:   'text-yellow-400',
  task_deleted:   'text-red-400',
  message_sent:   'text-emerald-400',
  agent_working:  'text-purple-400',
  issue_created:  'text-orange-400',
  issue_updated:  'text-yellow-400',
  budget_added:   'text-emerald-400',
  settings_changed: 'text-gray-400',
};

const ACTION_ICONS: Record<string, string> = {
  task_created: '✅',
  task_updated: '📝',
  task_deleted: '🗑',
  message_sent: '💬',
  agent_working: '🤖',
  issue_created: '🐛',
  issue_updated: '🔧',
  budget_added: '💰',
  settings_changed: '⚙️',
};

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const load = () => {
      try { setEntries(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')); } catch {}
    };
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  const clearLog = () => {
    try { localStorage.removeItem(STORAGE_KEY); setEntries([]); } catch {}
  };

  const filtered = filter
    ? entries.filter((e) => e.action.includes(filter) || e.actor.includes(filter) || e.description.includes(filter))
    : entries;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">📋 감사 로그</span>
        <div className="no-drag flex items-center gap-2 ml-auto">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="검색..."
            className="message-input text-xs py-1 px-2 h-7 w-40"
          />
          <button onClick={clearLog} className="btn-ghost text-xs py-1">지우기</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-sidebar-muted">
            <span className="text-3xl">📋</span>
            <p className="text-sm">{filter ? '검색 결과 없음' : '로그가 없습니다. 앱을 사용하면 자동으로 기록됩니다.'}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((entry) => {
              const icon = ACTION_ICONS[entry.action] ?? '•';
              const color = ACTION_COLORS[entry.action] ?? 'text-gray-400';
              const time = new Date(entry.timestamp).toLocaleString('ko-KR', {
                month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
              });
              return (
                <div key={entry.id} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-hover/30 font-mono text-xs">
                  <span className="text-sidebar-muted flex-shrink-0 w-32">{time}</span>
                  <span className="flex-shrink-0">{icon}</span>
                  <span className={`flex-shrink-0 w-24 ${color}`}>{entry.actor}</span>
                  <span className="text-sidebar-text flex-1">{entry.description}</span>
                  {entry.metadata && (
                    <span className="text-sidebar-muted truncate max-w-32">{JSON.stringify(entry.metadata)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-chat-border px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-sidebar-muted">{filtered.length}개 항목</span>
        <span className="text-xs text-sidebar-muted">최근 500개 유지 · 3초마다 갱신</span>
      </div>
    </div>
  );
}
