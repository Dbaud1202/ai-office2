import React, { useState } from 'react';
import { useAgents } from '../../contexts/AgentContext.js';
import { useChat } from '../../contexts/ChatContext.js';
import type { PipelineStep } from '../../types/index.js';

interface Props {
  onClose: () => void;
}

const PRESET_PIPELINES = [
  {
    name: '🔍 리서치 → 개발',
    description: '조사 후 코드 구현',
    steps: [
      { agentId: 'researcher', instruction: '', dependsOnPrevious: false },
      { agentId: 'developer', instruction: '', dependsOnPrevious: true },
    ],
  },
  {
    name: '🧠 리서치 → 작가',
    description: '조사 후 문서/블로그 작성',
    steps: [
      { agentId: 'researcher', instruction: '', dependsOnPrevious: false },
      { agentId: 'writer', instruction: '', dependsOnPrevious: true },
    ],
  },
  {
    name: '🏗️ 전략 → 개발 → 문서화',
    description: 'CPO 제품 전략부터 전체 흐름',
    steps: [
      { agentId: 'cpo', instruction: '', dependsOnPrevious: false },
      { agentId: 'developer', instruction: '', dependsOnPrevious: true },
      { agentId: 'writer', instruction: '', dependsOnPrevious: true },
    ],
  },
  {
    name: '📣 시장조사 → 마케팅 전략',
    description: 'CMO와 리서처 협업',
    steps: [
      { agentId: 'researcher', instruction: '', dependsOnPrevious: false },
      { agentId: 'cmo', instruction: '', dependsOnPrevious: true },
      { agentId: 'writer', instruction: '', dependsOnPrevious: true },
    ],
  },
];

export default function PipelineModal({ onClose }: Props) {
  const { agents } = useAgents();
  const { runPipeline, isPipelineRunning } = useChat();

  const [goal, setGoal] = useState('');
  const [steps, setSteps] = useState<PipelineStep[]>([
    { agentId: 'researcher', instruction: '', dependsOnPrevious: false },
    { agentId: 'developer', instruction: '', dependsOnPrevious: true },
  ]);

  function applyPreset(preset: typeof PRESET_PIPELINES[0]) {
    setSteps(preset.steps.map((s) => ({ ...s })));
  }

  function addStep() {
    setSteps((prev) => [...prev, { agentId: 'researcher', instruction: '', dependsOnPrevious: true }]);
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateStep(i: number, field: keyof PipelineStep, value: string | boolean) {
    setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function handleRun() {
    if (!goal.trim()) { alert('목표를 입력해 주세요.'); return; }
    if (steps.length === 0) { alert('최소 1개의 단계가 필요합니다.'); return; }

    // 각 단계의 instruction이 비어있으면 goal을 기본값으로 사용
    const finalSteps = steps.map((s) => ({
      ...s,
      instruction: s.instruction.trim() || goal.trim(),
    }));

    onClose();
    await runPipeline(finalSteps, goal.trim());
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* 모달 */}
      <div className="relative z-50 w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#1e1f24] border border-[#2c2d30] rounded-xl shadow-2xl mx-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2c2d30]">
          <div>
            <h2 className="text-white font-semibold text-base">⚡ 파이프라인 실행</h2>
            <p className="text-sidebar-muted text-xs mt-0.5">여러 에이전트를 순차적으로 실행합니다</p>
          </div>
          <button onClick={onClose} className="text-sidebar-muted hover:text-white text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 목표 입력 */}
          <div>
            <label className="text-xs font-semibold text-sidebar-muted uppercase tracking-wider block mb-1.5">
              목표 (전체 파이프라인 목적)
            </label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="예: AI오피스2 마케팅 전략 수립 및 블로그 포스트 작성"
              className="w-full bg-[#2c2d30] text-white text-sm rounded-lg px-3 py-2.5 outline-none border border-transparent focus:border-brand-primary/50 placeholder-sidebar-muted"
            />
          </div>

          {/* 프리셋 */}
          <div>
            <p className="text-xs font-semibold text-sidebar-muted uppercase tracking-wider mb-2">프리셋</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_PIPELINES.map((p) => (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p)}
                  className="text-left px-3 py-2 rounded-lg bg-[#2c2d30] hover:bg-[#34363b] border border-[#3a3b40] transition-colors"
                >
                  <p className="text-sm text-white font-medium">{p.name}</p>
                  <p className="text-xs text-sidebar-muted mt-0.5">{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 단계 목록 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-sidebar-muted uppercase tracking-wider">실행 단계</p>
              <button onClick={addStep} className="text-xs text-brand-primary hover:text-brand-primary/80">+ 단계 추가</button>
            </div>

            <div className="space-y-2">
              {steps.map((step, i) => {
                const agent = agents.find((a) => a.id === step.agentId);
                return (
                  <div key={i} className="bg-[#2c2d30] rounded-lg p-3 border border-[#3a3b40]">
                    <div className="flex items-center gap-2 mb-2">
                      {/* 순서 번호 */}
                      <span className="w-5 h-5 rounded-full bg-brand-primary/20 text-brand-primary text-xs flex items-center justify-center font-bold flex-shrink-0">
                        {i + 1}
                      </span>

                      {/* 에이전트 선택 */}
                      <select
                        value={step.agentId}
                        onChange={(e) => updateStep(i, 'agentId', e.target.value)}
                        className="flex-1 bg-[#1e1f24] text-white text-xs rounded px-2 py-1 outline-none border border-[#3a3b40]"
                      >
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>
                        ))}
                      </select>

                      {/* 이전 결과 사용 */}
                      {i > 0 && (
                        <label className="flex items-center gap-1 text-xs text-sidebar-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={step.dependsOnPrevious}
                            onChange={(e) => updateStep(i, 'dependsOnPrevious', e.target.checked)}
                            className="accent-brand-primary"
                          />
                          이전 결과 전달
                        </label>
                      )}

                      {/* 이동/삭제 버튼 */}
                      <div className="flex gap-1 ml-auto">
                        <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-sidebar-muted hover:text-white disabled:opacity-30 text-xs px-1">↑</button>
                        <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="text-sidebar-muted hover:text-white disabled:opacity-30 text-xs px-1">↓</button>
                        <button onClick={() => removeStep(i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
                      </div>
                    </div>

                    {/* 커스텀 지시사항 (optional) */}
                    <input
                      type="text"
                      value={step.instruction}
                      onChange={(e) => updateStep(i, 'instruction', e.target.value)}
                      placeholder={`${agent?.name ?? '에이전트'}에게 전달할 지시 (비우면 목표 사용)`}
                      className="w-full bg-[#1e1f24] text-white text-xs rounded px-2 py-1.5 outline-none border border-transparent focus:border-brand-primary/30 placeholder-sidebar-muted/60"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#2c2d30]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-sidebar-muted hover:text-white rounded-lg">취소</button>
          <button
            onClick={handleRun}
            disabled={isPipelineRunning || !goal.trim()}
            className="px-5 py-2 text-sm font-semibold bg-brand-primary text-white rounded-lg hover:bg-brand-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPipelineRunning ? '실행 중...' : '⚡ 실행'}
          </button>
        </div>
      </div>
    </div>
  );
}
