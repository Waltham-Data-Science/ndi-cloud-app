/**
 * `psth` — peri-stimulus time histogram. Joins vmspikesummary spike
 * times with a stimulus_presentation / stimulus_response event train
 * and bins spike counts around each stimulus onset to produce a PSTH.
 *
 * Wraps the FastAPI `/api/datasets/{id}/psth` endpoint added in the
 * followup-gaps spec (Gap #1). The backend does the join + binning
 * + normalization; this handler is a thin pass-through that shapes
 * the response for the workspace panel + the chat fence.
 */
import { z } from 'zod';

import { makeReference, type Reference } from '../references';
import {
  baseUrl,
  isErrorResult,
  logToolInvocation,
  postJson,
  type ToolContext,
  type ToolResult,
} from './shared';

// ──────────────────────────────────────────────────────────────────
// Input schema
// ──────────────────────────────────────────────────────────────────

const HEX_24 = /^[0-9a-fA-F]{24}$/;

export const psthInput = z.object({
  datasetId: z.string().min(1, 'datasetId is required'),
  /**
   * vmspikesummary document id holding the spike train to bin.
   * 24-char hex MongoDB ObjectId.
   */
  unitDocId: z
    .string()
    .regex(HEX_24, 'unitDocId must be a 24-character hex id'),
  /**
   * stimulus_presentation or stimulus_response document id holding the
   * event timestamps to align spikes to.
   */
  stimulusDocId: z
    .string()
    .regex(HEX_24, 'stimulusDocId must be a 24-character hex id'),
  /**
   * Window start (seconds, relative to each stimulus onset). Negative
   * captures spikes BEFORE the onset (baseline). Defaults to -0.5 on
   * the backend side; omit to take the backend default.
   */
  t0: z.number().optional(),
  /** Window end (seconds, relative to each stimulus onset). */
  t1: z.number().optional(),
  /**
   * Bin size in milliseconds. Defaults to 20 ms on the backend (50 Hz
   * temporal resolution — a typical first pass). 10 ms for fast
   * sensory responses; 50 ms when smoothing noisy single units.
   */
  binSizeMs: z.number().positive().optional(),
  /**
   * When true, the backend also returns a `per_trial_raster` —
   * spike times per trial — so the panel can render a raster
   * underlay below the histogram. Skipped by default to keep the
   * wire size bounded.
   */
  includeRaster: z.boolean().optional(),
  /** Display-only — surfaced as the chart title. */
  title: z.string().max(160).optional(),
});

export type PsthInput = z.infer<typeof psthInput>;

// ──────────────────────────────────────────────────────────────────
// Output shape
// ──────────────────────────────────────────────────────────────────

export interface PsthChartPayload {
  kind: 'psth';
  datasetId: string;
  binCenters: number[];
  counts: number[];
  meanRateHz: number[];
  binSizeMs: number;
  t0: number;
  t1: number;
  unitName?: string;
  title?: string;
}

export interface PsthToolResult {
  chart_payload: PsthChartPayload;
  /** Trial count contributing to the histogram. */
  n_trials: number;
  /** Total spikes summed across all trials + bins. */
  n_spikes: number;
  /**
   * Per-trial spike-time raster (each row = one trial's spikes,
   * times relative to that trial's stimulus onset, in seconds).
   * Present only when `includeRaster=true` in the input.
   */
  per_trial_raster?: number[][];
  /**
   * Citations for the unit doc + stimulus doc (two entries when the
   * call succeeded; the LLM is instructed to cite both since the PSTH
   * is a JOIN of the two sources).
   */
  references: Reference[];
  references_summary?: {
    cited: number;
    unit_doc_id: string;
    stimulus_doc_id: string;
  };
  /**
   * Diagnostic surface mirroring backend `error_kind`. Allows the
   * panel + LLM to surface kind-specific copy ("no events in this
   * stimulus doc — try a different class").
   */
  empty_hint?: {
    reason: string;
  };
}

// ──────────────────────────────────────────────────────────────────
// Backend wire shape — matches the FastAPI router's response model
// from `ndi-data-browser-v2/backend/routers/psth.py`.
// ──────────────────────────────────────────────────────────────────

interface BackendPsthResponse {
  bin_centers: number[];
  counts: number[];
  mean_rate_hz: number[];
  n_trials: number;
  n_spikes: number;
  bin_size_ms: number;
  t0: number;
  t1: number;
  unit_name: string;
  unit_doc_id: string;
  stimulus_doc_id: string;
  per_trial_raster?: number[][];
  // Error envelope shape — the backend returns a 200 with both
  // `error` and `error_kind` populated for "expected" failures
  // (no events / decode failed / invalid window), separate from
  // 4xx/5xx for unexpected exceptions.
  error?: string;
  error_kind?:
    | 'invalid_window'
    | 'decode_failed'
    | 'no_events'
    | 'empty_window'
    | 'cloud_unavailable';
}

// ──────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────

const FRIENDLY_ERROR_BY_KIND: Record<string, string> = {
  no_events:
    "The stimulus document doesn't carry event timestamps NDI-python recognizes. Pick a stimulus_presentation or stimulus_response doc with time_started or stim_time fields.",
  decode_failed:
    "Couldn't decode the unit's spike-time data. The vmspikesummary doc may be missing data.vmspikesummary.spike_times (or sample_times).",
  invalid_window:
    'The time window is invalid — t0 must be less than t1.',
  empty_window:
    'No spikes fell inside the [t0, t1] window for any trial. Widen the window or pick a different unit.',
  cloud_unavailable:
    'The NDI cloud service is currently unavailable. Try again in a moment.',
};

