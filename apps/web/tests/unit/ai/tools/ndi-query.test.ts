/**
 * ndi_query — POSTs to /api/query with NDI Query DSL, returns a compact
 * projection of matching documents.
 *
 * Tests cover:
 *   - happy path (scope=single-id, scope=public, scope=CSV)
 *   - zod validation (bad scope, bad op, ~or, empty searchstructure)
 *   - auth scope rejection (private/all return typed error without RTT)
 *   - response projection (label extraction, data_preview truncation)
 *   - reference building (per-doc with datasetId, fallback for single-
 *     dataset scope when no datasetId comes back)
 *   - truncation flag (total_items > visible cap)
 *   - backend-error pass-through
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ndiQueryHandler } from '@/lib/ndi/tools/ndi-query';

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

describe('ndi_query', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ---- happy paths -----------------------------------------------------

  it('POSTs to /api/query with the right body shape for a single-dataset scope', async () => {
    const fetchSpy = mockFetchOnce({
      documents: [],
      totalItems: 0,
      page: 1,
      pageSize: 1000,
    });
    const result = await ndiQueryHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'probe' }],
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_BASE}/api/query`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          scope: DSID_A,
          searchstructure: [{ operation: 'isa', param1: 'probe' }],
        }),
      }),
    );
    if ('error' in result) throw new Error(`expected success, got ${result.error}`);
    expect(result.total_items).toBe(0);
    expect(result.documents).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.scope).toBe(DSID_A);
  });

  it('accepts scope="public" and CSV-of-IDs (cross-dataset)', async () => {
    mockFetchOnce({ documents: [], totalItems: 0, page: 1, pageSize: 1000 });
    let res = await ndiQueryHandler({
      scope: 'public',
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
    });
    expect('error' in res ? res.error : null).toBeNull();

    mockFetchOnce({ documents: [], totalItems: 0, page: 1, pageSize: 1000 });
    res = await ndiQueryHandler({
      scope: `${DSID_A},${DSID_B}`,
      searchstructure: [{ operation: 'isa', param1: 'probe' }],
    });
    expect('error' in res ? res.error : null).toBeNull();
  });

  // ---- validation ------------------------------------------------------

  it('rejects scope="all" and scope="private" without a round-trip', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let res = await ndiQueryHandler({
      scope: 'all',
      searchstructure: [{ operation: 'isa', param1: 'probe' }],
    });
    expect(res).toEqual({
      error: expect.stringMatching(/anonymous-only/i),
    });

    res = await ndiQueryHandler({
      scope: 'private',
      searchstructure: [{ operation: 'isa', param1: 'probe' }],
    });
    expect(res).toEqual({
      error: expect.stringMatching(/anonymous-only/i),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed scope (non-keyword, non-CSV)', async () => {
    const res = await ndiQueryHandler({
      // 23 chars — too short for an ObjectId
      scope: 'a'.repeat(23),
      searchstructure: [{ operation: 'isa', param1: 'probe' }],
    });
    expect(res).toEqual({
      error: expect.stringMatching(/scope must be/i),
    });
  });

  it('rejects unknown operations and the ~or sentinel', async () => {
    let res = await ndiQueryHandler({
      scope: 'public',
      searchstructure: [{ operation: 'bogus', param1: 'x' }],
    });
    expect(res).toEqual({ error: expect.stringMatching(/operation must be one of/i) });

    res = await ndiQueryHandler({
      scope: 'public',
      searchstructure: [
        {
          operation: '~or',
          param1: [{ operation: 'isa', param1: 'subject' }],
          param2: [{ operation: 'isa', param1: 'probe' }],
        },
      ],
    });
    expect(res).toEqual({ error: expect.stringMatching(/~or is not allowed|operation must be one of/i) });
  });

  it('accepts negation prefix ~ on supported ops', async () => {
    mockFetchOnce({ documents: [], totalItems: 0, page: 1, pageSize: 1000 });
    const res = await ndiQueryHandler({
      scope: 'public',
      searchstructure: [
        { operation: '~contains_string', field: 'subject.strain', param1: 'CRF' },
      ],
    });
    expect('error' in res ? res.error : null).toBeNull();
  });

  it('rejects empty searchstructure', async () => {
    const res = await ndiQueryHandler({
      scope: 'public',
      searchstructure: [],
    });
    expect(res).toEqual({ error: expect.stringMatching(/at least one clause/i) });
  });

  // ---- response projection --------------------------------------------

  it('extracts class + label from each doc and trims data_preview', async () => {
    mockFetchOnce({
      documents: [
        {
          id: 'doc-1',
          datasetId: DSID_A,
          document_class: { class_name: 'probe' },
          data: {
            probe: {
              type: 'n-trode',
              name: 'P1',
              huge_field: 'x'.repeat(2000), // will be truncated
            },
          },
        },
        {
          // No id/document_class — should fall back gracefully.
          _id: 'doc-2',
          dataset: DSID_A,
          classLineage: ['base', 'subject'],
          data: {
            subject: { subjectName: 'SD42', strain: 'Sprague-Dawley' },
          },
        },
      ],
      totalItems: 2,
      page: 1,
      pageSize: 1000,
    });

    const res = await ndiQueryHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'probe' }],
    });
    if ('error' in res) throw new Error(res.error);

    expect(res.documents).toHaveLength(2);
    // Label extraction order: name first (more universal across NDI
    // classes), then type. probe.name="P1" wins over probe.type="n-trode".
    expect(res.documents[0]).toMatchObject({
      id: 'doc-1',
      class: 'probe',
      datasetId: DSID_A,
      label: 'P1',
    });
    // huge_field truncated; small fields preserved
    expect(res.documents[0]?.data_preview).toMatchObject({
      type: 'n-trode',
      name: 'P1',
      huge_field: expect.stringMatching(/truncated/),
    });
    expect(res.documents[1]).toMatchObject({
      id: 'doc-2',
      class: 'subject',
      datasetId: DSID_A,
      label: 'SD42',
    });
  });

  it('marks documents truncated when total_items exceeds visible cap', async () => {
    const docs = Array.from({ length: 200 }, (_, i) => ({
      id: `doc-${i}`,
      datasetId: DSID_A,
      document_class: { class_name: 'subject' },
      data: { subject: { name: `s${i}` } },
    }));
    mockFetchOnce({
      documents: docs,
      totalItems: 5000,
      page: 1,
      pageSize: 1000,
    });

    const res = await ndiQueryHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
      limit: 50,
    });
    if ('error' in res) throw new Error(res.error);

    expect(res.documents).toHaveLength(50);
    expect(res.total_items).toBe(5000);
    expect(res.truncated).toBe(true);
    // Granular transparency: the LLM sees cited count vs true total
    // so it can disclose "20 of 5000" rather than implying citations
    // are exhaustive.
    expect(res.references_summary).toEqual({
      cited: 20, // hard cap on per-doc refs
      total_available: 5000,
      truncated: true,
      cap: 20,
    });
  });

  // ---- references ------------------------------------------------------

  it('builds one reference per surfaced doc, capped at 20', async () => {
    const docs = Array.from({ length: 30 }, (_, i) => ({
      id: `doc-${i}`,
      datasetId: DSID_A,
      document_class: { class_name: 'probe' },
      data: { probe: { name: `P${i}` } },
    }));
    mockFetchOnce({
      documents: docs,
      totalItems: 30,
      page: 1,
      pageSize: 1000,
    });

    const res = await ndiQueryHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'probe' }],
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.references).toHaveLength(20);
    expect(res.references[0]?.url).toBe(`/datasets/${DSID_A}/documents/doc-0`);
    expect(res.references[0]?.class).toBe('probe');
  });

  it('falls back to a single dataset-level reference when no doc has datasetId but scope is a single ID', async () => {
    // Cloud-node sometimes returns docs without datasetId on the
    // projected response — when scope is a single dataset we still
    // want a clickable citation chip.
    mockFetchOnce({
      documents: [
        {
          id: 'doc-1',
          document_class: { class_name: 'probe' },
          data: { probe: { name: 'P1' } },
          // no datasetId
        },
      ],
      totalItems: 1,
      page: 1,
      pageSize: 1000,
    });
    const res = await ndiQueryHandler({
      scope: DSID_A,
      searchstructure: [{ operation: 'isa', param1: 'probe' }],
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.references).toHaveLength(1);
    expect(res.references[0]?.class).toBe('dataset');
    expect(res.references[0]?.url).toBe(`/datasets/${DSID_A}/overview`);
  });

  // ---- error pass-through ---------------------------------------------

  it('surfaces a 422 from the backend with its detail message', async () => {
    mockFetchOnce(
      { detail: '`~or` is not a supported operation.' },
      422,
    );
    const res = await ndiQueryHandler({
      scope: 'public',
      searchstructure: [{ operation: 'isa', param1: 'probe' }],
    });
    expect(res).toEqual({
      error: expect.stringMatching(/Query failed \(422/),
    });
  });

  it('surfaces a 504 as a typed timeout-like error', async () => {
    mockFetchOnce({ message: 'gateway timeout' }, 504);
    const res = await ndiQueryHandler({
      scope: 'public',
      searchstructure: [{ operation: 'isa', param1: 'probe' }],
    });
    expect(res).toEqual({ error: expect.stringMatching(/Query failed \(504/) });
  });
});
