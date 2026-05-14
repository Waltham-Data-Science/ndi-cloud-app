'use client';

/**
 * SpikeRaster — Plotly-rendered spike-time raster for one or many units.
 *
 * Mounted from the chat's Markdown renderer when the LLM emits a
 * fenced code block tagged "spike-raster" with a JSON payload:
 *
 *     ```spike-raster
 *     {
 *       "datasetId": "67f7...",
 *       "units": [
 *         {"name": "Unit 1 (Saline)", "spikeTimes": [0.012, 0.034, ...]},
 *         {"name": "Unit 2 (CNO)",    "spikeTimes": [0.018, 0.055, ...]}
 *       ],
 *       "tWindow": [0, 60],
 *       "title": "BNST unit raster (Saline vs CNO)"
 *     }
 *     ```
 *
 * Unlike ViolinChart / SignalChart which re-fetch their data via
 * TanStack Query on mount, SpikeRaster takes the spike-time arrays
 * directly as props. This is intentional: the fetch_spike_summary
 * tool has already aggregated + filtered the data server-side, so a
 * second round-trip from the chart would only add latency without
 * adding signal. The chart_payload JSON IS the data envelope.
 *
 * Rendering: one Plotly Scatter trace per unit, mode="markers",
 * marker.symbol="line-ns" (vertical tick), one row per unit on the
 * categorical Y axis. Auto-color via the shared PALETTE so a
 * raster with N units gets distinguishable tick colors. Hover shows
 * the unit name + spike time.
 */

import { useMemo, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { Data, Layout } from 'plotly.js';

import { datasetOverviewUrl } from '@/lib/ai/references';
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

export interface SpikeRasterUnit {
  /** Human-readable label for the unit row (e.g. "Unit 12 (CNO)"). */
  name: string;
  /** Spike timestamps in SECONDS. */
  spikeTimes: number[];
}

export interface SpikeRasterProps {
  /**
   * Optional dataset ID. When provided, the citation footer links to
   * the dataset overview. Without it, the footer link is suppressed.
   */
  datasetId?: string;
  /** Per-unit spike trains. Each entry becomes one row. */
  units: SpikeRasterUnit[];
  /**
   * Optional time-window restriction (seconds). When set, the X-axis
   * is locked to [t0, t1] and ticks outside the window are dropped
   * before rendering (Plotly axis range still clips, but pre-filtering
   * keeps the trace point counts small).
   */
  tWindow?: [number, number];
  /** Optional X-axis label. Defaults to "Time (s)". */
  xLabel?: string;
  /** Optional chart title. */
  title?: string;
}

/** Shared with ViolinChart for visual consistency across chart kinds. */
const PALETTE = [
  '#0284c7',
  '#f97316',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#eab308',
];

/**
 * Plotly's categorical Y axis becomes unreadable past ~50 rows. We
 * cap rather than crash; the figure renders the first N and surfaces
 * a small note in the footer. The chat tool caps server-side at the
 * same value so this branch is mostly defensive.
 */
const MAX_UNITS = 50;

export function SpikeRaster({
  datasetId,
  units,
  tWindow,
  xLabel,
  title,
}: SpikeRasterProps) {
  const exportRef = useRef<PlotlyMountHandle>(null);

  const plotly = useMemo(() => {
    if (!Array.isArray(units) || units.length === 0) return null;

    const truncated = units.length > MAX_UNITS;
    const rows = units.slice(0, MAX_UNITS);

    // Each unit becomes one trace. Y values are the categorical row
    // name, repeated once per spike. Marker symbol "line-ns" is a
    // vertical short tick — the canonical raster mark.
    const traces: Data[] = rows.map((u, i) => {
      const filtered = tWindow
        ? u.spikeTimes.filter((t) => t >= tWindow[0] && t <= tWindow[1])
        : u.spikeTimes;
      return {
        type: 'scatter',
        mode: 'markers',
        name: u.name,
        x: filtered,
        // y must be the same length as x; repeat the category label.
        y: filtered.map(() => u.name),
        marker: {
          symbol: 'line-ns',
          size: 10,
          color: PALETTE[i % PALETTE.length],
          line: { width: 1.2, color: PALETTE[i % PALETTE.length] },
        },
        hoverinfo: 'x+name',
        showlegend: false,
      };
    });

    // Reverse the categorical order so the first unit appears at the
    // top of the chart — matches the convention in spike-sorting
    // figures (unit 1 → top row).
    const layout: Partial<Layout> & Record<string, unknown> = {
      title: title ? { text: title, font: { size: 14 } } : undefined,
      xaxis: {
        title: { text: xLabel ?? 'Time (s)', font: { size: 12 } },
        zeroline: false,
        ...(tWindow ? { range: tWindow } : {}),
      },
      yaxis: {
        type: 'category',
        // Order: first unit at top, last at bottom.
        categoryorder: 'array',
        categoryarray: rows.map((u) => u.name).reverse(),
        automargin: true,
        tickfont: { size: 11 },
      },
      showlegend: false,
      // Height grows with the row count up to a comfortable ceiling.
      // Single-unit raster gets a tighter panel.
      height: Math.max(180, Math.min(360, 40 + rows.length * 22)),
      margin: { t: title ? 36 : 16, r: 16, b: 44, l: 120 },
      paper_bgcolor: 'white',
      plot_bgcolor: 'white',
      font: { family: 'ui-sans-serif, system-ui', size: 11 },
    };

    return { traces, layout, truncated };
  }, [units, tWindow, title, xLabel]);

  const totalSpikes = useMemo(
    () =>
      Array.isArray(units)
        ? units.reduce((s, u) => s + (u.spikeTimes?.length ?? 0), 0)
        : 0,
    [units],
  );

  // a834 P1 #I-6 accessibility audit (2026-05-14): screen readers
  // announced this figure as "graphic" with no description. Compose
  // the unit count + total spikes into the fallback so an SR user
  // gets the scale of the raster, not just its label.
  const ariaLabel =
    title ??
    (units.length > 0
      ? `Spike raster, ${units.length} unit${units.length === 1 ? '' : 's'}`
      : 'Spike raster');

  return (
    <figure
      className="my-4 p-3 rounded-md border border-gray-200 bg-white"
      aria-label={ariaLabel}
    >
      <figcaption className="mb-2 flex items-baseline gap-2 text-[13px]">
        <span className="font-semibold text-gray-900 truncate flex-1 min-w-0">
          {title ?? 'Spike raster'}
        </span>
        {units.length > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-600 shrink-0">
            {units.length} unit{units.length === 1 ? '' : 's'}
          </span>
        )}
      </figcaption>

      <ChartBody hasData={!!plotly} plotly={plotly} exportRef={exportRef} />

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">
          {plotly?.truncated
            ? `Showing first ${MAX_UNITS} of ${units.length} units · ${totalSpikes.toLocaleString()} total spikes`
            : units.length > 0
              ? `${totalSpikes.toLocaleString()} total spikes`
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

// Explicit displayName so Markdown.tsx's child-identity check (which
// detects SpikeRaster wrapped in <pre>) is robust to production
// minification.
SpikeRaster.displayName = 'SpikeRaster';

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
        No spike data to display.
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
