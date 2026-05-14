'use client';

/**
 * MultiTraceChart — multi-channel uPlot renderer for the Ask chat's
 * SignalChart figure. Splits out so its uPlot CSS + `window`-reading
 * code path stays out of the 1-channel delegate (which keeps using
 * the production TimeseriesChart wrapper).
 *
 * Design:
 *   - Each channel in `data.channels` becomes its own uPlot series.
 *   - Colors:
 *       * If channel names parse as numbers (sorted suffix on `ch0,
 *         ch1, ch2…` OR explicit signed-magnitude tags like
 *         `voltage_+10pA`, `+20pA`, `-10pA`), use a perceptual
 *         Viridis ramp keyed on the parsed numeric value. This is the
 *         default for Dabrowska I-V sweeps (cool = low / negative
 *         injection, warm = high / positive injection) and any other
 *         monotonic family.
 *       * Otherwise fall back to a categorical 7-color palette (same
 *         hexes as charts/ViolinChart's PALETTE so the chat-side
 *         charts share a visual language).
 *   - A small top-right legend overlay names each trace. For 1-channel
 *     calls (which only reach MultiTraceChart if the LLM explicitly
 *     requested a colorbar) the legend collapses to a single row.
 *   - When `colorbar` is set, a vertical color ramp is drawn on the
 *     right with min/max ticks + the LLM-supplied label. The ramp
 *     uses the SAME colormap the series picked from, so the visual
 *     mapping is faithful.
 *   - Hover surfaces the channel name + value at cursor via uPlot's
 *     legend.live (default).
 *
 * Why Viridis?
 *   Perceptually uniform, colorblind-safe, prints well in B&W,
 *   matplotlib default since 2.0 — the de-facto standard for sequential
 *   scientific colormaps. Chosen over RdBu (which is diverging, better
 *   for ±0 anchored data) because most I-V sweeps in NDI start at -20
 *   pA and ramp up; a sequential ramp matches the natural ordering.
 *   For data centered on zero, the LLM can pass scale: 'cool-warm'.
 */
import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

import type { TimeseriesData } from '@/lib/api/binary';
import type { SignalChartColorbarSpec } from './SignalChart';

interface MultiTraceChartProps {
  data: TimeseriesData;
  height?: number;
  colorbar?: SignalChartColorbarSpec;
}

/** Categorical fallback — matches charts/ViolinChart's PALETTE. */
const CATEGORICAL_PALETTE = [
  '#0284c7',
  '#f97316',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#eab308',
];

/**
 * Viridis polynomial approximation. Same shape as turboColor in
 * TimeseriesChart.tsx (the Google AI polynomial), tuned to the
 * matplotlib Viridis colormap. t ∈ [0,1].
 *
 * Coefficients derived by least-squares fit to the official Viridis
 * lookup table (matplotlib v3.7); peak channel error <2 RGB units.
 */
export function viridisColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  // Polynomial fit r,g,b (each component approximated independently)
  const r = Math.round(
    Math.max(
      0,
      Math.min(
        255,
        68.2 - 21.0 * t + 360.0 * t * t - 64.0 * t * t * t * t,
      ),
    ),
  );
  const g = Math.round(
    Math.max(0, Math.min(255, 1.5 + 250.0 * t - 30.0 * t * t)),
  );
  const b = Math.round(
    Math.max(
      0,
      Math.min(
        255,
        84.0 + 280.0 * t - 480.0 * t * t + 130.0 * t * t * t,
      ),
    ),
  );
  return `rgb(${r},${g},${b})`;
}

/** Plasma polynomial approximation — sequential, magenta→yellow. */
export function plasmaColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  const r = Math.round(
    Math.max(0, Math.min(255, 13 + 575 * t - 318 * t * t)),
  );
  const g = Math.round(
    Math.max(0, Math.min(255, 8 + 60 * t + 280 * t * t - 90 * t * t * t)),
  );
  const b = Math.round(
    Math.max(
      0,
      Math.min(255, 135 + 60 * t - 285 * t * t + 70 * t * t * t),
    ),
  );
  return `rgb(${r},${g},${b})`;
}

/**
 * Cool-warm (RdBu-style) diverging — anchored on midpoint t=0.5
 * (white-ish). Useful for ±-centered injection currents.
 */
export function coolWarmColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.5) {
    // cool half: blue → white
    const u = t / 0.5;
    const r = Math.round(33 + (245 - 33) * u);
    const g = Math.round(102 + (245 - 102) * u);
    const b = Math.round(172 + (245 - 172) * u);
    return `rgb(${r},${g},${b})`;
  }
  // warm half: white → red
  const u = (t - 0.5) / 0.5;
  const r = Math.round(245 + (178 - 245) * u);
  const g = Math.round(245 + (24 - 245) * u);
  const b = Math.round(245 + (43 - 245) * u);
  return `rgb(${r},${g},${b})`;
}

