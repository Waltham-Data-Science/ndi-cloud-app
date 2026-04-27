/**
 * cachedProxy — contract tests.
 *
 * The proxy sits between the client and Railway, applying edge-cache
 * headers so subsequent viewers don't re-pay the cold-start cost.
 * These tests pin the contract:
 *
 *   1. 2xx responses get `Cache-Control: public, s-maxage, swr` with
 *      the configured window.
 *   2. Non-2xx responses get `Cache-Control: no-store` (cache
 *      poisoning is the worst failure mode here).
 *   3. The proxy strips inbound cookies / auth so the cached response
 *      is identical for every viewer.
 *   4. Network errors return 502 with `no-store`.
 *   5. Two cache profiles ship: `CACHE_LIST` (5min/1hr) for catalog,
 *      `CACHE_ITEM` (60s/5min) for per-dataset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CACHE_ITEM,
  CACHE_LIST,
  cachedProxy,
} from '@/lib/api/proxy/cached-proxy';

// Force a deterministic upstream so the test asserts the URL the
// helper builds. Setting the env directly is fine — Vitest isolates
// per-file.
const ORIGINAL_INTERNAL = process.env.INTERNAL_API_URL;
const ORIGINAL_UPSTREAM = process.env.UPSTREAM_API_URL;

beforeEach(() => {
  process.env.INTERNAL_API_URL = 'https://railway.example.com';
  delete process.env.UPSTREAM_API_URL;
});

afterEach(() => {
  process.env.INTERNAL_API_URL = ORIGINAL_INTERNAL;
  process.env.UPSTREAM_API_URL = ORIGINAL_UPSTREAM;
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('cachedProxy', () => {
  it('forwards GET to the resolved upstream and re-emits the body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ totalNumber: 1, datasets: [] }));

    const res = await cachedProxy('/api/datasets/published?page=1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ totalNumber: 1, datasets: [] });

    // Upstream URL is the resolved INTERNAL_API_URL + the requested path.
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://railway.example.com/api/datasets/published?page=1',
      expect.any(Object),
    );
  });

  it('attaches public, s-maxage, stale-while-revalidate Cache-Control on 2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ ok: true }),
    );
    const res = await cachedProxy('/api/datasets/abc', CACHE_ITEM);
    expect(res.headers.get('cache-control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=300',
    );
  });

  it('uses CACHE_LIST window (5min fresh + 1hr swr) when passed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ totalNumber: 0, datasets: [] }),
    );
    const res = await cachedProxy('/api/datasets/published', CACHE_LIST);
    expect(res.headers.get('cache-control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=3600',
    );
  });

  it('emits Cache-Control: no-store on non-2xx (cache-poisoning protection)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not found', { status: 404 }),
    );
    const res = await cachedProxy('/api/datasets/missing');
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('strips inbound cookies + auth (anonymous-public projection)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await cachedProxy('/api/facets');

    // Verify the outbound request to Railway has no Cookie or
    // Authorization header — the proxy is anonymous on purpose so
    // every viewer gets the same cached response regardless of their
    // auth state.
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('accept')).toBe('application/json');
  });

  it('returns 502 with no-store on a network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new TypeError('Failed to fetch'),
    );
    const res = await cachedProxy('/api/datasets/published');
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.error).toBe('upstream_unreachable');
  });

  it('falls back to UPSTREAM_API_URL when INTERNAL_API_URL is unset', async () => {
    delete process.env.INTERNAL_API_URL;
    process.env.UPSTREAM_API_URL = 'https://upstream.example.com';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await cachedProxy('/api/facets');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://upstream.example.com/api/facets',
      expect.any(Object),
    );
  });

  it('strips trailing slash from the upstream base URL', async () => {
    process.env.INTERNAL_API_URL = 'https://railway.example.com/';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await cachedProxy('/api/facets');
    // No double-slash in the resolved URL.
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://railway.example.com/api/facets',
      expect.any(Object),
    );
  });

  it('preserves Vary: Accept-Encoding (no Vary on Cookie)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ ok: true }),
    );
    const res = await cachedProxy('/api/facets');
    // Vary on Accept-Encoding so gzip vs br aren't conflated; NOT on
    // Cookie because the response is identical for every viewer
    // regardless of cookie state.
    const vary = res.headers.get('vary');
    expect(vary).toContain('Accept-Encoding');
    expect(vary).not.toContain('Cookie');
  });
});
