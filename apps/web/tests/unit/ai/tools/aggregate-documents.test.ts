/**
 * aggregate_documents — Stream 4.9 (2026-05-16) thin-client tests.
 *
 * The handler is now a POST-and-translate against
 * `/api/aggregate-documents` (the Python service shipped in ndb-v2).
 * The aggregation math itself is unit-tested on the backend (see
 * `backend/tests/unit/test_aggregate_documents_service.py`). These
 * tests cover the TS client's contract:
 *
 *   - input validation (scope, searchstructure, valueField, groupBy)
 *   - request body forwards the canonical NDI query DSL
 *   - response envelope is translated into the LLM-facing
 *     {groups, references, references_summary, …} shape
 *   - per-group sample-doc Refs are built when groupBy splits into
 *     multiple groups; per-dataset Refs are built from
 *     `datasets_contributing`
 *   - n=1 fallback surfaces a doc-level Ref
 *   - empty-result single-id-scope fallback surfaces a dataset Ref
 *   - upstream errors pass through
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aggregateDocumentsHandler } from '@/lib/ndi/tools/aggregate-documents';

const TEST_BASE = 'https://api.example.com';
const DSID_A = 'a'.repeat(24);
const DSID_B = 'b'.repeat(24);

function mockBackendOnce(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('aggregate_documents (thin-client over /api/aggregate-documents)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('POSTs to /api/aggregate-documents with the canonical body', async () => {
    const fetchSpy = mockBackendOnce({
      total_items: 0,
      numeric_matches: 0,
      truncated: false,
      valueField: 'data.subject.weight',
      scanned_docs: 0,
      groups: [],
      datasets_contributing: [],
    });

    await aggregateDocumentsHandler({
      scope: 'public',
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
      groupBy: 'data.subject.strain',
      maxDocs: 2000,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const call = fetchSpy.mock.calls[0]!;
    expect(call[0]).toBe(`${TEST_BASE}/api/aggregate-documents`);
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      scope: 'public',
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
      groupBy: 'data.subject.strain',
      maxDocs: 2000,
    });
  });

  it('translates a single-group backend response into the LLM-facing shape', async () => {
    mockBackendOnce({
      total_items: 3,
      numeric_matches: 3,
      truncated: false,
      valueField: 'data.subject.weight',
      scanned_docs: 3,
      groups: [
        {
          group: 'all',
          count: 3,
          mean: 20,
          median: 20,
          std: 10,
          min: 10,
          max: 30,
          sample_doc: { id: 'd1', dataset_id: DSID_A, class: 'subject' },
        },
      ],
      datasets_contributing: [DSID_A],
    });

    const res = await aggregateDocumentsHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
    });

    if ('error' in res) throw new Error(res.error);
    expect(res.groups).toEqual([
      {
        group: 'all',
        count: 3,
        mean: 20,
        median: 20,
        std: 10,
        min: 10,
        max: 30,
      },
    ]);
    expect(res.total_items).toBe(3);
    expect(res.numeric_matches).toBe(3);
    expect(res.truncated).toBe(false);
    // No groupBy → no per-group sample refs; single dataset gets one chip.
    expect(res.references).toHaveLength(1);
    expect(res.references[0]?.doc_id).toBe(DSID_A);
  });

  it('builds per-group sample-doc references when groupBy splits into multiple groups', async () => {
    mockBackendOnce({
      total_items: 4,
      numeric_matches: 4,
      truncated: false,
      valueField: 'data.subject.weight',
      scanned_docs: 4,
      groups: [
        {
          group: 'A',
          count: 2,
          mean: 15,
          median: 15,
          std: 7.07,
          min: 10,
          max: 20,
          sample_doc: { id: 'd1', dataset_id: DSID_A, class: 'subject' },
        },
        {
          group: 'B',
          count: 2,
          mean: 150,
          median: 150,
          std: 70.7,
          min: 100,
          max: 200,
          sample_doc: { id: 'd3', dataset_id: DSID_A, class: 'subject' },
        },
      ],
      datasets_contributing: [DSID_A],
    });

    const res = await aggregateDocumentsHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
      groupBy: 'data.subject.strain',
    });

    if ('error' in res) throw new Error(res.error);
    const sampleA = res.references.find((r) => r.title?.includes('Sample A'));
    const sampleB = res.references.find((r) => r.title?.includes('Sample B'));
    expect(sampleA?.doc_id).toBe('d1');
    expect(sampleA?.url).toBe(`/datasets/${DSID_A}/documents/d1`);
    expect(sampleB?.doc_id).toBe('d3');
    expect(sampleB?.url).toBe(`/datasets/${DSID_A}/documents/d3`);
    expect(res.references_summary).toMatchObject({
      groups_cited: 2,
      truncated: false,
      total_available: 4,
    });
  });

  it('builds one dataset-level reference per distinct contributing dataset', async () => {
    mockBackendOnce({
      total_items: 3,
      numeric_matches: 3,
      truncated: false,
      valueField: 'data.subject.weight',
      scanned_docs: 3,
      groups: [
        {
          group: 'all',
          count: 3,
          mean: 20,
          median: 20,
          std: 10,
          min: 10,
          max: 30,
          sample_doc: { id: 'd1', dataset_id: DSID_A, class: 'subject' },
        },
      ],
      datasets_contributing: [DSID_A, DSID_B],
    });

    const res = await aggregateDocumentsHandler({
      scope: 'public',
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
    });

    if ('error' in res) throw new Error(res.error);
    expect(res.references).toHaveLength(2);
    const dsIds = res.references.map((r) => r.doc_id).sort();
    expect(dsIds).toEqual([DSID_A, DSID_B].sort());
  });

  it('marks truncated=true when the backend reports a cap hit', async () => {
    mockBackendOnce({
      total_items: 5000,
      numeric_matches: 50,
      truncated: true,
      valueField: 'data.subject.weight',
      scanned_docs: 50,
      groups: [
        {
          group: 'all',
          count: 50,
          mean: 25,
          median: 25,
          std: 14.4,
          min: 1,
          max: 50,
          sample_doc: { id: 'd0', dataset_id: DSID_A, class: 'subject' },
        },
      ],
      datasets_contributing: [DSID_A],
    });

    const res = await aggregateDocumentsHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
      maxDocs: 50,
    });

    if ('error' in res) throw new Error(res.error);
    expect(res.truncated).toBe(true);
    expect(res.references_summary.truncated).toBe(true);
    expect(res.references_summary.total_available).toBe(5000);
  });

  it('surfaces an n=1 fallback reference at doc-level', async () => {
    mockBackendOnce({
      total_items: 1,
      numeric_matches: 1,
      truncated: false,
      valueField: 'data.subject.weight',
      scanned_docs: 1,
      groups: [
        {
          group: 'all',
          count: 1,
          mean: 42,
          median: 42,
          std: 0,
          min: 42,
          max: 42,
          sample_doc: { id: 'only', dataset_id: DSID_A, class: 'subject' },
        },
      ],
      datasets_contributing: [DSID_A],
    });

    const res = await aggregateDocumentsHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
    });

    if ('error' in res) throw new Error(res.error);
    // Should include both a dataset-level chip AND the n=1 doc-level chip.
    const docRef = res.references.find((r) => r.doc_id === 'only');
    expect(docRef).toBeTruthy();
    expect(docRef?.url).toBe(`/datasets/${DSID_A}/documents/only`);
  });

  it('rejects scope="private" and scope="all" without contacting the backend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await aggregateDocumentsHandler({
      scope: 'all',
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
    });
    expect(res).toEqual({ error: expect.stringMatching(/anonymous-only/i) });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed inputs (missing valueField, unknown op)', async () => {
    let res = await aggregateDocumentsHandler({
      scope: 'public',
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      // @ts-expect-error — testing missing required field
      valueField: undefined,
    });
    expect(res).toEqual({ error: expect.stringMatching(/valueField/i) });

    res = await aggregateDocumentsHandler({
      scope: 'public',
      searchstructure: [{ operation: 'bogus', param1: 'x' }],
      valueField: 'data.x.v',
    });
    expect(res).toEqual({ error: expect.stringMatching(/operation must be/i) });
  });

  it('passes backend errors through with status code', async () => {
    mockBackendOnce({ detail: 'Query took too long' }, 504);
    const res = await aggregateDocumentsHandler({
      scope: 'public',
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
    });
    expect(res).toEqual({ error: expect.stringMatching(/Upstream returned 504/) });
  });
});
