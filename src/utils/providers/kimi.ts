import { fetchModelsViaElectron } from './electronBridge.js';
import type { ModelOption } from './types.js';
import { createOpenAICompatibleProvider } from './openaiCompatible.js';

async function fetchKimiModels(apiKey: string): Promise<ModelOption[]> {
  const data = await fetchModelsViaElectron('kimi', () =>
    fetch('https://api.moonshot.ai/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } }),
    apiKey,
  );
  return (data.data as any[]).map((m) => ({ id: m.id, label: m.id }));
}

export const kimiProvider = createOpenAICompatibleProvider({
  id: 'kimi',
  name: 'Kimi (Moonshot)',
  icon: '🌙',
  docsUrl: 'https://platform.kimi.ai',
  baseURL: 'https://api.moonshot.ai/v1',
  models: [
    { id: 'kimi-k2.6', label: 'Kimi K2.6 (최신)' },
    { id: 'kimi-k2', label: 'Kimi K2' },
    { id: 'kimi-k2-0905-preview', label: 'Kimi K2 Preview' },
    { id: 'moonshot-v1-128k', label: 'Moonshot v1 128K' },
    { id: 'moonshot-v1-32k', label: 'Moonshot v1 32K' },
    { id: 'moonshot-v1-8k', label: 'Moonshot v1 8K' },
  ],
  defaultModel: 'kimi-k2.6',
  fetchModels: fetchKimiModels,
});
