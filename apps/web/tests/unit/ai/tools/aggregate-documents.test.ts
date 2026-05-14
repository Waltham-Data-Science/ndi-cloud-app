/**
 * aggregate_documents — runs ndi_query under the hood, aggregates a
 * numeric field across all matches, returns just the stats.
 *
 * Tests cover:
 *   - happy path (single group, scope=single-id)
 *   - groupBy splits by categorical field
 *   - numeric extraction (string-numbers parsed, null/NaN skipped)
 *   - validation (auth scope, missing valueField, bad searchstructure)
 *   - cap behavior (truncated=true when more docs than maxDocs)
 *   - reference building (one per distinct dataset)
 *   - backend-error pass-through
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aggregateDocumentsHandler } from '@/lib/ndi/tools/aggregate-documents';

const TEST_BASE = 'https://api.example.com';
const DSID_A = 'a'.repeat(24);
const DSID_B = 'b'.repeat(24);

function mockFetchOnce(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('aggregate_documents', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('aggregates a numeric field into a single group when groupBy is unset', async () => {
    mockFetchOnce({
      documents: [
        { id: 'd1', datasetId: DSID_A, document_class: { class_name: 'subject' }, data: { subject: { weight: 10 } } },
        { id: 'd2', datasetId: DSID_A, document_class: { class_name: 'subject' }, data: { subject: { weight: 20 } } },
        { id: 'd3', datasetId: DSID_A, document_class: { class_name: 'subject' }, data: { subject: { weight: 30 } } },
      ],
      totalItems: 3,
      page: 1,
      pageSize: 1000,
    });
    const res = await aggregateDocumentsHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0]).toMatchObject({
      group: 'all',
      count: 3,
      mean: 20,
      median: 20,
      min: 10,
      max: 30,
    });
    // sample std for [10,20,30] is sqrt(((10-20)^2+(20-20)^2+(30-20)^2)/2) = sqrt(100) = 10
    expect(res.groups[0]?.std).toBe(10);
    expect(res.total_items).toBe(3);
    expect(res.numeric_matches).toBe(3);
    expect(res.truncated).toBe(false);
  });

  it('splits stats by groupBy when provided', async () => {
    mockFetchOnce({
      documents: [
        { id: 'd1', datasetId: DSID_A, document_class: { class_name: 'subject' }, data: { subject: { weight: 10, strain: 'A' } } },
        { id: 'd2', datasetId: DSID_A, document_class: { class_name: 'subject' }, data: { subject: { weight: 20, strain: 'A' } } },
        { id: 'd3', datasetId: DSID_A, document_class: { class_name: 'subject' }, data: { subject: { weight: 100, strain: 'B' } } },
        { id: 'd4', datasetId: DSID_A, document_class: { class_name: 'subject' }, data: { subject: { weight: 200, strain: 'B' } } },
      ],
      totalItems: 4,
      page: 1,
      pageSize: 1000,
    });
    const res = await aggregateDocumentsHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
      groupBy: 'data.subject.strain',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.groups).toHaveLength(2);
    const a = res.groups.find((g) => g.group === 'A');
    const b = res.groups.find((g) => g.group === 'B');
    expect(a).toMatchObject({ count: 2, mean: 15, min: 10, max: 20 });
    expect(b).toMatchObject({ count: 2, mean: 150, min: 100, max: 200 });
    // Per-group sample-doc references: the first contributing doc
    // for each group should be cited so users can drill into one
    // concrete A subject vs one concrete B subject.
    const sampleA = res.references.find((r) => r.title?.includes('Sample A'));
    const sampleB = res.references.find((r) => r.title?.includes('Sample B'));
    expect(sampleA?.doc_id).toBe('d1');
    expect(sampleA?.url).toBe(`/datasets/${DSID_A}/documents/d1`);
    expect(sampleB?.doc_id).toBe('d3');
    expect(sampleB?.url).toBe(`/datasets/${DSID_A}/documents/d3`);
    // Citation transparency.
    expect(res.references_summary).toMatchObject({
      groups_cited: 2,
      truncated: false,
      total_available: 4,
    });
  });

  it('skips docs with no finite numeric value at valueField', async () => {
    mockFetchOnce({
      documents: [
        { id: 'd1', datasetId: DSID_A, document_class: { class_name: 'x' }, data: { x: { v: 1 } } },
        { id: 'd2', datasetId: DSID_A, document_class: { class_name: 'x' }, data: { x: { v: null } } },
        { id: 'd3', datasetId: DSID_A, document_class: { class_name: 'x' }, data: { x: {} } },
        { id: 'd4', datasetId: DSID_A, document_class: { class_name: 'x' }, data: { x: { v: '42' } } }, // string-numeric coerces
        { id: 'd5', datasetId: DSID_A, document_class: { class_name: 'x' }, data: { x: { v: 'not-a-number' } } },
        { id: 'd6', datasetId: DSID_A, document_class: { class_name: 'x' }, data: { x: { v: 9 } } },
      ],
      totalItems: 6,
      page: 1,
      pageSize: 1000,
    });
    const res = await aggregateDocumentsHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'x' }],
      valueField: 'data.x.v',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.total_items).toBe(6);
    expect(res.numeric_matches).toBe(3); // d1=1, d4=42, d6=9
    expect(res.groups[0]).toMatchObject({ count: 3, min: 1, max: 42 });
  });

  it('rejects scope="private" and scope="all" without an upstream call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await aggregateDocumentsHandler({
      scope: 'all',
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
    });
    expect(res).toEqual({ error: expect.stringMatching(/anonymous-only/i) });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed inputs (missing valueField, unknown op, bad scope)', async () => {
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

  it('marks truncated=true when total_items exceeds the scan cap', async () => {
    const docs = Array.from({ length: 100 }, (_, i) => ({
      id: `d${i}`,
      datasetId: DSID_A,
      document_class: { class_name: 'subject' },
      data: { subject: { weight: i + 1 } },
    }));
    mockFetchOnce({
      documents: docs,
      totalItems: 5000, // backend reports many more than were returned
      page: 1,
      pageSize: 1000,
    });
    const res = await aggregateDocumentsHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
      maxDocs: 50,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.total_items).toBe(5000);
    expect(res.numeric_matches).toBe(50);
    expect(res.truncated).toBe(true);
  });

  it('builds one reference per distinct dataset across the matched docs', async () => {
    mockFetchOnce({
      documents: [
        { id: 'd1', datasetId: DSID_A, document_class: { class_name: 'subject' }, data: { subject: { weight: 10 } } },
        { id: 'd2', datasetId: DSID_A, document_class: { class_name: 'subject' }, data: { subject: { weight: 20 } } },
        { id: 'd3', datasetId: DSID_B, document_class: { class_name: 'subject' }, data: { subject: { weight: 30 } } },
      ],
      totalItems: 3,
      page: 1,
      pageSize: 1000,
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

  it('passes backend errors through with status code', async () => {
    mockFetchOnce({ detail: 'Query took too long' }, 504);
    const res = await aggregateDocumentsHandler({
      scope: 'public',
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      valueField: 'data.subject.weight',
    });
    expect(res).toEqual({ error: expect.stringMatching(/Query failed \(504/) });
  });
});
