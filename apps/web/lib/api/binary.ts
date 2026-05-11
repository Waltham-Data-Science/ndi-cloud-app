'use client';

/**
 * Binary blob hooks — timeseries, image, video, fitcurve. Ported verbatim
 * from `ndi-data-browser-v2/frontend/src/api/binary.ts`.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, apiFetchBinary, type BinaryFetchResult } from './client';
import { useDocuments, type DocumentSummary } from './documents';
import { RAW_FETCH_TIMEOUT_MS } from './timeouts';

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
// RAW_FETCH_TIMEOUT_MS lives in `./timeouts.ts` (post-cutover sweep).

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
 * Sidecar metadata shape for the `imageStack_parameters` block.
 *
 *   - `dimension_size`: variable-length array of axis sizes — its
 *     interpretation depends on `dimension_order`. Production data
 *     ships 2-D (`YX`), 3-D (`YXT` / `YXC`), and 5-D (`YXCZT`) shapes;
 *     consumers should run the size + order pair through
 *     `parseDimensions` (`@/lib/imageStack/dimensions`) to get a
 *     canonical `{H, W, C, Z, T}` record.
 *   - `dimension_order`: axis-letter string (`'Y'` row, `'X'` col,
 *     `'C'` channel, `'Z'` z-slice, `'T'` time). Common values:
 *     `'YX'`, `'YXT'`, `'YXCZT'`.
 *   - `data_type`: backing scalar type — `'uint8'` is the only one the
 *     v1 canvas decode handles natively. `'uint16'` / `'logical'` /
 *     `'double'` fall through to the PIL pipeline.
 *   - `data_limits`: `[min, max]` — the dataset author's preferred
 *     display range. Used by uint16/float32 paths in the v2 follow-up.
 */
export interface ImageStackParameters {
  dimension_size: number[];
  dimension_order: string;
  data_type: 'uint8' | 'uint16' | 'logical' | 'double' | string;
  data_limits: [number, number];
}

/**
 * Resolve `imageStack_parameters` for an imageStack document.
 *
 * **Inline-first** (primary codepath in production):
 * Production imageStacks carry the parameters block directly under
 * `imageStackDoc.data.imageStack_parameters`. We extract from the doc
 * itself and skip the partner-class round-trip. This matches every
 * dataset in production today (Bhar `69bc5ca1...` and Haley
 * `682e7772...`); PR #135's partner-doc-only lookup never resolved
 * anything because no production dataset ships sibling
 * `imageStack_parameters` docs.
 *
 * **Partner-doc fallback** (preserved codepath):
 * If the doc has no inline parameters block, fall back to looking
 * for a sibling `imageStack_parameters` doc whose
 * `depends_on[].name === 'imageStack_id'`. This pathway exists for
 * hypothetical future datasets that ship sibling docs; no production
 * dataset uses it today.
 *
 * Returns `{ params: null, ... }` when neither path resolves —
 * DataPanel falls back to the PIL `/data/image` path or, for video
 * formats, the new `<video>` viewer.
 */
export function useImageStackParameters(
  datasetId: string | undefined,
  imageStackDoc: DocumentSummary | undefined,
  enabled: boolean,
) {
  // First, try the inline path. If it resolves, we don't need to
  // fire the partner-class query at all (saving a network round-trip
  // on the Haley dataset's 7000+ imageStacks).
  const inlineParams = useMemo<ImageStackParameters | null>(() => {
    if (!enabled || !imageStackDoc) return null;
    const data = (imageStackDoc.data ?? {}) as Record<string, unknown>;
    if (!data.imageStack_parameters) return null;
    return extractImageStackParameters(imageStackDoc);
  }, [enabled, imageStackDoc]);

  // Determine whether to run the partner-doc query. We skip it when
  // either (a) we already have inline params, or (b) the consumer
  // disabled the hook. Otherwise the query fires — same shape as
  // the original PR #135 path.
  const partnerEnabled =
    enabled && !!imageStackDoc?.ndiId && inlineParams === null;
  const partnerQuery = useDocuments(
    partnerEnabled ? datasetId : undefined,
    'imageStack_parameters',
    1,
    500,
  );

  const partnerParams = useMemo<ImageStackParameters | null>(() => {
    if (!partnerEnabled || !imageStackDoc?.ndiId || !partnerQuery.data) {
      return null;
    }
    const partner = pickImageStackPartner(
      partnerQuery.data.documents,
      imageStackDoc.ndiId,
    );
    if (!partner) return null;
    return extractImageStackParameters(partner);
    // React Compiler prefers a single object dep over chained
    // optional-chain accessors; widening to `imageStackDoc` matches
    // the inferred dependency and unblocks compilation.
  }, [partnerEnabled, imageStackDoc, partnerQuery.data]);

  const params = inlineParams ?? partnerParams;

  return {
    params,
    // Inline path resolves synchronously, so loading/error reduce to
    // the partner query's state — and only when we'd actually run it.
    isLoading: partnerEnabled ? partnerQuery.isLoading : false,
    isError: partnerEnabled ? partnerQuery.isError : false,
    error: partnerEnabled ? partnerQuery.error : null,
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
 * Read `data.imageStack_parameters` off a doc (inline-first path) or
 * partner doc (legacy path) and surface the four fields the canvas
 * decoder + format router rely on. Returns `null` when the parameters
 * block is missing — caller falls back to the PIL or video pipeline.
 *
 * `dimension_size` is preserved as the raw array (variable length).
 * Consumers run it through `parseDimensions(order, size)` to canonicalize
 * to `{H, W, C, Z, T}`. We accept any non-empty numeric array here and
 * defer the H/W positivity check to the parser, which has clearer
 * error semantics and can return null for the "shape doesn't make
 * sense" case in one place.
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
  // Coerce to numbers but preserve the array length — `parseDimensions`
  // uses `order.length === size.length` as a sanity check, so we can't
  // pad to a fixed shape here without losing that invariant.
  const dimension_size: number[] = sizeRaw.map((v) => Number(v) || 0);

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
