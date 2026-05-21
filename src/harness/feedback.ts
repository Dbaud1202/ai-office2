import { HARNESS_CONFIG } from './config.js';

type ErrorClass = 'rate_limit' | 'server_error' | 'timeout' | 'auth_error' | 'invalid_request' | 'unknown';

function classifyError(error: unknown): ErrorClass {
  if (!(error instanceof Error)) return 'unknown';
  const msg = error.message.toLowerCase();
  if (msg.includes('rate limit') || msg.includes('429')) return 'rate_limit';
  if (msg.includes('500') || msg.includes('503') || msg.includes('overloaded')) return 'server_error';
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) return 'timeout';
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')) return 'auth_error';
  if (msg.includes('invalid') || msg.includes('400') || msg.includes('bad request')) return 'invalid_request';
  return 'unknown';
}

const RETRYABLE: ErrorClass[] = ['rate_limit', 'server_error', 'timeout', 'unknown'];

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? HARNESS_CONFIG.retry.maxAttempts;
  const baseDelay = options.baseDelayMs ?? HARNESS_CONFIG.retry.baseDelayMs;

  let lastError: Error = new Error('알 수 없는 오류');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const errorClass = classifyError(lastError);

      if (!RETRYABLE.includes(errorClass)) {
        throw lastError; // Fatal error — do not retry
      }

      if (attempt === maxAttempts) break;

      const delay = Math.min(
        baseDelay * Math.pow(2, attempt - 1),
        HARNESS_CONFIG.retry.maxDelayMs
      );
      options.onRetry?.(attempt, lastError);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
