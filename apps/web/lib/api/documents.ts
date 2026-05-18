'use client';

/**
 * Document hooks — list, detail, dependency graph.
 * Ported verbatim from `ndi-data-browser-v2/frontend/src/api/documents.ts`.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import { DOCUMENTS_TIMEOUT_MS } from './timeouts';

export interface DocumentSummary {
  id?: string;
  ndiId?: string;
  name?: string;
  className?: string;
  datasetId?: string;
  data?: Record<string, unknown>;
}

export interface DocumentListResponse {
  total: number;
  page: number;
  pageSize: number;
  documents: DocumentSummary[];
}

/**
 * Documents endpoint timing matches the table hooks — cold fetches on
 * large datasets (60k+ docs) can exceed the default 15s read timeout.
 * Same fix: 60s timeout + zero retries + 60s staleTime. See
 * `lib/api/datasets.ts` for the full rationale; this hook is the
 * Document-Explorer-tab equivalent.
 */
// DOCUMENTS_TIMEOUT_MS now lives in `./timeouts.ts` (post-cutover sweep).
const DOCUMENTS_STALE_MS = 60_000;

export function useDocuments(
  datasetId: string | undefined,
  className: string | null,
  page: number,
  pageSize: number,
) {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (className) qs.set('class', className);
  return useQuery({
    queryKey: ['documents', datasetId, className, page, pageSize],
    queryFn: ({ signal }) =>
      apiFetch<DocumentListResponse>(
        `/api/datasets/${datasetId}/documents?${qs.toString()}`,
        { signal, timeoutMs: DOCUMENTS_TIMEOUT_MS },
      ),
    enabled: !!datasetId,
    retry: 0,
    staleTime: DOCUMENTS_STALE_MS,
  });
}

/**
 * Progressive (page-by-page) document loading via TanStack Query's
 * :func:`useInfiniteQuery`. Used by `<DocumentExplorer>` so users see
 * rows arrive AS the backend returns each page instead of waiting for
 * the whole list — important for large datasets (78k+ docs at 50/page
 * = 1500+ pages, but we load only what the user wants to see).
 *
 * Contract:
 *
 *   - The query function fetches one page (`pageParam`) at a time;
 *     `getNextPageParam` walks to the next page until cumulative
 *     `documents.length >= total`.
 *   - The component flat-maps `data.pages` into a single array of
 *     :class:`DocumentSummary` items for rendering.
 *   - The component decides when to call `fetchNextPage()` — typically
 *     once on each successful page so loading is visibly progressive
 *     without firing 1500 simultaneous requests.
 *
 * Cap: the **caller** decides when to stop calling `fetchNextPage`.
 * The hook itself doesn't impose a hard ceiling — TanStack Query's
 * `hasNextPage` is purely a function of pageParam advancement vs
 * total.
 *
 * Per-page timeout/retry behavior matches `useDocuments` (60s timeout,
 * 0 retries, 60s staleTime). When a single page errors, downstream
 * pages stop advancing; the component shows the partial view + a
 * retry affordance.
 */
export interface DocumentPage {
  documents: DocumentSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export function useDocumentsInfinite(
  datasetId: string | undefined,
  className: string | null,
  pageSize: number,
) {
  return useInfiniteQuery({
    queryKey: ['documents:infinite', datasetId, className, pageSize],
    queryFn: ({ pageParam, signal }) => {
      const qs = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(pageSize),
      });
      if (className) qs.set('class', className);
      return apiFetch<DocumentListResponse>(
        `/api/datasets/${datasetId}/documents?${qs.toString()}`,
        { signal, timeoutMs: DOCUMENTS_TIMEOUT_MS },
      );
    },
    initialPageParam: 1,
    /**
     * Advance to the next page until we've covered `total`. The
     * arithmetic uses cumulative loaded-document count (not page
     * count × pageSize) so a partial last page from the backend
     * doesn't trick us into asking for a page that doesn't exist.
     */
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (n, p) => n + p.documents.length, 0,
      );
      if (loaded >= lastPage.total) return undefined;
      return lastPage.page + 1;
    },
    enabled: !!datasetId,
    retry: 0,
    staleTime: DOCUMENTS_STALE_MS,
  });
}

export function useDocument(
  datasetId: string | undefined,
  documentId: string | undefined,
) {
  return useQuery({
    queryKey: ['document', datasetId, documentId],
    queryFn: ({ signal }) =>
      apiFetch<DocumentSummary>(
        `/api/datasets/${datasetId}/documents/${documentId}`,
        { signal, timeoutMs: DOCUMENTS_TIMEOUT_MS },
      ),
    enabled: !!datasetId && !!documentId,
    retry: 0,
    staleTime: DOCUMENTS_STALE_MS,
    // 2026-05-19 (post-handoff) — normalize the backend's nested
    // `data.document_class.class_name` into the top-level `className`
    // every consumer expects per the `DocumentSummary` type. Without
    // this, panels like `VideoPlaybackPanel` that check
    // `doc.className === 'imageStack'` mis-classify every doc as
    // unsupported because Railway's per-doc detail endpoint returns
    // `{ id, data: { document_class: { class_name } } }` without
    // duplicating the class at the top level. Verified live on Bhar
    // imageStack `69eb91431a7ae83f29b19a62`. Idempotent — if the
    // backend ever starts returning `className` directly the existing
    // value wins.
    select: (doc) => {
      if (doc && !doc.className) {
        const nested = (doc.data as { document_class?: { class_name?: string } } | undefined)?.document_class?.class_name;
        if (typeof nested === 'string' && nested.length > 0) {
          return { ...doc, className: nested };
        }
      }
      return doc;
    },
  });
}

// ---------------------------------------------------------------------------
// Dependency graph
// ---------------------------------------------------------------------------

export interface DepGraphNode {
  /** Mongo `_id` — may be null when the ndiId couldn't be resolved. */
  id: string | null;
  ndiId: string;
  name: string;
  className: string;
  isTarget?: boolean;
}

export interface DepGraphEdge {
  source: string;
  target: string;
  label: string;
  direction: 'upstream' | 'downstream';
}

export interface DependencyGraph {
  target_id: string;
  target_ndi_id: string | null;
  nodes: DepGraphNode[];
  edges: DepGraphEdge[];
  node_count: number;
  edge_count: number;
  truncated: boolean;
  max_depth: number;
  error?: string | null;
}

export function useDependencyGraph(
  datasetId: string | undefined,
  documentId: string | undefined,
  maxDepth: number = 3,
) {
  return useQuery({
    queryKey: ['dep-graph', datasetId, documentId, maxDepth],
    queryFn: () =>
      apiFetch<DependencyGraph>(
        `/api/datasets/${datasetId}/documents/${documentId}/dependencies?max_depth=${maxDepth}`,
      ),
    enabled: !!datasetId && !!documentId,
    // 10-min TTL matches the backend Redis cache so revisits render instantly.
    staleTime: 10 * 60 * 1000,
  });
}
