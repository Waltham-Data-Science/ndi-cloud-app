/**
 * Server-only dataset fetch helpers — direct tests.
 *
 * Pre-2026-04-29 audit: this module was exercised only indirectly
 * through `DatasetDetailHero` (which awaits `safeFetchDataset` and
 * falls back to the bare-id heading on null). The failure modes
 * (timeout, 4xx, malformed body, missing env) had no direct
 * coverage. Adding them here so a regression in the server-side
 * fetch path surfaces in unit tests, not on a slow-dataset
 * production visit.
 *
 * `env` is mocked to control `INTERNAL_API_URL`. `global.fetch` is
 * mocked per-test to model the cloud's responses. The
 * `'server-only'` import in the module-under-test is stubbed at the
 * test-suite level (see `tests/unit/setup.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    INTERNAL_API_URL: 'https://upstream.example',
  },
}));

import {
  fetchPublishedDatasetsForSitemap,
  safeFetchDataset,
} from '@/lib/api/datasets-server';
import { env } from '@/lib/env';
import { BHAR_RECORD } from '@/tests/fixtures/datasets';

const fetchMock = vi.fn();

beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
  // Reset env between tests in case a case overrides it.
  (env as { INTERNAL_API_URL?: string }).INTERNAL_API_URL =
    'https://upstream.example';
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── safeFetchDataset ──────────────────────────────────────────────

describe('safeFetchDataset', () => {
  it('returns null when INTERNAL_API_URL is unset (dev / preview without backend)', async () => {
    (env as { INTERNAL_API_URL?: string }).INTERNAL_API_URL = undefined;
    expect(await safeFetchDataset('any')).toBeNull();
    // Must NOT have called fetch — short-circuits on env check.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the parsed record on 200', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(BHAR_RECORD), { status: 200 }),
    );
    const got = await safeFetchDataset(BHAR_RECORD.id);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(BHAR_RECORD.id);
    expect(got!.name).toBe(BHAR_RECORD.name);
  });

  it('routes the request to the correct upstream URL', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(BHAR_RECORD), { status: 200 }),
    );
    await safeFetchDataset(BHAR_RECORD.id);
    const calledUrl = fetchMock.mock.calls[0]![0] as string;
    expect(calledUrl).toBe(
      `https://upstream.example/api/datasets/${BHAR_RECORD.id}`,
    );
  });

  it('returns null on 404 (not-found is the caller\'s decision)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    expect(await safeFetchDataset('missing')).toBeNull();
  });

  it('returns null on 401 / 403 (auth gates on a public surface = no record)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    expect(await safeFetchDataset('any')).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }));
    expect(await safeFetchDataset('any')).toBeNull();
  });

  it('returns null on 5xx (transient — caller falls back, not notFound)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }));
    expect(await safeFetchDataset('any')).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await safeFetchDataset('any')).toBeNull();
  });

  it('returns null when the response body is not valid JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<!doctype html>not json', { status: 200 }),
    );
    expect(await safeFetchDataset('any')).toBeNull();
  });

  it('returns null when the response body lacks a string `name` field', async () => {
    // Shape-gate: even on 200, if the body doesn't have `name: string`
    // we treat it as malformed (could be a wrong endpoint, an
    // error envelope, etc.).
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'x' }), { status: 200 }),
    );
    expect(await safeFetchDataset('any')).toBeNull();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ name: 12345 }), { status: 200 }),
    );
    expect(await safeFetchDataset('any')).toBeNull();
  });

  it('returns null when fetch aborts via the timeout (signal.aborted)', async () => {
    // Simulate a fetch that takes longer than the timeout. We catch
    // the AbortError that fires once the controller's timer trips.
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => {
          reject(
            Object.assign(new Error('aborted'), { name: 'AbortError' }),
          );
        });
      });
    });
    // Don't wait for the real 8s — patch the timeout to a few ms via
    // fake timers + advance.
    vi.useFakeTimers();
    const promise = safeFetchDataset('slow');
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    expect(result).toBeNull();
    vi.useRealTimers();
  });
});

// ─── fetchPublishedDatasetsForSitemap ──────────────────────────────

describe('fetchPublishedDatasetsForSitemap', () => {
  it('returns [] when INTERNAL_API_URL is unset', async () => {
    (env as { INTERNAL_API_URL?: string }).INTERNAL_API_URL = undefined;
    expect(await fetchPublishedDatasetsForSitemap()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns dataset id + updatedAt entries from a single-page response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          datasets: [
            { id: 'bhar', updatedAt: '2026-04-15T00:00:00Z' },
            { id: 'francesconi', updatedAt: '2025-09-27T00:00:00Z' },
            { id: 'griswold', updatedAt: '2025-07-26T00:00:00Z' },
          ],
          totalNumber: 3,
        }),
        { status: 200 },
      ),
    );
    const result = await fetchPublishedDatasetsForSitemap();
    expect(result).toEqual([
      { id: 'bhar', lastModified: '2026-04-15T00:00:00Z' },
      { id: 'francesconi', lastModified: '2025-09-27T00:00:00Z' },
      { id: 'griswold', lastModified: '2025-07-26T00:00:00Z' },
    ]);
  });

  it('terminates pagination when a page returns fewer than pageSize entries', async () => {
    // 100 entries on page 1, 50 on page 2 → stop after page 2.
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `ds_${i}`,
      updatedAt: '2025-01-01T00:00:00Z',
    }));
    const page2 = Array.from({ length: 50 }, (_, i) => ({
      id: `ds_${100 + i}`,
      updatedAt: '2025-01-01T00:00:00Z',
    }));
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ datasets: page1 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ datasets: page2 }), { status: 200 }),
      );
    const result = await fetchPublishedDatasetsForSitemap();
    expect(result).toHaveLength(150);
    // Should NOT have fired a third call.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('terminates pagination when out.length >= totalNumber (cloud reports the cap)', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `ds_${i}`,
      updatedAt: '2025-01-01T00:00:00Z',
    }));
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ datasets: page1, totalNumber: 100 }),
        { status: 200 },
      ),
    );
    const result = await fetchPublishedDatasetsForSitemap();
    expect(result).toHaveLength(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('hard-caps at SITEMAP_MAX_PAGES (1000 datasets) even when the cloud has more', async () => {
    // 11 full pages of 100 — should stop at page 10.
    for (let i = 0; i < 11; i++) {
      const page = Array.from({ length: 100 }, (_, j) => ({
        id: `ds_${i * 100 + j}`,
        updatedAt: '2025-01-01T00:00:00Z',
      }));
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ datasets: page, totalNumber: 1500 }),
          { status: 200 },
        ),
      );
    }
    const result = await fetchPublishedDatasetsForSitemap();
    expect(result).toHaveLength(1000); // 10 pages * 100
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('returns partial results when a mid-pagination page errors', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `ds_${i}`,
      updatedAt: '2025-01-01T00:00:00Z',
    }));
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ datasets: page1 }), { status: 200 }),
      )
      .mockRejectedValueOnce(new Error('network blip'));
    const result = await fetchPublishedDatasetsForSitemap();
    // Got page 1's 100; page 2 errored → stop, return what we have.
    expect(result).toHaveLength(100);
  });

  it('returns [] when the first page errors (no entries collected)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network blip'));
    expect(await fetchPublishedDatasetsForSitemap()).toEqual([]);
  });

  it('returns [] when the first page is non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }));
    expect(await fetchPublishedDatasetsForSitemap()).toEqual([]);
  });

  it('skips entries without a string id field (defensive parse)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          datasets: [
            { id: 'valid', updatedAt: '2025-01-01T00:00:00Z' },
            { id: 12345, updatedAt: '2025-01-01T00:00:00Z' }, // wrong type
            { updatedAt: '2025-01-01T00:00:00Z' }, // missing id
            { id: '', updatedAt: '2025-01-01T00:00:00Z' }, // empty id
            { id: 'also_valid' },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await fetchPublishedDatasetsForSitemap();
    expect(result.map((d) => d.id)).toEqual(['valid', 'also_valid']);
  });

  it('handles missing updatedAt (lastModified is undefined)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ datasets: [{ id: 'no_date' }] }),
        { status: 200 },
      ),
    );
    const result = await fetchPublishedDatasetsForSitemap();
    expect(result).toEqual([{ id: 'no_date', lastModified: undefined }]);
  });
});
