import React from 'react';
import { useAgents } from '../../contexts/AgentContext.js';
import { COMMANDERS, WORKERS } from '../../data/agents.js';

function AgentCard({ agentId, compact = false }: { agentId: string; compact?: boolean }) {
  const { agents } = useAgents();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return null;

  const statusColor = agent.status === 'working' ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400';
  const statusText = agent.status === 'working' ? '작업 중' : '대기 중';

  if (compact) {
    return (
      <div className={`flex items-center gap-2 bg-chat-bg rounded-xl px-3 py-2.5 border border-chat-border w-44`}>
        <div className={`w-8 h-8 ${agent.color} rounded-lg flex items-center justify-center text-lg flex-shrink-0`}>
          {agent.emoji}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white truncate">{agent.name}</p>
          <p className="text-xs text-sidebar-muted truncate">{agent.role}</p>
        </div>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColor}`} />
      </div>
    );
  }

  return (
    <div className="bg-[#222529] rounded-2xl p-4 border border-chat-border w-52 flex flex-col items-center gap-2">
      <div className={`w-14 h-14 ${agent.color} rounded-2xl flex items-center justify-center text-3xl`}>
        {agent.emoji}
      </div>
      <div className="text-center">
        <p className="text-sm font-bold text-white">{agent.name}</p>
        <p className="text-xs text-sidebar-muted">{agent.role}</p>
        <span className={`inline-flex items-center gap-1 mt-1 text-xs ${agent.tier === 'commander' ? 'badge-commander' : 'badge-worker'}`}>
          {agent.tier === 'commander' ? 'Commander' : 'Worker'}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-sidebar-muted">
        <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
        {statusText}
      </div>
      <p className="text-xs text-sidebar-muted text-center line-clamp-2">{agent.description}</p>
    </div>
  );
}

function ConnectorLine({ vertical = false }: { vertical?: boolean }) {
  return vertical
    ? <div className="w-px h-6 bg-chat-border mx-auto" />
    : <div className="h-px flex-1 bg-chat-border" />;
}

export default function OrgChart() {
  const { agents } = useAgents();

  const totalWorking = agents.filter((a) => a.status === 'working').length;
  const totalIdle = agents.filter((a) => a.status === 'idle').length;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">🏢 조직도</span>
        <div className="no-drag flex items-center gap-3 ml-auto text-xs text-sidebar-muted">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />{totalWorking}명 작업 중</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />{totalIdle}명 대기 중</span>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <div className="min-w-max mx-auto">
          {/* Company header */}
          <div className="flex justify-center mb-6">
            <div className="bg-brand-primary rounded-2xl px-8 py-3 text-center">
              <p className="text-white font-bold text-lg">AI 오피스2</p>
              <p className="text-blue-200 text-xs">AI-Powered Virtual Office</p>
            </div>
          </div>

          <ConnectorLine vertical />

          {/* Commanders */}
          <div className="relative">
            <div className="text-center mb-2">
              <span className="text-xs font-semibold text-sidebar-muted uppercase tracking-wider px-3 py-1 bg-[#222529] rounded-full border border-chat-border">
                Commander 팀 — 전략 & 위임
              </span>
            </div>

            {/* Horizontal line spanning commanders */}
            <div className="flex justify-center mb-4">
              <div className="flex items-center gap-0">
                {COMMANDERS.map((_, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <div className="h-px w-52 bg-chat-border" />}
                    <div className="w-px h-4 bg-chat-border" />
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="flex gap-6 justify-center">
              {COMMANDERS.map((a) => <AgentCard key={a.id} agentId={a.id} />)}
            </div>
          </div>

          {/* Delegation arrows */}
          <div className="flex justify-center my-4">
            <div className="flex flex-col items-center gap-1">
              <div className="w-px h-4 bg-chat-border" />
              <div className="text-xs text-sidebar-muted bg-[#222529] px-3 py-1 rounded-full border border-chat-border flex items-center gap-1.5">
                <span>⬇</span> 위임 / 보고
              </div>
              <div className="w-px h-4 bg-chat-border" />
            </div>
          </div>

          {/* Workers */}
          <div className="relative">
            <div className="text-center mb-2">
              <span className="text-xs font-semibold text-sidebar-muted uppercase tracking-wider px-3 py-1 bg-[#222529] rounded-full border border-chat-border">
                Worker 팀 — 실행 & 전문
              </span>
            </div>
            <div className="flex justify-center mb-4">
              <div className="flex items-center gap-0">
                {WORKERS.map((_, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <div className="h-px w-48 bg-chat-border" />}
                    <div className="w-px h-4 bg-chat-border" />
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className="flex gap-6 justify-center">
              {WORKERS.map((a) => <AgentCard key={a.id} agentId={a.id} />)}
            </div>
          </div>

          {/* Legend */}
          <div className="flex justify-center mt-10">
            <div className="bg-[#222529] rounded-xl p-4 border border-chat-border flex gap-8 text-xs">
              <div className="flex items-center gap-2">
                <span className="badge-commander">Commander</span>
                <span className="text-sidebar-muted">전략 수립 · 위임 · 보고 수신</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge-worker">Worker</span>
                <span className="text-sidebar-muted">지시 수행 · 전문 실행</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
