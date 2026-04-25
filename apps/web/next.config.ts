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
  // Rewrites for /api/* land in Phase 4. Stubbed empty here so existing
  // builds don't fail; the rewrite is gated on UPSTREAM_API_URL being set.
  async rewrites() {
    return [];
  },
};

export default config;
