import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Agent, AgentStatus } from '../types/index.js';
import { DEFAULT_AGENTS } from '../data/agents.js';

interface AgentContextValue {
  agents: Agent[];
  setAgentStatus: (id: string, status: AgentStatus) => void;
  getAgent: (id: string) => Agent | undefined;
  addAgent: (agent: Omit<Agent, 'status'>) => void;
  updateAgentProfile: (id: string, updates: Partial<Pick<Agent, 'emoji' | 'avatarUrl'>>) => void;
  removeAgent: (id: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  model: string;
  setModel: (m: string) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);
const CUSTOM_AGENTS_KEY = 'ao2-custom-agents-v1';
const AGENT_PROFILE_KEY = 'ao2-agent-profile-overrides-v1';

function loadCustomAgents(): Agent[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_AGENTS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveCustomAgents(agents: Agent[]) {
  try {
    localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(agents.filter((agent) => agent.isCustom)));
  } catch {}
}

function loadAgentProfiles(): Record<string, Partial<Pick<Agent, 'emoji' | 'avatarUrl'>>> {
  try {
    return JSON.parse(localStorage.getItem(AGENT_PROFILE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveAgentProfiles(agents: Agent[]) {
  try {
    const profiles = agents.reduce<Record<string, Pick<Agent, 'emoji' | 'avatarUrl'>>>((acc, agent) => {
      acc[agent.id] = { emoji: agent.emoji, avatarUrl: agent.avatarUrl };
      return acc;
    }, {});
    localStorage.setItem(AGENT_PROFILE_KEY, JSON.stringify(profiles));
  } catch {}
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>(() => {
    const custom = loadCustomAgents();
    const profiles = loadAgentProfiles();
    const ids = new Set(DEFAULT_AGENTS.map((agent) => agent.id));
    return [...DEFAULT_AGENTS, ...custom.filter((agent) => !ids.has(agent.id))].map((agent) => ({
      ...agent,
      ...profiles[agent.id],
    }));
  });
  const [apiKey, setApiKeyState] = useState<string>(
    () => localStorage.getItem('ao2-api-key') ?? ''
  );
  const [model, setModelState] = useState<string>(
    () => localStorage.getItem('ao2-model') ?? 'claude-sonnet-4-6'
  );

  const setAgentStatus = useCallback((id: string, status: AgentStatus) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
  }, []);

  const getAgent = useCallback(
    (id: string) => agents.find((a) => a.id === id),
    [agents]
  );

  const setApiKey = useCallback((key: string) => {
    localStorage.setItem('ao2-api-key', key);
    setApiKeyState(key);
  }, []);

  const setModel = useCallback((m: string) => {
    localStorage.setItem('ao2-model', m);
    setModelState(m);
  }, []);

  const addAgent = useCallback((agent: Omit<Agent, 'status'>) => {
    const nextAgent: Agent = { ...agent, status: 'idle', isCustom: true };
    setAgents((prev) => {
      const next = [...prev.filter((a) => a.id !== nextAgent.id), nextAgent];
      saveCustomAgents(next);
      return next;
    });
  }, []);

  const updateAgentProfile = useCallback((id: string, updates: Partial<Pick<Agent, 'emoji' | 'avatarUrl'>>) => {
    setAgents((prev) => {
      const next = prev.map((agent) => (agent.id === id ? { ...agent, ...updates } : agent));
      saveCustomAgents(next);
      saveAgentProfiles(next);
      return next;
    });
  }, []);

  const removeAgent = useCallback((id: string) => {
    if (DEFAULT_AGENTS.some((agent) => agent.id === id)) return;
    setAgents((prev) => {
      const next = prev.filter((agent) => agent.id !== id);
      saveCustomAgents(next);
      saveAgentProfiles(next);
      return next;
    });
  }, []);

  return (
    <AgentContext.Provider value={{ agents, setAgentStatus, getAgent, addAgent, updateAgentProfile, removeAgent, apiKey, setApiKey, model, setModel }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgents() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgents must be inside AgentProvider');
  return ctx;
}