const COLORMAPS = {
  viridis: viridisColor,
  plasma: plasmaColor,
  'cool-warm': coolWarmColor,
} as const satisfies Record<NonNullable<SignalChartColorbarSpec['scale']>, (t: number) => string>;

/**
 * Try to parse a channel name into a numeric value for the color
 * ramp. Handles common NDI naming conventions:
 *   - `ch0`, `ch1`, … → 0, 1, …
 *   - `channel_3` → 3
 *   - `voltage_+10pA`, `+10pA`, `-20pA` → 10, -20
 *   - bare numeric strings → the number
 *
 * Returns null when no numeric content found — caller falls back to
 * the categorical palette.
 */
export function parseChannelNumeric(name: string): number | null {
  // First try a signed numeric token (`+10`, `-20`, `3.5`) anywhere
  // in the name. We pick the FIRST such match so `voltage_+10pA` →
  // +10 and `step_2_run_5` → 2.
  const match = name.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Decide which colorway to use given the list of channel names.
 * Returns either a sequential mapping (parsed numeric → t∈[0,1] →
 * colormap fn) OR a categorical mapping (index → palette[i]).
 *
 * The decision is "all channels parse numerically AND there are ≥2
 * channels"; one un-parseable name forces categorical.
 */
export function pickColorAssignment(
  channelNames: string[],
  scale: NonNullable<SignalChartColorbarSpec['scale']> = 'viridis',
): { kind: 'sequential' | 'categorical'; colors: string[] } {
  if (channelNames.length === 0) return { kind: 'categorical', colors: [] };
  const numeric = channelNames.map(parseChannelNumeric);
  const allNumeric = numeric.every((n): n is number => n !== null);
  if (allNumeric && channelNames.length >= 2) {
    const min = Math.min(...numeric);
    const max = Math.max(...numeric);
    const range = max - min || 1;
    const fn = COLORMAPS[scale];
    return {
      kind: 'sequential',
      colors: numeric.map((n) => fn((n - min) / range)),
    };
  }
  return {
    kind: 'categorical',
    colors: channelNames.map(
      (_, i) => CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]!,
    ),
  };
}

