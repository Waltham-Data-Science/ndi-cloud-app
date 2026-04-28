/**
 * datasets.ts hook contract — verifies each TanStack-Query wrapper hits
 * the right URL with the right query key + enabled gate.
 *
 * The data-browser surface is large (12 hooks) and each wrapper is a
 * thin layer over apiFetch. Rather than re-test the underlying fetch
 * (covered by client.test.ts), these tests ensure the URL path and
 * query-key are correct so a pagination off-by-one or a slug typo
 * surfaces in CI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import {
  fetchDatasetServer,
  fetchPublishedDatasets,
  useClassCounts,
  useDataset,
  useDatasetProvenance,
  useDatasetSummary,
  useFacets,
  useMyDatasets,
  usePublishedDatasets,
} from '@/lib/api/datasets';
import { apiFetch } from '@/lib/api/client';

const mockedApiFetch = vi.mocked(apiFetch);

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestQueryProvider;
}

describe('lib/api/datasets — hook URL contracts', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ totalNumber: 0, datasets: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Hooks now thread TanStack Query's per-query AbortSignal into
  // apiFetch (Batch A — perf foundational). Tests assert URL + the
  // `signal` option's presence/type rather than the bare URL, so a
  // future caller-supplied option doesn't silently get dropped from
  // the fetch wrapper.
  const signalOpt = expect.objectContaining({
    signal: expect.any(AbortSignal),
  });

  it('usePublishedDatasets fetches the correct page+pageSize', async () => {
    renderHook(() => usePublishedDatasets(2, 50), { wrapper: withClient() });
    // CQ1: hook now passes a `schema` for runtime shape validation.
    // Assertion uses objectContaining so the schema arg is asserted by
    // shape (presence of a `parse` method) rather than reference
    // equality — keeps the test resilient if zod's schema-object
    // implementation details shift between versions.
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/datasets/published?page=2&pageSize=50',
        expect.objectContaining({
          schema: expect.objectContaining({ parse: expect.any(Function) }),
          signal: expect.any(AbortSignal),
        }),
      ),
    );
  });

  it('useMyDatasets passes scope=all when explicitly requested', async () => {
    renderHook(() => useMyDatasets(true, 'all'), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/datasets/my?scope=all',
        signalOpt,
      ),
    );
  });

  it('useMyDatasets defaults to /api/datasets/my (scope=mine)', async () => {
    renderHook(() => useMyDatasets(true), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/datasets/my',
        signalOpt,
      ),
    );
  });

  it('useDataset stays disabled when datasetId is undefined', () => {
    renderHook(() => useDataset(undefined), { wrapper: withClient() });
    // Hook-init renders synchronously; if disabled, no fetch fires.
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('useDataset fetches /api/datasets/:id when enabled', async () => {
    renderHook(() => useDataset('d1'), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/datasets/d1',
        // CQ1: schema arg added for runtime shape validation.
        // Batch A: signal arg added for cancellation.
        expect.objectContaining({
          schema: expect.objectContaining({ parse: expect.any(Function) }),
          signal: expect.any(AbortSignal),
        }),
      ),
    );
  });

  it('useClassCounts fetches /api/datasets/:id/class-counts', async () => {
    renderHook(() => useClassCounts('d1'), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/datasets/d1/class-counts',
        signalOpt,
      ),
    );
  });

  it('useDatasetSummary fetches /api/datasets/:id/summary', async () => {
    renderHook(() => useDatasetSummary('d1'), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/datasets/d1/summary',
        signalOpt,
      ),
    );
  });

  it('useDatasetProvenance fetches /api/datasets/:id/provenance', async () => {
    renderHook(() => useDatasetProvenance('d1'), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/datasets/d1/provenance',
        signalOpt,
      ),
    );
  });

  it('useFacets fetches /api/facets', async () => {
    renderHook(() => useFacets(), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/api/facets', signalOpt),
    );
  });

  describe('fetchPublishedDatasets (server-side)', () => {
    it('GETs the published catalog with no-store cache', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ totalNumber: 1, datasets: [{ id: 'd1', name: 'a' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const result = await fetchPublishedDatasets('https://api.example.com', 1, 20);
      expect(result.totalNumber).toBe(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/api/datasets/published?page=1&pageSize=20',
        expect.objectContaining({ cache: 'no-store' }),
      );
      fetchSpy.mockRestore();
    });

    it('throws on non-2xx', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('boom', { status: 502 }),
      );
      await expect(
        fetchPublishedDatasets('https://api.example.com', 1, 20),
      ).rejects.toThrow(/Catalog prefetch failed.*502/);
    });
  });

  describe('fetchDatasetServer (A2 generateMetadata helper)', () => {
    // The helper is intentionally non-throwing — generateMetadata is a
    // best-effort enhancement; failure must fall back to a generic title
    // rather than blocking the page render. These tests pin that
    // contract.
    it('returns the parsed dataset on 200', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'd1', name: 'Mouse cortex 2024' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const result = await fetchDatasetServer(
        'https://api.example.com',
        'd1',
      );
      expect(result?.name).toBe('Mouse cortex 2024');
    });

    it('forwards the cookie header when provided', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'd1', name: 'x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await fetchDatasetServer(
        'https://api.example.com',
        'd1',
        'session=abc; XSRF-TOKEN=xyz',
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/api/datasets/d1',
        // Batch B: fetchDatasetServer now uses Next's request memo
        // (`force-cache` + `revalidate: 60`) instead of `no-store` so
        // concurrent layout-RSC renders dedupe to one upstream call.
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: 'session=abc; XSRF-TOKEN=xyz',
            Accept: 'application/json',
          }),
          cache: 'force-cache',
        }),
      );
      fetchSpy.mockRestore();
    });

    it('omits the Cookie header when no cookie passed', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'd1', name: 'x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await fetchDatasetServer('https://api.example.com', 'd1');
      const call = fetchSpy.mock.calls[0];
      const init = call?.[1] as RequestInit & {
        headers: Record<string, string>;
      };
      expect(init.headers.Cookie).toBeUndefined();
      fetchSpy.mockRestore();
    });

    it('returns null on 404 (private dataset, anon viewer)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('not found', { status: 404 }),
      );
      const result = await fetchDatasetServer(
        'https://api.example.com',
        'gone',
      );
      expect(result).toBeNull();
    });

    it('returns null on 401 (org-private dataset, no cookie)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('unauthorized', { status: 401 }),
      );
      const result = await fetchDatasetServer(
        'https://api.example.com',
        'private',
      );
      expect(result).toBeNull();
    });

    it('returns null on network error (no throw)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('econnreset'),
      );
      const result = await fetchDatasetServer(
        'https://api.example.com',
        'd1',
      );
      expect(result).toBeNull();
    });
  });
});
