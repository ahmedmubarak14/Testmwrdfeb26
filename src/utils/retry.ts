import { logger } from './logger';

interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms between retries (default: 1000) */
  baseDelay?: number;
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean;
  /** Maximum delay in ms (default: 10000) */
  maxDelay?: number;
  /** Function to determine if the error is retryable (default: all errors) */
  isRetryable?: (error: unknown) => boolean;
  /** Label for logging purposes */
  label?: string;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  exponentialBackoff: true,
  maxDelay: 10000,
  isRetryable: () => true,
  label: 'operation',
};

/**
 * Wraps an async function with retry logic and exponential backoff.
 *
 * @example
 * const data = await withRetry(() => api.getUsers(), { label: 'getUsers', maxRetries: 2 });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === opts.maxRetries;
      const isRetryable = opts.isRetryable(error);

      if (isLastAttempt || !isRetryable) {
        break;
      }

      const delay = opts.exponentialBackoff
        ? Math.min(opts.baseDelay * Math.pow(2, attempt), opts.maxDelay)
        : opts.baseDelay;

      logger.warn(
        `[Retry] ${opts.label} failed (attempt ${attempt + 1}/${opts.maxRetries + 1}), retrying in ${delay}ms`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Default retryable check for network/API errors.
 * Returns true for network errors, 5xx server errors, and 429 rate limit errors.
 * Returns false for 4xx client errors (except 429).
 */
export function isNetworkRetryable(error: unknown): boolean {
  // Network errors (no response)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Supabase errors with status codes
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    // Retry on server errors (5xx) and rate limits (429)
    if (status >= 500 || status === 429) return true;
    // Don't retry on client errors (4xx except 429)
    if (status >= 400 && status < 500) return false;
  }

  // Default: retry on unknown errors
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
