export type AIProviderId =
  | 'claude'
  | 'gemini'
  | 'openai'
  | 'openrouter'
  | 'deepseek'
  | 'kimi'
  | 'minimax'
  | 'ollama';

export interface ModelOption {
  id: string;
  label: string;
}

export interface SendMessageParams {
  systemPrompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
}

export interface AIProvider {
  id: AIProviderId;
  name: string;
  icon: string;          // 이모지
  docsUrl: string;       // API 키 발급 URL
  models: ModelOption[];
  defaultModel: string;
  /** OpenAI 호환 API의 base URL (Electron IPC computer-agent-chat에서 사용) */
  baseURL?: string;
  /** 추가 요청 헤더 (OpenRouter HTTP-Referer 등) */
  defaultHeaders?: Record<string, string>;
  /** API 키 입력 필드에 표시할 placeholder (기본: 'sk-...') */
  keyPlaceholder?: string;
  /** API 키가 설정된 경우 연결 테스트 */
  testConnection(apiKey: string): Promise<{ ok: boolean; error?: string }>;
  /** API에서 사용 가능한 모델 목록을 동적으로 가져옴 (선택적) */
  fetchModels?(apiKey: string): Promise<ModelOption[]>;
  /** 스트리밍 응답 — AsyncIterable<string> 청크 반환 */
  streamMessage(apiKey: string, model: string, params: SendMessageParams): AsyncIterable<string>;
  /** 논스트리밍 응답 */
  sendMessage(apiKey: string, model: string, params: SendMessageParams): Promise<string>;
}
