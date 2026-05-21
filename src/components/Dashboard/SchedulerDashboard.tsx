import React, { useEffect, useMemo, useState } from 'react';
import { ALL_CHANNEL_ID, useChat } from '../../contexts/ChatContext.js';
import type { ScheduledJob, WorkflowTemplate } from '../../types/index.js';

const JOBS_KEY = 'ao2-scheduled-jobs-v1';
const WORKFLOWS_KEY = 'ao2-workflows-v1';

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadJobs(): ScheduledJob[] {
  try {
    return JSON.parse(localStorage.getItem(JOBS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveJobs(jobs: ScheduledJob[]) {
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
}

function loadWorkflows(): WorkflowTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(WORKFLOWS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function toDatetimeLocal(date = new Date(Date.now() + 60 * 60 * 1000)) {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextRunDate(runAt: string, repeat: ScheduledJob['repeat']) {
  const date = new Date(runAt);
  if (repeat === 'daily') date.setDate(date.getDate() + 1);
  if (repeat === 'weekly') date.setDate(date.getDate() + 7);
  return date.toISOString();
}

export default function SchedulerDashboard() {
  const { channels, sendMessage, runPipeline, isStreaming, isPipelineRunning } = useChat();
  const [jobs, setJobs] = useState<ScheduledJob[]>(loadJobs);
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>(loadWorkflows);
  const [form, setForm] = useState({
    title: '',
    type: 'message' as ScheduledJob['type'],
    targetChannelId: ALL_CHANNEL_ID,
    prompt: '',
    workflowId: '',
    runAt: toDatetimeLocal(),
    repeat: 'none' as ScheduledJob['repeat'],
  });

  const dueJobs = useMemo(
    () => jobs.filter((job) => job.status === 'scheduled' && new Date(job.runAt).getTime() <= Date.now()),
    [jobs]
  );

  function persist(next: ScheduledJob[]) {
    const sorted = next.slice().sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime());
    setJobs(sorted);
    saveJobs(sorted);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWorkflows(loadWorkflows());
      setJobs(loadJobs());
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  function createJob() {
    const now = new Date().toISOString();
    const job: ScheduledJob = {
      id: makeId(),
      title: form.title.trim() || (form.type === 'workflow' ? '예약 워크플로우' : '예약 메시지'),
      type: form.type,
      targetChannelId: form.targetChannelId,
      prompt: form.prompt.trim(),
      workflowId: form.workflowId || undefined,
      runAt: new Date(form.runAt).toISOString(),
      repeat: form.repeat,
      status: 'scheduled',
      createdAt: now,
    };
    persist([...jobs, job]);
    setForm({ ...form, title: '', prompt: '', runAt: toDatetimeLocal() });
  }

  async function runJob(job: ScheduledJob) {
    if (isStreaming || isPipelineRunning) return;

    if (job.type === 'workflow') {
      const workflow = workflows.find((item) => item.id === job.workflowId);
      if (!workflow) return;
      await runPipeline(workflow.steps, job.prompt || workflow.goal);
    } else {
      await sendMessage(job.targetChannelId, job.prompt || job.title);
    }

    const next = jobs.map((item) => {
      if (item.id !== job.id) return item;
      if (item.repeat === 'none') {
        return { ...item, status: 'done' as const, lastRunAt: new Date().toISOString() };
      }
      return {
        ...item,
        runAt: nextRunDate(item.runAt, item.repeat),
        lastRunAt: new Date().toISOString(),
      };
    });
    persist(next);
  }

  function togglePause(job: ScheduledJob) {
    persist(jobs.map((item) => item.id === job.id ? { ...item, status: item.status === 'paused' ? 'scheduled' : 'paused' } : item));
  }

  function deleteJob(id: string) {
    persist(jobs.filter((job) => job.id !== id));
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">⏰ 스케줄러</span>
        {dueJobs.length > 0 && (
          <span className="no-drag rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-300">
            실행 대기 {dueJobs.length}
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[360px_1fr]">
          <section className="panel-card h-fit">
            <h2 className="text-sm font-semibold text-white">예약 추가</h2>
            <div className="mt-4 space-y-3">
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예약 이름" className="message-input" />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ScheduledJob['type'] })} className="message-input">
                <option value="message">CEO/팀원에게 메시지</option>
                <option value="workflow">워크플로우 실행</option>
              </select>
              {form.type === 'message' ? (
                <select value={form.targetChannelId} onChange={(e) => setForm({ ...form, targetChannelId: e.target.value })} className="message-input">
                  {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
                </select>
              ) : (
                <select value={form.workflowId} onChange={(e) => setForm({ ...form, workflowId: e.target.value })} className="message-input">
                  <option value="">워크플로우 선택</option>
                  {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                </select>
              )}
              <textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} rows={4} placeholder="실행할 지시사항" className="message-input" />
              <input type="datetime-local" value={form.runAt} onChange={(e) => setForm({ ...form, runAt: e.target.value })} className="message-input" />
              <select value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value as ScheduledJob['repeat'] })} className="message-input">
                <option value="none">반복 없음</option>
                <option value="daily">매일</option>
                <option value="weekly">매주</option>
              </select>
              <button onClick={createJob} className="btn-primary w-full">예약 저장</button>
            </div>
          </section>

          <section className="space-y-3">
            {jobs.length === 0 ? (
              <div className="panel-card flex h-48 items-center justify-center text-sm text-sidebar-muted">
                아직 예약된 작업이 없습니다.
              </div>
            ) : jobs.map((job) => {
              const due = job.status === 'scheduled' && new Date(job.runAt).getTime() <= Date.now();
              return (
                <div key={job.id} className={`panel-card ${due ? 'border-yellow-500/40' : ''}`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span>{job.type === 'workflow' ? '🧬' : '💬'}</span>
                        <h3 className="truncate text-sm font-semibold text-white">{job.title}</h3>
                        <span className={`rounded px-2 py-0.5 text-[11px] ${job.status === 'scheduled' ? 'bg-emerald-500/10 text-emerald-300' : job.status === 'paused' ? 'bg-yellow-500/10 text-yellow-300' : 'bg-gray-500/10 text-gray-300'}`}>
                          {job.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-sidebar-muted">
                        {new Date(job.runAt).toLocaleString('ko-KR')} · {job.repeat === 'none' ? '반복 없음' : job.repeat}
                      </p>
                      {job.prompt && <p className="mt-2 line-clamp-2 text-xs text-sidebar-text">{job.prompt}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => runJob(job)} disabled={job.status === 'paused' || isStreaming || isPipelineRunning} className="btn-primary">
                        {due ? '지금 실행' : '실행'}
                      </button>
                      <button onClick={() => togglePause(job)} className="btn-ghost">{job.status === 'paused' ? '재개' : '일시정지'}</button>
                      <button onClick={() => deleteJob(job.id)} className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20">삭제</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}