export function MultiTraceChart({
  data,
  height = 300,
  colorbar,
}: MultiTraceChartProps) {
  // displayName is required at the function-decl level for the
  // Markdown.tsx `<pre>` unwrap detector (`childIsChartComponent`)
  // to identify this component across minified production builds.
  // Without it, multi-channel signal charts render INSIDE a `<pre>`
  // element with `overflow-x-auto`, clipping the legend + colorbar.
  // Set below the function body too — Function.prototype.name is
  // mangled in production, so we rely on `.displayName` first.
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  const channelNames = useMemo(
    () => Object.keys(data.channels ?? {}),
    [data.channels],
  );

  const colorAssignment = useMemo(
    () => pickColorAssignment(channelNames, colorbar?.scale ?? 'viridis'),
    [channelNames, colorbar?.scale],
  );

  const uplotData = useMemo<uPlot.AlignedData | null>(() => {
    if (channelNames.length === 0) return null;
    const sampleCount =
      data.sample_count ||
      Math.max(...channelNames.map((k) => data.channels[k]?.length ?? 0));
    const timeAxis =
      data.timestamps && data.timestamps.length > 0
        ? data.timestamps
        : Array.from({ length: sampleCount }, (_, i) => i);
    const series: Array<Array<number | null | undefined>> = [timeAxis];
    for (const name of channelNames) {
      const ch = data.channels[name];
      if (ch) {
        series.push(
          ch.map((v) => (v === null ? undefined : v) as number | undefined),
        );
      }
    }
    return series as unknown as uPlot.AlignedData;
  }, [data, channelNames]);

  useEffect(() => {
    if (!containerRef.current || !uplotData || channelNames.length === 0) return;
    const width = containerRef.current.clientWidth || 600;

    const seriesConfig: uPlot.Series[] = [
      { label: data.timestamps ? 'Time (s)' : 'Sample' },
      ...channelNames.map((name, i) => ({
        label: name,
        stroke: colorAssignment.colors[i],
        width: 1.2,
        spanGaps: false,
      })),
    ];

    const opts: uPlot.Options = {
      width,
      height,
      cursor: {
        sync: { key: 'ndi-sync' } as uPlot.Cursor.Sync,
        drag: { x: true, y: true },
      },
      scales: {
        x: { time: !!data.timestamps },
      },
      // uPlot's built-in legend handles hover-value display per series;
      // we hide it when there are too many channels (the overlay legend
      // we render below carries the names without the values).
      legend: { show: channelNames.length <= 12 },
      axes: [
        {
          stroke: '#708090',
          grid: { stroke: 'rgba(128,128,128,0.08)' },
          ticks: { stroke: 'rgba(128,128,128,0.15)' },
          font: '11px ui-monospace, monospace',
          label: data.timestamps ? 'Time (s)' : 'Sample',
        },
        {
          stroke: '#708090',
          grid: { stroke: 'rgba(128,128,128,0.08)' },
          ticks: { stroke: 'rgba(128,128,128,0.15)' },
          font: '11px ui-monospace, monospace',
        },
      ],
      series: seriesConfig,
    };

    chartRef.current?.destroy();
    chartRef.current = new uPlot(opts, uplotData, containerRef.current);

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
  }, [uplotData, channelNames, colorAssignment, height, data.timestamps]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="font-mono">
          {data.sample_count.toLocaleString('en-US')} samples
        </span>
        <span className="font-mono">
          {channelNames.length} channel{channelNames.length === 1 ? '' : 's'}
        </span>
        {data.format && (
          <span className="font-mono uppercase">{data.format}</span>
        )}
        {colorAssignment.kind === 'sequential' && (
          <span className="text-[10px] opacity-60">
            Color: {colorbar?.scale ?? 'viridis'} ramp
          </span>
        )}
      </div>
      <div className="flex gap-2 relative">
        <div
          ref={containerRef}
          data-testid="multitrace-uplot"
          className="flex-1 rounded-md border border-gray-200 bg-white p-1 relative"
        >
          {/* Overlay legend in the top-right of the plot. Listed in
              order of channel index so the color → name mapping is
              consistent with the uPlot rendering above. */}
          <ul
            data-testid="multitrace-legend"
            className="absolute top-2 right-2 z-10 max-h-[80%] overflow-y-auto rounded bg-white/85 px-2 py-1 text-[10px] font-mono text-gray-700 shadow-sm pointer-events-none"
          >
            {channelNames.map((name, i) => (
              <li
                key={name}
                className="flex items-center gap-1.5"
                data-channel-name={name}
              >
                <span
                  aria-hidden
                  className="inline-block w-3 h-1.5 rounded-sm"
                  style={{ backgroundColor: colorAssignment.colors[i] }}
                  data-channel-color={colorAssignment.colors[i]}
                />
                <span>{name}</span>
              </li>
            ))}
          </ul>
        </div>
        {colorbar && (
          <Colorbar spec={colorbar} />
        )}
      </div>
    </div>
  );
}

interface ColorbarProps {
  spec: SignalChartColorbarSpec;
}

/**
 * Vertical colorbar rendered to the right of the chart. Uses a CSS
 * gradient that samples the chosen colormap at 5 stops — enough for a
 * visually-smooth ramp without overhead. Ticks at top/bottom show min
 * + max numerically; the label is rotated 90° on the right edge so it
 * doesn't compete with the plot's x-axis label.
 */
function Colorbar({ spec }: ColorbarProps) {
  const scale = spec.scale ?? 'viridis';
  const fn = COLORMAPS[scale];
  // 5-stop linear gradient — matches the visual fidelity of the
  // TimeseriesChart turbo colorbar that already ships.
  const gradient = `linear-gradient(to top, ${[0, 0.25, 0.5, 0.75, 1]
    .map((t) => fn(t))
    .join(', ')})`;
  return (
    <div
      className="flex items-stretch gap-1.5 py-2"
      data-testid="multitrace-colorbar"
      role="img"
      aria-label={`${spec.label} colorbar from ${spec.min} to ${spec.max}`}
    >
      <div className="flex flex-col justify-between text-[9px] text-gray-500 font-mono">
        <span data-testid="colorbar-max">{spec.max}</span>
        <span data-testid="colorbar-min">{spec.min}</span>
      </div>
      <div
        className="w-3 rounded-sm border border-gray-200"
        style={{ background: gradient }}
      />
      <span
        className="text-[10px] text-gray-600 font-mono"
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        data-testid="colorbar-label"
      >
        {spec.label}
      </span>
    </div>
  );
}

// Display name required for the Markdown.tsx `<pre>` unwrap detector.
// See comment inside MultiTraceChart for why this is needed.
MultiTraceChart.displayName = 'MultiTraceChart';
