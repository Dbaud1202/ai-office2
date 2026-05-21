import type { ToolDefinition } from '../types/index.js';

export const webToolDefinitions: ToolDefinition[] = [
  {
    name: 'web_search',
    description:
      '인터넷에서 정보를 검색합니다. DuckDuckGo API를 사용합니다. 일반 지식, 개념, 배경 정보 검색에 적합합니다.',
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
  {
    name: 'web_search_news',
    description:
      '최신 뉴스를 검색합니다. DuckDuckGo News API를 사용합니다. 최신 트렌드, 시장 동향, 최근 사건 조사에 적합합니다.',
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
    Topics?: Array<{ Text?: string; FirstURL?: string }>;
  }>;
}

interface DuckDuckGoNewsItem {
  title?: string;
  excerpt?: string;
  url?: string;
  source?: string;
  date?: string;
  relativeTime?: string;
}

interface DuckDuckGoNewsResult {
  results?: DuckDuckGoNewsItem[];
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
        for (const topic of data.RelatedTopics.slice(0, num)) {
          // 중첩 Topics 처리
          if (topic.Topics) {
            for (const sub of topic.Topics.slice(0, 3)) {
              if (sub.Text) {
                results.push(`- ${sub.Text}${sub.FirstURL ? `\n  링크: ${sub.FirstURL}` : ''}`);
              }
            }
          } else if (topic.Text) {
            results.push(`- ${topic.Text}${topic.FirstURL ? `\n  링크: ${topic.FirstURL}` : ''}`);
          }
          if (results.length >= num) break;
        }
      }

      if (results.length === 0) {
        return `'${input.query}' 검색 결과가 없습니다. 다른 검색어를 시도해 보세요.`;
      }

      return `🔍 검색: "${input.query}"\n\n${results.join('\n\n')}`;
    } catch (e: unknown) {
      const err = e as { message?: string };
      return `웹 검색 오류: ${err.message ?? '알 수 없는 오류'}. 네트워크 연결을 확인하거나 다른 검색어를 사용해 보세요.`;
    }
  },

  async web_search_news(input: {
    query: string;
    num_results?: number;
  }): Promise<string> {
    const num = Math.min(input.num_results ?? 5, 10);
    try {
      const encoded = encodeURIComponent(input.query);
      // DuckDuckGo News 검색 — df=w: 최근 1주일, ia=news 필터
      const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1&t=news&ia=news&df=m`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AI-Office2-Research-Agent/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // DuckDuckGo의 news 결과는 RelatedTopics 또는 별도 필드에 있을 수 있음
      const data = (await res.json()) as DuckDuckGoResult & DuckDuckGoNewsResult;

      const results: string[] = [];

      // news 전용 results 필드 처리
      if (data.results && Array.isArray(data.results)) {
        for (const item of (data.results as DuckDuckGoNewsItem[]).slice(0, num)) {
          const parts = [`📰 ${item.title ?? '제목 없음'}`];
          if (item.excerpt) parts.push(item.excerpt);
          if (item.source) parts.push(`출처: ${item.source}`);
          if (item.date || item.relativeTime) parts.push(`날짜: ${item.date ?? item.relativeTime}`);
          if (item.url) parts.push(`링크: ${item.url}`);
          results.push(parts.join('\n'));
        }
      }

      // fallback: 일반 RelatedTopics 사용
      if (results.length === 0 && data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, num)) {
          if (topic.Topics) {
            for (const sub of topic.Topics.slice(0, 3)) {
              if (sub.Text) results.push(`- ${sub.Text}${sub.FirstURL ? `\n  링크: ${sub.FirstURL}` : ''}`);
            }
          } else if (topic.Text) {
            results.push(`- ${topic.Text}${topic.FirstURL ? `\n  링크: ${topic.FirstURL}` : ''}`);
          }
          if (results.length >= num) break;
        }
      }

      if (results.length === 0) {
        return `'${input.query}' 최신 뉴스를 찾지 못했습니다. 일반 web_search를 사용하거나 다른 검색어를 시도해 보세요.`;
      }

      return `📰 최신 뉴스: "${input.query}"\n\n${results.join('\n\n---\n\n')}`;
    } catch (e: unknown) {
      const err = e as { message?: string };
      return `뉴스 검색 오류: ${err.message ?? '알 수 없는 오류'}. web_search를 대신 사용해 보세요.`;
    }
  },
};
