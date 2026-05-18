/**
 * tabular_query — hits /api/datasets/:id/tabular_query and shapes the
 * response for the LLM (+ violin-chart fence payload).
 *
 * Tests cover:
 *   - happy path with groups (chart_payload + references built)
 *   - empty result with _meta.columns → empty_hint surfaced with
 *     a best-guess retry_with field (the bug we just fixed)
 *   - empty result with _meta.variable_names → variable-name hint
 *   - empty result with no _meta → no empty_hint (gracefully degrade)
 *   - URL construction matches backend contract
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tabularQueryHandler } from '@/lib/ndi/tools/tabular-query';

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

describe('tabular_query', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('builds the right URL and returns groups_summary + chart_payload + references', async () => {
    const fetchSpy = mockFetchOnce({
      groups: [
        {
          name: 'Saline',
          values: [4, 3, 4, 5],
          count: 4,
          mean: 4,
          median: 4,
          std: 0.82,
          min: 3,
          max: 5,
          q1: 3.5,
          q3: 4.5,
          // Backend now surfaces 1-3 contributing row docIds per group
          // so the chat can build per-group sample-row references.
          docIds: ['doc-saline-1', 'doc-saline-2', 'doc-saline-3'],
          totalRows: 22,
        },
        {
          name: 'CNO',
          values: [5, 6, 5],
          count: 3,
          mean: 5.33,
          median: 5,
          std: 0.58,
          min: 5,
          max: 6,
          q1: 5,
          q3: 5.5,
          docIds: ['doc-cno-1', 'doc-cno-2', 'doc-cno-3'],
          totalRows: 23,
        },
      ],
      yLabel: 'EPM open-arm entries',
      xLabel: 'Treatment',
      source: {
        dataset_id: DSID,
        document_id: 'doc-123',
        variable_name: 'ElevatedPlusMaze_OpenArmNorth_Entries',
      },
    });

    const res = await tabularQueryHandler({
      datasetId: DSID,
      variableNameContains: 'ElevatedPlusMaze_OpenArmNorth_Entries',
      groupBy: 'Treatment',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_BASE}/api/datasets/${DSID}/tabular_query?variableNameContains=ElevatedPlusMaze_OpenArmNorth_Entries&groupBy=Treatment`,
      expect.any(Object),
    );
    if ('error' in res) throw new Error(res.error);
    expect(res.groups_summary).toHaveLength(2);
    // raw values stripped from LLM-facing summary
    expect((res.groups_summary[0] as Record<string, unknown>).values).toBeUndefined();
    expect(res.chart_payload).toMatchObject({
      datasetId: DSID,
      variableNameContains: 'ElevatedPlusMaze_OpenArmNorth_Entries',
      groupBy: 'Treatment',
    });
    // Granular citations:
    //   - 1 primary chip → ontology table view
    //   - 1 per-group chip → sample row from each bucket
    expect(res.references).toHaveLength(3);
    // Primary: table view, snippet honest about row + group counts.
    expect(res.references[0]).toMatchObject({
      class: 'ontologyTable',
      url: `/datasets/${DSID}/tables/ontology`,
    });
    expect(res.references[0]?.snippet).toMatch(/Aggregated from 7 rows across 2 groups/);
    expect(res.references[0]?.title).toContain('ElevatedPlusMaze_OpenArmNorth_Entries');
    // Per-group sample rows (one per group, in order).
    expect(res.references[1]).toMatchObject({
      class: 'ontologyTableRow',
      doc_id: 'doc-saline-1',
      url: `/datasets/${DSID}/documents/doc-saline-1`,
      title: 'Sample row: Saline',
    });
    expect(res.references[1]?.snippet).toMatch(/One of 22 rows.*Saline group/);
    expect(res.references[2]).toMatchObject({
      class: 'ontologyTableRow',
      doc_id: 'doc-cno-1',
      url: `/datasets/${DSID}/documents/doc-cno-1`,
      title: 'Sample row: CNO',
    });
    expect(res.references[2]?.snippet).toMatch(/One of 23 rows.*CNO group/);
    expect(res.empty_hint).toBeUndefined();
  });

  // ---- THE BUG WE JUST FIXED -----------------------------------------

  it('surfaces empty_hint with available_columns + retry_with when groupBy did not resolve', async () => {
    mockFetchOnce({
      groups: [],
      yLabel: 'EPM open-arm entries',
      xLabel: 'treatment_group',
      _meta: {
        reason:
          "no column matched groupBy 'treatment_group' in the selected table",
        columns: [
          'ElevatedPlusMaze_TestIdentifier',
          'Treatment_CNOOrSalineAdministration',
          'ElevatedPlusMaze_OpenArmSouth_Entries',
        ],
      },
    });
    const res = await tabularQueryHandler({
      datasetId: DSID,
      variableNameContains: 'ElevatedPlusMaze_OpenArmNorth_Entries',
      // This is the wrong column name — backend gracefully returns the list.
      groupBy: 'treatment_group',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.groups_summary).toEqual([]);
    expect(res.empty_hint).toBeDefined();
    expect(res.empty_hint?.reason).toMatch(/no column matched groupBy/);
    expect(res.empty_hint?.available_columns).toContain(
      'Treatment_CNOOrSalineAdministration',
    );
    // suggestGroupColumn picks "Treatment_CNOOrSalineAdministration"
    // because guess prefix "treatment" matches the column's lowercase
    // prefix.
    expect(res.empty_hint?.retry_with).toEqual({
      variableNameContains: 'ElevatedPlusMaze_OpenArmNorth_Entries',
      groupBy: 'Treatment_CNOOrSalineAdministration',
    });
  });

  it('surfaces empty_hint with available_variable_names when variableNameContains did not resolve', async () => {
    mockFetchOnce({
      groups: [],
      yLabel: '',
      xLabel: '',
      _meta: {
        reason: "no ontologyTableRow column matched 'NonexistentVariable'",
        variable_names: [
          'ElevatedPlusMaze | Treatment | Subject',
          'FearPotentiatedStartle | Treatment | Subject',
        ],
      },
    });
    const res = await tabularQueryHandler({
      datasetId: DSID,
      variableNameContains: 'NonexistentVariable',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.empty_hint?.available_variable_names).toHaveLength(2);
    expect(res.empty_hint?.available_columns).toBeUndefined();
    expect(res.empty_hint?.retry_with).toBeUndefined();
  });

  it('returns no empty_hint when backend gave _meta but no actionable hints', async () => {
    // E.g. "no ontologyTableRow docs in dataset" — nothing to retry on.
    mockFetchOnce({
      groups: [],
      yLabel: '',
      xLabel: '',
      _meta: { reason: 'no ontologyTableRow docs in dataset' },
    });
    const res = await tabularQueryHandler({
      datasetId: DSID,
      variableNameContains: 'anything',
    });
    if ('error' in res) throw new Error(res.error);
    // empty_hint IS surfaced, but with reason only — LLM should explain
    // to the user, not retry.
    expect(res.empty_hint?.reason).toMatch(/no ontologyTableRow docs/);
    expect(res.empty_hint?.available_columns).toBeUndefined();
    expect(res.empty_hint?.retry_with).toBeUndefined();
  });

  it('omits empty_hint entirely when the backend returned a meta-less empty (defensive)', async () => {
    mockFetchOnce({ groups: [], yLabel: '', xLabel: '' });
    const res = await tabularQueryHandler({
      datasetId: DSID,
      variableNameContains: 'anything',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.empty_hint).toBeUndefined();
  });
});
