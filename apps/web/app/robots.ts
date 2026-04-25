import type { MetadataRoute } from 'next';

/**
 * Crawler directives. Allow public marketing routes + the public
 * dataset catalog (Phase 3a); disallow authenticated workspaces
 * (/my/*) and the API surface (/api/*) — neither makes sense for
 * search indexing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/my/', '/my-account/', '/account-exists', '/login', '/create-account'],
      },
    ],
    sitemap: 'https://ndi-cloud.com/sitemap.xml',
  };
}
