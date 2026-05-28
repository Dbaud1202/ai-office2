import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Agent, Channel, ChatMessage, PipelineStep } from '../types/index.js';
import { DEFAULT_AGENTS } from '../data/agents.js';
import { useAgents } from './AgentContext.js';
import { useAuth } from './AuthContext.js';
import { useToast } from './ToastContext.js';
import { appendAuditLog } from '../components/Dashboard/AuditLog.js';
import { supabase } from '../utils/supabase.js';
import { loadRelatedVaultMemory, saveAgentMemoryToVault } from '../utils/vaultMemory.js';
import { recordUsage } from '../utils/usageTracker.js';
import { checkBudgetGuard } from '../utils/budgetGuard.js';
import { getAgentPreset, presetInstruction } from '../utils/agentPresets.js';
import { createTaskFromAgentWork } from '../utils/taskIntake.js';
import { createApproval, loadWorkflowLogs, makeId as makeOpsId, notifyDiscord, saveWorkflowLogs } from '../utils/opsStore.js';
import { buildHarnessRunBrief, classifyHarnessTask, inferHarnessWorkers, shouldDebate } from '../harness/router.js';
import { recordHarnessReflection } from '../harness/reflection.js';
import { recommendHarnessConnectors } from '../harness/connectors.js';
import {
  getAgentProvider,
  getAgentMode,
  getUserGuidelines,
  PROVIDERS,
  getProvider,
  getProviderKey,
  getProviderModel,
  setProviderModel,
  type AIProviderId,
} from '../utils/providers/index.js';

