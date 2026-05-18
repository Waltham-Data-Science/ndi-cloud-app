/**
 * ndi_dataset_overview — hits /api/datasets/:id/ndi_overview and shapes
 * the response into a flat LLM-facing summary + a dataset-level
 * Reference.
 *
 * Tests cover:
 *   - happy path: backend payload flows through; references built
 *   - 503 (binding unavailable): translated to a structured error
 *     hint so the LLM can fall back to ndi_query
 *   - timeout: aborts and surfaces the timeout-aware error message
 *   - malformed payload: graceful coercion (Number.isFinite gates,
 *     element filter on non-string fields)
 *   - non-200 / non-503: generic upstream-returned error
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ndiDatasetOverviewHandler } from '@/lib/ndi/tools/ndi-dataset-overview';

const TEST_BASE = 'https://api.example.com';
const DSID = '67f723d574f5f79c6062389d'; // Dabrowska demo id

function mockFetchOnce(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function mockFetchReject(err: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(err);
}

describe('ndi_dataset_overview', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns flat counts + elements + reference on happy path', async () => {
    const fetchSpy = mockFetchOnce({
      element_count: 12,
      subject_count: 4,
      epoch_count: 87,
      elements: [
        { name: 'electrode1', type: 'n-trode' },
        { name: 'behavior1', type: 'positiontracker' },
      ],
      elements_truncated: false,
      reference: 'Dabrowska BNST 2024',
      cache_hit: true,
      cache_age_seconds: 1234.56,
    });

    const res = await ndiDatasetOverviewHandler({ datasetId: DSID });

    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_BASE}/api/datasets/${DSID}/ndi_overview`,
      expect.objectContaining({
        method: 'GET',
        // Stream 3.5 followup (2026-05-16): handler now matches the
        // postJson/fetchJson contract — emits an X-Request-Id on every
        // outbound call so the FastAPI request_id middleware can correlate.
        // Assert via objectContaining so the test doesn't break when
        // additional contract headers are introduced.
        headers: expect.objectContaining({
          Accept: 'application/json',
          'X-Request-Id': expect.stringMatching(/^[a-f0-9]{16}$/),
        }),
      }),
    );
    if ('error' in res) throw new Error(res.error);
    expect(res.element_count).toBe(12);
    expect(res.subject_count).toBe(4);
    expect(res.epoch_count).toBe(87);
    expect(res.elements).toEqual([
      { name: 'electrode1', type: 'n-trode' },
      { name: 'behavior1', type: 'positiontracker' },
    ]);
    expect(res.elements_truncated).toBe(false);
    expect(res.cache_hit).toBe(true);
    expect(res.cache_age_seconds).toBe(1234.56);
    expect(res.references).toHaveLength(1);
    expect(res.references[0]).toMatchObject({
      class: 'dataset',
      doc_id: DSID,
      title: 'Dabrowska BNST 2024',
    });
    expect(res.references[0]?.url).toContain(`/datasets/${DSID}/overview`);
    expect(res.references[0]?.snippet).toMatch(/12 elements/);
    expect(res.references[0]?.snippet).toMatch(/4 subjects/);
    expect(res.references[0]?.snippet).toMatch(/87 epochs/);
  });

  it('falls back to a generic title when backend reference is empty', async () => {
    mockFetchOnce({
      element_count: 0,
      subject_count: 0,
      epoch_count: 0,
      elements: [],
      elements_truncated: false,
      reference: '', // <-- empty
      cache_hit: false,
      cache_age_seconds: 0,
    });
    const res = await ndiDatasetOverviewHandler({ datasetId: DSID });
    if ('error' in res) throw new Error(res.error);
    // Falls back to the prefix-of-id form.
    expect(res.references[0]?.title).toMatch(/Dataset 67f723d5/);
  });

  // ----- 503 graceful-fallback path ----------------------------------

  it('translates 503 into a structured error message naming ndi_query', async () => {
    mockFetchOnce(
      {
        error: 'dataset binding unavailable',
        reason: 'NDI-python is not installed in this environment',
      },
      503,
    );
    const res = await ndiDatasetOverviewHandler({ datasetId: DSID });
    expect('error' in res).toBe(true);
    if (!('error' in res)) throw new Error('expected error');
    // Hint must (a) explain the failure and (b) tell the LLM to use
    // ndi_query — both pin the documented graceful-fallback contract.
    expect(res.error).toMatch(/Dataset binding unavailable/);
    expect(res.error).toMatch(/NDI-python is not installed/);
    expect(res.error).toMatch(/ndi_query/);
  });

  it('handles 503 with no JSON body without crashing', async () => {
    // Simulate a 503 whose body isn't parseable JSON.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not json', {
        status: 503,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    const res = await ndiDatasetOverviewHandler({ datasetId: DSID });
    if (!('error' in res)) throw new Error('expected error');
    // Falls back to a generic "binding unavailable" reason and still
    // tells the LLM what to try next.
    expect(res.error).toMatch(/binding unavailable/);
    expect(res.error).toMatch(/ndi_query/);
  });

  // ----- timeout -----------------------------------------------------

  it('returns a timeout-shaped error when fetch aborts', async () => {
    // Simulate AbortController kicking in.
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    mockFetchReject(abortErr);

    const res = await ndiDatasetOverviewHandler({ datasetId: DSID });
    if (!('error' in res)) throw new Error('expected error');
    expect(res.error).toMatch(/cold-load exceeded/);
    expect(res.error).toMatch(/ndi_query/);
  });

  // ----- defensive coercion ------------------------------------------

  it('coerces malformed numeric fields to 0 and drops bad element entries', async () => {
    mockFetchOnce({
      element_count: 'lots' as unknown as number,
      subject_count: null,
      epoch_count: NaN,
      elements: [
        { name: 'good', type: 'n-trode' },
        { name: 123, type: 'n-trode' }, // bad: name not string
        null,
        { type: 'orphan' }, // missing name
      ] as unknown as Array<{ name: string; type: string }>,
      elements_truncated: 'yes' as unknown as boolean,
      reference: '',
      cache_hit: 1 as unknown as boolean,
      cache_age_seconds: 'old' as unknown as number,
    });
    const res = await ndiDatasetOverviewHandler({ datasetId: DSID });
    if ('error' in res) throw new Error(res.error);
    // Numbers coerce to 0.
    expect(res.element_count).toBe(0);
    expect(res.subject_count).toBe(0);
    expect(res.epoch_count).toBe(0);
    expect(res.cache_age_seconds).toBe(0);
    // Only the well-formed element survives.
    expect(res.elements).toEqual([{ name: 'good', type: 'n-trode' }]);
    // truthy-coerced.
    expect(res.elements_truncated).toBe(true);
    expect(res.cache_hit).toBe(true);
  });

  // ----- non-503 / non-200 -------------------------------------------

  it('surfaces a generic error for non-200/non-503 statuses', async () => {
    mockFetchOnce({}, 502);
    const res = await ndiDatasetOverviewHandler({ datasetId: DSID });
    if (!('error' in res)) throw new Error('expected error');
    expect(res.error).toMatch(/Upstream returned 502/);
  });

  // ----- input validation --------------------------------------------

  it('rejects an empty datasetId', async () => {
    const res = await ndiDatasetOverviewHandler({ datasetId: '' });
    expect('error' in res).toBe(true);
    if (!('error' in res)) throw new Error('expected error');
    expect(res.error).toMatch(/Invalid input/);
  });

  // ----- env not configured ------------------------------------------

  it('surfaces a clean error when INTERNAL_API_URL is unset', async () => {
    vi.unstubAllEnvs();
    const res = await ndiDatasetOverviewHandler({ datasetId: DSID });
    if (!('error' in res)) throw new Error('expected error');
    expect(res.error).toMatch(/Catalog service not configured/);
  });
});
