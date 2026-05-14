/**
 * `fetch_spike_summary` — pull per-unit spike trains from `vmspikesummary`
 * documents and shape them for a spike-raster and/or ISI histogram.
 *
 * Targets the `vmspikesummary` document class — the canonical NDI
 * container for spike trains derived from voltage traces. Each
 * document holds one unit's worth of spike data, typically named
 * after the experimental condition (e.g. "Unit 12 (Saline)").
 *
 * Three discovery modes — pick the cheapest one the user request
 * supports:
 *
 *   1. `unitDocId` — direct fetch of a specific vmspikesummary doc.
 *      Cheapest; use when the LLM has already resolved which unit it
 *      wants (e.g. by chaining from an earlier query_documents call).
 *
 *   2. `unitNameMatch` — substring filter against the doc's
 *      `vmspikesummary.name` field. Useful for "Saline units" /
 *      "CNO units" / "well-isolated single units". Hits the `/api/query`
 *      endpoint with a two-clause structured query.
 *
 *   3. Bare dataset scan — fetches the first N vmspikesummary docs in
 *      the dataset. Useful for "show me a raster from dataset X".
 *
 * The handler returns BOTH:
 *   1. One or two `chart_payload` objects the LLM is taught to echo
 *      back inside fenced code blocks (```spike-raster and/or
 *      ```isi-histogram). The chat UI intercepts those fences and
 *      mounts the SpikeRaster / IsiHistogram components.
 *   2. A `references` array — one per matched vmspikesummary doc.
 *
 * The LLM never sees raw spike-time arrays in its tool result; those
 * live inside `chart_payload` (which IS echoed verbatim by the LLM,
 * but as a single fenced JSON block — the chat UI parses it). The
 * narrative-facing summary only carries unit counts + total-spike
 * counts + time range.
 */
import { z } from 'zod';

import { makeReference, type Reference } from '../references';
import { baseUrl, type ToolResult } from './shared';

const TOOL_TIMEOUT_MS = 12_000; // generous — vmspikesummary docs can be heavy

// Server-side cap on per-call unit count. The chart components also
// cap (SpikeRaster at 50) but the right place to enforce is here so we
// never download more than we'll render.
const MAX_UNITS_HARD = 50;
const DEFAULT_MAX_UNITS = 10;

