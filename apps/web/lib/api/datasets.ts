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
 */
export function usePublishedDatasets(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['datasets', 'published', page, pageSize],
    queryFn: () =>
      apiFetch<DatasetListResponse>(
        `/api/datasets/published?page=${page}&pageSize=${pageSize}`,
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
    queryFn: () =>
      apiFetch<DatasetListResponse>(
        scope === 'all' ? '/api/datasets/my?scope=all' : '/api/datasets/my',
      ),
    enabled,
  });
}

export function useDataset(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => apiFetch<DatasetRecord>(`/api/datasets/${datasetId}`),
    enabled: !!datasetId,
  });
}

export function useClassCounts(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['dataset', datasetId, 'class-counts'],
    queryFn: () =>
      apiFetch<ClassCountsResponse>(`/api/datasets/${datasetId}/class-counts`),
    enabled: !!datasetId,
  });
}

/**
 * Synthesized dataset summary (Plan B B1).
 */
export function useDatasetSummary(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['dataset', datasetId, 'summary'],
    queryFn: () =>
      apiFetch<DatasetSummary>(`/api/datasets/${datasetId}/summary`),
    enabled: !!datasetId,
  });
}

/**
 * Dataset provenance / derivation graph (Plan B B5).
 */
export function useDatasetProvenance(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['dataset', datasetId, 'provenance'],
    queryFn: () =>
      apiFetch<DatasetProvenance>(`/api/datasets/${datasetId}/provenance`),
    enabled: !!datasetId,
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
    queryFn: () =>
      apiFetch<PivotResponse>(
        `/api/datasets/${datasetId}/pivot/${grain}`,
      ),
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
    queryFn: () => apiFetch<FacetsResponse>('/api/facets'),
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
