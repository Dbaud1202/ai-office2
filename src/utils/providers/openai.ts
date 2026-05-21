import { fetchModelsViaElectron } from './electronBridge.js';
import type { AIProvider, ModelOption, SendMessageParams } from './types.js';

const CHAT_MODEL_PREFIXES = ['gpt-', 'o1', 'o3', 'o4', 'chatgpt-'];

function isChatModel(id: string) {
  return CHAT_MODEL_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export const openaiProvider: AIProvider = {
  id: 'openai',
  name: 'OpenAI',
  icon: '⚫',
  docsUrl: 'https://platform.openai.com',
  models: [
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini (빠름/저렴)' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'o3', label: 'o3 (고성능 추론)' },
    { id: 'o4-mini', label: 'o4 mini (추론/빠름)' },
    { id: 'o1', label: 'o1' },
    { id: 'o1-mini', label: 'o1 mini' },
  ],
  defaultModel: 'gpt-4.1-mini',

  async fetchModels(apiKey: string): Promise<ModelOption[]> {
    const data = await fetchModelsViaElectron('openai', () =>
      fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } }),
      apiKey,
    );
    return (data.data as any[])
      .filter((m) => isChatModel(m.id))
      .sort((a: any, b: any) => (b.created ?? 0) - (a.created ?? 0))
      .map((m: any) => ({ id: m.id, label: m.id }));
  },

  async testConnection(apiKey: string) {
    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  },

  async *streamMessage(apiKey, model, params: SendMessageParams) {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

    const messages = [
      { role: 'system' as const, content: params.systemPrompt },
      ...params.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const stream = await client.chat.completions.create({
      model,
      messages,
      max_tokens: params.maxTokens ?? 4096,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  },

  async sendMessage(apiKey, model, params: SendMessageParams) {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

    const messages = [
      { role: 'system' as const, content: params.systemPrompt },
      ...params.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await client.chat.completions.create({ model, messages, max_tokens: params.maxTokens ?? 4096 });
    return res.choices[0]?.message?.content ?? '';
  },
};
