'use client';

/**
 * IsiHistogram — Plotly histogram of inter-spike intervals.
 *
 * Mounted from the chat's Markdown renderer when the LLM emits a
 * fenced code block tagged "isi-histogram" with a JSON payload:
 *
 *     ```isi-histogram
 *     {
 *       "datasetId": "67f7...",
 *       "intervals": [0.003, 0.012, 0.018, ...],   // ms
 *       "unitName": "Unit 12 (Saline)",
 *       "logBins": true,
 *       "title": "ISI histogram — BNST unit 12"
 *     }
 *     ```
 *
 * The X axis is "Inter-spike interval (ms)" rendered with a log
 * scale by default (electrophysiology convention — refractory-period
 * resolution at the low end, bursts visible at the high end). When
 * `logBins=true` (default) we feed Plotly log-spaced bin edges so
 * the bars are visually evenly distributed on a log axis.
 *
 * The component accepts either:
 *   - `intervals`: raw ISIs (ms) — Plotly does its own binning.
 *   - `bins` + `counts`: a pre-binned series — rendered as a Bar
 *     trace at the supplied bin centers.
 *
 * The fetch_spike_summary tool returns the raw ISI form for now;
 * pre-binned support is in for the future case where the backend
 * grows a server-side binning route (cheaper for very long spike
 * trains).
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

export interface IsiHistogramProps {
  /** Dataset ID for the citation footer (optional). */
  datasetId?: string;
  /**
   * Raw inter-spike intervals in MILLISECONDS. Either this OR
   * (`bins` + `counts`) must be provided.
   */
  intervals?: number[];
  /**
   * Pre-binned form: `bins` are bin EDGES (length N+1), `counts` are
   * per-bin counts (length N). When provided, rendered as a Bar
   * trace using bin centers.
   */
  bins?: number[];
  counts?: number[];
  /** Optional unit identifier — displayed in the caption. */
  unitName?: string;
  /** X-axis label. Defaults to "Inter-spike interval (ms)". */
  xLabel?: string;
  /** Chart title. */
  title?: string;
  /**
   * When true (default), use log-spaced bins + log X axis. This is
   * the standard electrophysiology presentation. Set to false for a
   * linear-binned, linear-axis presentation (e.g., short comparison
   * windows).
   */
  logBins?: boolean;
}

const BAR_COLOR = '#0284c7';

// Default bin grid: 1 ms to 10 s on a log scale, ~40 bins. Matches
// the standard ISI histogram preset in vh-lab + ndi-matlab figures.
const DEFAULT_BIN_COUNT = 40;
const DEFAULT_LOG_MIN_MS = 1; // 1 ms — short of typical 2 ms refractory
const DEFAULT_LOG_MAX_MS = 10_000; // 10 s — past which the column is empty

function logSpacedEdges(min: number, max: number, n: number): number[] {
  const lo = Math.log10(Math.max(min, 1e-6));
  const hi = Math.log10(Math.max(max, min * 10));
  const step = (hi - lo) / n;
  const edges: number[] = [];
  for (let i = 0; i <= n; i++) edges.push(Math.pow(10, lo + i * step));
  return edges;
}

