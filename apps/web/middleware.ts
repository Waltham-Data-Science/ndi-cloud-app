/**
 * Edge Middleware — Phase 5 + Phase 6.7 B2 simplification.
 *
 * Three responsibilities:
 *
 * 1. **Static CSP** in Report-Only mode. The previous design used a
 *    per-request nonce + `'strict-dynamic'`, but the nonce was never
 *    threaded into the rendered HTML (no layout/page reads
 *    `headers().get('x-nonce')`). Flipping Report-Only to enforced
 *    would have white-screened every Next.js client chunk because
 *    `'strict-dynamic'` requires a nonce-trusted parent script. B2
 *    drops the nonce path entirely — Next.js's hashed chunk filenames
 *    work fine with plain `script-src 'self'`. Phase 7 cutover flips
 *    Report-Only to enforced; that flip is now safe.
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
 * via the FastAPI cookie attrs; Phase 7 forces re-login via
 * SESSION_ENCRYPTION_KEY rotation. Middleware does NOT rewrite or
 * invalidate cookies.
 */
import { NextRequest, NextResponse } from 'next/server';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Compose the set of allowed `Origin` values for `/api/*` mutations.
 *
 * - **Production**: strict allowlist of `ndi-cloud.com` + `www.ndi-cloud.com`
 *   only. The Phase 7 cutover targets. No `*.vercel.app` URLs admitted —
 *   production traffic carries the apex Origin and that's the only
 *   surface that should mutate.
 * - **Preview** (`VERCEL_ENV === 'preview'`): the static apex pair PLUS
 *   the per-deployment `VERCEL_URL` and the canonical `VERCEL_BRANCH_URL`.
 *   Without these, every preview deploy on `*.vercel.app` 403s its own
 *   login flow because the Origin header doesn't match the production
 *   allowlist. `VERCEL_PROJECT_PRODUCTION_URL` is intentionally NOT
 *   included — once cutover happens it becomes a redundant alias of
 *   the apex; including it would let post-cutover traffic mutate via
 *   the `*.vercel.app` URL, which we don't want.
 *
 * Vercel auto-injects the system env vars on every Vercel build (see
 * https://vercel.com/docs/environment-variables/system-environment-variables);
 * they're absent in local dev and bare CI runs, where the production
 * allowlist applies (the test harness sets `Origin: https://ndi-cloud.com`).
 *
 * Computed per request so tests can flip `process.env.VERCEL_ENV` without
 * `vi.resetModules()`. The function is O(1) and runs at the edge — cheap.
 */
function getAllowedOrigins(): Set<string> {
  const allowed = new Set<string>([
    'https://ndi-cloud.com',
    'https://www.ndi-cloud.com',
  ]);
  if (process.env.VERCEL_ENV === 'preview') {
    if (process.env.VERCEL_URL) {
      allowed.add(`https://${process.env.VERCEL_URL}`);
    }
    if (process.env.VERCEL_BRANCH_URL) {
      allowed.add(`https://${process.env.VERCEL_BRANCH_URL}`);
    }
  }
  return allowed;
}

const RAILWAY_API = 'https://ndb-v2-production.up.railway.app';

/**
 * Route slug aliases. Two motivations:
 *
 * 1. **Common-word aliases**: users type `/signin` (Google pattern),
 *    `/sign-in`, `/log-in`, `/signup`, `/register`. Neither this repo
 *    nor the legacy site shipped those — make them resolve.
 *
 * 2. **Legacy camelCase migration**: the data-browser SPA shipped
 *    camelCase routes (`/createAccount`, `/forgotPassword`,
 *    `/myAccount`, `/resetPassword`, etc.) that this repo renamed
 *    to kebab-case during the unification. Without these redirects,
 *    every external bookmark, search-engine result, and email link
 *    pointing at a camelCase URL would 404. Audit (visual-comparison
 *    finding #21) called this out as a high-impact gap.
 *
 * 308 (permanent, preserves method + body) so search engines
 * consolidate ranking signal on the kebab-case canonicals and any
 * in-flight POST to a legacy endpoint isn't silently downgraded.
 */
const ROUTE_ALIASES: Record<string, string> = {
  // Common-word aliases.
  '/signin': '/login',
  '/sign-in': '/login',
  '/log-in': '/login',
  '/signup': '/create-account',
  '/sign-up': '/create-account',
  '/register': '/create-account',

  // Legacy camelCase routes (data-browser-v2 SPA).
  '/createAccount': '/create-account',
  '/forgotPassword': '/forgot-password',
  '/myAccount': '/my-account',
  '/resetPassword': '/reset-password',
  '/resetForgottenPassword': '/reset-forgotten-password',
  '/accountVerification': '/account-verification',
  '/resendVerification': '/resend-verification',
  '/accountNotConfirmed': '/account-not-confirmed',
  '/accountExists': '/account-exists',
};

export function middleware(req: NextRequest): NextResponse {
  const path = req.nextUrl.pathname;

  // 0. Route slug aliases. Done before everything else so the rest of
  //    middleware operates on the canonical path. Search-friendly 308
  //    preserves method + body across the redirect.
  const aliasTarget = ROUTE_ALIASES[path];
  if (aliasTarget) {
    const url = req.nextUrl.clone();
    url.pathname = aliasTarget;
    // Preserve `?returnTo=` and any other query string — the auth
    // flow hands them through after a successful login.
    return NextResponse.redirect(url, 308);
  }

  // 1. Origin enforcement on /api/* mutations.
  if (path.startsWith('/api/') && MUTATING_METHODS.has(req.method)) {
    const origin = req.headers.get('origin');
    if (origin && !getAllowedOrigins().has(origin)) {
      return new NextResponse('Origin not allowed', { status: 403 });
    }
  }

  // 2. Static CSP. No per-request nonce — Next.js's hashed chunk
  //    filenames are stable across requests, so `script-src 'self'` is
  //    sufficient. The Report-Only header is set on every response;
  //    Phase 7 cutover flips it to `Content-Security-Policy` (enforced)
  //    after the soak.
  const res = NextResponse.next();
  res.headers.set('Content-Security-Policy-Report-Only', CSP_POLICY);

  // 3. Vary: Cookie, Accept-Encoding on routes that vary by session.
  //    Gated to `/api/*` and `/my/*` only. The catalog at `/datasets`
  //    is anonymous-public (RSC + ISR) — adding Vary: Cookie there
  //    would defeat edge caching for no benefit. Marketing pages (`/`,
  //    `/about`, etc.) are also anonymous-public.
  if (path.startsWith('/api/') || path.startsWith('/my')) {
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
  }

  return res;
}

/**
 * Static CSP policy. No nonce — `script-src 'self'` works because
 * Next.js produces hashed chunk filenames; the `'self'` allowlist
 * covers them all. Removing `'strict-dynamic'` removes the
 * nonce-required-for-chunks bind that the previous design had.
 *
 * `connect-src` includes the Railway API so client-side fetches via
 * `apiFetch` to `/api/*` (Vercel rewrite → Railway) and the catalog
 * RSC's server-side prefetch (when not bypassing via INTERNAL_API_URL)
 * pass the policy.
 *
 * GTM/GA hosts are listed in `script-src` because Vercel Analytics +
 * Speed Insights load tagging snippets from those origins. If those
 * are dropped, narrow the directive to `'self'` only.
 */
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.ndi-cloud.com",
  `connect-src 'self' ${RAILWAY_API} https://www.google-analytics.com https://vitals.vercel-insights.com`,
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const config = {
  /*
   * Phase 6.7 O1: matcher widened from `['/api/:path*', '/my/:path*']`
   * to cover the entire surface (marketing + catalog + app + api).
   * Without the per-request nonce (B2), the CSP is now a static
   * string applied to every response — widening the matcher means
   * the catalog at `/datasets` (which renders user-submitted dataset
   * titles + descriptions — exactly the routes most likely to host
   * XSS-relevant content) and the marketing pages now both pick up
   * the CSP header.
   *
   * Vary: Cookie / Origin enforcement are gated on path-specific
   * `if (path.startsWith(...))` branches inside `middleware()` itself,
   * so the catalog's anonymous-public edge cache isn't poisoned by
   * a Vary: Cookie addition.
   *
   * The negative-lookahead pattern excludes Next.js internal paths
   * (`_next/static`, `_next/image`, `favicon.ico`) — those are
   * already CSP-covered via the `vercel.json` static headers and
   * don't need per-request middleware overhead on every prefetched
   * chunk.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
