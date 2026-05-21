import React, { useMemo, useState } from 'react';
import { useAgents } from '../../contexts/AgentContext.js';
import { useChat } from '../../contexts/ChatContext.js';
import type { PipelineStep, WorkflowTemplate } from '../../types/index.js';

const STORAGE_KEY = 'ao2-workflows-v1';

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadWorkflows(): WorkflowTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveWorkflows(workflows: WorkflowTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
}

function inferSteps(goal: string): PipelineStep[] {
  const text = goal.toLowerCase();
  const steps: PipelineStep[] = [{ agentId: 'ceo', instruction: '목표를 판단하고 실행 전략을 세우세요.', dependsOnPrevious: false }];

  if (/시장|경쟁|조사|리서치|트렌드|검색/.test(text)) {
    steps.push({ agentId: 'researcher', instruction: '필요한 배경 조사와 근거를 수집하세요.', dependsOnPrevious: true });
  }
  if (/제품|기능|ux|사용자|로드맵|앱/.test(text)) {
    steps.push({ agentId: 'cpo', instruction: '제품 관점의 요구사항과 우선순위를 정리하세요.', dependsOnPrevious: true });
  }
  if (/개발|코드|버그|구현|자동화|api|서버|웹/.test(text)) {
    steps.push({ agentId: 'cto', instruction: '기술 설계와 구현 계획을 수립하세요.', dependsOnPrevious: true });
    steps.push({ agentId: 'developer', instruction: '실행 가능한 구현안을 작성하세요.', dependsOnPrevious: true });
  }
  if (/마케팅|브랜드|콘텐츠|블로그|광고|세일즈/.test(text)) {
    steps.push({ agentId: 'cmo', instruction: '마케팅 전략과 메시지를 설계하세요.', dependsOnPrevious: true });
    steps.push({ agentId: 'writer', instruction: '사용자가 바로 활용할 문서나 카피로 정리하세요.', dependsOnPrevious: true });
  }
  if (/운영|프로세스|일정|관리|업무|워크플로우/.test(text)) {
    steps.push({ agentId: 'coo', instruction: '업무 흐름, 담당자, 운영 리스크를 정리하세요.', dependsOnPrevious: true });
  }
  if (/데이터|지표|분석|kpi|매출|비용/.test(text)) {
    steps.push({ agentId: 'analyst', instruction: '필요한 지표와 판단 기준을 제안하세요.', dependsOnPrevious: true });
  }

  steps.push({ agentId: 'ceo', instruction: '모든 결과를 종합해 최종 결정과 다음 액션을 확정하세요.', dependsOnPrevious: true });
  return steps.length > 2 ? steps : [
    { agentId: 'ceo', instruction: '목표를 분석하고 필요한 팀원을 지정하세요.', dependsOnPrevious: false },
    { agentId: 'coo', instruction: '실행 순서와 운영 계획을 만드세요.', dependsOnPrevious: true },
    { agentId: 'ceo', instruction: '최종 결론과 위임 순서를 정리하세요.', dependsOnPrevious: true },
  ];
}

