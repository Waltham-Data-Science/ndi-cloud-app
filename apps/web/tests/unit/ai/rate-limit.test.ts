/**
 * rate-limit.ts — per-IP token bucket for the experimental /ask
 * chat. In-memory + per-edge-instance, which means under traffic the
 * effective limit is `n × instances`; acceptable for a demo. If this
 * ever ships to prod we swap in Vercel KV (a 10-line change).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit, _resetForTest } from '@/lib/ai/rate-limit';

describe('lib/ai/rate-limit', () => {
  beforeEach(() => {
    _resetForTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first request from a new IP', () => {
    const result = checkRateLimit('1.2.3.4');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.remaining).toBe(9);
    }
  });

  it('allows up to 10 requests in the 10-minute window', () => {
    for (let i = 0; i < 10; i++) {
      const result = checkRateLimit('1.2.3.4');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.remaining).toBe(9 - i);
      }
    }
  });

  it('rejects the 11th request in the same window', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('1.2.3.4');
    const result = checkRateLimit('1.2.3.4');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(600);
    }
  });

  it('isolates buckets per IP', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('1.2.3.4');
    // Different IP — fresh bucket.
    const result = checkRateLimit('5.6.7.8');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.remaining).toBe(9);
    }
  });

  it('resets the bucket after the 10-minute window elapses', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('1.2.3.4');
    expect(checkRateLimit('1.2.3.4').ok).toBe(false);

    // Advance past the window.
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    const result = checkRateLimit('1.2.3.4');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.remaining).toBe(9);
    }
  });

  it('treats missing IP as a shared "unknown" bucket', () => {
    // Defensive: edge functions sometimes can't determine the IP
    // (some proxies, dev mode). All those requests share one bucket
    // labeled "unknown" — prevents per-instance unbounded usage.
    for (let i = 0; i < 10; i++) checkRateLimit('unknown');
    const result = checkRateLimit('unknown');
    expect(result.ok).toBe(false);
  });
});
