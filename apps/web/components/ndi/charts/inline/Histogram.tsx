'use client';

import { useMemo } from 'react';
import * as d3Array from 'd3-array';
import * as d3Scale from 'd3-scale';

import { histogramBins } from '@/lib/viewer/math';
import type { ViolinGroup } from './ViolinPlot';

interface HistogramProps {
  /** When `groups.length === 1` we render an ungrouped histogram. When >1
   *  we overlay each group with `fillOpacity=0.4` and a per-group color,
   *  with a legend at the top. Bins are computed independently per group
   *  but share the same x-domain (overall min/max across groups) so the
   *  bars line up visually. */
  groups: ViolinGroup[];
  yLabel: string;
  xLabel: string;
  width?: number;
  height?: number;
  /** Optional bin-count override. When omitted, a Sturges-style estimate
   *  is used (`ceil(log2(n) + 1)` clamped to [10, 50]). */
  binCount?: number;
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

/** Histogram chart — single-axis frequency plot from raw values.
 *
 *  Data flow: same `groups[].values` payload as ViolinPlot/BoxPlot. We
 *  call `histogramBins(values)` per group, share the x-domain so bars
 *  align, and overlay groups with alpha=0.4. Single-group degenerates
 *  to a solid (alpha=0.7) histogram. */
export function Histogram({
  groups,
  yLabel,
  xLabel,
  width = 600,
  height = 400,
  binCount,
}: HistogramProps) {
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const { bars, xScale, yScale } = useMemo(() => {
    const allValues = groups.flatMap((g) => g.values);
    const xMin = d3Array.min(allValues) ?? 0;
    const xMax = d3Array.max(allValues) ?? 1;
    const xPad = (xMax - xMin) * 0.02 || 0.5;

    const xScale = d3Scale
      .scaleLinear()
      .domain([xMin - xPad, xMax + xPad])
      .range([0, innerW]);

    const perGroup = groups.map((group) => ({
      group,
      bins: histogramBins(group.values, binCount),
    }));
    // Share y-domain across groups so visual heights are comparable.
    const maxCount = d3Array.max(perGroup.flatMap((g) => g.bins.map((b) => b.count))) ?? 1;
    const yScale = d3Scale
      .scaleLinear()
      .domain([0, maxCount * 1.05])
      .range([innerH, 0]);

    return { bars: perGroup, xScale, yScale };
  }, [groups, innerW, innerH, binCount]);

  const yTicks = yScale.ticks(5);
  const xTicks = xScale.ticks(8);
  const isOverlay = groups.length > 1;
  const fillOpacity = isOverlay ? 0.4 : 0.7;

  return (
    <div className="overflow-x-auto" data-testid="histogram-svg-wrap">
      {isOverlay && (
        <div className="flex flex-wrap gap-3 px-2 pb-1 text-[11px] font-mono text-gray-700">
          {groups.map((g, i) => (
            <span key={g.name} className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              {g.name.length > 18 ? g.name.slice(0, 18) + '…' : g.name}
            </span>
          ))}
        </div>
      )}
      <svg
        width={width}
        height={height}
        className="font-mono text-[10px] text-gray-700"
        data-testid="histogram-svg"
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

          {/* X axis */}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="currentColor" strokeOpacity={0.2} />
          {xTicks.map((tick) => (
            <g key={tick} transform={`translate(${xScale(tick)},${innerH})`}>
              <line y1={0} y2={4} stroke="currentColor" strokeOpacity={0.3} />
              <text y={14} textAnchor="middle" fill="currentColor" fillOpacity={0.6}>
                {formatTick(tick)}
              </text>
            </g>
          ))}
          <text
            x={innerW / 2}
            y={innerH + 36}
            textAnchor="middle"
            fill="currentColor"
            fillOpacity={0.7}
            className="text-[11px]"
          >
            {(yLabel.length > 60 ? yLabel.slice(0, 57) + '…' : yLabel) || xLabel}
          </text>

          {/* Bars (per-group, overlaid) */}
          {bars.map(({ group, bins }, i) => {
            const color = COLORS[i % COLORS.length];
            return (
              <g key={group.name}>
                {bins.map((bin, j) => {
                  const x = xScale(bin.x0);
                  const w = Math.max(0.5, xScale(bin.x1) - xScale(bin.x0) - 1);
                  const y = yScale(bin.count);
                  const h = innerH - y;
                  if (h <= 0) return null;
                  return (
                    <rect
                      key={`${group.name}-${j}`}
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill={color}
                      fillOpacity={fillOpacity}
                      stroke={color}
                      strokeWidth={isOverlay ? 0 : 0.5}
                    />
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/** Compact tick-label formatter — keeps the x-axis legible across orders of
 *  magnitude. Falls back to fixed-precision when the value is small.  */
function formatTick(v: number): string {
  if (!Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (abs === 0) return '0';
  if (abs >= 10000 || abs < 0.01) return v.toExponential(1);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 1) return v.toFixed(1);
  return v.toFixed(2);
}
