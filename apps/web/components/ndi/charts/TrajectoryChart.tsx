'use client';

/**
 * TrajectoryChart — 2D XY position track colored by time progression.
 *
 * For datasets where a single document carries a multi-channel signal
 * whose first two channels are spatial coordinates (x, y), this chart
 * plots the trajectory: each (x_i, y_i) is a point on a 2D scatter
 * connected to (x_{i+1}, y_{i+1}) by a line segment colored on a
 * Viridis ramp keyed to sample index. Cold = early in recording,
 * warm = late.
 *
 * Why SVG instead of uPlot:
 *   uPlot is excellent for timeseries (1-D x → 1-D y) but it doesn't
 *   ship a native "color the line by a third scalar" series mode —
 *   we'd have to render each segment as a separate series, which
 *   doesn't scale past ~50 channels and produces a heavy legend.
 *   SVG with one polyline-per-segment gives us precise per-segment
 *   color control, and the data-volume sweet spot for behavioral
 *   trajectories (10s-of-thousands of points downsampled to a few
 *   thousand on render) fits comfortably in DOM. We cap visible
 *   segments at MAX_RENDER_POINTS and decimate longer tracks before
 *   render so the DOM never explodes.
 *
 * Re-fetch contract (matches SignalChart):
 *   The panel passes the chart_payload-shaped props (datasetId, docId,
 *   downsample, optional t0/t1/file). The chart owns its own TanStack
 *   Query call against /api/datasets/[id]/documents/[docId]/signal —
 *   the same endpoint SignalChart uses — and pulls the first two
 *   channels off the response. No new backend route is needed.
 *
 * Empty / error states are first-class:
 *   - Fetch error → amber alert (matches SignalChart)
 *   - Loading → spinner-style placeholder at trajectory's eventual
 *     aspect ratio so layout doesn't jump on resolve
 *   - Backend soft-error envelope (data.error) → status message
 *   - Single-channel doc OR <2 valid samples → "No XY trajectory" hint
 *     so the panel can rationalize why the chart didn't draw
 */
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useId, useMemo } from 'react';

import { apiFetch } from '@/lib/api/client';
import type { TimeseriesData } from '@/lib/api/binary';
import { documentExplorerUrl } from '@/lib/ndi/references';
import { viridis } from '@/lib/workspace/viridis';

/**
 * Backend response envelope (matches the SignalChart contract; the
 * route is shared). We pluck the channels + source for the chart and
 * the citation footer.
 */
interface SignalResponse extends TimeseriesData {
  downsampled?: boolean;
  original_sample_count?: number;
  t0_seconds?: number | null;
  t1_seconds?: number | null;
  source?: {
    dataset_id: string;
    document_id: string;
    doc_class: string | null;
    doc_name: string | null;
  };
}

export interface TrajectoryChartProps {
  datasetId: string;
  /**
   * The X-axis source document. When ``yDocId`` is also set the chart
   * runs in "pair mode": ``docId`` provides x, ``yDocId`` provides y.
   * When ``yDocId`` is omitted (the default) the chart runs in
   * "single mode": both x and y come from this one document (assumed
   * to carry ≥2 channels per the ``xChannel`` / ``yChannel`` hints
   * or the ``pickXYChannels`` heuristic).
   */
  docId: string;
  /**
   * F-1d follow-up (2026-05-19). Optional Y-axis source document.
   * When set the chart fetches BOTH docs and reads the first channel
   * of each (or the named channel via ``xChannel`` / ``yChannel``)
   * as the trajectory's x and y. Unblocks datasets like Haley
   * (``682e7772cdf3f24938176fac``) that store X and Y position as
   * SEPARATE single-channel element_epoch documents instead of one
   * 2-channel document. When unset, behaviour is unchanged from the
   * pre-pair-mode single-document path.
   */
  yDocId?: string;
  /**
   * Max samples per channel returned by the backend. The trajectory
   * chart can comfortably render up to ~5000 segments before SVG
   * performance starts dropping; defaults to 2000 (same as SignalChart).
   */
  downsample?: number;
  t0?: number;
  t1?: number;
  /** Multi-file binary selector — passed through to the signal route. */
  file?: string;
  /** Optional title for the figure caption. */
  title?: string;
  /**
   * Optional explicit channel names to use as x and y. When omitted,
   * the chart auto-picks the first two channels in document order
   * (single mode) or the first channel of each fetched document
   * (pair mode). Useful when a document carries (x, y, z) or
   * (x, y, theta) and the caller wants a specific pair.
   */
  xChannel?: string;
  yChannel?: string;
}

const STALE_MS = 60_000;

