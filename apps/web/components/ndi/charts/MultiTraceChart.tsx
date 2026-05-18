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

/**
 * Per-point coloring modes for the `colorBy` prop.
 *
 *   - `null` — default; each trace is drawn in a single channel color.
 *   - `'time'` — color each point of a trace by its position along the
 *     time axis (or sample index when no timestamps). Useful for
 *     visualizing the evolution of a recording.
 *   - `'index'` — color each point by its sample index. Equivalent to
 *     'time' when timestamps are absent, but stays consistent even on
 *     wall-clock-anchored traces.
 *   - `'value'` — color each point by its y-axis value (normalized to
 *     the trace's own min/max). Useful for highlighting amplitude
 *     features.
 */
export type ColorByMode = 'time' | 'index' | 'value' | null;

interface MultiTraceChartProps {
  data: TimeseriesData;
  height?: number;
  colorbar?: SignalChartColorbarSpec;
  /**
   * Per-point continuous coloring mode. When non-null, each trace's
   * line is drawn as a sequence of small viridis-colored segments
   * keyed on the chosen axis. Default `null` keeps the legacy single-
   * color-per-trace rendering.
   */
  colorBy?: ColorByMode;
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

/**
 * Compute a normalized t ∈ [0,1] for each point of a channel given a
 * coloring mode. The result feeds into a colormap function (viridis by
 * default) to produce the per-segment stroke color.
 *
 * Extracted as a pure function so it can be unit-tested without
 * touching uPlot or React.
 *
 *   - `'time'` requires a `timeAxis` of the same length as `values`;
 *     ramps from t=0 at the first timestamp to t=1 at the last.
 *   - `'index'` ramps from t=0 at i=0 to t=1 at i=len-1.
 *   - `'value'` ramps from t=0 at min(values) to t=1 at max(values).
 *     Null/undefined values map to t=NaN (caller skips them).
 *   - A degenerate range (single point, or min === max) collapses to
 *     t=0 for all points; uPlot just draws nothing visible there.
 */
export function computeColorRamp(
  values: ReadonlyArray<number | null | undefined>,
  mode: NonNullable<ColorByMode>,
  timeAxis?: ReadonlyArray<number>,
): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (mode === 'index') {
    if (n === 1) return [0];
    const denom = n - 1;
    return Array.from({ length: n }, (_, i) => i / denom);
  }
  if (mode === 'time') {
    if (!timeAxis || timeAxis.length === 0) {
      // Fall through to index when no timestamps are available — the
      // visual result is the same as 'index'.
      if (n === 1) return [0];
      const denom = n - 1;
      return Array.from({ length: n }, (_, i) => i / denom);
    }
    const first = timeAxis[0]!;
    const last = timeAxis[timeAxis.length - 1]!;
    const range = last - first || 1;
    return Array.from({ length: n }, (_, i) => {
      const t = timeAxis[i];
      if (typeof t !== 'number' || !Number.isFinite(t)) return 0;
      return (t - first) / range;
    });
  }
  // mode === 'value'
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return Array.from({ length: n }, () => 0);
  }
  const range = max - min || 1;
  return values.map((v) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return Number.NaN;
    return (v - min) / range;
  });
}

/**
 * Per-segment line drawer for uPlot. Replaces the default line path
 * builder with one that strokes each consecutive pair of points in a
 * different color, looked up via the supplied colormap. The result is
 * a smoothly-coloring line whose stroke evolves along the chosen axis.
 *
 * Returning `null` from the paths builder tells uPlot we drew the
 * series ourselves (in the supplied draw hook); uPlot won't add its
 * own stroke on top.
 *
 * NOTE: we mutate the supplied 2D context — that's how every uPlot
 * custom-paths recipe works. The series's existing stroke/width
 * settings are still honored for the legend swatch (a single color
 * from the ramp midpoint).
 */
export function makePerSegmentPaths(
  rampColors: ReadonlyArray<string | null>,
  width: number,
): uPlot.Series.PathBuilder {
  return (u: uPlot, seriesIdx: number, idx0: number, idx1: number) => {
    const ctx = u.ctx;
    const xData = u.data[0] as ReadonlyArray<number>;
    const yData = u.data[seriesIdx] as ReadonlyArray<number | null | undefined>;
    ctx.save();
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = idx0; i < idx1; i++) {
      const x0 = xData[i];
      const y0 = yData[i];
      const x1 = xData[i + 1];
      const y1 = yData[i + 1];
      // Skip segments where either endpoint is missing — preserves the
      // existing spanGaps=false semantics of the default renderer.
      if (
        typeof x0 !== 'number' ||
        typeof x1 !== 'number' ||
        y0 === null ||
        y0 === undefined ||
        !Number.isFinite(y0) ||
        y1 === null ||
        y1 === undefined ||
        !Number.isFinite(y1)
      ) {
        continue;
      }
      const color = rampColors[i] ?? null;
      if (!color) continue;
      const px0 = u.valToPos(x0, 'x', true);
      const py0 = u.valToPos(y0 as number, 'y', true);
      const px1 = u.valToPos(x1, 'x', true);
      const py1 = u.valToPos(y1 as number, 'y', true);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(px0, py0);
      ctx.lineTo(px1, py1);
      ctx.stroke();
    }
    ctx.restore();
    return null;
  };
}

export function MultiTraceChart({
  data,
  height = 300,
  colorbar,
  colorBy = null,
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

    // When colorBy is active, compute a viridis-mapped per-segment
    // color array for each channel and install a custom paths builder
    // that strokes the line piecewise. The legend swatch keeps the
    // colorAssignment color (the trace's "primary" color) so the
    // sequential / categorical legend pattern stays intact.
    const colormap = COLORMAPS[colorbar?.scale ?? 'viridis'];
    const ramps: Array<string[] | null> = channelNames.map((name) => {
      if (!colorBy) return null;
      const channelValues = data.channels[name];
      if (!channelValues) return null;
      const timeAxis =
        data.timestamps && data.timestamps.length === channelValues.length
          ? data.timestamps
          : undefined;
      const ts = computeColorRamp(channelValues, colorBy, timeAxis);
      return ts.map((t) => (Number.isFinite(t) ? colormap(t) : null)) as string[];
    });

    const seriesConfig: uPlot.Series[] = [
      { label: data.timestamps ? 'Time (s)' : 'Sample' },
      ...channelNames.map((name, i) => {
        const ramp = ramps[i];
        const baseWidth = 1.2;
        const base: uPlot.Series = {
          label: name,
          stroke: colorAssignment.colors[i],
          width: baseWidth,
          spanGaps: false,
        };
        if (colorBy && ramp) {
          // Cast: uPlot's typings don't expose the PathBuilder signature
          // on the published Series type but it's the documented
          // extension point for custom renderers.
          (base as unknown as { paths: uPlot.Series.PathBuilder }).paths =
            makePerSegmentPaths(ramp, baseWidth);
        }
        return base;
      }),
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
  }, [
    uplotData,
    channelNames,
    colorAssignment,
    height,
    data.timestamps,
    data.channels,
    colorBy,
    colorbar?.scale,
  ]);

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
        {colorAssignment.kind === 'sequential' && !colorBy && (
          <span className="text-[10px] opacity-60">
            Color: {colorbar?.scale ?? 'viridis'} ramp
          </span>
        )}
        {colorBy && (
          <span
            className="text-[10px] opacity-60"
            data-testid="multitrace-colorby-label"
          >
            Color by{' '}
            {colorBy === 'time'
              ? 'time'
              : colorBy === 'index'
                ? 'sample'
                : 'value'}{' '}
            ({colorbar?.scale ?? 'viridis'})
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
