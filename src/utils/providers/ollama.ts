import OpenAI from 'openai';
import { fetchModelsViaElectron } from './electronBridge.js';
import type { AIProvider, ModelOption, SendMessageParams } from './types.js';

const DEFAULT_BASE = 'http://localhost:11434';

function baseUrl(key: string) {
  // key 필드를 서버 URL로 재활용 (비어 있으면 localhost 기본값)
  return (key?.startsWith('http') ? key : DEFAULT_BASE).replace(/\/$/, '');
}

export const ollamaProvider: AIProvider = {
  id: 'ollama',
  name: 'Ollama (로컬)',
  icon: '🦙',
  docsUrl: 'https://ollama.com/download',
  keyPlaceholder: 'http://localhost:11434 (기본값, 원격이면 변경)',
  models: [
    { id: 'llama3.2', label: 'Llama 3.2' },
    { id: 'mistral', label: 'Mistral' },
    { id: 'gemma3', label: 'Gemma 3' },
    { id: 'qwen2.5', label: 'Qwen 2.5' },
    { id: 'phi4', label: 'Phi-4' },
  ],
  defaultModel: 'llama3.2',

  async fetchModels(key: string): Promise<ModelOption[]> {
    const base = baseUrl(key);
    const data = await fetchModelsViaElectron('ollama', () => fetch(`${base}/api/tags`), key);
    return ((data.models ?? []) as any[]).map((m) => ({
      id: m.model ?? m.name,
      label: m.name,
    }));
  },

  async testConnection(key: string) {
    try {
      const base = baseUrl(key);
      const res = await fetch(`${base}/api/tags`);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: `Ollama 서버에 연결할 수 없습니다: ${e.message}` };
    }
  },

  async *streamMessage(key, model, params: SendMessageParams) {
    const client = new OpenAI({
      apiKey: 'ollama',
      baseURL: `${baseUrl(key)}/v1`,
      dangerouslyAllowBrowser: true,
    });
    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: params.systemPrompt },
        ...params.messages,
      ],
      max_tokens: params.maxTokens ?? 4096,
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  },

  async sendMessage(key, model, params: SendMessageParams) {
    const client = new OpenAI({
      apiKey: 'ollama',
      baseURL: `${baseUrl(key)}/v1`,
      dangerouslyAllowBrowser: true,
    });
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: params.systemPrompt },
        ...params.messages,
      ],
      max_tokens: params.maxTokens ?? 4096,
    });
    return res.choices[0]?.message?.content ?? '';
  },
};
