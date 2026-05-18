/**
 * Phase 2 auth-forwarding contract — verifies that the shared tool
 * infrastructure correctly extracts auth headers from a Request and
 * threads them through to outbound fetch calls.
 *
 * This is the regression test for the silent-failure-on-private-data
 * bug from the 2026-05-14 architecture audit: workspace wrapper routes
 * were dropping Cookie + X-XSRF-TOKEN on the floor, so private-dataset
 * reads from the auth-gated workspace silently returned anonymous
 * (i.e. public-only) results.
 *
 * Three layers covered:
 *   1. `authHeadersFromRequest` returns the right shape for the three
 *      cases (both headers, one header, neither header).
 *   2. `fetchJson(url, ctx)` merges ctx.authHeaders into the outbound
 *      GET headers.
 *   3. `postJson(url, body, ctx)` merges them into the outbound POST
 *      headers alongside Content-Type + Origin.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authHeadersFromRequest,
  fetchJson,
  postJson,
} from '@/lib/ndi/tools/shared';

function makeRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost/test', {
    headers: new Headers(headers),
  });
}

describe('authHeadersFromRequest', () => {
  it('returns Cookie + X-XSRF-TOKEN when both are present', () => {
    const req = makeRequest({
      cookie: 'session=abc; xsrf=def',
      'x-xsrf-token': 'def',
    });
    expect(authHeadersFromRequest(req)).toEqual({
      Cookie: 'session=abc; xsrf=def',
      'X-XSRF-TOKEN': 'def',
    });
  });

  it('returns just Cookie when X-XSRF-TOKEN is absent', () => {
    const req = makeRequest({ cookie: 'session=abc' });
    expect(authHeadersFromRequest(req)).toEqual({ Cookie: 'session=abc' });
  });

  it('returns just X-XSRF-TOKEN when Cookie is absent', () => {
    const req = makeRequest({ 'x-xsrf-token': 'def' });
    expect(authHeadersFromRequest(req)).toEqual({ 'X-XSRF-TOKEN': 'def' });
  });

  it('returns undefined when neither header is present (the anonymous case)', () => {
    const req = makeRequest({});
    expect(authHeadersFromRequest(req)).toBeUndefined();
  });
});

describe('fetchJson auth-context forwarding', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('omits auth headers entirely when ctx is undefined (chat anonymous path)', async () => {
    await fetchJson<unknown>('http://upstream/x');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/json');
    expect(headers.Cookie).toBeUndefined();
    expect(headers['X-XSRF-TOKEN']).toBeUndefined();
  });

  it('merges ctx.authHeaders into the GET headers (workspace auth path)', async () => {
    await fetchJson<unknown>('http://upstream/x', {
      authHeaders: { Cookie: 'session=abc', 'X-XSRF-TOKEN': 'def' },
    });
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/json');
    expect(headers.Cookie).toBe('session=abc');
    expect(headers['X-XSRF-TOKEN']).toBe('def');
  });
});

describe('postJson auth-context forwarding', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the body + Content-Type + Origin even without auth', async () => {
    await postJson<unknown>('http://upstream/y', { scope: 'public' });
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(init.method).toBe('POST');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Origin).toBe('https://ndi-cloud.com');
    expect(headers.Cookie).toBeUndefined();
    expect(init.body).toBe('{"scope":"public"}');
  });

  it('merges auth headers into POST without dropping Origin or Content-Type', async () => {
    await postJson<unknown>(
      'http://upstream/y',
      { scope: 'public' },
      { authHeaders: { Cookie: 'session=abc' } },
    );
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Origin).toBe('https://ndi-cloud.com');
    expect(headers.Cookie).toBe('session=abc');
  });
});
