/**
 * `treatment_timeline` — chat-tool layer wrapping the Railway
 * orchestration endpoint at POST /api/datasets/{id}/treatment-timeline.
 *
 * # Phase 3 (2026-05-14): orchestration moved to Railway/Python
 *
 * Pre-Phase-3 (commits up to `70e9c92`), this handler did the full
 * orchestration on Vercel/Node:
 *   1. GET /api/datasets/:id/tables/treatment (primary)
 *   2. Walk rows, build per-subject ordering
 *   3. Fallback to /api/datasets/:id/tabular_query?variableNameContains=Treatment
 *   4. Cap subjects + classify temporal source + build chart payload
 *
 * That logic now lives in `backend/services/treatment_timeline_service.py`
 * on ndb-v2 (commit `93f2887`). The TS handler is a thin proxy that:
 *   1. POSTs the input to the Railway endpoint (with auth forwarded
 *      via `postJson` + ctx.authHeaders so private-dataset reads
 *      work from the auth-gated workspace surface)
 *   2. Decorates the raw response with `chart_payload` (the LLM-fence
 *      shape), `references[]` (citation chips), and
 *      `references_summary` (truncation transparency)
 *   3. Returns the decorated result
 *
 * Output shape preserved: every existing consumer (chat AI SDK,
 * workspace TreatmentTimelinePanel, code-export generators) sees
 * the same `TreatmentTimelineResult` they saw pre-Phase-3.
 */
import { z } from 'zod';

import {
  makeDatasetReference,
  makeReference,
  type Reference,
} from '../references';
import {
  baseUrl,
  isErrorResult,
  logToolInvocation,
  postJson,
  type ToolContext,
  type ToolResult,
} from './shared';

export const treatmentTimelineInput = z.object({
  datasetId: z.string().min(1, 'datasetId is required'),
  /** Optional chart title surfaced into the gantt-chart fence. */
  title: z.string().max(160).optional(),
  /**
   * Max distinct subjects in the chart. Default 30, hard-cap 100 —
   * beyond that the chart becomes a wall of bars and Plotly's row
   * sizing chokes the chat panel. The Railway endpoint enforces the
   * same cap; we re-validate here so a malformed input surfaces a
   * client-side error before the network roundtrip.
   */
  maxSubjects: z.number().int().positive().max(100).optional(),
});

export type TreatmentTimelineInput = z.infer<typeof treatmentTimelineInput>;

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
  available_columns?: string[];
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
   * "explicit"  → backend rows carried real timestamps / start-end pairs
   * "ordinal"   → start/end synthesized as [i, i+1] per subject because
   *                no row carried temporal info. The LLM should mention
   *                this caveat in prose.
   * "mixed"     → some rows had explicit timing, some didn't.
   */
  temporal_source: 'explicit' | 'ordinal' | 'mixed';
  references: Reference[];
  /**
   * Citation coverage metadata. When truncated=true, the LLM is
   * taught to disclose cited-vs-total subject count.
   */
  references_summary: {
    cited: number;
    total_subjects: number;
    total_treatments: number;
    truncated: boolean;
    cap: number;
  };
  /** Present ONLY when both backend paths returned zero rows. */
  empty_hint?: TreatmentTimelineEmptyHint;
}

/** Raw shape Railway emits. The chart_payload + references decoration
 *  happens entirely in TS — Python is purely the science layer. */
interface RawTreatmentTimelineResponse {
  datasetId?: string;
  title?: string;
  items?: TreatmentTimelineItem[];
  total_subjects?: number;
  total_treatments?: number;
  temporal_source?: 'explicit' | 'ordinal' | 'mixed';
  empty_hint?: TreatmentTimelineEmptyHint;
  /** Backend-side `{error, error_kind}` envelope (never sets HTTP 500). */
  error?: string;
  error_kind?: string;
}

/** Cap on distinct-subject citation chips. 20 was the pre-Phase-3
 *  default — chosen so the citation panel doesn't overflow the chat
 *  viewport. The chart itself can show more bars; this only caps the
 *  chip list. */
const MAX_SUBJECT_REFS = 20;

export async function treatmentTimelineHandler(
  input: TreatmentTimelineInput,
  ctx?: ToolContext,
): Promise<ToolResult<TreatmentTimelineResult>> {
  logToolInvocation('treatment_timeline', {
    datasetId: input?.datasetId,
    maxSubjects: input?.maxSubjects,
  });

  const parsed = treatmentTimelineInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }
  const { datasetId, title, maxSubjects } = parsed.data;
  const cap = maxSubjects ?? 30;

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  // Phase 3: Railway service does the orchestration (cloud /tables/
  // treatment primary + tabular_query fallback + per-subject ordering
  // + temporal_source classification). We POST the input + auth and
  // get back raw items.
  const url =
    `${base}/api/datasets/${encodeURIComponent(datasetId)}/treatment-timeline`;
  const raw = await postJson<RawTreatmentTimelineResponse>(
    url,
    { title, maxSubjects: cap },
    ctx,
  );
  if (isErrorResult(raw)) return raw;
  if (raw.error) return { error: raw.error };

  const items = Array.isArray(raw.items) ? raw.items : [];
  const totalSubjects = raw.total_subjects ?? 0;
  const totalTreatments = raw.total_treatments ?? 0;
  const temporalSource: TreatmentTimelineResult['temporal_source'] =
    raw.temporal_source ?? 'ordinal';

  // Build the citation list. The Railway response intentionally returns
  // subject LABELS only (not doc IDs) — there's an open upstream-ask to
  // surface source doc IDs so we can deep-link to each subject. Until
  // that lands, we cite the dataset overview + emit one ref per distinct
  // subject pointing at the dataset's subject table (so the citation
  // chip opens the table view where the user can locate the subject by
  // name). Capped at MAX_SUBJECT_REFS to keep the chip strip tidy.
  const references: Reference[] = [
    makeDatasetReference({
      datasetId,
      title: title ?? 'Treatment timeline',
      snippet: 'Cross-subject treatment schedule for this dataset.',
    }),
  ];
  const distinctSubjects = Array.from(new Set(items.map((it) => it.subject)));
  for (const subject of distinctSubjects.slice(0, MAX_SUBJECT_REFS - 1)) {
    references.push(
      makeReference({
        datasetId,
        doc_id: `subject:${subject}`,
        class: 'subject',
        title: subject,
        snippet: `Subject in ${datasetId}`,
      }),
    );
  }

  const result: TreatmentTimelineResult = {
    chart_payload: {
      datasetId,
      title,
      xLabel: temporalSource === 'explicit' ? 'Time' : 'Treatment slot',
      items,
    },
    total_subjects: totalSubjects,
    total_treatments: totalTreatments,
    temporal_source: temporalSource,
    references,
    references_summary: {
      cited: references.length,
      total_subjects: totalSubjects,
      total_treatments: totalTreatments,
      truncated: distinctSubjects.length > MAX_SUBJECT_REFS - 1,
      cap: MAX_SUBJECT_REFS,
    },
  };
  if (raw.empty_hint) result.empty_hint = raw.empty_hint;
  return result;
}
