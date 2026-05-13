/**
 * tools.ts — each tool maps to a real FastAPI public endpoint. Tests
 * mock fetch and assert: URL constructed correctly, input zod-validated,
 * non-2xx returns { error }, timeout returns { error }, malformed input
 * rejected.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listPublishedDatasetsHandler,
  getDatasetHandler,
  getDatasetSummaryHandler,
  getDatasetClassCountsHandler,
  getFacetsHandler,
} from '@/lib/ai/tools';

const TEST_BASE = 'https://api.example.com';

describe('lib/ai/tools', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('listPublishedDatasetsHandler', () => {
    it('hits /api/datasets/published with page+pageSize defaults', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ totalNumber: 5, datasets: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const result = await listPublishedDatasetsHandler({});
      expect(fetchSpy).toHaveBeenCalledWith(
        `${TEST_BASE}/api/datasets/published?page=1&pageSize=20`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      // Day 1 citations: every successful tool result attaches a
      // `references` array. With zero datasets returned, the array is
      // empty (one reference per dataset row).
      expect(result).toEqual(
        expect.objectContaining({ totalNumber: 5, datasets: [], references: [] }),
      );
    });

    it('attaches one reference per dataset row', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            totalNumber: 2,
            datasets: [
              { id: 'ds1', name: 'Alpha', description: 'a brief abstract' },
              { id: 'ds2', name: 'Beta' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const result = await listPublishedDatasetsHandler({});
      if ('error' in result) throw new Error('expected success');
      expect(result.references).toHaveLength(2);
      expect(result.references[0]).toMatchObject({
        doc_id: 'ds1',
        url: '/datasets/ds1/overview',
        class: 'dataset',
        title: 'Alpha',
      });
      expect(result.references[1]).toMatchObject({
        doc_id: 'ds2',
        title: 'Beta',
      });
    });

    it('passes through explicit page+pageSize+query', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ totalNumber: 0, datasets: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await listPublishedDatasetsHandler({ page: 2, pageSize: 50, query: 'cortex' });
      expect(fetchSpy).toHaveBeenCalledWith(
        `${TEST_BASE}/api/datasets/published?page=2&pageSize=50&q=cortex`,
        expect.any(Object),
      );
    });

    it('caps pageSize at 100', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ totalNumber: 0, datasets: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await listPublishedDatasetsHandler({ pageSize: 1000 });
      expect(fetchSpy).toHaveBeenCalledWith(
        `${TEST_BASE}/api/datasets/published?page=1&pageSize=100`,
        expect.any(Object),
      );
    });

    it('returns { error } on non-2xx', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('boom', { status: 502 }),
      );
      const result = await listPublishedDatasetsHandler({});
      expect(result).toEqual({ error: expect.stringMatching(/502/) });
    });

    it('returns { error } on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('econnreset'));
      const result = await listPublishedDatasetsHandler({});
      expect(result).toEqual({ error: expect.stringMatching(/network/i) });
    });

    it('returns { error } when INTERNAL_API_URL is unset', async () => {
      vi.unstubAllEnvs();
      vi.stubEnv('INTERNAL_API_URL', '');
      const result = await listPublishedDatasetsHandler({});
      expect(result).toEqual({ error: expect.stringMatching(/not configured/i) });
    });
  });

  describe('getDatasetHandler', () => {
    it('hits /api/datasets/:id and attaches a dataset reference', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'd1',
            name: 'Mouse cortex',
            description: 'V1 recordings',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const result = await getDatasetHandler({ id: 'd1' });
      expect(fetchSpy).toHaveBeenCalledWith(
        `${TEST_BASE}/api/datasets/d1`,
        expect.any(Object),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 'd1',
          name: 'Mouse cortex',
          references: expect.arrayContaining([
            expect.objectContaining({
              doc_id: 'd1',
              url: '/datasets/d1/overview',
              class: 'dataset',
              title: 'Mouse cortex',
            }),
          ]),
        }),
      );
    });

    it('returns { error } on 404', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('not found', { status: 404 }),
      );
      const result = await getDatasetHandler({ id: 'unknown' });
      expect(result).toEqual({ error: expect.stringMatching(/404/i) });
    });

    it('rejects empty id via zod', async () => {
      const result = await getDatasetHandler({ id: '' });
      expect(result).toEqual({ error: expect.stringMatching(/invalid/i) });
    });
  });

  describe('getDatasetSummaryHandler', () => {
    it('hits /api/datasets/:id/summary', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ datasetId: 'd1', totalDocuments: 100 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await getDatasetSummaryHandler({ id: 'd1' });
      expect(fetchSpy).toHaveBeenCalledWith(
        `${TEST_BASE}/api/datasets/d1/summary`,
        expect.any(Object),
      );
    });
  });

  describe('getDatasetClassCountsHandler', () => {
    it('hits /api/datasets/:id/class-counts', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ datasetId: 'd1', totalDocuments: 50, counts: { epoch: 50 } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      await getDatasetClassCountsHandler({ id: 'd1' });
      expect(fetchSpy).toHaveBeenCalledWith(
        `${TEST_BASE}/api/datasets/d1/class-counts`,
        expect.any(Object),
      );
    });
  });

  describe('getFacetsHandler', () => {
    it('hits /api/facets', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ species: [], brainRegions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const result = await getFacetsHandler({});
      expect(fetchSpy).toHaveBeenCalledWith(
        `${TEST_BASE}/api/facets`,
        expect.any(Object),
      );
      expect(result).toEqual(
        expect.objectContaining({
          species: [],
          brainRegions: [],
          references: expect.arrayContaining([
            expect.objectContaining({ class: 'facets' }),
          ]),
        }),
      );
    });
  });
});
