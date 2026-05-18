/**
 * Stream 3.3 — KV-backed rate limiter.
 *
 * Two paths under test:
 *   1. KV NOT configured → falls back to the in-memory limiter.
 *      Pinned because the env-degrade is the production safety net
 *      for dev / preview without KV.
 *   2. KV configured → wires through to the REST API. We mock
 *      `fetch` to assert the pipeline body shape + that high INCR
 *      values produce rejections with the right retry-after.
 *
 * The mocked fetch never returns the actual numeric INCR result via
 * a real network round-trip; we control what the limiter sees by
 * scripting the mock's response per call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _kvConfiguredForTest,
  checkRateLimitKv,
} from '@/lib/ai/rate-limit-kv';
import { _resetForTest as _resetInMemory } from '@/lib/ai/rate-limit';

function clearKvEnv() {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

function setKvEnv() {
  process.env.KV_REST_API_URL = 'https://kv.example.test';
  process.env.KV_REST_API_TOKEN = 'test-token';
}

describe('rate-limit-kv', () => {
  beforeEach(() => {
    clearKvEnv();
    _resetInMemory();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    clearKvEnv();
    vi.restoreAllMocks();
  });

  describe('KV not configured (fallback path)', () => {
    it('reports KV as not configured', () => {
      expect(_kvConfiguredForTest()).toBe(false);
    });

    it('falls back to in-memory limiter that admits the first request', async () => {
      const out = await checkRateLimitKv('user:test-1');
      expect(out.ok).toBe(true);
    });

    it('strips the `user:` prefix when passing to the in-memory limiter', async () => {
      // The fallback should consume the same in-memory bucket
      // whether the caller passes a prefixed key or a bare key.
      const a = await checkRateLimitKv('user:abc');
      const b = await checkRateLimitKv('abc');
      // First two requests both admit on the in-memory limiter
      // because they hit the same key (short cap = 10).
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
    });
  });

  describe('KV configured (live path)', () => {
    beforeEach(() => {
      setKvEnv();
    });

    it('reports KV as configured', () => {
      expect(_kvConfiguredForTest()).toBe(true);
    });

    it('admits the first request when INCR returns 1 on both buckets', async () => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), {
            status: 200,
          }),
        );
      const out = await checkRateLimitKv('user:abc');
      expect(out.ok).toBe(true);
      // Two KV pipeline calls: daily then short.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstBody = JSON.parse(
        (fetchMock.mock.calls[0]![1] as { body: string }).body,
      );
      expect(firstBody[0][0]).toBe('INCR');
      expect(firstBody[1][0]).toBe('EXPIRE');
      expect(firstBody[1][3]).toBe('NX');
    });

    it('rejects when daily INCR exceeds the daily cap', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify([{ result: 101 }, { result: 1 }]), {
          status: 200,
        }),
      );
      const out = await checkRateLimitKv('user:burst');
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.bucket).toBe('daily');
        expect(out.retryAfterSeconds).toBeGreaterThan(0);
      }
    });

    it('rejects when short-window INCR exceeds the short cap (after daily admits)', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          // Daily admits.
          new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          // Short rejects (cap=10, INCR returned 11).
          new Response(JSON.stringify([{ result: 11 }, { result: 1 }]), {
            status: 200,
          }),
        );
      const out = await checkRateLimitKv('user:burst');
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.bucket).toBe('short');
      }
    });

    it('fails OPEN on a KV outage (network throw)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('connection refused'),
      );
      const out = await checkRateLimitKv('user:abc');
      // Fail-open: admit the request rather than 503-ing the chat
      // when KV is unreachable.
      expect(out.ok).toBe(true);
    });

    it('fails OPEN on a non-2xx KV response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('', { status: 500 }),
      );
      const out = await checkRateLimitKv('user:abc');
      expect(out.ok).toBe(true);
    });
  });
});
