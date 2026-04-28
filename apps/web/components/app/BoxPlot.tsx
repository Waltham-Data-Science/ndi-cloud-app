'use client';

import { useMemo } from 'react';
import * as d3Array from 'd3-array';
import * as d3Scale from 'd3-scale';

import type { ViolinGroup } from './ViolinPlot';

interface BoxPlotProps {
  groups: ViolinGroup[];
  yLabel: string;
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
const MARGIN = { top: 20, right: 30, bottom: 50, left: 70 };

/** Box + whiskers plot. Sibling of `ViolinPlot` — reads the same
 *  `groups[]` payload from `/api/visualize/distribution` (q1, median, q3,
 *  min, max + raw `values`) but renders the standard Tukey boxplot
 *  rather than the kernel-density violin. Use when n is too small for
 *  KDE to be meaningful (n < ~10 per group) or when the user wants the
 *  cleaner aggregate view. */
export function BoxPlot({
  groups,
  yLabel,
  xLabel,
  width = 600,
  height = 400,
}: BoxPlotProps) {
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const { xScale, yScale } = useMemo(() => {
    const allValues = groups.flatMap((g) => g.values);
    const yMin = d3Array.min(allValues) ?? 0;
    const yMax = d3Array.max(allValues) ?? 1;
    const yPad = (yMax - yMin) * 0.1 || 1;

    const yScale = d3Scale
      .scaleLinear()
      .domain([yMin - yPad, yMax + yPad])
      .range([innerH, 0]);
    const xScale = d3Scale
      .scaleBand()
      .domain(groups.map((g) => g.name))
      .range([0, innerW])
      .padding(0.3);

    return { xScale, yScale };
  }, [groups, innerW, innerH]);

  const yTicks = yScale.ticks(6);

  return (
    <div className="overflow-x-auto" data-testid="box-plot-svg-wrap">
      <svg
        width={width}
        height={height}
        className="font-mono text-[10px] text-gray-700"
        data-testid="box-plot-svg"
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Y-axis grid + ticks */}
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
            {yLabel.length > 50 ? yLabel.slice(0, 47) + '…' : yLabel}
          </text>
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="currentColor" strokeOpacity={0.2} />

          {groups.map((group, i) => {
            const cx = (xScale(group.name) ?? 0) + xScale.bandwidth() / 2;
            const color = COLORS[i % COLORS.length];
            const halfW = (xScale.bandwidth() / 2) * 0.7;
            return (
              <g key={group.name} transform={`translate(${cx},0)`}>
                {/* Whiskers (min - q1) and (q3 - max) */}
                <line
                  x1={0}
                  x2={0}
                  y1={yScale(group.min)}
                  y2={yScale(group.q1)}
                  stroke={color}
                  strokeWidth={1}
                />
                <line
                  x1={0}
                  x2={0}
                  y1={yScale(group.q3)}
                  y2={yScale(group.max)}
                  stroke={color}
                  strokeWidth={1}
                />
                {/* Whisker caps */}
                <line
                  x1={-halfW / 2}
                  x2={halfW / 2}
                  y1={yScale(group.min)}
                  y2={yScale(group.min)}
                  stroke={color}
                  strokeWidth={1}
                />
                <line
                  x1={-halfW / 2}
                  x2={halfW / 2}
                  y1={yScale(group.max)}
                  y2={yScale(group.max)}
                  stroke={color}
                  strokeWidth={1}
                />
                {/* IQR box */}
                <rect
                  x={-halfW}
                  y={yScale(group.q3)}
                  width={halfW * 2}
                  height={Math.max(1, yScale(group.q1) - yScale(group.q3))}
                  fill={color}
                  fillOpacity={0.25}
                  stroke={color}
                  strokeWidth={1}
                />
                {/* Median line */}
                <line
                  x1={-halfW}
                  x2={halfW}
                  y1={yScale(group.median)}
                  y2={yScale(group.median)}
                  stroke={color}
                  strokeWidth={2}
                />
                <text y={innerH + 16} textAnchor="middle" fill="currentColor" fillOpacity={0.7}>
                  {group.name.length > 12 ? group.name.slice(0, 12) + '…' : group.name}
                </text>
                <text
                  y={innerH + 28}
                  textAnchor="middle"
                  fill="currentColor"
                  fillOpacity={0.4}
                  className="text-[9px]"
                >
                  n={group.count}
                </text>
              </g>
            );
          })}
          <text
            x={innerW / 2}
            y={innerH + 44}
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
