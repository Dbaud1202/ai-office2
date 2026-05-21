import { fetchModelsViaElectron } from './electronBridge.js';
import type { AIProvider, ModelOption, SendMessageParams } from './types.js';

export const claudeProvider: AIProvider = {
  id: 'claude',
  name: 'Claude (Anthropic)',
  icon: '🟠',
  docsUrl: 'https://console.anthropic.com',
  models: [
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5 (최고 성능)' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (균형)' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (빠름/저렴)' },
  ],
  defaultModel: 'claude-sonnet-4-6',

  async fetchModels(apiKey: string): Promise<ModelOption[]> {
    const data = await fetchModelsViaElectron('claude', () =>
      fetch('https://api.anthropic.com/v1/models?limit=50', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      }),
      apiKey,
    );
    return (data.data as any[]).map((m: any) => ({ id: m.id, label: m.display_name ?? m.id }));
  },

  async testConnection(apiKey: string) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  },

  async *streamMessage(apiKey, model, params: SendMessageParams) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const stream = client.messages.stream({
      model,
      max_tokens: params.maxTokens ?? 4096,
      system: params.systemPrompt,
      messages: params.messages as any,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  },

  async sendMessage(apiKey, model, params: SendMessageParams) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const res = await client.messages.create({
      model,
      max_tokens: params.maxTokens ?? 4096,
      system: params.systemPrompt,
      messages: params.messages as any,
    });
    return res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  },
};
