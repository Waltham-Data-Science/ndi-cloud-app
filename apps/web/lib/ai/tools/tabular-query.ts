/**
 * `tabular_query` — aggregate behavioral / measurement tables into
 * per-group statistics + the raw values needed for violin/jitter
 * rendering.
 *
 * Targets the `ontologyTableRow` document class — Dabrowska EPM,
 * Bhar chemotaxis, Haley patch-encounter, and any other tabular
 * behavioral data stored as ontology-grounded rows. The backend
 * (`POST /api/datasets/:id/tabular_query`) walks
 * `ontologyTableRow → ontologyTableRowDoc2Table` and computes:
 * mean, median, std, min/max, q1/q3, plus the per-group raw
 * values for the violin's KDE / jitter overlay.
 *
 * The handler returns BOTH:
 *   1. A `chart_payload` object the LLM is taught to echo back into
 *      its response as a fenced code block (```violin-chart). The
 *      chat UI intercepts the fence and renders ViolinChart.
 *   2. A `references` array citing the source ontologyTableRow doc
 *      (or the dataset overview if the row-level doc ID isn't
 *      surfaced by the backend yet).
 *
 * As with fetch_signal, the LLM never sees raw value arrays — those
 * are huge and would blow the token budget. We strip them from the
 * LLM-facing return; ViolinChart re-fetches the full arrays
 * client-side via TanStack Query (cheap second hit + backend cache).
 */
import { z } from 'zod';

import {
  makeOntologyTableReference,
  makeReference,
  type Reference,
} from '../references';
import { baseUrl, fetchJson, isErrorResult, type ToolResult } from './shared';

export const tabularQueryInput = z.object({
  datasetId: z.string().min(1, 'datasetId is required'),
  /**
   * Substring matched against `ontologyTableRow.variableNames`. The
   * MATLAB tutorial pattern uses this exact filter
   * (`contains_string`) for figure recapitulation.
   * Examples: "ElevatedPlusMaze", "Fear_potentiatedStartle",
   * "Chemotaxis_McCutcheon".
   */
  variableNameContains: z
    .string()
    .min(1, 'variableNameContains is required'),
  /**
   * Optional grouping column. Common values: "treatment_group",
   * "strain", "condition", "phase". When unset, all rows form one
   * group named "all".
   */
  groupBy: z.string().min(1).optional(),
  /**
   * Optional explicit group ordering (left-to-right on the violin).
   * When unset, groups are returned in first-seen order.
   */
  groupOrder: z.array(z.string()).max(20).optional(),
  /** Display-only — surfaced as the violin chart title. */
  title: z.string().max(160).optional(),
});

export type TabularQueryInput = z.infer<typeof tabularQueryInput>;

interface BackendGroup {
  name: string;
  values: number[];
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  /**
   * Sample of contributing ontologyTableRow docIds (cap of 3 per
   * group from the backend). Used by the frontend to build per-group
   * sample-row references so the user can drill into specific
   * examples (e.g. "one Saline row" / "one CNO row").
   */
  docIds?: string[];
  /** Total contributing rows BEFORE the docIds sample-cap. */
  totalRows?: number;
}

interface BackendTabularResponse {
  groups: BackendGroup[];
  yLabel?: string;
  xLabel?: string;
  source?: {
    dataset_id: string;
    document_id?: string;
    variable_name?: string;
  };
  /**
   * The backend's diagnostic envelope when no groups came back. Carries
   * a `reason` plus, depending on the failure mode, either:
   *   - `columns`: available column keys when groupBy didn't resolve
   *   - `variable_names`: available ontologyTableRow variableNames when
   *     variableNameContains didn't resolve to any column
   * Pre-compact this was silently dropped — the LLM saw `groups: []` and
   * gave up. Now we surface it so the LLM can retry with the right hint.
   */
  _meta?: {
    reason?: string;
    columns?: string[];
    variable_names?: string[];
  };
}

/**
 * Diagnostic hint surfaced to the LLM when the call returned empty.
 * Tells the LLM WHY it was empty and offers concrete retry options.
 */
export interface TabularQueryEmptyHint {
  reason: string;
  /** Available column keys in the matched ontologyTableRow group, if
   * the failure was a groupBy miss. The LLM should pick one of these
   * (case-insensitive substring match works) and retry. */
  available_columns?: string[];
  /** Available variableNames groups, if the failure was a
   * variableNameContains miss. The LLM should pick a different substring
   * and retry. */
  available_variable_names?: string[];
  /** Suggested retry call shape so the LLM doesn't have to figure it out. */
  retry_with?: {
    variableNameContains: string;
    groupBy?: string;
  };
}

/** LLM-facing tool output — strips per-row value arrays. */
export interface TabularQueryToolResult {
  /** Per-group stats (no raw arrays). */
  groups_summary: Array<{
    name: string;
    count: number;
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
    q1: number;
    q3: number;
  }>;
  /** Render params for the ```violin-chart fence. */
  chart_payload: {
    datasetId: string;
    variableNameContains: string;
    groupBy?: string;
    groupOrder?: string[];
    title?: string;
  };
  references: Reference[];
  /**
   * Present ONLY when groups_summary is empty. Tells the LLM what went
   * wrong and what to try next. The LLM is taught to inspect this and
   * retry rather than fall through to query_documents exploration.
   */
  empty_hint?: TabularQueryEmptyHint;
}

