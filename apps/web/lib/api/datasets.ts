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
// DATASET_DETAIL_TIMEOUT_MS + CLASS_COUNTS_TIMEOUT_MS live in
// `./timeouts.ts` (post-cutover sweep — centralized all api/ timeouts).
// Round-3 review surfaced production timeouts on Haley (78k docs, ~88s)
// and Dabrowska-CRH-3 (~90s); the 120s budget there is the safety net.
import {
  CLASS_COUNTS_TIMEOUT_MS,
  DATASET_DETAIL_TIMEOUT_MS,
} from './timeouts';

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
        timeoutMs: DATASET_DETAIL_TIMEOUT_MS,
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
        { signal, timeoutMs: CLASS_COUNTS_TIMEOUT_MS },
      ),
    enabled: !!datasetId,
    retry: NO_RETRY,
    // Within-session staleTime of 5 min so navigating between sub-tabs
    // (overview ↔ documents ↔ tables) on the same dataset doesn't
    // re-pay the slow cloud aggregation. The default DETAIL_STALE_MS
    // of 60s is fine for fast hooks but punishes large-dataset users
    // who navigate around and trip the 90s aggregation again.
    staleTime: 5 * 60_000,
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
        timeoutMs: DATASET_DETAIL_TIMEOUT_MS,
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
        timeoutMs: DATASET_DETAIL_TIMEOUT_MS,
      }),
    enabled: !!datasetId,
    retry: NO_RETRY,
    staleTime: DETAIL_STALE_MS,
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

// Note: the plain async helpers `fetchPublishedDatasets`,
// `fetchDatasetServer`, and `fetchDatasetServerWithStatus` live in
// `lib/api/datasets-server.ts` (which has `import 'server-only'`).
// Keeping them out of this `'use client'` module is what unblocks
// `generateStaticParams` from calling them at build time — Next.js
// 16 hard-fails the build when a server-side function call resolves
// to a 'use client' source. The types `DatasetRecord` and
// `DatasetListResponse` defined above are erased at compile time, so
// importing them server-side from this file is safe.
