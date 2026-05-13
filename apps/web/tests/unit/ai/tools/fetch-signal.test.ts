/**
 * fetch_signal — hits /api/datasets/:id/documents/:docId/signal,
 * shapes the response into a chart-friendly payload + a citation
 * Reference back to the source NDI document.
 *
 * Tests verify URL construction (incl. query-param assembly), the
 * downsample / t0 / t1 params, the channels-summary shape (counts,
 * not arrays — we strip the heavy data before the LLM sees it), the
 * Reference produced, and the error pathways.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSignalHandler } from '@/lib/ai/tools/fetch-signal';

const TEST_BASE = 'https://api.example.com';

function mockSignalResponse(overrides: Record<string, unknown> = {}) {
  return {
    channels: { ch0: [1.0, 2.0, 3.0, 4.0, 5.0] },
    timestamps: [0.0, 0.001, 0.002, 0.003, 0.004],
    sample_count: 5,
    format: 'nbf',
    error: null,
    downsampled: false,
    original_sample_count: 5,
    t0_seconds: 0.0,
    t1_seconds: 0.004,
    source: {
      dataset_id: 'ds1',
      document_id: 'doc1',
      doc_class: 'element_epoch',
      doc_name: 'Sweep 5',
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

describe('fetch_signal', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('hits the signal endpoint with default downsample', async () => {
    const fetchSpy = mockFetchOnce(mockSignalResponse());
    await fetchSignalHandler({ datasetId: 'ds1', docId: 'doc1' });
    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_BASE}/api/datasets/ds1/documents/doc1/signal?downsample=2000`,
      expect.any(Object),
    );
  });

  it('passes downsample + t0 + t1 query params', async () => {
    const fetchSpy = mockFetchOnce(mockSignalResponse());
    await fetchSignalHandler({
      datasetId: 'ds1',
      docId: 'doc1',
      downsample: 500,
      t0: 1.5,
      t1: 4.5,
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain('downsample=500');
    expect(url).toContain('t0=1.5');
    expect(url).toContain('t1=4.5');
  });

  it('returns chart_payload with the original input params', async () => {
    mockFetchOnce(mockSignalResponse());
    const result = await fetchSignalHandler({
      datasetId: 'ds1',
      docId: 'doc1',
      downsample: 1000,
      t0: 2,
      t1: 4,
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.chart_payload).toEqual({
      datasetId: 'ds1',
      docId: 'doc1',
      downsample: 1000,
      t0: 2,
      t1: 4,
      title: 'Sweep 5',
    });
  });

  it('omits t0/t1 from chart_payload when not provided', async () => {
    mockFetchOnce(mockSignalResponse());
    const result = await fetchSignalHandler({ datasetId: 'ds1', docId: 'doc1' });
    if ('error' in result) throw new Error('expected success');
    expect(result.chart_payload).toEqual({
      datasetId: 'ds1',
      docId: 'doc1',
      downsample: 2000,
      title: 'Sweep 5',
    });
    expect(result.chart_payload).not.toHaveProperty('t0');
    expect(result.chart_payload).not.toHaveProperty('t1');
  });

  it('summarizes channels as name+count (does NOT leak raw arrays to the LLM)', async () => {
    mockFetchOnce(
      mockSignalResponse({
        channels: {
          vm: Array.from({ length: 100 }, (_, i) => i * 0.001),
          i_inj: Array.from({ length: 100 }, (_, i) => -i * 0.5),
        },
      }),
    );
    const result = await fetchSignalHandler({ datasetId: 'ds1', docId: 'doc1' });
    if ('error' in result) throw new Error('expected success');
    expect(result.channels).toEqual([
      { name: 'vm', sample_count: 100 },
      { name: 'i_inj', sample_count: 100 },
    ]);
    // No raw values leaked to the LLM-facing surface.
    expect(result).not.toHaveProperty('timestamps');
    expect(JSON.stringify(result)).not.toMatch(/0\.001|0\.002/);
  });

  it('attaches a Reference pointing to the source document', async () => {
    mockFetchOnce(mockSignalResponse());
    const result = await fetchSignalHandler({ datasetId: 'ds1', docId: 'doc1' });
    if ('error' in result) throw new Error('expected success');
    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({
      doc_id: 'doc1',
      url: '/datasets/ds1/documents/doc1',
      class: 'element_epoch',
      title: 'Sweep 5',
      snippet: expect.stringContaining('nbf'),
    });
  });

  it('falls back to a descriptive title when doc_name is empty', async () => {
    mockFetchOnce(
      mockSignalResponse({
        source: {
          dataset_id: 'ds1',
          document_id: 'doc_abcdef12345678',
          doc_class: 'element_epoch',
          doc_name: null,
        },
      }),
    );
    const result = await fetchSignalHandler({
      datasetId: 'ds1',
      docId: 'doc_abcdef12345678',
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.chart_payload.title).toMatch(/element_epoch/);
    expect(result.references[0]!.title).toMatch(/element_epoch/);
  });

  it('returns { error } when the backend signals a soft-error envelope', async () => {
    mockFetchOnce(
      mockSignalResponse({
        channels: {},
        timestamps: null,
        sample_count: 0,
        error: 'vlt library is not available',
        errorKind: 'vlt_library',
      }),
    );
    const result = await fetchSignalHandler({ datasetId: 'ds1', docId: 'doc1' });
    expect(result).toEqual({
      error: expect.stringMatching(/vlt library/i),
    });
  });

  it('returns { error } on non-2xx upstream', async () => {
    mockFetchOnce('not found', 404);
    const result = await fetchSignalHandler({ datasetId: 'ds1', docId: 'doc1' });
    expect(result).toEqual({ error: expect.stringMatching(/404/) });
  });

  it('rejects empty inputs via zod', async () => {
    const r1 = await fetchSignalHandler({ datasetId: '', docId: 'd' });
    const r2 = await fetchSignalHandler({ datasetId: 'd', docId: '' });
    expect(r1).toEqual({ error: expect.stringMatching(/invalid/i) });
    expect(r2).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('rejects downsample > 5000 via zod', async () => {
    const result = await fetchSignalHandler({
      datasetId: 'd',
      docId: 'doc',
      downsample: 999_999,
    });
    expect(result).toEqual({ error: expect.stringMatching(/invalid/i) });
  });
});
