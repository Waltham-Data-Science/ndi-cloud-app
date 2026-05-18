/**
 * psth — peri-stimulus time histogram tool handler. POSTs to the
 * FastAPI /api/datasets/{id}/psth endpoint and shapes the response
 * for the workspace panel + chat fence.
 *
 * Tests cover:
 *   - happy-path POST URL + body + chart_payload shape
 *   - references built for unit doc + stimulus doc (two entries)
 *   - auth-header forwarding via ToolContext.authHeaders
 *   - backend error envelope (200 + error_kind) surfaces empty_hint
 *   - per_trial_raster passthrough when includeRaster=true
 *   - zod input validation (hex shape, missing fields)
 *   - non-2xx HTTP errors flow through as `{ error }`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { psthHandler } from '@/lib/ndi/tools/psth';

const TEST_BASE = 'https://api.example.com';
const DSID = 'a'.repeat(24);
const UNIT_ID = 'b'.repeat(24);
const STIM_ID = 'c'.repeat(24);

function mockFetchOnce(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function makePsthResponse(overrides: Record<string, unknown> = {}) {
  return {
    bin_centers: [-0.4, -0.2, 0.0, 0.2, 0.4],
    counts: [2, 4, 8, 12, 6],
    mean_rate_hz: [4.0, 8.0, 16.0, 24.0, 12.0],
    n_trials: 25,
    n_spikes: 32,
    bin_size_ms: 200,
    t0: -0.5,
    t1: 0.5,
    unit_name: 'Unit 12 (CNO)',
    unit_doc_id: UNIT_ID,
    stimulus_doc_id: STIM_ID,
    ...overrides,
  };
}

describe('psth', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('POSTs to /api/datasets/{id}/psth with the unit + stimulus ids in body', async () => {
    const fetchSpy = mockFetchOnce(makePsthResponse());

    const res = await psthHandler({
      datasetId: DSID,
      unitDocId: UNIT_ID,
      stimulusDocId: STIM_ID,
      t0: -0.5,
      t1: 0.5,
      binSizeMs: 200,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_BASE}/api/datasets/${DSID}/psth`,
      expect.objectContaining({ method: 'POST' }),
    );
    const calledBody = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as { body: string }).body,
    );
    expect(calledBody).toEqual({
      unit_doc_id: UNIT_ID,
      stimulus_doc_id: STIM_ID,
      t0: -0.5,
      t1: 0.5,
      bin_size_ms: 200,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.n_trials).toBe(25);
    expect(res.n_spikes).toBe(32);
  });

  it('shapes chart_payload from the backend response', async () => {
    mockFetchOnce(makePsthResponse());

    const res = await psthHandler({
      datasetId: DSID,
      unitDocId: UNIT_ID,
      stimulusDocId: STIM_ID,
      title: 'My PSTH',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.chart_payload).toEqual({
      kind: 'psth',
      datasetId: DSID,
      binCenters: [-0.4, -0.2, 0.0, 0.2, 0.4],
      counts: [2, 4, 8, 12, 6],
      meanRateHz: [4.0, 8.0, 16.0, 24.0, 12.0],
      binSizeMs: 200,
      t0: -0.5,
      t1: 0.5,
      unitName: 'Unit 12 (CNO)',
      title: 'My PSTH',
    });
  });

  it('builds two references — unit doc + stimulus doc', async () => {
    mockFetchOnce(makePsthResponse());

    const res = await psthHandler({
      datasetId: DSID,
      unitDocId: UNIT_ID,
      stimulusDocId: STIM_ID,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.references).toHaveLength(2);
    expect(res.references[0]).toMatchObject({
      doc_id: UNIT_ID,
      class: 'vmspikesummary',
      title: 'Unit 12 (CNO)',
      url: `/datasets/${DSID}/documents/${UNIT_ID}`,
    });
    expect(res.references[1]).toMatchObject({
      doc_id: STIM_ID,
      class: 'stimulus_presentation',
      url: `/datasets/${DSID}/documents/${STIM_ID}`,
    });
    expect(res.references_summary).toMatchObject({
      cited: 2,
      unit_doc_id: UNIT_ID,
      stimulus_doc_id: STIM_ID,
    });
  });

  it('forwards Cookie + X-XSRF-TOKEN auth headers when ctx.authHeaders is supplied', async () => {
    const fetchSpy = mockFetchOnce(makePsthResponse());

    await psthHandler(
      {
        datasetId: DSID,
        unitDocId: UNIT_ID,
        stimulusDocId: STIM_ID,
      },
      {
        authHeaders: {
          Cookie: 'session=abc',
          'X-XSRF-TOKEN': 'xyz',
        },
      },
    );

    const headers = (fetchSpy.mock.calls[0]![1] as { headers: Record<string, string> })
      .headers;
    expect(headers.Cookie).toBe('session=abc');
    expect(headers['X-XSRF-TOKEN']).toBe('xyz');
  });

  it('passes per_trial_raster through when the backend returns it', async () => {
    mockFetchOnce(
      makePsthResponse({
        per_trial_raster: [
          [0.1, 0.2],
          [0.05, 0.3, 0.4],
        ],
      }),
    );

    const res = await psthHandler({
      datasetId: DSID,
      unitDocId: UNIT_ID,
      stimulusDocId: STIM_ID,
      includeRaster: true,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.per_trial_raster).toEqual([
      [0.1, 0.2],
      [0.05, 0.3, 0.4],
    ]);
  });

  it('surfaces empty_hint with friendly copy when backend returns error_kind="no_events"', async () => {
    mockFetchOnce({
      bin_centers: [],
      counts: [],
      mean_rate_hz: [],
      n_trials: 0,
      n_spikes: 0,
      bin_size_ms: 20,
      t0: -0.5,
      t1: 1.5,
      unit_name: 'Unit 12',
      unit_doc_id: UNIT_ID,
      stimulus_doc_id: STIM_ID,
      error: 'no events found',
      error_kind: 'no_events',
    });

    const res = await psthHandler({
      datasetId: DSID,
      unitDocId: UNIT_ID,
      stimulusDocId: STIM_ID,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.empty_hint?.reason).toMatch(/event timestamps/i);
    expect(res.chart_payload.binCenters).toEqual([]);
    // References still emitted so the user can browse the docs.
    expect(res.references).toHaveLength(2);
  });

  it('surfaces empty_hint for error_kind="decode_failed"', async () => {
    mockFetchOnce({
      bin_centers: [],
      counts: [],
      mean_rate_hz: [],
      n_trials: 0,
      n_spikes: 0,
      bin_size_ms: 20,
      t0: -0.5,
      t1: 1.5,
      unit_name: '',
      unit_doc_id: UNIT_ID,
      stimulus_doc_id: STIM_ID,
      error_kind: 'decode_failed',
    });
    const res = await psthHandler({
      datasetId: DSID,
      unitDocId: UNIT_ID,
      stimulusDocId: STIM_ID,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.empty_hint?.reason).toMatch(/decode/i);
  });

  it('omits optional fields from the request body when not provided', async () => {
    const fetchSpy = mockFetchOnce(makePsthResponse());

    await psthHandler({
      datasetId: DSID,
      unitDocId: UNIT_ID,
      stimulusDocId: STIM_ID,
    });

    const calledBody = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as { body: string }).body,
    );
    expect(calledBody).toEqual({
      unit_doc_id: UNIT_ID,
      stimulus_doc_id: STIM_ID,
    });
    expect(calledBody.t0).toBeUndefined();
    expect(calledBody.bin_size_ms).toBeUndefined();
  });

  // ── zod validation ──────────────────────────────────────────────

  it('rejects empty datasetId via zod', async () => {
    const res = await psthHandler({
      datasetId: '',
      unitDocId: UNIT_ID,
      stimulusDocId: STIM_ID,
    });
    expect(res).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('rejects a non-hex unitDocId via zod', async () => {
    const res = await psthHandler({
      datasetId: DSID,
      unitDocId: 'not-hex-id',
      stimulusDocId: STIM_ID,
    });
    expect(res).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('rejects a too-short stimulusDocId via zod', async () => {
    const res = await psthHandler({
      datasetId: DSID,
      unitDocId: UNIT_ID,
      stimulusDocId: 'abc',
    });
    expect(res).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('rejects negative binSizeMs via zod', async () => {
    const res = await psthHandler({
      datasetId: DSID,
      unitDocId: UNIT_ID,
      stimulusDocId: STIM_ID,
      binSizeMs: -5,
    });
    expect(res).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  // ── network error path ─────────────────────────────────────────

  it('returns { error } when the backend responds non-2xx', async () => {
    mockFetchOnce('boom', 500);
    const res = await psthHandler({
      datasetId: DSID,
      unitDocId: UNIT_ID,
      stimulusDocId: STIM_ID,
    });
    expect(res).toEqual({ error: expect.stringMatching(/500/) });
  });
});
