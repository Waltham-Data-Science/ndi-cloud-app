/**
 * treatment_timeline — chat-tool proxy tests.
 *
 * Post-Phase-3 (2026-05-14) the handler is a thin proxy: it POSTs the
 * input to `/api/datasets/{id}/treatment-timeline` on Railway, then
 * decorates the raw response with `chart_payload` + `references[]` +
 * `references_summary`. The orchestration tests (per-subject ordering,
 * fallback path, temporal_source classification) now live in
 * `backend/tests/unit/test_treatment_timeline_service.py` on ndb-v2.
 *
 * Here we cover ONLY the TS-side contract:
 *   - Input validation
 *   - URL + auth header forwarding to Railway
 *   - chart_payload + references decoration shape
 *   - empty_hint passthrough
 *   - Error envelope handling
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { treatmentTimelineHandler } from '@/lib/ndi/tools/treatment-timeline';

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

describe('treatment_timeline (Phase 3 proxy)', () => {
  it('POSTs the input to the Railway endpoint', async () => {
    const fetchSpy = mockFetchOnce({
      items: [],
      total_subjects: 0,
      total_treatments: 0,
      temporal_source: 'ordinal',
      empty_hint: { reason: 'No treatment rows in this dataset.' },
    });
    await treatmentTimelineHandler({
      datasetId: 'ds1',
      title: 'Treatment timeline',
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${TEST_BASE}/api/datasets/ds1/treatment-timeline`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ title: 'Treatment timeline', maxSubjects: 30 });
  });

  it('decorates raw items with chart_payload + dataset/subject references', async () => {
    mockFetchOnce({
      items: [
        { subject: 'S1', treatment: 'Saline', start: 0, end: 1 },
        { subject: 'S1', treatment: 'CNO', start: 1, end: 2 },
        { subject: 'S2', treatment: 'Saline', start: 0, end: 1 },
      ],
      total_subjects: 2,
      total_treatments: 3,
      temporal_source: 'ordinal',
    });
    const res = await treatmentTimelineHandler({ datasetId: 'ds1' });
    if ('error' in res) throw new Error(res.error);

    expect(res.chart_payload.items).toHaveLength(3);
    expect(res.temporal_source).toBe('ordinal');
    expect(res.chart_payload.xLabel).toBe('Treatment slot');

    // References: dataset chip + one per distinct subject (S1 + S2)
    expect(res.references.length).toBe(3);
    expect(res.references[0]?.class).toBe('dataset');
    expect(res.references_summary).toMatchObject({
      total_subjects: 2,
      total_treatments: 3,
      truncated: false,
    });
  });

  it('uses "Time" xLabel when temporal_source is "explicit"', async () => {
    mockFetchOnce({
      items: [{ subject: 'S1', treatment: 'CNO', start: 100, end: 200 }],
      total_subjects: 1,
      total_treatments: 1,
      temporal_source: 'explicit',
    });
    const res = await treatmentTimelineHandler({ datasetId: 'ds1' });
    if ('error' in res) throw new Error(res.error);
    expect(res.chart_payload.xLabel).toBe('Time');
    expect(res.temporal_source).toBe('explicit');
  });

  it('passes through empty_hint when Railway returns one', async () => {
    mockFetchOnce({
      items: [],
      total_subjects: 0,
      total_treatments: 0,
      temporal_source: 'ordinal',
      empty_hint: {
        reason: 'No treatment rows found',
        available_columns: ['subject', 'Stimulation_Method'],
      },
    });
    const res = await treatmentTimelineHandler({ datasetId: 'ds1' });
    if ('error' in res) throw new Error(res.error);
    expect(res.empty_hint?.reason).toBe('No treatment rows found');
    expect(res.empty_hint?.available_columns).toEqual([
      'subject',
      'Stimulation_Method',
    ]);
  });

  it('returns { error } when Railway returns an error envelope', async () => {
    mockFetchOnce({ error: 'cloud_unavailable' });
    const res = await treatmentTimelineHandler({ datasetId: 'ds1' });
    expect(res).toEqual({ error: 'cloud_unavailable' });
  });

  it('returns { error } when Railway returns a non-2xx HTTP', async () => {
    mockFetchOnce({ detail: 'rate-limited' }, 429);
    const res = await treatmentTimelineHandler({ datasetId: 'ds1' });
    expect(res).toEqual({ error: 'Upstream returned 429' });
  });

  it('forwards Cookie + X-XSRF-TOKEN from ctx.authHeaders', async () => {
    const fetchSpy = mockFetchOnce({
      items: [],
      total_subjects: 0,
      total_treatments: 0,
      temporal_source: 'ordinal',
    });
    await treatmentTimelineHandler(
      { datasetId: 'ds1' },
      { authHeaders: { Cookie: 'session=abc', 'X-XSRF-TOKEN': 'def' } },
    );
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Cookie).toBe('session=abc');
    expect(headers['X-XSRF-TOKEN']).toBe('def');
  });

  it('returns { error } on invalid input (missing datasetId)', async () => {
    const res = await treatmentTimelineHandler({} as never);
    if (!('error' in res)) throw new Error('expected an error envelope');
    expect(res.error).toMatch(/Invalid input/i);
  });
});
