/**
 * `treatment_timeline` — project a dataset's `treatment` documents
 * into a horizontal Gantt-style timeline (one row per subject, one
 * colored bar per treatment-period).
 *
 * Targets the canonical NDI `treatment` document class — used by
 * Dabrowska (Saline / CNO administration, optogenetic stimulation),
 * Bhar (training / testing / recovery phases), and any other study
 * that records temporal interventions per subject.
 *
 * Endpoint strategy:
 *   1. PRIMARY: GET /api/datasets/:id/tables/treatment — returns rows
 *      of {treatmentName, treatmentOntology, numericValue, stringValue,
 *      subjectDocumentIdentifier}. This is the projection-only path;
 *      the backend has already walked the treatment-class docs.
 *   2. FALLBACK: GET /api/datasets/:id/tabular_query?variableNameContains
 *      =Treatment — pulls the ontology-grounded "treatment timeline"
 *      from any ontologyTableRow that surfaces a Treatment_* column.
 *      Lower-fidelity (no per-subject breakdown), used only when
 *      step 1 returns zero rows.
 *
 * Temporal extraction is best-effort. The current backend schema does
 * NOT carry explicit start/end timestamps in every dataset; we look in:
 *   - `numericValue`: a `[start, end]` pair when length-2, OR a single
 *     scalar (treat as ordinal slot)
 *   - `startDate` / `endDate` / `time` fields when present (forward-
 *     compat for future ndb-v2 backends)
 *   - `stringValue`: when parseable as ISO date
 *
 * If NO row carries any usable temporal info, we still emit ordinal
 * slot timing (treatment N for subject S → [N, N+1]) and surface a
 * `temporal_source: "ordinal"` flag so the LLM can mention it in
 * prose. We only return `empty_hint` (the "no data at all" envelope)
 * when the endpoint returned zero rows AND the fallback also returned
 * zero.
 *
 * Returns BOTH:
 *   1. A `chart_payload` the LLM is taught to echo back in a
 *      ```gantt-chart fence; the chat UI intercepts and mounts
 *      GanttChart.
 *   2. A `references` array (one per distinct subject, up to 20) so
 *      the citation chips link out to the per-subject document or
 *      dataset overview.
 */
import { z } from 'zod';

import {
  makeDatasetReference,
  makeReference,
  type Reference,
} from '../references';
import {
  baseUrl,
  fetchJson,
  isErrorResult,
  logToolInvocation,
  type ToolResult,
} from './shared';

export const treatmentTimelineInput = z.object({
  datasetId: z.string().min(1, 'datasetId is required'),
  /** Optional chart title surfaced into the gantt-chart fence. */
  title: z.string().max(160).optional(),
  /**
   * Max distinct subjects in the chart. Default 30, hard-cap 100 —
   * beyond that the chart becomes a wall of bars and Plotly's row
   * sizing chokes the chat panel. The handler trims to the first
   * `maxSubjects` distinct subjects in first-seen order.
   */
  maxSubjects: z.number().int().positive().max(100).optional(),
});

export type TreatmentTimelineInput = z.infer<typeof treatmentTimelineInput>;

// Treatment-table row shape from /api/datasets/:id/tables/treatment.
// The backend projects each `treatment` document to this flat shape.
// Optional fields are forward-compat — current backends only ship the
// core five but future ones may surface explicit start/end timestamps.
interface BackendTreatmentRow {
  treatmentName?: string;
  treatmentOntology?: string;
  // numericValue is an ARRAY in the current backend (often empty []).
  // Some future projections may put a scalar pair [start, end] here.
  numericValue?: number[] | number | null;
  stringValue?: string | null;
  subjectDocumentIdentifier?: string;
  // Forward-compat: explicit temporal fields if the backend ever
  // surfaces them directly (we look here first when present).
  startDate?: string | number | null;
  endDate?: string | number | null;
  startTime?: string | number | null;
  endTime?: string | number | null;
  // Some classes carry a self document ID so we can cite the row
  // directly rather than the dataset overview. Optional.
  documentId?: string;
  // Allow unknown extra fields — the schema may grow without notice.
  [k: string]: unknown;
}

interface BackendTreatmentTableResponse {
  columns?: Array<{ key: string; label: string }>;
  rows: BackendTreatmentRow[];
  totalRows?: number | null;
}

