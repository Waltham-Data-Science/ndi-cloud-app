/**
 * Site-wide constants — single source of truth for origin, logo, and
 * other "everywhere on the site" values.
 *
 * # Why this module exists
 *
 * Pre-extract: `'https://ndi-cloud.com'` appeared as a bare string
 * literal in 15+ files (root `layout.tsx` metadataBase, every
 * `generateMetadata` canonical/openGraph block, `sitemap.ts`,
 * `robots.ts`, JSON-LD builders, marketing page metadata). The
 * wordmark logo URL appeared in 7+ openGraph + Twitter card blocks.
 *
 * A change to either value (apex rename, CDN swap, staging-env
 * override) required a 15+ file edit. Worse, half the duplicates
 * were typos waiting to happen — `'https//ndi-cloud.com'` or a
 * trailing slash inconsistency could ship and only get caught when
 * Google's URL inspector flags the broken canonical.
 *
 * Post-extract: every consumer imports `SITE_ORIGIN` /
 * `SITE_LOGO_URL` from this module. A future origin change is a
 * one-line edit here. Per-environment overrides (preview vs
 * production) can hook in via `process.env` reads.
 *
 * # Pure constants, no runtime branching
 *
 * Today the values are hardcoded — the apex is stable, no preview
 * override needed. If we ever want per-env values (staging.ndi-cloud.com,
 * for example), this file is the seam. Adding `process.env.NEXT_PUBLIC_SITE_ORIGIN`
 * here keeps every consumer call-site identical.
 *
 * # Why no trailing slash
 *
 * `SITE_ORIGIN` is the bare apex without a trailing slash. Callers
 * append path segments with a leading slash (`${SITE_ORIGIN}/sitemap.xml`)
 * which matches RFC 3986's URI composition. Mixing trailing-slash and
 * no-trailing-slash in the codebase was one of the documented
 * inconsistencies pre-extract.
 */

/**
 * Canonical apex URL for the NDI Cloud site. Used in canonical link
 * tags, openGraph URLs, sitemap entries, JSON-LD `@id` values, and
 * absolute redirects. No trailing slash — see file-level comment.
 */
export const SITE_ORIGIN = 'https://ndi-cloud.com';

/**
 * Canonical wordmark logo URL for openGraph + Twitter card images and
 * JSON-LD Organization.logo. Absolute URL because external consumers
 * (Twitter, OG previewers, Google Knowledge Graph) need a full URL —
 * a relative path won't resolve cross-origin.
 *
 * Pointed at the SVG wordmark for crispness across resolutions. If a
 * raster fallback is ever needed (Twitter's older image renderers
 * sometimes skip SVG), switch to a 1200x630 PNG export of the same
 * mark — the JSON-LD spec accepts either.
 */
export const SITE_LOGO_URL = `${SITE_ORIGIN}/logos/ndicloud-wordmark-color.svg`;
