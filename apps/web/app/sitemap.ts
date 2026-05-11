import type { MetadataRoute } from 'next';

import { fetchPublishedDatasetsForSitemap } from '@/lib/api/datasets-server';
import { SITE_ORIGIN } from '@/lib/site-config';

/**
 * Sitemap for marketing routes + per-dataset URLs.
 *
 * # What changed (Apr 2026)
 *
 * Pre-fix: only marketing URLs (home, /datasets catalog, /products,
 * /about, /security, /platform) were enumerated. Per-dataset URLs were
 * intentionally omitted with the rationale "the catalog page surfaces
 * dataset cards with internal links, so search engines crawl into
 * individual dataset URLs from that entry point." The audit revealed
 * that's NOT enough for Google Dataset Search ingestion: the
 * `schema.org/Dataset` JSON-LD on each dataset page is what gets
 * indexed, and Google's crawler needs explicit URL enumeration in the
 * sitemap to walk every dataset (the catalog is paginated, ranking
 * algorithms can stop walking past page-1 cards).
 *
 * Post-fix: dataset URLs are enumerated via
 * `fetchPublishedDatasetsForSitemap()` (server-only, cached, hard-
 * capped at 1000 to keep build budget bounded). On a Railway/
 * INTERNAL_API_URL miss the function returns `[]` and we degrade
 * gracefully to marketing-only URLs — same as pre-fix. A dropped
 * sitemap fetch must NOT break the build.
 *
 * # Cache + staleness
 *
 * Sitemap rebuilds on `revalidate` (default: ISR's catalog
 * revalidate window of 60s). Vercel's static-asset CDN serves the
 * cached XML to crawlers; on a published-dataset list change the
 * sitemap picks up the new id within ~minutes.
 *
 * Per-route priority + changeFrequency reflect the editorial reality:
 * the home + commons routes change often (datasets land daily), the
 * About / Security / Platform pages only when their content is
 * intentionally edited. Per-dataset URLs are `weekly` priority 0.7 —
 * common practice for institutional dataset catalogs (above About
 * but below the home + catalog index).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_ORIGIN;
  const now = new Date();

  const marketingRoutes: MetadataRoute.Sitemap = [
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

  // Per-dataset URLs. Each dataset detail page emits its own
  // `schema.org/Dataset` JSON-LD that Google Dataset Search ingests;
  // listing the URL here is what makes Google's crawler find them.
  const datasets = await fetchPublishedDatasetsForSitemap();
  const datasetRoutes: MetadataRoute.Sitemap = datasets.map((d) => ({
    url: `${baseUrl}/datasets/${d.id}/overview`,
    lastModified: d.lastModified ? new Date(d.lastModified) : now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [...marketingRoutes, ...datasetRoutes];
}
