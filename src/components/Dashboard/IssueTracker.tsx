import React, { useState } from 'react';
import type { Issue } from '../../types/index.js';
import { useAgents } from '../../contexts/AgentContext.js';

const STORAGE_KEY = 'ao2-issues';
function load(): Issue[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function save(items: Issue[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}
function makeId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function now() { return new Date().toISOString(); }

const STATUS_CONFIG: Record<Issue['status'], { label: string; color: string }> = {
  open:        { label: '열림',   color: 'bg-red-900 text-red-300' },
  in_progress: { label: '진행 중', color: 'bg-yellow-900 text-yellow-300' },
  resolved:    { label: '해결됨', color: 'bg-emerald-900 text-emerald-300' },
  closed:      { label: '닫힘',   color: 'bg-gray-700 text-gray-400' },
};

const SEVERITY_CONFIG: Record<Issue['severity'], { label: string; color: string; dot: string }> = {
  critical: { label: 'Critical', color: 'text-red-400', dot: 'bg-red-500' },
  high:     { label: 'High',     color: 'text-orange-400', dot: 'bg-orange-500' },
  medium:   { label: 'Medium',   color: 'text-yellow-400', dot: 'bg-yellow-500' },
  low:      { label: 'Low',      color: 'text-gray-400', dot: 'bg-gray-500' },
};

export default function IssueTracker() {
  const { agents } = useAgents();
  const [issues, setIssues] = useState<Issue[]>(load);
  const [showAdd, setShowAdd] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Issue['status'] | 'all'>('all');
  const [form, setForm] = useState({ title: '', description: '', severity: 'medium' as Issue['severity'], assignedTo: '' });

  const addIssue = () => {
    if (!form.title.trim()) return;
    const item: Issue = {
      id: makeId(), title: form.title, description: form.description,
      status: 'open', severity: form.severity,
      assignedTo: form.assignedTo || undefined,
      createdAt: now(), updatedAt: now(),
    };
    const next = [item, ...issues]; setIssues(next); save(next);
    setForm({ title: '', description: '', severity: 'medium', assignedTo: '' });
    setShowAdd(false);
  };

  const updateStatus = (id: string, status: Issue['status']) => {
    const next = issues.map((i) => i.id === id ? { ...i, status, updatedAt: now() } : i);
    setIssues(next); save(next);
  };

  const deleteIssue = (id: string) => {
    const next = issues.filter((i) => i.id !== id); setIssues(next); save(next);
  };

  const filtered = filterStatus === 'all' ? issues : issues.filter((i) => i.status === filterStatus);
  const counts = {
    open: issues.filter((i) => i.status === 'open').length,
    in_progress: issues.filter((i) => i.status === 'in_progress').length,
    resolved: issues.filter((i) => i.status === 'resolved').length,
    closed: issues.filter((i) => i.status === 'closed').length,
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">🐛 이슈 트래커</span>
        <button onClick={() => setShowAdd(true)} className="no-drag btn-primary ml-auto">+ 이슈 추가</button>
      </header>

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-[#222529] rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-semibold mb-4">새 이슈</h3>
            <div className="space-y-3">
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="이슈 제목 *" className="message-input w-full" />
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="상세 설명" rows={3} className="message-input w-full" />
              <div className="flex gap-2">
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Issue['severity'] })} className="message-input flex-1">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className="message-input flex-1">
                  <option value="">담당자 없음</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAdd(false)} className="btn-ghost">취소</button>
                <button onClick={addIssue} className="btn-primary">추가</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-chat-border bg-chat-bg flex-shrink-0">
        {([['all', '전체', issues.length], ['open', '열림', counts.open], ['in_progress', '진행 중', counts.in_progress], ['resolved', '해결됨', counts.resolved], ['closed', '닫힘', counts.closed]] as const).map(([val, label, count]) => (
          <button
            key={val}
            onClick={() => setFilterStatus(val)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filterStatus === val ? 'bg-brand-primary text-white' : 'text-sidebar-muted hover:text-white'}`}
          >
            {label} {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sidebar-muted text-sm">이슈가 없습니다</div>
        ) : (
          filtered.map((issue) => {
            const sev = SEVERITY_CONFIG[issue.severity];
            const sta = STATUS_CONFIG[issue.status];
            const assignee = issue.assignedTo ? agents.find((a) => a.id === issue.assignedTo) : null;
            return (
              <div key={issue.id} className="bg-[#222529] rounded-xl p-4 group">
                <div className="flex items-start gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${sev.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-white font-medium leading-snug">{issue.title}</p>
                      <button onClick={() => deleteIssue(issue.id)} className="opacity-0 group-hover:opacity-100 text-sidebar-muted hover:text-red-400 text-xs flex-shrink-0">✕</button>
                    </div>
                    {issue.description && <p className="text-xs text-sidebar-muted mt-1 line-clamp-2">{issue.description}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${sta.color}`}>{sta.label}</span>
                      <span className={`text-xs font-medium ${sev.color}`}>{sev.label}</span>
                      {assignee && <span className="text-xs text-sidebar-muted">{assignee.emoji} {assignee.name}</span>}
                      <span className="text-xs text-sidebar-muted ml-auto">{new Date(issue.createdAt).toLocaleDateString('ko-KR')}</span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {(['open', 'in_progress', 'resolved', 'closed'] as Issue['status'][])
                        .filter((s) => s !== issue.status)
                        .map((s) => (
                          <button key={s} onClick={() => updateStatus(issue.id, s)} className="text-xs text-sidebar-muted hover:text-white px-1.5 py-0.5 rounded hover:bg-sidebar-hover">
                            → {STATUS_CONFIG[s].label}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
