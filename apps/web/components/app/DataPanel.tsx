'use client';

import { Activity, ImageIcon, LineChart, Video } from 'lucide-react';
import dynamic from 'next/dynamic';

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

  const { data: tsData, isLoading: tsLoading } = useTimeseries(datasetId, documentId, isTimeseries);
  const { data: imgData, isLoading: imgLoading } = useImageData(datasetId, documentId, isImage);
  const { data: vidData, isLoading: vidLoading } = useVideoUrl(datasetId, documentId, isVideo);
  const { data: fitData, isLoading: fitLoading } = useFitcurve(datasetId, documentId, isFitcurve);

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
          (tsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : tsData ? (
            <TimeseriesChart data={tsData} />
          ) : null)}
        {isImage &&
          (imgLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : imgData ? (
            <ImageViewer data={imgData} />
          ) : null)}
        {isVideo &&
          (vidLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : vidData ? (
            <VideoPlayer data={vidData} />
          ) : null)}
        {isFitcurve &&
          (fitLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : fitData ? (
            <FitcurveChart data={fitData} />
          ) : null)}
      </CardBody>
    </Card>
  );
}
