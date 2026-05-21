import type { ToolDefinition } from '../types/index.js';

export const webToolDefinitions: ToolDefinition[] = [
  {
    name: 'web_search',
    description:
      '인터넷에서 최신 정보를 검색합니다. 리서처 에이전트 전용. DuckDuckGo API를 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색할 키워드 또는 질문' },
        num_results: {
          type: 'number',
          description: '반환할 결과 수 (기본: 5, 최대: 10)',
        },
      },
      required: ['query'],
    },
  },
];

interface DuckDuckGoResult {
  Abstract?: string;
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: Array<{
    Text?: string;
    FirstURL?: string;
    Result?: string;
  }>;
}

export const webToolHandlers = {
  async web_search(input: {
    query: string;
    num_results?: number;
  }): Promise<string> {
    const num = Math.min(input.num_results ?? 5, 10);
    try {
      const encoded = encodeURIComponent(input.query);
      const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AI-Office2-Research-Agent/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DuckDuckGoResult;

      const results: string[] = [];

      if (data.AbstractText) {
        results.push(`[요약]\n${data.AbstractText}\n출처: ${data.AbstractURL ?? ''}`);
      }

      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, num - 1)) {
          if (topic.Text) {
            results.push(`- ${topic.Text}${topic.FirstURL ? `\n  링크: ${topic.FirstURL}` : ''}`);
          }
        }
      }

      if (results.length === 0) {
        return `'${input.query}' 검색 결과가 없습니다. 다른 검색어를 시도해 보세요.`;
      }

      return `🔍 검색: "${input.query}"\n\n${results.join('\n\n')}`;
    } catch (e: unknown) {
      const err = e as { message?: string };
      return `웹 검색 오류: ${err.message}. 네트워크 연결을 확인하거나 다른 검색어를 사용해 보세요.`;
    }
  },
};