interface ChatContextValue {
  channels: Channel[];
  messages: Record<string, ChatMessage[]>;
  activeChannelId: string;
  setActiveChannel: (id: string) => void;
  sendMessage: (channelId: string, text: string) => Promise<void>;
  rerunMessage: (messageId: string, channelId: string) => Promise<void>;
  runPipeline: (steps: PipelineStep[], goal: string) => Promise<void>;
  stopStreaming: (channelId?: string) => void;
  forceStopChannel: (channelId?: string) => void;
  revertToMessage: (channelId: string, messageId: string) => void;
  isStreaming: boolean;
  isChannelStreaming: (channelId: string) => boolean;
  isPipelineRunning: boolean;
  addSystemMessage: (channelId: string, text: string) => void;
  clearUnread: (channelId: string) => void;
  clearChannelMessages: (channelId: string) => void;
  clearAllMessages: () => void;
  startNewConversation: (channelId: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const STORAGE_KEY = 'ao2-messages-v2';
const HISTORY_KEY = 'ao2-user-history';
const ARCHIVE_KEY = 'ao2-message-archive-v1';
const MAX_HISTORY = 20;
export const ALL_CHANNEL_ID = 'ch-all';
export const MEETING_CHANNEL_ID = 'ch-meeting';
export const WORK_CHANNEL_ID = 'ch-work';
const FIXED_CHANNEL_IDS = new Set([ALL_CHANNEL_ID, MEETING_CHANNEL_ID, WORK_CHANNEL_ID]);

function loadMessages(): Record<string, ChatMessage[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveMessages(msgs: Record<string, ChatMessage[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  } catch {}
}

function saveUserHistory(text: string) {
  try {
    const existing: string[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    const next = [text, ...existing.filter((t) => t !== text)].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {}
}

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function groupMessages(rows: ChatMessage[]): Record<string, ChatMessage[]> {
  return rows.reduce<Record<string, ChatMessage[]>>((acc, msg) => {
    acc[msg.channelId] = [...(acc[msg.channelId] ?? []), msg];
    return acc;
  }, {});
}

export function getUserHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function archiveMessages(label: string, msgs: Record<string, ChatMessage[]>) {
  try {
    const archive = JSON.parse(localStorage.getItem(ARCHIVE_KEY) ?? '[]');
    archive.unshift({ id: makeId(), label, archivedAt: new Date().toISOString(), messages: msgs });
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive.slice(0, 30)));
  } catch {}
}

function inferWorkerIds(text: string): string[] {
  const lower = text.toLowerCase();
  const ids = new Set<string>();

  if (/시장|경쟁|조사|리서치|트렌드|검색|자료|근거/.test(lower)) ids.add('researcher');
  if (/개발|코드|버그|구현|자동화|api|서버|웹|앱|수정|빌드/.test(lower)) ids.add('developer');
  if (/글|문서|보고서|블로그|카피|콘텐츠|README|기획안|정리/.test(lower)) ids.add('writer');
  if (/데이터|지표|분석|kpi|매출|비용|통계|대시보드/.test(lower)) ids.add('analyst');

  if (ids.size === 0) {
    ids.add('researcher');
    ids.add('writer');
  }

  return [...ids];
}

function isLocalAutomationRequest(text: string): boolean {
  return /(컴퓨터|PC|윈도우|로컬|파일|폴더|열어|실행|조작|자동화|명령|PowerShell|파워쉘|터미널|탐색기|Obsidian|옵시디언)/i.test(text);
}

function isSimpleChat(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return /^(안녕|안녕하세요|하이|hi|hello|hey|야|ㅇㅇ|ㅎㅇ)[!.?\s]*$/.test(trimmed) || trimmed.length <= 8;
}

async function saveConversationToVault(label: string, msgs: Record<string, ChatMessage[]>) {
  const electronAPI = (window as any).electronAPI;
  if (!electronAPI?.vaultWrite) return;

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }).replace(':', '-');
  const safeName = label.replace(/[:/\\*?"<>|]/g, '-');
  const filePath = `작업/정리된대화/${date}_${time}_${safeName}.md`;

  const sections = Object.entries(msgs)
    .filter(([, messages]) => messages.length > 0)
    .map(([channelId, messages]) => {
      const header = `# 정리된 대화 — ${label}\n- 날짜: ${now.toLocaleString('ko-KR')}\n- 채널: ${channelId}\n\n---\n\n`;
      const body = messages
        .map((m) => {
          const who = m.role === 'user' ? '**사용자**' : m.role === 'agent' ? `**${m.agentId ?? '에이전트'}**` : '_시스템_';
          return `### ${who}\n${m.content}\n`;
        })
        .join('\n');
      return header + body;
    })
    .join('\n\n---\n\n');

  if (!sections) return;
  await electronAPI.vaultWrite({ path: filePath, content: sections });
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { agents, setAgentStatus, apiKey, model } = useAgents();
  const auth = useAuth();
  const { addToast } = useToast();

  const initialChannels: Channel[] = agents.map((a) => ({
    id: `ch-${a.id}`,
    agentId: a.id,
    name: a.name,
    unreadCount: 0,
  }));
  const fixedChannels: Channel[] = [
    {
      id: ALL_CHANNEL_ID,
      agentId: 'general',
      name: '전체 대화',
      unreadCount: 0,
    },
    {
      id: MEETING_CHANNEL_ID,
      agentId: 'ceo-council',
      name: '회의 대화',
      unreadCount: 0,
    },
    {
      id: WORK_CHANNEL_ID,
      agentId: 'workroom',
      name: '일 대화',
      unreadCount: 0,
    },
  ];

  const [channels, setChannels] = useState<Channel[]>([...fixedChannels, ...initialChannels]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(loadMessages);
  const [activeChannelId, setActiveChannelIdState] = useState(ALL_CHANNEL_ID);
  const [streamingChannels, setStreamingChannels] = useState<Record<string, boolean>>({});
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const streamingRef = useRef<Record<string, boolean>>({});
  const stopRequestedRef = useRef<Record<string, boolean>>({});
  const forceStopVersionRef = useRef<Record<string, number>>({});
  const activeAgentIdsByChannelRef = useRef<Record<string, Set<string>>>({});
  const isStreaming = Object.values(streamingChannels).some(Boolean);

  const stopRuntime = useCallback((channelIds: string[], force: boolean) => {
    const ids = new Set([
      ...channelIds,
      ...Object.keys(streamingRef.current),
      ...Object.keys(activeAgentIdsByChannelRef.current),
    ]);

    for (const id of ids) {
      streamingRef.current[id] = false;
      stopRequestedRef.current[id] = true;
      if (force) {
        forceStopVersionRef.current[id] = (forceStopVersionRef.current[id] ?? 0) + 1;
      }
    }

    setStreamingChannels((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = false;
      return next;
    });

    for (const activeIds of Object.values(activeAgentIdsByChannelRef.current)) {
      for (const agentId of activeIds) {
        setAgentStatus(agentId, 'idle');
      }
      activeIds.clear();
    }

    if (force) {
      for (const agent of agents) {
        setAgentStatus(agent.id, 'idle');
      }
    }

    setIsPipelineRunning(false);
  }, [agents, setAgentStatus]);

  useEffect(() => {
    if (isStreaming || isPipelineRunning) return;
    for (const agent of agents) {
      if (agent.status === 'working') {
        setAgentStatus(agent.id, 'idle');
      }
    }
  }, [agents, isPipelineRunning, isStreaming, setAgentStatus]);

  useEffect(() => {
    setChannels((prev) => {
      const existing = new Set(prev.map((channel) => channel.id));
      const next = [...prev];
      for (const agent of agents) {
        const id = `ch-${agent.id}`;
        if (!existing.has(id)) {
          next.push({ id, agentId: agent.id, name: agent.name, unreadCount: 0 });
        }
      }
      for (const fixed of fixedChannels) {
        if (!existing.has(fixed.id)) next.unshift(fixed);
      }
      return next.filter((channel) => FIXED_CHANNEL_IDS.has(channel.id) || agents.some((agent) => `ch-${agent.id}` === channel.id));
    });
  }, [agents]);

  useEffect(() => {
    if (!supabase || !auth.user) return;

    let cancelled = false;
    async function loadCloudMessages() {
      const { data, error } = await supabase!
        .from('messages')
        .select('id, channel_id, role, agent_id, content, timestamp, tools_used')
        .eq('user_id', auth.user!.id)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (cancelled || error || !data) return;

      const rows = data.reverse().map((row: any): ChatMessage => ({
        id: row.id,
        channelId: row.channel_id,
        role: row.role,
        agentId: row.agent_id ?? undefined,
        content: row.content,
        timestamp: row.timestamp,
        toolsUsed: row.tools_used ?? undefined,
      }));
      const next = groupMessages(rows);
      setMessages(next);
      saveMessages(next);
    }

    loadCloudMessages();
    return () => {
      cancelled = true;
    };
  }, [auth.user]);

  const persistMessage = useCallback(async (msg: ChatMessage) => {
    if (!supabase || !auth.user) return;

    await supabase.from('messages').insert({
      user_id: auth.user.id,
      channel_id: msg.channelId,
      role: msg.role,
      agent_id: msg.agentId ?? null,
      content: msg.content,
      timestamp: msg.timestamp,
      tools_used: msg.toolsUsed ?? [],
      is_streaming: false,
    });
  }, [auth.user]);

  const setActiveChannel = useCallback((id: string) => {
    setActiveChannelIdState(id);
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
  }, []);

  const clearUnread = useCallback((id: string) => {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
  }, []);

  const clearChannelMessages = useCallback((channelId: string) => {
    setMessages((prev) => {
      const existing = prev[channelId] ?? [];
      if (existing.length > 0) {
        archiveMessages(`channel:${channelId}`, { [channelId]: existing });
        void saveConversationToVault(`channel-${channelId}`, { [channelId]: existing });
      }
      const next = { ...prev, [channelId]: [] };
      saveMessages(next);
      return next;
    });
    setChannels((prev) =>
      prev.map((channel) =>
        channel.id === channelId
          ? { ...channel, lastMessage: undefined, lastMessageAt: undefined, unreadCount: 0 }
          : channel
      )
    );
  }, []);

  const clearAllMessages = useCallback(() => {
    stopRuntime(channels.map((channel) => channel.id), true);
    setMessages((prev) => {
      archiveMessages('all', prev);
      void saveConversationToVault('all', prev);
      saveMessages({});
      return {};
    });
    setChannels((prev) => prev.map((channel) => ({ ...channel, lastMessage: undefined, lastMessageAt: undefined, unreadCount: 0 })));
  }, [channels, stopRuntime]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const updated = { ...prev, [msg.channelId]: [...(prev[msg.channelId] ?? []), msg] };
      saveMessages(updated);
      return updated;
    });
    setChannels((prev) =>
      prev.map((c) =>
        c.id === msg.channelId
          ? {
              ...c,
              lastMessage: msg.content.slice(0, 60),
              lastMessageAt: msg.timestamp,
              unreadCount:
                c.id !== activeChannelId && msg.role !== 'user'
                  ? c.unreadCount + 1
                  : c.unreadCount,
            }
          : c
      )
    );
  }, [activeChannelId]);

  const addSystemMessage = useCallback((channelId: string, text: string) => {
    addMessage({
      id: makeId(),
      channelId,
      role: 'system',
      content: text,
      timestamp: new Date().toISOString(),
    });
  }, [addMessage]);

  const startNewConversation = useCallback((channelId: string) => {
    clearChannelMessages(channelId);
    addSystemMessage(channelId, '새 대화를 시작했습니다. 이전 대화는 로컬 아카이브에 보관했습니다.');
  }, [addSystemMessage, clearChannelMessages]);

  const isChannelStreaming = useCallback((channelId: string) => Boolean(streamingRef.current[channelId]), []);

  const stopStreaming = useCallback((channelId = activeChannelId) => {
    stopRuntime([channelId], false);
  }, [activeChannelId, stopRuntime]);

  const forceStopChannel = useCallback((channelId = activeChannelId) => {
    stopRuntime(channels.map((channel) => channel.id).concat(channelId), true);
    setMessages((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).map(([id, list]) => [
          id,
          list.map((message) =>
            message.isStreaming
              ? {
                  ...message,
                  content: message.content.trim() || '강제 중단했습니다.',
                  isStreaming: false,
                }
              : message
          ),
        ])
      ) as Record<string, ChatMessage[]>;
      saveMessages(next);
      return next;
    });
    setChannels((prev) =>
      prev.map((channel) =>
        channel.id === channelId
          ? { ...channel, lastMessage: '강제 중단했습니다.', lastMessageAt: new Date().toISOString() }
          : channel
      )
    );
    addToast('현재 대화 작업을 강제 중단했습니다.', 'info');
  }, [activeChannelId, addToast, channels, stopRuntime]);

  const revertToMessage = useCallback((channelId: string, messageId: string) => {
    setMessages((prev) => {
      const list = prev[channelId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx < 0) return prev;
      const next = { ...prev, [channelId]: list.slice(0, idx + 1) };
      saveMessages(next);
      return next;
    });
  }, []);

  const updateStreamingMessage = useCallback((channelId: string, id: string, text: string) => {
    setMessages((prev) => {
      const list = prev[channelId] ?? [];
      return {
        ...prev,
        [channelId]: list.map((m) => (m.id === id ? { ...m, content: text, isStreaming: true } : m)),
      };
    });
  }, []);

  const finalizeStreamingMessage = useCallback((channelId: string, id: string, finalText: string) => {
    setMessages((prev) => {
      const list = prev[channelId] ?? [];
      const updated = list.map((m) => (m.id === id ? { ...m, content: finalText, isStreaming: false } : m));
      const next = { ...prev, [channelId]: updated };
      saveMessages(next);
      return next;
    });
  }, []);

  const callAgent = useCallback(
    async (agent: Agent, channelId: string, history: ChatMessage[], userText: string) => {
      const forceStopVersion = forceStopVersionRef.current[channelId] ?? 0;
      const isElectron = typeof window !== 'undefined' && (window as any).electronAPI;
      let providerId = (getAgentProvider(agent.id) ?? 'kimi') as AIProviderId;
      let provider = getProvider(providerId);
      let providerKey = getProviderKey(providerId) || (providerId === 'claude' ? apiKey : '');
      const claudeKey = getProviderKey('claude') || apiKey;
      if (!providerKey) {
        const fallback = PROVIDERS.find((item) => getProviderKey(item.id) || (item.id === 'claude' && apiKey));
        if (fallback) {
          providerId = fallback.id;
          provider = fallback;
          providerKey = getProviderKey(fallback.id) || (fallback.id === 'claude' ? apiKey : '');
        }
      }

      const isAutoMode = getAgentMode() !== 'careful';
      // Electron + 자율 모드 + Claude 키 있을 때: 로컬 자동화 요청은 Claude IPC로
      if (isElectron && claudeKey && isLocalAutomationRequest(userText)) {
        providerId = 'claude';
        provider = getProvider(providerId);
        providerKey = claudeKey;
      }

      if (!provider || !providerKey) {
        const connectedProviders = PROVIDERS.filter(
          (p) => getProviderKey(p.id) || (p.id === 'claude' && apiKey)
        ).map((p) => p.name);
        addSystemMessage(
          channelId,
          connectedProviders.length === 0
            ? '⚠️ 연결된 AI 프로바이더가 없습니다. Settings → AI 프로바이더 탭에서 Claude, Kimi, OpenRouter 등의 API 키를 등록하세요.'
            : `⚠️ ${provider?.name ?? providerId} API 키가 없습니다. Settings에서 연결하거나, 연결된 프로바이더(${connectedProviders.join(', ')})로 에이전트 프로바이더를 변경하세요.`
        );
        return '';
      }

      setAgentStatus(agent.id, 'working');
      activeAgentIdsByChannelRef.current[channelId] ??= new Set<string>();
      activeAgentIdsByChannelRef.current[channelId].add(agent.id);
      streamingRef.current[channelId] = true;
      setStreamingChannels((prev) => ({ ...prev, [channelId]: true }));

      appendAuditLog({
        action: 'agent_working',
        actor: agent.name,
        description: `"${userText.slice(0, 60)}" 처리 시작`,
      });

      const relatedMemory = await loadRelatedVaultMemory(userText);
      const mode = getAgentMode();
      const guidelines = getUserGuidelines();
      const preset = getAgentPreset(agent.id);

      const modeBlock = mode === 'careful'
        ? `\n\n[운영 모드: 신중 모드]\n- 중요한 결정·행동 전 반드시 사용자에게 확인을 구하세요.\n- "이렇게 진행할까요?" 형식으로 의도를 먼저 제시하고 확인을 기다리세요.\n- 불확실한 사항은 추측하지 말고 질문하세요.`
        : `\n\n[운영 모드: 자율 모드]\n- 권한이 완전히 위임된 상태입니다. 사용자 확인 없이 즉시 최선의 판단으로 실행하세요.\n- 중간 질문 없이 완성된 결과물을 바로 제공하세요.`;

      const guidelinesBlock = guidelines.trim()
        ? `[사용자 권고사항 — 최우선 준수]\n${guidelines.trim()}\n위 권고사항은 다른 모든 지시보다 우선합니다.\n\n`
        : '';

      const presetBlock = `\n\n[Agent preset]\n- Mode: ${preset.mode}\n- ${presetInstruction(preset.mode)}${preset.systemNote?.trim() ? `\n- User note: ${preset.systemNote.trim()}` : ''}`;

      const memoryBlock = relatedMemory
        ? `\n\n[관련 장기기억]\n${relatedMemory}\n\n위 기억은 참고자료입니다. 현재 요청과 충돌하면 현재 요청을 우선하세요.`
        : '';

      const localAutomationBlock = `\n\n[Local tool and skill policy]\n- If a task requires a missing skill, first prefer an existing installed skill under ~/.codex/skills or ~/.agents/skills.\n- Install skills only from GitHub HTTPS URLs or owner/repo identifiers, and only through the local skill manager safety harness.\n- Treat unknown downloads, shell metacharacters, credential access, browser profiles, wallets, and destructive system paths as unsafe.\n- If no suitable skill exists, create a minimal local skill under ~/.agents/skills with a SKILL.md that states when to use it and the safe workflow.\n- Report blocked installs or unsafe sources clearly instead of bypassing the safety harness.`;

      const harnessDecision = classifyHarnessTask(userText);
      const connectorHints = recommendHarnessConnectors(userText)
        .map((connector) => `${connector.name} (${connector.kind}, ${connector.status})`)
        .join(', ');
      const harnessBlock = `\n\n${buildHarnessRunBrief(harnessDecision)}\n- Relevant connectors: ${connectorHints || 'none'}`;

      const systemPrompt = `${guidelinesBlock}${agent.systemPrompt}${presetBlock}${memoryBlock}${modeBlock}${localAutomationBlock}${harnessBlock}`;

      const apiMessages = history
        .filter((m) => m.role !== 'system')
        .slice(-20)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
      apiMessages.push({ role: 'user', content: userText });
      const inputChars =
        systemPrompt.length + apiMessages.reduce((sum, message) => sum + message.content.length, 0);
      const budget = checkBudgetGuard({ providerId, inputChars });
      if (budget.status !== 'ok') {
        addSystemMessage(channelId, budget.message);
      }

      const streamId = makeId();
      const timestamp = new Date().toISOString();
      const streamMsg: ChatMessage = {
        id: streamId,
        channelId,
        role: 'agent',
        agentId: agent.id,
        content: '',
        timestamp,
        isStreaming: true,
      };

      setMessages((prev) => ({ ...prev, [channelId]: [...(prev[channelId] ?? []), streamMsg] }));

      let fullText = '';
      const providerModel = getProviderModel(providerId, provider.defaultModel || model);

      try {
        const isElectron = typeof window !== 'undefined' && (window as any).electronAPI;

        const isAutoMode = getAgentMode() !== 'careful';
        const electronAPI = isElectron ? (window as any).electronAPI : null;

        if (isElectron && electronAPI?.providerChat && !(isAutoMode && isLocalAutomationRequest(userText))) {
          const callProviderChat = async (chosenModel: string) => electronAPI.providerChat({
            providerId,
            apiKey: providerKey,
            model: chosenModel,
            systemPrompt,
            messages: apiMessages,
            baseURL: provider?.baseURL,
            headers: provider?.defaultHeaders ?? {},
          });

          const modelCandidates = Array.from(new Set([
            providerModel,
            provider.defaultModel,
            ...provider.models.map((item) => item.id),
          ].filter(Boolean)));

          let result: any = null;
          let lastError = '';
          for (const candidate of modelCandidates) {
            result = await callProviderChat(candidate);
            if (result.ok) break;
            lastError = result.error ?? lastError;
          }

          if (!result?.ok && provider.fetchModels) {
            try {
              const liveModels = await provider.fetchModels(providerKey);
              for (const candidate of liveModels.slice(0, 8).map((item) => item.id)) {
                if (modelCandidates.includes(candidate)) continue;
                result = await callProviderChat(candidate);
                if (result.ok) {
                  setProviderModel(providerId, candidate);
                  break;
                }
                lastError = result.error ?? lastError;
              }
            } catch (error: any) {
              lastError = error.message ?? lastError;
            }
          }

          if ((forceStopVersionRef.current[channelId] ?? 0) !== forceStopVersion || stopRequestedRef.current[channelId]) {
            fullText = '강제 중단했습니다.';
            return fullText;
          }

          if (!result?.ok) {
            throw new Error(`[${provider.name}] ${lastError || 'API 호출 실패'}`);
          }

          fullText = String(result.data?.text ?? '').trim();
          if (!fullText) {
            throw new Error(`[${provider.name}] 빈 응답을 받았습니다. 모델 설정을 확인하세요.`);
          }
          updateStreamingMessage(channelId, streamId, fullText);
        } else if (providerId === 'claude' && isElectron) {
          // 직접 Anthropic API 키 사용 → anthropicChat IPC
          const result = await electronAPI.anthropicChat({
            apiKey: providerKey,
            model: providerModel,
            systemPrompt,
            messages: apiMessages,
            autonomous: isAutoMode,
            maxRounds: isAutoMode ? 30 : 1,
          });

          if ((forceStopVersionRef.current[channelId] ?? 0) !== forceStopVersion || stopRequestedRef.current[channelId]) {
            fullText = '강제 중단했습니다.';
            return fullText;
          }

          fullText = result.ok
            ? result.data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
            : `오류: ${result.error}`;
          updateStreamingMessage(channelId, streamId, fullText);
        } else if (isElectron && isAutoMode && provider?.baseURL) {
          // OpenRouter / Kimi 등 OpenAI 호환 프로바이더 → computerAgentChat IPC (computer 도구 포함)
          const result = await electronAPI.computerAgentChat({
            apiKey: providerKey,
            model: providerModel,
            systemPrompt,
            messages: apiMessages,
            baseURL: provider.baseURL,
            headers: provider.defaultHeaders ?? {},
            autonomous: true,
            maxRounds: 30,
          });

          if ((forceStopVersionRef.current[channelId] ?? 0) !== forceStopVersion || stopRequestedRef.current[channelId]) {
            fullText = '강제 중단했습니다.';
            return fullText;
          }

          fullText = result.ok
            ? result.data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
            : `오류: ${result.error}`;
          updateStreamingMessage(channelId, streamId, fullText);
        } else {
          for await (const chunk of provider.streamMessage(providerKey, providerModel, {
            systemPrompt,
            messages: apiMessages as any,
          })) {
            if (!streamingRef.current[channelId]) break;
            fullText += chunk;
            updateStreamingMessage(channelId, streamId, fullText);
          }
        }

        if ((forceStopVersionRef.current[channelId] ?? 0) !== forceStopVersion || stopRequestedRef.current[channelId]) {
          fullText = fullText.trim() || '강제 중단했습니다.';
          return fullText;
        }

        addToast(`${agent.name} 작업 완료`, 'success');
        appendAuditLog({
          action: 'agent_response',
          actor: agent.name,
          description: `응답 완료 (${fullText.length}자)`,
        });

        const savedToVault = await saveAgentMemoryToVault({
          agent,
          userText,
          responseText: fullText,
          channelId,
        });
        if (savedToVault) {
          addToast('Obsidian에 작업 기억을 저장했습니다.', 'info');
          appendAuditLog({
            action: 'vault_memory_saved',
            actor: agent.name,
            description: 'Obsidian 장기기억과 작업 위키에 자동 저장',
          });
        }

        if ((window as any).electronAPI?.showNotification) {
          (window as any).electronAPI.showNotification({
            title: agent.name,
            body: fullText.slice(0, 80),
          });
        }
      } catch (err: any) {
        if ((forceStopVersionRef.current[channelId] ?? 0) !== forceStopVersion || stopRequestedRef.current[channelId]) {
          fullText = '강제 중단했습니다.';
          return fullText;
        }
        fullText = `오류가 발생했습니다: ${err.message}`;
        updateStreamingMessage(channelId, streamId, fullText);
        addToast(`${agent.name} 오류: ${err.message}`, 'error');
      } finally {
        const wasForceStopped = (forceStopVersionRef.current[channelId] ?? 0) !== forceStopVersion || stopRequestedRef.current[channelId];
        const finalText = wasForceStopped ? (fullText.trim() || '강제 중단했습니다.') : fullText;
        finalizeStreamingMessage(channelId, streamId, finalText);
        if (!wasForceStopped) {
          try {
            if (harnessDecision.needsReflection) {
              recordHarnessReflection({
                agentId: agent.id,
                prompt: userText,
                output: finalText,
                decision: harnessDecision,
              });
            }
            recordUsage({ providerId, inputChars, outputChars: finalText.length, model: providerModel });
            await persistMessage({ ...streamMsg, content: finalText, isStreaming: false });
          } catch (error) {
            console.warn('Failed to persist chat metadata', error);
          }
        }
        setAgentStatus(agent.id, 'idle');
        activeAgentIdsByChannelRef.current[channelId]?.delete(agent.id);
        streamingRef.current[channelId] = false;
        setStreamingChannels((prev) => ({ ...prev, [channelId]: false }));
        setChannels((prev) =>
          prev.map((c) =>
            c.id === channelId
              ? { ...c, lastMessage: finalText.slice(0, 60), lastMessageAt: new Date().toISOString() }
              : c
          )
        );
      }

      return fullText;
    },
    [
      apiKey,
      model,
      addSystemMessage,
      updateStreamingMessage,
      finalizeStreamingMessage,
      setAgentStatus,
      addToast,
      persistMessage,
      loadRelatedVaultMemory,
      saveAgentMemoryToVault,
    ]
  );

  const sendMessage = useCallback(
    async (channelId: string, text: string) => {
      const trimmed = text.trim();
      if (streamingRef.current[channelId] || !trimmed) return;
      stopRequestedRef.current[channelId] = false;
      const harnessDecision = classifyHarnessTask(trimmed);

      const channel = channels.find((c) => c.id === channelId);
      if (!channel) return;
      const isGeneralChannel = channel.id === ALL_CHANNEL_ID;
      const isMeetingChannel = channel.id === MEETING_CHANNEL_ID;
      const isWorkChannel = channel.id === WORK_CHANNEL_ID;
      const agentId = FIXED_CHANNEL_IDS.has(channel.id) ? 'ceo' : channel.agentId;
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) return;

      const userMsg: ChatMessage = {
        id: makeId(),
        channelId,
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };

      addMessage(userMsg);
      saveUserHistory(trimmed);
      auth.noteUserMessageSent();
      await persistMessage(userMsg);

      appendAuditLog({
        action: 'message_sent',
        actor: '사용자',
        description: `[${agent.name}] ${trimmed.slice(0, 80)}`,
      });

      const currentHistory = messages[channelId] ?? [];
      if (!isGeneralChannel && !isMeetingChannel && !isWorkChannel) {
        await callAgent(agent, channelId, currentHistory, trimmed);
        return;
      }

      const ceo = agents.find((a) => a.id === 'ceo') ?? agent;
      const workChannelId = WORK_CHANNEL_ID;

      if (isGeneralChannel && harnessDecision.route === 'fast') {
        await callAgent(ceo, channelId, currentHistory, trimmed);
        return;
      }

      if (isWorkChannel || (isGeneralChannel && !shouldDebate(harnessDecision))) {
        const targetChannelId = isWorkChannel ? channelId : workChannelId;
        const workerIds = harnessDecision.workerIds.length ? harnessDecision.workerIds : inferHarnessWorkers(trimmed);
        const workers = workerIds
          .map((id) => agents.find((a) => a.id === id))
          .filter((value): value is Agent => Boolean(value));

        if (targetChannelId !== channelId) {
          const workOrder: ChatMessage = {
            id: makeId(),
            channelId: targetChannelId,
            role: 'user',
            content: `[Harness direct route]\n${trimmed}`,
            timestamp: new Date().toISOString(),
          };
          addMessage(workOrder);
          await persistMessage(workOrder);
        }

        addSystemMessage(targetChannelId, `Harness route: ${harnessDecision.route}; assigned to ${workers.map((worker) => worker.name).join(', ')}.`);
        for (const worker of workers) {
          if (stopRequestedRef.current[targetChannelId]) return;
          createTaskFromAgentWork({
            source: isWorkChannel ? 'workroom' : 'meeting',
            agentId: worker.id,
            goal: trimmed,
            instruction: trimmed,
          });
          await callAgent(
            worker,
            targetChannelId,
            messages[targetChannelId] ?? [],
            `[Harness direct work]\n${trimmed}\n\n${buildHarnessRunBrief(harnessDecision)}\n\nProduce an executable result for your lane.`
          );
        }
        return;
      }

      const meetingChannelId = MEETING_CHANNEL_ID;
      let meetingHistory = messages[meetingChannelId] ?? [];

      if (isGeneralChannel) {
        stopRequestedRef.current[meetingChannelId] = false;
        stopRequestedRef.current[workChannelId] = false;
        addSystemMessage(channelId, '요청을 회의 대화로 넘깁니다. 회의 후 일 대화에 실행 지시가 배정됩니다.');
        const meetingUserMsg: ChatMessage = {
          id: makeId(),
          channelId: meetingChannelId,
          role: 'user',
          content: `[전체 대화에서 전달]\n${trimmed}`,
          timestamp: new Date().toISOString(),
        };
        addMessage(meetingUserMsg);
        meetingHistory = [...meetingHistory, meetingUserMsg];
        await persistMessage(meetingUserMsg);
      } else {
        stopRequestedRef.current[meetingChannelId] = false;
        stopRequestedRef.current[workChannelId] = false;
        meetingHistory = currentHistory;
      }

      const commanders = ['cto', 'cpo', 'cmo', 'coo']
        .map((id) => agents.find((a) => a.id === id))
        .filter((value): value is Agent => Boolean(value));

      addSystemMessage(meetingChannelId, 'CEO가 요청을 검토하고 필요한 임원 회의를 소집합니다.');
      const ceoBrief = await callAgent(
        ceo,
        meetingChannelId,
        meetingHistory,
        `${trimmed}\n\n먼저 이 요청을 처리하기 위한 판단, 위임 대상, 회의 안건을 정리하세요.`
      );
      if (stopRequestedRef.current[meetingChannelId]) return;

      let discussion = '';
      for (const commander of commanders) {
        if (stopRequestedRef.current[meetingChannelId]) return;
        const opinion = await callAgent(
          commander,
          meetingChannelId,
          messages[meetingChannelId] ?? [],
          `[CEO 브리핑]\n${ceoBrief}\n\n[사용자 요청]\n${trimmed}\n\n당신의 담당 영역 관점에서 의견, 리스크, 실행 과제를 짧게 제시하세요.`
        );
        discussion += `\n\n[${commander.name}]\n${opinion}`;
      }

      const decision = await callAgent(
        ceo,
        meetingChannelId,
        messages[meetingChannelId] ?? [],
        `[사용자 요청]\n${trimmed}\n\n[임원 토론]\n${discussion}\n\nCEO로서 최종 의사결정, 위임 순서, 실행 워크플로우를 정리하고, 어떤 워커에게 일을 넘길지 명시하세요.`
      );
      if (stopRequestedRef.current[meetingChannelId] || stopRequestedRef.current[workChannelId]) return;

      const workerIds = inferWorkerIds(`${trimmed}\n${ceoBrief}\n${discussion}\n${decision}`);
      const workers = workerIds
        .map((id) => agents.find((a) => a.id === id))
        .filter((value): value is Agent => Boolean(value));

      addSystemMessage(meetingChannelId, `회의 결과를 일 대화로 넘깁니다: ${workers.map((worker) => worker.name).join(', ')}`);
      addSystemMessage(workChannelId, `회의 대화에서 업무가 넘어왔습니다: ${workers.map((worker) => worker.name).join(', ')}`);
      for (const worker of workers) {
        createTaskFromAgentWork({
          source: 'meeting',
          agentId: worker.id,
          goal: trimmed,
          instruction: decision,
          priority: 'high',
        });
      }

      const workOrder: ChatMessage = {
        id: makeId(),
        channelId: workChannelId,
        role: 'user',
        content: `[회의 결과 업무 지시]\n${trimmed}\n\n[CEO 결정]\n${decision}`,
        timestamp: new Date().toISOString(),
      };
      addMessage(workOrder);
      await persistMessage(workOrder);

      for (const worker of workers) {
        if (stopRequestedRef.current[workChannelId]) return;
        await callAgent(
          worker,
          workChannelId,
          messages[workChannelId] ?? [],
          `[원 요청]\n${trimmed}\n\n[CEO 회의 결정]\n${decision}\n\n[임원 토론 요약]\n${discussion}\n\n당신의 역할에서 실제 결과물을 작성하세요. 회의 의견 반복보다 실행 결과를 우선하세요.`
        );
      }
    },
    [
      isStreaming,
      auth,
      channels,
      agents,
      messages,
      addMessage,
      addSystemMessage,
      persistMessage,
      callAgent,
      addToast,
    ]
  );

  const rerunMessage = useCallback(
    async (messageId: string, channelId: string) => {
      const msg = (messages[channelId] ?? []).find((m) => m.id === messageId);
      if (msg?.role !== 'user') return;
      await sendMessage(channelId, msg.content);
    },
    [messages, sendMessage]
  );

  const runPipeline = useCallback(
    async (steps: PipelineStep[], goal: string) => {
      if (isPipelineRunning) return;

      setIsPipelineRunning(true);
      addToast(`파이프라인 시작: ${goal}`, 'info');
      appendAuditLog({ action: 'task_created', actor: '파이프라인', description: `목표: ${goal}` });
      const runLogId = makeOpsId();
      saveWorkflowLogs([
        {
          id: runLogId,
          workflowName: goal.slice(0, 48),
          goal,
          status: 'running',
          startedAt: new Date().toISOString(),
          steps: steps.map((step) => ({
            agentId: step.agentId,
            instruction: step.instruction,
            status: 'pending',
          })),
        },
        ...loadWorkflowLogs(),
      ]);

      let previousResult = '';

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const channelId = `ch-${step.agentId}`;
        const agent = agents.find((a) => a.id === step.agentId);
        if (!agent) continue;

        if (step.approvalRequired) {
          createApproval({
            title: `워크플로우 승인: ${agent.name}`,
            description: `${goal}\n\n${step.instruction}`,
            source: 'workflow',
          });
          addSystemMessage(channelId, `승인 대기 단계입니다: ${agent.name}. 운영 센터에서 승인 후 별도로 실행하세요.`);
          await notifyDiscord(`⏳ 승인 필요: ${goal} / ${agent.name}`);
          const logs = loadWorkflowLogs();
          saveWorkflowLogs(logs.map((log) =>
            log.id === runLogId
              ? {
                  ...log,
                  status: 'blocked',
                  finishedAt: new Date().toISOString(),
                  steps: log.steps.map((logStep, idx) => idx === i ? { ...logStep, status: 'blocked', finishedAt: new Date().toISOString() } : logStep),
                }
              : log
          ));
          setIsPipelineRunning(false);
          return;
        }

        const instruction = step.dependsOnPrevious && previousResult
          ? `${step.instruction}\n\n[이전 단계 결과]\n${previousResult.slice(0, 2000)}`
          : step.instruction;

        addSystemMessage(channelId, `파이프라인 단계 ${i + 1}/${steps.length}: ${goal}`);
        createTaskFromAgentWork({
          source: 'pipeline',
          agentId: step.agentId,
          goal,
          instruction,
          priority: step.approvalRequired ? 'high' : 'medium',
        });

        const userMsg: ChatMessage = {
          id: makeId(),
          channelId,
          role: 'user',
          content: instruction,
          timestamp: new Date().toISOString(),
        };

        addMessage(userMsg);
        auth.noteUserMessageSent();
        await persistMessage(userMsg);
        saveWorkflowLogs(loadWorkflowLogs().map((log) =>
          log.id === runLogId
            ? { ...log, steps: log.steps.map((logStep, idx) => idx === i ? { ...logStep, status: 'running', startedAt: new Date().toISOString() } : logStep) }
            : log
        ));

        previousResult = await callAgent(agent, channelId, messages[channelId] ?? [], instruction) ?? '';
        if (stopRequestedRef.current[channelId]) {
          saveWorkflowLogs(loadWorkflowLogs().map((log) =>
            log.id === runLogId
              ? {
                  ...log,
                  status: 'blocked',
                  finishedAt: new Date().toISOString(),
                  steps: log.steps.map((logStep, idx) => idx === i ? { ...logStep, status: 'blocked', output: 'Stopped by user', finishedAt: new Date().toISOString() } : logStep),
                }
              : log
          ));
          setIsPipelineRunning(false);
          return;
        }
        saveWorkflowLogs(loadWorkflowLogs().map((log) =>
          log.id === runLogId
            ? { ...log, steps: log.steps.map((logStep, idx) => idx === i ? { ...logStep, status: 'done', output: previousResult.slice(0, 4000), finishedAt: new Date().toISOString() } : logStep) }
            : log
        ));
        if (i < steps.length - 1) await new Promise((resolve) => setTimeout(resolve, 500));
      }

      addToast(`파이프라인 완료: ${goal}`, 'success');
      saveWorkflowLogs(loadWorkflowLogs().map((log) =>
        log.id === runLogId ? { ...log, status: 'done', finishedAt: new Date().toISOString() } : log
      ));
      await notifyDiscord(`✅ 워크플로우 완료: ${goal}`);
      setIsPipelineRunning(false);
    },
    [
      isPipelineRunning,
      agents,
      messages,
      addMessage,
      addSystemMessage,
      callAgent,
      addToast,
      auth,
      persistMessage,
    ]
  );

  return (
    <ChatContext.Provider
      value={{
        channels,
        messages,
        activeChannelId,
        setActiveChannel,
        sendMessage,
        rerunMessage,
        runPipeline,
        stopStreaming,
        forceStopChannel,
        revertToMessage,
        isStreaming,
        isChannelStreaming,
        isPipelineRunning,
        addSystemMessage,
        clearUnread,
        clearChannelMessages,
        clearAllMessages,
        startNewConversation,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be inside ChatProvider');
  return ctx;
}
