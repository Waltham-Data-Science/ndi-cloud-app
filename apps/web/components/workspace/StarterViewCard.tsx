'use client';

/**
 * StarterViewCard — numbered card for the Overview tab's "Try these
 * first" section.
 *
 * Modeled on the `BridgeRow` pattern from the marketing home page
 * (`/`), which uses a 56px / 1fr / auto grid with a monospace
 * `01 / 02 / 03` index column, a title + description body, and a
 * right-side hint (rows count + view type) — mirrored here for
 * visual consistency between the marketing surface and the workspace.
 *
 * Each card is a `<Link>` to a workspace tab (Analyses for plots,
 * Subjects/Sessions for filter-and-drill). The auto-selection
 * algorithm — picking 3 starter views from the dataset's class
 * counts — lives in `StarterViewsSection`; this primitive just
 * renders one card as supplied.
 *
 * The starter cards intentionally live inside the same unified
 * container (`rounded-xl bg-bg-surface border` with internal
 * dividers via `first:border-t-0`) — see `BridgeRow` for the
 * source pattern. That container is rendered by the caller around
 * the cards.
 */
import Link from 'next/link';

import { cn } from '@/lib/cn';

export interface StarterViewCardProps {
  /** Mono index column, e.g. "01" / "02" / "03". */
  num: string;
  /** Short bold title (one line on desktop, may wrap on mobile). */
  title: string;
  /**
   * One-line description. Mirrors the marketing BridgeRow `.desc`
   * — text-fg-secondary leading 1.55.
   */
  description: string;
  /** Where the card navigates to. */
  href: string;
  /**
   * Optional right-side hint. Two short fragments:
   *   - `count`: e.g. "45 rows" / "4,887 epochs"
   *   - `viewType`: e.g. "violin" / "signal" / "gantt"
   * The marketing pattern uses a small mono arrow (`→`); here we
   * substitute a short metadata pair to give the user a sense of
   * scale + output type at a glance, then the arrow as the
   * affordance.
   */
  hint?: {
    count?: string;
    viewType?: string;
  };
  className?: string;
}

export function StarterViewCard({
  num,
  title,
  description,
  href,
  hint,
  className,
}: StarterViewCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        'no-underline block focus:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40',
        className,
      )}
    >
      <div
        className={cn(
          // BridgeRow-equivalent layout: index column, body, hint.
          'grid grid-cols-[56px_1fr_auto] max-[640px]:grid-cols-[44px_1fr_auto] gap-6 max-[640px]:gap-4 items-center',
          'px-8 py-7 max-[640px]:px-5 max-[640px]:py-5',
          'border-t first:border-t-0 border-border-subtle',
          'bg-transparent transition-colors duration-(--duration-base) ease-(--ease-out) hover:bg-bg-muted',
        )}
      >
        <div className="font-mono text-[0.9rem] font-semibold tracking-[0.06em] text-ndi-teal">
          {num}
        </div>
        <div className="min-w-0">
          <div className="text-[1.05rem] font-bold text-fg-primary leading-tight tracking-tight mb-1">
            {title}
          </div>
          <div className="text-[0.92rem] leading-[1.55] text-fg-secondary">
            {description}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 whitespace-nowrap text-right">
          {hint?.count && (
            <span className="text-[11.5px] font-medium text-fg-secondary">
              {hint.count}
            </span>
          )}
          {hint?.viewType && (
            <span className="text-[10.5px] uppercase tracking-eyebrow font-bold text-ndi-teal">
              · {hint.viewType}
            </span>
          )}
          {!hint && (
            <span className="font-mono text-[0.9rem] text-fg-muted">→</span>
          )}
        </div>
      </div>
    </Link>
  );
}
