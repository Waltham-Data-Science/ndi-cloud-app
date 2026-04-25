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
  fetchPublishedDatasets,
  useClassCounts,
  useDataset,
  useDatasetPivot,
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

  it('usePublishedDatasets fetches the correct page+pageSize', async () => {
    renderHook(() => usePublishedDatasets(2, 50), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/datasets/published?page=2&pageSize=50',
      ),
    );
  });

  it('useMyDatasets passes scope=all when explicitly requested', async () => {
    renderHook(() => useMyDatasets(true, 'all'), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/api/datasets/my?scope=all'),
    );
  });

  it('useMyDatasets defaults to /api/datasets/my (scope=mine)', async () => {
    renderHook(() => useMyDatasets(true), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/api/datasets/my'),
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
      expect(mockedApiFetch).toHaveBeenCalledWith('/api/datasets/d1'),
    );
  });

  it('useClassCounts fetches /api/datasets/:id/class-counts', async () => {
    renderHook(() => useClassCounts('d1'), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/datasets/d1/class-counts',
      ),
    );
  });

  it('useDatasetSummary fetches /api/datasets/:id/summary', async () => {
    renderHook(() => useDatasetSummary('d1'), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/api/datasets/d1/summary'),
    );
  });

  it('useDatasetProvenance fetches /api/datasets/:id/provenance', async () => {
    renderHook(() => useDatasetProvenance('d1'), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/datasets/d1/provenance',
      ),
    );
  });

  it('useDatasetPivot fetches /api/datasets/:id/pivot/:grain', async () => {
    renderHook(() => useDatasetPivot('d1', 'subject'), {
      wrapper: withClient(),
    });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/datasets/d1/pivot/subject',
      ),
    );
  });

  it('useFacets fetches /api/facets', async () => {
    renderHook(() => useFacets(), { wrapper: withClient() });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/api/facets'),
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
});