/** One item on the gantt chart — mirrors GanttChartItem. */
export interface TreatmentTimelineItem {
  subject: string;
  treatment: string;
  start: number | string;
  end: number | string;
}

/**
 * Diagnostic envelope surfaced when the call returned no usable rows.
 * Mirrors `TabularQueryEmptyHint` in shape.
 */
export interface TreatmentTimelineEmptyHint {
  reason: string;
  /** Columns the backend reported (when present) — helps the LLM tell
   * the user what the table did have. */
  available_columns?: string[];
  /** Suggested retry params (forward-compat — currently always omitted
   * because there's no other knob to turn beyond this tool's input). */
  retry_with?: TreatmentTimelineInput;
}

export interface TreatmentTimelineResult {
  /** Render params for the ```gantt-chart fence. */
  chart_payload: {
    datasetId: string;
    title?: string;
    xLabel?: string;
    items: TreatmentTimelineItem[];
  };
  total_subjects: number;
  total_treatments: number;
  /**
   * Indicates how `start` / `end` were derived:
   *   - "explicit"  → backend carried real timestamps / start-end pairs
   *   - "ordinal"   → start/end were synthesized as [i, i+1] per
   *                   subject because no row carried temporal info.
   *                   The LLM should mention this caveat in prose
   *                   ("treatments are shown in administration order;
   *                   the dataset doesn't record per-treatment start
   *                   times").
   *   - "mixed"     → some rows had explicit timing, some didn't
   */
  temporal_source: 'explicit' | 'ordinal' | 'mixed';
  references: Reference[];
  /**
   * Citation coverage metadata. The LLM is taught to disclose
   * cited-vs-total subject count whenever truncated=true, so the
   * user can't assume the chip set is exhaustive.
   */
  references_summary: {
    cited: number;
    total_subjects: number;
    total_treatments: number;
    truncated: boolean;
    cap: number;
  };
  /**
   * Present ONLY when the endpoint returned zero rows and the
   * tabular_query fallback was also empty. The LLM should surface
   * this to the user plainly rather than emit an empty chart.
   */
  empty_hint?: TreatmentTimelineEmptyHint;
}

