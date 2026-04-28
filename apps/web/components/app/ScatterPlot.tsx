'use client';

import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

import { coerceNumber } from '@/lib/viewer/math';

interface ScatterPlotProps {
  /** In-memory rows from the host SummaryTableView. The component pulls
   *  numeric values from `xField` + `yField` directly — no API call. */
  rows: ReadonlyArray<Record<string, unknown>>;
  xField: string;
  yField: string;
  /** Optional: when provided, points are colored by their group key. */
  groupBy?: string | null;
  xLabel?: string;
  yLabel?: string;
  height?: number;
}

const COLORS = [
  '#0284c7',
  '#f97316',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#eab308',
];

/** Scatter plot via uPlot — points-only mode. Used when both X and Y are
 *  numeric (e.g. C. elegans worm trajectory, distance-to-patch over time,
 *  fear-conditioning startle-over-trial). Reads in-memory `rows` so no
 *  backend changes are needed for the MVP — a server-side
 *  `POST /api/visualize/pairwise` with sampling/decimation is the eventual
 *  right shape but is P1.
 *
 *  When `groupBy` is set, points are split into one uPlot series per
 *  group key with distinct colors and a top legend; when unset, all
 *  points render as a single series.
 *
 *  Note on the uPlot data shape: uPlot expects an "AlignedData" rectangle
 *  where every series shares the same x-axis array. For grouped scatter
 *  we union all x-values, then each series carries y-values aligned by
 *  index — points belonging to other series get `null` (skipped). */
export function ScatterPlot({
  rows,
  xField,
  yField,
  groupBy,
  xLabel,
  yLabel,
  height = 360,
}: ScatterPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  const { aligned, seriesConfig, pointCount } = useMemo(() => {
    type Pt = { x: number; y: number; group: string };
    const points: Pt[] = [];
    for (const row of rows) {
      const x = coerceNumber(row[xField]);
      const y = coerceNumber(row[yField]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const group = groupBy ? String(row[groupBy] ?? '') : '';
      points.push({ x, y, group });
    }

    // Collect group keys in first-seen order so the legend is stable.
    const groupKeys: string[] = [];
    if (groupBy) {
      const seen = new Set<string>();
      for (const p of points) {
        if (!seen.has(p.group)) {
          seen.add(p.group);
          groupKeys.push(p.group);
        }
      }
    }

    if (points.length === 0) {
      return {
        aligned: null as uPlot.AlignedData | null,
        seriesConfig: [] as uPlot.Series[],
        pointCount: 0,
      };
    }

    // Union of x-values across all points (sorted ascending so uPlot is
    // happy — it requires monotonically non-decreasing x).
    const xs = points.map((p) => p.x).slice().sort((a, b) => a - b);
    const xToIndex = new Map<number, number>();
    xs.forEach((v, i) => {
      // First occurrence wins; later duplicates (e.g. two rows at same x)
      // share the slot — that's fine because each series writes to its
      // own slot via its row order, and uPlot tolerates ties on the x-axis.
      if (!xToIndex.has(v)) xToIndex.set(v, i);
    });

    if (groupBy && groupKeys.length > 0) {
      // One y-array per group, length = xs.length, fill with null.
      const ySeries: Array<Array<number | null>> = groupKeys.map(() =>
        new Array(xs.length).fill(null),
      );
      // Walk points; for each, find its group's index and assign the y at
      // the x-slot. We use a per-group cursor so duplicate xs don't
      // collide — each subsequent duplicate steps forward.
      const groupCursor = new Map<string, number>();
      groupKeys.forEach((g) => groupCursor.set(g, 0));
      // Sort points by x so writes line up with the sorted xs array.
      const sorted = [...points].sort((a, b) => a.x - b.x);
      let xCursor = 0;
      for (const p of sorted) {
        // Advance xCursor to the slot for this x. xs is sorted so this is
        // monotonic.
        while (xCursor < xs.length && xs[xCursor]! < p.x) xCursor++;
        const gIdx = groupKeys.indexOf(p.group);
        if (gIdx >= 0 && xCursor < xs.length) {
          // Find the next free slot for this x in this group's array.
          let slot = xCursor;
          while (slot < xs.length && xs[slot] === p.x && ySeries[gIdx]![slot] !== null) {
            slot++;
          }
          if (slot < xs.length && xs[slot] === p.x) {
            ySeries[gIdx]![slot] = p.y;
          }
        }
      }
      const data: uPlot.AlignedData = [
        xs,
        ...ySeries,
      ] as unknown as uPlot.AlignedData;
      const cfg: uPlot.Series[] = [
        { label: xLabel || xField },
        ...groupKeys.map((g, i) => ({
          label: g || '(empty)',
          stroke: COLORS[i % COLORS.length],
          fill: COLORS[i % COLORS.length],
          width: 0,
          paths: () => null,
          points: { show: true, size: 5, fill: COLORS[i % COLORS.length] },
          spanGaps: false,
        })),
      ];
      return { aligned: data, seriesConfig: cfg, pointCount: points.length };
    }

    // Ungrouped: a single series. Sort by x for uPlot.
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const xArr = sorted.map((p) => p.x);
    const yArr = sorted.map((p) => p.y);
    const data: uPlot.AlignedData = [xArr, yArr] as unknown as uPlot.AlignedData;
    const cfg: uPlot.Series[] = [
      { label: xLabel || xField },
      {
        label: yLabel || yField,
        stroke: COLORS[0],
        fill: COLORS[0],
        width: 0,
        paths: () => null,
        points: { show: true, size: 5, fill: COLORS[0] },
      },
    ];
    return { aligned: data, seriesConfig: cfg, pointCount: points.length };
  }, [rows, xField, yField, groupBy, xLabel, yLabel]);

  useEffect(() => {
    if (!containerRef.current || !aligned) return;
    const width = containerRef.current.clientWidth || 600;
    const opts: uPlot.Options = {
      width,
      height,
      cursor: {
        sync: { key: 'ndi-quickplot' } as uPlot.Cursor.Sync,
        drag: { x: true, y: true },
      },
      legend: { show: true },
      scales: {
        x: { time: false },
      },
      axes: [
        {
          stroke: '#708090',
          grid: { stroke: 'rgba(128,128,128,0.08)' },
          font: '11px ui-monospace, monospace',
          label: xLabel || xField,
        },
        {
          stroke: '#708090',
          grid: { stroke: 'rgba(128,128,128,0.08)' },
          font: '11px ui-monospace, monospace',
          label: yLabel || yField,
        },
      ],
      series: seriesConfig,
    };
    chartRef.current?.destroy();
    chartRef.current = new uPlot(opts, aligned, containerRef.current);

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.setSize({
          width: containerRef.current.clientWidth,
          height,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [aligned, seriesConfig, height, xField, yField, xLabel, yLabel]);

  if (pointCount === 0) {
    return (
      <div className="text-xs text-gray-500 p-3" data-testid="scatter-empty">
        No rows have numeric values for both {xField} and {yField}.
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid="scatter-plot">
      <div className="text-[11px] text-gray-500 font-mono">
        {pointCount.toLocaleString('en-US')} point{pointCount === 1 ? '' : 's'}
      </div>
      <div
        ref={containerRef}
        className="rounded-md border border-gray-200 bg-white p-1"
      />
    </div>
  );
}
