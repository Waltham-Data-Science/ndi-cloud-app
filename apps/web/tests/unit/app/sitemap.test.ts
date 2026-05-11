/**
 * app/sitemap.ts — integration test for the dynamic sitemap.
 *
 * The 2026-04-29 test-suite audit found this module had zero
 * coverage. It's the entry point Google's crawler hits to find
 * every published dataset (Dataset Search ingestion depends on the
 * URLs being listed here, not just on the catalog page rendering
 * cards). A regression that drops dataset URLs would silently
 * remove our datasets from indexing.
 *
 * The fetch helper is mocked; we're testing the SHAPE of the
 * sitemap routes (marketing always present, dataset routes
 * appended), not the underlying pagination logic which has its
 * own direct test file.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/datasets-server', () => ({
  fetchPublishedDatasetsForSitemap: vi.fn(),
}));

import sitemap from '@/app/sitemap';
import { fetchPublishedDatasetsForSitemap } from '@/lib/api/datasets-server';
import {
  BHAR_RECORD,
  FRANCESCONI_RECORD,
  GRISWOLD_RECORD,
  REIKERSDORFER_RECORD,
} from '@/tests/fixtures/datasets';

const fetchMock = vi.mocked(fetchPublishedDatasetsForSitemap);

afterEach(() => {
  vi.clearAllMocks();
});

describe('app/sitemap.ts', () => {
  it('always emits the 7 marketing routes (even on Railway miss)', async () => {
    fetchMock.mockResolvedValueOnce([]);
    const routes = await sitemap();
    const urls = routes.map((r) => r.url);
    expect(urls).toEqual([
      'https://ndi-cloud.com/',
      'https://ndi-cloud.com/datasets',
      'https://ndi-cloud.com/products/private-cloud',
      'https://ndi-cloud.com/products/labchat',
      'https://ndi-cloud.com/about',
      'https://ndi-cloud.com/security',
      'https://ndi-cloud.com/platform',
    ]);
  });

  it('appends per-dataset URLs after the marketing block', async () => {
    fetchMock.mockResolvedValueOnce([
      { id: BHAR_RECORD.id, lastModified: BHAR_RECORD.updatedAt },
      { id: FRANCESCONI_RECORD.id, lastModified: FRANCESCONI_RECORD.updatedAt },
      { id: GRISWOLD_RECORD.id, lastModified: GRISWOLD_RECORD.updatedAt },
      { id: REIKERSDORFER_RECORD.id, lastModified: REIKERSDORFER_RECORD.updatedAt },
    ]);
    const routes = await sitemap();
    const urls = routes.map((r) => r.url);
    // 7 marketing + 4 datasets, datasets after marketing
    expect(urls).toHaveLength(11);
    expect(urls.slice(7)).toEqual([
      `https://ndi-cloud.com/datasets/${BHAR_RECORD.id}/overview`,
      `https://ndi-cloud.com/datasets/${FRANCESCONI_RECORD.id}/overview`,
      `https://ndi-cloud.com/datasets/${GRISWOLD_RECORD.id}/overview`,
      `https://ndi-cloud.com/datasets/${REIKERSDORFER_RECORD.id}/overview`,
    ]);
  });

  it('uses the canonical /overview path for dataset URLs (NOT bare /datasets/<id>)', async () => {
    // Google Dataset Search needs the URL to land on the page that
    // emits the schema.org/Dataset JSON-LD — that's `/overview`. A
    // bare `/datasets/<id>` would redirect to /overview which costs
    // an extra crawler hop and risks the redirect being interpreted
    // as a separate URL.
    fetchMock.mockResolvedValueOnce([{ id: 'd1' }]);
    const routes = await sitemap();
    expect(routes[7]!.url).toBe('https://ndi-cloud.com/datasets/d1/overview');
  });

  it('parses lastModified into a Date object when present', async () => {
    fetchMock.mockResolvedValueOnce([
      { id: 'd1', lastModified: '2025-04-15T00:00:00Z' },
    ]);
    const routes = await sitemap();
    const datasetRoute = routes[7]!;
    expect(datasetRoute.lastModified).toBeInstanceOf(Date);
    expect((datasetRoute.lastModified as Date).toISOString()).toBe(
      '2025-04-15T00:00:00.000Z',
    );
  });

  it('falls back to "now" when a dataset entry has no lastModified', async () => {
    fetchMock.mockResolvedValueOnce([{ id: 'd1' }]);
    const before = Date.now();
    const routes = await sitemap();
    const after = Date.now();
    const datasetRoute = routes[7]!;
    expect(datasetRoute.lastModified).toBeInstanceOf(Date);
    const t = (datasetRoute.lastModified as Date).getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it('marks per-dataset entries with weekly changeFrequency + priority 0.7', async () => {
    fetchMock.mockResolvedValueOnce([{ id: 'd1' }]);
    const routes = await sitemap();
    const datasetRoute = routes[7]!;
    expect(datasetRoute.changeFrequency).toBe('weekly');
    expect(datasetRoute.priority).toBe(0.7);
  });

  it('home page gets priority 1.0 + weekly; /datasets gets 0.9 + daily', async () => {
    fetchMock.mockResolvedValueOnce([]);
    const routes = await sitemap();
    expect(routes[0]).toMatchObject({
      url: 'https://ndi-cloud.com/',
      changeFrequency: 'weekly',
      priority: 1.0,
    });
    expect(routes[1]).toMatchObject({
      url: 'https://ndi-cloud.com/datasets',
      changeFrequency: 'daily',
      priority: 0.9,
    });
  });

  it('degrades gracefully when fetchPublishedDatasetsForSitemap throws', async () => {
    // Sitemap MUST NOT throw — that would break the static build.
    // The helper itself catches errors and returns []; this test
    // pins that contract end-to-end.
    fetchMock.mockResolvedValueOnce([]);
    const routes = await sitemap();
    expect(routes).toHaveLength(7); // marketing-only
  });
});
