'use client';

import { useMemo } from 'react';
import * as d3Array from 'd3-array';
import * as d3Scale from 'd3-scale';

interface BarChartByGroupProps {
  /** Pre-aggregated counts: `{ name, count }`. The host component
   *  computes these from in-memory `table.rows` — no API call needed. */
  bars: Array<{ name: string; count: number }>;
  xLabel: string;
  width?: number;
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
const MARGIN = { top: 20, right: 30, bottom: 60, left: 70 };

/** Bar chart of row-count per categorical group.
 *
 *  Useful as the "what does my data look like?" first-glance plot — it
 *  renders even when no Y field is selected (`bars` is computed from
 *  `groupBy` + `table.rows` only). Sorted by count descending so the
 *  reader sees the dominant groups first. */
export function BarChartByGroup({
  bars,
  xLabel,
  width = 600,
  height = 400,
}: BarChartByGroupProps) {
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const sortedBars = useMemo(
    () => [...bars].sort((a, b) => b.count - a.count),
    [bars],
  );

  const { xScale, yScale } = useMemo(() => {
    const maxCount = d3Array.max(sortedBars, (b) => b.count) ?? 1;
    const yScale = d3Scale
      .scaleLinear()
      .domain([0, maxCount * 1.05])
      .range([innerH, 0]);
    const xScale = d3Scale
      .scaleBand()
      .domain(sortedBars.map((b) => b.name))
      .range([0, innerW])
      .padding(0.2);
    return { xScale, yScale };
  }, [sortedBars, innerW, innerH]);

  const yTicks = yScale.ticks(5);

  return (
    <div className="overflow-x-auto" data-testid="bar-chart-svg-wrap">
      <svg
        width={width}
        height={height}
        className="font-mono text-[10px] text-gray-700"
        data-testid="bar-chart-svg"
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Y grid + axis */}
          {yTicks.map((tick) => (
            <line
              key={tick}
              x1={0}
              x2={innerW}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
          ))}
          <line x1={0} x2={0} y1={0} y2={innerH} stroke="currentColor" strokeOpacity={0.2} />
          {yTicks.map((tick) => (
            <g key={tick} transform={`translate(0,${yScale(tick)})`}>
              <line x1={-4} x2={0} stroke="currentColor" strokeOpacity={0.3} />
              <text x={-8} dy="0.32em" textAnchor="end" fill="currentColor" fillOpacity={0.6}>
                {tick}
              </text>
            </g>
          ))}
          <text
            transform={`translate(-50,${innerH / 2}) rotate(-90)`}
            textAnchor="middle"
            fill="currentColor"
            fillOpacity={0.7}
            className="text-[11px]"
          >
            count
          </text>
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="currentColor" strokeOpacity={0.2} />

          {/* Bars */}
          {sortedBars.map((bar, i) => {
            const x = xScale(bar.name) ?? 0;
            const y = yScale(bar.count);
            const w = xScale.bandwidth();
            const h = innerH - y;
            const color = COLORS[i % COLORS.length];
            return (
              <g key={bar.name}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={color}
                  fillOpacity={0.55}
                  stroke={color}
                  strokeWidth={1}
                />
                {h > 12 && (
                  <text
                    x={x + w / 2}
                    y={y - 3}
                    textAnchor="middle"
                    fill="currentColor"
                    fillOpacity={0.7}
                    className="text-[9px]"
                  >
                    {bar.count}
                  </text>
                )}
                <text
                  x={x + w / 2}
                  y={innerH + 14}
                  textAnchor="middle"
                  fill="currentColor"
                  fillOpacity={0.7}
                  transform={`rotate(-30, ${x + w / 2}, ${innerH + 14})`}
                >
                  {bar.name.length > 16 ? bar.name.slice(0, 16) + '…' : bar.name}
                </text>
              </g>
            );
          })}
          <text
            x={innerW / 2}
            y={innerH + 50}
            textAnchor="middle"
            fill="currentColor"
            fillOpacity={0.7}
            className="text-[11px]"
          >
            {xLabel}
          </text>
        </g>
      </svg>
    </div>
  );
}
