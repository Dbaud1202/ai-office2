import React, { useMemo, useState } from 'react';
import { useAgents } from '../../contexts/AgentContext.js';
import { loadWorkflowLogs, loadTasks, loadApprovals } from '../../utils/opsStore.js';
import type { AuditEntry } from '../../types/index.js';

function loadAudit(): AuditEntry[] {
  try {
    return JSON.parse(localStorage.getItem('ao2-audit') ?? '[]');
  } catch {
    return [];
  }
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ExecutionTimeline() {
  const { agents } = useAgents();
  const [version, setVersion] = useState(0);
  const items = useMemo(() => {
    const audit = loadAudit().map((entry) => ({
      id: `audit-${entry.id}`,
      time: entry.timestamp,
      title: entry.action.replace(/_/g, ' '),
      detail: entry.description,
      actor: entry.actor,
      kind: 'audit',
    }));
    const workflows = loadWorkflowLogs().map((log) => ({
      id: `workflow-${log.id}`,
      time: log.startedAt,
      title: `Workflow ${log.status}`,
      detail: log.goal,
      actor: log.workflowName,
      kind: 'workflow',
    }));
    const tasks = loadTasks().map((task) => ({
      id: `task-${task.id}`,
      time: task.updatedAt,
      title: `Task ${task.status}`,
      detail: task.title,
      actor: task.assignedTo ? agents.find((agent) => agent.id === task.assignedTo)?.name ?? task.assignedTo : 'Unassigned',
      kind: 'task',
    }));
    const approvals = loadApprovals().map((approval) => ({
      id: `approval-${approval.id}`,
      time: approval.decidedAt ?? approval.createdAt,
      title: `Approval ${approval.status}`,
      detail: approval.title,
      actor: approval.source,
      kind: 'approval',
    }));
    return [...audit, ...workflows, ...tasks, ...approvals]
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 120);
  }, [agents, version]);

  const activeAgents = agents.filter((agent) => agent.status === 'working');

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">Execution Timeline</span>
        <button onClick={() => setVersion((value) => value + 1)} className="no-drag btn-ghost ml-auto">
          Refresh
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-5xl space-y-4">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="panel-card">
              <p className="text-xs text-sidebar-muted">Working agents</p>
              <p className="mt-1 text-2xl font-bold text-white">{activeAgents.length}</p>
            </div>
            <div className="panel-card">
              <p className="text-xs text-sidebar-muted">Open tasks</p>
              <p className="mt-1 text-2xl font-bold text-white">{loadTasks().filter((task) => task.status !== 'done').length}</p>
            </div>
            <div className="panel-card">
              <p className="text-xs text-sidebar-muted">Pending approvals</p>
              <p className="mt-1 text-2xl font-bold text-white">{loadApprovals().filter((item) => item.status === 'pending').length}</p>
            </div>
          </section>

          <section className="panel-card">
            {items.length === 0 ? (
              <div className="py-12 text-center text-sm text-sidebar-muted">No execution activity yet.</div>
            ) : (
              <div className="space-y-1">
                {items.map((item) => (
                  <div key={item.id} className="grid gap-3 rounded-lg px-3 py-2 hover:bg-sidebar-hover/40 sm:grid-cols-[120px_120px_1fr]">
                    <span className="text-xs text-sidebar-muted">{formatTime(item.time)}</span>
                    <span className="truncate text-xs text-brand-primary">{item.actor}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{item.title}</p>
                      <p className="truncate text-xs text-sidebar-muted">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
