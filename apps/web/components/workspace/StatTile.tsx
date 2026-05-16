'use client';

/**
 * StatTile — single clickable count tile for the workspace Overview.
 *
 * Phase B of the workspace redesign (design doc:
 * `apps/web/docs/design/2026-05-16-workspace-redesign.md`). The
 * primitive is modeled on `FairTile` from the marketing home page —
 * same card chrome (rounded-xl, shadow-sm, hover lift), same eyebrow
 * label pattern — but anchored around a numeric value instead of a
 * decorative letter.
 *
 * Six of these compose the Overview tab's "what's in this dataset"
 * row. Each tile is clickable when an `href` is supplied; otherwise
 * it renders as a non-interactive `<div>` (used for facts the user
 * can't drill into, e.g. the dominant species name).
 *
 * The hover affordance — `-translate-y-0.5 hover:shadow-md
 * hover:border-ndi-teal-border` with the design-system `--duration-base`
 * + `--ease-out` motion tokens — is the same one every other clickable
 * card on the site uses. Component quality bar: do not introduce a
 * separate hover style.
 */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface StatTileProps {
  /** Uppercase eyebrow shown above the value. Short — 1-2 words. */
  label: string;
  /**
   * Primary value. Numbers should be pre-formatted by the caller
   * (e.g. via `formatNumber(5314) → "5,314"`); strings pass through
   * verbatim. Long strings clamp to one line.
   */
  value: ReactNode;
  /**
   * Optional sub-label below the value. Used for the "C. elegans
   * (N2)" companion line under the Subjects count, the strain tags
   * under Subjects, etc. Two-line clamp.
   */
  subLabel?: ReactNode;
  /**
   * When set, the whole tile is a `<Link>` to this href and picks
   * up the hover-lift affordance. Without an href the tile is a
   * static `<div>` (no hover, no pointer cursor).
   */
  href?: string;
  /**
   * Optional icon shown in the top-left corner. Sits in a small
   * brand-blue chip matching the panel-card header treatment.
   */
  icon?: LucideIcon;
  /** Pass-through className for grid-item spans, etc. */
  className?: string;
  /**
   * When the source data is loading. Renders the same chrome but
   * with a skeleton block in place of the value — keeps the row's
   * layout stable across resolve.
   */
  isLoading?: boolean;
}

export function StatTile({
  label,
  value,
  subLabel,
  href,
  icon: Icon,
  className,
  isLoading,
}: StatTileProps) {
  const baseClasses = cn(
    'group block rounded-xl border bg-bg-surface p-5 shadow-sm',
    'border-border-subtle',
    href &&
      'transition-all duration-(--duration-base) ease-(--ease-out) hover:-translate-y-0.5 hover:shadow-md hover:border-ndi-teal-border',
    !href && 'cursor-default',
    className,
  );

  const inner = (
    <>
      <div className="flex items-start justify-between mb-3">
        <div className="text-[10.5px] font-bold tracking-eyebrow uppercase text-fg-muted">
          {label}
        </div>
        {Icon && (
          <span
            aria-hidden
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-blue/10 text-brand-blue"
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div
        className={cn(
          'font-display font-extrabold leading-none text-fg-primary',
          // Tight type ramp: numbers up to ~8 digits read at 28px
          // without wrapping; the design-system display token is
          // overkill here. Mono only when explicitly a number.
          'text-[28px] tracking-tight tabular-nums',
          isLoading && 'opacity-0',
        )}
      >
        {isLoading ? (
          // Reserve the value-row height to prevent layout shift on
          // resolve. `tabular-nums` already pads to a consistent
          // glyph width; we just need to occupy the space.
          <span aria-hidden>0</span>
        ) : (
          value
        )}
      </div>
      {(subLabel || isLoading) && (
        <div
          className={cn(
            'mt-1.5 text-[12px] leading-snug text-fg-muted line-clamp-2',
            isLoading && 'opacity-50',
          )}
        >
          {isLoading ? <span className="text-fg-muted/40">—</span> : subLabel}
        </div>
      )}
    </>
  );

  if (!href) {
    return <div className={baseClasses}>{inner}</div>;
  }

  return (
    <Link href={href} className={cn(baseClasses, 'no-underline')}>
      {inner}
    </Link>
  );
}

/**
 * Skeleton variant — same chrome, no value. Used in the StatTilesRow
 * while the underlying hooks resolve.
 */
export function StatTileSkeleton({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <StatTile
      label={label}
      value=""
      isLoading
      className={className}
    />
  );
}
