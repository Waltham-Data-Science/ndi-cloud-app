import type { MetadataRoute } from 'next';

/**
 * Static sitemap for marketing routes.
 *
 * Phase 2a-1 — covers the chrome + simpler pages that have shipped.
 * Phase 2a-2 expands the list as the remaining content pages land
 * (about, platform, security, products/*, home will all be added).
 * Phase 3a adds dynamic dataset routes from a server-side fetch
 * against `process.env.INTERNAL_API_URL` to enumerate published
 * dataset IDs.
 *
 * Search engines crawl this at /sitemap.xml automatically — Next.js's
 * file-based metadata routing handles the URL.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://ndi-cloud.com';
  const now = new Date();

  return [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/datasets`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    // Auth pages excluded — they're per-user destinations and shouldn't
    // appear in search results. /account-exists is similarly behind a
    // sign-up flow, not a discoverable landing page.
    //
    // Marketing content pages (/about, /platform, /security,
    // /products/*) added in Phase 2a-2 as they land.
  ];
}
