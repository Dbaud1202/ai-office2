import React, { useState } from 'react';
import { useAgents } from '../../contexts/AgentContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { KOREAN_VOICES, speak, stopSpeech } from '../../utils/edgeTTS.js';
import {
  PROVIDERS,
  getAgentProvider,
  getAgentMode,
  setAgentMode,
  getUserGuidelines,
  setUserGuidelines,
  getProviderKey,
  getProviderModel,
  setAgentProvider,
  setProviderKey,
  setProviderModel,
  type AIProviderId,
  type AgentMode,
} from '../../utils/providers/index.js';
import { getAgentPreset, setAgentPreset, type AgentPreset, type AgentPresetMode } from '../../utils/agentPresets.js';
import { loadApprovalGate, saveApprovalGate } from '../../utils/approvalGateStore.js';
import { getVersions, saveVersion, rollbackToVersion, deleteVersion } from '../../utils/agentConfigVersions.js';
import { exportCompany, importCompany, downloadJson } from '../../utils/companyPortability.js';
import type { ApprovalGate, AgentConfigVersion } from '../../types/index.js';

export default function SettingsPage() {
  const { agents } = useAgents();
  const { addToast } = useToast();

  const [keys, setKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(PROVIDERS.map((p) => [p.id, getProviderKey(p.id)]))
  );
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PROVIDERS.map((p) => [p.id, Boolean(getProviderKey(p.id))]))
  );
  const [models, setModels] = useState<Record<string, string>>(() =>
    Object.fromEntries(PROVIDERS.map((p) => [p.id, getProviderModel(p.id, p.defaultModel)]))
  );
  const [dynamicModels, setDynamicModels] = useState<Record<string, { id: string; label: string }[]>>({});
  const [modelSearch, setModelSearch] = useState<Record<string, string>>({});
  const [agentProviders, setAgentProvidersState] = useState<Record<string, string>>(() =>
    Object.fromEntries(agents.map((a) => [a.id, getAgentProvider(a.id) ?? 'kimi']))
  );
  const [agentPresets, setAgentPresetsState] = useState<Record<string, AgentPreset>>(() =>
    Object.fromEntries(agents.map((a) => [a.id, getAgentPreset(a.id)]))
  );
  const [mode, setModeState] = useState<AgentMode>(() => getAgentMode());
  const [guidelines, setGuidelinesState] = useState<string>(() => getUserGuidelines());
  const [guidelinesSaved, setGuidelinesSaved] = useState(false);

  // US-004: 승인 게이트
  const [gate, setGateState] = useState<ApprovalGate>(loadApprovalGate);
  const [gateAgentInput, setGateAgentInput] = useState(gate.agentIds.join(', '));
  const [gateToolInput, setGateToolInput] = useState(gate.toolPatterns.join(', '));

  // US-005: 버전 히스토리
  const [selectedAgentForVersions, setSelectedAgentForVersions] = useState('');
  const [agentVersions, setAgentVersions] = useState<AgentConfigVersion[]>([]);

  // TTS 설정
  const [ttsVoice, setTtsVoiceState] = useState(() => localStorage.getItem('ao2-tts-voice') ?? 'ko-KR-SunHiNeural');
  const [ttsRate, setTtsRateState] = useState(() => parseInt(localStorage.getItem('ao2-tts-rate') ?? '0', 10));
  const [ttsPitch, setTtsPitchState] = useState(() => parseInt(localStorage.getItem('ao2-tts-pitch') ?? '0', 10));
  const [ttsPreviewText, setTtsPreviewText] = useState('안녕하세요! 저는 AI 오피스의 비서입니다. 무엇을 도와드릴까요?');
  const [ttsPreviewing, setTtsPreviewing] = useState(false);

  function handleSaveKey(providerId: AIProviderId) {
    const key = keys[providerId]?.trim() ?? '';
    setProviderKey(providerId, key);
    setConnected((prev) => ({ ...prev, [providerId]: Boolean(key) }));
    addToast(`${PROVIDERS.find((p) => p.id === providerId)?.name} 키를 저장했습니다.`, 'success');
  }

  async function handleTestConnection(providerId: AIProviderId) {
    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (!provider) return;

    const key = keys[providerId]?.trim() ?? '';
    if (!key) {
      addToast('API 키를 먼저 입력하세요.', 'warning');
      return;
    }

    setTesting((prev) => ({ ...prev, [providerId]: true }));
    const result = await provider.testConnection(key);
    setTesting((prev) => ({ ...prev, [providerId]: false }));

    if (result.ok) {
      setConnected((prev) => ({ ...prev, [providerId]: true }));
      setProviderKey(providerId, key);
      addToast(`${provider.name} 연결 테스트에 성공했습니다.`, 'success');
    } else {
      setConnected((prev) => ({ ...prev, [providerId]: false }));
      addToast(`연결 실패: ${result.error ?? '알 수 없는 오류'}`, 'error');
    }
  }

  function handleModelChange(providerId: AIProviderId, modelId: string) {
    setModels((prev) => ({ ...prev, [providerId]: modelId }));
    setProviderModel(providerId, modelId);
  }

  async function handleFetchModels(providerId: AIProviderId) {
    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (!provider?.fetchModels) return;

    const key = keys[providerId]?.trim() ?? '';
    if (!key) {
      addToast('API 키를 먼저 입력하세요.', 'warning');
      return;
    }

    setFetchingModels((prev) => ({ ...prev, [providerId]: true }));
    try {
      const fetched = await provider.fetchModels(key);
      setDynamicModels((prev) => ({ ...prev, [providerId]: fetched }));
      // 현재 선택 모델이 새 목록에 없으면 첫 번째로 교정
      setModels((prev) => {
        const current = prev[providerId];
        if (fetched.length > 0 && !fetched.some((m) => m.id === current)) {
          setProviderModel(providerId, fetched[0].id);
          return { ...prev, [providerId]: fetched[0].id };
        }
        return prev;
      });
      addToast(`${provider.name} 모델 목록을 불러왔습니다. (${fetched.length}개)`, 'success');
    } catch (e: any) {
      addToast(`모델 불러오기 실패: ${e.message}`, 'error');
    } finally {
      setFetchingModels((prev) => ({ ...prev, [providerId]: false }));
    }
  }

  function handleAgentProviderChange(agentId: string, providerId: AIProviderId) {
    setAgentProvidersState((prev) => ({ ...prev, [agentId]: providerId }));
    setAgentProvider(agentId, providerId);
  }

  function updateAgentPreset(agentId: string, patch: Partial<AgentPreset>) {
    setAgentPresetsState((prev) => {
      const nextPreset = { ...getAgentPreset(agentId), ...(prev[agentId] ?? {}), ...patch };
      setAgentPreset(agentId, nextPreset);
      return { ...prev, [agentId]: nextPreset };
    });
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">설정</span>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="rounded-lg bg-[#222529] p-5">
            <h2 className="text-sm font-semibold text-white">연결된 AI 서비스</h2>
            <p className="mt-1 text-xs text-sidebar-muted">
              사용 중인 AI 서비스의 API 키를 연결하면 에이전트별로 원하는 모델을 선택할 수 있습니다.
            </p>

            <div className="mt-4 space-y-4">
              {PROVIDERS.map((provider) => (
                <div
                  key={provider.id}
                  className={`rounded-lg border p-4 ${
                    connected[provider.id]
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-chat-border'
                  }`}
                >
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-[#1e1f24] text-sm font-semibold text-white">
                      {provider.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{provider.name}</span>
                        <span className={`text-xs ${connected[provider.id] ? 'text-emerald-400' : 'text-sidebar-muted'}`}>
                          {connected[provider.id] ? '연결됨' : '미연결'}
                        </span>
                      </div>
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-brand-primary hover:underline"
                      >
                        API 키 발급
                      </a>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <input
                        type={showKey[provider.id] ? 'text' : 'password'}
                        value={keys[provider.id] ?? ''}
                        onChange={(e) => setKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                        placeholder={provider.keyPlaceholder ?? (provider.id === 'gemini' ? 'AIza...' : provider.id === 'claude' ? 'sk-ant-...' : 'sk-...')}
                        className="message-input w-full pr-14 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-sidebar-muted hover:text-white"
                      >
                        {showKey[provider.id] ? '숨김' : '보기'}
                      </button>
                    </div>
                    <button
                      onClick={() => handleSaveKey(provider.id)}
                      className="rounded-lg bg-sidebar-hover px-3 py-2 text-xs text-white hover:bg-[#3a3b40]"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => handleTestConnection(provider.id)}
                      disabled={testing[provider.id]}
                      className="rounded-lg bg-brand-primary/20 px-3 py-2 text-xs text-brand-primary hover:bg-brand-primary/30 disabled:opacity-50"
                    >
                      {testing[provider.id] ? '테스트 중...' : '연결 테스트'}
                    </button>
                  </div>

                  {connected[provider.id] && (() => {
                    const modelList = dynamicModels[provider.id] ?? provider.models;
                    const search = modelSearch[provider.id] ?? '';
                    const filtered = search
                      ? modelList.filter((m) =>
                          m.label.toLowerCase().includes(search.toLowerCase()) ||
                          m.id.toLowerCase().includes(search.toLowerCase())
                        )
                      : modelList;
                    const showSearch = modelList.length > 20;

                    return (
                      <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-sidebar-muted">사용 모델</span>
                          {provider.fetchModels && (
                            <button
                              onClick={() => handleFetchModels(provider.id)}
                              disabled={fetchingModels[provider.id]}
                              className="text-xs text-sidebar-muted hover:text-white disabled:opacity-50"
                            >
                              {fetchingModels[provider.id] ? '불러오는 중...' : '↻ 모델 새로고침'}
                            </button>
                          )}
                        </div>
                        {showSearch && (
                          <input
                            type="text"
                            value={search}
                            onChange={(e) => setModelSearch((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                            placeholder="모델 검색..."
                            className="message-input mb-1.5 w-full text-xs"
                          />
                        )}
                        <select
                          value={models[provider.id]}
                          onChange={(e) => handleModelChange(provider.id, e.target.value)}
                          className="w-full rounded-lg border border-chat-border bg-[#1e1f24] px-3 py-2 text-xs text-white outline-none focus:border-brand-primary/50"
                        >
                          {filtered.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                          {filtered.length === 0 && (
                            <option disabled>검색 결과 없음</option>
                          )}
                        </select>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          </section>

          {/* ── 운영 모드 ── */}
          <section className="rounded-lg bg-[#222529] p-5">
            <h2 className="text-sm font-semibold text-white">운영 모드</h2>
            <p className="mt-1 text-xs text-sidebar-muted">
              에이전트가 작업을 수행하는 방식을 선택합니다.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => { setModeState('careful'); setAgentMode('careful'); addToast('신중 모드로 변경했습니다.', 'success'); }}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  mode === 'careful'
                    ? 'border-amber-500/60 bg-amber-500/10'
                    : 'border-chat-border hover:border-chat-border/80 hover:bg-sidebar-hover'
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-base">🤔</span>
                  <span className="text-sm font-semibold text-white">신중 모드</span>
                  {mode === 'careful' && <span className="ml-auto text-xs text-amber-400">사용 중</span>}
                </div>
                <p className="text-xs text-sidebar-muted leading-relaxed">
                  중요한 결정 전 확인을 구합니다. 에이전트가 "이렇게 진행할까요?" 형식으로 먼저 물어보고 대기합니다.
                </p>
              </button>
              <button
                onClick={() => { setModeState('auto'); setAgentMode('auto'); addToast('자율 모드로 변경했습니다.', 'success'); }}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  mode === 'auto'
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-chat-border hover:border-chat-border/80 hover:bg-sidebar-hover'
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-base">⚡</span>
                  <span className="text-sm font-semibold text-white">자율 모드</span>
                  {mode === 'auto' && <span className="ml-auto text-xs text-emerald-400">사용 중</span>}
                </div>
                <p className="text-xs text-sidebar-muted leading-relaxed">
                  권한이 완전히 위임됩니다. 에이전트가 확인 없이 즉시 최선의 판단으로 완성된 결과물을 제공합니다.
                </p>
              </button>
            </div>
          </section>

          {/* ── 권고사항 ── */}
          <section className="rounded-lg bg-[#222529] p-5">
            <h2 className="text-sm font-semibold text-white">권고사항</h2>
            <p className="mt-1 text-xs text-sidebar-muted">
              모든 에이전트가 가장 우선적으로 지켜야 할 지침을 작성하세요. 다른 모든 지시보다 우선 적용됩니다.
            </p>
            <textarea
              value={guidelines}
              onChange={(e) => { setGuidelinesState(e.target.value); setGuidelinesSaved(false); }}
              placeholder={"예시:\n- 항상 한국어로 응답할 것\n- 결론을 먼저, 근거는 짧게\n- 코드 예시는 반드시 포함할 것\n- 비용 관련 제안 시 반드시 수치 근거 제시"}
              rows={6}
              className="mt-3 w-full rounded-lg border border-chat-border bg-[#1e1f24] px-3 py-2.5 text-xs text-white placeholder-sidebar-muted/60 outline-none focus:border-brand-primary/50 resize-none leading-relaxed"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-sidebar-muted">
                {guidelines.trim() ? `${guidelines.trim().length}자` : '비어 있으면 적용하지 않습니다.'}
              </span>
              <div className="flex items-center gap-2">
                {guidelinesSaved && <span className="text-xs text-emerald-400">저장됨</span>}
                <button
                  onClick={() => { setUserGuidelines(guidelines); setGuidelinesSaved(true); addToast('권고사항을 저장했습니다.', 'success'); }}
                  className="rounded-lg bg-brand-primary/20 px-3 py-1.5 text-xs text-brand-primary hover:bg-brand-primary/30"
                >
                  저장
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-lg bg-[#222529] p-5">
            <h2 className="text-sm font-semibold text-white">에이전트별 기본 AI</h2>
            <p className="mt-1 text-xs text-sidebar-muted">
              Commander와 Worker마다 사용할 AI 서비스를 따로 지정합니다.
            </p>

            <div className="mt-4 space-y-2">
              {agents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-3 border-b border-chat-border/50 py-2 last:border-0">
                  <span className="text-base">{agent.emoji}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{agent.name}</span>
                  <select
                    value={agentProviders[agent.id] ?? 'kimi'}
                    onChange={(e) => handleAgentProviderChange(agent.id, e.target.value as AIProviderId)}
                    className="rounded-lg border border-chat-border bg-[#1e1f24] px-2 py-1.5 text-xs text-white outline-none focus:border-brand-primary/50"
                  >
                    {PROVIDERS.filter((p) => connected[p.id]).length > 0 ? (
                      PROVIDERS.filter((p) => connected[p.id]).map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>연결된 AI가 없습니다</option>
                    )}
                  </select>
                </div>
              ))}
            </div>
          </section>

          {/* ── TTS 설정 ──────────────────────────────────────────── */}
          <section className="rounded-lg bg-[#222529] p-5">
            <h2 className="text-sm font-semibold text-white">🔊 음성 설정 (Edge Neural TTS)</h2>
            <p className="mt-1 text-xs text-sidebar-muted">
              Microsoft Edge Neural TTS — API 키 없이 자연스러운 한국어 음성을 사용합니다. 에이전트 답변을 자동으로 읽어줍니다.
            </p>

            <div className="mt-4 space-y-4">
              {/* 음성 선택 */}
              <div>
                <label className="block text-xs font-semibold text-sidebar-text mb-2">음성 선택</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {KOREAN_VOICES.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setTtsVoiceState(v.id);
                        localStorage.setItem('ao2-tts-voice', v.id);
                      }}
                      className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        ttsVoice === v.id
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                          : 'border-chat-border text-sidebar-text hover:bg-sidebar-hover'
                      }`}
                    >
                      <span className="block font-semibold">{v.gender === 'Female' ? '👩' : '👨'} {v.name}</span>
                      <span className="text-sidebar-muted">{v.id}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 속도 / 피치 */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-sidebar-text mb-1">
                    속도 ({ttsRate >= 0 ? '+' : ''}{ttsRate}%)
                  </label>
                  <input
                    type="range" min="-50" max="100" step="5"
                    value={ttsRate}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTtsRateState(v);
                      localStorage.setItem('ao2-tts-rate', String(v));
                    }}
                    className="w-full accent-brand-primary"
                  />
                  <div className="flex justify-between text-xs text-sidebar-muted mt-0.5">
                    <span>느림</span><span>보통</span><span>빠름</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-sidebar-text mb-1">
                    음높이 ({ttsPitch >= 0 ? '+' : ''}{ttsPitch}%)
                  </label>
                  <input
                    type="range" min="-20" max="20" step="5"
                    value={ttsPitch}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTtsPitchState(v);
                      localStorage.setItem('ao2-tts-pitch', String(v));
                    }}
                    className="w-full accent-brand-primary"
                  />
                  <div className="flex justify-between text-xs text-sidebar-muted mt-0.5">
                    <span>낮음</span><span>보통</span><span>높음</span>
                  </div>
                </div>
              </div>

              {/* 미리듣기 */}
              <div>
                <label className="block text-xs font-semibold text-sidebar-text mb-1">미리듣기 텍스트</label>
                <div className="flex gap-2">
                  <input
                    value={ttsPreviewText}
                    onChange={(e) => setTtsPreviewText(e.target.value)}
                    className="flex-1 rounded-lg border border-chat-border bg-[#15171a] px-3 py-2 text-xs text-white outline-none placeholder-sidebar-muted focus:border-brand-primary/50"
                    placeholder="미리 들을 문장을 입력하세요"
                  />
                  <button
                    disabled={ttsPreviewing}
                    onClick={async () => {
                      if (ttsPreviewing) { stopSpeech(); setTtsPreviewing(false); return; }
                      setTtsPreviewing(true);
                      try {
                        await speak(ttsPreviewText, { voice: ttsVoice, ratePct: ttsRate, pitchPct: ttsPitch });
                      } finally {
                        setTtsPreviewing(false);
                      }
                    }}
                    className={`flex-shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                      ttsPreviewing
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-brand-primary text-white hover:bg-blue-700'
                    }`}
                  >
                    {ttsPreviewing ? '⏹ 중지' : '▶ 미리듣기'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg bg-[#222529] p-5">
            <h2 className="text-sm font-semibold text-white">에이전트 프리셋</h2>
            <p className="mt-1 text-xs text-sidebar-muted">
              에이전트별 응답 성향과 추가 지시를 저장합니다.
            </p>
            <div className="mt-4 space-y-3">
              {agents.map((agent) => {
                const preset = agentPresets[agent.id] ?? getAgentPreset(agent.id);

                return (
                  <div key={agent.id} className="rounded-lg border border-chat-border bg-[#1e1f24] p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-base">{agent.emoji}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{agent.name}</span>
                      <button
                        onClick={() => {
                          const providerId = agentProviders[agent.id];
                          saveVersion(agent.id, {
                            presetMode: preset.mode,
                            systemNote: preset.systemNote ?? '',
                            provider: providerId,
                            model: providerId ? models[providerId] : undefined,
                            systemPrompt: agent.systemPrompt,
                          });
                          addToast(`${agent.name} 설정 버전을 저장했습니다.`, 'success');
                          if (selectedAgentForVersions === agent.id) {
                            setAgentVersions(getVersions(agent.id));
                          }
                        }}
                        className="text-xs text-brand-primary hover:text-blue-400 px-2 py-1 rounded"
                      >
                        버전 저장
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                      <select
                        value={preset.mode}
                        onChange={(event) => updateAgentPreset(agent.id, { mode: event.target.value as AgentPresetMode })}
                        className="rounded-lg border border-chat-border bg-[#15171a] px-2 py-2 text-xs text-white outline-none focus:border-brand-primary/50"
                      >
                        <option value="balanced">Balanced</option>
                        <option value="fast">Fast</option>
                        <option value="deep">Deep review</option>
                        <option value="cheap">Low cost</option>
                      </select>
                      <input
                        value={preset.systemNote ?? ''}
                        onChange={(event) => updateAgentPreset(agent.id, { systemNote: event.target.value })}
                        placeholder="이 에이전트에게만 적용할 추가 지시"
                        className="rounded-lg border border-chat-border bg-[#15171a] px-3 py-2 text-xs text-white outline-none placeholder-sidebar-muted focus:border-brand-primary/50"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── US-005: 설정 버전 히스토리 ──────────────────────── */}
          <section className="rounded-lg bg-[#222529] p-5">
            <h2 className="text-sm font-semibold text-white">⏱ 설정 버전 히스토리</h2>
            <p className="mt-1 text-xs text-sidebar-muted">에이전트 설정을 이전 버전으로 롤백합니다. 최대 10개 버전 보관.</p>
            <div className="mt-3">
              <select
                value={selectedAgentForVersions}
                onChange={(e) => {
                  setSelectedAgentForVersions(e.target.value);
                  setAgentVersions(e.target.value ? getVersions(e.target.value) : []);
                }}
                className="w-full rounded-lg border border-chat-border bg-[#1e1f24] px-3 py-2 text-xs text-white outline-none focus:border-brand-primary/50"
              >
                <option value="">에이전트 선택...</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
              </select>
              {agentVersions.length > 0 && (
                <div className="mt-3 space-y-2">
                  {agentVersions.map((ver) => (
                    <div key={ver.id} className="flex items-center gap-2 rounded-lg border border-chat-border bg-[#1e1f24] px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{ver.label}</p>
                        <p className="text-xs text-sidebar-muted">{new Date(ver.savedAt).toLocaleString('ko-KR')}</p>
                        {ver.config.presetMode && <p className="text-xs text-sidebar-muted">모드: {ver.config.presetMode}</p>}
                      </div>
                      <button
                        onClick={() => {
                          const v = rollbackToVersion(ver.id);
                          if (v) {
                            if (v.config.presetMode) {
                              updateAgentPreset(v.agentId, { mode: v.config.presetMode as AgentPresetMode, systemNote: v.config.systemNote });
                            }
                            if (v.config.provider) {
                              handleAgentProviderChange(v.agentId, v.config.provider as AIProviderId);
                            }
                            if (v.config.model && v.config.provider) {
                              handleModelChange(v.config.provider as AIProviderId, v.config.model);
                            }
                            // 롤백 이벤트를 새 버전으로 기록
                            saveVersion(v.agentId, v.config, `롤백 → ${ver.label}`);
                            setAgentVersions(getVersions(selectedAgentForVersions));
                            addToast(`${v.agentId} 설정을 롤백했습니다.`, 'success');
                          }
                        }}
                        className="text-xs text-brand-primary hover:text-blue-400 px-2 py-1 rounded border border-brand-primary/30 flex-shrink-0"
                      >
                        롤백
                      </button>
                      <button
                        onClick={() => { deleteVersion(ver.id); setAgentVersions(getVersions(selectedAgentForVersions)); }}
                        className="text-xs text-red-400 hover:text-red-300 flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {selectedAgentForVersions && agentVersions.length === 0 && (
                <p className="mt-3 text-xs text-sidebar-muted">저장된 버전이 없습니다. 프리셋 섹션에서 "버전 저장"을 클릭하세요.</p>
              )}
            </div>
          </section>

          {/* ── US-004: 실행 전 승인 게이트 ─────────────────────── */}
          <section className="rounded-lg bg-[#222529] p-5">
            <h2 className="text-sm font-semibold text-white">🛡 실행 전 승인 게이트</h2>
            <p className="mt-1 text-xs text-sidebar-muted">지정된 에이전트·도구·비용 임계값을 넘으면 실행 전 사용자 승인이 필요합니다.</p>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-2 text-sm text-sidebar-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={gate.enabled}
                  onChange={(e) => { const g = { ...gate, enabled: e.target.checked }; setGateState(g); saveApprovalGate(g); }}
                />
                승인 게이트 활성화
              </label>
              <div>
                <label className="block text-xs text-sidebar-muted mb-1">대상 에이전트 ID (쉼표 구분, 비우면 전체)</label>
                <input
                  value={gateAgentInput}
                  onChange={(e) => setGateAgentInput(e.target.value)}
                  placeholder="ceo, coo, researcher ..."
                  className="w-full rounded-lg border border-chat-border bg-[#1e1f24] px-3 py-2 text-xs text-white outline-none focus:border-brand-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs text-sidebar-muted mb-1">차단 도구 패턴 (정규식 가능, 쉼표 구분)</label>
                <input
                  value={gateToolInput}
                  onChange={(e) => setGateToolInput(e.target.value)}
                  placeholder="write_file, delete.*, ..."
                  className="w-full rounded-lg border border-chat-border bg-[#1e1f24] px-3 py-2 text-xs text-white outline-none focus:border-brand-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs text-sidebar-muted mb-1">비용 임계값 (USD, 초과 시 승인 필요)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={gate.costThresholdUsd}
                  onChange={(e) => setGateState({ ...gate, costThresholdUsd: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-chat-border bg-[#1e1f24] px-3 py-2 text-xs text-white outline-none focus:border-brand-primary/50"
                />
              </div>
              <button
                onClick={() => {
                  const updated: ApprovalGate = {
                    ...gate,
                    agentIds: gateAgentInput.split(',').map((s) => s.trim()).filter(Boolean),
                    toolPatterns: gateToolInput.split(',').map((s) => s.trim()).filter(Boolean),
                  };
                  setGateState(updated);
                  saveApprovalGate(updated);
                  addToast('승인 게이트 설정을 저장했습니다.', 'success');
                }}
                className="btn-primary text-xs"
              >
                저장
              </button>
            </div>
          </section>

          {/* ── US-006: 회사 구조 내보내기/가져오기 ─────────────── */}
          <section className="rounded-lg bg-[#222529] p-5">
            <h2 className="text-sm font-semibold text-white">📦 회사 구조 내보내기 / 가져오기</h2>
            <p className="mt-1 text-xs text-sidebar-muted">워크플로우, 예산, 스케줄, 승인 게이트를 JSON으로 내보내거나 가져옵니다. API 키 등 민감 정보는 자동으로 제거됩니다.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => {
                  const json = exportCompany();
                  downloadJson(`aioffice2-export-${new Date().toISOString().slice(0, 10)}.json`, json);
                  addToast('회사 구조를 내보냈습니다.', 'success');
                }}
                className="btn-primary text-xs"
              >
                ↓ 내보내기 (JSON 다운로드)
              </button>
              <label className="cursor-pointer">
                <span className="rounded-lg bg-sidebar-hover px-3 py-2 text-xs text-white hover:bg-[#3a3b40] cursor-pointer">
                  ↑ 가져오기 (JSON 업로드)
                </span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const text = ev.target?.result as string;
                      const result = importCompany(text);
                      if (result.ok) {
                        addToast(`가져오기 완료: 워크플로우 ${result.workflowCount}개, 예약 ${result.jobCount}개, 예산 ${result.budgetCount}개`, 'success');
                      } else {
                        addToast(`가져오기 실패: ${result.errors.join(', ')}`, 'error');
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
