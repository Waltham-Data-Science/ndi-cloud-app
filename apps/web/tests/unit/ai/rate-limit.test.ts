/**
 * rate-limit.ts — per-IP token bucket for the experimental /ask
 * chat. In-memory + per-edge-instance, which means under traffic the
 * effective limit is `n × instances`; acceptable for a demo. If this
 * ever ships to prod we swap in Vercel KV (a 10-line change).
 *
 * Two layered limits:
 *   - Short window: 10 req / 10 min
 *   - Daily cap:    100 req / 24 h
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
      expect(result.bucket).toBe('short');
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

  it('resets the short bucket after the 10-minute window elapses', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('1.2.3.4');
    expect(checkRateLimit('1.2.3.4').ok).toBe(false);

    // Advance past the short window (but not the daily window).
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    const result = checkRateLimit('1.2.3.4');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Short bucket reset → 9 remaining short-side; daily has used 11
      // (10 admitted + 1 short-rejected NOT consuming daily because we
      // peek daily first only when daily is exhausted, otherwise admits
      // short rejects before daily increments). After the first 10
      // successful + 1 successful (post-reset) the daily count is 11.
      // remaining = min(short=9, daily=100-11=89) = 9.
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

  // --- Daily cap (2026-05-14 addition) -----------------------------

  describe('daily cap (100 req / 24h)', () => {
    it('rejects with bucket=daily once 100 requests pass the short window', () => {
      // Spend the daily budget by alternating: 10 quick + advance 10
      // minutes + 10 quick, etc. After 100 successful admits, the next
      // request should be rejected with bucket=daily.
      for (let group = 0; group < 10; group++) {
        for (let i = 0; i < 10; i++) {
          const r = checkRateLimit('1.2.3.4');
          expect(r.ok).toBe(true);
        }
        // Advance short window so the short bucket resets.
        vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      }
      const result = checkRateLimit('1.2.3.4');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.bucket).toBe('daily');
        // Within the 24h window remainder.
        expect(result.retryAfterSeconds).toBeGreaterThan(0);
        expect(result.retryAfterSeconds).toBeLessThanOrEqual(24 * 60 * 60);
      }
    });

    it('resets daily bucket after 24h elapses', () => {
      // Burn through the daily cap.
      for (let group = 0; group < 10; group++) {
        for (let i = 0; i < 10; i++) checkRateLimit('1.2.3.4');
        vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      }
      // Confirm rejected.
      expect(checkRateLimit('1.2.3.4').ok).toBe(false);

      // Advance past the full 24h window from time of first admit.
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);

      const r = checkRateLimit('1.2.3.4');
      expect(r.ok).toBe(true);
    });

    it('isolates daily buckets per IP', () => {
      // IP A burns its daily cap.
      for (let group = 0; group < 10; group++) {
        for (let i = 0; i < 10; i++) checkRateLimit('A');
        vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      }
      expect(checkRateLimit('A').ok).toBe(false);

      // IP B is fresh.
      const r = checkRateLimit('B');
      expect(r.ok).toBe(true);
    });

    it('remaining reflects the tighter of the two limits', () => {
      // First request: short has 9 left, daily has 99 left → min = 9.
      const r = checkRateLimit('1.2.3.4');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.remaining).toBe(9);
    });
  });
});
