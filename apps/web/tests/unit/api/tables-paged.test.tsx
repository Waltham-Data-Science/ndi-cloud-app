/**
 * Stream 5.8 (2026-05-16) — `usePagedDatasetTable` infinite-query hook.
 *
 * Locks two things:
 *   1. URL construction: each page fetch hits
 *      `/api/datasets/:id/tables/:class?page=N&pageSize=M`.
 *   2. `getNextPageParam` walk: when the backend says `hasMore: true`
 *      the next fetchNextPage advances to page+1; when it says
 *      `hasMore: false` the walk stops.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api/client';
import { usePagedDatasetTable } from '@/lib/api/tables';

const mockedApiFetch = vi.mocked(apiFetch);

function makeWrapper() {
  // No gcTime override — the hook's data must stay in cache across
  // fetchNextPage calls so the test can read accumulated `pages`.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe('usePagedDatasetTable', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches page 1 with the right URL on initial mount', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      columns: [{ key: 'x', label: 'X' }],
      rows: [{ x: 1 }, { x: 2 }],
      page: 1,
      pageSize: 2,
      totalRows: 5,
      hasMore: true,
    });

    const { result } = renderHook(
      () => usePagedDatasetTable('ds-1', 'subject', 2),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/datasets/ds-1/tables/subject?page=1&pageSize=2',
      expect.objectContaining({}),
    );
    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0]!.rows).toHaveLength(2);
  });

  it('walks to page 2 when hasMore=true, stops when hasMore=false', async () => {
    // URL-routed mock so the order of calls doesn't matter; each request
    // gets its own page envelope based on the `page=` parameter.
    mockedApiFetch.mockImplementation((url: string) => {
      const m = /page=(\d+)/.exec(url);
      const page = m ? parseInt(m[1]!, 10) : 1;
      const allRows = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 }];
      const pageSize = 2;
      const start = (page - 1) * pageSize;
      const slice = allRows.slice(start, start + pageSize);
      return Promise.resolve({
        rows: slice,
        columns: [],
        page,
        pageSize,
        totalRows: allRows.length,
        hasMore: start + pageSize < allRows.length,
      });
    });

    const { result } = renderHook(
      () => usePagedDatasetTable('ds-1', 'subject', 2),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Initial page loaded.
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.data?.pages[0]!.page).toBe(1);

    // Advance to page 2.
    let nextResult = await result.current.fetchNextPage();
    expect(nextResult.data?.pages).toHaveLength(2);
    expect(nextResult.data?.pages[1]!.page).toBe(2);

    // Advance to page 3 — the last (partial) page.
    nextResult = await result.current.fetchNextPage();
    expect(nextResult.data?.pages).toHaveLength(3);
    expect(nextResult.data?.pages[2]!.page).toBe(3);
    expect(nextResult.data?.pages[2]!.hasMore).toBe(false);
    expect(nextResult.hasNextPage).toBe(false);

    // Verify the URLs in flight were what we expected.
    const urls = mockedApiFetch.mock.calls.map((c) => c[0] as string);
    expect(urls).toEqual([
      '/api/datasets/ds-1/tables/subject?page=1&pageSize=2',
      '/api/datasets/ds-1/tables/subject?page=2&pageSize=2',
      '/api/datasets/ds-1/tables/subject?page=3&pageSize=2',
    ]);
  });

  it('skips firing while datasetId or className is undefined', () => {
    renderHook(() => usePagedDatasetTable(undefined, 'subject', 200), {
      wrapper: makeWrapper(),
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();

    renderHook(() => usePagedDatasetTable('ds-1', undefined, 200), {
      wrapper: makeWrapper(),
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
