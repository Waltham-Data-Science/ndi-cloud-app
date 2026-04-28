'use client';

/**
 * Binary blob hooks — timeseries, image, video, fitcurve. Ported verbatim
 * from `ndi-data-browser-v2/frontend/src/api/binary.ts`.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, apiFetchBinary, type BinaryFetchResult } from './client';
import { useDocuments, type DocumentSummary } from './documents';

export type BinaryKind = 'timeseries' | 'image' | 'video' | 'fitcurve' | 'unknown';

export function useBinaryKind(
  datasetId: string | undefined,
  documentId: string | undefined,
) {
  return useQuery({
    queryKey: ['binary-kind', datasetId, documentId],
    queryFn: () =>
      apiFetch<{ kind: BinaryKind }>(
        `/api/datasets/${datasetId}/documents/${documentId}/data/type`,
      ),
    enabled: !!datasetId && !!documentId,
  });
}

/** v1-compatible TimeseriesData shape. Locked by
 * `backend/services/binary_service.py` + `test_binary_shape.py`. */
export interface TimeseriesData {
  channels: Record<string, Array<number | null>>;
  timestamps?: number[] | null;
  sample_count: number;
  format: string;
  error?: string | null;
  /** Machine-readable hint the frontend maps to a friendly message. */
  errorKind?: string | null;
}

export function useTimeseries(
  datasetId: string,
  documentId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['binary', 'timeseries', datasetId, documentId],
    queryFn: () =>
      apiFetch<TimeseriesData>(
        `/api/datasets/${datasetId}/documents/${documentId}/data/timeseries`,
      ),
    enabled,
  });
}

export interface ImageData {
  dataUri: string;
  width: number;
  height: number;
  mode?: string;
  nFrames?: number;
  format?: string;
  error?: string | null;
}

export function useImageData(
  datasetId: string,
  documentId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['binary', 'image', datasetId, documentId],
    queryFn: () =>
      apiFetch<ImageData>(
        `/api/datasets/${datasetId}/documents/${documentId}/data/image`,
      ),
    enabled,
  });
}

export interface VideoData {
  url: string;
  contentType: string;
  error?: string | null;
}

export function useVideoUrl(
  datasetId: string,
  documentId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['binary', 'video', datasetId, documentId],
    queryFn: () =>
      apiFetch<VideoData>(
        `/api/datasets/${datasetId}/documents/${documentId}/data/video`,
      ),
    enabled,
  });
}

export interface FitcurveData {
  form: string;
  parameters: number[];
  x: number[];
  y: number[];
  error?: string | null;
}

export function useFitcurve(
  datasetId: string,
  documentId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['binary', 'fitcurve', datasetId, documentId],
    queryFn: () =>
      apiFetch<FitcurveData>(
        `/api/datasets/${datasetId}/documents/${documentId}/data/fitcurve`,
      ),
    enabled,
  });
}

// ---------------------------------------------------------------------------
// Raw imageStack frames (browser-side canvas decode)
// ---------------------------------------------------------------------------
//
// The /data/image endpoint runs PIL on the server, which can't decode the
// raw uint8 frame stacks NDI ships for some imageStack documents (e.g. the
// C. elegans dataset's frame stacks): PIL surfaces `BINARY_DECODE_FAILED`
// and the user lands on the friendly fallback.
//
// `ndi-data-browser-v2` PR #106 adds a sibling route `/data/raw` that
// streams the S3 bytes verbatim with `Content-Type: application/octet-stream`
// and headers `X-NDI-Doc-Id` / `X-NDI-Class-Name`. The browser-side decode
// reads the byte layout from the doc's `imageStack_parameters` sidecar
// (a separate document of class `imageStack_parameters` whose `depends_on`
// references the imageStack via `imageStack_id`) and paints frames onto a
// canvas — sidestepping PIL entirely.

/**
 * Hook returning the raw octet-stream bytes for an imageStack document.
 * Caller is responsible for knowing the byte layout (via the sibling
 * `useImageStackParameters` hook).
 *
 * Cache key intentionally distinct from `useImageData` (`['binary', 'image', ...]`)
 * so the two endpoints don't fight over the same key when a doc is
 * routed through the canvas path one render and the PIL path another.
 *
 * Default 60s timeout because raw frame stacks can be tens of MB on
 * the wire — Railway cold-start + a 50MB S3 fetch can blow past the
 * 15s read timeout that's tuned for JSON responses.
 */
const RAW_FETCH_TIMEOUT_MS = 60_000;

export function useRawImageData(
  datasetId: string | undefined,
  documentId: string | undefined,
  enabled: boolean,
) {
  return useQuery<BinaryFetchResult>({
    queryKey: ['binary', 'raw', datasetId, documentId],
    queryFn: ({ signal }) =>
      apiFetchBinary(
        `/api/datasets/${datasetId}/documents/${documentId}/data/raw`,
        { signal, timeoutMs: RAW_FETCH_TIMEOUT_MS },
      ),
    enabled: enabled && !!datasetId && !!documentId,
    // Don't refetch on focus — these blobs are large and the bytes
    // don't change once written by the dataset author.
    staleTime: 10 * 60 * 1000,
    retry: 0,
  });
}

