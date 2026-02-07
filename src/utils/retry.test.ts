import { describe, expect, it, vi } from 'vitest';
import { withRetry, isNetworkRetryable } from './retry';

describe('withRetry', () => {
  it('returns result on first successful call', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { label: 'test' });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelay: 10,
      label: 'test',
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after max retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always-fail'));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelay: 10, label: 'test' })
    ).rejects.toThrow('always-fail');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry when isRetryable returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('client-error'));

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        baseDelay: 10,
        isRetryable: () => false,
        label: 'test',
      })
    ).rejects.toThrow('client-error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects maxDelay with exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const start = Date.now();
    await withRetry(fn, {
      maxRetries: 1,
      baseDelay: 50,
      maxDelay: 100,
      exponentialBackoff: true,
      label: 'test',
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // at least ~50ms delay
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('isNetworkRetryable', () => {
  it('returns true for 500 server errors', () => {
    expect(isNetworkRetryable({ status: 500 })).toBe(true);
    expect(isNetworkRetryable({ status: 502 })).toBe(true);
    expect(isNetworkRetryable({ status: 503 })).toBe(true);
  });

  it('returns true for 429 rate limit', () => {
    expect(isNetworkRetryable({ status: 429 })).toBe(true);
  });

  it('returns false for 4xx client errors (except 429)', () => {
    expect(isNetworkRetryable({ status: 400 })).toBe(false);
    expect(isNetworkRetryable({ status: 401 })).toBe(false);
    expect(isNetworkRetryable({ status: 403 })).toBe(false);
    expect(isNetworkRetryable({ status: 404 })).toBe(false);
    expect(isNetworkRetryable({ status: 422 })).toBe(false);
  });

  it('returns true for unknown errors', () => {
    expect(isNetworkRetryable(new Error('unknown'))).toBe(true);
    expect(isNetworkRetryable(null)).toBe(true);
  });
});
