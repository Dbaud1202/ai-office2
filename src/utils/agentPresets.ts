import type { AIProviderId } from '../types/index.js';

const STORAGE_KEY = 'ao2-agent-presets-v1';

export type AgentPresetMode = 'balanced' | 'fast' | 'deep' | 'cheap';

export interface AgentPreset {
  mode: AgentPresetMode;
  providerId?: AIProviderId;
  model?: string;
  systemNote?: string;
}

const DEFAULT_PRESET: AgentPreset = {
  mode: 'balanced',
  systemNote: '',
};

export function loadAgentPresets(): Record<string, AgentPreset> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function getAgentPreset(agentId: string): AgentPreset {
  return { ...DEFAULT_PRESET, ...(loadAgentPresets()[agentId] ?? {}) };
}

export function setAgentPreset(agentId: string, preset: AgentPreset) {
  const presets = loadAgentPresets();
  presets[agentId] = preset;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function presetInstruction(mode: AgentPresetMode): string {
  if (mode === 'fast') return 'Prefer short, direct answers and avoid unnecessary exploration.';
  if (mode === 'deep') return 'Think through edge cases, tradeoffs, and verification before finalizing.';
  if (mode === 'cheap') return 'Keep the response compact and avoid expensive or repeated model calls.';
  return 'Balance speed, depth, and cost for the current task.';
}
