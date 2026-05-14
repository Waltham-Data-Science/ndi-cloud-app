/**
 * `fetch_signal` — pull a downsampled timeseries from an NDI binary
 * document and return chart-ready arrays + a Reference back to the
 * source document.
 *
 * Calls the FastAPI signal endpoint shipped in ndi-data-browser-v2's
 * `feat/signal-endpoint` branch:
 *
 *   GET /api/datasets/:id/documents/:docId/signal
 *       ?downsample=N
 *       &t0=FLOAT
 *       &t1=FLOAT
 *
 * The backend reuses BinaryService.get_timeseries to decode the binary
 * (NBF / VHSB) and then LTTB-downsamples to a chat-friendly size.
 *
 * The handler returns BOTH:
 *   1. A `chart_payload` object the LLM is taught to echo back into
 *      its response as a fenced code block (```signal-chart). The
 *      chat UI intercepts the fence and renders SignalChart.
 *   2. A `references` array citing the source NDI document so the
 *      chip in the answer links to the Document Explorer.
 *
 * The LLM never sees raw signal arrays — those are huge and would
 * blow the token budget. We strip them from the LLM-facing return,
 * but expose them at the `chart_payload` level for the renderer.
 * Wait, actually the LLM DOES see the arrays — it needs to know the
 * shape to write the fence. Compromise: cap the channels list at
 * names + sample counts; the chart re-fetches the full arrays
 * client-side on mount (cheap second hit; backend cache friendly).
 *
 * Multi-channel responses are FIRST-CLASS — the backend's
 * `channels: {name: [values]}` map already supports them. When the
 * decoded doc has >1 channel (Dabrowska I-V sweeps, electrode arrays,
 * stim+response pairs), the chart renders one trace per channel with
 * an auto color ramp. The LLM can OPTIONALLY include a `colorbar`
 * object in the `chart_payload` it echoes — when present, SignalChart
 * draws a vertical colorbar with the supplied min/max/label/scale.
 */
import { z } from 'zod';

import { makeReference, type Reference } from '../references';
import {
  baseUrl,
  fetchJson,
  isErrorResult,
  logToolInvocation,
  type ToolResult,
} from './shared';

export const fetchSignalInput = z.object({
  datasetId: z.string().min(1, 'datasetId is required'),
  docId: z.string().min(1, 'docId is required'),
  downsample: z.number().int().positive().min(10).max(5000).optional(),
  t0: z.number().optional(),
  t1: z.number().optional(),
  /**
   * Optional file-name selector. Many NDI binary docs carry multiple
   * file refs (e.g. daqreader_mfdaq_epochdata_ingested has channel_list.bin
   * + ai_group1_seg.nbf_1 + …); the default decoder picks the first
   * alphabetically, which is usually metadata not the actual data. The
   * sidecar's `binarySignalExample.filename` field tells the LLM which
   * file to pass for known-good demo docs.
   */
  file: z.string().min(1).optional(),
});

interface BackendSignalSource {
  dataset_id: string;
  document_id: string;
  doc_class: string | null;
  doc_name: string | null;
}

interface BackendSignalResponse {
  channels: Record<string, Array<number | null>>;
  timestamps: number[] | null;
  sample_count: number;
  format: string;
  error: string | null;
  errorKind?: string;
  downsampled?: boolean;
  original_sample_count?: number;
  t0_seconds?: number | null;
  t1_seconds?: number | null;
  source?: BackendSignalSource;
}

/**
 * Optional colorbar metadata the LLM may include in the chart_payload
 * fence body when the decoded doc has multiple monotonically-ordered
 * channels (e.g. injection-current sweeps where each channel name
 * encodes a numeric step). The chart_payload type lets this flow
 * through verbatim from tool result → LLM → fence body → renderer.
 *
 *   scale defaults to 'viridis' (sequential, colorblind-safe). Use
 *   'cool-warm' for diverging data centered on zero (e.g. step from
 *   -20 pA to +60 pA); 'plasma' for an alternative sequential ramp.
 */
export interface ChartPayloadColorbar {
  /** Axis label rendered next to the colorbar, e.g. "Injection (pA)". */
  label: string;
  /** Numeric min of the ramp (bottom of the bar). */
  min: number;
  /** Numeric max of the ramp (top of the bar). */
  max: number;
  /** Colormap. Defaults to viridis. */
  scale?: 'viridis' | 'plasma' | 'cool-warm';
}

