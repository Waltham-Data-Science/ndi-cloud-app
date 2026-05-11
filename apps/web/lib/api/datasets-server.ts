import 'server-only';

/**
 * Server-only dataset fetch helpers — used by `generateMetadata`,
 * `generateStaticParams`, the dataset-detail page itself, and the
 * sitemap.
 *
 * # Why this lives separately from `lib/api/datasets.ts`
 *
 * `lib/api/datasets.ts` has `'use client'` at line 1 (TanStack Query
 * hooks for the browser). Importing anything from it in a Server
 * Component pulls the `'use client'` boundary unintentionally —
 * Next.js 16 surfaces that as a "client/server boundary" runtime throw,
 * caught explicitly in PR #101 (overview-page hotfix). This module is
 * the safe place for server-side dataset reads.
 *
 * # Why `cache: 'force-cache'` + `revalidate: 60`
 *
 * Next's request-scoped fetch cache deduplicates identical fetches
 * within a single render. `generateMetadata` and the page itself both
 * call `fetchDatasetServer(id)` with the same URL; the second call
 * returns the cached body without hitting Railway. With
 * `revalidate: 60`, the same dataset visited within 60s of the previous
 * SSR also reuses the cached body (Vercel data cache layer above the
 * Next request cache).
 *
 * # Why `safeFetchDataset` returns `null` on failure
 *
 * Per the page-prefetch helper's reasoning: a network blip should NOT
 * masquerade as a missing dataset. The page-level `prefetchDatasetForPage`
 * still owns 4xx → notFound() routing; this helper just returns the
 * record (or null) without taking that decision. Callers that need the
 * notFound semantics should use `prefetchDatasetForPage`; callers that
 * just need "the record if available" (metadata, JSON-LD, sitemap) use
 * this.
 */
import type { DatasetRecord } from './datasets';
import { env } from '@/lib/env';

/**
 * Detail-fetch ceiling for the hero / metadata / JSON-LD path.
 *
 * # Why 8s (not the 1.5s the existence-check helper uses)
 *
 * Empirical: some published datasets ship oversized records that
 * legitimately take 1.5-3 seconds to serialize on the cloud side.
 * Bhar/Francesconi: ~300ms. Reikersdorfer: ~700ms.
 * **Griswold/Premature-vision (`68839b1fbf243809c0800a01`): 2.9 MB / 2.08s** —
 * the team-review round-5 reproduction case: hero rendered bare
 * `68839b1fbf243809c0800a01` because `safeFetchDataset` was timing
 * out at 1.5s and falling back to the id-only header. The
 * tree-shrew dataset (`66140c237dbc358954ddffb9`) is even larger
 * (2.85 MB / ~19s on cold cache); slimming that one is on the cloud
 * team's plate (see `datasets-prefetch.ts` audit follow-up #25).
 *
 * 8s covers the realistic ceiling for ~99% of datasets. The hero is
 * wrapped in `<Suspense>` at the layout, so a slower await doesn't
 * block the page below — the skeleton stays visible until the hero
 * resolves. After a successful fetch, Next's request cache +
 * `revalidate: 60` mean subsequent visits within the window are
 * instant.
 *
 * The existence-check helper in `datasets-prefetch.ts` keeps a tighter
 * 1.5s timeout — its purpose is different (gate the route on dataset
 * existence ahead of `loading.tsx`). Conflating the two budgets would
 * either over-stall loading.tsx or under-fetch the hero.
 */
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Fetch a single dataset record by id. Returns `null` on:
 *
 *   - Missing `INTERNAL_API_URL` (dev / preview without backend wiring)
 *   - Non-2xx upstream response (NOT routed to notFound — caller decides)
 *   - Network / timeout / parse error
 *
 * Returns the parsed record on success. The cloud's detail endpoint
 * sometimes ships `_id` instead of `id` on the response body; both
 * point at the same value, so callers should fall back when reading.
 */
export async function safeFetchDataset(
  id: string,
): Promise<DatasetRecord | null> {
  if (!env.INTERNAL_API_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.INTERNAL_API_URL}/api/datasets/${id}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'force-cache',
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as DatasetRecord;
    if (!body || typeof body.name !== 'string') return null;
    return body;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Configuration for the published-datasets fetch used by the sitemap
 * + the top-N prerender. Each page is a Railway round-trip; sized for
 * `pnpm build` time-to-first-byte (sitemap rebuild is part of the
 * static build).
 */
const PUBLISHED_PAGE_SIZE = 100;
const SITEMAP_MAX_PAGES = 10; // hard cap at 1000 datasets in the sitemap

/**
 * Fetch every published dataset id (paginated) for the sitemap.
 * Returns just the ids + last-modified hints needed to emit
 * `MetadataRoute.Sitemap` entries — not the full record.
 *
 * Bounded at 1000 datasets via `SITEMAP_MAX_PAGES`. If the catalog
 * grows past 1000, the cap should be raised; until then this avoids
 * runaway sitemap builds during ISR rebuilds.
 *
 * Returns `[]` on any error — the sitemap falls back to marketing-only
 * URLs (the pre-fix behavior). A failed sitemap fetch should not break
 * the build.
 */
export async function fetchPublishedDatasetsForSitemap(): Promise<
  Array<{ id: string; lastModified?: string }>
> {
  if (!env.INTERNAL_API_URL) return [];
  const out: Array<{ id: string; lastModified?: string }> = [];
  for (let pageIndex = 1; pageIndex <= SITEMAP_MAX_PAGES; pageIndex++) {
    try {
      const url = `${env.INTERNAL_API_URL}/api/datasets/published?page=${pageIndex}&pageSize=${PUBLISHED_PAGE_SIZE}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'force-cache',
        next: { revalidate: 60 },
      });
      if (!res.ok) break;
      const body = (await res.json()) as {
        datasets?: Array<{ id?: string; updatedAt?: string }>;
        totalNumber?: number;
      };
      const page = body.datasets ?? [];
      if (page.length === 0) break;
      for (const d of page) {
        if (typeof d.id === 'string' && d.id) {
          out.push({ id: d.id, lastModified: d.updatedAt });
        }
      }
      // Stop early when we've collected everything the cloud reports.
      if (
        typeof body.totalNumber === 'number' &&
        out.length >= body.totalNumber
      ) {
        break;
      }
      // No next page (catalog smaller than one page).
      if (page.length < PUBLISHED_PAGE_SIZE) break;
    } catch {
      // Stop on first error; return what we have so far.
      break;
    }
  }
  return out;
}