export function IsiHistogram({
  datasetId,
  intervals,
  bins,
  counts,
  unitName,
  xLabel,
  title,
  logBins = true,
}: IsiHistogramProps) {
  const exportRef = useRef<PlotlyMountHandle>(null);

  // Pre-binned form takes precedence — when both intervals and bins
  // are provided, bins wins. This matches the tool contract: if the
  // backend ever returns server-binned shapes, they're authoritative.
  const usePrebinned =
    Array.isArray(bins) &&
    Array.isArray(counts) &&
    bins.length === counts.length + 1 &&
    counts.length > 0;

  const hasData =
    usePrebinned || (Array.isArray(intervals) && intervals.length > 0);

  const plotly = useMemo(() => {
    if (!hasData) return null;

    let traces: Data[];
    if (usePrebinned) {
      // Render as Bar at bin centers. Geometric mean for log-spaced
      // bins, arithmetic for linear — keeps the bar over the bin.
      const centers: number[] = [];
      const widths: number[] = [];
      for (let i = 0; i < counts!.length; i++) {
        const lo = bins![i]!;
        const hi = bins![i + 1]!;
        if (logBins && lo > 0 && hi > 0) {
          centers.push(Math.sqrt(lo * hi));
        } else {
          centers.push((lo + hi) / 2);
        }
        widths.push(hi - lo);
      }
      traces = [
        {
          type: 'bar',
          x: centers,
          y: counts!,
          width: widths,
          marker: { color: BAR_COLOR, line: { width: 0 } },
          hovertemplate: 'ISI: %{x:.2f} ms<br>Count: %{y}<extra></extra>',
        },
      ];
    } else {
      const cleanIntervals = (intervals ?? []).filter(
        (v) => Number.isFinite(v) && v > 0,
      );
      if (logBins) {
        // Plotly's `histogram` trace doesn't accept explicit edge
        // arrays — its `xbins` field assumes uniform-width bins, which
        // produces visually-uneven bars when the X axis is logarithmic.
        // The electrophysiology convention expects geometrically-spaced
        // bins (equal width on the log axis), so we pre-bin client-side
        // and emit a Bar trace at the geometric center of each bin.
        const edges = logSpacedEdges(
          DEFAULT_LOG_MIN_MS,
          DEFAULT_LOG_MAX_MS,
          DEFAULT_BIN_COUNT,
        );
        const countArr = new Array(edges.length - 1).fill(0) as number[];
        for (const v of cleanIntervals) {
          for (let i = 0; i < edges.length - 1; i++) {
            if (v >= edges[i]! && v < edges[i + 1]!) {
              countArr[i]! += 1;
              break;
            }
          }
        }
        const centers: number[] = [];
        const widths: number[] = [];
        for (let i = 0; i < edges.length - 1; i++) {
          const lo = edges[i]!;
          const hi = edges[i + 1]!;
          centers.push(Math.sqrt(lo * hi));
          widths.push(hi - lo);
        }
        traces = [
          {
            type: 'bar',
            x: centers,
            y: countArr,
            width: widths,
            marker: { color: BAR_COLOR, line: { width: 0 } },
            hovertemplate: 'ISI: %{x:.2f} ms<br>Count: %{y}<extra></extra>',
          },
        ];
      } else {
        // Linear scale — let Plotly's native histogram do its thing.
        // Plotly's TS types lag the JS surface here — `nbinsx` is valid
        // runtime config but missing from `Partial<PlotData>`. Cast
        // through `Record<string, unknown>` matches the ViolinChart
        // approach for `violingap`.
        traces = [
          {
            type: 'histogram',
            x: cleanIntervals,
            nbinsx: DEFAULT_BIN_COUNT,
            marker: { color: BAR_COLOR, line: { width: 0 } },
            hovertemplate: 'ISI: %{x:.2f} ms<br>Count: %{y}<extra></extra>',
          } as Partial<Data> & Record<string, unknown>,
        ];
      }
    }

    const layout: Partial<Layout> = {
      title: title ? { text: title, font: { size: 14 } } : undefined,
      xaxis: {
        title: { text: xLabel ?? 'Inter-spike interval (ms)', font: { size: 12 } },
        type: logBins ? 'log' : 'linear',
        zeroline: false,
      },
      yaxis: {
        title: { text: 'Count', font: { size: 12 } },
        zeroline: false,
      },
      bargap: 0.04,
      showlegend: false,
      height: 320,
      margin: { t: title ? 36 : 16, r: 16, b: 50, l: 56 },
      paper_bgcolor: 'white',
      plot_bgcolor: 'white',
      font: { family: 'ui-sans-serif, system-ui', size: 11 },
    };

    return { traces, layout };
  }, [
    hasData,
    usePrebinned,
    intervals,
    bins,
    counts,
    logBins,
    title,
    xLabel,
  ]);

  const totalIntervals = useMemo(() => {
    if (usePrebinned) {
      return (counts ?? []).reduce((s, c) => s + c, 0);
    }
    return Array.isArray(intervals) ? intervals.length : 0;
  }, [usePrebinned, intervals, counts]);

  // a834 P1 #I-6 accessibility audit (2026-05-14): screen readers
  // announced this figure as "graphic" with no description. Reuse
  // the same title/unitName fallback chain the figcaption already
  // resolves so the SR announcement matches the visual caption.
  const ariaLabel =
    title ??
    (unitName ? `ISI histogram — ${unitName}` : 'Inter-spike interval histogram');

  return (
    <figure
      className="my-4 p-3 rounded-md border border-gray-200 bg-white"
      aria-label={ariaLabel}
    >
      <figcaption className="mb-2 flex items-baseline gap-2 text-[13px]">
        <span className="font-semibold text-gray-900 truncate flex-1 min-w-0">
          {title ?? (unitName ? `ISI histogram — ${unitName}` : 'ISI histogram')}
        </span>
        {logBins && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-600 shrink-0">
            log
          </span>
        )}
      </figcaption>

      <ChartBody hasData={!!plotly} plotly={plotly} exportRef={exportRef} />

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">
          {totalIntervals > 0
            ? `${totalIntervals.toLocaleString()} intervals`
            : ''}
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

IsiHistogram.displayName = 'IsiHistogram';

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
        No inter-spike intervals to display.
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
