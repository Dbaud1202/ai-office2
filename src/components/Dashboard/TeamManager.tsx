import React, { useState } from 'react';
import { useAgents } from '../../contexts/AgentContext.js';
import type { AgentTier } from '../../types/index.js';
import AgentAvatar from '../UI/AgentAvatar.js';

const COLORS = ['bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-pink-600', 'bg-orange-600', 'bg-cyan-600'];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '') || `agent-${Date.now()}`;
}

export default function TeamManager() {
  const { agents, addAgent, updateAgentProfile, removeAgent } = useAgents();
  const [form, setForm] = useState({
    name: '',
    role: '',
    tier: 'worker' as AgentTier,
    emoji: '🧑‍💼',
    avatarUrl: '',
    description: '',
    systemPrompt: '',
  });

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function setFormAvatar(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const avatarUrl = await fileToDataUrl(file);
    setForm((prev) => ({ ...prev, avatarUrl }));
  }

  async function setAgentAvatar(agentId: string, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    updateAgentProfile(agentId, { avatarUrl: await fileToDataUrl(file) });
  }

  function addTeamMember() {
    if (!form.name.trim() || !form.role.trim()) return;
    const id = slug(form.name);
    const color = COLORS[agents.length % COLORS.length];
    addAgent({
      id,
      name: form.name.trim(),
      role: form.role.trim(),
      tier: form.tier,
      emoji: form.emoji.trim() || '🧑‍💼',
      avatarUrl: form.avatarUrl.trim() || undefined,
      color,
      textColor: 'text-white',
      description: form.description.trim() || `${form.role.trim()} 역할을 담당합니다.`,
      systemPrompt: form.systemPrompt.trim() || `당신은 AI 오피스의 ${form.role.trim()}입니다. 이름은 "${form.name.trim()}"입니다. 사용자의 목표에 맞춰 전문적으로 판단하고 한국어로 응답하세요.`,
      canDelegate: form.tier === 'commander' ? ['developer', 'researcher', 'writer', 'analyst'] : undefined,
      isCustom: true,
    });
    setForm({ name: '', role: '', tier: 'worker', emoji: '🧑‍💼', avatarUrl: '', description: '', systemPrompt: '' });
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">👥 팀원 관리</span>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[360px_1fr]">
          <section className="panel-card h-fit">
            <h2 className="text-sm font-semibold text-white">새 팀원 추가</h2>
            <div className="mt-4 space-y-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="이름" className="message-input" />
              <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="역할 예: Finance Manager" className="message-input" />
              <div className="grid grid-cols-[80px_1fr] gap-2">
                <input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} className="message-input text-center" />
                <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as AgentTier })} className="message-input">
                  <option value="worker">Worker</option>
                  <option value="commander">Commander</option>
                </select>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-chat-border bg-chat-input p-2">
                <AgentAvatar agent={{ name: form.name || '새 팀원', emoji: form.emoji, avatarUrl: form.avatarUrl, color: COLORS[agents.length % COLORS.length] }} className="h-12 w-12 rounded-lg flex items-center justify-center text-xl object-cover flex-shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <input value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="프로필 사진 URL" className="message-input py-2" />
                  <label className="inline-flex cursor-pointer rounded bg-sidebar-hover px-2 py-1 text-xs text-sidebar-text hover:text-white">
                    사진 선택
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => { void setFormAvatar(event.target.files); event.currentTarget.value = ''; }} />
                  </label>
                </div>
              </div>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="설명" className="message-input" />
              <textarea value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} rows={6} placeholder="시스템 프롬프트 (비우면 자동 생성)" className="message-input" />
              <button onClick={addTeamMember} disabled={!form.name.trim() || !form.role.trim()} className="btn-primary w-full">팀원 추가</button>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <div key={agent.id} className="panel-card">
                <div className="mb-3 flex items-start gap-3">
                  <AgentAvatar agent={agent} className="h-10 w-10 rounded-lg flex items-center justify-center text-xl object-cover flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{agent.name}</p>
                    <p className="truncate text-xs text-sidebar-muted">{agent.role}</p>
                  </div>
                  <span className={agent.tier === 'commander' ? 'badge-commander' : 'badge-worker'}>{agent.tier}</span>
                </div>
                <p className="min-h-12 text-xs leading-relaxed text-sidebar-muted">{agent.description}</p>
                <div className="mt-3 grid grid-cols-[64px_1fr] gap-2">
                  <input
                    value={agent.emoji}
                    onChange={(event) => updateAgentProfile(agent.id, { emoji: event.target.value })}
                    className="message-input px-2 py-2 text-center"
                    title="프로필 이모지"
                  />
                  <input
                    value={agent.avatarUrl ?? ''}
                    onChange={(event) => updateAgentProfile(agent.id, { avatarUrl: event.target.value || undefined })}
                    className="message-input px-3 py-2"
                    placeholder="사진 URL"
                    title="프로필 사진 URL"
                  />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="cursor-pointer rounded-lg bg-sidebar-hover px-3 py-1.5 text-xs text-sidebar-text hover:text-white">
                    사진 선택
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => { void setAgentAvatar(agent.id, event.target.files); event.currentTarget.value = ''; }} />
                  </label>
                  {agent.avatarUrl && (
                    <button onClick={() => updateAgentProfile(agent.id, { avatarUrl: undefined })} className="rounded-lg bg-sidebar-hover px-3 py-1.5 text-xs text-sidebar-muted hover:text-white">
                      사진 제거
                    </button>
                  )}
                </div>
                {agent.isCustom && (
                  <button onClick={() => removeAgent(agent.id)} className="mt-4 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20">
                    삭제
                  </button>
                )}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
