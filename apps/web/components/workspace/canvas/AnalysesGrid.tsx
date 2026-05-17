'use client';

/**
 * AnalysesGrid — the responsive 2-column grid of the 6 analysis
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
 *   2. PSTH              (Bhar tuning analysis)
 *   3. Spike raster      (Bhar / Haley spike train tutorials)
 *   4. Behavioral compare (Francesconi EPM)
 *   5. Treatment timeline (Francesconi treatment cohort)
 *   6. Electrode positions (Bhar electrode layout)
 *
 * Section anchors (`id="signal-trace"` etc.) are set on each
 * PanelCard, NOT here — see the panel files. Smooth-scroll
 * navigation from starter cards / chat citations uses those anchors.
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface AnalysesGridProps {
  /**
   * The 6 panel React nodes in the order they'll render. Parent
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
          // 2 cols on wider canvas, 1 col when the main column is narrow.
          // The container query (`@container`) would be more precise but
          // breaks SSR cleanly only with @tailwindcss/container-queries —
          // a viewport-based breakpoint is fine for v1.
          'grid-cols-1 [@media(min-width:1200px)]:grid-cols-2',
        )}
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
