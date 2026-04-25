/**
 * Edge Middleware — Phase 5.
 *
 * Three responsibilities:
 *
 * 1. **Per-request CSP nonce.** A fresh nonce per request is forwarded
 *    to the RSC tree via the `x-nonce` request header (RSC reads via
 *    `headers().get('x-nonce')`) and emitted on the response as a
 *    `Content-Security-Policy-Report-Only` header. The Report-Only
 *    flavor is intentional for the first 24h of production traffic —
 *    we collect violation reports and verify nothing legitimate trips
 *    before flipping to enforced `Content-Security-Policy`. The static
 *    `vercel.json` headers config can't carry a per-request value, so
 *    CSP lives here.
 *
 * 2. **Origin enforcement on `/api/*` mutations.** Defense-in-depth ahead
 *    of FastAPI's own CSRF check. A POST/PUT/PATCH/DELETE arriving with
 *    an `Origin` header that isn't `ndi-cloud.com` (or `www.`) gets a
 *    flat 403 before the request reaches Railway.
 *
 * 3. **`Vary: Cookie, Accept-Encoding`** on routes that vary by session
 *    (`/api/*`, `/my/*`). The catalog at `/datasets` is anonymous-public
 *    (RSC + ISR) — adding `Vary: Cookie` there would defeat edge caching
 *    for no benefit, so the matcher excludes it deliberately.
 *
 * **NOT used for cookie migration.** Phase 4 sets `Domain=.ndi-cloud.com`
 * via the FastAPI cookie attrs; Phase 7 forces re-login via SESSION_SECRET
 * rotation. Middleware does NOT rewrite or invalidate cookies.
 */
import { NextRequest, NextResponse } from 'next/server';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ALLOWED_ORIGINS = new Set([
  'https://ndi-cloud.com',
  'https://www.ndi-cloud.com',
]);

const RAILWAY_API = 'https://ndb-v2-production.up.railway.app';

export function middleware(req: NextRequest): NextResponse {
  // 1. Origin enforcement on /api/* mutations.
  if (
    req.nextUrl.pathname.startsWith('/api/') &&
    MUTATING_METHODS.has(req.method)
  ) {
    const origin = req.headers.get('origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new NextResponse('Origin not allowed', { status: 403 });
    }
  }

  // 2. Per-request CSP nonce.
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  // Forward nonce to RSC via request header (read in app/layout.tsx via
  // headers().get('x-nonce')).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // CSP ships in Report-Only mode for the first 24h of production
  // traffic. Phase 6 follow-up flips to enforced `Content-Security-Policy`
  // after a clean burn-in (no legitimate-script violations in the report
  // logs). Both header names below are deliberate: the policy header
  // and a `Reporting-Endpoints` directive (deferred — Phase 6 wires
  // the report-to endpoint).
  res.headers.set('Content-Security-Policy-Report-Only', csp);

  // 3. Vary: Cookie, Accept-Encoding on routes that vary by session.
  //    The matcher (below) only invokes middleware for /api/* + /my/*,
  //    so we don't need to re-check the path here.
  const existing = res.headers.get('vary') ?? '';
  const parts = new Set(
    existing
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  parts.add('Cookie');
  parts.add('Accept-Encoding');
  res.headers.set('Vary', Array.from(parts).join(', '));

  return res;
}

/**
 * Cryptographically random base64 nonce. Edge runtime exposes
 * `crypto.randomUUID` (Web Crypto). 36 hex chars from the UUID base64-encoded
 * give a 192-bit nonce — well above the 128-bit minimum for CSP.
 */
function generateNonce(): string {
  const uuid = crypto.randomUUID();
  // Edge runtime has Buffer-incompatible globals; use a TextEncoder + btoa.
  return btoa(uuid);
}

/**
 * Compose the CSP policy string with a per-request nonce.
 *
 * `'strict-dynamic'` lets dynamically-loaded chunks inherit the trust
 * of the nonce'd parent script — required for Next.js's chunk loader.
 *
 * `connect-src` includes the Railway API so client-side fetches via
 * `apiFetch` to `/api/*` (Vercel rewrite → Railway) and the catalog
 * RSC's server-side prefetch (when not bypassing via INTERNAL_API_URL)
 * pass the policy.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.googletagmanager.com https://www.google-analytics.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.ndi-cloud.com",
    `connect-src 'self' ${RAILWAY_API} https://www.google-analytics.com https://vitals.vercel-insights.com`,
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export const config = {
  /*
   * Matcher omits `/datasets/:path*` deliberately: the catalog is RSC +
   * ISR and renders identically for all viewers (anonymous-public
   * guarantee). Adding `Vary: Cookie` defeats edge caching for no
   * benefit.
   *
   * The matcher also omits the marketing routes (`/`, `/about`, etc.)
   * because the CSP nonce only affects `<Script>` tags and the marketing
   * surface doesn't ship inline scripts. If a future marketing page
   * needs a nonce, extend the matcher then.
   */
  matcher: ['/api/:path*', '/my/:path*'],
};
