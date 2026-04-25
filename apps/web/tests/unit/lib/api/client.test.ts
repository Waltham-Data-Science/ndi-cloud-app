/**
 * apiFetch — Phase 3a contract tests.
 *
 * Phase 2b shipped a minimum-viable apiFetch. Phase 3a extends it with:
 *  - ensureCsrfToken bootstrap when the XSRF-TOKEN cookie is missing
 *    (matches data-browser's PR #76 behavior — every mutation on a cold
 *    session would otherwise fail the FastAPI's CSRF gate)
 *  - typed error catalog (ErrorCode + Recovery + requestId surfaced on
 *    ApiError; FastAPI's `{ error: { ... } }` envelope unwrapped into
 *    the inner shape so consumers match on err.code without dotted paths)
 *  - idempotencyKey support (carried through as X-Idempotency-Key)
 *
 * The audit-2026-04-23 gate this PR proves: the CSRF flow is **double-
 * submit** (server set the non-HttpOnly XSRF-TOKEN cookie at session-
 * establish; JS reads it via document.cookie; echoes it in
 * X-XSRF-TOKEN; server checks header matches cookie). The legacy
 * "fetch a fresh token per mutation" pattern is explicitly NOT used:
 * test #1 asserts /api/auth/csrf is never called when the cookie is
 * already set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from '@/lib/api/client';

function clearAllCookies() {
  if (typeof document === 'undefined') return;
  for (const c of document.cookie.split(';')) {
    const eq = c.indexOf('=');
    const name = (eq === -1 ? c : c.slice(0, eq)).trim();
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
}

function lastCallInit(spy: ReturnType<typeof vi.spyOn>): RequestInit {
  const calls = spy.mock.calls;
  return (calls[calls.length - 1]![1] ?? {}) as RequestInit;
}

function headerOf(init: RequestInit, name: string): string | null {
  const headers = init.headers;
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(name);
  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k.toLowerCase() === name.toLowerCase());
    return found ? found[1] : null;
  }
  // Plain object
  const rec = headers as Record<string, string>;
  for (const k of Object.keys(rec)) {
    if (k.toLowerCase() === name.toLowerCase()) return rec[k] ?? null;
  }
  return null;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('apiFetch — Phase 3a contract', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearAllCookies();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearAllCookies();
  });

  describe('CSRF double-submit', () => {
    it('echoes XSRF-TOKEN cookie value in X-XSRF-TOKEN header on POST (no bootstrap when cookie present)', async () => {
      document.cookie = 'XSRF-TOKEN=abc123; path=/';
      await apiFetch('/api/datasets/foo/bookmark', { method: 'POST' });

      // Audit gate: NOT a per-request token fetch. Bootstrap path must not fire.
      const csrfBootstrapCalls = (fetchSpy.mock.calls as Array<[unknown, ...unknown[]]>).filter(
        (c) => String(c[0]).includes('/api/auth/csrf'),
      );
      expect(csrfBootstrapCalls).toHaveLength(0);

      const init = lastCallInit(fetchSpy);
      expect(headerOf(init, 'X-XSRF-TOKEN')).toBe('abc123');
      expect(init.credentials).toBe('include');
    });

    it('bootstraps via /api/auth/csrf when cookie missing on POST mutation', async () => {
      // First fetch call → /api/auth/csrf bootstrap. Server sets cookie.
      // Second fetch call → the actual mutation, with header set from bootstrapped value.
      fetchSpy
        .mockImplementationOnce(async () => {
          // Simulate server setting the cookie via Set-Cookie
          document.cookie = 'XSRF-TOKEN=fresh-token-xyz; path=/';
          return jsonResponse({ csrfToken: 'fresh-token-xyz' });
        })
        .mockImplementationOnce(async () => new Response(null, { status: 204 }));

      await apiFetch('/api/datasets/foo/bookmark', { method: 'POST' });

      // First call should be the bootstrap GET to /api/auth/csrf
      const firstCall = fetchSpy.mock.calls[0]!;
      expect(String(firstCall[0])).toContain('/api/auth/csrf');

      // Second call is the mutation, with header set
      const secondCall = fetchSpy.mock.calls[1]!;
      expect(String(secondCall[0])).toBe('/api/datasets/foo/bookmark');
      const init = secondCall[1] as RequestInit;
      expect(headerOf(init, 'X-XSRF-TOKEN')).toBe('fresh-token-xyz');
    });

    it('does not bootstrap or set header on GET (CSRF only protects mutations)', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
      await apiFetch('/api/datasets/published');

      const csrfBootstrapCalls = (fetchSpy.mock.calls as Array<[unknown, ...unknown[]]>).filter(
        (c) => String(c[0]).includes('/api/auth/csrf'),
      );
      expect(csrfBootstrapCalls).toHaveLength(0);

      const init = lastCallInit(fetchSpy);
      expect(headerOf(init, 'X-XSRF-TOKEN')).toBeNull();
    });
  });

  describe('response handling', () => {
    it('returns undefined on 204 No Content', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
      const result = await apiFetch('/api/auth/logout', { method: 'POST' });
      expect(result).toBeUndefined();
    });

    it('parses JSON body on 200', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'u-1', email: 'a@b.com' }));
      const result = await apiFetch<{ id: string; email: string }>('/api/auth/me');
      expect(result).toEqual({ id: 'u-1', email: 'a@b.com' });
    });
  });

  describe('error handling', () => {
    it('unwraps FastAPI envelope `{ error: { code, message, recovery, requestId } }` into typed ApiError', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'AUTH_EXPIRED',
              message: 'Session expired, please sign in again',
              recovery: 'login',
              requestId: 'req-abc-123',
            },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      );

      await expect(apiFetch('/api/datasets/published')).rejects.toMatchObject({
        status: 401,
        code: 'AUTH_EXPIRED',
        recovery: 'login',
        requestId: 'req-abc-123',
        message: 'Session expired, please sign in again',
      });
    });

    it('handles flat error shape `{ code, message }` (Phase 2b backward-compat)', async () => {
      // Pre-seed the cookie so the POST doesn't trigger a bootstrap GET
      // (which would consume the mock and leave the actual login call uncovered).
      document.cookie = 'XSRF-TOKEN=t1; path=/';
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'invalid_credentials', message: 'Bad password' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await expect(
        apiFetch('/api/auth/login', { method: 'POST', body: { email: 'a', password: 'b' } }),
      ).rejects.toMatchObject({
        status: 401,
        code: 'invalid_credentials',
      });
    });

    it('falls back to code="unknown" on non-JSON error body', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));

      try {
        await apiFetch('/api/datasets/published');
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(500);
        expect((err as ApiError).code).toBe('unknown');
      }
    });
  });

  describe('options', () => {
    it('forwards AbortSignal so consumers can cancel in-flight requests', async () => {
      const controller = new AbortController();
      fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
      await apiFetch('/api/datasets/published', { signal: controller.signal });

      const init = lastCallInit(fetchSpy);
      expect(init.signal).toBe(controller.signal);
    });

    it('sets X-Idempotency-Key header when idempotencyKey option is supplied', async () => {
      document.cookie = 'XSRF-TOKEN=t1; path=/';
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await apiFetch('/api/datasets/foo/bookmark', {
        method: 'POST',
        idempotencyKey: 'key-2026-04-25-001',
      });

      const init = lastCallInit(fetchSpy);
      expect(headerOf(init, 'X-Idempotency-Key')).toBe('key-2026-04-25-001');
    });

    it('JSON-encodes plain-object bodies and sets Content-Type', async () => {
      document.cookie = 'XSRF-TOKEN=t1; path=/';
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { email: 'a@b.com', password: 'pw' },
      });

      const init = lastCallInit(fetchSpy);
      expect(headerOf(init, 'Content-Type')).toBe('application/json');
      expect(init.body).toBe(JSON.stringify({ email: 'a@b.com', password: 'pw' }));
    });
  });
});
