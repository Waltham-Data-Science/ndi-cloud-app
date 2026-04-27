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
import { z } from 'zod';

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
    it('forwards a composite AbortSignal so caller cancellation aborts the request', async () => {
      // apiFetch now composes the caller's signal with its own
      // default-timeout signal via `AbortSignal.any`, so the signal
      // that reaches `fetch()` is a NEW signal (not reference-equal
      // to `controller.signal`). What matters is functional: when
      // the caller aborts, the composite aborts.
      const controller = new AbortController();
      fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
      await apiFetch('/api/datasets/published', { signal: controller.signal });

      const init = lastCallInit(fetchSpy);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.signal!.aborted).toBe(false);
      controller.abort('caller cancellation');
      expect(init.signal!.aborted).toBe(true);
    });

    it('passes the caller signal through unchanged when timeoutMs=0 (opt-out path)', async () => {
      // `timeoutMs: 0` disables the default timeout — no signal
      // composition happens, the caller's signal reaches fetch
      // verbatim. Used by long-running exports that take ownership
      // of the cancellation contract.
      const controller = new AbortController();
      fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
      await apiFetch('/api/datasets/published', {
        signal: controller.signal,
        timeoutMs: 0,
      });

      const init = lastCallInit(fetchSpy);
      expect(init.signal).toBe(controller.signal);
    });

    it('attaches a timeout signal when no caller signal is provided', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
      await apiFetch('/api/datasets/published');

      const init = lastCallInit(fetchSpy);
      // The default-timeout signal is the only signal; it's an
      // AbortSignal that will fire after DEFAULT_READ_TIMEOUT_MS.
      // Asserting presence + type — exact ms is implementation
      // detail that doesn't belong in a unit test.
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('throws ApiError(0, CLOUD_TIMEOUT) when the upstream exceeds the timeout', async () => {
      // Simulate fetch hanging past the timeout: mock fetch to throw
      // an AbortError after the timeout fires.
      fetchSpy.mockImplementationOnce(async (_url: unknown, init: unknown) => {
        const signal = (init as RequestInit).signal as AbortSignal;
        // Wait for the signal to abort, then throw the same shape the
        // platform fetch would.
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error(
              signal.reason
                ? String(signal.reason)
                : 'aborted',
            );
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      try {
        await apiFetch('/api/slow-endpoint', { timeoutMs: 50 });
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(0);
        expect(apiErr.code).toBe('CLOUD_TIMEOUT');
        expect(apiErr.recovery).toBe('retry');
      }
    });

    it('propagates AbortError when the caller cancels (not converted to CLOUD_TIMEOUT)', async () => {
      // When the CALLER cancels (e.g., TanStack Query unmount), the
      // failure should propagate as the original AbortError so React-
      // Query treats it as a cancellation. Only the apiFetch-internal
      // timeout maps to CLOUD_TIMEOUT.
      const controller = new AbortController();
      fetchSpy.mockImplementationOnce(async (_url: unknown, init: unknown) => {
        const signal = (init as RequestInit).signal as AbortSignal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const fetchPromise = apiFetch('/api/some-endpoint', {
        signal: controller.signal,
        timeoutMs: 60_000, // long enough that the caller wins
      });
      controller.abort();

      try {
        await fetchPromise;
        throw new Error('expected to throw');
      } catch (err) {
        // AbortError, not ApiError — that's the contract for caller
        // cancellation.
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).name).toBe('AbortError');
        expect(err).not.toBeInstanceOf(ApiError);
      }
    });

    it('wraps a generic network failure as ApiError(0, CLOUD_UNREACHABLE) with retry recovery', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      try {
        await apiFetch('/api/some-endpoint');
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(0);
        expect(apiErr.code).toBe('CLOUD_UNREACHABLE');
        expect(apiErr.recovery).toBe('retry');
      }
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

  describe('zod schema validation (CQ1)', () => {
    // The audit (synthesis §CQ1) flagged that `apiFetch<T>` is a pure
    // cast — the runtime response could be any shape and TypeScript
    // would happily believe it matches `T`. A backend rename, a missing
    // field, or a type drift that wasn't caught by the build would
    // surface as a downstream null-deref (or worse, silent wrong data)
    // without any signal back to the caller. The optional `schema`
    // option closes that gap with runtime validation on 2xx responses.
    //
    // The contract:
    // - `schema` is optional; absence preserves the Phase 2b behavior
    //   (pure cast, zero runtime cost).
    // - When set, `schema.parse(json)` runs after JSON.parse; the
    //   parsed value is what `apiFetch` returns. The schema can
    //   transform / strip extras / coerce — zod handles that.
    // - On schema failure, `apiFetch` throws `ApiError(200, { code:
    //   'RESPONSE_SHAPE_INVALID', ... })`. Status is 200 because the
    //   wire was 200 — the body just didn't match. Consumers handle
    //   it the same way they handle any other typed `ApiError`.
    // - Schema is only consulted on 2xx with JSON bodies. 204s, error
    //   bodies, and non-JSON 2xx responses are unaffected.
    //
    // Schema kept as a structural type (`{ parse: (data: unknown) =>
    // T }`) so the wrapper is zod-version-agnostic — any library that
    // exposes a `parse` method works.

    it('returns the parsed value when the schema matches the response', async () => {
      const schema = z.object({ id: z.string(), email: z.string() });
      fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'u-1', email: 'a@b.com' }));

      const result = await apiFetch('/api/auth/me', { schema });
      expect(result).toEqual({ id: 'u-1', email: 'a@b.com' });
    });

    it('strips fields not in the schema (zod-driven sanitization)', async () => {
      // If the backend adds a field (e.g. logging it leaks here),
      // strip it client-side. zod's default `.parse()` strips by
      // omission unless `.passthrough()` is opted into.
      const schema = z.object({ id: z.string() });
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ id: 'u-1', secretBackendField: 'should-not-survive' }),
      );

      const result = await apiFetch<{ id: string }>('/api/auth/me', { schema });
      expect(result).toEqual({ id: 'u-1' });
      expect(result).not.toHaveProperty('secretBackendField');
    });

    it('throws ApiError(200, RESPONSE_SHAPE_INVALID) when the schema fails', async () => {
      const schema = z.object({ id: z.string(), email: z.string() });
      fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'u-1' /* email missing */ }));

      try {
        await apiFetch('/api/auth/me', { schema });
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(200);
        expect(apiErr.code).toBe('RESPONSE_SHAPE_INVALID');
        // recovery=contact_support — the backend shipped a bad shape;
        // a retry won't fix that. UI surfaces the requestId for support.
        expect(apiErr.recovery).toBe('contact_support');
      }
    });

    it('does not call schema.parse when no schema is provided (zero overhead)', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'u-1' }));
      const result = await apiFetch<{ id: string }>('/api/auth/me');
      expect(result).toEqual({ id: 'u-1' });
    });

    it('does not validate 204 No Content responses (no body to parse)', async () => {
      const schema = z.object({ id: z.string() });
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const result = await apiFetch('/api/auth/logout', { method: 'POST', schema });
      expect(result).toBeUndefined();
    });

    it('does not validate non-JSON 2xx responses', async () => {
      // Plain-text 200s (e.g. binary/text endpoints) bypass schema
      // since there's no JSON to validate. Caller chose `schema` for
      // a JSON endpoint; if they get text back the cast surface
      // collapses but there's no schema to apply.
      const schema = z.object({ id: z.string() });
      fetchSpy.mockResolvedValueOnce(
        new Response('plain text body', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      );

      const result = await apiFetch('/api/some/text-endpoint', { schema });
      expect(result).toBe('plain text body');
    });
  });
});