/**
 * What we send back to the LLM. The full data arrays are NOT echoed
 * (would blow the context window for any non-trivial trace); we keep
 * just the metadata + the per-channel sample count. The chart
 * payload contains the params the UI needs to re-fetch and render.
 */
export interface FetchSignalResult {
  format: string;
  sample_count: number;
  original_sample_count: number;
  downsampled: boolean;
  t0_seconds: number | null;
  t1_seconds: number | null;
  channels: Array<{ name: string; sample_count: number }>;
  source: BackendSignalSource;
  /**
   * Compact payload the LLM is instructed to echo back into its
   * response as a fenced code block (```signal-chart). The chat UI
   * intercepts that fence and mounts the SignalChart component with
   * these params. The chart re-fetches the data over the network;
   * the round-trip is fast because the backend caches the decoded
   * arrays for the lifetime of the lambda invocation.
   *
   * The LLM is free to ADD a `colorbar` field to this object when it
   * echoes the fence — useful for I-V sweeps and electrode arrays
   * where a perceptual color ramp helps. The renderer treats it as
   * optional; omit for categorical multi-channel data.
   */
  chart_payload: {
    datasetId: string;
    docId: string;
    downsample: number;
    t0?: number;
    t1?: number;
    file?: string;
    title: string;
    colorbar?: ChartPayloadColorbar;
  };
  references: Reference[];
}

export async function fetchSignalHandler(
  input: z.infer<typeof fetchSignalInput>,
): Promise<ToolResult<FetchSignalResult>> {
  logToolInvocation('fetch_signal', {
    datasetId: input?.datasetId,
    docId: input?.docId,
    downsample: input?.downsample,
    hasWindow: input?.t0 !== undefined || input?.t1 !== undefined,
  });
  const parsed = fetchSignalInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const { datasetId, docId } = parsed.data;
  const downsample = parsed.data.downsample ?? 2000;

  const qs = new URLSearchParams({ downsample: String(downsample) });
  if (parsed.data.t0 !== undefined) qs.set('t0', String(parsed.data.t0));
  if (parsed.data.t1 !== undefined) qs.set('t1', String(parsed.data.t1));
  if (parsed.data.file !== undefined) qs.set('file', parsed.data.file);

  const url =
    `${base}/api/datasets/${encodeURIComponent(datasetId)}` +
    `/documents/${encodeURIComponent(docId)}/signal?${qs.toString()}`;

  const result = await fetchJson<BackendSignalResponse>(url);
  if (isErrorResult(result)) return result;

  // Backend soft-error envelope — passes through as a typed tool error
  // so the LLM can communicate it gracefully.
  if (result.error) {
    return { error: `Signal decode: ${result.error}` };
  }

  const source: BackendSignalSource = result.source ?? {
    dataset_id: datasetId,
    document_id: docId,
    doc_class: null,
    doc_name: null,
  };

  const channelEntries = Object.entries(result.channels ?? {}).map(
    ([name, values]) => ({
      name,
      sample_count: Array.isArray(values) ? values.length : 0,
    }),
  );

  const title =
    source.doc_name && source.doc_name.length > 0
      ? source.doc_name
      : `${source.doc_class ?? 'signal'} ${docId.slice(-8)}`;

  const reference = makeReference({
    datasetId,
    doc_id: docId,
    class: source.doc_class ?? 'binary_document',
    title,
    snippet:
      `${result.format || 'binary'} signal · ` +
      `${result.original_sample_count ?? result.sample_count} samples · ` +
      `${channelEntries.length} channel${channelEntries.length === 1 ? '' : 's'}`,
  });

  return {
    format: result.format,
    sample_count: result.sample_count,
    original_sample_count: result.original_sample_count ?? result.sample_count,
    downsampled: Boolean(result.downsampled),
    t0_seconds: result.t0_seconds ?? null,
    t1_seconds: result.t1_seconds ?? null,
    channels: channelEntries,
    source,
    chart_payload: {
      datasetId,
      docId,
      downsample,
      ...(parsed.data.t0 !== undefined && { t0: parsed.data.t0 }),
      ...(parsed.data.t1 !== undefined && { t1: parsed.data.t1 }),
      ...(parsed.data.file !== undefined && { file: parsed.data.file }),
      title,
    },
    references: [reference],
  };
}
