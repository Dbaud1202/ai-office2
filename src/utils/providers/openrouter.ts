import { fetchModelsViaElectron } from './electronBridge.js';
import type { ModelOption } from './types.js';
import { createOpenAICompatibleProvider } from './openaiCompatible.js';

async function fetchOpenRouterModels(apiKey: string): Promise<ModelOption[]> {
  const data = await fetchModelsViaElectron('openrouter', () =>
    fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } }),
    apiKey,
  );
  return (data.data as any[]).map((m) => ({ id: m.id, label: m.name ?? m.id }));
}

export const openrouterProvider = createOpenAICompatibleProvider({
  id: 'openrouter',
  name: 'OpenRouter',
  icon: '🧭',
  docsUrl: 'https://openrouter.ai/keys',
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': 'https://ai-office2.local',
    'X-Title': 'AI Office 2',
  },
  models: [
    { id: 'z-ai/glm-4.5-air:free', label: 'GLM-4.5 Air (무료)' },
    { id: 'openai/gpt-4.1', label: 'OpenAI: GPT-4.1' },
    { id: 'openai/gpt-4.1-mini', label: 'OpenAI: GPT-4.1 mini' },
    { id: 'anthropic/claude-sonnet-4-6', label: 'Anthropic: Claude Sonnet 4.6' },
    { id: 'google/gemini-2.5-pro', label: 'Google: Gemini 2.5 Pro' },
    { id: 'google/gemini-2.5-flash', label: 'Google: Gemini 2.5 Flash' },
    { id: 'deepseek/deepseek-chat', label: 'DeepSeek: DeepSeek Chat' },
    { id: 'deepseek/deepseek-r1', label: 'DeepSeek: DeepSeek R1' },
    { id: 'moonshotai/kimi-k2', label: 'Moonshot: Kimi K2' },
  ],
  defaultModel: 'z-ai/glm-4.5-air:free',
  fetchModels: fetchOpenRouterModels,
});
