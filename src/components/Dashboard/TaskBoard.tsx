import React, { useEffect, useState } from 'react';
import type { Task } from '../../types/index.js';
import { useAgents } from '../../contexts/AgentContext.js';
import { getActiveCheckouts, checkoutTask, releaseTask, isTaskCheckedOut } from '../../utils/taskCheckout.js';
import type { TaskCheckout } from '../../types/index.js';

const STORAGE_KEY = 'ao2-tasks';
function load(): Task[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function save(t: Task[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); } catch {}
}
function makeId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function now() { return new Date().toISOString(); }

const COLS: { id: Task['status']; label: string; color: string }[] = [
  { id: 'backlog',     label: '백로그',   color: 'border-gray-600' },
  { id: 'todo',        label: '할 일',    color: 'border-blue-600' },
  { id: 'in_progress', label: '진행 중',  color: 'border-yellow-500' },
  { id: 'done',        label: '완료',     color: 'border-emerald-500' },
];

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  low:    'bg-gray-700 text-gray-300',
  medium: 'bg-blue-900 text-blue-300',
  high:   'bg-red-900 text-red-300',
};

export default function TaskBoard() {
  const { agents } = useAgents();
  const [tasks, setTasks] = useState<Task[]>(load);
  const [checkouts, setCheckouts] = useState<TaskCheckout[]>(() => getActiveCheckouts());
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' as Task['priority'], assignedTo: '' });

  useEffect(() => {
    const timer = setInterval(() => setCheckouts(getActiveCheckouts()), 10_000);
    return () => clearInterval(timer);
  }, []);

  const updateTask = (id: string, patch: Partial<Task>) => {
    const next = tasks.map((t) => t.id === id ? { ...t, ...patch, updatedAt: now() } : t);
    setTasks(next); save(next);
  };

  const addTask = () => {
    if (!form.title.trim()) return;
    const t: Task = { id: makeId(), title: form.title, description: form.description, status: 'todo', priority: form.priority, assignedTo: form.assignedTo || undefined, createdAt: now(), updatedAt: now(), tags: [] };
    const next = [...tasks, t]; setTasks(next); save(next);
    setForm({ title: '', description: '', priority: 'medium', assignedTo: '' });
    setShowAdd(false);
  };

  const deleteTask = (id: string) => {
    const next = tasks.filter((t) => t.id !== id); setTasks(next); save(next);
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">✅ 태스크 보드</span>
        <button onClick={() => setShowAdd(true)} className="no-drag btn-primary ml-auto">+ 태스크 추가</button>
      </header>

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-[#222529] rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-semibold mb-4">새 태스크</h3>
            <div className="space-y-3">
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="제목 *" className="message-input w-full" />
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="설명 (선택)" rows={3} className="message-input w-full" />
              <div className="flex gap-2">
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Task['priority'] })} className="message-input flex-1">
                  <option value="low">낮음</option>
                  <option value="medium">보통</option>
                  <option value="high">높음</option>
                </select>
                <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className="message-input flex-1">
                  <option value="">담당자 없음</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAdd(false)} className="btn-ghost">취소</button>
                <button onClick={addTask} className="btn-primary">추가</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          {COLS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id);
            return (
              <div key={col.id} className={`w-72 flex flex-col rounded-xl border-t-2 ${col.color} bg-[#222529] flex-shrink-0`}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-chat-border">
                  <span className="text-xs font-semibold text-sidebar-text">{col.label}</span>
                  <span className="text-xs text-sidebar-muted bg-sidebar-hover px-1.5 rounded">{colTasks.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {colTasks.map((task) => {
                    const assignee = task.assignedTo ? agents.find((a) => a.id === task.assignedTo) : null;
                    const checkout = checkouts.find((c) => c.taskId === task.id);
                    const lockHolder = checkout ? (agents.find((a) => a.id === checkout.agentId)?.name ?? checkout.agentId) : null;
                    return (
                      <div key={task.id} className={`bg-chat-bg rounded-lg p-3 group ${checkout ? 'ring-1 ring-yellow-500/40' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-white font-medium leading-snug flex-1">{task.title}</p>
                          <div className="flex gap-1 items-center flex-shrink-0">
                            {checkout ? (
                              <span title={`${lockHolder} 작업 중 (잠금)`} className="text-yellow-400 text-xs">🔒</span>
                            ) : (
                              <button
                                title="에이전트 체크아웃"
                                onClick={() => {
                                  const firstAgent = agents[0];
                                  if (firstAgent) {
                                    checkoutTask(task.id, firstAgent.id);
                                    setCheckouts(getActiveCheckouts());
                                  }
                                }}
                                className="opacity-0 group-hover:opacity-100 text-sidebar-muted hover:text-yellow-400 text-xs"
                              >
                                🔓
                              </button>
                            )}
                            {checkout && (
                              <button
                                title="잠금 해제"
                                onClick={() => { releaseTask(task.id); setCheckouts(getActiveCheckouts()); }}
                                className="opacity-0 group-hover:opacity-100 text-yellow-400 hover:text-white text-xs"
                              >
                                ✕
                              </button>
                            )}
                            <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-sidebar-muted hover:text-red-400 text-xs">✕</button>
                          </div>
                        </div>
                        {checkout && (
                          <p className="text-xs text-yellow-400 mt-1">🔒 {lockHolder} 작업 중</p>
                        )}
                        {task.description && <p className="text-xs text-sidebar-muted mt-1 line-clamp-2">{task.description}</p>}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>
                            {task.priority === 'low' ? '낮음' : task.priority === 'medium' ? '보통' : '높음'}
                          </span>
                          {assignee && (
                            <span className="text-xs text-sidebar-muted">{assignee.emoji} {assignee.name}</span>
                          )}
                        </div>
                        <div className="flex gap-1 mt-2">
                          {COLS.filter((c) => c.id !== col.id).map((c) => (
                            <button key={c.id} onClick={() => updateTask(task.id, { status: c.id })} className="text-xs text-sidebar-muted hover:text-white px-1.5 py-0.5 rounded hover:bg-sidebar-hover">
                              → {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
