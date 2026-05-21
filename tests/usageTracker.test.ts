/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDailyHistory, recordUsage } from '../src/utils/usageTracker.js';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usageTracker resilience', () => {
  it('repairs malformed usage data while recording new usage', () => {
    localStorage.setItem(
      'ao2-usage-v1',
      JSON.stringify({
        daily: [
          { date: '2026-05-13', providers: null },
          { date: '2026-05-14', providers: { claude: { messages: 'bad', inputTokens: 4 } } },
        ],
        session: { claude: null },
      })
    );

    expect(() =>
      recordUsage({
        providerId: 'claude',
        inputChars: 16,
        outputChars: 8,
        model: 'claude-sonnet-4-6',
      })
    ).not.toThrow();

    const today = getDailyHistory(1)[0];
    expect(today.providers.claude?.messages).toBe(1);
    expect(today.providers.claude?.inputTokens).toBe(4);
    expect(today.providers.claude?.outputTokens).toBe(2);
  });

  it('does not throw when usage storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(() =>
      recordUsage({
        providerId: 'openai',
        inputChars: 4,
        outputChars: 4,
        model: 'gpt-4o-mini',
      })
    ).not.toThrow();
  });
});
