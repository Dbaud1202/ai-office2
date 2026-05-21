import { fetchModelsViaElectron } from './electronBridge.js';
import type { AIProvider, ModelOption, SendMessageParams } from './types.js';

/**
 * Gemini Provider — @google/generative-ai 패키지 사용
 * API 키 발급: https://aistudio.google.com
 * 무료 티어 있음 (Gemini 1.5 Flash)
 */
export const geminiProvider: AIProvider = {
  id: 'gemini',
  name: 'Gemini (Google)',
  icon: '🔵',
  docsUrl: 'https://aistudio.google.com',
  models: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (최고 성능)' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (빠름/저렴)' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  defaultModel: 'gemini-2.5-flash',

  async fetchModels(apiKey: string): Promise<ModelOption[]> {
    const data = await fetchModelsViaElectron('gemini', () =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`),
      apiKey,
    );
    return (data.models as any[])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({ id: m.name.replace('models/', ''), label: m.displayName }));
  },

  async testConnection(apiKey: string) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      await model.generateContent('hi');
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  },

  async *streamMessage(apiKey, model, params: SendMessageParams) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
      model,
      systemInstruction: params.systemPrompt,
    });

    // Gemini 대화 형식으로 변환
    const history = params.messages.slice(0, -1).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));
    const lastMessage = params.messages[params.messages.length - 1];

    const chat = genModel.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage?.content ?? '');

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  },

  async sendMessage(apiKey, model, params: SendMessageParams) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
      model,
      systemInstruction: params.systemPrompt,
    });

    const history = params.messages.slice(0, -1).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));
    const lastMessage = params.messages[params.messages.length - 1];

    const chat = genModel.startChat({ history });
    const result = await chat.sendMessage(lastMessage?.content ?? '');
    return result.response.text();
  },
};
