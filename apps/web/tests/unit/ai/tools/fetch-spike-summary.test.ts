/**
 * fetch_spike_summary — chat-tool proxy tests.
 *
 * Post-Phase-3 (2026-05-14) the handler is a thin proxy: it POSTs the
 * input to `/api/datasets/{id}/spike-summary` on Railway, then decorates
 * the raw response with `chart_payloads[]` + `references[]` +
 * `references_summary` + optional `empty_hint`. The orchestration tests
 * (vmspikesummary discovery, binary extraction, stride-sampling, ISI
 * computation) now live in `backend/tests/unit/test_spike_summary_service.py`
 * on ndb-v2.
 *
 * Here we cover ONLY the TS-side contract:
 *   - URL + body + auth-header forwarding to Railway
 *   - chart_payloads decoration shape per kind
 *   - references + references_summary build
 *   - empty_hint when no units / no payloads
 *   - error envelope handling
 *   - input validation
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSpikeSummaryHandler } from '@/lib/ndi/tools/fetch-spike-summary';

const TEST_BASE = 'https://api.example.com';

function mockFetchOnce(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('fetch_spike_summary (Phase 3 proxy)', () => {
  it('POSTs the input to /api/datasets/{id}/spike-summary with the right body', async () => {
    const fetchSpy = mockFetchOnce({
      units: [
        { name: 'Unit 1', doc_id: 'u1', spike_times: [0.1, 0.5, 1.2] },
      ],
      total_matching: 1,
      kind: 'raster',
    });
    await fetchSpikeSummaryHandler({
      datasetId: 'ds1',
      kind: 'raster',
      unitNameMatch: 'Saline',
      maxUnits: 5,
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${TEST_BASE}/api/datasets/ds1/spike-summary`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      kind: 'raster',
      unitNameMatch: 'Saline',
      maxUnits: 5,
    });
  });

  it('builds a raster chart_payload from raw units (kind="raster")', async () => {
    mockFetchOnce({
      units: [
        { name: 'Unit 1', doc_id: 'u1', spike_times: [0.1, 0.5] },
        { name: 'Unit 2', doc_id: 'u2', spike_times: [0.2, 0.8, 1.1] },
      ],
      total_matching: 2,
      kind: 'raster',
    });
    const res = await fetchSpikeSummaryHandler({
      datasetId: 'ds1',
      kind: 'raster',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.chart_payloads).toHaveLength(1);
    expect(res.chart_payloads[0]?.kind).toBe('raster');
    expect(res.total_spikes).toBe(5);
    expect(res.time_range).toEqual({ min: 0.1, max: 1.1 });
    expect(res.references).toHaveLength(2);
  });

  it('builds an isi_histogram chart_payload merging intervals across units (kind="isi_histogram")', async () => {
    mockFetchOnce({
      units: [
        { name: 'U1', doc_id: 'u1', isi_intervals: [10, 20, 30] },
        { name: 'U2', doc_id: 'u2', isi_intervals: [15, 25] },
      ],
      total_matching: 2,
      kind: 'isi_histogram',
    });
    const res = await fetchSpikeSummaryHandler({
      datasetId: 'ds1',
      kind: 'isi_histogram',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.chart_payloads).toHaveLength(1);
    const p = res.chart_payloads[0];
    if (p?.kind !== 'isi_histogram') throw new Error('wrong kind');
    expect(p.intervals).toEqual([10, 20, 30, 15, 25]);
    expect(p.unitName).toMatch(/Combined/);
    expect(p.logBins).toBe(true);
  });

  it('emits BOTH chart_payloads when kind="both"', async () => {
    mockFetchOnce({
      units: [
        {
          name: 'U1',
          doc_id: 'u1',
          spike_times: [0.1, 0.5, 1.2],
          isi_intervals: [400, 700],
        },
      ],
      total_matching: 1,
      kind: 'both',
    });
    const res = await fetchSpikeSummaryHandler({
      datasetId: 'ds1',
      kind: 'both',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.chart_payloads).toHaveLength(2);
    const kinds = res.chart_payloads.map((p) => p.kind).sort();
    expect(kinds).toEqual(['isi_histogram', 'raster']);
  });

  it('surfaces empty_hint when Railway returns zero units', async () => {
    mockFetchOnce({ units: [], total_matching: 0, kind: 'raster' });
    const res = await fetchSpikeSummaryHandler({
      datasetId: 'ds1',
      kind: 'raster',
      unitNameMatch: 'NonexistentUnit',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.unit_count).toBe(0);
    expect(res.chart_payloads).toHaveLength(0);
    expect(res.empty_hint?.reason).toMatch(/NonexistentUnit/);
  });

  it('passes through Railway top-level error envelope as { error }', async () => {
    // Railway returns `{error: "cloud_unavailable"}` on transient
    // upstream failures (CloudInternalError, CloudUnreachable, etc.).
    // postJson's isErrorResult discriminator recognizes the single-
    // `error`-key envelope and the handler propagates it verbatim.
    // The chat surface then translates this into a friendly user
    // message; the workspace panel shows an inline error.
    mockFetchOnce({ error: 'cloud_unavailable' });
    const res = await fetchSpikeSummaryHandler({
      datasetId: 'ds1',
      kind: 'both',
    });
    expect(res).toEqual({ error: 'cloud_unavailable' });
  });

  it('returns { error } when Railway returns non-2xx HTTP', async () => {
    mockFetchOnce({ detail: 'rate-limited' }, 429);
    const res = await fetchSpikeSummaryHandler({
      datasetId: 'ds1',
      kind: 'both',
    });
    expect(res).toEqual({ error: 'Upstream returned 429' });
  });

  it('forwards Cookie + X-XSRF-TOKEN from ctx.authHeaders', async () => {
    const fetchSpy = mockFetchOnce({
      units: [],
      total_matching: 0,
      kind: 'raster',
    });
    await fetchSpikeSummaryHandler(
      { datasetId: 'ds1', kind: 'raster' },
      { authHeaders: { Cookie: 'session=abc', 'X-XSRF-TOKEN': 'def' } },
    );
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Cookie).toBe('session=abc');
    expect(headers['X-XSRF-TOKEN']).toBe('def');
  });

  it('builds the references_summary with the right truncation signal', async () => {
    mockFetchOnce({
      units: Array.from({ length: 10 }, (_, i) => ({
        name: `U${i}`,
        doc_id: `u${i}`,
        spike_times: [0.1],
      })),
      total_matching: 50,
      kind: 'raster',
    });
    const res = await fetchSpikeSummaryHandler({
      datasetId: 'ds1',
      kind: 'raster',
      maxUnits: 10,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.references_summary).toMatchObject({
      cited: 10,
      units_shown: 10,
      total_matching: 50,
      truncated: true,
      cap: 10,
    });
  });

  it('rejects invalid input (missing kind)', async () => {
    const res = await fetchSpikeSummaryHandler({
      datasetId: 'ds1',
    } as never);
    if (!('error' in res)) throw new Error('expected error envelope');
    expect(res.error).toMatch(/Invalid input/i);
  });
});
