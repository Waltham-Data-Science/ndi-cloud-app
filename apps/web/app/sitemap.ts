import type { MetadataRoute } from 'next';

/**
 * Static sitemap for marketing routes + the catalog landing.
 *
 * Covers the marketing surface (home, /datasets, /products/*,
 * /about, /security, /platform). Per-dataset URLs are intentionally
 * NOT enumerated here:
 *   - The catalog page itself surfaces dataset cards with internal links,
 *     so search engines crawl into individual dataset URLs from that
 *     entry point.
 *   - Build-time enumeration would require a Railway round-trip on every
 *     ISR rebuild and would still drift between rebuilds; the static-
 *     marketing-routes-only sitemap is simpler and correct.
 *
 * Search engines crawl this at /sitemap.xml automatically — Next 16's
 * file-based metadata routing handles the URL.
 *
 * Per-route priority + changeFrequency reflect the editorial reality:
 * the home + commons routes change often (datasets land daily), the
 * About / Security / Platform pages only when their content is
 * intentionally edited.
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
    {
      url: `${baseUrl}/products/private-cloud`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/products/labchat`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/security`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/platform`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // Auth pages excluded — they're per-user destinations and shouldn't
    // appear in search results. /account-exists is similarly behind a
    // sign-up flow, not a discoverable landing page.
  ];
}
