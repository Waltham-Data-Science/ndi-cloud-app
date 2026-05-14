'use client';

import { Activity, FileWarning, ImageIcon, LineChart, Video } from 'lucide-react';
import dynamic from 'next/dynamic';

// Import ApiError from its definition site (`./errors`) rather than the
// `./client` re-export, because tests that mock `@/lib/api/client` may
// not surface ApiError on the mock — going to the source avoids that
// trap (and is faster: no re-export indirection at runtime).
import { ApiError } from '@/lib/api/errors';
import {
  useBinaryKind,
  useFitcurve,
  useImageData,
  useImageStackParameters,
  useRawImageData,
  useTimeseries,
  useVideoUrl,
} from '@/lib/api/binary';
import { useDocument } from '@/lib/api/documents';
import {
  isRawBytesFormat,
  isVideoFormat,
} from '@/lib/imageStack/format';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

import { ImageStackCanvasViewer, ImageViewer } from '@/components/ndi/media/ImageViewer';
import { ImageStackVideoViewer } from './ImageStackVideoViewer';
import { VideoPlayer } from '@/components/ndi/media/VideoPlayer';

// CQ5: Dynamic imports for the uPlot-backed chart components. uPlot is
// the largest single asset in this view (~30 KB gz with the CSS), and
// most users hitting a dataset detail page don't open the binary
// preview at all. Splitting them out keeps the main app bundle smaller;
// the chart chunk loads only when DataPanel decides to render one.
//
// `ssr: false` because uPlot touches `window`/`document` on construct
// and we never want the chart to attempt to render on the server.
const TimeseriesChart = dynamic(
  () => import('@/components/ndi/charts/TimeseriesChart').then((m) => ({ default: m.TimeseriesChart })),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);
const FitcurveChart = dynamic(
  () => import('@/components/ndi/charts/FitcurveChart').then((m) => ({ default: m.FitcurveChart })),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> },
);

interface DataPanelProps {
  datasetId: string;
  documentId: string;
}

/**
 * Unified binary-data viewer. Dispatches on the backend's `detect_kind()`
 * result:
 *
 * - `timeseries` → TimeseriesChart (uPlot)
 * - `image` → ImageViewer (raster + frame stepper + zoom)
 * - `video` → VideoPlayer (HTML5 native controls)
 * - `fitcurve` → FitcurveChart (uPlot of evaluated parametric curve)
 * - `unknown` → renders nothing (caller's Files section shows the raw links)
 *
 * All child components handle their own error shape; this wrapper only
 * shows the type-detection skeleton.
 */
