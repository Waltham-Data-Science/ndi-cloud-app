/**
 * fetch_spike_summary — pulls vmspikesummary documents from one of
 * three discovery paths (unitDocId / unitNameMatch / dataset-scan),
 * extracts spike-time arrays, computes ISIs when requested, and
 * shapes the result for the spike-raster + isi-histogram fences.
 *
 * Tests cover:
 *   - direct doc-id fetch happy path (kind="raster")
 *   - unitNameMatch query path (kind="isi_histogram")
 *   - dataset-scan fallback (no filters)
 *   - kind="both" returns two chart payloads
 *   - empty results surface empty_hint
 *   - parseable-spike-times fallback (no spike_times → tries sample_times)
 *   - tWindow filters spikes server-side
 *   - maxUnits cap enforced
 *   - ISI computation: diff of sorted spike_times, ms units
 *   - references built (one per doc, capped at 10)
 *   - zod input validation
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSpikeSummaryHandler } from '@/lib/ai/tools/fetch-spike-summary';

const TEST_BASE = 'https://api.example.com';
const DSID = 'a'.repeat(24);

function mockFetchOnce(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function makeVmDoc(opts: {
  id?: string;
  ndiId?: string;
  unitName?: string;
  spike_times?: number[];
  sample_times?: number[];
  field?: 'spike_times' | 'sample_times';
}) {
  const inner: Record<string, unknown> = {};
  if (opts.unitName) inner.name = opts.unitName;
  if (opts.spike_times !== undefined) inner.spike_times = opts.spike_times;
  if (opts.sample_times !== undefined) inner.sample_times = opts.sample_times;
  return {
    id: opts.id ?? 'doc-1',
    ndiId: opts.ndiId ?? 'ndi-1',
    name: '',
    datasetId: DSID,
    document_class: { class_name: 'vmspikesummary' },
    data: { vmspikesummary: inner },
  };
}

describe('fetch_spike_summary', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ── kind="raster" + direct unitDocId ──────────────────────────────

  it('fetches a single doc by ID and returns a raster chart payload', async () => {
    const fetchSpy = mockFetchOnce({
      document: makeVmDoc({
        id: 'doc-123',
        unitName: 'Unit 12 (Saline)',
        spike_times: [0.1, 0.2, 0.3, 0.5, 0.8],
      }),
    });

    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      unitDocId: 'doc-123',
      kind: 'raster',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_BASE}/api/datasets/${DSID}/documents/doc-123`,
      expect.any(Object),
    );
    if ('error' in res) throw new Error(res.error);
    expect(res.kind).toBe('raster');
    expect(res.unit_count).toBe(1);
    expect(res.total_spikes).toBe(5);
    expect(res.time_range).toEqual({ min: 0.1, max: 0.8 });
    expect(res.chart_payloads).toHaveLength(1);
    const payload = res.chart_payloads[0]!;
    expect(payload.kind).toBe('raster');
    if (payload.kind !== 'raster') throw new Error('unreachable');
    expect(payload.units).toEqual([
      { name: 'Unit 12 (Saline)', spikeTimes: [0.1, 0.2, 0.3, 0.5, 0.8] },
    ]);
    expect(payload.datasetId).toBe(DSID);
    expect(res.references).toHaveLength(1);
    expect(res.references[0]).toMatchObject({
      doc_id: 'doc-123',
      class: 'vmspikesummary',
      title: 'Unit 12 (Saline)',
    });
  });

  // ── kind="isi_histogram" + unitNameMatch query ─────────────────────

  it('queries with unitNameMatch and computes ISI in milliseconds', async () => {
    const fetchSpy = mockFetchOnce({
      documents: [
        makeVmDoc({
          id: 'doc-A',
          unitName: 'Unit A (Saline)',
          // 4 spikes → 3 intervals: 100ms, 100ms, 200ms
          spike_times: [0.1, 0.2, 0.3, 0.5],
        }),
      ],
      totalItems: 1,
      page: 1,
      pageSize: 50,
    });

    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      unitNameMatch: 'Saline',
      kind: 'isi_histogram',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_BASE}/api/query`,
      expect.objectContaining({ method: 'POST' }),
    );
    const calledBody = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as { body: string }).body,
    );
    expect(calledBody.scope).toBe(DSID);
    expect(calledBody.searchstructure).toEqual([
      { operation: 'isa', param1: 'vmspikesummary' },
      {
        operation: 'contains_string',
        field: 'vmspikesummary.name',
        param1: 'Saline',
      },
    ]);

    if ('error' in res) throw new Error(res.error);
    expect(res.unit_count).toBe(1);
    expect(res.chart_payloads).toHaveLength(1);
    const payload = res.chart_payloads[0]!;
    if (payload.kind !== 'isi_histogram') throw new Error('expected isi');
    expect(payload.logBins).toBe(true);
    // Spike times in seconds → intervals in ms. Float-precision wiggle
    // (0.2 - 0.1 = 0.09999... in IEEE-754) means we compare numerically
    // rather than structurally.
    expect(payload.intervals).toHaveLength(3);
    expect(payload.intervals[0]).toBeCloseTo(100, 6);
    expect(payload.intervals[1]).toBeCloseTo(100, 6);
    expect(payload.intervals[2]).toBeCloseTo(200, 6);
    expect(payload.unitName).toBe('Unit A (Saline)');
  });

  // ── dataset-scan fallback (no filters) ──────────────────────────

  it('falls back to a bare isa=vmspikesummary scan when no filters are given', async () => {
    const fetchSpy = mockFetchOnce({
      documents: [
        makeVmDoc({ id: 'doc-1', unitName: 'U1', spike_times: [0.1, 0.2] }),
        makeVmDoc({ id: 'doc-2', unitName: 'U2', spike_times: [0.3, 0.4] }),
      ],
      totalItems: 2,
      page: 1,
      pageSize: 50,
    });

    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      kind: 'raster',
    });
    const calledBody = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as { body: string }).body,
    );
    expect(calledBody.searchstructure).toEqual([
      { operation: 'isa', param1: 'vmspikesummary' },
    ]);

    if ('error' in res) throw new Error(res.error);
    expect(res.unit_count).toBe(2);
  });

  // ── kind="both" emits two chart payloads ──────────────────────────

  it('returns two chart_payloads when kind="both"', async () => {
    mockFetchOnce({
      document: makeVmDoc({
        id: 'doc-1',
        unitName: 'Unit 1',
        spike_times: [0.1, 0.2, 0.4],
      }),
    });

    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      unitDocId: 'doc-1',
      kind: 'both',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.chart_payloads).toHaveLength(2);
    expect(res.chart_payloads[0]!.kind).toBe('raster');
    expect(res.chart_payloads[1]!.kind).toBe('isi_histogram');
  });

  // ── empty result surfaces empty_hint ──────────────────────────────

  it('surfaces empty_hint with a clear reason when no docs match', async () => {
    mockFetchOnce({
      documents: [],
      totalItems: 0,
      page: 1,
      pageSize: 50,
    });

    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      unitNameMatch: 'Nonexistent',
      kind: 'raster',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.unit_count).toBe(0);
    expect(res.chart_payloads).toEqual([]);
    expect(res.empty_hint?.reason).toMatch(/Nonexistent/);
  });

  // ── field-path fallback (sample_times) ────────────────────────────

  it('falls back to data.vmspikesummary.sample_times when spike_times is missing', async () => {
    mockFetchOnce({
      document: makeVmDoc({
        id: 'doc-1',
        unitName: 'U1',
        sample_times: [0.05, 0.15, 0.25],
      }),
    });

    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      unitDocId: 'doc-1',
      kind: 'raster',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.unit_count).toBe(1);
    const payload = res.chart_payloads[0]!;
    if (payload.kind !== 'raster') throw new Error('unreachable');
    expect(payload.units[0]!.spikeTimes).toEqual([0.05, 0.15, 0.25]);
  });

  it('surfaces empty_hint when matched docs have no parseable spike_times', async () => {
    mockFetchOnce({
      document: {
        id: 'doc-1',
        name: '',
        datasetId: DSID,
        data: { vmspikesummary: { name: 'broken unit' } },
      },
    });

    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      unitDocId: 'doc-1',
      kind: 'raster',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.unit_count).toBe(0);
    expect(res.empty_hint?.reason).toMatch(/spike_times/);
  });

  // ── tWindow filters server-side ──────────────────────────────────

  it('filters spikes outside tWindow before building the payload', async () => {
    mockFetchOnce({
      document: makeVmDoc({
        id: 'doc-1',
        unitName: 'U1',
        spike_times: [0.0, 0.5, 1.0, 1.5, 2.0],
      }),
    });

    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      unitDocId: 'doc-1',
      kind: 'raster',
      tWindow: [0.5, 1.5],
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.total_spikes).toBe(3);
    const payload = res.chart_payloads[0]!;
    if (payload.kind !== 'raster') throw new Error('unreachable');
    expect(payload.units[0]!.spikeTimes).toEqual([0.5, 1.0, 1.5]);
    expect(payload.tWindow).toEqual([0.5, 1.5]);
  });

  // ── maxUnits cap ────────────────────────────────────────────────

  it('caps the number of units returned at maxUnits', async () => {
    const docs = Array.from({ length: 30 }, (_, i) =>
      makeVmDoc({
        id: `doc-${i}`,
        unitName: `U${i}`,
        spike_times: [i * 0.1],
      }),
    );
    mockFetchOnce({
      documents: docs,
      totalItems: 30,
      page: 1,
      pageSize: 50,
    });

    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      kind: 'raster',
      maxUnits: 5,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.unit_count).toBe(5);
  });

  it('caps references at 10 even when more docs match', async () => {
    const docs = Array.from({ length: 20 }, (_, i) =>
      makeVmDoc({
        id: `doc-${i}`,
        unitName: `U${i}`,
        spike_times: [i * 0.1, i * 0.1 + 0.05],
      }),
    );
    mockFetchOnce({
      documents: docs,
      totalItems: 20,
      page: 1,
      pageSize: 50,
    });

    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      kind: 'raster',
      maxUnits: 20,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.unit_count).toBe(20);
    expect(res.references).toHaveLength(10);
  });

  // ── reference shape ─────────────────────────────────────────────

  it('builds Document Explorer references for each matched unit', async () => {
    mockFetchOnce({
      documents: [
        makeVmDoc({ id: 'doc-A', unitName: 'Unit A', spike_times: [0.1] }),
        makeVmDoc({ id: 'doc-B', unitName: 'Unit B', spike_times: [0.2] }),
      ],
      totalItems: 2,
      page: 1,
      pageSize: 50,
    });

    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      kind: 'raster',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.references[0]).toMatchObject({
      doc_id: 'doc-A',
      url: `/datasets/${DSID}/documents/doc-A`,
      class: 'vmspikesummary',
      title: 'Unit A',
    });
    expect(res.references[1]).toMatchObject({ doc_id: 'doc-B' });
  });

  // ── ISI computation correctness ────────────────────────────────

  it('computes ISI across multiple units (each unit sorted independently)', async () => {
    mockFetchOnce({
      documents: [
        makeVmDoc({
          id: 'doc-A',
          unitName: 'A',
          // Out-of-order spikes — handler must sort before diffing.
          spike_times: [0.3, 0.1, 0.2],
        }),
        makeVmDoc({
          id: 'doc-B',
          unitName: 'B',
          spike_times: [0.5, 0.55],
        }),
      ],
      totalItems: 2,
      page: 1,
      pageSize: 50,
    });

    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      kind: 'isi_histogram',
    });
    if ('error' in res) throw new Error(res.error);
    const payload = res.chart_payloads[0]!;
    if (payload.kind !== 'isi_histogram') throw new Error('expected isi');
    // Unit A: sorted [0.1, 0.2, 0.3] → diffs [0.1, 0.1] s → [100, 100] ms
    // Unit B: sorted [0.5, 0.55] → diff [0.05] s → [50] ms
    expect(payload.intervals).toHaveLength(3);
    expect(payload.intervals[0]).toBeCloseTo(100, 6);
    expect(payload.intervals[1]).toBeCloseTo(100, 6);
    expect(payload.intervals[2]).toBeCloseTo(50, 6);
    // unitName is omitted when more than one unit contributed.
    expect(payload.unitName).toBeUndefined();
  });

  // ── zod input validation ────────────────────────────────────────

  it('rejects empty datasetId via zod', async () => {
    const res = await fetchSpikeSummaryHandler({
      datasetId: '',
      kind: 'raster',
    });
    expect(res).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('rejects invalid kind via zod', async () => {
    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      // @ts-expect-error — intentionally bad input for validation test
      kind: 'pizza',
    });
    expect(res).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('rejects maxUnits > 50 via zod', async () => {
    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      kind: 'raster',
      maxUnits: 999,
    });
    expect(res).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  // ── network error path ──────────────────────────────────────────

  it('returns { error } on non-2xx single-doc fetch', async () => {
    mockFetchOnce('not found', 404);
    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      unitDocId: 'missing',
      kind: 'raster',
    });
    expect(res).toEqual({ error: expect.stringMatching(/404/) });
  });

  it('returns { error } on non-2xx query', async () => {
    mockFetchOnce({ detail: 'bad scope' }, 422);
    const res = await fetchSpikeSummaryHandler({
      datasetId: DSID,
      kind: 'raster',
    });
    expect(res).toEqual({ error: expect.stringMatching(/422/) });
  });
});
