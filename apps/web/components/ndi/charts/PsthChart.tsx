'use client';

/**
 * PsthChart — Plotly bar chart of spike counts (or firing rate) in
 * time bins around stimulus onset. The vertical dashed line at x=0
 * marks the stimulus onset and is what makes the chart visually read
 * as a PSTH; do not remove it.
 *
 * When `meanRateHz` is supplied (the canonical case from the backend)
 * the Y axis is "Firing rate (Hz)". When only `counts` is supplied we
 * fall back to "Spike count" — both shapes render the same bar trace.
 */

import { useMemo, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { Data, Layout } from 'plotly.js';

import { datasetOverviewUrl } from '@/lib/ndi/references';
import type { PlotlyMountHandle } from './PlotlyMount';

const PlotlyMount = dynamic(
  () => import('./PlotlyMount').then((m) => m.PlotlyMount),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] flex items-center justify-center text-[12px] text-gray-500">
        Loading chart…
      </div>
    ),
  },
);

export interface PsthChartProps {
  /** Dataset ID for the footer citation link. */
  datasetId: string;
  /** Bin centers (seconds, relative to stimulus onset). */
  binCenters: number[];
  /** Spike counts per bin (across all trials). Used if meanRateHz is absent. */
  counts?: number[];
  /** Mean firing rate per bin in Hz (counts normalized by bin width × trial count). */
  meanRateHz?: number[];
  /** Bin width in milliseconds — drives bar width on the X axis (seconds). */
  binSizeMs: number;
  /** Window start (seconds, relative to onset). For context, not axis bounds. */
  t0: number;
  /** Window end (seconds, relative to onset). */
  t1: number;
  /** Optional unit identifier surfaced in caption + aria-label. */
  unitName?: string;
  /** Optional chart title. */
  title?: string;
}

const BAR_COLOR = '#0284c7';
const ONSET_LINE_COLOR = '#dc2626';

