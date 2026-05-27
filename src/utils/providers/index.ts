import type { AIProvider, AIProviderId } from './types.js';
import { claudeProvider } from './claude.js';
import { geminiProvider } from './gemini.js';
import { openaiProvider } from './openai.js';
import { openrouterProvider } from './openrouter.js';
import { deepseekProvider } from './deepseek.js';
import { kimiProvider } from './kimi.js';
import { minimaxProvider } from './minimax.js';
import { ollamaProvider } from './ollama.js';

export * from './types.js';

export const PROVIDERS: AIProvider[] = [
  claudeProvider,
  openaiProvider,
  geminiProvider,
  deepseekProvider,
  kimiProvider,
  minimaxProvider,
  openrouterProvider,
  ollamaProvider,
];

export function getProvider(id: AIProviderId): AIProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

const KEY_PREFIX = 'ao2-provider-';
const ELECTRON_SAFE_STORAGE_KEY = '__electron_safe_storage__';
let electronProviderKeyStatus: Record<string, boolean> = {};

function electronAPI() {
  return typeof window !== 'undefined' ? (window as any).electronAPI : null;
}

export { fetchModelsViaElectron } from './electronBridge.js';

export async function initProviderKeys(): Promise<void> {
  const api = electronAPI();
  if (!api?.providerKeyGetAll) return;

  const result = await api.providerKeyGetAll();
  if (!result?.ok) return;

  electronProviderKeyStatus = result.data as Record<string, boolean>;

  for (const provider of PROVIDERS) {
    const id = provider.id;
    const localKey = localStorage.getItem(`${KEY_PREFIX}${id}-key`) ?? '';
    if (!localKey) continue;

    await api.providerKeySet?.(id, localKey);
    electronProviderKeyStatus[id] = true;
    localStorage.removeItem(`${KEY_PREFIX}${id}-key`);
  }
}

export function getProviderKey(id: AIProviderId): string {
  if (electronAPI()) {
    return electronProviderKeyStatus[id] ? ELECTRON_SAFE_STORAGE_KEY : '';
  }
  return localStorage.getItem(`${KEY_PREFIX}${id}-key`) ?? '';
}

export function setProviderKey(id: AIProviderId, key: string) {
  const api = electronAPI();
  if (api?.providerKeySet) {
    localStorage.removeItem(`${KEY_PREFIX}${id}-key`);
    electronProviderKeyStatus[id] = Boolean(key);
    api.providerKeySet(id, key);
    return;
  }

  if (key) localStorage.setItem(`${KEY_PREFIX}${id}-key`, key);
  else localStorage.removeItem(`${KEY_PREFIX}${id}-key`);
}

function normalizeModelId(id: AIProviderId, value: string, defaultModel: string): string {
  const provider = getProvider(id);
  const raw = value.trim();
  if (!raw) return defaultModel;

  const exact = provider?.models.find((model) => model.id === raw || model.label === raw);
  if (exact) return exact.id;

  const withoutSuffix = raw.replace(/\s*\([^)]*\)\s*$/u, '').trim();
  const suffixMatch = provider?.models.find((model) => model.id === withoutSuffix || model.label === withoutSuffix);
  if (suffixMatch) return suffixMatch.id;

  const displayAsId = withoutSuffix.toLowerCase().replace(/\s+/g, '-');
  const displayMatch = provider?.models.find((model) => model.id === displayAsId);
  if (displayMatch) return displayMatch.id;

  return withoutSuffix || defaultModel;
}

export function getProviderModel(id: AIProviderId, defaultModel: string): string {
  const raw = localStorage.getItem(`${KEY_PREFIX}${id}-model`) ?? defaultModel;
  const normalized = normalizeModelId(id, raw, defaultModel);
  if (normalized !== raw) {
    localStorage.setItem(`${KEY_PREFIX}${id}-model`, normalized);
  }
  return normalized;
}

export function setProviderModel(id: AIProviderId, model: string) {
  const provider = getProvider(id);
  localStorage.setItem(`${KEY_PREFIX}${id}-model`, normalizeModelId(id, model, provider?.defaultModel ?? model));
}

export function getAgentProvider(agentId: string): AIProviderId | null {
  const direct = localStorage.getItem(`ao2-agent-${agentId}-provider`) as AIProviderId | null;
  if (direct) return direct;

  try {
    const legacyMap = JSON.parse(localStorage.getItem('ao2-agent-provider') ?? '{}');
    return legacyMap[agentId] ?? null;
  } catch {
    return null;
  }
}

export function setAgentProvider(agentId: string, providerId: AIProviderId | null) {
  if (providerId) localStorage.setItem(`ao2-agent-${agentId}-provider`, providerId);
  else localStorage.removeItem(`ao2-agent-${agentId}-provider`);
}

export type AgentMode = 'careful' | 'auto';

export function getAgentMode(): AgentMode {
  return (localStorage.getItem('ao2-agent-mode') as AgentMode) ?? 'careful';
}

export function setAgentMode(mode: AgentMode) {
  localStorage.setItem('ao2-agent-mode', mode);
}

export function getUserGuidelines(): string {
  return localStorage.getItem('ao2-user-guidelines') ?? '';
}

export function setUserGuidelines(text: string) {
  if (text.trim()) localStorage.setItem('ao2-user-guidelines', text);
  else localStorage.removeItem('ao2-user-guidelines');
}
