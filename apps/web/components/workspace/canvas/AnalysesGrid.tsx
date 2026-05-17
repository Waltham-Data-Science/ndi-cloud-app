'use client';

/**
 * AnalysesGrid — the responsive 2-column grid of the 7 analysis
 * panels rendered on the workspace canvas.
 *
 * Phase F5 of the one-canvas redesign. Each panel auto-fills its
 * form from `useWorkspaceSelection` and auto-runs when its required
 * context dimensions are set. The grid is a thin shell — it knows
 * nothing about panel internals — so test-time we can mount it with
 * stub panels and verify only the layout.
 *
 * Layout:
 *   - 1 column on narrow viewports (< 900px main column width)
 *   - 2 columns on wider viewports
 *   - Min-width per cell enforced to prevent the chart areas from
 *     collapsing below their readable threshold (~360px)
 *
 * Panels render in the order users most commonly want them in the
 * tutorials we ground on:
 *   1. Signal trace      (Haley, Bhar voltage / position tutorials)
 *   2. Behavioral track  (Haley XY trajectory, time-colored)
 *   3. PSTH              (Bhar tuning analysis)
 *   4. Spike raster      (Bhar / Haley spike train tutorials)
 *   5. Behavioral compare (Francesconi EPM)
 *   6. Treatment timeline (Francesconi treatment cohort)
 *   7. Electrode positions (Bhar electrode layout)
 *
 * Section anchors (`id="signal-trace"` etc.) are set on each
 * PanelCard, NOT here — see the panel files. Smooth-scroll
 * navigation from starter cards / chat citations uses those anchors.
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface AnalysesGridProps {
  /**
   * The 7 panel React nodes in the order they'll render. Parent
   * (WorkspaceCanvasClient) imports the actual panel components and
   * passes them in — the grid stays dumb about panel identity.
   */
  panels: ReadonlyArray<ReactNode>;
  className?: string;
}

export function AnalysesGrid({ panels, className }: AnalysesGridProps) {
  return (
    <section
      aria-label="Analyses"
      className={cn('space-y-5', className)}
      id="analyses"
    >
      <div>
        <p className="text-[10.5px] font-bold tracking-eyebrow uppercase text-ndi-teal mb-2">
          Analyses
        </p>
        <h2 className="text-[18px] font-semibold text-fg-primary leading-tight">
          Plots and comparisons — auto-filled from your selection
        </h2>
        <p className="mt-1 text-[12.5px] text-fg-secondary">
          Each card runs against the selection at the top of the page. Change
          a chip up there and the relevant cards re-run.
        </p>
      </div>

      <div
        className={cn(
          'grid gap-4',
          // Audit 2026-05-18 (UI sweep): the previous viewport-based
          // breakpoint `[@media(min-width:1200px)]:grid-cols-2` had two
          // problems on Safari — (a) Safari's viewport width reads
          // smaller than Chrome's at the same window size due to
          // scrollbar handling, so users on a 1200-px window saw
          // single-column on Safari and 2-col on Chrome; (b) the
          // arbitrary-value bracket syntax sometimes failed to
          // generate the @media rule depending on Tailwind JIT
          // pass ordering. Switching to `auto-fit + minmax` makes
          // the layout entirely container-driven and identical
          // across browsers. 420px is the minimum readable width
          // for an analysis panel (matches the SignalViewer chart's
          // intrinsic axis labels).
          //
          // UI polish 2026-05-19 (mobile sanity): wrapped the 420px
          // minimum with `min(420px, 100%)` so on viewports narrower
          // than 420px the cell shrinks to fit instead of overflowing
          // the page. On a 375px iPhone viewport the previous fixed
          // 420 caused horizontal page-scroll (panels wider than
          // viewport). With `min(...)`, the cell tracks the container
          // and stays inside the page bounds. Above 420px nothing
          // changes — desktop still gets the readable 420 floor.
        )}
        style={{
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(420px, 100%), 1fr))',
        }}
      >
        {panels.map((panel, idx) => (
          <div key={idx} className="min-w-0">
            {panel}
          </div>
        ))}
      </div>
    </section>
  );
}
