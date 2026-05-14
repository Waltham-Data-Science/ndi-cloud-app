'use client';

import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

import { coerceNumber } from '@/lib/viewer/math';

interface LinePlotProps {
  /** In-memory rows from the host SummaryTableView. The component pulls
   *  numeric values from `xField` + `yField` directly — no API call. */
  rows: ReadonlyArray<Record<string, unknown>>;
  xField: string;
  yField: string;
  xLabel?: string;
  yLabel?: string;
  height?: number;
}

const STROKE = '#0284c7';

/** Line plot via uPlot. Used when both X and Y are numeric AND X is
 *  time-shaped (column name matches /^(time|t|epoch|trial|frame|
 *  timestamp|sec|seconds|ms)$/i AND values are monotonically
 *  non-decreasing in `table.rows`). The plot reads in-memory `rows` so
 *  no backend changes are needed.
 *
 *  Single-trace only; multi-Y / multi-trace is explicitly out of scope
 *  per the redesign spec — plots needing two Y axes are matplotlib
 *  territory. */
export function LinePlot({
  rows,
  xField,
  yField,
  xLabel,
  yLabel,
  height = 360,
}: LinePlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  const { aligned, pointCount } = useMemo(() => {
    type Pt = { x: number; y: number };
    const points: Pt[] = [];
    for (const row of rows) {
      const x = coerceNumber(row[xField]);
      const y = coerceNumber(row[yField]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push({ x, y });
    }
    if (points.length === 0) {
      return { aligned: null as uPlot.AlignedData | null, pointCount: 0 };
    }
    // Sort by x — uPlot requires monotonically non-decreasing x. The
    // inferPlotShape gate already guarantees the source data is
    // non-decreasing, but a defensive sort here lets LinePlot also be
    // used standalone in tests / future contexts.
    points.sort((a, b) => a.x - b.x);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const data: uPlot.AlignedData = [xs, ys] as unknown as uPlot.AlignedData;
    return { aligned: data, pointCount: points.length };
  }, [rows, xField, yField]);

  const seriesConfig: uPlot.Series[] = useMemo(
    () => [
      { label: xLabel || xField },
      {
        label: yLabel || yField,
        stroke: STROKE,
        width: 1.5,
        points: { show: false },
      },
    ],
    [xField, yField, xLabel, yLabel],
  );

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
      scales: { x: { time: false } },
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
      <div className="text-xs text-gray-500 p-3" data-testid="line-empty">
        No rows have numeric values for both {xField} and {yField}.
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid="line-plot">
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