export default function WorkflowDashboard() {
  const { agents } = useAgents();
  const { runPipeline, isPipelineRunning } = useChat();
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>(loadWorkflows);
  const [selectedId, setSelectedId] = useState<string>(() => workflows[0]?.id ?? '');
  const [goal, setGoal] = useState('');

  const selected = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedId) ?? workflows[0],
    [workflows, selectedId]
  );

  function persist(next: WorkflowTemplate[]) {
    setWorkflows(next);
    saveWorkflows(next);
  }

  function createWorkflow() {
    const cleanGoal = goal.trim() || '새 업무 목표';
    const now = new Date().toISOString();
    const workflow: WorkflowTemplate = {
      id: makeId(),
      name: cleanGoal.slice(0, 36),
      description: 'CEO가 자동 생성한 워크플로우 초안',
      goal: cleanGoal,
      steps: inferSteps(cleanGoal),
      createdAt: now,
      updatedAt: now,
    };
    persist([workflow, ...workflows]);
    setSelectedId(workflow.id);
    setGoal('');
  }

  function updateSelected(patch: Partial<WorkflowTemplate>) {
    if (!selected) return;
    const next = workflows.map((workflow) =>
      workflow.id === selected.id ? { ...workflow, ...patch, updatedAt: new Date().toISOString() } : workflow
    );
    persist(next);
  }

  function updateStep(index: number, patch: Partial<PipelineStep>) {
    if (!selected) return;
    updateSelected({
      steps: selected.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    });
  }

  function addStep() {
    if (!selected) return;
    updateSelected({
      steps: [...selected.steps, { agentId: 'ceo', instruction: selected.goal, dependsOnPrevious: true }],
    });
  }

  function removeStep(index: number) {
    if (!selected) return;
    updateSelected({ steps: selected.steps.filter((_, i) => i !== index) });
  }

  async function runSelected() {
    if (!selected || selected.steps.length === 0) return;
    await runPipeline(
      selected.steps.map((step) => ({ ...step, instruction: step.instruction.trim() || selected.goal })),
      selected.goal
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">🧬 워크플로우</span>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-72 flex-shrink-0 border-r border-chat-border bg-sidebar-bg p-3 overflow-y-auto">
          <div className="space-y-2">
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={4}
              placeholder="만들고 싶은 업무를 적으면 CEO가 워크플로우 초안을 만듭니다."
              className="message-input text-xs"
            />
            <button onClick={createWorkflow} className="btn-primary w-full">자동 구축</button>
          </div>

          <div className="mt-4 space-y-2">
            {workflows.map((workflow) => (
              <button
                key={workflow.id}
                onClick={() => setSelectedId(workflow.id)}
                className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                  selected?.id === workflow.id ? 'bg-brand-primary text-white' : 'bg-[#222529] text-sidebar-text hover:bg-sidebar-hover'
                }`}
              >
                <p className="truncate text-sm font-semibold">{workflow.name}</p>
                <p className="mt-0.5 truncate text-xs opacity-70">{workflow.steps.length}단계 · {workflow.description}</p>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-5">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-sm text-sidebar-muted">
              왼쪽에서 업무 목표를 입력해 워크플로우를 만들어보세요.
            </div>
          ) : (
            <div className="mx-auto max-w-5xl space-y-5">
              <section className="panel-card">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <input
                      value={selected.name}
                      onChange={(event) => updateSelected({ name: event.target.value })}
                      className="w-full bg-transparent text-lg font-bold text-white outline-none"
                    />
                    <input
                      value={selected.description}
                      onChange={(event) => updateSelected({ description: event.target.value })}
                      className="mt-1 w-full bg-transparent text-sm text-sidebar-muted outline-none"
                    />
                  </div>
                  <button onClick={runSelected} disabled={isPipelineRunning} className="btn-primary">
                    {isPipelineRunning ? '실행 중...' : '실행'}
                  </button>
                  <button
                    onClick={() => {
                      const next = workflows.filter((workflow) => workflow.id !== selected.id);
                      persist(next);
                      setSelectedId(next[0]?.id ?? '');
                    }}
                    className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20"
                  >
                    삭제
                  </button>
                </div>
                <textarea
                  value={selected.goal}
                  onChange={(event) => updateSelected({ goal: event.target.value })}
                  rows={3}
                  className="message-input mt-4"
                />
              </section>

              <section className="panel-card">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">흐름 보기</h3>
                  <button onClick={addStep} className="btn-ghost">+ 단계 추가</button>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  {selected.steps.map((step, index) => {
                    const agent = agents.find((item) => item.id === step.agentId);
                    return (
                      <div key={index} className="relative rounded-lg border border-chat-border bg-[#1e1f24] p-3">
                        <div className="mb-3 flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-primary/20 text-xs font-bold text-brand-primary">
                            {index + 1}
                          </span>
                          <select
                            value={step.agentId}
                            onChange={(event) => updateStep(index, { agentId: event.target.value })}
                            className="min-w-0 flex-1 rounded border border-chat-border bg-[#15171a] px-2 py-1 text-xs text-white outline-none"
                          >
                            {agents.map((item) => (
                              <option key={item.id} value={item.id}>{item.emoji} {item.name}</option>
                            ))}
                          </select>
                          <button onClick={() => removeStep(index)} className="text-xs text-red-300 hover:text-red-200">×</button>
                        </div>
                        <p className="mb-2 text-xs text-sidebar-muted">{agent?.role ?? '팀원'}</p>
                        <textarea
                          value={step.instruction}
                          onChange={(event) => updateStep(index, { instruction: event.target.value })}
                          rows={4}
                          className="w-full resize-none rounded border border-chat-border bg-[#15171a] px-2 py-2 text-xs text-white outline-none focus:border-brand-primary/50"
                        />
                        {index > 0 && (
                          <label className="mt-2 flex items-center gap-2 text-xs text-sidebar-muted">
                            <input
                              type="checkbox"
                              checked={step.dependsOnPrevious}
                              onChange={(event) => updateStep(index, { dependsOnPrevious: event.target.checked })}
                              className="accent-brand-primary"
                            />
                            이전 결과 전달
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
