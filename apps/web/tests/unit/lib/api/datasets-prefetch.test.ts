/**
 * prefetchDatasetForPage — direct tests.
 *
 * Added in the 2026-04-29 test-suite audit. This helper is the
 * server-side gate every dataset detail page goes through; pre-2026-
 * 04-27 PR #105 it had a cache-poisoning bug (writing `null` to the
 * TanStack Query cache on prefetch timeout) that caused the
 * tree-shrew dataset to render the bare NDI id — even when the
 * client-side hook would have eventually succeeded.
 *
 * Tests pin the post-#105 behavior: ONLY 2xx-with-data writes get
 * into the QueryClient. Everything else (4xx not-found, 5xx
 * transient, timeout, malformed body) leaves the cache untouched
 * so the client `useDataset` hook can re-fetch cleanly.
 *
 * `next/navigation.notFound` is mocked so the test can observe its
 * call without crashing on the special-error throw mechanism.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    INTERNAL_API_URL: 'https://upstream.example',
  },
}));

// vi.hoisted lifts the mock setup above the module-import phase so
// the `vi.mock('next/navigation')` factory can reference the spy
// without hitting the temporal-dead-zone (vi.mock IS hoisted; bare
// `const` is not).
const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    // Mirrors Next's runtime: notFound throws a special error that the
    // not-found.tsx boundary catches. We throw a sentinel so the
    // helper unwinds, and the test can assert the throw happened.
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

import { prefetchDatasetForPage } from '@/lib/api/datasets-prefetch';
import { BHAR_RECORD } from '@/tests/fixtures/datasets';

const fetchMock = vi.fn();

beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
  notFoundMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * Helper to find the MAIN `['dataset', id]` entry in the dehydrated
 * state — exact 2-element queryKey. The secondary endpoint keys
 * (`['dataset', id, 'summary']`, `['dataset', id, 'class-counts']`,
 * etc.) intentionally don't match — PR #105's fix was specifically
 * about the main key. Secondary keys have their own
 * client-side-fallback story (the hooks revalidate on mount when
 * the data is null/undefined).
 */
function findCachedDataset(
  dehydrated: { queries: Array<{ queryKey: readonly unknown[]; state: { data: unknown } }> },
  id: string,
) {
  return dehydrated.queries.find(
    (q) =>
      Array.isArray(q.queryKey) &&
      q.queryKey.length === 2 &&
      q.queryKey[0] === 'dataset' &&
      q.queryKey[1] === id,
  );
}

describe('prefetchDatasetForPage — cache-poisoning regression (PR #105)', () => {
  it('writes the parsed dataset into the cache on 200', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(BHAR_RECORD), { status: 200 }),
    );
    const dehydrated = (await prefetchDatasetForPage(BHAR_RECORD.id)) as {
      queries: Array<{ queryKey: readonly unknown[]; state: { data: unknown } }>;
    };
    const entry = findCachedDataset(dehydrated, BHAR_RECORD.id);
    expect(entry).toBeDefined();
    expect(entry?.state.data).toMatchObject({
      id: BHAR_RECORD.id,
      name: BHAR_RECORD.name,
    });
  });

  it('does NOT write null to the cache when fetch times out (cache-poisoning regression)', async () => {
    // The tree-shrew failure mode: fetch races against the 1.5s
    // existence-check timeout and the AbortController fires before
    // the response lands. The helper used to write `null` into the
    // cache, which poisoned the client `useDataset` hook (read the
    // null on hydration → returned null synchronously → hero fell
    // back to bare-id and never recovered).
    //
    // Post-#105: skip the write entirely. The client hook then
    // fetches on mount and populates the cache itself.
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => {
          reject(
            Object.assign(new Error('aborted'), { name: 'AbortError' }),
          );
        });
      });
    });
    vi.useFakeTimers();
    const promise = prefetchDatasetForPage('slow-id');
    await vi.advanceTimersByTimeAsync(10_000);
    const dehydrated = (await promise) as {
      queries: Array<{ queryKey: readonly unknown[]; state: { data: unknown } }>;
    };
    vi.useRealTimers();
    const entry = findCachedDataset(dehydrated, 'slow-id');
    // CRITICAL: NO entry should exist for the dataset query.
    // (`entry === undefined` is correct; `entry.state.data === null`
    //  is the regression.)
    expect(entry).toBeUndefined();
  });

  it('does NOT write null to the cache when fetch returns 5xx (transient)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }));
    const dehydrated = (await prefetchDatasetForPage('any')) as {
      queries: Array<{ queryKey: readonly unknown[]; state: { data: unknown } }>;
    };
    expect(findCachedDataset(dehydrated, 'any')).toBeUndefined();
  });

  it('does NOT write null to the cache when fetch throws (network blip)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const dehydrated = (await prefetchDatasetForPage('any')) as {
      queries: Array<{ queryKey: readonly unknown[]; state: { data: unknown } }>;
    };
    expect(findCachedDataset(dehydrated, 'any')).toBeUndefined();
  });

  it('calls notFound() for 400 (validation failure) and 404 (genuine miss)', async () => {
    // Both 400 and 404 from the cloud route to the dataset-scoped
    // not-found.tsx — see PR #104 for the rationale.
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(prefetchDatasetForPage('missing')).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(notFoundMock).toHaveBeenCalledTimes(1);

    notFoundMock.mockClear();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 400 }));
    await expect(prefetchDatasetForPage('invalid')).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT call notFound() on 5xx or network error (treat as transient)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await prefetchDatasetForPage('any');
    expect(notFoundMock).not.toHaveBeenCalled();

    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await prefetchDatasetForPage('any');
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
