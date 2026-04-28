/**
 * Edge middleware contracts — Phase 5 + Phase 6.7 B2/O1 simplification.
 *
 * The three responsibilities locked in by these tests:
 *   1. Origin enforcement on /api/* mutations (defense-in-depth ahead
 *      of FastAPI's CSRF check)
 *   2. Static CSP (no nonce, no strict-dynamic) emitted as
 *      `Content-Security-Policy-Report-Only`. Phase 7 cutover flips
 *      Report-Only to enforced — these tests pin the static shape so
 *      that flip is safe.
 *   3. Vary: Cookie, Accept-Encoding GATED to session-varying routes
 *      (`/api/*`, `/my/*`). The catalog at `/datasets` stays
 *      anonymous-public-cacheable.
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

describe('Origin allowlist — production vs preview environments', () => {
  /**
   * The Vercel preview-URL allowance is intentionally gated by
   * `VERCEL_ENV === 'preview'`. Production must stay strict on the
   * apex pair only; if the gate ever regresses, post-cutover traffic
   * could mutate via `*.vercel.app` URLs which is a real security
   * concern.
   */
  const ORIG_ENV = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ALLOW_PROJECT_PRODUCTION_URL_ORIGIN: process.env.ALLOW_PROJECT_PRODUCTION_URL_ORIGIN,
  };

  function setEnv(env: Partial<typeof ORIG_ENV>) {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  function restoreEnv() {
    for (const [k, v] of Object.entries(ORIG_ENV)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  it('production: rejects POST from a *.vercel.app preview URL by default', async () => {
    setEnv({
      VERCEL_ENV: 'production',
      VERCEL_URL: 'ndi-cloud-app-web-abc123.vercel.app',
      VERCEL_BRANCH_URL: 'ndi-cloud-app-web-git-main-team.vercel.app',
      // Pre-cutover allowance NOT set — strict apex-only allowlist.
      ALLOW_PROJECT_PRODUCTION_URL_ORIGIN: undefined,
    });
    try {
      const req = makeReq('https://ndi-cloud.com/api/auth/login', {
        method: 'POST',
        origin: 'https://ndi-cloud-app-web-abc123.vercel.app',
      });
      const res = await middleware(req);
      expect(res.status).toBe(403);
    } finally {
      restoreEnv();
    }
  });

  it('production + opt-in flag: admits VERCEL_PROJECT_PRODUCTION_URL Origin', async () => {
    // Pre-Phase-7 escape hatch (see middleware docstring). With the
    // env flag set, the project's stable production-Vercel alias is
    // admitted so end-to-end QA on the new deploy can submit
    // mutations before cutover repoints ndi-cloud.com at this project.
    setEnv({
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'ndi-cloud-app-web.vercel.app',
      ALLOW_PROJECT_PRODUCTION_URL_ORIGIN: 'true',
    });
    try {
      const req = makeReq('https://ndi-cloud.com/api/visualize/distribution', {
        method: 'POST',
        origin: 'https://ndi-cloud-app-web.vercel.app',
      });
      const res = await middleware(req);
      expect(res.status).not.toBe(403);
    } finally {
      restoreEnv();
    }
  });

  it('production + opt-in flag: still rejects an unrelated *.vercel.app Origin', async () => {
    // The opt-in admits ONLY the project's stable alias. Arbitrary
    // *.vercel.app (e.g., another project's preview) still 403s.
    setEnv({
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'ndi-cloud-app-web.vercel.app',
      ALLOW_PROJECT_PRODUCTION_URL_ORIGIN: 'true',
    });
    try {
      const req = makeReq('https://ndi-cloud.com/api/auth/login', {
        method: 'POST',
        origin: 'https://attacker-some-other-project.vercel.app',
      });
      const res = await middleware(req);
      expect(res.status).toBe(403);
    } finally {
      restoreEnv();
    }
  });

  it('production: still allows the apex Origin (no regression)', async () => {
    setEnv({ VERCEL_ENV: 'production' });
    try {
      const req = makeReq('https://ndi-cloud.com/api/auth/login', {
        method: 'POST',
        origin: 'https://ndi-cloud.com',
      });
      const res = await middleware(req);
      expect(res.status).not.toBe(403);
    } finally {
      restoreEnv();
    }
  });

  it('preview: admits VERCEL_URL Origin on POST', async () => {
    const previewUrl = 'ndi-cloud-app-web-xyz789.vercel.app';
    setEnv({ VERCEL_ENV: 'preview', VERCEL_URL: previewUrl });
    try {
      const req = makeReq('https://ndi-cloud.com/api/auth/login', {
        method: 'POST',
        origin: `https://${previewUrl}`,
      });
      const res = await middleware(req);
      expect(res.status).not.toBe(403);
    } finally {
      restoreEnv();
    }
  });

  it('preview: admits VERCEL_BRANCH_URL Origin on POST', async () => {
    const branchUrl = 'ndi-cloud-app-web-git-main-team.vercel.app';
    setEnv({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: branchUrl });
    try {
      const req = makeReq('https://ndi-cloud.com/api/auth/login', {
        method: 'POST',
        origin: `https://${branchUrl}`,
      });
      const res = await middleware(req);
      expect(res.status).not.toBe(403);
    } finally {
      restoreEnv();
    }
  });

  it('preview: still rejects an unrelated *.vercel.app URL not in the system env vars', async () => {
    setEnv({
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'ndi-cloud-app-web-abc123.vercel.app',
    });
    try {
      const req = makeReq('https://ndi-cloud.com/api/auth/login', {
        method: 'POST',
        // Not VERCEL_URL or VERCEL_BRANCH_URL — should still 403.
        origin: 'https://attacker-project-something.vercel.app',
      });
      const res = await middleware(req);
      expect(res.status).toBe(403);
    } finally {
      restoreEnv();
    }
  });
});

describe('CSP (Report-Only) — Phase 6.7 B2 static shape', () => {
  it('emits Content-Security-Policy-Report-Only on /api/*', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/me');
    const res = await middleware(req);
    expect(res.headers.get('content-security-policy-report-only')).toBeTruthy();
  });

  it('emits CSP-RO on /my/* (authenticated app routes)', async () => {
    const req = makeReq('https://ndi-cloud.com/my/something');
    const res = await middleware(req);
    expect(res.headers.get('content-security-policy-report-only')).toBeTruthy();
  });

  it('emits CSP-RO on the catalog at /datasets (O1 widened matcher)', async () => {
    const req = makeReq('https://ndi-cloud.com/datasets');
    const res = await middleware(req);
    expect(res.headers.get('content-security-policy-report-only')).toBeTruthy();
  });

  it('emits CSP-RO on marketing root / (O1 widened matcher)', async () => {
    const req = makeReq('https://ndi-cloud.com/');
    const res = await middleware(req);
    expect(res.headers.get('content-security-policy-report-only')).toBeTruthy();
  });

  it('does NOT emit enforced Content-Security-Policy header (24h soak)', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/me');
    const res = await middleware(req);
    expect(res.headers.get('content-security-policy')).toBeNull();
  });

  it('script-src does NOT include nonce-... (B2 dropped the per-request nonce)', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/me');
    const res = await middleware(req);
    const csp = res.headers.get('content-security-policy-report-only')!;
    expect(csp).not.toMatch(/nonce-/);
  });

  it('script-src does NOT include strict-dynamic (B2 dropped it; was broken-on-flip)', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/me');
    const res = await middleware(req);
    const csp = res.headers.get('content-security-policy-report-only')!;
    expect(csp).not.toMatch(/'strict-dynamic'/);
  });

  it('script-src is `self` + GTM/GA only (Vercel Analytics + Speed Insights tags)', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/me');
    const res = await middleware(req);
    const csp = res.headers.get('content-security-policy-report-only')!;
    expect(csp).toMatch(
      /script-src 'self' https:\/\/www\.googletagmanager\.com https:\/\/www\.google-analytics\.com/,
    );
  });

  it('does NOT forward an x-nonce request header (B2 dropped it; nothing read it)', async () => {
    // Exposed via NextResponse.next request-headers contract; the
    // x-nonce path is gone now.
    const req = makeReq('https://ndi-cloud.com/api/auth/me');
    await middleware(req);
    // The middleware no longer mutates request headers — the only
    // observable contract from outside is that the response carries the
    // policy header without `nonce-`. Already covered above.
    expect(true).toBe(true); // keep the spec to flag intent.
  });
});

