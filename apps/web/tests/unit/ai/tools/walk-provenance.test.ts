/**
 * walk_provenance — hits /api/datasets/:id/documents/:docId/dependencies
 * and shapes the response into a graph + references the LLM can cite.
 *
 * Tests verify URL construction, node/edge mapping, the per-node
 * Reference shape, the maxDepth parameter, and the error pathways.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { walkProvenanceHandler } from '@/lib/ndi/tools/walk-provenance';

const TEST_BASE = 'https://api.example.com';

function mockFetchOnce(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('walk_provenance', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('hits the dependencies endpoint with default max_depth=3', async () => {
    // FastAPI route uses `alias="max_depth"`; the cloud-app must emit
    // the aliased param or the backend silently falls back to default 3
    // (Audit 2026-05-18 finding B4).
    const fetchSpy = mockFetchOnce({
      target_id: 'doc1',
      target_ndi_id: 'NDI_target',
      nodes: [],
      edges: [],
      truncated: false,
      max_depth: 3,
    });
    await walkProvenanceHandler({ datasetId: 'ds1', docId: 'doc1' });
    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_BASE}/api/datasets/ds1/documents/doc1/dependencies?max_depth=3`,
      expect.any(Object),
    );
  });

  it('honors an explicit maxDepth and emits the aliased query param', async () => {
    const fetchSpy = mockFetchOnce({
      target_id: 'doc1',
      nodes: [],
      edges: [],
    });
    await walkProvenanceHandler({
      datasetId: 'ds1',
      docId: 'doc1',
      maxDepth: 5,
    });
    expect(fetchSpy.mock.calls[0]![0]).toContain('max_depth=5');
  });

  it('rejects maxDepth > 6 via zod', async () => {
    const result = await walkProvenanceHandler({
      datasetId: 'ds1',
      docId: 'doc1',
      maxDepth: 10,
    });
    expect(result).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('shapes the node list into ProvenanceNode + Reference', async () => {
    mockFetchOnce({
      target_id: 'doc_target',
      target_ndi_id: 'NDI_target',
      nodes: [
        {
          id: 'doc_target',
          ndiId: 'NDI_target',
          name: 'Target name',
          className: 'tuningcurve_calc',
          isTarget: true,
        },
        {
          id: 'doc_b',
          ndiId: 'NDI_b',
          name: '',
          className: 'element',
          isTarget: false,
        },
      ],
      edges: [
        {
          source: 'NDI_target',
          target: 'NDI_b',
          label: 'element_id',
          direction: 'upstream',
        },
      ],
      truncated: false,
      max_depth: 3,
    });
    const result = await walkProvenanceHandler({
      datasetId: 'ds1',
      docId: 'doc_target',
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({
      id: 'doc_target',
      ndiId: 'NDI_target',
      className: 'tuningcurve_calc',
      isTarget: true,
      reference: {
        doc_id: 'doc_target',
        url: '/datasets/ds1/documents/doc_target',
        class: 'tuningcurve_calc',
        title: 'Target name',
        snippet: 'Target of the walk',
      },
    });
    // Anonymous node falls back to className + id-suffix title.
    expect(result.nodes[1]!.reference.title).toMatch(/element/);
    expect(result.edges).toEqual([
      {
        source: 'NDI_target',
        target: 'NDI_b',
        label: 'element_id',
        direction: 'upstream',
      },
    ]);
    expect(result.references).toHaveLength(2);
  });

  it('returns truncated=true when upstream signals truncation', async () => {
    mockFetchOnce({
      target_id: 'd',
      nodes: [],
      edges: [],
      truncated: true,
      max_depth: 3,
    });
    const result = await walkProvenanceHandler({
      datasetId: 'ds1',
      docId: 'd',
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.truncated).toBe(true);
  });

  it('returns { error } on 404', async () => {
    mockFetchOnce('not found', 404);
    const result = await walkProvenanceHandler({
      datasetId: 'ds1',
      docId: 'unknown',
    });
    expect(result).toEqual({ error: expect.stringMatching(/404/) });
  });

  it('rejects empty inputs via zod', async () => {
    const r1 = await walkProvenanceHandler({ datasetId: '', docId: 'd' });
    const r2 = await walkProvenanceHandler({ datasetId: 'd', docId: '' });
    expect(r1).toEqual({ error: expect.stringMatching(/invalid/i) });
    expect(r2).toEqual({ error: expect.stringMatching(/invalid/i) });
  });
});
