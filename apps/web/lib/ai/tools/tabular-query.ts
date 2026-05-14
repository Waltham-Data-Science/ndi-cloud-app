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
  makeReference,
  makeDatasetReference,
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

  // Build references. Prefer the source ontologyTableRow doc when the
  // backend surfaces one; otherwise cite the dataset overview.
  const totalObs = groups_summary
    .reduce((s, g) => s + g.count, 0)
    .toLocaleString();
  const references: Reference[] = [
    res.source?.document_id
      ? makeReference({
          datasetId,
          doc_id: res.source.document_id,
          class: 'ontologyTableRow',
          title:
            res.source.variable_name ??
            `Tabular data: ${variableNameContains}`,
          snippet: `${groups_summary.length} groups, ${totalObs} observations`,
        })
      : makeDatasetReference({
          datasetId,
          title: `Source dataset for ${variableNameContains}`,
          snippet: `${groups_summary.length} groups, ${totalObs} observations`,
        }),
  ];

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
  };
}