export async function psthHandler(
  input: PsthInput,
  ctx?: ToolContext,
): Promise<ToolResult<PsthToolResult>> {
  logToolInvocation('psth', {
    datasetId: input?.datasetId,
    hasUnitDocId: typeof input?.unitDocId === 'string',
    hasStimulusDocId: typeof input?.stimulusDocId === 'string',
    binSizeMs: input?.binSizeMs,
    includeRaster: input?.includeRaster,
  });

  const parsed = psthInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }
  const {
    datasetId,
    unitDocId,
    stimulusDocId,
    t0,
    t1,
    binSizeMs,
    includeRaster,
    title,
  } = parsed.data;

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  // Build the POST body — omit optional fields so the backend's
  // defaults apply (t0=-0.5, t1=1.5, bin_size_ms=20).
  const body: Record<string, unknown> = {
    unit_doc_id: unitDocId,
    stimulus_doc_id: stimulusDocId,
  };
  if (typeof t0 === 'number') body.t0 = t0;
  if (typeof t1 === 'number') body.t1 = t1;
  if (typeof binSizeMs === 'number') body.bin_size_ms = binSizeMs;
  if (includeRaster) body.include_raster = true;

  const url = `${base}/api/datasets/${encodeURIComponent(datasetId)}/psth`;
  const response = await postJson<BackendPsthResponse>(url, body, ctx);
  if (isErrorResult(response)) return response;

  // The backend returns the error envelope under a 200 so it can
  // surface `error_kind` to the UI without losing the shape contract.
  // Translate into our `empty_hint` plus an `error` string so the LLM
  // sees it as a soft-fail it can explain to the user.
  if (response.error_kind || response.error) {
    const kind = response.error_kind ?? '';
    const friendly =
      FRIENDLY_ERROR_BY_KIND[kind] ??
      response.error ??
      'PSTH computation returned no data.';
    // Build a partial result so the panel can still surface
    // references (the unit doc + stimulus doc are still cite-able).
    const partialReferences: Reference[] = [];
    if (response.unit_doc_id) {
      partialReferences.push(
        makeReference({
          datasetId,
          doc_id: response.unit_doc_id,
          class: 'vmspikesummary',
          title: response.unit_name || `Unit ${response.unit_doc_id.slice(-6)}`,
          snippet: 'Spike-train source for the requested PSTH.',
        }),
      );
    }
    if (response.stimulus_doc_id) {
      partialReferences.push(
        makeReference({
          datasetId,
          doc_id: response.stimulus_doc_id,
          class: 'stimulus_presentation',
          title: `Stimulus events ${response.stimulus_doc_id.slice(-6)}`,
          snippet: 'Stimulus onsets used to align the PSTH window.',
        }),
      );
    }
    // Synthesize a minimal chart_payload so the consumer's discriminated
    // union still types — but with empty arrays the chart renders an
    // empty state.
    return {
      chart_payload: {
        kind: 'psth',
        datasetId,
        binCenters: [],
        counts: [],
        meanRateHz: [],
        binSizeMs: typeof binSizeMs === 'number' ? binSizeMs : 20,
        t0: typeof t0 === 'number' ? t0 : -0.5,
        t1: typeof t1 === 'number' ? t1 : 1.5,
        ...(response.unit_name ? { unitName: response.unit_name } : {}),
        ...(title ? { title } : {}),
      },
      n_trials: response.n_trials ?? 0,
      n_spikes: response.n_spikes ?? 0,
      references: partialReferences,
      empty_hint: { reason: friendly },
    };
  }

  // Happy path — shape the chart_payload + references.
  const chart_payload: PsthChartPayload = {
    kind: 'psth',
    datasetId,
    binCenters: response.bin_centers,
    counts: response.counts,
    meanRateHz: response.mean_rate_hz,
    binSizeMs: response.bin_size_ms,
    t0: response.t0,
    t1: response.t1,
    ...(response.unit_name ? { unitName: response.unit_name } : {}),
    ...(title ? { title } : {}),
  };

  const references: Reference[] = [
    makeReference({
      datasetId,
      doc_id: response.unit_doc_id,
      class: 'vmspikesummary',
      title: response.unit_name || `Unit ${response.unit_doc_id.slice(-6)}`,
      snippet: `${response.n_spikes.toLocaleString()} spike${response.n_spikes === 1 ? '' : 's'} across ${response.n_trials} trial${response.n_trials === 1 ? '' : 's'}, binned at ${response.bin_size_ms} ms.`,
    }),
    makeReference({
      datasetId,
      doc_id: response.stimulus_doc_id,
      class: 'stimulus_presentation',
      title: `Stimulus events ${response.stimulus_doc_id.slice(-6)}`,
      snippet: `${response.n_trials} stimulus onset${response.n_trials === 1 ? '' : 's'} aligned to t=0; window [${response.t0}, ${response.t1}]s.`,
    }),
  ];

  return {
    chart_payload,
    n_trials: response.n_trials,
    n_spikes: response.n_spikes,
    ...(response.per_trial_raster
      ? { per_trial_raster: response.per_trial_raster }
      : {}),
    references,
    references_summary: {
      cited: references.length,
      unit_doc_id: response.unit_doc_id,
      stimulus_doc_id: response.stimulus_doc_id,
    },
  };
}
