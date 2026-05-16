'use client';

/**
 * ViewActionsRail — the action bar that appears under a selected row
 * in the Subjects / Sessions tabs.
 *
 * Phase C of the workspace redesign (design doc:
 * `apps/web/docs/design/2026-05-16-workspace-redesign.md`). When the
 * user picks a subject (or session/epoch) from the table above, this
 * rail surfaces the analyses they can run scoped to that selection —
 * "Plot signal trace", "Treatment timeline", "PSTH", etc. — with the
 * relevant id pre-filled in the destination URL.
 *
 * Visual chrome:
 *   - Rounded-xl white card with a 4px brand-blue left border to
 *     read as "this content is selected/active".
 *   - "Selected: <subject id>" + small de-select link on the left
 *   - Action buttons inline on the right (responsive: wrap below
 *     the label on narrow viewports)
 *
 * The actions are passed as data — `{ label, href, icon }` —so each
 * tab can curate the list to what's runnable against its selection
 * (Subjects sees treatment-timeline + behavioural-compare; Sessions
 * sees signal-viewer + PSTH; both see provenance-walk).
 *
 * Built as a primitive so Sessions can reuse it verbatim. Both tabs
 * compose `<ViewActionsRail selection={...} actions={...} />` once
 * a row is selected.
 */
import { ChevronRight, X, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface ViewAction {
  /** Short button label, e.g. "Signal trace" / "Treatment timeline". */
  label: string;
  /** Destination URL — typically `/my/workspace/[id]/analyses?subject=...`. */
  href: string;
  /** Optional icon shown to the left of the label. */
  icon?: LucideIcon;
  /**
   * Optional sub-label / hint shown under the main label (e.g. the
   * panel type the action opens). Mono, very small.
   */
  hint?: string;
}

export interface ViewActionsRailProps {
  /** What's selected, surfaced as the label on the left. */
  selection: {
    /** Short human label, e.g. "NSUBJ-005-PR811" or "epoch #12". */
    label: string;
    /**
     * Optional context line below the label, e.g. "C. elegans · PR811"
     * — read-at-a-glance scientific context for the selection.
     */
    sublabel?: ReactNode;
  };
  /** Buttons rendered inline on the right. Order matters. */
  actions: ReadonlyArray<ViewAction>;
  /** Called when the user clicks the dismiss-selection (×) link. */
  onClear?: () => void;
  className?: string;
}

export function ViewActionsRail({
  selection,
  actions,
  onClear,
  className,
}: ViewActionsRailProps) {
  return (
    <div
      role="region"
      aria-label="Actions for selected row"
      className={cn(
        // Brand-blue left border (4px) signals "active selection",
        // same affordance the marketing site's active-tab uses on the
        // BridgeRow current-page state ("You're here" cream wash).
        'rounded-xl border border-border-subtle bg-bg-surface shadow-sm',
        'border-l-[4px] border-l-brand-blue',
        'p-4',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: selection label + sublabel */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold tracking-eyebrow uppercase text-brand-blue">
              Selected
            </span>
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear selection"
                className="inline-flex items-center justify-center h-5 w-5 rounded-md text-fg-muted hover:text-fg-primary hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal transition-colors duration-(--duration-base) ease-(--ease-out)"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            )}
          </div>
          <div className="mt-0.5 text-[14px] font-semibold text-fg-primary leading-tight font-mono truncate">
            {selection.label}
          </div>
          {selection.sublabel && (
            <div className="mt-0.5 text-[12px] text-fg-secondary leading-snug">
              {selection.sublabel}
            </div>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md',
                  'border border-border-subtle bg-bg-surface px-3 py-1.5',
                  'text-[12.5px] font-medium text-fg-primary',
                  'hover:bg-bg-muted hover:border-ndi-teal-border',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40',
                  'transition-colors duration-(--duration-base) ease-(--ease-out)',
                  'no-underline',
                )}
              >
                {Icon && (
                  <Icon
                    className="h-3.5 w-3.5 shrink-0 text-brand-blue"
                    aria-hidden
                  />
                )}
                <span className="flex flex-col items-start leading-tight">
                  <span>{action.label}</span>
                  {action.hint && (
                    <span className="text-[10px] text-fg-muted font-mono">
                      {action.hint}
                    </span>
                  )}
                </span>
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-fg-muted"
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
