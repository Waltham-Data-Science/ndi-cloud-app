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
import type { DatasetListResponse, DatasetRecord } from './datasets';
import { DatasetRecordSchema } from './schemas/datasets';
import { DATASET_DETAIL_FETCH_TIMEOUT_MS } from './timeouts';
import { env } from '@/lib/env';

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
  const timer = setTimeout(
    () => controller.abort(),
    DATASET_DETAIL_FETCH_TIMEOUT_MS,
  );
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

/**
 * Plain async function (no hook wrapper) — the catalog RSC at
 * `app/(app)/datasets/page.tsx` server-side prefetches via this so the
 * `<HydrationBoundary>` ships pre-warmed cache to the client island.
 * Also used by `generateStaticParams` in the dataset overview page to
 * collect the top-N dataset ids for SSG.
 *
 * Lives in `datasets-server.ts` (not `datasets.ts`) so that callers in
 * Server Components and `generateStaticParams` can import it without
 * pulling the `'use client'` boundary from the hooks module. Next.js 16
 * throws at build time when a server-side function call resolves to a
 * `'use client'` source — that's the SSG regression PR #156 surfaced
 * and this move fixes.
 *
 * The RSC bypasses the Vercel rewrite via `INTERNAL_API_URL` to avoid a
 * double-hop; the URL is composed by the caller.
 */
export async function fetchPublishedDatasets(
  baseUrl: string,
  page: number,
  pageSize: number,
): Promise<DatasetListResponse> {
  const res = await fetch(
    `${baseUrl}/api/datasets/published?page=${page}&pageSize=${pageSize}`,
    {
      headers: { Accept: 'application/json' },
      // Server-side fetch — no cookies. Anonymous-public reads only.
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    throw new Error(`Catalog prefetch failed (${res.status})`);
  }
  return (await res.json()) as DatasetListResponse;
}

/**
 * Phase 6.7 A2 — server-side dataset fetch for `generateMetadata`.
 *
 * Used by `/datasets/[id]/layout.tsx` to set the document title to
 * `${dataset.name} · NDI Cloud`. Closes audit follow-up #67 (the
 * source SPA's `useDocumentTitle` per-route title was not yet ported
 * into the App Router metadata API).
 *
 * Forwards the caller's cookies so authenticated org-private datasets
 * resolve correctly (otherwise they 401 and we fall back to a generic
 * title). Returns `null` on any failure — generateMetadata callers
 * use that to choose between specific and fallback titles. Failure
 * is intentionally non-throwing because metadata generation is a
 * best-effort enhancement, never a page-blocker.
 */
export async function fetchDatasetServer(
  baseUrl: string,
  id: string,
  cookieHeader?: string,
): Promise<DatasetRecord | null> {
  const result = await fetchDatasetServerWithStatus(baseUrl, id, cookieHeader);
  return result.data;
}

/**
 * Variant of :func:`fetchDatasetServer` that surfaces the HTTP
 * status alongside the parsed body. Layouts use this to call
 * Next.js's :func:`notFound` on a clean 404 (audit 2026-04-27 #10 —
 * a bad `[id]` shouldn't render the dataset chrome with the bare
 * id as h1).
 *
 * Status `0` means "network/timeout/parse error, status unknown" —
 * callers should treat this as transient and fall through to client
 * fetch, NOT as a 404. We never speculate-return 404 from a non-404
 * failure mode because that would silently swap a bad-network
 * detail page for a not-found page on a real network blip.
 */
export async function fetchDatasetServerWithStatus(
  baseUrl: string,
  id: string,
  cookieHeader?: string,
): Promise<{ status: number; data: DatasetRecord | null }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  try {
    const res = await fetch(`${baseUrl}/api/datasets/${id}`, {
      headers,
      // Server-side fetch from the layout's RSC prefetch path. Use
      // Next's request memo (`force-cache` + revalidate) so concurrent
      // RSC renders of the same dataset within a single Vercel
      // function invocation dedupe to one upstream call. The 60s
      // revalidate matches the leaf overview page's `revalidate`
      // export, so the dataset record stays warm across the same
      // ISR generation.
      cache: 'force-cache',
      next: { revalidate: 60 },
    });
    if (!res.ok) return { status: res.status, data: null };
    const raw = await res.json();
    // Apply the schema so the cloud's `_id`-only responses get
    // transformed to `id`-bearing records, matching the shape the
    // client-side `useDataset` hook receives via `apiFetch + schema`.
    // Without this transform, a hydrated cache would carry `_id`
    // but the client's render code reads `id`, breaking cards.
    const parsed = DatasetRecordSchema.safeParse(raw);
    if (!parsed.success) {
      // 2xx body that doesn't match the schema → treat as no data
      // but preserve the 200 status so the caller doesn't 404-route
      // on a backend shape drift. Logged via the existing
      // RESPONSE_SHAPE_INVALID path on the client.
      return { status: res.status, data: null };
    }
    return { status: res.status, data: parsed.data as DatasetRecord };
  } catch {
    // Network blip / Railway flap — status unknown. Caller should
    // NOT 404-route on this (it's transient).
    return { status: 0, data: null };
  }
}
