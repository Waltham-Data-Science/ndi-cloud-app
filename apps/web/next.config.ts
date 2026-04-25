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
   * Two categories:
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
    ];
  },

  // Rewrites for /api/* land in Phase 4. Stubbed empty here so existing
  // builds don't fail; the rewrite is gated on UPSTREAM_API_URL being set.
  async rewrites() {
    return [];
  },
};

export default config;