export const fetchSpikeSummaryInput = z.object({
  datasetId: z.string().min(1, 'datasetId is required'),
  /**
   * Direct vmspikesummary doc ID. When set, the other discovery
   * params (unitNameMatch, maxUnits) are ignored — we fetch this one
   * doc.
   */
  unitDocId: z.string().min(1).optional(),
  /**
   * Substring match against `vmspikesummary.name`. Case-insensitive.
   * Routes through the ndi-query `contains_string` operation.
   */
  unitNameMatch: z.string().min(1).optional(),
  /**
   * Which chart kind(s) to compute:
   *   - "raster"         → spike-raster only
   *   - "isi_histogram"  → ISI histogram only
   *   - "both"           → both charts in one tool call
   */
  kind: z.enum(['raster', 'isi_histogram', 'both']),
  /**
   * Optional time-window restriction (seconds). When set, spike times
   * outside [t0, t1] are filtered out server-side before the chart
   * payload is built.
   */
  tWindow: z.tuple([z.number(), z.number()]).optional(),
  /**
   * Max units to include in the raster. Defaults to 10; capped at 50.
   * Ignored when `unitDocId` is set.
   */
  maxUnits: z.number().int().positive().max(MAX_UNITS_HARD).optional(),
  /** Display-only — surfaced as the chart title. */
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
  /** Number of vmspikesummary docs that contributed. */
  unit_count: number;
  /** Total spikes across all contributing units (post-tWindow filter). */
  total_spikes: number;
  /**
   * Time range across the matched spike trains (seconds). `null` when
   * no spikes / no units matched.
   */
  time_range: { min: number; max: number } | null;
  /**
   * One or two chart payloads depending on `kind`. The LLM is taught
   * to emit each as a fenced code block.
   */
  chart_payloads: SpikeChartPayload[];
  /**
   * Citation coverage metadata. The LLM is taught to disclose the
   * units_shown vs total_matching ratio whenever truncated=true so
   * the user knows the raster/ISI is a sample of available units.
   */
  references_summary?: {
    cited: number;
    units_shown: number;
    total_matching: number;
    truncated: boolean;
    cap: number;
  };
  references: Reference[];
  /**
   * Diagnostic surface for empty results. The LLM is taught to read
   * this and either retry with a different filter or explain to the
   * user that no spike data is available.
   */
  empty_hint?: {
    reason: string;
  };
}

// ──────────────────────────────────────────────────────────────────
// Backend shapes (defensive — fields vary by NDI version).
// ──────────────────────────────────────────────────────────────────

interface BackendDocument {
  id?: string;
  _id?: string;
  ndiId?: string;
  name?: string;
  datasetId?: string;
  dataset?: string;
  className?: string;
  document_class?: { class_name?: string };
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

interface BackendQueryResponse {
  documents: BackendDocument[];
  totalItems: number;
  page: number;
  pageSize: number;
}

interface BackendSingleDocResponse {
  document?: BackendDocument;
  // Some routes return the doc at top level; tolerate both shapes.
  id?: string;
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

// ──────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────

export async function fetchSpikeSummaryHandler(
  input: FetchSpikeSummaryInput,
): Promise<ToolResult<FetchSpikeSummaryToolResult>> {
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

  // ── Discovery ───────────────────────────────────────────────────
  let docs: BackendDocument[];
  // `totalMatching` is the count BEFORE the maxUnits slice — surfaced
  // in references_summary so the LLM can disclose "showed 10 of N
  // units" when the cap was hit.
  let totalMatching = 0;
  if (unitDocId) {
    const fetched = await fetchSingleDoc(base, datasetId, unitDocId);
    if ('error' in fetched) return fetched;
    docs = [fetched.doc];
    totalMatching = 1;
  } else {
    const searchstructure: Array<Record<string, unknown>> = [
      { operation: 'isa', param1: 'vmspikesummary' },
    ];
    if (unitNameMatch) {
      searchstructure.push({
        operation: 'contains_string',
        field: 'vmspikesummary.name',
        param1: unitNameMatch,
      });
    }
    const queried = await runQuery(base, datasetId, searchstructure);
    if ('error' in queried) return queried;
    totalMatching = queried.docs.length;
    docs = queried.docs.slice(0, maxUnits);
  }

  if (docs.length === 0) {
    return {
      kind,
      unit_count: 0,
      total_spikes: 0,
      time_range: null,
      chart_payloads: [],
      references: [],
      empty_hint: {
        reason: unitNameMatch
          ? `No vmspikesummary documents matched name~"${unitNameMatch}" in dataset ${datasetId}`
          : `No vmspikesummary documents in dataset ${datasetId}`,
      },
    };
  }

  // ── Build per-unit spike-train data ────────────────────────────
  const units: SpikeRasterUnitPayload[] = [];
  const references: Reference[] = [];
  let totalSpikes = 0;
  let minT = Number.POSITIVE_INFINITY;
  let maxT = Number.NEGATIVE_INFINITY;

  for (const doc of docs) {
    const docId = pickDocId(doc);
    const name = pickUnitName(doc, docId);
    const rawSpikes = extractSpikeTimes(doc);
    if (!rawSpikes || rawSpikes.length === 0) {
      // Skip docs without parseable spike-time data — they shouldn't
      // happen for vmspikesummary, but the field path varies by NDI
      // version and we want to degrade gracefully.
      continue;
    }
    const filtered = tWindow
      ? rawSpikes.filter((t) => t >= tWindow[0] && t <= tWindow[1])
      : rawSpikes;
    if (filtered.length === 0) continue;

    units.push({ name, spikeTimes: filtered });
    totalSpikes += filtered.length;
    for (const t of filtered) {
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }

    if (references.length < 10 && docId) {
      references.push(
        makeReference({
          datasetId,
          doc_id: docId,
          class: 'vmspikesummary',
          title: name,
          snippet: `${filtered.length.toLocaleString()} spike${filtered.length === 1 ? '' : 's'}${tWindow ? ` in [${tWindow[0]}, ${tWindow[1]}]s` : ''}`,
        }),
      );
    }
  }

  if (units.length === 0) {
    return {
      kind,
      unit_count: 0,
      total_spikes: 0,
      time_range: null,
      chart_payloads: [],
      references,
      empty_hint: {
        reason:
          'Matched vmspikesummary documents had no parseable spike_times array (checked data.vmspikesummary.spike_times, data.vmspikesummary.sample_times)',
      },
    };
  }

  // ── Build chart payloads per `kind` ────────────────────────────
  //
  // The LLM is taught to echo `chart_payloads` verbatim inside a
  // fenced code block. For dense rasters (10 units × 5000 spikes
  // each), the raw arrays balloon to >300 KB of JSON which both
  // exceeds the token budget AND breaks the AI SDK stream when
  // serialized. We stride-sample spike times per unit before they
  // enter the payload — preserves visual density of the raster
  // while keeping the wire size bounded. Each unit caps at 500
  // spikes (Plotly comfortably renders this and the visual shape
  // is preserved for any reasonable spike train).
  const MAX_RASTER_SPIKES_PER_UNIT = 500;
  // ISI histogram: full intervals computed from FULL spike trains
  // (preserves the histogram's statistical accuracy) but then
  // stride-sampled for the payload to bound wire size.
  const MAX_ISI_INTERVALS_PER_PAYLOAD = 5000;
  const chart_payloads: SpikeChartPayload[] = [];
  if (kind === 'raster' || kind === 'both') {
    const sampledUnits: SpikeRasterUnitPayload[] = units.map((u) => ({
      name: u.name,
      spikeTimes: strideSample(u.spikeTimes, MAX_RASTER_SPIKES_PER_UNIT),
    }));
    const rasterPayload: SpikeRasterChartPayload = {
      kind: 'raster',
      datasetId,
      units: sampledUnits,
      ...(tWindow ? { tWindow } : {}),
      ...(title ? { title } : {}),
    };
    chart_payloads.push(rasterPayload);
  }
  if (kind === 'isi_histogram' || kind === 'both') {
    // Server-side compute ISI: diff of sorted spike_times for each
    // unit, then concatenate. ISI returned in MILLISECONDS (raw
    // spike_times are in seconds — multiply by 1000).
    const intervals: number[] = [];
    for (const u of units) {
      const sorted = [...u.spikeTimes].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        const dt = (sorted[i]! - sorted[i - 1]!) * 1000;
        if (Number.isFinite(dt) && dt > 0) intervals.push(dt);
      }
    }
    const sampledIntervals = strideSample(intervals, MAX_ISI_INTERVALS_PER_PAYLOAD);
    const isiPayload: IsiHistogramChartPayload = {
      kind: 'isi_histogram',
      datasetId,
      intervals: sampledIntervals,
      logBins: true,
      ...(units.length === 1 ? { unitName: units[0]!.name } : {}),
      ...(title ? { title } : {}),
    };
    chart_payloads.push(isiPayload);
  }

  return {
    kind,
    unit_count: units.length,
    total_spikes: totalSpikes,
    time_range: Number.isFinite(minT) ? { min: minT, max: maxT } : null,
    chart_payloads,
    references,
    references_summary: {
      cited: references.length,
      units_shown: units.length,
      total_matching: totalMatching,
      truncated: totalMatching > units.length,
      cap: maxUnits,
    },
  };
}

// ──────────────────────────────────────────────────────────────────
// Discovery helpers
// ──────────────────────────────────────────────────────────────────

async function fetchSingleDoc(
  base: string,
  datasetId: string,
  docId: string,
): Promise<{ doc: BackendDocument } | { error: string }> {
  const url = `${base}/api/datasets/${encodeURIComponent(datasetId)}/documents/${encodeURIComponent(docId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      return { error: `Document fetch failed (${res.status})` };
    }
    const body = (await res.json()) as BackendSingleDocResponse;
    // Two valid shapes: {document: {...}} OR a bare BackendDocument.
    const doc = body.document ?? (body as BackendDocument);
    if (!doc || (typeof doc === 'object' && Object.keys(doc).length === 0)) {
      return { error: 'Document fetch returned empty body' };
    }
    return { doc };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { error: `Network timeout (${TOOL_TIMEOUT_MS / 1000}s exceeded)` };
    }
    return { error: `Network error fetching document: ${errMsg(e)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function runQuery(
  base: string,
  datasetId: string,
  searchstructure: Array<Record<string, unknown>>,
): Promise<{ docs: BackendDocument[] } | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/query`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // See ndi-query.ts — Railway's OriginEnforcementMiddleware
        // rejects POST without an allowlisted Origin header.
        Origin: 'https://ndi-cloud.com',
      },
      signal: controller.signal,
      cache: 'no-store',
      body: JSON.stringify({ scope: datasetId, searchstructure }),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const errBody = (await res.json()) as {
          detail?: unknown;
          message?: unknown;
        };
        if (typeof errBody.detail === 'string') detail = errBody.detail;
        else if (typeof errBody.message === 'string') detail = errBody.message;
      } catch {
        // body wasn't JSON
      }
      return {
        error: `Query failed (${res.status}${detail ? `: ${detail}` : ''})`,
      };
    }
    const body = (await res.json()) as BackendQueryResponse;
    return { docs: Array.isArray(body.documents) ? body.documents : [] };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { error: `Network timeout (${TOOL_TIMEOUT_MS / 1000}s exceeded)` };
    }
    return { error: `Network error contacting query service: ${errMsg(e)}` };
  } finally {
    clearTimeout(timer);
  }
}

// ──────────────────────────────────────────────────────────────────
// Field extraction — vmspikesummary field path varies by NDI version
// ──────────────────────────────────────────────────────────────────

/**
 * Extract the spike-times array from a vmspikesummary document.
 *
 * Field-path probe order (most-likely → least-likely):
 *   1. `data.vmspikesummary.spike_times`
 *   2. `data.vmspikesummary.spiketimes`
 *   3. `data.vmspikesummary.sample_times`   ← the schema-canonical name
 *
 * Returns null when no array of numbers is found at any candidate
 * path. Caller handles the empty case by surfacing an `empty_hint`.
 */
function extractSpikeTimes(doc: BackendDocument): number[] | null {
  const data = doc.data;
  if (!data || typeof data !== 'object') return null;
  const inner = (data as Record<string, unknown>).vmspikesummary;
  if (!inner || typeof inner !== 'object') return null;
  const innerObj = inner as Record<string, unknown>;
  for (const key of ['spike_times', 'spiketimes', 'sample_times']) {
    const v = innerObj[key];
    if (Array.isArray(v) && v.length > 0) {
      const nums: number[] = [];
      for (const x of v) {
        if (typeof x === 'number' && Number.isFinite(x)) {
          nums.push(x);
        } else if (typeof x === 'string') {
          const parsed = Number(x);
          if (Number.isFinite(parsed)) nums.push(parsed);
        }
      }
      if (nums.length > 0) return nums;
    }
  }
  return null;
}

function pickDocId(doc: BackendDocument): string {
  return (doc.id ?? doc._id ?? doc.ndiId ?? '').toString();
}

function pickUnitName(doc: BackendDocument, docId: string): string {
  // Prefer the vmspikesummary's own `name` field, then top-level
  // doc.name, then a synthesized name from the doc ID tail.
  const data = doc.data;
  if (data && typeof data === 'object') {
    const inner = (data as Record<string, unknown>).vmspikesummary;
    if (inner && typeof inner === 'object') {
      const n = (inner as Record<string, unknown>).name;
      if (typeof n === 'string' && n.length > 0) return n.slice(0, 80);
    }
  }
  if (typeof doc.name === 'string' && doc.name.length > 0) {
    return doc.name.slice(0, 80);
  }
  return `Unit ${docId.slice(-6)}`;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Stride-sample an array down to `cap` entries while preserving the
 * first + last samples (so the raster's visual envelope stays
 * unchanged). When `arr.length <= cap` returns a shallow copy.
 *
 * Mirrors the backend's `_stride_sample` for the violin chart's
 * jitter overlay (tabular_query_service.py). Used here to bound the
 * spikeTimes / ISI arrays inside `chart_payloads` so the LLM-facing
 * fence body stays under a reasonable token budget — the FULL
 * arrays are still used for ISI bin computation upstream so the
 * histogram remains statistically accurate; only the rendered
 * raster + the visualization payload are downsampled.
 */
function strideSample(arr: number[], cap: number): number[] {
  const n = arr.length;
  if (n <= cap) return [...arr];
  if (cap <= 2) return [arr[0]!, arr[n - 1]!].slice(0, cap);
  const step = (n - 1) / (cap - 1);
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < cap; i++) {
    const idx = Math.round(i * step);
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(arr[idx]!);
  }
  return out;
}
