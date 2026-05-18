'use client';

/**
 * ImageChart — Plotly-rendered heatmap for 2D image arrays pulled from
 * NDI binary documents (microscopy, fluorescence, patch-encounter map).
 *
 * Mounted from the chat's Markdown renderer when the LLM emits a
 * fenced code block tagged "image-chart" with a JSON payload:
 *
 *     ```image-chart
 *     {
 *       "datasetId": "67f7...",
 *       "docId": "doc-abc",
 *       "frame": 0,
 *       "title": "Patch encounter map S1"
 *     }
 *     ```
 *
 * The component fetches its own data from the FastAPI image endpoint
 * via TanStack Query — so a re-render after the user navigates back
 * to the chat won't trigger a refetch. The payload is small (a few
 * filter strings) so it survives the LLM's context budget; the real
 * pixel array (potentially 250k floats) lives only on the wire and
 * in the chart's render state.
 *
 * Renders as a Plotly Heatmap with Viridis colorscale + 1:1 aspect
 * ratio so pixels aren't distorted by the chat surface's width. We
 * hide both axes — the image's row/column indices aren't meaningful
 * to the PI; the visual is what matters.
 *
 * Sibling of ViolinChart (tabular comparisons) and SignalChart
 * (timeseries). All three follow the same fence-renderer pattern.
 */

import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { Data, Layout } from 'plotly.js';

import { apiFetch } from '@/lib/api/client';
import { documentExplorerUrl } from '@/lib/ndi/references';
import type { PlotlyMountHandle } from './PlotlyMount';

// Plotly's cartesian bundle pulls a ~446 KB gz dependency. Dynamic
// import keeps it out of the initial chat-page bundle and skips SSR.
const PlotlyMount = dynamic(
  () => import('./PlotlyMount').then((m) => m.PlotlyMount),
  {
    ssr: false,
    loading: () => (
      <div className="h-[360px] flex items-center justify-center text-[12px] text-gray-500">
        Loading chart…
      </div>
    ),
  },
);

export interface ImageChartProps {
  datasetId: string;
  docId: string;
  /**
   * Frame index for multi-frame containers (TIFF stack, animated GIF).
   * Defaults to 0 on the backend when omitted.
   */
  frame?: number;
  title?: string;
}

/**
 * Backend response shape — mirrors image_service._decode_image plus
 * the source provenance the router adds. The chart only consumes a
 * subset (the float array + min/max), but we type the full shape so
 * the response is unambiguous if a future endpoint adds fields.
 */
interface ImageResponse {
  width: number;
  height: number;
  data: number[][];
  min: number;
  max: number;
  format: string;
  downsampled: boolean;
  source?: {
    dataset_id: string;
    document_id: string;
    doc_class: string | null;
    doc_name: string | null;
    filename: string | null;
  };
  /** Soft-error envelope; the chart surfaces these inline. */
  error?: string;
  errorKind?: 'notfound' | 'decode' | 'unsupported';
}

const STALE_MS = 60_000; // 1 minute — image bytes are immutable per doc/frame.