export function DataPanel({ datasetId, documentId }: DataPanelProps) {
  // CQ5: removed dead `setImageFrame` state. Previously DataPanel held
  // a destructured-setter `[, setImageFrame] = useState(...)` and wired
  // it as `<ImageViewer onFrameChange={setImageFrame}>` for "eventual"
  // upstream refetch, but the value side was never read and the
  // refetch wiring never landed — every onFrameChange call was a no-op
  // upstream. ImageViewer tracks the frame internally; without a
  // consumer there's nothing for the parent to do here.
  const { data: kindInfo, isLoading: kindLoading } = useBinaryKind(datasetId, documentId);
  const kind = kindInfo?.kind ?? 'unknown';

  const isTimeseries = kind === 'timeseries';
  const isImage = kind === 'image';
  const isVideo = kind === 'video';
  const isFitcurve = kind === 'fitcurve';

  // Doc-level fetch — needed to detect class `imageStack`, surface
  // inline `imageStack_parameters`, and read the `formatOntology` that
  // routes us between video / canvas / PIL. Only enabled on the image
  // branch (the document-detail page already fetches the same doc, so
  // this is a TanStack-Query cache hit in the common path).
  const docDetail = useDocument(
    isImage ? datasetId : undefined,
    isImage ? documentId : undefined,
  );
  const isImageStack = isImage && docDetail.data?.className === 'imageStack';

  // Resolve `imageStack_parameters`. The hook is inline-first: it
  // pulls the parameters block off the doc itself (the production
  // pathway — see binary.ts) and only falls back to a partner-class
  // query when the inline block is absent. We pass the full doc so
  // the inline path is reachable; pre-fix this took only `ndiId` and
  // never resolved on production data.
  const stackParams = useImageStackParameters(
    datasetId,
    isImageStack ? docDetail.data : undefined,
    isImageStack,
  );

  // `formatOntology` lives under `data.imageStack` on the doc itself.
  // We use it to route between the video viewer (MP4 container), the
  // PIL pipeline (PNG / TIFF / similar), and the canvas decode (raw
  // byte stack). See `lib/imageStack/format.ts` for the allowlist.
  const docData = docDetail.data?.data as
    | { imageStack?: { formatOntology?: string } }
    | undefined;
  const formatOntology = docData?.imageStack?.formatOntology;

  // Three render modes for an imageStack doc:
  //   - 'video'  → ImageStackVideoViewer against /data/raw (Bhar MP4)
  //   - 'canvas' → ImageStackCanvasViewer against /data/raw (raw bytes)
  //   - 'pil'    → existing /data/image PIL pipeline (PNG, TIFF, etc.)
  //
  // Default is 'pil' when the format ontology isn't recognized — that
  // preserves existing behavior for the long tail of unobserved values
  // (Haley dataset's PNGs land here).
  const isVideo_ImageStack = isImageStack && isVideoFormat(formatOntology);
  const isRawBytes_ImageStack =
    isImageStack &&
    isRawBytesFormat(formatOntology) &&
    stackParams.params?.data_type === 'uint8';

  // Raw bytes for the canvas decode. Cache key is distinct from the
  // PIL path's so the two endpoints don't fight over a key.
  const raw = useRawImageData(datasetId, documentId, isRawBytes_ImageStack);

  const ts = useTimeseries(datasetId, documentId, isTimeseries);
  // PIL `/data/image` is enabled only when we know we're not going
  // through the video / canvas paths. The dependent gate:
  //
  //   - If kind isn't image → never fire PIL.
  //   - If kind is image but the doc-class lookup is still in flight →
  //     wait. Otherwise we'd fire PIL on every imageStack while the
  //     format ontology + parameters are racing.
  //   - If image AND not imageStack → fire PIL (no special routing).
  //   - If imageStack AND format ontology is video → never fire PIL
  //     (the `<video>` viewer streams /data/raw directly).
  //   - If imageStack AND format ontology is raw bytes (and uint8) →
  //     never fire PIL (canvas decode handles it).
  //   - If imageStack AND format is anything else → fire PIL. This
  //     includes Haley-style PNG / TIFF and unknown ontologies — PIL
  //     handles known image formats; unknown gets the friendly
  //     "preview not supported" fallback via BINARY_DECODE_FAILED.
  //   - If imageStack AND parameter lookup still in flight → wait,
  //     because `isRawBytes_ImageStack` depends on `data_type` which
  //     comes from the params.
  const docResolved = !!docDetail.data || docDetail.isError;
  const paramsSettled =
    !isImageStack || stackParams.params !== null || !stackParams.isLoading;
  const enableImg =
    isImage &&
    !isVideo_ImageStack &&
    !isRawBytes_ImageStack &&
    docResolved &&
    paramsSettled;
  const img = useImageData(datasetId, documentId, enableImg);
  const vid = useVideoUrl(datasetId, documentId, isVideo);
  const fit = useFitcurve(datasetId, documentId, isFitcurve);

  const tsData = ts.data;
  const imgData = img.data;
  const vidData = vid.data;
  const fitData = fit.data;

  if (kindLoading) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (kind === 'unknown') {
    return null;
  }

  const Icon = isTimeseries ? Activity : isImage ? ImageIcon : isVideo ? Video : LineChart;
  const label = isTimeseries
    ? `Timeseries${tsData?.format ? ` (${tsData.format.toUpperCase()})` : ''}`
    : isImage
      ? 'Image'
      : isVideo
        ? 'Video'
        : 'Fit curve';

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-xs font-medium flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardBody className="pt-0">
        {isTimeseries &&
          (ts.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : ts.isError ? (
            <BinaryFetchError error={ts.error} kindLabel="timeseries" />
          ) : tsData ? (
            <TimeseriesChart data={tsData} />
          ) : null)}
        {isImage && (
          isVideo_ImageStack ? (
            // Video container path (Bhar MP4 imageStacks). Native
            // `<video>` element streams /data/raw; the companion
            // backend PR adds Range support + Content-Type sniffing.
            // No params / raw-bytes wait — the `<video>` element does
            // its own loading.
            <ImageStackVideoViewer
              datasetId={datasetId}
              documentId={documentId}
            />
          ) : isRawBytes_ImageStack ? (
            // Canvas-decode path for raw uint8 imageStacks. Sidesteps
            // PIL on the backend (`/data/image` returns
            // BINARY_DECODE_FAILED on these); paints frames from the
            // octet-stream `/data/raw` bytes onto a `<canvas>` using
            // the layout from `imageStack_parameters`. Empty
            // allowlist by default — see lib/imageStack/format.ts.
            raw.isLoading || stackParams.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : raw.isError ? (
              <BinaryFetchError error={raw.error} kindLabel="image" />
            ) : raw.data && stackParams.params ? (
              <ImageStackCanvasViewer
                buffer={raw.data.data}
                params={stackParams.params}
              />
            ) : null
          ) : !enableImg ? (
            // Doc / parameter lookups still in flight — show a
            // skeleton instead of letting the panel collapse to
            // nothing while we figure out which decode path to take.
            <Skeleton className="h-64 w-full" />
          ) : img.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : img.isError ? (
            <BinaryFetchError error={img.error} kindLabel="image" />
          ) : imgData ? (
            <ImageViewer data={imgData} />
          ) : null
        )}
        {isVideo &&
          (vid.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : vid.isError ? (
            <BinaryFetchError error={vid.error} kindLabel="video" />
          ) : vidData ? (
            <VideoPlayer data={vidData} />
          ) : null)}
        {isFitcurve &&
          (fit.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : fit.isError ? (
            <BinaryFetchError error={fit.error} kindLabel="fit curve" />
          ) : fitData ? (
            <FitcurveChart data={fitData} />
          ) : null)}
      </CardBody>
    </Card>
  );
}

