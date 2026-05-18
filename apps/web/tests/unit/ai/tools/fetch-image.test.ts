/**
 * fetch_image — hits /api/datasets/:id/documents/:docId/image,
 * shapes the response into a chart-friendly payload + a citation
 * Reference back to the source NDI document.
 *
 * Tests verify URL construction (frame param), the source-strip
 * behavior (raw pixel arrays are NEVER leaked to the LLM-facing
 * surface), the Reference produced, the title-fallback chain
 * (props → doc_name → filename → class), and the error pathways
 * (validation, network, backend soft-error envelope).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchImageHandler } from '@/lib/ndi/tools/fetch-image';

const TEST_BASE = 'https://api.example.com';

function mockImageResponse(overrides: Record<string, unknown> = {}) {
  return {
    width: 256,
    height: 256,
    data: [
      [0.0, 1.0, 2.0],
      [3.0, 4.0, 5.0],
    ],
    min: 0.0,
    max: 5.0,
    format: 'tiff',
    downsampled: false,
    source: {
      dataset_id: 'ds1',
      document_id: 'doc1',
      doc_class: 'image',
      doc_name: 'Patch encounter map S1',
      filename: 'cell_image.tiff',
    },
    ...overrides,
  };
}

function mockFetchOnce(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('fetch_image', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('hits the image endpoint with default frame=0', async () => {
    const fetchSpy = mockFetchOnce(mockImageResponse());
    await fetchImageHandler({ datasetId: 'ds1', docId: 'doc1' });
    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_BASE}/api/datasets/ds1/documents/doc1/image?frame=0`,
      expect.any(Object),
    );
  });

  it('passes an explicit frame index', async () => {
    const fetchSpy = mockFetchOnce(mockImageResponse());
    await fetchImageHandler({ datasetId: 'ds1', docId: 'doc1', frame: 5 });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain('frame=5');
  });

  it('returns chart_payload with the original input params', async () => {
    mockFetchOnce(mockImageResponse());
    const result = await fetchImageHandler({
      datasetId: 'ds1',
      docId: 'doc1',
      frame: 2,
      title: 'My image',
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.chart_payload).toEqual({
      datasetId: 'ds1',
      docId: 'doc1',
      frame: 2,
      title: 'My image',
    });
  });

  it('strips the raw pixel array from the LLM-facing surface', async () => {
    // Build a response with a "real" 512x512 array — but the tool
    // result MUST NOT contain it. If we let the array through, a
    // single image call would blow 1.5 MB of LLM context.
    const fakeArray = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => Math.random()),
    );
    mockFetchOnce(mockImageResponse({ data: fakeArray }));
    const result = await fetchImageHandler({ datasetId: 'ds1', docId: 'doc1' });
    if ('error' in result) throw new Error('expected success');
    // No raw values leaked. Serialize to be sure no field carries them.
    expect(result).not.toHaveProperty('data');
    const serialized = JSON.stringify(result);
    // None of the random floats from fakeArray should appear anywhere.
    for (const row of fakeArray) {
      for (const v of row) {
        expect(serialized).not.toContain(String(v));
      }
    }
  });

  it('attaches a Reference pointing to the source document', async () => {
    mockFetchOnce(mockImageResponse());
    const result = await fetchImageHandler({ datasetId: 'ds1', docId: 'doc1' });
    if ('error' in result) throw new Error('expected success');
    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({
      doc_id: 'doc1',
      url: '/datasets/ds1/documents/doc1',
      class: 'image',
      title: 'Patch encounter map S1',
      snippet: expect.stringContaining('tiff'),
    });
    expect(result.references[0]!.snippet).toContain('256x256');
  });

  it('uses the explicit title from props when provided', async () => {
    mockFetchOnce(mockImageResponse());
    const result = await fetchImageHandler({
      datasetId: 'ds1',
      docId: 'doc1',
      title: 'Custom title from PI',
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.chart_payload.title).toBe('Custom title from PI');
    expect(result.references[0]!.title).toBe('Custom title from PI');
  });

  it('falls back to source.doc_name when title prop is absent', async () => {
    mockFetchOnce(mockImageResponse());
    const result = await fetchImageHandler({ datasetId: 'ds1', docId: 'doc1' });
    if ('error' in result) throw new Error('expected success');
    expect(result.chart_payload.title).toBe('Patch encounter map S1');
  });

  it('falls back to filename when title + doc_name are absent', async () => {
    mockFetchOnce(
      mockImageResponse({
        source: {
          dataset_id: 'ds1',
          document_id: 'doc1',
          doc_class: 'image',
          doc_name: null,
          filename: 'cell_image.tiff',
        },
      }),
    );
    const result = await fetchImageHandler({ datasetId: 'ds1', docId: 'doc1' });
    if ('error' in result) throw new Error('expected success');
    expect(result.chart_payload.title).toBe('cell_image.tiff');
  });

  it('falls back to a descriptive title when everything is empty', async () => {
    mockFetchOnce(
      mockImageResponse({
        source: {
          dataset_id: 'ds1',
          document_id: 'doc_abcdef12345678',
          doc_class: 'image',
          doc_name: null,
          filename: null,
        },
      }),
    );
    const result = await fetchImageHandler({
      datasetId: 'ds1',
      docId: 'doc_abcdef12345678',
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.chart_payload.title).toMatch(/image/);
    expect(result.references[0]!.title).toMatch(/image/);
  });

  it('passes through metadata fields on success', async () => {
    mockFetchOnce(
      mockImageResponse({ width: 512, height: 384, downsampled: true }),
    );
    const result = await fetchImageHandler({ datasetId: 'ds1', docId: 'doc1' });
    if ('error' in result) throw new Error('expected success');
    expect(result.width).toBe(512);
    expect(result.height).toBe(384);
    expect(result.downsampled).toBe(true);
    expect(result.format).toBe('tiff');
    expect(result.min).toBe(0);
    expect(result.max).toBe(5);
  });

  it('returns { error } when the backend signals a soft-error envelope', async () => {
    mockFetchOnce({
      error: 'Image format not recognized by Pillow',
      errorKind: 'unsupported',
    });
    const result = await fetchImageHandler({ datasetId: 'ds1', docId: 'doc1' });
    expect(result).toEqual({
      error: expect.stringMatching(/not recognized/i),
    });
  });

  it('returns { error } on non-2xx upstream', async () => {
    mockFetchOnce('not found', 404);
    const result = await fetchImageHandler({ datasetId: 'ds1', docId: 'doc1' });
    expect(result).toEqual({ error: expect.stringMatching(/404/) });
  });

  it('rejects empty inputs via zod', async () => {
    const r1 = await fetchImageHandler({ datasetId: '', docId: 'd' });
    const r2 = await fetchImageHandler({ datasetId: 'd', docId: '' });
    expect(r1).toEqual({ error: expect.stringMatching(/invalid/i) });
    expect(r2).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('rejects negative frame via zod', async () => {
    const result = await fetchImageHandler({
      datasetId: 'd',
      docId: 'doc',
      frame: -1,
    });
    expect(result).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('rejects frame > 10000 via zod', async () => {
    const result = await fetchImageHandler({
      datasetId: 'd',
      docId: 'doc',
      frame: 999_999,
    });
    expect(result).toEqual({ error: expect.stringMatching(/invalid/i) });
  });
});