export function ImageChart({ datasetId, docId, frame = 0, title }: ImageChartProps) {
  const exportRef = useRef<PlotlyMountHandle>(null);

  const url = useMemo(
    () =>
      `/api/datasets/${datasetId}/documents/${docId}/image?frame=${frame}`,
    [datasetId, docId, frame],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['image-chart', datasetId, docId, frame],
    queryFn: ({ signal }) => apiFetch<ImageResponse>(url, { signal }),
    staleTime: STALE_MS,
    gcTime: STALE_MS * 5,
    retry: 0,
  });

  const plotly = useMemo(() => {
    if (!data?.data || data.data.length === 0) return null;

    // Single heatmap trace. We pass `z` as the 2D array directly; Plotly
    // walks rows in source order so a [0,0]-top-left image renders the
    // way TIFF / PNG files are typically read. Flip yaxis (autorange:
    // 'reversed') to keep that orientation visible in the chart.
    const traces: Data[] = [
      {
        type: 'heatmap',
        z: data.data,
        colorscale: 'Viridis',
        zmin: data.min,
        zmax: data.max,
        // Hover shows the pixel value at (x, y); axis indices aren't
        // meaningful to the user so we keep it minimal.
        hovertemplate: 'value: %{z:.2f}<extra></extra>',
        showscale: true,
        colorbar: {
          thickness: 12,
          len: 0.8,
          tickfont: { size: 10 },
        },
      },
    ];

    const layout: Partial<Layout> = {
      title: title ? { text: title, font: { size: 14 } } : undefined,
      xaxis: {
        visible: false,
        showgrid: false,
        zeroline: false,
      },
      yaxis: {
        visible: false,
        showgrid: false,
        zeroline: false,
        // scaleanchor keeps pixels square regardless of chat surface
        // width — without this, a 512x256 image stretches into a 16:9
        // letterbox that distorts cell shapes.
        scaleanchor: 'x',
        // Pillow / Plotly orient y=0 at the bottom by default; image
        // files are conventionally top-row-first, so reverse the axis
        // so the top of the image renders at the top of the chart.
        autorange: 'reversed',
      },
      margin: { t: title ? 36 : 16, r: 16, b: 16, l: 16 },
      height: 380,
      paper_bgcolor: 'white',
      plot_bgcolor: 'white',
      font: { family: 'ui-sans-serif, system-ui', size: 11 },
    };

    return { traces, layout };
  }, [data, title]);

  // a834 P1 #I-6 accessibility audit (2026-05-14): screen readers
  // announced this figure as "graphic" with no description. Match
  // the figcaption's resolution chain (title → doc_name → filename)
  // and append a stable type suffix so SR users always know it's
  // an imaging frame, not a chart of imagery.
  const ariaLabel =
    title ??
    data?.source?.doc_name ??
    data?.source?.filename ??
    'NDI imaging frame heatmap';

  return (
    <figure
      className="my-4 p-3 rounded-md border border-gray-200 bg-white"
      aria-label={ariaLabel}
    >
      <figcaption className="mb-2 flex items-baseline gap-2 text-[13px]">
        <span className="font-semibold text-gray-900 truncate flex-1 min-w-0">
          {title ?? data?.source?.doc_name ?? data?.source?.filename ?? 'Image'}
        </span>
        {data?.format && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-600 shrink-0">
            {data.format}
          </span>
        )}
      </figcaption>

      <ChartBody
        data={data}
        isLoading={isLoading}
        isError={isError}
        error={error}
        plotly={plotly}
        exportRef={exportRef}
      />

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">
          {data?.width && data?.height
            ? `${data.width}×${data.height}${data.downsampled ? ' (downsampled)' : ''}`
            : ''}
        </span>
        <Link
          href={documentExplorerUrl(datasetId, docId)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-blue hover:underline shrink-0 ml-2"
        >
          View source document →
        </Link>
      </div>
    </figure>
  );
}

// Explicit displayName so the Markdown component's child-identity
// check (which detects ImageChart wrapped in <pre>) is robust to
// production minification. Matches the SignalChart / ViolinChart
// pattern.
ImageChart.displayName = 'ImageChart';

interface ChartBodyProps {
  data: ImageResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  plotly: { traces: Data[]; layout: Partial<Layout> } | null;
  exportRef: React.Ref<PlotlyMountHandle>;
}

/**
 * Inner body — split out so the figure's caption + footer render
 * consistently across loading / error / empty states. Error branch
 * comes first because an isError + undefined-data combo would
 * otherwise mask itself as "loading forever".
 */
function ChartBody({
  data,
  isLoading,
  isError,
  error,
  plotly,
  exportRef,
}: ChartBodyProps) {
  if (isError) {
    const msg = error instanceof Error ? error.message : 'Failed to load image';
    return (
      <div
        role="alert"
        className="h-[200px] flex items-center justify-center text-center px-4 text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded"
      >
        Couldn&apos;t load the image: {msg}
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="h-[360px] flex items-center justify-center text-[13px] text-gray-500 bg-gray-50 rounded">
        Loading image…
      </div>
    );
  }
  if (data.error) {
    // Backend soft-error envelope (Pillow couldn't decode, missing
    // file, raw NDI format unsupported, etc.).
    return (
      <div
        role="status"
        className="h-[200px] flex items-center justify-center text-center px-4 text-[13px] text-gray-700 bg-gray-50 border border-gray-200 rounded"
      >
        {data.error}
      </div>
    );
  }
  if (!plotly) {
    return (
      <div
        role="status"
        className="h-[200px] flex items-center justify-center text-[13px] text-gray-500 bg-gray-50 border border-gray-200 rounded"
      >
        No image data available.
      </div>
    );
  }
  return (
    <PlotlyMount
      ref={exportRef}
      data={plotly.traces}
      layout={plotly.layout}
      className="w-full"
    />
  );
}