/**
 * Inline empty-state for a binary preview that the backend couldn't
 * serve. Pre-fix DataPanel rendered `null` in this case, leaving an
 * empty `<CardBody>` under the panel header — visible on production
 * 2026-04-28 on Bhar's C. elegans imageStacks where PIL can't decode
 * the dataset's raw uint8 frame stacks (`BINARY_DECODE_FAILED` 502
 * from `/data/image`). Empty card looks broken; this surface tells
 * the user what happened and where to find the raw file.
 *
 * Two variants:
 *
 *   - `BINARY_DECODE_FAILED` → factual "preview not supported for
 *      this format" copy. Not really an error from the user's
 *      perspective — the data is fine, just not previewable inline.
 *      Points them at the Files section above for the raw download.
 *   - Anything else → a generic "Couldn't load the {kindLabel} preview"
 *      with a small inline error code + request id so support tickets
 *      carry the diagnostic detail.
 */
function BinaryFetchError({
  error,
  kindLabel,
}: {
  error: unknown;
  kindLabel: string;
}) {
  const apiErr = error instanceof ApiError ? error : null;
  const isDecodeFailed = apiErr?.code === 'BINARY_DECODE_FAILED';
  const requestId = apiErr?.requestId ?? null;

  if (isDecodeFailed) {
    return (
      <div className="flex items-start gap-2.5 rounded-md bg-bg-muted/60 border border-border-subtle px-3 py-2.5 text-xs text-fg-secondary">
        <FileWarning className="h-3.5 w-3.5 mt-0.5 shrink-0 text-fg-muted" aria-hidden />
        <div className="space-y-1">
          <div>
            Inline preview not supported for this {kindLabel}&rsquo;s file format.
          </div>
          <div className="text-fg-muted">
            The raw file is still downloadable from the Files section above.
          </div>
        </div>
      </div>
    );
  }

  const message =
    apiErr?.message ??
    (error instanceof Error ? error.message : `Couldn't load the ${kindLabel} preview.`);

  return (
    <div
      role="alert"
      className="rounded-md border border-border-subtle bg-bg-muted/60 px-3 py-2.5 text-xs text-fg-secondary"
    >
      <div className="font-medium text-fg-primary mb-1">
        Couldn&rsquo;t load the {kindLabel} preview
      </div>
      <div>{message}</div>
      {requestId && (
        <div className="mt-1 font-mono text-[10px] text-fg-muted">
          requestId: {requestId}
        </div>
      )}
    </div>
  );
}
