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

function electronAPI() {
  return typeof window !== 'undefined' ? (window as any).electronAPI : null;
}

export { fetchModelsViaElectron } from './electronBridge.js';

/**
 * 앱 시작 시 한 번 호출. Electron이면 safeStorage에서 키를 읽어 localStorage에 동기화.
 * 웹 빌드에서는 아무것도 하지 않음.
 */
export async function initProviderKeys(): Promise<void> {
  const api = electronAPI();
  if (!api?.providerKeyGetAll) return;

  const result = await api.providerKeyGetAll();
  if (!result?.ok) return;

  const safe = result.data as Record<string, string>;

  for (const provider of PROVIDERS) {
    const id = provider.id;
    const safeKey = safe[id] ?? '';
    const localKey = localStorage.getItem(`${KEY_PREFIX}${id}-key`) ?? '';

    if (safeKey) {
      // safeStorage 기준으로 localStorage 동기화
      localStorage.setItem(`${KEY_PREFIX}${id}-key`, safeKey);
    } else if (localKey) {
      // localStorage에만 있는 키 → safeStorage로 마이그레이션
      await api.providerKeySet?.(id, localKey);
    }
  }
}

export function getProviderKey(id: AIProviderId): string {
  return localStorage.getItem(`${KEY_PREFIX}${id}-key`) ?? '';
}

export function setProviderKey(id: AIProviderId, key: string) {
  if (key) localStorage.setItem(`${KEY_PREFIX}${id}-key`, key);
  else localStorage.removeItem(`${KEY_PREFIX}${id}-key`);
  // Electron: safeStorage에 암호화 저장 (비동기, fire-and-forget)
  electronAPI()?.providerKeySet?.(id, key);
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

// ── 운영 모드 ──────────────────────────────────────────────────────────────
export type AgentMode = 'careful' | 'auto';

export function getAgentMode(): AgentMode {
  return (localStorage.getItem('ao2-agent-mode') as AgentMode) ?? 'careful';
}

export function setAgentMode(mode: AgentMode) {
  localStorage.setItem('ao2-agent-mode', mode);
}

// ── 사용자 권고사항 ─────────────────────────────────────────────────────────
export function getUserGuidelines(): string {
  return localStorage.getItem('ao2-user-guidelines') ?? '';
}

export function setUserGuidelines(text: string) {
  if (text.trim()) localStorage.setItem('ao2-user-guidelines', text);
  else localStorage.removeItem('ao2-user-guidelines');
}
