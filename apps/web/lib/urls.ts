/**
 * Same-origin link helpers.
 *
 * In the old marketing repo (`ndi-web-app-wds/app/src/lib/urls.ts`), these
 * helpers built absolute URLs to the data-browser subdomain
 * (`https://app.ndi-cloud.com/datasets`, `.../my`). In the unified
 * monorepo, both surfaces share `ndi-cloud.com` — every link is a relative
 * path. The names are preserved so callsites that imported from `@/lib/urls`
 * keep compiling without callsite-by-callsite rewrites; the values are
 * now same-origin paths.
 *
 * The deliberately-removed `DATA_BROWSER_URL` constant means any legacy
 * code that imports it fails the build with a clear error — exactly the
 * forcing function we want for catching stragglers during the migration.
 */

/**
 * Catalog landing URL with optional search prefill.
 *
 * @example
 * commonsSearchUrl()           // "/datasets"
 * commonsSearchUrl('cortex')   // "/datasets?q=cortex"
 */
export function commonsSearchUrl(q?: string): string {
  if (!q) {
    return '/datasets';
  }
  return `/datasets?q=${encodeURIComponent(q)}`;
}

/**
 * Authenticated workspace URL (per-user dataset list, bookmarks, uploads).
 */
export function myWorkspaceUrl(): string {
  return '/my';
}
