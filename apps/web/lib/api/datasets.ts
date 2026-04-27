'use client';

/**
 * Dataset hooks — TanStack Query wrappers over the FastAPI proxy's
 * `/api/datasets/...` endpoints.
 *
 * Ported from `ndi-data-browser-v2/frontend/src/api/datasets.ts`.
 * Type-paths rewritten to `@/lib/types/*` (data-browser used `@/types/*`).
 */
import { useQuery } from '@tanstack/react-query';

import type { DatasetProvenance } from '@/lib/types/dataset-provenance';
import type {
  CompactDatasetSummary,
  DatasetSummary,
} from '@/lib/types/dataset-summary';
import type { FacetsResponse } from '@/lib/types/facets';

import { apiFetch } from './client';
import { DatasetListResponseSchema, DatasetRecordSchema } from './schemas/datasets';

export interface Contributor {
  firstName?: string;
  lastName?: string;
  contact?: string;
  /** ORCID URL, e.g. `https://orcid.org/0000-0001-6282-7124`. */
  orcid?: string;
}

export interface AssociatedPublication {
  title?: string;
  /** DOI URL, e.g. `https://doi.org/10.7554/eLife.103191.4`. */
  DOI?: string;
  PMID?: string;
  PMCID?: string;
}

/** Raw cloud-record shape returned verbatim from `/api/datasets/...` endpoints. */
export interface DatasetRecord {
  id: string;
  /** Mongo `_id` returned as `_id` on detail; v2 exposes it as `id`. */
  _id?: string;
  name: string;
  description?: string;
  abstract?: string;
  className?: string;
  affiliation?: string;
  /** Comma-separated species list. */
  species?: string;
  brainRegions?: string;
  numberOfSubjects?: number;
  neurons?: number;
  contributors?: Contributor[];
  correspondingAuthors?: Contributor[];
  funding?: Array<{ source?: string }>;
  associatedPublications?: AssociatedPublication[];
  pubMedId?: string;
  doi?: string;
  license?: string;
  branchName?: string;
  isSubscribed?: boolean;
  organizationId?: string;
  isPublished?: boolean;
  isDeleted?: boolean;
  publishStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  uploadedAt?: string;
  totalSize?: number;
  documentCount?: number;

  /**
   * Embedded compact synthesized summary (Plan B B2). Attached by the
   * backend's catalog enricher. `null` when the synthesizer failed for
   * this row — the card falls back to rendering raw-record fields.
   * Not present (`undefined`) on responses from older backends.
   */
  summary?: CompactDatasetSummary | null;
}

export interface DatasetListResponse {
  totalNumber: number;
  datasets: DatasetRecord[];
}

export interface ClassCountsResponse {
  datasetId: string;
  totalDocuments: number;
  classCounts: Record<string, number>;
}

/**
 * Anonymous-public catalog read. Identical render for all viewers — no
 * per-user state. Phase 3a's `/datasets` RSC server-prefetches this same
 * query key so the client island hydrates instantly.
 *
 * CQ1: zod-validates the listing envelope (`{ totalNumber, datasets:
 * [...] }`) so a backend shape drift on the catalog (the highest-
 * traffic anonymous endpoint) surfaces as `RESPONSE_SHAPE_INVALID`
 * instead of cards rendering with `undefined.name`. Schema is loose-
 * shape (`.passthrough()` on each row) so a new optional field on
 * `DatasetRecord` doesn't block the catalog.
 */
export function usePublishedDatasets(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['datasets', 'published', page, pageSize],
    // `signal` is TanStack Query's per-query AbortSignal; threaded
    // into apiFetch so a navigation-away cancels the in-flight
    // request instead of waiting for the timeout. apiFetch composes
    // it with its default 15s read timeout via `AbortSignal.any`.
    queryFn: ({ signal }) =>
      apiFetch<DatasetListResponse>(
        `/api/datasets/published?page=${page}&pageSize=${pageSize}`,
        { schema: DatasetListResponseSchema, signal },
      ),
  });
}

export type MyScope = 'mine' | 'all';

/**
 * Authenticated "My organization's datasets" list.
 *
 * `scope='mine'` (default): per-org aggregation — every dataset owned
 * by any org the caller is a member of.
 *
 * `scope='all'`: admin-only opt-in fallback to the legacy cloud
 * `/datasets/unpublished` admin-bypass firehose. The backend silently
 * downgrades `scope=all` to `mine` for non-admins.
 */
export function useMyDatasets(enabled: boolean, scope: MyScope = 'mine') {
  return useQuery({
    queryKey: ['datasets', 'my', scope],
    queryFn: ({ signal }) =>
      apiFetch<DatasetListResponse>(
        scope === 'all' ? '/api/datasets/my?scope=all' : '/api/datasets/my',
        { signal },
      ),
    enabled,
  });
}

/**
 * Per-dataset detail endpoints can take 6-60s cold on Railway (the
 * synthesizer fans out across per-class enrichments). The default
 * 15s apiFetch timeout aborts the first attempt for medium+ datasets
 * — and TanStack Query's default 3 retries then turn that into 4×15s
 * = 60s of repeated cold-cache misses, all surfaced to the user as
 * a stuck loading state.
 *
 * Strategy: bump the per-request timeout to 60s and disable retries.
 * Each dataset gets ONE attempt with enough headroom for the cold
 * Railway response, then either succeeds (and the edge cache is now
 * warm for everyone for the next 6 minutes) or surfaces a typed
 * error the user can manually retry. No more silent retry storm.
 *
 * The matching server-side prefetch in `layout.tsx` runs server-to-
 * server (no client-side timeout), so the Suspense-streamed RSC path
 * is never bound by these client-side numbers.
 */
