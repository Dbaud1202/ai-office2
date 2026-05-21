import OpenAI from 'openai';
import type { AIProvider, AIProviderId, ModelOption, SendMessageParams } from './types.js';

interface OpenAICompatibleOptions {
  id: AIProviderId;
  name: string;
  icon: string;
  docsUrl: string;
  baseURL: string;
  models: ModelOption[];
  defaultModel: string;
  headers?: Record<string, string>;
  fetchModels?: (apiKey: string) => Promise<ModelOption[]>;
}

function toMessages(params: SendMessageParams) {
  return [
    { role: 'system' as const, content: params.systemPrompt },
    ...params.messages.map((message) => ({ role: message.role, content: message.content })),
  ];
}

export function createOpenAICompatibleProvider(options: OpenAICompatibleOptions): AIProvider {
  return {
    id: options.id,
    name: options.name,
    icon: options.icon,
    docsUrl: options.docsUrl,
    models: options.models,
    defaultModel: options.defaultModel,
    fetchModels: options.fetchModels,
    baseURL: options.baseURL,
    defaultHeaders: options.headers,

    async testConnection(apiKey: string) {
      try {
        const client = new OpenAI({
          apiKey,
          baseURL: options.baseURL,
          defaultHeaders: options.headers,
          dangerouslyAllowBrowser: true,
        });
        await client.chat.completions.create({
          model: options.defaultModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        });
        return { ok: true };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },

    async *streamMessage(apiKey: string, model: string, params: SendMessageParams) {
      const client = new OpenAI({
        apiKey,
        baseURL: options.baseURL,
        defaultHeaders: options.headers,
        dangerouslyAllowBrowser: true,
      });

      const stream = await client.chat.completions.create({
        model,
        messages: toMessages(params),
        max_tokens: params.maxTokens ?? 4096,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    },

    async sendMessage(apiKey: string, model: string, params: SendMessageParams) {
      const client = new OpenAI({
        apiKey,
        baseURL: options.baseURL,
        defaultHeaders: options.headers,
        dangerouslyAllowBrowser: true,
      });
      const response = await client.chat.completions.create({
        model,
        messages: toMessages(params),
        max_tokens: params.maxTokens ?? 4096,
      });
      return response.choices[0]?.message?.content ?? '';
    },
  };
}
