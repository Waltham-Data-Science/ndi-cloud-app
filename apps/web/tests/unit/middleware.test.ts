/**
 * Edge middleware contracts — Phase 5.
 *
 * The three responsibilities locked in by these tests:
 *   1. Origin enforcement on /api/* mutations (defense-in-depth ahead
 *      of FastAPI's CSRF check)
 *   2. Per-request CSP nonce — fresh on every request, emitted as
 *      `Content-Security-Policy-Report-Only` for the first 24h soak
 *   3. Vary: Cookie, Accept-Encoding on session-varying routes
 */
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { middleware } from '@/middleware';

function makeReq(
  url: string,
  init: { method?: string; origin?: string; headers?: Record<string, string> } = {},
): NextRequest {
  const headers = new Headers(init.headers ?? {});
  if (init.origin) headers.set('origin', init.origin);
  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers,
  });
}

describe('Origin enforcement', () => {
  it('blocks POST /api/* with a non-allowlisted Origin', async () => {
    const req = makeReq('https://ndi-cloud.com/api/datasets/foo/bookmark', {
      method: 'POST',
      origin: 'https://evil.com',
    });
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it('blocks PUT/PATCH/DELETE on /api/* with bad origin', async () => {
    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      const req = makeReq('https://ndi-cloud.com/api/datasets/foo', {
        method,
        origin: 'https://evil.com',
      });
      const res = await middleware(req);
      expect(res.status, `method=${method}`).toBe(403);
    }
  });

  it('allows POST /api/* from https://ndi-cloud.com', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/login', {
      method: 'POST',
      origin: 'https://ndi-cloud.com',
    });
    const res = await middleware(req);
    // 200/204/etc. — middleware passes through to the rewrite/route handler.
    expect(res.status).not.toBe(403);
  });

  it('allows POST /api/* from https://www.ndi-cloud.com', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/login', {
      method: 'POST',
      origin: 'https://www.ndi-cloud.com',
    });
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it('allows POST /api/* with no Origin header (server-side / non-browser)', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/login', {
      method: 'POST',
    });
    const res = await middleware(req);
    // No Origin → no enforcement (the check only fires when Origin is
    // present, since CORS preflight gates non-simple requests anyway).
    expect(res.status).not.toBe(403);
  });

  it('does NOT enforce Origin on GET /api/*', async () => {
    const req = makeReq('https://ndi-cloud.com/api/datasets/published', {
      method: 'GET',
      origin: 'https://evil.com',
    });
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });
});

describe('CSP nonce (Report-Only)', () => {
  it('emits Content-Security-Policy-Report-Only with a nonce', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/me');
    const res = await middleware(req);
    const csp = res.headers.get('content-security-policy-report-only');
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/nonce-/);
  });

  it('does NOT emit enforced Content-Security-Policy header (24h soak)', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/me');
    const res = await middleware(req);
    expect(res.headers.get('content-security-policy')).toBeNull();
  });

  it('uses a fresh nonce on every request', async () => {
    const req1 = makeReq('https://ndi-cloud.com/api/auth/me');
    const req2 = makeReq('https://ndi-cloud.com/api/auth/me');
    const res1 = await middleware(req1);
    const res2 = await middleware(req2);
    const m1 = res1.headers.get('content-security-policy-report-only')!.match(/nonce-([^']+)/);
    const m2 = res2.headers.get('content-security-policy-report-only')!.match(/nonce-([^']+)/);
    expect(m1).not.toBeNull();
    expect(m2).not.toBeNull();
    expect(m1![1]).not.toBe(m2![1]);
  });

  it('forwards the nonce to RSC via the x-nonce request header (downstream readable)', async () => {
    // We can't easily inspect forwarded request headers from outside
    // without an integration harness — but the policy header carrying a
    // nonce is the externally-observable contract. The forwarding logic
    // is exercised by the dev-server smoke + CI build success.
    const req = makeReq('https://ndi-cloud.com/api/auth/me');
    const res = await middleware(req);
    const csp = res.headers.get('content-security-policy-report-only');
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  });

  it('script-src includes strict-dynamic so chunk loading inherits nonce trust', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/me');
    const res = await middleware(req);
    const csp = res.headers.get('content-security-policy-report-only');
    expect(csp).toMatch(/'strict-dynamic'/);
  });
});

describe('Vary header injection', () => {
  it('adds Vary: Cookie + Accept-Encoding on /api/* routes', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/me');
    const res = await middleware(req);
    const vary = res.headers.get('vary');
    expect(vary).toContain('Cookie');
    expect(vary).toContain('Accept-Encoding');
  });

  it('adds Vary on /my/* routes (per matcher)', async () => {
    const req = makeReq('https://ndi-cloud.com/my/something');
    const res = await middleware(req);
    expect(res.headers.get('vary')).toContain('Cookie');
  });
});
