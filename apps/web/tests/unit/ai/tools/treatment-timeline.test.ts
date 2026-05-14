/**
 * treatment_timeline — verifies row projection, ordinal-slot fallback,
 * maxSubjects cap, fallback to tabular_query when /tables/treatment is
 * empty, references-per-subject, validation, and error pass-through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { treatmentTimelineHandler } from '@/lib/ndi/tools/treatment-timeline';

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

function mockFetchSequence(bodies: Array<{ body: unknown; status?: number }>) {
  const spy = vi.spyOn(globalThis, 'fetch');
  for (const { body, status = 200 } of bodies) {
    spy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }
  return spy;
}

describe('treatment_timeline', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('happy path: rows with ordinal timing → items + chart_payload + references', async () => {
    const fetchSpy = mockFetchOnce({
      columns: [
        { key: 'treatmentName', label: 'Treatment' },
        { key: 'subjectDocumentIdentifier', label: 'Subject' },
      ],
      rows: [
        {
          treatmentName: 'Saline',
          subjectDocumentIdentifier: 'subject-A',
          numericValue: [],
          stringValue: null,
        },
        {
          treatmentName: 'CNO',
          subjectDocumentIdentifier: 'subject-A',
          numericValue: [],
          stringValue: null,
        },
        {
          treatmentName: 'Saline',
          subjectDocumentIdentifier: 'subject-B',
          numericValue: [],
          stringValue: null,
        },
      ],
    });

    const res = await treatmentTimelineHandler({ datasetId: DSID });
    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_BASE}/api/datasets/${DSID}/tables/treatment?page=1&pageSize=500`,
      expect.any(Object),
    );
    if ('error' in res) throw new Error(res.error);

    expect(res.total_subjects).toBe(2);
    expect(res.total_treatments).toBe(3);
    expect(res.temporal_source).toBe('ordinal');
    expect(res.chart_payload.datasetId).toBe(DSID);
    expect(res.chart_payload.xLabel).toBe('Treatment order (ordinal)');
    expect(res.chart_payload.items).toEqual([
      { subject: 'subject-A', treatment: 'Saline', start: 0, end: 1 },
      { subject: 'subject-A', treatment: 'CNO', start: 1, end: 2 },
      { subject: 'subject-B', treatment: 'Saline', start: 0, end: 1 },
    ]);
    // One reference per distinct subject.
    expect(res.references).toHaveLength(2);
    expect(res.references[0]).toMatchObject({
      class: 'dataset',
      title: 'Subject subject-A',
    });
    expect(res.empty_hint).toBeUndefined();
  });

  it('explicit [start, end] in numericValue → temporal_source=explicit, values preserved verbatim', async () => {
    mockFetchOnce({
      rows: [
        {
          treatmentName: 'Training',
          subjectDocumentIdentifier: 'mouse-1',
          numericValue: [10, 20],
        },
        {
          treatmentName: 'Testing',
          subjectDocumentIdentifier: 'mouse-1',
          numericValue: [22, 28],
        },
      ],
    });
    const res = await treatmentTimelineHandler({ datasetId: DSID });
    if ('error' in res) throw new Error(res.error);
    expect(res.temporal_source).toBe('explicit');
    expect(res.chart_payload.items).toEqual([
      { subject: 'mouse-1', treatment: 'Training', start: 10, end: 20 },
      { subject: 'mouse-1', treatment: 'Testing', start: 22, end: 28 },
    ]);
    // When timing is explicit, NO ordinal xLabel hint is set.
    expect(res.chart_payload.xLabel).toBeUndefined();
  });

  it('caps subjects at maxSubjects (default 30); excess subjects are dropped from items', async () => {
    // 40 distinct subjects, one treatment each.
    const rows = Array.from({ length: 40 }, (_, i) => ({
      treatmentName: 'Treatment',
      subjectDocumentIdentifier: `subj-${i}`,
      numericValue: [],
    }));
    mockFetchOnce({ rows });

    const res = await treatmentTimelineHandler({ datasetId: DSID });
    if ('error' in res) throw new Error(res.error);
    expect(res.total_subjects).toBe(30);
    expect(res.total_treatments).toBe(30);
    // First 30 should be kept in first-seen order.
    expect(res.chart_payload.items[0]?.subject).toBe('subj-0');
    expect(res.chart_payload.items[29]?.subject).toBe('subj-29');
    expect(
      res.chart_payload.items.find((it) => it.subject === 'subj-30'),
    ).toBeUndefined();
  });

  it('respects explicit maxSubjects when smaller than default', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      treatmentName: 'Treatment',
      subjectDocumentIdentifier: `subj-${i}`,
    }));
    mockFetchOnce({ rows });
    const res = await treatmentTimelineHandler({
      datasetId: DSID,
      maxSubjects: 3,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.total_subjects).toBe(3);
    expect(res.chart_payload.items).toHaveLength(3);
  });

  it('falls back to tabular_query when /tables/treatment returns zero rows', async () => {
    const fetchSpy = mockFetchSequence([
      // 1. Primary returns empty.
      { body: { rows: [], columns: [] } },
      // 2. Fallback tabular_query returns groups.
      {
        body: {
          groups: [
            { name: 'Saline', count: 22, values: [] },
            { name: 'CNO', count: 23, values: [] },
          ],
        },
      },
    ]);

    const res = await treatmentTimelineHandler({ datasetId: DSID });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]![0]).toContain(
      'tabular_query?variableNameContains=Treatment',
    );
    if ('error' in res) throw new Error(res.error);
    expect(res.total_subjects).toBe(2);
    expect(res.chart_payload.items.map((it) => it.treatment)).toEqual([
      'Saline',
      'CNO',
    ]);
    expect(res.chart_payload.items[0]?.subject).toBe('group:Saline');
    expect(res.empty_hint).toBeUndefined();
  });

  it('returns empty_hint when both primary and fallback are empty', async () => {
    mockFetchSequence([
      { body: { rows: [], columns: [{ key: 'treatmentName', label: 'T' }] } },
      { body: { groups: [] } },
    ]);
    const res = await treatmentTimelineHandler({ datasetId: DSID });
    if ('error' in res) throw new Error(res.error);
    expect(res.total_subjects).toBe(0);
    expect(res.total_treatments).toBe(0);
    expect(res.chart_payload.items).toEqual([]);
    expect(res.empty_hint).toBeDefined();
    expect(res.empty_hint?.reason).toMatch(/no temporal info/);
    // available_columns is surfaced when present.
    expect(res.empty_hint?.available_columns).toContain('treatmentName');
  });

  it('rejects invalid input (missing datasetId)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    // @ts-expect-error — deliberately bad input
    const res = await treatmentTimelineHandler({});
    expect('error' in res).toBe(true);
    if ('error' in res) {
      expect(res.error).toMatch(/Invalid input/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects maxSubjects > 100 (zod hard-cap)', async () => {
    const res = await treatmentTimelineHandler({
      datasetId: DSID,
      maxSubjects: 999,
    });
    expect('error' in res).toBe(true);
    if ('error' in res) {
      expect(res.error).toMatch(/Invalid input/);
    }
  });

  it('passes through upstream HTTP errors via fetchJson', async () => {
    mockFetchOnce({ detail: 'not found' }, 404);
    const res = await treatmentTimelineHandler({ datasetId: DSID });
    expect('error' in res).toBe(true);
    if ('error' in res) {
      expect(res.error).toMatch(/Upstream returned 404/);
    }
  });

  it('skips rows missing subject or treatment label', async () => {
    mockFetchOnce({
      rows: [
        { treatmentName: 'Saline', subjectDocumentIdentifier: 'A' }, // valid
        { treatmentName: 'Saline' }, // missing subject — skip
        { subjectDocumentIdentifier: 'B' }, // missing treatment label
        // missing both — skip
        {},
      ],
    });
    const res = await treatmentTimelineHandler({ datasetId: DSID });
    if ('error' in res) throw new Error(res.error);
    expect(res.total_subjects).toBe(1);
    expect(res.total_treatments).toBe(1);
    expect(res.chart_payload.items[0]?.subject).toBe('A');
  });

  it('falls back to stringValue as treatment label when treatmentName missing', async () => {
    mockFetchOnce({
      rows: [
        {
          subjectDocumentIdentifier: 'A',
          stringValue: 'UBERON:0001870',
        },
      ],
    });
    const res = await treatmentTimelineHandler({ datasetId: DSID });
    if ('error' in res) throw new Error(res.error);
    expect(res.chart_payload.items[0]?.treatment).toBe('UBERON:0001870');
  });

  it('caps references at 20 distinct subjects even when more are present', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      treatmentName: 'Treatment',
      subjectDocumentIdentifier: `subj-${i}`,
    }));
    mockFetchOnce({ rows });
    const res = await treatmentTimelineHandler({
      datasetId: DSID,
      maxSubjects: 100,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.total_subjects).toBe(50);
    expect(res.references).toHaveLength(20);
  });

  it('uses documentId when present to build a per-row reference', async () => {
    mockFetchOnce({
      rows: [
        {
          treatmentName: 'Saline',
          subjectDocumentIdentifier: 'A',
          documentId: 'doc-xyz',
        },
      ],
    });
    const res = await treatmentTimelineHandler({ datasetId: DSID });
    if ('error' in res) throw new Error(res.error);
    expect(res.references[0]).toMatchObject({
      doc_id: 'doc-xyz',
      class: 'treatment',
    });
  });

  it('mixed temporal sources surfaces temporal_source="mixed"', async () => {
    mockFetchOnce({
      rows: [
        // explicit
        {
          treatmentName: 'Training',
          subjectDocumentIdentifier: 'M1',
          numericValue: [0, 5],
        },
        // ordinal
        {
          treatmentName: 'Testing',
          subjectDocumentIdentifier: 'M1',
          numericValue: [],
        },
      ],
    });
    const res = await treatmentTimelineHandler({ datasetId: DSID });
    if ('error' in res) throw new Error(res.error);
    expect(res.temporal_source).toBe('mixed');
    expect(res.chart_payload.items[0]).toEqual({
      subject: 'M1',
      treatment: 'Training',
      start: 0,
      end: 5,
    });
    // Ordinal counter starts at 0 because no prior ordinal-only row.
    expect(res.chart_payload.items[1]).toEqual({
      subject: 'M1',
      treatment: 'Testing',
      start: 0,
      end: 1,
    });
  });

  it('passes title through to chart_payload', async () => {
    mockFetchOnce({
      rows: [{ treatmentName: 'Saline', subjectDocumentIdentifier: 'A' }],
    });
    const res = await treatmentTimelineHandler({
      datasetId: DSID,
      title: 'Dabrowska treatments',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.chart_payload.title).toBe('Dabrowska treatments');
  });
});