export async function tabularQueryHandler(
  input: TabularQueryInput,
): Promise<ToolResult<TabularQueryToolResult>> {
  const { datasetId, variableNameContains, groupBy, groupOrder, title } = input;

  const params = new URLSearchParams({ variableNameContains });
  if (groupBy) params.set('groupBy', groupBy);
  if (groupOrder && groupOrder.length > 0) {
    params.set('groupOrder', groupOrder.join(','));
  }

  const url = `${baseUrl()}/api/datasets/${encodeURIComponent(datasetId)}/tabular_query?${params}`;
  const res = await fetchJson<BackendTabularResponse>(url);
  if (isErrorResult(res)) return res;

  // Strip raw values from the LLM-facing summary — keep only stats.
  // Renderer re-fetches the full arrays from the same endpoint on
  // mount via TanStack Query.
  const groups_summary = res.groups.map((g) => ({
    name: g.name,
    count: g.count,
    mean: g.mean,
    median: g.median,
    std: g.std,
    min: g.min,
    max: g.max,
    q1: g.q1,
    q3: g.q3,
  }));

  // Build references — granular at every level:
  //
  // 1. PRIMARY: ontology-table view of the dataset. The user can
  //    eyeball the column they're seeing compared, sibling columns,
  //    and the full row set. Click takes them to the data-browser
  //    surface that backs the chart.
  //
  // 2. PER-GROUP samples: one click-through chip per group label,
  //    using the first contributing docId from the backend's
  //    sampled list (capped at 3 docIds/group server-side). Lets
  //    the user verify "what does ONE Saline row actually look
  //    like?" vs "what does ONE CNO row actually look like?" —
  //    granular sourcing for the aggregation.
  //
  // Pre-this-fix the citation pointed to a single arbitrary row
  // from `doc_ids[0]` with no group context, which was misleading.
  const totalObs = groups_summary.reduce((s, g) => s + g.count, 0);
  const references: Reference[] = [
    makeOntologyTableReference({
      datasetId,
      variableName: res.source?.variable_name ?? variableNameContains,
      rowCount: totalObs,
      groupCount: groups_summary.length,
      ...(groupBy ? { groupBy } : {}),
    }),
  ];
  for (const group of res.groups) {
    const sampleDocId = group.docIds?.[0];
    if (!sampleDocId) continue;
    const groupTotal = group.totalRows ?? group.count;
    const sourceLabel = res.source?.variable_name ?? variableNameContains;
    references.push(
      makeReference({
        datasetId,
        doc_id: sampleDocId,
        class: 'ontologyTableRow',
        title: `Sample row: ${group.name}`,
        snippet:
          `One of ${groupTotal} ` +
          `row${groupTotal === 1 ? '' : 's'} contributing to the ` +
          `${group.name} group of "${sourceLabel}". ` +
          `Click to inspect the row's full document.`,
      }),
    );
  }

  // Surface the backend's diagnostic envelope when nothing came back.
  // The backend tells us WHY (e.g. "no column matched groupBy
  // 'treatment_group' in the selected table") and lists the actual
  // column keys for retry. Pre-this-fix the LLM never saw this hint
  // and would pivot to query_documents exploration — wasting calls.
  let empty_hint: TabularQueryEmptyHint | undefined;
  if (groups_summary.length === 0 && res._meta) {
    const meta = res._meta;
    empty_hint = {
      reason: meta.reason ?? 'no data returned',
    };
    if (meta.columns && meta.columns.length > 0) {
      empty_hint.available_columns = meta.columns;
      // Best-effort retry suggestion: when the user's groupBy didn't
      // match, pick the most plausibly-related column from the list
      // (case-insensitive substring overlap on word boundary).
      if (groupBy) {
        const suggested = suggestGroupColumn(groupBy, meta.columns);
        if (suggested) {
          empty_hint.retry_with = {
            variableNameContains,
            groupBy: suggested,
          };
        }
      }
    }
    if (meta.variable_names && meta.variable_names.length > 0) {
      empty_hint.available_variable_names = meta.variable_names;
    }
  }

  return {
    groups_summary,
    chart_payload: {
      datasetId,
      variableNameContains,
      ...(groupBy ? { groupBy } : {}),
      ...(groupOrder ? { groupOrder } : {}),
      ...(title ? { title } : {}),
    },
    references,
    ...(empty_hint ? { empty_hint } : {}),
  };
}

/**
 * Best-effort: pick the most plausibly-matching column from the
 * backend's list given the LLM's failed groupBy guess. Used only to
 * pre-fill `retry_with` — the LLM is free to override.
 *
 * Strategy: find any column whose lowercased key starts with the same
 * prefix as the lowercased guess up to the first underscore. E.g.
 * "treatment_group" → prefix "treatment" → matches
 * "Treatment_CNOOrSalineAdministration".
 */
function suggestGroupColumn(guess: string, columns: string[]): string | null {
  const guessLower = guess.toLowerCase();
  const guessPrefix = guessLower.split(/[_\s]/)[0] ?? guessLower;
  if (!guessPrefix) return null;
  // Exact substring match first (covers "treatment" → ...Treatment...).
  for (const c of columns) {
    if (c.toLowerCase().includes(guessLower)) return c;
  }
  // Prefix-of-prefix fallback ("treatment_group" → match anything
  // starting with "treatment").
  for (const c of columns) {
    if (c.toLowerCase().startsWith(guessPrefix)) return c;
  }
  return null;
}
