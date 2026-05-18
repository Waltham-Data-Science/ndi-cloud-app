'use client';

/**
 * PanelEmptyState — illustrated "preview of what's coming" empty
 * state for workspace analysis cards.
 *
 * H8 polish (workspace-canvas-redesign 2026-05-16). When a panel can't
 * render yet (no session picked for SignalViewer, no unit + stimulus
 * for PSTH, etc.) the previous empty state was a single line of grey
 * text on a dashed border. Functionally fine, but it doesn't telegraph
 * what kind of output the card will eventually show. This component
 * pairs a small monochrome SVG of the chart's shape (line trace, bars,
 * raster, etc.) with the explanatory copy underneath — so even a cold-
 * start visitor can see "ah, this card will plot a signal" at a glance.
 *
 * Six illustrations are inlined here rather than dragged in from
 * lucide-react or a heavier icon set because:
 *   - Each is bespoke to its chart family (line trace, histogram bars,
 *     spike raster, violin, gantt, scatter) — lucide doesn't ship them.
 *   - Sizing is fixed at ~200x80 so they share a consistent vertical
 *     rhythm in the empty-state card.
 *   - `currentColor` + a single brand-blue accent keeps them in step
 *     with the panel's existing token usage (no new colors).
 *
 * Each illustration is semantically illustrative — not a pixel-perfect
 * mock of the real chart. The goal is "this is what's coming" not
 * "this is what you'll see for THIS dataset."
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type EmptyStateIllustration =
  | 'line-trace'
  | 'histogram'
  | 'raster'
  | 'violin'
  | 'gantt'
  | 'scatter';

export interface PanelEmptyStateProps {
  illustration: EmptyStateIllustration;
  title: string;
  hint: ReactNode;
  className?: string;
  /**
   * Optional `data-testid` on the wrapper. Lets per-panel tests assert
   * the illustration is rendered without depending on the inline SVG
   * structure.
   */
  testId?: string;
}

const ILLUSTRATIONS: Record<
  EmptyStateIllustration,
  () => ReactNode
> = {
  'line-trace': () => <LineTraceIllustration />,
  histogram: () => <HistogramIllustration />,
  raster: () => <RasterIllustration />,
  violin: () => <ViolinIllustration />,
  gantt: () => <GanttIllustration />,
  scatter: () => <ScatterIllustration />,
};

export function PanelEmptyState({
  illustration,
  title,
  hint,
  className,
  testId,
}: PanelEmptyStateProps) {
  const Illustration = ILLUSTRATIONS[illustration];
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center gap-3 rounded-md border border-dashed border-border-subtle bg-bg-canvas px-4 py-6 text-center',
        className,
      )}
      data-testid={testId}
      data-illustration={illustration}
    >
      <div className="text-fg-muted">
        <Illustration />
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-semibold text-fg-primary">{title}</p>
        <div className="text-[12.5px] text-fg-secondary leading-snug">
          {hint}
        </div>
      </div>
    </div>
  );
}

// ─── Illustrations ───────────────────────────────────────────────────
//
// Each SVG follows the same skeleton: viewBox 200x80, currentColor for
// the structural elements (axis, default strokes), brand-blue for one
// accent stroke. Stroke widths are kept consistent (1px for axes, ~2px
// for data marks) so the six illustrations read as a family.

const ACCENT_CLS = 'text-brand-blue';

/**
 * LineTraceIllustration — three wavy traces against a baseline.
 * Represents what SignalViewer will eventually plot (downsampled
 * timeseries from a binary document). Three traces hint at the
 * multi-channel case without being literal about it.
 */
function LineTraceIllustration() {
  return (
    <svg
      viewBox="0 0 200 80"
      width="200"
      height="80"
      fill="none"
      aria-hidden
      data-testid="empty-illustration-line-trace"
    >
      {/* axis */}
      <line x1="8" y1="72" x2="192" y2="72" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="8" y1="8" x2="8" y2="72" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* secondary traces (muted) */}
      <path
        d="M 12 56 Q 30 40 48 50 T 84 44 T 120 52 T 156 38 T 188 46"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.35"
      />
      <path
        d="M 12 40 Q 30 24 48 34 T 84 26 T 120 34 T 156 22 T 188 30"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      {/* primary trace */}
      <path
        d="M 12 60 Q 28 30 46 48 T 82 36 T 118 52 T 154 28 T 188 42"
        className={ACCENT_CLS}
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

/**
 * HistogramIllustration — eight vertical bars of varying heights,
 * silhouette resembling a PSTH peak around the middle. Matches what
 * PsthPanel renders after a successful run.
 */
function HistogramIllustration() {
  return (
    <svg
      viewBox="0 0 200 80"
      width="200"
      height="80"
      fill="none"
      aria-hidden
      data-testid="empty-illustration-histogram"
    >
      <line x1="8" y1="72" x2="192" y2="72" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="8" y1="8" x2="8" y2="72" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* PSTH-shaped bars: rise → peak → fall */}
      {[
        { x: 20, h: 14, opacity: 0.5 },
        { x: 40, h: 22, opacity: 0.55 },
        { x: 60, h: 36, opacity: 0.65 },
        { x: 80, h: 54, opacity: 0.85 },
        { x: 100, h: 48, opacity: 1 },
        { x: 120, h: 30, opacity: 0.7 },
        { x: 140, h: 20, opacity: 0.6 },
        { x: 160, h: 12, opacity: 0.5 },
      ].map((bar) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={72 - bar.h}
          width={14}
          height={bar.h}
          className={ACCENT_CLS}
          fill="currentColor"
          opacity={bar.opacity}
        />
      ))}
    </svg>
  );
}

