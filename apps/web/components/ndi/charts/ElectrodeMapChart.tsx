'use client';

/**
 * ElectrodeMapChart — Plotly-rendered 2D scatter of electrode /
 * probe positions within a subject's brain. Sister chart to
 * SpikeRaster + ViolinChart: callers pass the points directly, the
 * chart owns rendering + color + hover + axis-equal aspect.
 *
 * Two coloring branches:
 *
 *   1. Any point carries a `z` (depth) → color markers by z via the
 *      Viridis colorscale and show a colorbar labeled "Depth (μm)".
 *   2. Otherwise → split into categorical groups by `brainRegion`
 *      (or a single-color trace when all points share one region or
 *      none are tagged). Categorical palette matches SpikeRaster +
 *      ViolinChart so the workspace renders consistently across panels.
 *
 * Aspect ratio: yaxis is anchored to xaxis (scaleratio: 1) so the
 * stereotaxic frame doesn't get squashed when the panel's width
 * changes — important because ML / AP / DV distances are spatial
 * truths, not arbitrary axis ranges.
 */

import { useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { Data, Layout } from 'plotly.js';

import type { PlotlyMountHandle } from './PlotlyMount';

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

export interface ElectrodePositionPoint {
  /** Human-readable label — probe name, channel id, etc. */
  label: string;
  /** Medial-lateral coordinate (typically μm). */
  x: number;
  /** Anterior-posterior coordinate (typically μm). */
  y: number;
  /** Optional depth coordinate — drives marker color when present. */
  z?: number;
  /** Optional ontology label / CURIE — drives categorical grouping. */
  brainRegion?: string;
}

export interface ElectrodeMapChartProps {
  /** Dataset the points belong to. Forwarded to consumers for citation. */
  datasetId: string;
  /** Optional chart title. */
  title?: string;
  /** X-axis label. Defaults to "ML (μm)" — medial-lateral. */
  xLabel?: string;
  /** Y-axis label. Defaults to "AP (μm)" — anterior-posterior. */
  yLabel?: string;
  /** Points to render. Empty array renders an empty-state message. */
  points: ElectrodePositionPoint[];
}

/** Shared with SpikeRaster + ViolinChart for cross-panel consistency. */
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
 * Build the Plotly hover string for one point. Coordinates round to 1
 * decimal so floating-point noise (e.g. `2400.0000001`) doesn't bleed
 * into the tooltip. Empty fields are dropped so single-region datasets
 * don't show a stray "Region: undefined" row.
 */
function formatHover(p: ElectrodePositionPoint): string {
  const parts: string[] = [];
  parts.push(`<b>${escapeHtml(p.label)}</b>`);
  parts.push(`(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
  if (typeof p.z === 'number' && Number.isFinite(p.z)) {
    parts.push(`Depth: ${p.z.toFixed(1)}`);
  }
  if (p.brainRegion) {
    parts.push(`Region: ${escapeHtml(p.brainRegion)}`);
  }
  return parts.join('<br>') + '<extra></extra>';
}

/**
 * Minimal HTML-escape for Plotly hovertemplate. Plotly renders these
 * as HTML so user-supplied labels (which can include angle brackets in
 * pathological NDI docs) must be neutralized before they hit the DOM.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function ElectrodeMapChart({
  title,
  xLabel,
  yLabel,
  points,
}: ElectrodeMapChartProps) {
  const exportRef = useRef<PlotlyMountHandle>(null);

  const plotly = useMemo(() => {
    if (!Array.isArray(points) || points.length === 0) return null;

    // Branch 1: any point carries a z → continuous Viridis colormap.
    // We use a single Scatter trace so the colorbar maps cleanly to
    // the depth axis. Points without z still render (color falls back
    // to the trace's mean z), which is the right behavior for sparsely-
    // annotated datasets.
    const hasZ = points.some(
      (p) => typeof p.z === 'number' && Number.isFinite(p.z),
    );

    if (hasZ) {
      const zValues = points.map((p) =>
        typeof p.z === 'number' && Number.isFinite(p.z) ? p.z : null,
      );
      const traces: Data[] = [
        {
          type: 'scatter',
          mode: 'markers',
          x: points.map((p) => p.x),
          y: points.map((p) => p.y),
          text: points.map(formatHover),
          hovertemplate: '%{text}',
          marker: {
            size: 9,
            // `color` accepts a numeric array → Plotly maps it through
            // the colorscale. Nulls fall through to neutral grey via
            // the line / opacity rather than a discontinuous color jump.
            color: zValues as number[],
            colorscale: 'Viridis',
            showscale: true,
            colorbar: {
              title: { text: 'Depth (μm)', font: { size: 11 } },
              thickness: 12,
              len: 0.8,
              tickfont: { size: 10 },
            },
            line: { width: 0.5, color: '#1f2937' },
          },
          showlegend: false,
        },
      ];
      return { traces, mode: 'depth' as const };
    }

    // Branch 2: group by brainRegion when distinct values exist. When
    // every point shares the same region (or none have one), collapse
    // to a single grey trace — the legend would just be noise.
    const regions = Array.from(
      new Set(
        points
          .map((p) => p.brainRegion)
          .filter((r): r is string => typeof r === 'string' && r.length > 0),
      ),
    );

    if (regions.length >= 2) {
      const traces: Data[] = regions.map((region, i) => {
        const subset = points.filter((p) => p.brainRegion === region);
        return {
          type: 'scatter',
          mode: 'markers',
          name: region,
          x: subset.map((p) => p.x),
          y: subset.map((p) => p.y),
          text: subset.map(formatHover),
          hovertemplate: '%{text}',
          marker: {
            size: 9,
            color: PALETTE[i % PALETTE.length],
            line: { width: 0.5, color: '#1f2937' },
          },
        };
      });
      // Points missing a brainRegion become a "(unspecified)" trace so
      // they're still visible — silently dropping them would mislead
      // anyone using the panel as a coverage check.
      const unlabeled = points.filter(
        (p) => !p.brainRegion || p.brainRegion.length === 0,
      );
      if (unlabeled.length > 0) {
        traces.push({
          type: 'scatter',
          mode: 'markers',
          name: '(unspecified)',
          x: unlabeled.map((p) => p.x),
          y: unlabeled.map((p) => p.y),
          text: unlabeled.map(formatHover),
          hovertemplate: '%{text}',
          marker: {
            size: 9,
            color: '#9ca3af',
            line: { width: 0.5, color: '#1f2937' },
          },
        });
      }
      return { traces, mode: 'region' as const };
    }

    // Branch 3: single-color trace (no z, ≤1 region).
    const traces: Data[] = [
      {
        type: 'scatter',
        mode: 'markers',
        x: points.map((p) => p.x),
        y: points.map((p) => p.y),
        text: points.map(formatHover),
        hovertemplate: '%{text}',
        marker: {
          size: 9,
          color: PALETTE[0],
          line: { width: 0.5, color: '#1f2937' },
        },
        showlegend: false,
      },
    ];
    return { traces, mode: 'single' as const };
  }, [points]);

  const layout: Partial<Layout> = useMemo(() => {
    const showLegend = plotly?.mode === 'region';
    return {
      title: title ? { text: title, font: { size: 14 } } : undefined,
      xaxis: {
        title: { text: xLabel ?? 'ML (μm)', font: { size: 12 } },
        zeroline: true,
        zerolinecolor: '#e5e7eb',
      },
      yaxis: {
        title: { text: yLabel ?? 'AP (μm)', font: { size: 12 } },
        zeroline: true,
        zerolinecolor: '#e5e7eb',
        // Equal aspect: spatial truths shouldn't get squashed by panel
        // width. Without scaleanchor the chart shows ML vs AP at
        // arbitrary aspect ratios, which is visually misleading.
        scaleanchor: 'x',
        scaleratio: 1,
      },
      showlegend: showLegend,
      legend: showLegend
        ? { orientation: 'h', y: -0.15, font: { size: 11 } }
        : undefined,
      height: 380,
      margin: { t: title ? 36 : 20, r: 40, b: showLegend ? 64 : 48, l: 60 },
      paper_bgcolor: 'white',
      plot_bgcolor: 'white',
      font: { family: 'ui-sans-serif, system-ui', size: 11 },
    };
  }, [plotly?.mode, title, xLabel, yLabel]);

  // a834 P1 #I-6 accessibility audit: every Plotly figure carries an
  // aria-label so screen readers announce something useful instead of
  // "graphic". When the caller passes a title we trust it; otherwise
  // we compose a count-based fallback.
  const ariaLabel =
    title ?? `Electrode positions (${points.length} point${points.length === 1 ? '' : 's'})`;

  return (
    <figure
      className="my-4 p-3 rounded-md border border-gray-200 bg-white"
      aria-label={ariaLabel}
    >
      {title && (
        <figcaption className="mb-2 text-[13px] font-semibold text-gray-900 truncate">
          {title}
        </figcaption>
      )}
      {plotly ? (
        <PlotlyMount
          ref={exportRef}
          data={plotly.traces}
          layout={layout}
          className="w-full"
        />
      ) : (
        <div
          role="status"
          className="h-[200px] flex items-center justify-center text-[13px] text-gray-500 bg-gray-50 border border-gray-200 rounded"
        >
          No electrode positions to display.
        </div>
      )}
    </figure>
  );
}

ElectrodeMapChart.displayName = 'ElectrodeMapChart';