/**
 * Sidecar metadata shape for the `imageStack_parameters` partner doc.
 * Lifted verbatim from the NDI schema (`imageStack_parameters.json`):
 *
 *   - `dimension_size`: `[H, W, C, Z, T]` — height, width, channel,
 *     z-slice, time. Channel is the C-major axis when interleaved RGB
 *     ships in `dimension_order: 'YXCZT'`.
 *   - `dimension_order`: which axis varies fastest in the byte layout.
 *     Default `YXCZT` matches MATLAB column-major output where pixel
 *     bytes appear `[y0,x0,c0..cN, y0,x1,c0..cN, ...]`.
 *   - `data_type`: backing scalar type — `'uint8'` is the only path the
 *     v1 canvas decode handles natively. `'uint16'` / `'logical'` /
 *     `'double'` are deferred (need window/level sliders for proper
 *     display range mapping).
 *   - `data_limits`: `[min, max]` — the dataset author's preferred
 *     display range. Used by uint16/float32 paths in the v2 follow-up;
 *     uint8 ignores it because the byte values *are* the display
 *     intensities.
 */
export interface ImageStackParameters {
  dimension_size: [number, number, number, number, number];
  dimension_order: string;
  data_type: 'uint8' | 'uint16' | 'logical' | 'double' | string;
  data_limits: [number, number];
}

/**
 * Locate the `imageStack_parameters` sibling doc that depends on the
 * given imageStack ndiId, parse its `data.imageStack_parameters` block,
 * and return it.
 *
 * The link convention is `depends_on[].name === 'imageStack_id'` with
 * `value === <imageStackNdiId>`. This mirrors the openminds_subject
 * convention (`subject_id`) used in
 * `components/app/OpenmindsSubjectTableView.tsx`.
 *
 * Returns `null` when no partner doc resolves — DataPanel falls back to
 * the existing PIL `/data/image` path in that case so non-imageStack
 * image-class docs (and any imageStack lacking a sidecar) still work.
 */
export function useImageStackParameters(
  datasetId: string | undefined,
  imageStackNdiId: string | undefined,
  enabled: boolean,
) {
  // Pull in the parameters docs from the documents endpoint. The class
  // is small (one row per imageStack) so a single page suffices for
  // typical datasets; if a dataset ships >500 imageStacks we'd grow
  // this to useDocumentsInfinite, but that's not the shape of
  // anything in production today.
  const partnerQuery = useDocuments(
    enabled && imageStackNdiId ? datasetId : undefined,
    'imageStack_parameters',
    1,
    500,
  );

  const params = useMemo<ImageStackParameters | null>(() => {
    if (!enabled || !imageStackNdiId || !partnerQuery.data) return null;
    const partner = pickImageStackPartner(
      partnerQuery.data.documents,
      imageStackNdiId,
    );
    if (!partner) return null;
    return extractImageStackParameters(partner);
  }, [enabled, imageStackNdiId, partnerQuery.data]);

  return {
    params,
    isLoading: partnerQuery.isLoading,
    isError: partnerQuery.isError,
    error: partnerQuery.error,
  };
}

/**
 * Filter helper — find the `imageStack_parameters` doc whose
 * `data.depends_on[]` carries `{ name: 'imageStack_id', value: ndiId }`.
 *
 * The `depends_on` field can be an array OR a single object (NDI's
 * MATLAB-origin schema sometimes collapses single-entry lists), so we
 * normalize through `Array.isArray ? raw : [raw]` first — same approach
 * as `pickDependencyValue` in OpenmindsSubjectTableView.
 */
export function pickImageStackPartner(
  partners: DocumentSummary[],
  imageStackNdiId: string,
): DocumentSummary | null {
  for (const doc of partners) {
    const data = (doc.data ?? {}) as Record<string, unknown>;
    const raw = data.depends_on;
    if (!raw) continue;
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const dep of arr) {
      if (!dep || typeof dep !== 'object') continue;
      const name = (dep as Record<string, unknown>).name;
      const value = (dep as Record<string, unknown>).value;
      if (name === 'imageStack_id' && value === imageStackNdiId) {
        return doc;
      }
    }
  }
  return null;
}

/**
 * Read `data.imageStack_parameters` off a partner doc and validate it
 * has the four fields the canvas decoder relies on. Returns `null`
 * when any field is missing — the caller falls back to the PIL path.
 *
 * Defensive but not strict: e.g., we don't validate `dimension_size`
 * is exactly five integers (callers handle a partial size gracefully:
 * a 3-element size means single-frame, single-channel — the decoder
 * defaults Z and T to 1 in that case). The strictness lives in the
 * decoder itself where it can fail with an actionable error message.
 */
export function extractImageStackParameters(
  partner: DocumentSummary,
): ImageStackParameters | null {
  const data = (partner.data ?? {}) as Record<string, unknown>;
  const params = data.imageStack_parameters;
  if (!params || typeof params !== 'object') return null;
  const p = params as Record<string, unknown>;

  const sizeRaw = p.dimension_size;
  if (!Array.isArray(sizeRaw) || sizeRaw.length === 0) return null;
  const dimension_size: [number, number, number, number, number] = [
    Number(sizeRaw[0]) || 0,
    Number(sizeRaw[1]) || 0,
    Number(sizeRaw[2]) || 1,
    Number(sizeRaw[3]) || 1,
    Number(sizeRaw[4]) || 1,
  ];
  if (dimension_size[0] <= 0 || dimension_size[1] <= 0) return null;

  const dimension_order =
    typeof p.dimension_order === 'string' && p.dimension_order
      ? p.dimension_order
      : 'YXCZT';
  const data_type =
    typeof p.data_type === 'string' && p.data_type ? p.data_type : 'uint8';

  const limitsRaw = p.data_limits;
  let data_limits: [number, number] = [0, 255];
  if (Array.isArray(limitsRaw) && limitsRaw.length >= 2) {
    data_limits = [Number(limitsRaw[0]) || 0, Number(limitsRaw[1]) || 255];
  }

  return { dimension_size, dimension_order, data_type, data_limits };
}
