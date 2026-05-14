'use client';

/**
 * GanttChart — horizontal Gantt-style timeline for subject treatments.
 *
 * One row per UNIQUE subject; each row carries one or more horizontal
 * bars, each bar representing a treatment-period for that subject. The
 * chat's `treatment_timeline` tool resolves the items array from the
 * `treatment` document class on a dataset, projects them to the
 * GanttChart shape, and echoes them into a ```gantt-chart fence — the
 * Markdown renderer intercepts that fence and mounts this component.
 *
 * Why a Plotly Scatter with `mode: 'lines'` + `line.width: 16` rather
 * than the (nominal) Plotly Gantt:
 *   - Plotly's "figure factory" Gantt isn't in the cartesian partial
 *     bundle we ship (PlotlyMount), and bringing it in would cost
 *     ~950 KB gz. A line trace per bar is functionally equivalent
 *     and renders identically.
 *   - One trace per (subject, treatment) bar gives us first-class
 *     legend interaction + hover + per-bar coloring without any
 *     figure-factory glue.
 *
 * Numeric vs date X-axis: we let Plotly auto-detect. If the items'
 * `start` / `end` are JS Dates or ISO strings, Plotly's date axis
 * formatter does the right thing. If they're numbers (e.g. day-since-
 * baseline), the axis stays numeric. The component never tries to
 * "interpret" the units — that's the tool's job.
 *
 * Loading / empty / error states match ViolinChart's surface (figure
 * + figcaption + footer with the dataset-overview citation).
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
      <div className="h-[360px] flex items-center justify-center text-[12px] text-gray-500">
        Loading chart…
      </div>
    ),
  },
);

/**
 * One bar on the chart. `start` and `end` may be:
 *   - numbers (ordinal slot, "day since baseline", "session index", …)
 *   - ISO date strings ("2024-03-15T09:00:00Z" or "2024-03-15")
 *   - JS Date instances (rare — most tool output is strings)
 *
 * Plotly auto-detects the axis type from the first non-null value.
 */
export interface GanttChartItem {
  subject: string;
  treatment: string;
  start: number | string;
  end: number | string;
  /** Optional explicit color override (otherwise PALETTE assignment). */
  color?: string;
}

export interface GanttChartProps {
  datasetId: string;
  /** Optional chart title. Defaults to "Treatment timeline". */
  title?: string;
  /** Optional X-axis label. Defaults to empty (Plotly auto-formats). */
  xLabel?: string;
  /**
   * Flat list of treatment-bars. Subjects may repeat — every distinct
   * `subject` string becomes one Y-axis row, in first-seen order.
   */
  items: GanttChartItem[];
}

// Same 7-color set as ViolinChart so categorical groupings stay
// visually consistent across chat-side charts.
const PALETTE = [
  '#0284c7',
  '#f97316',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#eab308',
];

