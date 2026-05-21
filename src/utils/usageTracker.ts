import type { AIProviderId, DailyUsage, ProviderUsageStat, UsageStore } from '../types/index.js';

const STORAGE_KEY = 'ao2-usage-v1';
const PROVIDER_IDS: AIProviderId[] = ['claude', 'gemini', 'openai', 'openrouter', 'deepseek', 'kimi', 'minimax', 'ollama'];

// 모델별 정확한 단가 (USD per 1M tokens)
const MODEL_COST_TABLE: Record<string, { input: number; output: number }> = {
  // Claude
  'claude-opus-4-5': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25 },
  // OpenAI
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'o3': { input: 10.0, output: 40.0 },
  'o4-mini': { input: 1.1, output: 4.4 },
  'o1': { input: 15.0, output: 60.0 },
  'o1-mini': { input: 3.0, output: 12.0 },
  // Gemini
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  // DeepSeek
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  // Kimi (Moonshot)
  'kimi-k2.6': { input: 0.60, output: 2.50 },
  'kimi-k2': { input: 0.60, output: 2.50 },
  'moonshot-v1-128k': { input: 0.60, output: 0.60 },
  'moonshot-v1-32k': { input: 0.24, output: 0.24 },
  'moonshot-v1-8k': { input: 0.12, output: 0.12 },
  // MiniMax
  'MiniMax-M2.5': { input: 0.60, output: 2.40 },
  'MiniMax-M2.5-highspeed': { input: 0.30, output: 1.20 },
  'MiniMax-Text-01': { input: 0.60, output: 2.40 },
};

// 프로바이더 기본 단가 (모델 미지정 시 폴백)
const PROVIDER_COST_TABLE: Record<AIProviderId, { input: number; output: number }> = {
  claude: { input: 3.0, output: 15.0 },
  openai: { input: 2.5, output: 10.0 },
  gemini: { input: 1.25, output: 5.0 },
  openrouter: { input: 2.5, output: 10.0 },
  deepseek: { input: 0.27, output: 1.1 },
  kimi: { input: 0.6, output: 2.5 },
  minimax: { input: 0.6, output: 2.4 },
  ollama: { input: 0.0, output: 0.0 },
};

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function emptyStat(): ProviderUsageStat {
  return { messages: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
}

function mergeStat(a: ProviderUsageStat | undefined, b: ProviderUsageStat): ProviderUsageStat {
  return {
    messages: (a?.messages ?? 0) + b.messages,
    inputTokens: (a?.inputTokens ?? 0) + b.inputTokens,
    outputTokens: (a?.outputTokens ?? 0) + b.outputTokens,
    cost: (a?.cost ?? 0) + (b.cost ?? 0),
  };
}

function isProviderId(id: string): id is AIProviderId {
  return PROVIDER_IDS.includes(id as AIProviderId);
}

function normalizeStat(value: Partial<ProviderUsageStat> | undefined): ProviderUsageStat | null {
  if (!value || typeof value !== 'object') return null;
  return {
    messages: Number.isFinite(value.messages) ? Number(value.messages) : 0,
    inputTokens: Number.isFinite(value.inputTokens) ? Number(value.inputTokens) : 0,
    outputTokens: Number.isFinite(value.outputTokens) ? Number(value.outputTokens) : 0,
    cost: Number.isFinite(value.cost) ? Number(value.cost) : 0,
  };
}

function normalizeProviders(
  value: Partial<Record<AIProviderId, Partial<ProviderUsageStat>>> | undefined
): Partial<Record<AIProviderId, ProviderUsageStat>> {
  if (!value || typeof value !== 'object') return {};

  return PROVIDER_IDS.reduce<Partial<Record<AIProviderId, ProviderUsageStat>>>((acc, providerId) => {
    const stat = normalizeStat(value[providerId]);
    if (stat) acc[providerId] = stat;
    return acc;
  }, {});
}

function normalizeDaily(value: unknown): DailyUsage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Partial<DailyUsage> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      date: typeof item.date === 'string' ? item.date : todayKey(),
      providers: normalizeProviders(item.providers),
    }));
}

function normalizeStore(value: Partial<UsageStore> | null): UsageStore {
  const now = new Date().toISOString();
  return {
    daily: normalizeDaily(value?.daily),
    session: normalizeProviders(value?.session),
    sessionStarted: value?.sessionStarted ?? now,
  };
}

function loadStore(): UsageStore {
  if (typeof localStorage === 'undefined') {
    return normalizeStore(null);
  }

  try {
    return normalizeStore(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return normalizeStore(null);
  }
}

function saveStore(store: UsageStore): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Usage metrics are best-effort. They must never block chat cleanup.
  }
}

function trimDailyHistory(daily: DailyUsage[], days = 30): DailyUsage[] {
  return daily
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
}

function calcCost(providerId: AIProviderId, model: string | undefined, inputTokens: number, outputTokens: number): number {
  const rates = (model ? MODEL_COST_TABLE[model] : undefined) ?? PROVIDER_COST_TABLE[providerId];
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

export function recordUsage(params: {
  providerId: AIProviderId;
  inputChars: number;
  outputChars: number;
  model?: string;
}): void {
  if (!isProviderId(params.providerId)) return;

  const inputTokens = Math.ceil(Math.max(params.inputChars, 0) / 4);
  const outputTokens = Math.ceil(Math.max(params.outputChars, 0) / 4);
  const cost = calcCost(params.providerId, params.model, inputTokens, outputTokens);

  const delta: ProviderUsageStat = {
    messages: 1,
    inputTokens,
    outputTokens,
    cost,
  };
  const store = loadStore();
  const date = todayKey();
  const daily = store.daily.slice();
  const dayIndex = daily.findIndex((item) => item.date === date);
  const day = dayIndex >= 0 ? daily[dayIndex] : { date, providers: {} };

  day.providers = {
    ...day.providers,
    [params.providerId]: mergeStat(day.providers[params.providerId], delta),
  };

  if (dayIndex >= 0) daily[dayIndex] = day;
  else daily.push(day);

  store.daily = trimDailyHistory(daily, 30);
  store.session = {
    ...store.session,
    [params.providerId]: mergeStat(store.session[params.providerId], delta),
  };
  saveStore(store);
}

export function getAggregatedUsage(days = 30): Partial<Record<AIProviderId, ProviderUsageStat>> {
  const history = getDailyHistory(days);
  return history.reduce<Partial<Record<AIProviderId, ProviderUsageStat>>>((acc, day) => {
    for (const providerId of PROVIDER_IDS) {
      const stat = day.providers[providerId];
      if (stat) acc[providerId] = mergeStat(acc[providerId], stat);
    }
    return acc;
  }, {});
}

// 항상 최근 N일 모두 반환 (데이터 없는 날은 빈 항목으로 패딩)
export function getDailyHistory(days = 7): DailyUsage[] {
  const store = loadStore();
  const existingMap = new Map(store.daily.map((d) => [d.date, d]));

  const result: DailyUsage[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = todayKey(date);
    result.push(existingMap.get(key) ?? { date: key, providers: {} });
  }
  return result;
}

export function getSessionUsage(): Partial<Record<AIProviderId, ProviderUsageStat>> {
  return loadStore().session;
}

export function estimateCost(id: AIProviderId, inputTokens: number, outputTokens: number): number {
  return calcCost(id, undefined, inputTokens, outputTokens);
}

export function getProviderUsageStat(
  usage: Partial<Record<AIProviderId, ProviderUsageStat>>,
  id: AIProviderId
): ProviderUsageStat {
  return usage[id] ?? emptyStat();
}

export function clearUsageStore(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