export function PsthChart({
  datasetId,
  binCenters,
  counts,
  meanRateHz,
  binSizeMs,
  t0,
  t1,
  unitName,
  title,
}: PsthChartProps) {
  const exportRef = useRef<PlotlyMountHandle>(null);

  // Y axis: prefer meanRateHz (the canonical normalized PSTH form);
  // fall back to raw counts when the backend hasn't normalized them.
  // Memoized so the array reference is stable across renders and the
  // downstream useMemo doesn't churn on every parent re-render
  // (react-hooks/exhaustive-deps).
  const { useRate, yValues, yLabel } = useMemo(() => {
    const rateOk =
      Array.isArray(meanRateHz) &&
      meanRateHz.length > 0 &&
      meanRateHz.length === binCenters.length;
    return {
      useRate: rateOk,
      yValues: rateOk
        ? (meanRateHz as number[])
        : Array.isArray(counts)
          ? counts
          : [],
      yLabel: rateOk ? 'Firing rate (Hz)' : 'Spike count',
    };
  }, [meanRateHz, counts, binCenters.length]);

  const hasData = binCenters.length > 0 && yValues.length === binCenters.length;

  const plotly = useMemo(() => {
    if (!hasData) return null;

    // Bar width in seconds — bin_size_ms / 1000. Plotly's `width`
    // field is in axis units, so this places each bar over its bin
    // exactly without gap-tuning by hand.
    const barWidth = binSizeMs / 1000;

    const traces: Data[] = [
      {
        type: 'bar',
        x: binCenters,
        y: yValues,
        width: binCenters.map(() => barWidth),
        marker: { color: BAR_COLOR, line: { width: 0 } },
        hovertemplate: useRate
          ? 't = %{x:.3f} s<br>Rate: %{y:.2f} Hz<extra></extra>'
          : 't = %{x:.3f} s<br>Count: %{y}<extra></extra>',
      },
    ];

    const layout: Partial<Layout> = {
      title: title ? { text: title, font: { size: 14 } } : undefined,
      xaxis: {
        title: {
          text: 'Time relative to stimulus (s)',
          font: { size: 12 },
        },
        zeroline: false,
        // Anchor the X range to the requested window so the dashed
        // onset line + every bin are visible — even when the binned
        // data only covers part of [t0, t1] (e.g., no spikes in tail).
        range: [t0, t1],
      },
      yaxis: {
        title: { text: yLabel, font: { size: 12 } },
        zeroline: true,
        rangemode: 'tozero',
      },
      // Vertical dashed line at x=0 marks the stimulus onset. This is
      // what makes the chart visually read as a PSTH — without it the
      // bar chart loses its temporal anchor. Drawn via `shapes` so the
      // line lives in axis-coordinates and reflows with zoom/pan.
      shapes: [
        {
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: 0,
          x1: 0,
          y0: 0,
          y1: 1,
          line: {
            color: ONSET_LINE_COLOR,
            width: 1.5,
            dash: 'dash',
          },
        },
      ],
      annotations: [
        {
          x: 0,
          y: 1,
          xref: 'x',
          yref: 'paper',
          text: 'stimulus',
          showarrow: false,
          font: { size: 10, color: ONSET_LINE_COLOR },
          xanchor: 'left',
          yanchor: 'top',
          xshift: 4,
        },
      ],
      bargap: 0.04,
      showlegend: false,
      height: 320,
      margin: { t: title ? 36 : 20, r: 16, b: 50, l: 60 },
      paper_bgcolor: 'white',
      plot_bgcolor: 'white',
      font: { family: 'ui-sans-serif, system-ui', size: 11 },
    };

    return { traces, layout };
  }, [hasData, binCenters, yValues, binSizeMs, useRate, title, t0, t1, yLabel]);

  // Total spike / trial count summary for the caption. Falls back to
  // a generic label when no rate / counts data is available.
  const totalCount = useMemo(() => {
    if (Array.isArray(counts) && counts.length > 0) {
      return counts.reduce((s, c) => s + c, 0);
    }
    return 0;
  }, [counts]);

  // P1 #I-6 contract: aria-label resolved against the same fallback
  // chain the visible figcaption uses, so SR announcement matches.
  const ariaLabel =
    title ??
    (unitName ? `PSTH for ${unitName}` : 'Peri-stimulus time histogram');

  return (
    <figure
      className="my-4 p-3 rounded-md border border-gray-200 bg-white"
      aria-label={ariaLabel}
    >
      <figcaption className="mb-2 flex items-baseline gap-2 text-[13px]">
        <span className="font-semibold text-gray-900 truncate flex-1 min-w-0">
          {title ?? (unitName ? `PSTH — ${unitName}` : 'PSTH')}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-600 shrink-0">
          {binSizeMs} ms bins
        </span>
      </figcaption>

      <ChartBody hasData={!!plotly} plotly={plotly} exportRef={exportRef} />

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">
          {totalCount > 0
            ? `${totalCount.toLocaleString()} spike${totalCount === 1 ? '' : 's'} across [${t0}, ${t1}]s`
            : `Window [${t0}, ${t1}]s`}
        </span>
        {datasetId && (
          <Link
            href={datasetOverviewUrl(datasetId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-blue hover:underline shrink-0 ml-2"
          >
            View dataset →
          </Link>
        )}
      </div>
    </figure>
  );
}

PsthChart.displayName = 'PsthChart';

interface ChartBodyProps {
  hasData: boolean;
  plotly: { traces: Data[]; layout: Partial<Layout> } | null;
  exportRef: React.Ref<PlotlyMountHandle>;
}

function ChartBody({ hasData, plotly, exportRef }: ChartBodyProps) {
  if (!hasData || !plotly) {
    return (
      <div
        role="status"
        className="h-[180px] flex items-center justify-center text-[13px] text-gray-500 bg-gray-50 border border-gray-200 rounded"
      >
        No PSTH data to display.
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