export function GanttChart({
  datasetId,
  title,
  xLabel,
  items,
}: GanttChartProps) {
  const exportRef = useRef<PlotlyMountHandle>(null);

  const plotly = useMemo(() => {
    if (!items || items.length === 0) return null;

    // First-seen unique subjects — preserves the order the tool
    // returned them so the chat answer's narrative order matches
    // the chart's row order.
    const subjects: string[] = [];
    const seenSubjects = new Set<string>();
    for (const it of items) {
      if (!seenSubjects.has(it.subject)) {
        seenSubjects.add(it.subject);
        subjects.push(it.subject);
      }
    }

    // Treatment → color map (stable assignment across the chart).
    // Explicit per-item `color` always wins; otherwise palette-cycle
    // in first-seen order of treatment names.
    const treatmentColor = new Map<string, string>();
    let nextPaletteIdx = 0;
    for (const it of items) {
      if (treatmentColor.has(it.treatment)) continue;
      if (it.color) {
        treatmentColor.set(it.treatment, it.color);
      } else {
        treatmentColor.set(
          it.treatment,
          PALETTE[nextPaletteIdx % PALETTE.length]!,
        );
        nextPaletteIdx += 1;
      }
    }

    // One trace per bar. Putting the subject on Y as a category string
    // and using `mode: 'lines'` with a 2-point [start, end] segment
    // gives us a horizontal bar of width = (end - start). showlegend
    // is set per-treatment (only the FIRST bar for each distinct
    // treatment surfaces in the legend) so the legend doesn't repeat
    // the same color N times.
    const legendShown = new Set<string>();
    const traces: Data[] = items.map((it) => {
      const color = it.color ?? treatmentColor.get(it.treatment)!;
      const firstForTreatment = !legendShown.has(it.treatment);
      if (firstForTreatment) legendShown.add(it.treatment);
      return {
        type: 'scatter',
        mode: 'lines',
        x: [it.start, it.end],
        y: [it.subject, it.subject],
        line: { color, width: 16 },
        name: it.treatment,
        legendgroup: it.treatment,
        showlegend: firstForTreatment,
        hovertemplate:
          `<b>${escapeHover(it.treatment)}</b><br>` +
          `Subject: %{y}<br>` +
          `Start: %{x}<br>` +
          `<extra></extra>`,
      };
    });

    // Compute a sensible height: 28px per subject + 100px chrome,
    // clamped to [240, 800] so a 1-subject chart isn't a hairline
    // and a 100-subject chart doesn't blow the chat panel out.
    const height = Math.min(800, Math.max(240, subjects.length * 28 + 100));

    const layout: Partial<Layout> = {
      title: title ? { text: title, font: { size: 14 } } : undefined,
      xaxis: {
        title: { text: xLabel ?? '', font: { size: 12 } },
      },
      yaxis: {
        // Lock the Y-axis category order to first-seen subject order.
        // Plotly's default `category order: trace` would otherwise
        // reverse rows visually because traces are stacked bottom-up.
        type: 'category',
        categoryorder: 'array',
        categoryarray: subjects,
        autorange: 'reversed', // first subject at the TOP — standard Gantt convention
        automargin: true,
      },
      showlegend: true,
      legend: {
        orientation: 'h',
        x: 0,
        y: -0.15,
        font: { size: 11 },
      },
      margin: { t: title ? 36 : 16, r: 20, b: 56, l: 80 },
      height,
      paper_bgcolor: 'white',
      plot_bgcolor: 'white',
      font: { family: 'ui-sans-serif, system-ui', size: 11 },
      hovermode: 'closest',
    };

    return { traces, layout, subjects };
  }, [items, title, xLabel]);

  const subjectCount = plotly?.subjects.length ?? 0;
  const barCount = items?.length ?? 0;

  return (
    <figure className="my-4 p-3 rounded-md border border-gray-200 bg-white">
      <figcaption className="mb-2 flex items-baseline gap-2 text-[13px]">
        <span className="font-semibold text-gray-900 truncate flex-1 min-w-0">
          {title ?? 'Treatment timeline'}
        </span>
        {subjectCount > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-600 shrink-0">
            {subjectCount} subject{subjectCount === 1 ? '' : 's'}
          </span>
        )}
      </figcaption>

      <ChartBody plotly={plotly} exportRef={exportRef} />

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">
          {barCount > 0
            ? `${barCount} treatment ${barCount === 1 ? 'bar' : 'bars'}`
            : ''}
        </span>
        <Link
          href={datasetOverviewUrl(datasetId)}
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

GanttChart.displayName = 'GanttChart';

interface ChartBodyProps {
  plotly: { traces: Data[]; layout: Partial<Layout>; subjects: string[] } | null;
  exportRef: React.Ref<PlotlyMountHandle>;
}

function ChartBody({ plotly, exportRef }: ChartBodyProps) {
  if (!plotly || plotly.subjects.length === 0) {
    return (
      <div
        role="status"
        className="h-[200px] flex items-center justify-center text-[13px] text-gray-500 bg-gray-50 border border-gray-200 rounded"
      >
        No treatment-timeline data to display.
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

/**
 * Escape `<` / `>` / `&` in hover-text strings. Plotly's hovertemplate
 * is rendered as HTML — a raw `<` from a treatment name (rare, but
 * possible for variable-name strings) would break the hovercard.
 */
function escapeHover(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
