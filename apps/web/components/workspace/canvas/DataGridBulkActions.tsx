'use client';

/**
 * DataGridBulkActions — sticky bar that appears at the top of a
 * `WorkspaceDataGrid` when the user has multi-selected one or more
 * rows. Surfaces the actions you can run on the group.
 *
 * Phase G6. Visual model:
 *   - Brand-blue accent bar (matches the selection-chip aesthetic)
 *   - "N <noun> selected" + "Clear" pill on the left
 *   - Action buttons on the right (right-aligned)
 *   - Smooth slide-in from top via Tailwind animate-in utilities
 *
 * The bar is INLINE (not floating) — it pushes the table down by
 * its height while visible. Floating overlays in tight rail widths
 * obscure the rows you're trying to act on; an inline bar trades
 * a few pixels of height for full row visibility.
 *
 * Actions are data-driven. Each action receives the selection on
 * dispatch — the bar doesn't keep its own ref to the data, only
 * to the ids. Actions that need full row data must look them up
 * from the underlying table data themselves (the picker has it).
 *
 * The "Clear" button is a permanent feature of the bar (not an
 * action) so the user always has a single-key escape. Esc also
 * clears via the parent grid's keyboard handler.
 */
import { X, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface BulkAction {
  /** Stable id for React key + analytics. */
  id: string;
  label: string;
  /** Optional leading icon. */
  icon?: LucideIcon;
  /** Called with the ordered list of selected ids. */
  onSelect: (selectedIds: ReadonlyArray<string>) => void;
  /**
   * Optional tooltip — used to explain why an action is disabled
   * or what it'll do without making the label longer.
   */
  hint?: string;
  /** If true, the button renders but is non-interactive. */
  disabled?: boolean;
  /** Subtle / primary visual weight. */
  variant?: 'subtle' | 'primary';
}

export interface DataGridBulkActionsProps {
  /** Ordered list of selected row ids. */
  selectedIds: ReadonlyArray<string>;
  /** Singular noun for the count ("subject" → "1 subject" / "5 subjects"). */
  noun: string;
  /** Actions to render. The bar only mounts when selectedIds.length > 0. */
  actions: ReadonlyArray<BulkAction>;
  /** Called when the user clicks "Clear" (or hits Esc). */
  onClear: () => void;
  className?: string;
}

export function DataGridBulkActions({
  selectedIds,
  noun,
  actions,
  onClear,
  className,
}: DataGridBulkActionsProps) {
  if (selectedIds.length === 0) return null;

  const count = selectedIds.length;
  const plural = count === 1 ? noun : `${noun}s`;

  return (
    <div
      role="region"
      aria-label={`${count} ${plural} selected`}
      className={cn(
        'flex flex-wrap items-center gap-2',
        'rounded-md border border-brand-blue/30 bg-brand-blue/5',
        'px-2.5 py-1.5',
        'animate-in fade-in-0 slide-in-from-top-1 duration-(--duration-base) ease-(--ease-out)',
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-brand-blue shrink-0"
        />
        <span className="text-[12px] font-semibold text-brand-blue">
          {count} {plural}
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          title="Clear selection (Esc)"
          className={cn(
            'inline-flex items-center justify-center h-5 w-5 rounded-md',
            'text-brand-blue/70 hover:text-brand-blue hover:bg-brand-blue/10',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40',
            'transition-colors duration-(--duration-base) ease-(--ease-out)',
          )}
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1">
        {actions.map((action) => {
          const Icon = action.icon;
          const primary = action.variant === 'primary';
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => action.onSelect(selectedIds)}
              disabled={action.disabled}
              title={action.hint}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md',
                'text-[12px] font-medium',
                'px-2 py-1',
                'transition-colors duration-(--duration-base) ease-(--ease-out)',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40',
                action.disabled
                  ? 'text-fg-muted/60 cursor-not-allowed'
                  : primary
                    ? 'bg-brand-blue text-white hover:bg-brand-blue/90'
                    : 'bg-bg-surface text-fg-primary border border-border-subtle hover:bg-bg-muted hover:border-border-strong',
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
