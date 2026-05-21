import { fetchModelsViaElectron } from './electronBridge.js';
import type { ModelOption } from './types.js';
import { createOpenAICompatibleProvider } from './openaiCompatible.js';

async function fetchMinimaxModels(apiKey: string): Promise<ModelOption[]> {
  const data = await fetchModelsViaElectron('minimax', () =>
    fetch('https://api.minimax.io/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } }),
    apiKey,
  );
  return (data.data as any[]).map((m) => ({ id: m.id, label: m.id }));
}

export const minimaxProvider = createOpenAICompatibleProvider({
  id: 'minimax',
  name: 'MiniMax',
  icon: '🟣',
  docsUrl: 'https://platform.minimax.io',
  baseURL: 'https://api.minimax.io/v1',
  models: [
    { id: 'MiniMax-M2.5', label: 'MiniMax M2.5' },
    { id: 'MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 Highspeed' },
    { id: 'MiniMax-Text-01', label: 'MiniMax Text 01' },
  ],
  defaultModel: 'MiniMax-M2.5',
  fetchModels: fetchMinimaxModels,
});