/**
 * Hard ceiling on SVG segments rendered for a single track. Beyond
 * this we decimate (keep every Nth point) so the DOM stays responsive.
 * 2000 segments is plenty for "see the shape of the path" — visual
 * fidelity from there scales mostly with the resolution of the
 * underlying recording, not what we paint.
 */
const MAX_RENDER_POINTS = 2000;

export function TrajectoryChart({
  datasetId,
  docId,
  yDocId,
  downsample = 2000,
  t0,
  t1,
  file,
  title,
  xChannel,
  yChannel,
}: TrajectoryChartProps) {
  const pairMode = typeof yDocId === 'string' && yDocId.length > 0;

  const buildUrl = useMemo(
    () =>
      (sourceDocId: string) => {
        const qs = new URLSearchParams({ downsample: String(downsample) });
        if (typeof t0 === 'number') qs.set('t0', String(t0));
        if (typeof t1 === 'number') qs.set('t1', String(t1));
        if (typeof file === 'string' && file.length > 0) qs.set('file', file);
        return `/api/datasets/${datasetId}/documents/${sourceDocId}/signal?${qs.toString()}`;
      },
    [datasetId, downsample, t0, t1, file],
  );

  const xQuery = useQuery({
    queryKey: ['trajectory-chart', 'x', datasetId, docId, downsample, t0, t1, file],
    queryFn: ({ signal }) => apiFetch<SignalResponse>(buildUrl(docId), { signal }),
    staleTime: STALE_MS,
    gcTime: STALE_MS * 5,
    retry: 0,
  });
  const yQuery = useQuery({
    queryKey: ['trajectory-chart', 'y', datasetId, yDocId, downsample, t0, t1, file],
    queryFn: ({ signal }) => apiFetch<SignalResponse>(buildUrl(yDocId!), { signal }),
    enabled: pairMode,
    staleTime: STALE_MS,
    gcTime: STALE_MS * 5,
    retry: 0,
  });

  // Pair mode: aggregate both queries into the SignalResponse shape the
  // existing body code expects. We concat the channels under their
  // declared (or detected) names. Loading/error states OR across both.
  const data = useMemo<SignalResponse | undefined>(() => {
    if (!pairMode) return xQuery.data;
    if (!xQuery.data || !yQuery.data) return undefined;
    const xName = xChannel ?? Object.keys(xQuery.data.channels)[0] ?? 'x';
    const yName = yChannel ?? Object.keys(yQuery.data.channels)[0] ?? 'y';
    // Disambiguate when both source docs name their channel `ch0`.
    const labelledX = yName === xName ? `${xName}_x` : xName;
    const labelledY = yName === xName ? `${yName}_y` : yName;
    return {
      channels: {
        [labelledX]: Object.values(xQuery.data.channels)[0] ?? [],
        [labelledY]: Object.values(yQuery.data.channels)[0] ?? [],
      },
      sample_count: Math.min(
        xQuery.data.sample_count ?? 0,
        yQuery.data.sample_count ?? 0,
      ),
      original_sample_count:
        xQuery.data.original_sample_count ?? xQuery.data.sample_count,
      downsampled: xQuery.data.downsampled,
      format: xQuery.data.format,
      error: xQuery.data.error ?? yQuery.data.error ?? null,
      source: xQuery.data.source,
    } as SignalResponse;
  }, [pairMode, xQuery.data, yQuery.data, xChannel, yChannel]);

  const isLoading = pairMode
    ? xQuery.isLoading || yQuery.isLoading
    : xQuery.isLoading;
  const isError = pairMode
    ? xQuery.isError || yQuery.isError
    : xQuery.isError;
  const error = xQuery.error ?? yQuery.error;

  // Pass `xChannel` / `yChannel` only in single mode — in pair mode we
  // construct the channels dict with deterministic names so the body
  // doesn't need to guess.
  const effectiveXChannel = pairMode ? undefined : xChannel;
  const effectiveYChannel = pairMode ? undefined : yChannel;

  const ariaLabel =
    title ?? data?.source?.doc_name ?? 'XY trajectory chart';

  return (
    <figure
      className="my-4 p-3 rounded-md border border-gray-200 bg-white"
      aria-label={ariaLabel}
      data-testid="trajectory-chart"
      data-pair-mode={pairMode ? 'true' : 'false'}
    >
      <figcaption className="mb-2 flex items-baseline gap-2 text-[13px]">
        <span className="font-semibold text-gray-900 truncate flex-1 min-w-0">
          {title ?? data?.source?.doc_name ?? 'XY trajectory'}
        </span>
        {pairMode && (
          <span className="px-1.5 py-0.5 rounded bg-brand-blue/10 text-[10px] font-mono text-brand-blue shrink-0">
            pair
          </span>
        )}
        {data?.format && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-600 shrink-0">
            {data.format}
          </span>
        )}
      </figcaption>

      <ChartBody
        data={data}
        isLoading={isLoading}
        isError={isError}
        error={error}
        xChannel={effectiveXChannel}
        yChannel={effectiveYChannel}
      />

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">
          {pairMode
            ? `Paired: 2 source documents`
            : data?.downsampled && data.original_sample_count
              ? `Downsampled from ${data.original_sample_count.toLocaleString()} samples to ${data.sample_count.toLocaleString()}`
              : data?.sample_count
                ? `${data.sample_count.toLocaleString()} samples`
                : ''}
        </span>
        <Link
          href={documentExplorerUrl(datasetId, docId)}
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

TrajectoryChart.displayName = 'TrajectoryChart';

interface ChartBodyProps {
  data: SignalResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  xChannel?: string;
  yChannel?: string;
}

function ChartBody({
  data,
  isLoading,
  isError,
  error,
  xChannel,
  yChannel,
}: ChartBodyProps) {
  if (isError) {
    const msg = error instanceof Error ? error.message : 'Failed to load trajectory';
    return (
      <div
        role="alert"
        className="h-[260px] flex items-center justify-center text-center px-4 text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded"
      >
        Couldn&apos;t load the trajectory: {msg}
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="h-[260px] flex items-center justify-center text-[13px] text-gray-500 bg-gray-50 rounded">
        Loading trajectory…
      </div>
    );
  }
  if (data.error) {
    return (
      <div
        role="status"
        className="h-[260px] flex items-center justify-center text-center px-4 text-[13px] text-gray-700 bg-gray-50 border border-gray-200 rounded"
      >
        {data.error}
      </div>
    );
  }

  return <TrajectoryBody data={data} xChannel={xChannel} yChannel={yChannel} />;
}

interface TrajectoryBodyProps {
  data: SignalResponse;
  xChannel?: string;
  yChannel?: string;
}

/**
 * Pick the two channels that drive the x and y axes.
 *
 * When the caller hasn't named them explicitly, prefer obviously-spatial
 * names (`x` / `y`, case-insensitive) before falling back to "first
 * two in document order." This matches the convention NDI position
 * documents tend to use (e.g. Haley behavioral plates carry channels
 * literally named `x` and `y`).
 *
 * Returns `null` when fewer than 2 channels are available — the body
 * surfaces an empty-state hint in that case.
 */
export function pickXYChannels(
  channelNames: string[],
  xHint?: string,
  yHint?: string,
): { x: string; y: string } | null {
  if (channelNames.length < 2) return null;
  // Explicit hints win, IF they actually exist in the response.
  if (xHint && yHint && channelNames.includes(xHint) && channelNames.includes(yHint)) {
    return { x: xHint, y: yHint };
  }
  // Heuristic: literal "x"/"y" names (case-insensitive).
  const lower = channelNames.map((n) => n.toLowerCase());
  const xIdx = lower.findIndex((n) => n === 'x' || n === 'pos_x' || n === 'position_x');
  const yIdx = lower.findIndex((n) => n === 'y' || n === 'pos_y' || n === 'position_y');
  if (xIdx >= 0 && yIdx >= 0 && xIdx !== yIdx) {
    return { x: channelNames[xIdx]!, y: channelNames[yIdx]! };
  }
  // Default: first two in document order.
  return { x: channelNames[0]!, y: channelNames[1]! };
}

function TrajectoryBody({ data, xChannel, yChannel }: TrajectoryBodyProps) {
  const channelNames = Object.keys(data.channels ?? {});
  const picked = pickXYChannels(channelNames, xChannel, yChannel);

  if (!picked) {
    return (
      <div
        role="status"
        className="h-[260px] flex items-center justify-center text-center px-4 text-[13px] text-gray-700 bg-gray-50 border border-gray-200 rounded"
        data-testid="trajectory-empty"
      >
        No XY trajectory data — this document has{' '}
        {channelNames.length === 0 ? 'no channels' : `${channelNames.length} channel`}.
        Behavioral track plots need at least two channels (x and y).
      </div>
    );
  }

  const xRaw = data.channels[picked.x] ?? [];
  const yRaw = data.channels[picked.y] ?? [];
  // Pair up — drop any sample where either x or y is null (the backend
  // null-pads ragged multi-channel buffers; the trajectory can't draw
  // through a hole).
  const pairs: Array<[number, number]> = [];
  const n = Math.min(xRaw.length, yRaw.length);
  for (let i = 0; i < n; i++) {
    const xv = xRaw[i];
    const yv = yRaw[i];
    if (xv === null || yv === null || xv === undefined || yv === undefined) continue;
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
    pairs.push([xv, yv]);
  }

  if (pairs.length < 2) {
    return (
      <div
        role="status"
        className="h-[260px] flex items-center justify-center text-center px-4 text-[13px] text-gray-700 bg-gray-50 border border-gray-200 rounded"
        data-testid="trajectory-empty"
      >
        No XY trajectory data — only {pairs.length} valid sample
        {pairs.length === 1 ? '' : 's'} after dropping nulls. A trajectory
        needs at least 2 points.
      </div>
    );
  }

  // Decimate when we have more points than the SVG can comfortably
  // render. Stride is ceil(N / MAX_RENDER_POINTS) so we visit ≤ MAX
  // points; we always KEEP the last point so the track ends where the
  // recording ends (and the "warmest" color lands on the true end).
  const stride = Math.max(1, Math.ceil(pairs.length / MAX_RENDER_POINTS));
  const decimated: Array<[number, number]> = [];
  for (let i = 0; i < pairs.length; i += stride) {
    decimated.push(pairs[i]!);
  }
  if (decimated[decimated.length - 1] !== pairs[pairs.length - 1]) {
    decimated.push(pairs[pairs.length - 1]!);
  }

  return (
    <TrajectorySvg
      points={decimated}
      xLabel={picked.x}
      yLabel={picked.y}
      totalSamples={pairs.length}
      decimated={decimated.length < pairs.length}
    />
  );
}

interface TrajectorySvgProps {
  points: ReadonlyArray<readonly [number, number]>;
  xLabel: string;
  yLabel: string;
  totalSamples: number;
  decimated: boolean;
}

/**
 * The SVG itself — bounded viewport with axis labels + a per-segment
 * polyline. Each segment carries a stroke color sampled from the
 * Viridis ramp at `(i / (n - 1))`, so the track fades smoothly from
 * dark purple (start) to bright yellow (end). A small inset colorbar
 * at the right edge anchors the visual mapping.
 *
 * Aspect ratio is calculated from the data bounds with a 6% padding
 * on each side so endpoints don't clip the bounding box. The plot
 * scales to fill its container — no fixed pixel size on the SVG itself,
 * keeping it responsive inside the PanelCard's flex layout.
 */
function TrajectorySvg({
  points,
  xLabel,
  yLabel,
  totalSamples,
  decimated,
}: TrajectorySvgProps) {
  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const [x, y] of points) {
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    return { xMin, xMax, yMin, yMax };
  }, [points]);

  // Guard the degenerate "all points identical" case — without this
  // the (xMax - xMin) divisor becomes zero and every point projects
  // to NaN. Expand to a 1-unit window so the single point lands at
  // the center of the plot.
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  // SVG viewport. 400×300 chosen so the trajectory has a slightly-wide
  // aspect by default (most arena recordings are landscape); the
  // preserveAspectRatio="xMidYMid meet" attribute lets the container
  // override this without distortion.
  const VIEW_W = 400;
  const VIEW_H = 300;
  const PAD = 32; // gives room for axis ticks + tick labels
  const innerW = VIEW_W - PAD * 2;
  const innerH = VIEW_H - PAD * 2;

  // Project a data point into SVG coordinates. Y is flipped (SVG +y
  // goes DOWN) so up-screen reads as +y-data — the expected mental
  // model for behavioral plate plots.
  const project = (x: number, y: number): [number, number] => {
    const sx = PAD + ((x - xMin) / xRange) * innerW;
    const sy = PAD + innerH - ((y - yMin) / yRange) * innerH;
    return [sx, sy];
  };

  // Build per-segment line elements. Each segment owns its own color
  // so the gradient sweeps smoothly along the path. We render the
  // earliest segments first so the late (bright) segments paint on
  // top — visually more important for "where did the subject end up."
  const segments = useMemo(() => {
    const out: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }> = [];
    for (let i = 0; i < points.length - 1; i++) {
      const t = points.length === 1 ? 0.5 : i / (points.length - 1);
      const [x1, y1] = project(points[i]![0], points[i]![1]);
      const [x2, y2] = project(points[i + 1]![0], points[i + 1]![1]);
      out.push({ x1, y1, x2, y2, color: viridis(t) });
    }
    return out;
    // project is a closure over xMin/xRange/etc which are derived from
    // `points`, so the only meaningful dep is `points`.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- transitive deps captured via points
  }, [points]);

  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const [startX, startY] = startPoint
    ? project(startPoint[0], startPoint[1])
    : [0, 0];
  const [endX, endY] = endPoint ? project(endPoint[0], endPoint[1]) : [0, 0];

  // Render-side colorbar. 5 gradient stops are enough for the eye to
  // read the ramp; matches the MultiTraceChart Colorbar fidelity.
  // `useId` gives us a stable, SSR-safe unique id for the SVG <defs>
  // gradient — `Math.random()` would be impure during render and the
  // react-hooks/purity ESLint rule rejects it.
  const rawId = useId();
  const gradientId = `traj-grad-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="font-mono">
          {totalSamples.toLocaleString('en-US')} samples
        </span>
        <span className="font-mono">
          x: {xLabel} · y: {yLabel}
        </span>
        {decimated && (
          <span
            className="text-[10px] opacity-70"
            data-testid="trajectory-decimated-hint"
          >
            Decimated for render
          </span>
        )}
        <span className="text-[10px] opacity-60">
          Color: viridis ramp by time
        </span>
      </div>
      <div
        data-testid="trajectory-svg-container"
        className="rounded-md border border-gray-200 bg-white p-1"
      >
        <svg
          viewBox={`0 0 ${VIEW_W + 60} ${VIEW_H}`}
          width="100%"
          height="auto"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`XY trajectory plot, ${totalSamples} samples, colored by time progression`}
          data-testid="trajectory-svg"
        >
          {/* Plot frame */}
          <rect
            x={PAD}
            y={PAD}
            width={innerW}
            height={innerH}
            fill="none"
            stroke="rgba(0,0,0,0.15)"
            strokeWidth="1"
          />

          {/* Trajectory polyline rendered as N - 1 individually-colored
              segments. Tried `<polyline>` with a single `stroke` first;
              the per-segment color approach is the standard SVG idiom
              for color-by-scalar paths since SVG doesn't have a
              segment-level gradient mode. */}
          <g data-testid="trajectory-segments">
            {segments.map((s, i) => (
              <line
                key={i}
                x1={s.x1}
                y1={s.y1}
                x2={s.x2}
                y2={s.y2}
                stroke={s.color}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            ))}
          </g>

          {/* Start / end markers — small filled circles so the user
              can tell "this is where the subject started" without
              squinting at the colorbar. Start in dark purple, end in
              bright yellow. Larger than the segment stroke so they're
              visible against the path. */}
          {startPoint && (
            <circle
              cx={startX}
              cy={startY}
              r={4}
              fill={viridis(0)}
              stroke="white"
              strokeWidth="1"
              data-testid="trajectory-start"
            >
              <title>Start of recording</title>
            </circle>
          )}
          {endPoint && (
            <circle
              cx={endX}
              cy={endY}
              r={4}
              fill={viridis(1)}
              stroke="white"
              strokeWidth="1"
              data-testid="trajectory-end"
            >
              <title>End of recording</title>
            </circle>
          )}

          {/* Axis labels — set under the bottom edge + rotated on the
              left edge. Small font so they don't compete with the
              trajectory itself. */}
          <text
            x={VIEW_W / 2}
            y={VIEW_H - 6}
            textAnchor="middle"
            fontSize="10"
            fill="#475569"
            fontFamily="ui-monospace, monospace"
          >
            {xLabel}
          </text>
          <text
            x={10}
            y={VIEW_H / 2}
            textAnchor="middle"
            fontSize="10"
            fill="#475569"
            fontFamily="ui-monospace, monospace"
            transform={`rotate(-90 10 ${VIEW_H / 2})`}
          >
            {yLabel}
          </text>

          {/* Inline colorbar on the right — a vertical gradient strip
              with min/max tick labels. Same visual idiom as the
              MultiTraceChart colorbar so the chart family reads
              consistent. */}
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <stop key={t} offset={`${t * 100}%`} stopColor={viridis(t)} />
              ))}
            </linearGradient>
          </defs>
          <rect
            x={VIEW_W + 8}
            y={PAD}
            width={12}
            height={innerH}
            fill={`url(#${gradientId})`}
            stroke="rgba(0,0,0,0.1)"
            strokeWidth="0.5"
          />
          <text
            x={VIEW_W + 24}
            y={PAD + 8}
            fontSize="9"
            fill="#475569"
            fontFamily="ui-monospace, monospace"
          >
            end
          </text>
          <text
            x={VIEW_W + 24}
            y={VIEW_H - PAD}
            fontSize="9"
            fill="#475569"
            fontFamily="ui-monospace, monospace"
          >
            start
          </text>
        </svg>
      </div>
    </div>
  );
}
