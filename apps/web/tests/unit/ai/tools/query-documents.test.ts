/**
 * query_documents — hits /api/datasets/:id/tables/:className and
 * decorates each row with a self-citation Reference.
 *
 * Tests verify URL construction, reference extraction (self-doc-id
 * vs dataset-fallback), pagination cap, and the error pathways.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryDocumentsHandler } from '@/lib/ai/tools/query-documents';

const TEST_BASE = 'https://api.example.com';

function mockFetchOnce(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('query_documents', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('hits /api/datasets/:id/tables/:className with the default pageSize', async () => {
    const fetchSpy = mockFetchOnce({ columns: [], rows: [], total: 0 });
    const result = await queryDocumentsHandler({
      datasetId: 'ds1',
      className: 'subject',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_BASE}/api/datasets/ds1/tables/subject?page=1&pageSize=10`,
      expect.any(Object),
    );
    if ('error' in result) throw new Error('expected success');
    expect(result.className).toBe('subject');
    expect(result.totalRows).toBe(0);
    expect(result.references).toEqual([]);
  });

  it('clamps limit to its max via zod (>30 is rejected as invalid)', async () => {
    const result = await queryDocumentsHandler({
      datasetId: 'ds1',
      className: 'subject',
      limit: 500,
    });
    expect(result).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('decorates each row with a self-reference when row has *DocumentIdentifier', async () => {
    mockFetchOnce({
      columns: [
        { key: 'subjectIdentifier', label: 'Subject Identifier' },
        { key: 'subjectDocumentIdentifier', label: 'Subject Doc ID' },
        { key: 'speciesName', label: 'Species' },
        { key: 'strainName', label: 'Strain' },
      ],
      rows: [
        {
          subjectIdentifier: 'mouse@lab.org',
          subjectDocumentIdentifier: 'NDI_412695_aaaa',
          speciesName: 'Mus musculus',
          strainName: 'C57BL/6J',
        },
        {
          subjectIdentifier: 'rat@lab.org',
          subjectDocumentIdentifier: 'NDI_412695_bbbb',
          speciesName: 'Rattus norvegicus',
          strainName: 'SD',
        },
      ],
      total: 2,
    });
    const result = await queryDocumentsHandler({
      datasetId: 'ds1',
      className: 'subject',
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!._reference).toMatchObject({
      doc_id: 'NDI_412695_aaaa',
      url: '/datasets/ds1/documents/NDI_412695_aaaa',
      class: 'subject',
      title: 'mouse@lab.org',
      snippet: expect.stringContaining('Mus musculus'),
    });
    expect(result.references).toHaveLength(2);
    expect(result.references[1]!.doc_id).toBe('NDI_412695_bbbb');
  });

  it('falls back to dataset reference when row has no self-doc-id column', async () => {
    mockFetchOnce({
      columns: [
        { key: 'fieldA', label: 'A' },
        { key: 'fieldB', label: 'B' },
      ],
      rows: [{ fieldA: 'x', fieldB: 'y' }],
      total: 1,
    });
    const result = await queryDocumentsHandler({
      datasetId: 'ds1',
      className: 'unknown_class',
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.rows[0]!._reference).toMatchObject({
      doc_id: 'ds1',
      url: '/datasets/ds1/overview',
      class: 'dataset',
    });
  });

  it('returns { error } on non-2xx upstream', async () => {
    mockFetchOnce('boom', 500);
    const result = await queryDocumentsHandler({
      datasetId: 'ds1',
      className: 'subject',
    });
    expect(result).toEqual({ error: expect.stringMatching(/500/) });
  });

  it('returns { error } when INTERNAL_API_URL is unset', async () => {
    vi.unstubAllEnvs();
    const result = await queryDocumentsHandler({
      datasetId: 'ds1',
      className: 'subject',
    });
    expect(result).toEqual({ error: expect.stringMatching(/not configured/i) });
  });

  it('rejects empty inputs via zod', async () => {
    const r1 = await queryDocumentsHandler({ datasetId: '', className: 'x' });
    const r2 = await queryDocumentsHandler({ datasetId: 'd', className: '' });
    expect(r1).toEqual({ error: expect.stringMatching(/invalid/i) });
    expect(r2).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('surfaces distinctSummary from the backend response', async () => {
    // Smoke-tested case (Dabrowska BNST treatment table): 49 rows all
    // sharing one treatmentName. distinct_summary must surface the
    // collapse so the LLM knows to pivot to ontologyTableRow.
    mockFetchOnce({
      columns: [
        { key: 'treatmentName', label: 'Treatment' },
        { key: 'treatmentOntology', label: 'Treatment Ontology' },
      ],
      rows: [
        {
          treatmentName: 'Optogenetic Tetanus Stimulation Target Location',
          treatmentOntology: 'UBERON:0001234',
        },
      ],
      total: 49,
      distinct_summary: {
        treatmentName: {
          distinct_count: 1,
          top_values: [
            {
              value: 'Optogenetic Tetanus Stimulation Target Location',
              count: 49,
            },
          ],
        },
        treatmentOntology: {
          distinct_count: 1,
          top_values: [{ value: 'UBERON:0001234', count: 49 }],
        },
      },
    });
    const result = await queryDocumentsHandler({
      datasetId: 'ds1',
      className: 'treatment',
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.distinctSummary).toBeDefined();
    expect(result.distinctSummary).toMatchObject({
      treatmentName: {
        distinct_count: 1,
        top_values: [
          {
            value: 'Optogenetic Tetanus Stimulation Target Location',
            count: 49,
          },
        ],
      },
    });
    expect(result.totalRows).toBe(49);
  });

  it('passes through the _meta sentinel when backend skipped the scan', async () => {
    mockFetchOnce({
      columns: [{ key: 'x', label: 'X' }],
      rows: [{ x: 1 }],
      total: 20000,
      distinct_summary: { _meta: 'skipped due to large row count' },
    });
    const result = await queryDocumentsHandler({
      datasetId: 'ds1',
      className: 'subject',
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.distinctSummary).toEqual({
      _meta: 'skipped due to large row count',
    });
  });

  it('omits distinctSummary when the backend does not provide one', async () => {
    // Backwards-compat: older backends (pre-distinct_summary) just
    // return columns+rows+total. The tool must not crash and the field
    // is simply absent on the response.
    mockFetchOnce({
      columns: [{ key: 'name', label: 'Name' }],
      rows: [{ name: 'A' }],
      total: 1,
    });
    const result = await queryDocumentsHandler({
      datasetId: 'ds1',
      className: 'subject',
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.distinctSummary).toBeUndefined();
    expect(result.rows).toHaveLength(1);
  });
});
