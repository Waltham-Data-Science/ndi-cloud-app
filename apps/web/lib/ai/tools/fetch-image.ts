/**
 * `fetch_image` — pull a 2D image array from an NDI binary document
 * and return chart-ready params + a citation Reference back to the
 * source document.
 *
 * Calls the FastAPI image endpoint shipped in ndi-data-browser-v2's
 * `feat/ndi-python-phase-a` branch:
 *
 *   GET /api/datasets/:id/documents/:docId/image
 *       ?frame=N
 *
 * The backend reuses the existing cloud-download SSRF guard, decodes
 * the bytes via Pillow (TIFF/PNG/JPEG/GIF auto-detect), converts to a
 * 2D grayscale float array, downsamples to a max of 512x512, and
 * returns the array + min/max for Plotly's heatmap colorscale.
 *
 * Targets the microscopy / fluorescence image / patch-encounter map
 * use cases — PIs working with the Haley accept-reject-foraging or
 * Bhar memory datasets WILL ask "show me the patch encounter map"
 * or "show me the cell image".
 *
 * The handler returns:
 *   1. A `chart_payload` object the LLM is taught to echo back into
 *      its response as a fenced code block (```image-chart). The
 *      chat UI intercepts the fence and renders ImageChart.
 *   2. A `references` array citing the source NDI document so the
 *      chip in the answer links to the Document Explorer.
 *
 * The raw image array is STRIPPED from the LLM-facing return — a
 * 512x512 float array is ~1.5 MB of JSON and would blow the context
 * budget. The chart re-fetches the full array client-side on mount.
 */
import { z } from 'zod';

import { makeReference, type Reference } from '../references';
import { baseUrl, fetchJson, isErrorResult, type ToolResult } from './shared';

export const fetchImageInput = z.object({
  datasetId: z.string().min(1, 'datasetId is required'),
  docId: z.string().min(1, 'docId is required'),
  /**
   * Frame index for multi-frame containers (TIFF stack, animated GIF).
   * Default 0 (first frame). Out-of-range values clamp on the backend.
   */
  frame: z.number().int().min(0).max(10_000).optional(),
  /**
   * Optional display title; surfaced as the heatmap chart's caption.
   * When omitted, the chart falls back to the source document's name.
   */
  title: z.string().max(160).optional(),
});

export type FetchImageInput = z.infer<typeof fetchImageInput>;

interface BackendImageSource {
  dataset_id: string;
  document_id: string;
  doc_class: string | null;
  doc_name: string | null;
  filename: string | null;
}

interface BackendImageResponse {
  width: number;
  height: number;
  /**
   * Raw 2D float array — STRIPPED from the LLM-facing result. Lives
   * here only so we can type-check the response shape. The chart
   * re-fetches it client-side.
   */
  data: number[][];
  min: number;
  max: number;
  format: string;
  downsampled: boolean;
  source?: BackendImageSource;
  /** Soft-error envelope when decode fails. */
  error?: string;
  errorKind?: 'notfound' | 'decode' | 'unsupported';
}

/**
 * LLM-facing tool result. The raw `data` array is intentionally
 * absent — the LLM never needs to see 250k+ float cells, and the
 * chart payload alone is enough for the renderer to re-fetch.
 */
export interface FetchImageResult {
  width: number;
  height: number;
  min: number;
  max: number;
  format: string;
  downsampled: boolean;
  source: BackendImageSource;
  /**
   * Compact payload the LLM is instructed to echo back into its
   * response as a fenced code block (```image-chart). The chat UI
   * intercepts that fence and mounts the ImageChart component with
   * these params. The chart re-fetches the array over the network;
   * the round-trip is fast because the backend's cloud-download
   * path is cached at the upstream layer.
   */
  chart_payload: {
    datasetId: string;
    docId: string;
    frame: number;
    title: string;
  };
  references: Reference[];
}

export async function fetchImageHandler(
  input: FetchImageInput,
): Promise<ToolResult<FetchImageResult>> {
  const parsed = fetchImageInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const { datasetId, docId } = parsed.data;
  const frame = parsed.data.frame ?? 0;

  const qs = new URLSearchParams({ frame: String(frame) });
  const url =
    `${base}/api/datasets/${encodeURIComponent(datasetId)}` +
    `/documents/${encodeURIComponent(docId)}/image?${qs.toString()}`;

  const result = await fetchJson<BackendImageResponse>(url);
  if (isErrorResult(result)) return result;

  // Backend soft-error envelope — passes through as a typed tool error
  // so the LLM can communicate it gracefully. The LLM is taught NOT to
  // emit the chart fence when it sees an error result.
  if (result.error) {
    return { error: `Image decode: ${result.error}` };
  }

  const source: BackendImageSource = result.source ?? {
    dataset_id: datasetId,
    document_id: docId,
    doc_class: null,
    doc_name: null,
    filename: null,
  };

  const title =
    parsed.data.title && parsed.data.title.length > 0
      ? parsed.data.title
      : source.doc_name && source.doc_name.length > 0
        ? source.doc_name
        : source.filename && source.filename.length > 0
          ? source.filename
          : `${source.doc_class ?? 'image'} ${docId.slice(-8)}`;

  const reference = makeReference({
    datasetId,
    doc_id: docId,
    class: source.doc_class ?? 'image',
    title,
    snippet:
      `${result.format || 'image'} · ${result.width}x${result.height}` +
      `${result.downsampled ? ' (downsampled)' : ''}` +
      `${source.filename ? ` · ${source.filename}` : ''}`,
  });

  return {
    width: result.width,
    height: result.height,
    min: result.min,
    max: result.max,
    format: result.format,
    downsampled: result.downsampled,
    source,
    chart_payload: {
      datasetId,
      docId,
      frame,
      title,
    },
    references: [reference],
  };
}