const DETAIL_TIMEOUT_MS = 60_000;
const NO_RETRY = 0 as const;

/**
 * Long staleTime on per-dataset detail hooks. Two reasons:
 *
 *   1. Match the edge-cache window in `lib/api/proxy/cached-proxy.ts`
 *      (`CACHE_ITEM` = 60s fresh + 5 min SWR). With staleTime: 60s,
 *      a client mount within the SWR window sees the hydrated/cached
 *      data as fresh and doesn't fire a redundant client-side fetch.
 *
 *   2. The RSC layout prefetches summary/provenance/class-counts and
 *      ships them via HydrationBoundary. With staleTime: 0 (default),
 *      the client mount immediately marks them stale and refetches —
 *      defeating the prefetch and re-paying the Railway round-trip
 *      on every navigation. 60s aligns the client with the edge.
 */
const DETAIL_STALE_MS = 60_000;

export function useDataset(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: ({ signal }) =>
      // CQ1: zod-validates the dataset detail. Loose-shape via
      // `.passthrough()` — the cloud ships rich records with optional
      // fields that may be added between releases. The schema is a
      // structural gate, not a type-replacer.
      apiFetch<DatasetRecord>(`/api/datasets/${datasetId}`, {
        schema: DatasetRecordSchema,
        signal,
        timeoutMs: DETAIL_TIMEOUT_MS,
      }),
    enabled: !!datasetId,
    retry: NO_RETRY,
    staleTime: DETAIL_STALE_MS,
  });
}

export function useClassCounts(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['dataset', datasetId, 'class-counts'],
    queryFn: ({ signal }) =>
      apiFetch<ClassCountsResponse>(
        `/api/datasets/${datasetId}/class-counts`,
        { signal, timeoutMs: DETAIL_TIMEOUT_MS },
      ),
    enabled: !!datasetId,
    retry: NO_RETRY,
    staleTime: DETAIL_STALE_MS,
  });
}

/**
 * Synthesized dataset summary (Plan B B1).
 */
export function useDatasetSummary(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['dataset', datasetId, 'summary'],
    queryFn: ({ signal }) =>
      apiFetch<DatasetSummary>(`/api/datasets/${datasetId}/summary`, {
        signal,
        timeoutMs: DETAIL_TIMEOUT_MS,
      }),
    enabled: !!datasetId,
    retry: NO_RETRY,
    staleTime: DETAIL_STALE_MS,
  });
}

/**
 * Dataset provenance / derivation graph (Plan B B5).
 */
export function useDatasetProvenance(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['dataset', datasetId, 'provenance'],
    queryFn: ({ signal }) =>
      apiFetch<DatasetProvenance>(`/api/datasets/${datasetId}/provenance`, {
        signal,
        timeoutMs: DETAIL_TIMEOUT_MS,
      }),
    enabled: !!datasetId,
    retry: NO_RETRY,
    staleTime: DETAIL_STALE_MS,
  });
}

/**
 * Grain-selectable pivot response envelope (Plan B B6e).
 */
export interface PivotColumn {
  key: string;
  label: string;
}

export interface PivotResponse {
  datasetId: string;
  grain: string;
  columns: PivotColumn[];
  rows: Array<Record<string, unknown>>;
  computedAt: string;
  schemaVersion: 'pivot:v1';
  totalRows: number;
}

export type PivotGrain = 'subject' | 'session' | 'element';

/**
 * Fetches the pivot table for a given dataset + grain. Gated by
 * `FEATURE_PIVOT_V1` on the backend — a 503 indicates the feature is
 * disabled and the pivot nav should hide itself.
 */
export function useDatasetPivot(
  datasetId: string | undefined,
  grain: PivotGrain | undefined,
) {
  return useQuery({
    queryKey: ['dataset', datasetId, 'pivot', grain],
    queryFn: ({ signal }) =>
      apiFetch<PivotResponse>(`/api/datasets/${datasetId}/pivot/${grain}`, {
        signal,
      }),
    enabled: !!datasetId && !!grain,
    staleTime: 60_000,
  });
}

/**
 * Cross-dataset facet aggregation (Plan B B3).
 */
export function useFacets() {
  return useQuery({
    queryKey: ['facets'],
    queryFn: ({ signal }) =>
      apiFetch<FacetsResponse>('/api/facets', { signal }),
    // Facets change on the order of dataset-publish events (minutes); a
    // short staleTime keeps chip clicks from re-fetching while a new
    // publish still propagates within the 5-minute server TTL.
    staleTime: 30_000,
  });
}

/**
 * Plain async function (no hook wrapper) — the catalog RSC at
 * `app/(app)/datasets/page.tsx` server-side prefetches via this so the
 * `<HydrationBoundary>` ships pre-warmed cache to the client island.
 *
 * The RSC bypasses the Vercel rewrite via `INTERNAL_API_URL` to avoid a
 * double-hop; the URL is composed by the caller. This stays
 * client-fetch-shaped so the same `usePublishedDatasets` hook hydrates
 * the same data.
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
    if (!res.ok) return null;
    const raw = await res.json();
    // Apply the schema so the cloud's `_id`-only responses get
    // transformed to `id`-bearing records, matching the shape the
    // client-side `useDataset` hook receives via `apiFetch + schema`.
    // Without this transform, a hydrated cache would carry `_id`
    // but the client's render code reads `id`, breaking cards.
    return DatasetRecordSchema.parse(raw) as DatasetRecord;
  } catch {
    // Network blip / Railway flap / schema mismatch — return null and
    // let caller fall back to the client-side fetch path.
    return null;
  }
}
