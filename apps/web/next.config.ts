import type { NextConfig } from 'next';

// Side-effect import: validates process.env at config-load time.
// A malformed environment fails the build before next.config returns.
import './lib/env';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.ndi-cloud.com' },
    ],
  },

  /*
   * Permanent (308) redirects for legacy URLs.
   *
   * Three categories:
   *
   * (A) camelCase → kebab-case auth routes. The new monorepo standardizes
   *     on kebab-case URLs (App Router file-based + better SEO + matches
   *     ndi-data-browser-v2 conventions). camelCase paths still arrive
   *     from email magic-links + bookmarks + Stripe webhooks. 308 keeps
   *     them working forever without breaking caches.
   *
   * (B) Marketing → data-browser deeplinks that lived in the old
   *     ndi-web-app-wds/next.config.js. With the unified apex, /datasets
   *     and /my are LIVE pages in this monorepo (not redirects), so the
   *     /datasets/:id, /datasets/:id/:path*, and /search/:path* rules
   *     from the old config are intentionally dropped — those land on
   *     the actual app routes once Phase 3a/3b ship. Only the routes
   *     that DON'T have a 1:1 file in this repo (advanced search,
   *     bookmarks, share-data) keep redirecting.
   *
   * (C) Phase 6.7 G5 — legacy table-class slug aliases. The source SPA
   *     (`ndi-data-browser-v2/frontend`) silently coerced these short-
   *     form slugs to their canonical equivalents at render time
   *     (`coerceTableType` in `frontend/src/pages/TableTab.tsx`). The
   *     new App Router can't transparently rename — the FastAPI backend
   *     only knows the canonical names, so a bookmarked URL like
   *     `/datasets/:id/tables/probes` would be broken post-cutover.
   *     308 makes bookmarks self-healing: legacy URL clicked once
   *     updates the bookmark to canonical. Empty-class case mirrors
   *     the source SPA's `<Navigate to="subject" replace />` fallback.
   */
  async redirects() {
    return [
      // (A) auth route case migration
      { source: '/accountExists', destination: '/account-exists', permanent: true },
      { source: '/accountVerification', destination: '/account-verification', permanent: true },
      { source: '/accountNotConfrimed', destination: '/account-not-confirmed', permanent: true },
      { source: '/createAccount', destination: '/create-account', permanent: true },
      { source: '/forgotPassword', destination: '/forgot-password', permanent: true },
      { source: '/myAccount', destination: '/my-account', permanent: true },
      { source: '/resendVerification', destination: '/resend-verification', permanent: true },
      { source: '/resetForgottenPassword', destination: '/reset-forgotten-password', permanent: true },
      { source: '/resetPassword', destination: '/reset-password', permanent: true },

      // (B) legacy data-browser deeplinks (now same-origin app routes)
      { source: '/search', destination: '/datasets', permanent: true },
      { source: '/search/:path*', destination: '/datasets/:path*', permanent: true },
      { source: '/advancedSearch', destination: '/query', permanent: true },
      { source: '/bookmarks', destination: '/my', permanent: true },
      { source: '/shareData', destination: '/my', permanent: true },

      // (C) G5: legacy table-class slug aliases (bookmark self-healing)
      { source: '/datasets/:id/tables/subjects',   destination: '/datasets/:id/tables/subject',           permanent: true },
      { source: '/datasets/:id/tables/probes',     destination: '/datasets/:id/tables/element',           permanent: true },
      { source: '/datasets/:id/tables/probe',      destination: '/datasets/:id/tables/element',           permanent: true },
      { source: '/datasets/:id/tables/elements',   destination: '/datasets/:id/tables/element',           permanent: true },
      { source: '/datasets/:id/tables/epochs',     destination: '/datasets/:id/tables/element_epoch',     permanent: true },
      { source: '/datasets/:id/tables/epoch',      destination: '/datasets/:id/tables/element_epoch',     permanent: true },
      { source: '/datasets/:id/tables/treatments', destination: '/datasets/:id/tables/treatment',         permanent: true },
      { source: '/datasets/:id/tables/locations',  destination: '/datasets/:id/tables/probe_location',    permanent: true },
      { source: '/datasets/:id/tables/openminds',  destination: '/datasets/:id/tables/openminds_subject', permanent: true },
      // Empty-class fallback (parity with source SPA's <Navigate to="subject" replace />)
      { source: '/datasets/:id/tables',            destination: '/datasets/:id/tables/subject',           permanent: true },
    ];
  },

  /*
   * Phase 4: proxy `/api/*` to the FastAPI backend on Railway.
   *
   * The rewrite is gated on `UPSTREAM_API_URL` being set so dev / test
   * builds (no upstream configured) don't accidentally 404 on /api
   * paths — they resolve to "no rewrite, serve as-is" which the
   * App Router treats as a 404 (no `app/api/` routes ship in this
   * monorepo, the FastAPI is the only API surface).
   *
   * Production + preview env on Vercel sets:
   *   UPSTREAM_API_URL=https://ndb-v2-production.up.railway.app
   *
   * Cross-origin / CSRF behavior preserved end-to-end:
   *   - Origin / Referer headers: Vercel forwards them unchanged when
   *     proxying through `rewrites()`. The FastAPI's existing CSRF
   *     middleware sees the same `https://ndi-cloud.com` Origin it
   *     currently sees from `app.ndi-cloud.com` after Phase 7.
   *   - Cookies: the apex-level `Domain=.ndi-cloud.com` cookie set
   *     by the backend (Phase 4 backend PR in `ndi-data-browser-v2`)
   *     gets carried through automatically because the browser sees
   *     the same origin (`https://ndi-cloud.com/api/...`) for both
   *     the marketing surface and the API.
   *   - Server-side RSC fetches (catalog prefetch in /datasets) bypass
   *     the rewrite via `INTERNAL_API_URL` to avoid a Vercel-edge to
   *     Railway double-hop.
   *
   * Edge Middleware (Phase 5) attaches Origin enforcement + Vary:Cookie
   * + nonce CSP on top of this rewrite — the proxy passes the request
   * through middleware first, so defense-in-depth fires before the
   * upstream sees the request.
   */
  async rewrites() {
    const upstream = process.env.UPSTREAM_API_URL;
    if (!upstream) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${upstream.replace(/\/$/, '')}/api/:path*`,
      },
    ];
  },
};

export default config;
