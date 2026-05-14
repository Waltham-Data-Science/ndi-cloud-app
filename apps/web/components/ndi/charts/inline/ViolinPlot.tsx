'use client';

import { useMemo } from 'react';
import * as d3Array from 'd3-array';
import * as d3Scale from 'd3-scale';
import * as d3Shape from 'd3-shape';

import { kernelDensity, silvermanBandwidth } from '@/lib/viewer/math';

export interface ViolinGroup {
  name: string;
  values: number[];
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
}

interface ViolinPlotProps {
  groups: ViolinGroup[];
  yLabel: string;
  xLabel: string;
  width?: number;
  height?: number;
}

// `kernelDensity` and `silvermanBandwidth` extracted to
// `apps/web/lib/viewer/math.ts` (CQ3) so the math primitives can be
// unit-tested in isolation. The chart's behavior is unchanged — this
// is a pure refactor.

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

/** Violin + box + jitter plot — ported from v1. Deterministic jitter
 * (hashed from index) so re-renders don't reshuffle point positions. */
export function ViolinPlot({
  groups,
  yLabel,
  xLabel,
  width = 600,
  height = 400,
}: ViolinPlotProps) {
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const { xScale, yScale, violins } = useMemo(() => {
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
      .padding(0.2);

    const violins = groups.map((group) => {
      if (group.values.length < 2) {
        return { group, pathLeft: '', pathRight: '', densityMax: 0 };
      }
      const bw = silvermanBandwidth(group.values);
      const density = kernelDensity(group.values, bw, [yMin - yPad, yMax + yPad]);
      const densityMax = d3Array.max(density, (d) => d[1]) ?? 1;
      const halfWidth = (xScale.bandwidth() / 2) * 0.9;
      const areaLeft = d3Shape
        .area<[number, number]>()
        .x0((d) => -((d[1] / densityMax) * halfWidth))
        .x1(() => 0)
        .y((d) => yScale(d[0]))
        .curve(d3Shape.curveBasis)(density);
      const areaRight = d3Shape
        .area<[number, number]>()
        .x0(() => 0)
        .x1((d) => (d[1] / densityMax) * halfWidth)
        .y((d) => yScale(d[0]))
        .curve(d3Shape.curveBasis)(density);
      return { group, pathLeft: areaLeft ?? '', pathRight: areaRight ?? '', densityMax };
    });

    return { xScale, yScale, violins };
  }, [groups, innerW, innerH]);

  const yTicks = yScale.ticks(6);

  return (
    <div className="overflow-x-auto" data-testid="violin-plot-svg-wrap">
      <svg
        width={width}
        height={height}
        className="font-mono text-[10px] text-gray-700"
        data-testid="violin-plot-svg"
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Grid */}
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

          {violins.map(({ group, pathLeft, pathRight }, i) => {
            const cx = (xScale(group.name) ?? 0) + xScale.bandwidth() / 2;
            const color = COLORS[i % COLORS.length];
            return (
              <g key={group.name} transform={`translate(${cx},0)`}>
                {pathLeft && (
                  <path d={pathLeft} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={1} />
                )}
                {pathRight && (
                  <path d={pathRight} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={1} />
                )}
                <rect
                  data-testid="violin-iqr-box"
                  x={-4}
                  y={yScale(group.q3)}
                  width={8}
                  height={Math.max(1, yScale(group.q1) - yScale(group.q3))}
                  fill="#1f2937"
                  fillOpacity={0.85}
                  rx={1}
                />
                <line
                  x1={0}
                  x2={0}
                  y1={yScale(group.min)}
                  y2={yScale(group.q1)}
                  stroke="#1f2937"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                />
                <line
                  x1={0}
                  x2={0}
                  y1={yScale(group.q3)}
                  y2={yScale(group.max)}
                  stroke="#1f2937"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                />
                <circle
                  data-testid="violin-median-dot"
                  cx={0}
                  cy={yScale(group.median)}
                  r={2.5}
                  fill="white"
                  stroke="#1f2937"
                  strokeWidth={0.75}
                />
                <g data-testid="violin-points">
                  {group.values.map((v, j) => (
                    <circle
                      key={j}
                      cx={_hashJitter(group.name, j)}
                      cy={yScale(v)}
                      r={1.5}
                      fill={color}
                      fillOpacity={group.values.length > 100 ? 0.25 : 0.5}
                    />
                  ))}
                </g>
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

/** Deterministic hash-based jitter (±6px). Stable across re-renders. */
function _hashJitter(key: string, i: number): number {
  const s = `${key}_${i}`;
  let h = 0;
  for (let c = 0; c < s.length; c++) {
    h = (h * 31 + s.charCodeAt(c)) | 0;
  }
  // Map to [-6, 6].
  const norm = ((h % 2000) + 2000) % 2000;
  return (norm / 1000 - 1) * 6;
}