export async function treatmentTimelineHandler(
  input: TreatmentTimelineInput,
): Promise<ToolResult<TreatmentTimelineResult>> {
  logToolInvocation('treatment_timeline', {
    datasetId: input?.datasetId,
    maxSubjects: input?.maxSubjects,
  });
  const parsed = treatmentTimelineInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }
  const { datasetId, title } = parsed.data;
  const maxSubjects = parsed.data.maxSubjects ?? 30;

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  // --- Primary: /api/datasets/:id/tables/treatment -------------------
  const primaryUrl =
    `${base}/api/datasets/${encodeURIComponent(datasetId)}` +
    `/tables/treatment?page=1&pageSize=500`;
  const primary = await fetchJson<BackendTreatmentTableResponse>(primaryUrl);
  if (isErrorResult(primary)) return primary;

  let rows: BackendTreatmentRow[] = Array.isArray(primary.rows) ? primary.rows : [];
  let primaryColumns: string[] = (primary.columns ?? [])
    .map((c) => c.key)
    .filter((k): k is string => typeof k === 'string' && k.length > 0);

  // --- Fallback: tabular_query?variableNameContains=Treatment --------
  // Only if primary came back empty.
  if (rows.length === 0) {
    const fallback = await tryTabularQueryFallback(base, datasetId);
    if (fallback && fallback.rows.length > 0) {
      rows = fallback.rows;
      if (fallback.columns.length > 0) primaryColumns = fallback.columns;
    }
  }

  // --- Project rows to GanttChartItem ---------------------------------
  const items: TreatmentTimelineItem[] = [];
  const seenSubjects: string[] = [];
  const seenSubjectIndex = new Map<string, number>();
  // Per-subject ordinal counter — used as fallback timing when the row
  // has no explicit start/end.
  const subjectOrdinalCounter = new Map<string, number>();
  let explicitCount = 0;
  let ordinalCount = 0;

  for (const row of rows) {
    const subject = pickSubjectLabel(row);
    if (!subject) continue;
    const treatment = pickTreatmentLabel(row);
    if (!treatment) continue;

    if (!seenSubjectIndex.has(subject)) {
      // Enforce maxSubjects cap on DISTINCT subjects, not bars.
      if (seenSubjects.length >= maxSubjects) continue;
      seenSubjectIndex.set(subject, seenSubjects.length);
      seenSubjects.push(subject);
    } else if (
      seenSubjects.length >= maxSubjects &&
      !seenSubjectIndex.has(subject)
    ) {
      // Defensive: this branch is unreachable (the .has check above
      // would have caught it). Kept explicit for symmetry.
      continue;
    }

    const explicit = extractExplicitTiming(row);
    let start: number | string;
    let end: number | string;
    if (explicit) {
      start = explicit.start;
      end = explicit.end;
      explicitCount += 1;
    } else {
      // Ordinal slot per subject: each treatment gets [i, i+1].
      const i = subjectOrdinalCounter.get(subject) ?? 0;
      start = i;
      end = i + 1;
      subjectOrdinalCounter.set(subject, i + 1);
      ordinalCount += 1;
    }

    items.push({ subject, treatment, start, end });
  }

  const temporalSource: 'explicit' | 'ordinal' | 'mixed' =
    explicitCount > 0 && ordinalCount === 0
      ? 'explicit'
      : explicitCount === 0 && ordinalCount > 0
        ? 'ordinal'
        : explicitCount > 0 && ordinalCount > 0
          ? 'mixed'
          : 'ordinal'; // both zero — no items at all; default value (unused since chart is empty)

  // References: one per distinct subject, capped at 20. Citation
  // points to the per-subject doc when the backend surfaced one;
  // otherwise the dataset overview.
  const referencesBySubject = new Map<string, Reference>();
  for (const row of rows) {
    const subject = pickSubjectLabel(row);
    if (!subject) continue;
    if (referencesBySubject.has(subject)) continue;
    const treatmentCountForSubject = items.filter(
      (it) => it.subject === subject,
    ).length;
    const snippet =
      `${treatmentCountForSubject} treatment` +
      `${treatmentCountForSubject === 1 ? '' : 's'} in this timeline`;
    const docId =
      typeof row.documentId === 'string' && row.documentId.length > 0
        ? row.documentId
        : null;
    referencesBySubject.set(
      subject,
      docId
        ? makeReference({
            datasetId,
            doc_id: docId,
            class: 'treatment',
            title: `Treatment record: ${subject}`,
            snippet,
          })
        : makeDatasetReference({
            datasetId,
            title: `Subject ${subject}`,
            snippet,
          }),
    );
    if (referencesBySubject.size >= 20) break;
  }
  const references: Reference[] = Array.from(referencesBySubject.values());
  // Truncation transparency: when the dataset has more subjects than
  // we cite, the LLM must disclose the ratio so the user knows the
  // chart's chip set is a sample, not an exhaustive list.
  const referencesSummary = {
    cited: references.length,
    total_subjects: seenSubjects.length,
    total_treatments: items.length,
    truncated: seenSubjects.length > references.length,
    cap: 20,
  };

  // empty_hint when there are zero items to chart.
  let empty_hint: TreatmentTimelineEmptyHint | undefined;
  if (items.length === 0) {
    empty_hint = {
      reason:
        rows.length === 0
          ? 'no temporal info in treatment docs (neither /tables/treatment nor tabular_query returned rows)'
          : 'treatment rows returned but none had a usable subject + treatment pair to plot',
      ...(primaryColumns.length > 0
        ? { available_columns: primaryColumns }
        : {}),
    };
  }

  return {
    chart_payload: {
      datasetId,
      ...(title ? { title } : {}),
      // X-axis label hint when timing is ordinal-only — helps the
      // chart render with a meaningful axis label without forcing
      // the LLM to invent one.
      ...(temporalSource === 'ordinal'
        ? { xLabel: 'Treatment order (ordinal)' }
        : {}),
      items,
    },
    total_subjects: seenSubjects.length,
    total_treatments: items.length,
    temporal_source: temporalSource,
    references,
    references_summary: referencesSummary,
    ...(empty_hint ? { empty_hint } : {}),
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Best-effort fallback when the primary /tables/treatment endpoint
 * returned no rows. Calls tabular_query with the user-friendly
 * "Treatment" prefix; if that resolves to a Treatment_* column the
 * backend will return groups with name + values.
 *
 * The shape mapping here is intentionally narrow: tabular_query
 * groups are aggregate (no per-subject breakdown), so we synthesize
 * one bar per group with subject = group name. This loses subject
 * granularity but at least surfaces the treatment groups visually.
 */
async function tryTabularQueryFallback(
  base: string,
  datasetId: string,
): Promise<{ rows: BackendTreatmentRow[]; columns: string[] } | null> {
  const url =
    `${base}/api/datasets/${encodeURIComponent(datasetId)}` +
    `/tabular_query?variableNameContains=Treatment`;
  interface FallbackGroup {
    name: string;
    count: number;
    values?: number[];
  }
  interface FallbackResponse {
    groups: FallbackGroup[];
    _meta?: { columns?: string[] };
  }
  const res = await fetchJson<FallbackResponse>(url);
  if (isErrorResult(res)) return null;
  const groups = Array.isArray(res.groups) ? res.groups : [];
  if (groups.length === 0) return null;
  // One synthetic row per group: subject = "group:<name>",
  // treatment = group name, no explicit timing.
  const rows: BackendTreatmentRow[] = groups.map((g) => ({
    treatmentName: g.name,
    subjectDocumentIdentifier: `group:${g.name}`,
  }));
  return { rows, columns: res._meta?.columns ?? [] };
}

function pickSubjectLabel(row: BackendTreatmentRow): string | null {
  const s = row.subjectDocumentIdentifier;
  if (typeof s === 'string' && s.length > 0) return s;
  // Forward-compat: some backends may surface `subject` directly.
  const alt = (row as Record<string, unknown>).subject;
  if (typeof alt === 'string' && alt.length > 0) return alt;
  return null;
}

function pickTreatmentLabel(row: BackendTreatmentRow): string | null {
  const t = row.treatmentName;
  if (typeof t === 'string' && t.length > 0) return t;
  // Fall back to stringValue when treatmentName is missing but the
  // value column has a categorical label.
  const sv = row.stringValue;
  if (typeof sv === 'string' && sv.length > 0) return sv;
  return null;
}

/**
 * Try to extract explicit (start, end) from a treatment row. Returns
 * null when no usable temporal info is present — caller falls back to
 * ordinal slot timing.
 *
 * Lookup order:
 *   1. startDate + endDate (or startTime + endTime) — explicit field
 *      pair when the backend surfaces it.
 *   2. numericValue as [start, end] pair (length-2 array)
 *   3. numericValue as scalar (length-1 array OR raw number) — treat
 *      as a point-in-time, synthesize end = start + 1.
 *   4. stringValue as parseable date — single point, end = +1 day.
 */
function extractExplicitTiming(
  row: BackendTreatmentRow,
): { start: number | string; end: number | string } | null {
  // Explicit start+end pair.
  const startField = row.startDate ?? row.startTime;
  const endField = row.endDate ?? row.endTime;
  if (
    (typeof startField === 'string' || typeof startField === 'number') &&
    (typeof endField === 'string' || typeof endField === 'number') &&
    startField !== '' &&
    endField !== ''
  ) {
    return { start: startField, end: endField };
  }

  // numericValue as [start, end] or scalar.
  const nv = row.numericValue;
  if (Array.isArray(nv)) {
    if (nv.length >= 2 && Number.isFinite(nv[0]!) && Number.isFinite(nv[1]!)) {
      return { start: nv[0]!, end: nv[1]! };
    }
    if (nv.length === 1 && Number.isFinite(nv[0]!)) {
      return { start: nv[0]!, end: nv[0]! + 1 };
    }
  } else if (typeof nv === 'number' && Number.isFinite(nv)) {
    return { start: nv, end: nv + 1 };
  }

  // stringValue as parseable date. We try Date.parse — if it returns a
  // finite number, treat as ISO date string and synthesize a 1-day
  // window. We pass the ORIGINAL string back so Plotly's date axis
  // formatter renders it correctly.
  const sv = row.stringValue;
  if (typeof sv === 'string' && sv.length > 0) {
    const parsed = Date.parse(sv);
    if (Number.isFinite(parsed)) {
      const endMs = parsed + 24 * 60 * 60 * 1000; // +1 day
      return { start: sv, end: new Date(endMs).toISOString() };
    }
  }

  return null;
}