/**
 * RasterIllustration — three rows of tick marks at varying x
 * positions, the canonical spike-raster shape. Matches the
 * SpikeActivity panel's output once a unit is picked.
 */
function RasterIllustration() {
  return (
    <svg
      viewBox="0 0 200 80"
      width="200"
      height="80"
      fill="none"
      aria-hidden
      data-testid="empty-illustration-raster"
    >
      <line x1="8" y1="72" x2="192" y2="72" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="8" y1="8" x2="8" y2="72" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* Three rows of ticks at semi-randomised positions. The
          repetition reads as "many trials" without being a literal
          fixed pattern. */}
      {[
        { y: 18, xs: [18, 32, 38, 56, 72, 88, 104, 132, 148, 168, 180] },
        { y: 36, xs: [24, 38, 48, 62, 78, 92, 110, 124, 140, 156, 174, 184] },
        { y: 54, xs: [16, 30, 44, 58, 74, 86, 100, 118, 134, 152, 170] },
      ].map((row) =>
        row.xs.map((x) => (
          <line
            key={`${row.y}-${x}`}
            x1={x}
            y1={row.y - 5}
            x2={x}
            y2={row.y + 5}
            className={ACCENT_CLS}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        )),
      )}
    </svg>
  );
}

/**
 * ViolinIllustration — three abstract violin silhouettes (lens/spindle
 * shapes) side by side. Matches the BehavioralCompare panel's chart.
 * Each violin uses a symmetric quadratic curve pair so they're
 * recognisably violin-shaped without being statistically meaningful.
 */
function ViolinIllustration() {
  return (
    <svg
      viewBox="0 0 200 80"
      width="200"
      height="80"
      fill="none"
      aria-hidden
      data-testid="empty-illustration-violin"
    >
      <line x1="8" y1="72" x2="192" y2="72" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="8" y1="8" x2="8" y2="72" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {/* Three violins — narrower at top + bottom, wide in the middle.
          Each is a closed quad-curve loop with a vertical centerline. */}
      {[
        { cx: 50, narrow: 4, wide: 14, opacity: 0.6 },
        { cx: 100, narrow: 4, wide: 18, opacity: 0.85 },
        { cx: 150, narrow: 4, wide: 12, opacity: 0.55 },
      ].map((v) => (
        <g key={v.cx} className={ACCENT_CLS} opacity={v.opacity}>
          <path
            d={`M ${v.cx} 16 Q ${v.cx + v.wide} 40 ${v.cx} 64 Q ${v.cx - v.wide} 40 ${v.cx} 16 Z`}
            fill="currentColor"
            opacity="0.4"
          />
          <line
            x1={v.cx}
            y1={16}
            x2={v.cx}
            y2={64}
            stroke="currentColor"
            strokeWidth="1"
          />
        </g>
      ))}
    </svg>
  );
}

/**
 * GanttIllustration — six horizontal bars at varying x offsets +
 * widths, staggered down the y axis. Matches TreatmentTimeline's
 * Gantt chart of who-got-what-when.
 */
function GanttIllustration() {
  return (
    <svg
      viewBox="0 0 200 80"
      width="200"
      height="80"
      fill="none"
      aria-hidden
      data-testid="empty-illustration-gantt"
    >
      <line x1="8" y1="72" x2="192" y2="72" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="8" y1="8" x2="8" y2="72" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {[
        { x: 18, w: 50, y: 14, opacity: 0.55 },
        { x: 60, w: 40, y: 24, opacity: 0.7 },
        { x: 30, w: 80, y: 34, opacity: 0.85 },
        { x: 100, w: 60, y: 44, opacity: 0.7 },
        { x: 50, w: 70, y: 54, opacity: 0.6 },
        { x: 120, w: 50, y: 64, opacity: 0.5 },
      ].map((bar) => (
        <rect
          key={`${bar.x}-${bar.y}`}
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={6}
          className={ACCENT_CLS}
          fill="currentColor"
          opacity={bar.opacity}
          rx="2"
        />
      ))}
    </svg>
  );
}

/**
 * ScatterIllustration — a scatter of dots over a 2D plane. Matches
 * ElectrodePosition's ML-vs-AP scatter. Dot sizes + opacities vary
 * to suggest depth + clustering without being literal.
 */
function ScatterIllustration() {
  return (
    <svg
      viewBox="0 0 200 80"
      width="200"
      height="80"
      fill="none"
      aria-hidden
      data-testid="empty-illustration-scatter"
    >
      <line x1="8" y1="72" x2="192" y2="72" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="8" y1="8" x2="8" y2="72" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {[
        { cx: 30, cy: 60, r: 2.5, opacity: 0.6 },
        { cx: 42, cy: 48, r: 3, opacity: 0.75 },
        { cx: 56, cy: 38, r: 2.5, opacity: 0.65 },
        { cx: 68, cy: 56, r: 3, opacity: 0.8 },
        { cx: 80, cy: 30, r: 2, opacity: 0.5 },
        { cx: 94, cy: 44, r: 3.5, opacity: 0.9 },
        { cx: 108, cy: 22, r: 2, opacity: 0.55 },
        { cx: 122, cy: 54, r: 3, opacity: 0.75 },
        { cx: 136, cy: 36, r: 2.5, opacity: 0.7 },
        { cx: 150, cy: 50, r: 3, opacity: 0.65 },
        { cx: 164, cy: 28, r: 2.5, opacity: 0.6 },
        { cx: 178, cy: 42, r: 2, opacity: 0.5 },
      ].map((dot) => (
        <circle
          key={`${dot.cx}-${dot.cy}`}
          cx={dot.cx}
          cy={dot.cy}
          r={dot.r}
          className={ACCENT_CLS}
          fill="currentColor"
          opacity={dot.opacity}
        />
      ))}
    </svg>
  );
}
