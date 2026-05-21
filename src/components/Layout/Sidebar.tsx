import React, { useEffect, useState } from 'react';
import { useAgents } from '../../contexts/AgentContext.js';
import { ALL_CHANNEL_ID, MEETING_CHANNEL_ID, WORK_CHANNEL_ID, useChat } from '../../contexts/ChatContext.js';
import type { ViewMode } from '../../types/index.js';
import AgentAvatar from '../UI/AgentAvatar.js';
import { startHeartbeat, stopAllHeartbeats, isAgentLive, getAllHeartbeatStates } from '../../utils/heartbeatEngine.js';

interface SidebarProps {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  onOpenPipeline: () => void;
}

const NAV_TOOLS: { id: ViewMode; icon: string; label: string }[] = [
  { id: 'webview', icon: '🌐', label: 'AI 서비스' },
  { id: 'usage', icon: '📊', label: '사용량 대시보드' },
  { id: 'timeline', icon: '🧭', label: '실행 타임라인' },
  { id: 'workflow', icon: '🔁', label: '워크플로우' },
  { id: 'scheduler', icon: '⏰', label: '스케줄러' },
  { id: 'operations', icon: '🕹️', label: '운영 센터' },
  { id: 'team', icon: '👥', label: '팀 관리' },
  { id: 'toolmanager', icon: '🔧', label: '도구 관리자' },
  { id: 'vault', icon: '📚', label: 'Vault 탐색기' },
  { id: 'tasks', icon: '✅', label: '태스크 보드' },
  { id: 'budget', icon: '💰', label: '예산 관리' },
  { id: 'issues', icon: '⚠️', label: '이슈 트래커' },
  { id: 'audit', icon: '📜', label: '감사 로그' },
  { id: 'orgchart', icon: '🏢', label: '조직도' },
];

