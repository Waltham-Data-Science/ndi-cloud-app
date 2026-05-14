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

import { tabularQueryHandler } from '@/lib/ai/tools/tabular-query';

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
    // Reference should point to the TABLE view (not an arbitrary single
    // row's docId). The chart aggregates across many rows; citing one
    // would mislead the user when they click through.
    expect(res.references).toHaveLength(1);
    expect(res.references[0]).toMatchObject({
      class: 'ontologyTable',
      url: `/datasets/${DSID}/tables/ontology`,
    });
    expect(res.references[0]?.snippet).toMatch(/Aggregated from 7 rows across 2 groups/);
    expect(res.references[0]?.title).toContain('ElevatedPlusMaze_OpenArmNorth_Entries');
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