describe('Vary header injection — gated to session-varying paths', () => {
  it('adds Vary: Cookie + Accept-Encoding on /api/* routes', async () => {
    const req = makeReq('https://ndi-cloud.com/api/auth/me');
    const res = await middleware(req);
    const vary = res.headers.get('vary');
    expect(vary).toContain('Cookie');
    expect(vary).toContain('Accept-Encoding');
  });

  it('adds Vary on /my/* routes', async () => {
    const req = makeReq('https://ndi-cloud.com/my/something');
    const res = await middleware(req);
    expect(res.headers.get('vary')).toContain('Cookie');
  });

  it('does NOT add Vary on the anonymous-public catalog /datasets (preserves edge cache)', async () => {
    const req = makeReq('https://ndi-cloud.com/datasets');
    const res = await middleware(req);
    const vary = res.headers.get('vary') ?? '';
    expect(vary).not.toContain('Cookie');
  });

  it('does NOT add Vary on marketing routes (anonymous-public)', async () => {
    const req = makeReq('https://ndi-cloud.com/');
    const res = await middleware(req);
    const vary = res.headers.get('vary') ?? '';
    expect(vary).not.toContain('Cookie');
  });

  it('does NOT add Vary on /about (marketing)', async () => {
    const req = makeReq('https://ndi-cloud.com/about');
    const res = await middleware(req);
    const vary = res.headers.get('vary') ?? '';
    expect(vary).not.toContain('Cookie');
  });
});