export default function Sidebar({ view, onViewChange, onOpenPipeline }: SidebarProps) {
  const { agents } = useAgents();
  const { channels, activeChannelId, setActiveChannel } = useChat();
  const [cmdExpanded, setCmdExpanded] = useState(true);
  const [wrkExpanded, setWrkExpanded] = useState(true);
  const [heartbeatStates, setHeartbeatStates] = useState(() => getAllHeartbeatStates());

  useEffect(() => {
    agents.forEach((agent) => startHeartbeat(agent.id, 30_000));
    const timer = setInterval(() => setHeartbeatStates(getAllHeartbeatStates()), 10_000);
    return () => {
      clearInterval(timer);
      stopAllHeartbeats();
    };
  }, [agents]);

  function getChannel(agentId: string) {
    return channels.find((channel) => channel.agentId === agentId);
  }

  function handleChannelClick(agentId: string) {
    const channel = getChannel(agentId);
    if (!channel) return;
    setActiveChannel(channel.id);
    onViewChange('chat');
  }

  function isActiveChannel(agentId: string) {
    const channel = getChannel(agentId);
    return view === 'chat' && channel?.id === activeChannelId;
  }

  function openFixedChannel(channelId: string) {
    setActiveChannel(channelId);
    onViewChange('chat');
  }

  function renderAgent(agent: typeof agents[number]) {
    const liveAgent = agents.find((item) => item.id === agent.id) ?? agent;
    const channel = getChannel(agent.id);
    const hbState = heartbeatStates[agent.id];
    const live = hbState ? isAgentLive(agent.id) : false;
    const hbStatus = hbState?.status ?? liveAgent.status;
    const heartbeatDotCls = hbState
      ? live && hbStatus === 'working'
        ? 'bg-yellow-400 animate-pulse'
        : live
          ? 'bg-emerald-400'
          : 'bg-gray-600'
      : hbStatus === 'working'
        ? 'bg-yellow-400 animate-pulse'
        : hbStatus === 'idle'
          ? 'bg-emerald-400'
          : 'bg-gray-600';
    return (
      <button
        key={agent.id}
        onClick={() => handleChannelClick(agent.id)}
        className={`sidebar-item w-full text-left ${isActiveChannel(agent.id) ? 'active' : ''}`}
      >
        <AgentAvatar agent={agent} className="h-5 w-5 rounded object-cover flex items-center justify-center text-sm leading-none flex-shrink-0" />
        <span className="flex-1 truncate">{agent.name}</span>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${heartbeatDotCls}`} title={hbState ? `하트비트 ${hbState.heartbeatCount}회` : '하트비트 없음'} />
        {channel && channel.unreadCount > 0 && (
          <span className="bg-brand-primary text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            {channel.unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside className="w-64 flex-shrink-0 bg-sidebar-bg flex flex-col select-none border-r border-[#2c2d30]">
      <div className="drag-region h-10 flex items-center px-4 border-b border-[#2c2d30] flex-shrink-0">
        <button
          onClick={() => onViewChange('chat')}
          className="no-drag flex items-center gap-2 cursor-pointer hover:bg-sidebar-hover px-2 py-1 rounded flex-1 min-w-0 text-left"
        >
          <div className="w-6 h-6 bg-brand-primary rounded flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            AI
          </div>
          <span className="font-semibold text-white text-sm truncate">AI 오피스2</span>
        </button>
        <div className="no-drag flex gap-1.5 ml-2 flex-shrink-0">
          <button title="Minimize" onClick={() => (window as any).electronAPI?.minimize()} className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400" />
          <button title="Maximize" onClick={() => (window as any).electronAPI?.maximize()} className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400" />
          <button title="Close" onClick={() => (window as any).electronAPI?.close()} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        <section>
          <button onClick={() => openFixedChannel(ALL_CHANNEL_ID)} className={`sidebar-item w-full text-left ${view === 'chat' && activeChannelId === ALL_CHANNEL_ID ? 'active' : ''}`}>
            <span className="text-base leading-none">#</span>
            <span className="flex-1 truncate">전체 대화</span>
          </button>
          <button onClick={() => openFixedChannel(MEETING_CHANNEL_ID)} className={`sidebar-item w-full text-left ${view === 'chat' && activeChannelId === MEETING_CHANNEL_ID ? 'active' : ''}`}>
            <span className="text-base leading-none">💬</span>
            <span className="flex-1 truncate">회의 대화</span>
          </button>
          <button onClick={() => openFixedChannel(WORK_CHANNEL_ID)} className={`sidebar-item w-full text-left ${view === 'chat' && activeChannelId === WORK_CHANNEL_ID ? 'active' : ''}`}>
            <span className="text-base leading-none">⚙️</span>
            <span className="flex-1 truncate">업무 대화</span>
          </button>
        </section>

        <section>
          <button
            onClick={() => setCmdExpanded((value) => !value)}
            className="flex items-center gap-1 px-3 py-1 w-full text-xs font-semibold text-sidebar-muted uppercase tracking-wider hover:text-sidebar-text"
          >
            <span className="text-xs">{cmdExpanded ? '▾' : '▸'}</span>
            Commander 팀
          </button>
          {cmdExpanded && agents.filter((agent) => agent.tier === 'commander').map(renderAgent)}
        </section>

        <section>
          <button
            onClick={() => setWrkExpanded((value) => !value)}
            className="flex items-center gap-1 px-3 py-1 w-full text-xs font-semibold text-sidebar-muted uppercase tracking-wider hover:text-sidebar-text"
          >
            <span className="text-xs">{wrkExpanded ? '▾' : '▸'}</span>
            Worker 팀
          </button>
          {wrkExpanded && agents.filter((agent) => agent.tier === 'worker').map(renderAgent)}
        </section>

        <div className="border-t border-[#2c2d30] mx-3" />

        <section>
          <p className="px-3 py-1 text-xs font-semibold text-sidebar-muted uppercase tracking-wider">
            도구
          </p>
          {NAV_TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => onViewChange(tool.id)}
              className={`sidebar-item w-full text-left ${view === tool.id ? 'active' : ''}`}
            >
              <span className="text-base leading-none">{tool.icon}</span>
              <span className="truncate">{tool.label}</span>
            </button>
          ))}
        </section>
      </nav>

      <div className="border-t border-[#2c2d30] p-2 space-y-1">
        <button onClick={onOpenPipeline} className="sidebar-item w-full text-left text-yellow-400 hover:text-yellow-300">
          <span>▶</span>
          <span>파이프라인</span>
        </button>
        <button onClick={() => onViewChange('settings')} className={`sidebar-item w-full text-left ${view === 'settings' ? 'active' : ''}`}>
          <span>⚙️</span>
          <span>설정</span>
        </button>
      </div>
    </aside>
  );
}
