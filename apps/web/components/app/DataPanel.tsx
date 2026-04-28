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
  useTimeseries,
  useVideoUrl,
} from '@/lib/api/binary';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

import { ImageViewer } from './ImageViewer';
import { VideoPlayer } from './VideoPlayer';

// CQ5: Dynamic imports for the uPlot-backed chart components. uPlot is
// the largest single asset in this view (~30 KB gz with the CSS), and
// most users hitting a dataset detail page don't open the binary
// preview at all. Splitting them out keeps the main app bundle smaller;
// the chart chunk loads only when DataPanel decides to render one.
//
// `ssr: false` because uPlot touches `window`/`document` on construct
// and we never want the chart to attempt to render on the server.
const TimeseriesChart = dynamic(
  () => import('./TimeseriesChart').then((m) => ({ default: m.TimeseriesChart })),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);
const FitcurveChart = dynamic(
  () => import('./FitcurveChart').then((m) => ({ default: m.FitcurveChart })),
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

  const ts = useTimeseries(datasetId, documentId, isTimeseries);
  const img = useImageData(datasetId, documentId, isImage);
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
        {isImage &&
          (img.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : img.isError ? (
            <BinaryFetchError error={img.error} kindLabel="image" />
          ) : imgData ? (
            <ImageViewer data={imgData} />
          ) : null)}
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
