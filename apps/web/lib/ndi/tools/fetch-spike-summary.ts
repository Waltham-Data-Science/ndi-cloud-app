/**
 * `fetch_spike_summary` — chat-tool layer wrapping the Railway
 * orchestration endpoint at POST /api/datasets/{id}/spike-summary.
 *
 * # Phase 3 (2026-05-14): orchestration moved to Railway/Python
 *
 * Pre-Phase-3 (commits up to `70e9c92`), this handler did the full
 * orchestration on Vercel/Node:
 *   1. Discovery — fetch a single vmspikesummary doc OR run an
 *      ndi-query for matching docs (with unitNameMatch substring filter)
 *   2. Per-unit extraction of spike_times from each doc's JSON body
 *      (with fallback field paths)
 *   3. tWindow filter + stride-sample to 5000 spikes/unit
 *   4. ISI computation: np.diff(np.sort(spike_times)) * 1000ms
 *   5. Build chart_payloads + references
 *
 * Steps 1-4 now live in `backend/services/spike_summary_service.py`
 * on ndb-v2 (commit `eac08c9`). The TS handler shrinks to a thin
 * proxy that:
 *   1. POSTs the input to the Railway endpoint (with auth forwarded
 *      via `postJson` + ctx.authHeaders so private-dataset reads
 *      work from the auth-gated workspace surface)
 *   2. Receives raw `units[]` with already-stride-sampled spike_times
 *      and isi_intervals
 *   3. Decorates with `chart_payloads[]` (the LLM-fence shape) +
 *      `references[]` (citation chips) + `references_summary` +
 *      optional `empty_hint`
 *
 * Output shape preserved: every existing consumer (chat AI SDK,
 * workspace SpikeActivityPanel, code-export generators) sees the
 * same `FetchSpikeSummaryToolResult` they saw pre-Phase-3.
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

const MAX_UNITS_HARD = 50;
const DEFAULT_MAX_UNITS = 10;

export const fetchSpikeSummaryInput = z.object({
  datasetId: z.string().min(1, 'datasetId is required'),
  unitDocId: z.string().min(1).optional(),
  unitNameMatch: z.string().min(1).optional(),
  kind: z.enum(['raster', 'isi_histogram', 'both']),
  tWindow: z.tuple([z.number(), z.number()]).optional(),
  maxUnits: z.number().int().positive().max(MAX_UNITS_HARD).optional(),
  title: z.string().max(160).optional(),
});

export type FetchSpikeSummaryInput = z.infer<typeof fetchSpikeSummaryInput>;

// ──────────────────────────────────────────────────────────────────
// Output shape — what the LLM sees, plus the chart payloads embedded
// for echoing into fenced code blocks.
// ──────────────────────────────────────────────────────────────────

export interface SpikeRasterUnitPayload {
  name: string;
  spikeTimes: number[];
}

export interface SpikeRasterChartPayload {
  kind: 'raster';
  datasetId: string;
  units: SpikeRasterUnitPayload[];
  tWindow?: [number, number];
  title?: string;
}

export interface IsiHistogramChartPayload {
  kind: 'isi_histogram';
  datasetId: string;
  intervals: number[];
  unitName?: string;
  logBins: boolean;
  title?: string;
}

export type SpikeChartPayload =
  | SpikeRasterChartPayload
  | IsiHistogramChartPayload;

export interface FetchSpikeSummaryToolResult {
  kind: 'raster' | 'isi_histogram' | 'both';
  unit_count: number;
  total_spikes: number;
  time_range: { min: number; max: number } | null;
  chart_payloads: SpikeChartPayload[];
  references_summary?: {
    cited: number;
    units_shown: number;
    total_matching: number;
    truncated: boolean;
    cap: number;
  };
  references: Reference[];
  empty_hint?: {
    reason: string;
  };
}

// Raw shape Railway emits (see backend/services/spike_summary_service.py
// SpikeSummaryResponse + SpikeSummaryUnit pydantic models).
interface RawSpikeSummaryUnit {
  name: string;
  doc_id: string;
  spike_times?: number[];
  isi_intervals?: number[];
  error?: string | null;
  error_kind?: string | null;
}

interface RawSpikeSummaryResponse {
  units?: RawSpikeSummaryUnit[];
  total_matching?: number;
  kind?: 'raster' | 'isi_histogram' | 'both';
  error?: string;
  error_kind?: string;
}

export async function fetchSpikeSummaryHandler(
  input: FetchSpikeSummaryInput,
  ctx?: ToolContext,
): Promise<ToolResult<FetchSpikeSummaryToolResult>> {
  logToolInvocation('fetch_spike_summary', {
    datasetId: input?.datasetId,
    kind: input?.kind,
    hasUnitDocId:
      typeof input?.unitDocId === 'string' && input.unitDocId.length > 0,
    hasUnitNameMatch:
      typeof input?.unitNameMatch === 'string' && input.unitNameMatch.length > 0,
    maxUnits: input?.maxUnits,
  });

  const parsed = fetchSpikeSummaryInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }
  const { datasetId, unitDocId, unitNameMatch, kind, tWindow, title } =
    parsed.data;
  const maxUnits = Math.min(
    parsed.data.maxUnits ?? DEFAULT_MAX_UNITS,
    MAX_UNITS_HARD,
  );

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  // Phase 3: Railway service does the discovery + binary extraction +
  // stride-sampling + ISI computation. We POST input + auth and
  // receive raw units back. Same camelCase keys; pydantic populate_by_name
  // accepts the wire format the chat tool already sends.
  const url =
    `${base}/api/datasets/${encodeURIComponent(datasetId)}/spike-summary`;
  const raw = await postJson<RawSpikeSummaryResponse>(
    url,
    { unitDocId, unitNameMatch, kind, tWindow, maxUnits, title },
    ctx,
  );
  if (isErrorResult(raw)) return raw;
  if (raw.error) {
    return {
      kind,
      unit_count: 0,
      total_spikes: 0,
      time_range: null,
      chart_payloads: [],
      references: [],
      empty_hint: { reason: raw.error },
    };
  }

  const units = Array.isArray(raw.units) ? raw.units : [];
  const totalMatching = raw.total_matching ?? units.length;

  // Build references — one chip per unit doc. The chat surface
  // dedupes these; we keep the order Railway gave us so the chart
  // and the chip strip line up.
  const references: Reference[] = units
    .filter((u) => typeof u.doc_id === 'string' && u.doc_id.length > 0)
    .map((u) =>
      makeReference({
        datasetId,
        doc_id: u.doc_id,
        class: 'vmspikesummary',
        title: u.name,
        snippet: `Spike summary for ${u.name}`,
      }),
    );

  // Build chart_payloads. raster is one payload with all units;
  // isi_histogram is one payload with intervals merged across units
  // (matches the pre-Phase-3 chat-side behavior). 'both' emits both.
  const chartPayloads: SpikeChartPayload[] = [];
  let totalSpikes = 0;
  let timeMin: number | null = null;
  let timeMax: number | null = null;
  const wantRaster = kind === 'raster' || kind === 'both';
  const wantIsi = kind === 'isi_histogram' || kind === 'both';

  if (wantRaster) {
    const rasterUnits: SpikeRasterUnitPayload[] = units
      .filter((u) => Array.isArray(u.spike_times) && u.spike_times.length > 0)
      .map((u) => {
        const spikes = u.spike_times ?? [];
        totalSpikes += spikes.length;
        for (const t of spikes) {
          if (!Number.isFinite(t)) continue;
          if (timeMin === null || t < timeMin) timeMin = t;
          if (timeMax === null || t > timeMax) timeMax = t;
        }
        return { name: u.name, spikeTimes: spikes };
      });
    if (rasterUnits.length > 0) {
      const payload: SpikeRasterChartPayload = {
        kind: 'raster',
        datasetId,
        units: rasterUnits,
      };
      if (tWindow) payload.tWindow = tWindow;
      if (title) payload.title = title;
      chartPayloads.push(payload);
    }
  }
  if (wantIsi) {
    const allIsi: number[] = [];
    for (const u of units) {
      if (Array.isArray(u.isi_intervals)) {
        for (const iv of u.isi_intervals) {
          if (Number.isFinite(iv) && iv > 0) allIsi.push(iv);
        }
      }
    }
    if (allIsi.length > 0) {
      const unitName =
        units.length === 1
          ? units[0]?.name
          : `Combined (${units.length} units)`;
      const payload: IsiHistogramChartPayload = {
        kind: 'isi_histogram',
        datasetId,
        intervals: allIsi,
        logBins: true,
        ...(unitName ? { unitName } : {}),
        ...(title ? { title } : {}),
      };
      chartPayloads.push(payload);
    }
  }

  const timeRange =
    timeMin !== null && timeMax !== null
      ? { min: timeMin, max: timeMax }
      : null;

  const result: FetchSpikeSummaryToolResult = {
    kind,
    unit_count: units.length,
    total_spikes: totalSpikes,
    time_range: timeRange,
    chart_payloads: chartPayloads,
    references,
    references_summary: {
      cited: references.length,
      units_shown: units.length,
      total_matching: totalMatching,
      truncated: totalMatching > units.length,
      cap: maxUnits,
    },
  };
  if (units.length === 0) {
    result.empty_hint = {
      reason:
        unitDocId
          ? `No vmspikesummary doc with id "${unitDocId}" in this dataset.`
          : unitNameMatch
            ? `No vmspikesummary docs matched "${unitNameMatch}" in this dataset.`
            : 'No vmspikesummary docs in this dataset.',
    };
  } else if (chartPayloads.length === 0) {
    result.empty_hint = {
      reason:
        kind === 'isi_histogram'
          ? 'Matched units have no ISI intervals (single-spike trains?).'
          : 'Matched units have no spike times — binary may be unreadable.',
    };
  }
  return result;
}
