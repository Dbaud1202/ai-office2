import { fetchModelsViaElectron } from './electronBridge.js';
import type { ModelOption } from './types.js';
import { createOpenAICompatibleProvider } from './openaiCompatible.js';

async function fetchDeepSeekModels(apiKey: string): Promise<ModelOption[]> {
  const data = await fetchModelsViaElectron('deepseek', () =>
    fetch('https://api.deepseek.com/models', { headers: { Authorization: `Bearer ${apiKey}` } }),
    apiKey,
  );
  return (data.data as any[]).map((m) => ({ id: m.id, label: m.id }));
}

export const deepseekProvider = createOpenAICompatibleProvider({
  id: 'deepseek',
  name: 'DeepSeek',
  icon: '🔷',
  docsUrl: 'https://platform.deepseek.com/api_keys',
  baseURL: 'https://api.deepseek.com',
  models: [
    { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
    { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
  ],
  defaultModel: 'deepseek-chat',
  fetchModels: fetchDeepSeekModels,
});
