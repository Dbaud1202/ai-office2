import type { HeartbeatState, AgentStatus } from '../types/index.js';

const STORAGE_KEY = 'ao2-heartbeat-states-v1';
const MAX_HISTORY = 20;

function loadStates(): Record<string, HeartbeatState> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveStates(states: Record<string, HeartbeatState>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
}

export function getHeartbeatState(agentId: string): HeartbeatState {
  const states = loadStates();
  return (
    states[agentId] ?? {
      agentId,
      lastHeartbeat: new Date(0).toISOString(),
      heartbeatCount: 0,
      status: 'offline',
      history: [],
    }
  );
}

export function recordHeartbeat(agentId: string, status: AgentStatus = 'idle'): HeartbeatState {
  const states = loadStates();
  const prev = states[agentId] ?? {
    agentId,
    lastHeartbeat: new Date(0).toISOString(),
    heartbeatCount: 0,
    status: 'offline' as AgentStatus,
    history: [],
  };

  const now = new Date().toISOString();
  const history = [{ timestamp: now, status }, ...prev.history].slice(0, MAX_HISTORY);

  const next: HeartbeatState = {
    agentId,
    lastHeartbeat: now,
    heartbeatCount: prev.heartbeatCount + 1,
    status,
    history,
  };

  states[agentId] = next;
  saveStates(states);
  return next;
}

export function markAgentOffline(agentId: string): void {
  const states = loadStates();
  if (states[agentId]) {
    states[agentId].status = 'offline';
    saveStates(states);
  }
}

export function getAllHeartbeatStates(): Record<string, HeartbeatState> {
  return loadStates();
}

// 하트비트 엔진 — 등록된 에이전트를 주기적으로 체크
const timers = new Map<string, ReturnType<typeof setInterval>>();

export function startHeartbeat(agentId: string, intervalMs = 30_000): void {
  if (timers.has(agentId)) return;

  // 즉시 첫 하트비트 기록
  recordHeartbeat(agentId, 'idle');

  const timer = setInterval(() => {
    const state = getHeartbeatState(agentId);
    // offline 상태가 아니면 idle로 유지
    const newStatus: AgentStatus = state.status === 'working' ? 'working' : 'idle';
    recordHeartbeat(agentId, newStatus);
  }, intervalMs);

  timers.set(agentId, timer);
}

export function stopHeartbeat(agentId: string): void {
  const timer = timers.get(agentId);
  if (timer) {
    clearInterval(timer);
    timers.delete(agentId);
    markAgentOffline(agentId);
  }
}

export function stopAllHeartbeats(): void {
  for (const agentId of timers.keys()) {
    stopHeartbeat(agentId);
  }
}

export function isAgentLive(agentId: string, thresholdMs = 60_000): boolean {
  const state = getHeartbeatState(agentId);
  return Date.now() - new Date(state.lastHeartbeat).getTime() < thresholdMs;
}
