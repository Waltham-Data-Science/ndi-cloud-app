'use client';

/**
 * DataGridSortHeader — clickable column header with an arrow
 * indicator and a tooltip that mirrors the visual conventions of
 * the rest of the workspace.
 *
 * Phase G5. Drop-in for any TanStack Table column where you'd
 * otherwise render the raw header string. Three sort states:
 *
 *   asc   → ↑ arrow, "Sorted ascending"
 *   desc  → ↓ arrow, "Sorted descending"
 *   none  → ↕ ghosted, "Click to sort ascending"
 *
 * Click cycles asc → desc → none → asc. Matches Google Sheets and
 * Notion semantics. The third click clears so users can step out of
 * a sort without remembering an explicit "Clear sort" affordance.
 */
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { cn } from '@/lib/cn';

export type SortDirection = 'asc' | 'desc' | false;

export interface DataGridSortHeaderProps {
  label: string;
  /** Current sort direction; `false` means not sorted. */
  sort: SortDirection;
  /**
   * Called when the user clicks the header. Three-state cycle:
   * caller decides what to pass next (`asc` → `desc` → `false`).
   * Pass `null` here to disable sorting on this column — the
   * header renders as a plain label.
   *
   * Phase H3 — the MouseEvent is forwarded so the caller can
   * detect `event.shiftKey` and stack sorts across multiple
   * columns. Bare `()` calls still work (the event is optional).
   */
  onCycle: ((event?: React.MouseEvent) => void) | null;
  /** Right-align (used for numeric columns). */
  align?: 'left' | 'right';
}

export function DataGridSortHeader({
  label,
  sort,
  onCycle,
  align = 'left',
}: DataGridSortHeaderProps) {
  if (!onCycle) {
    // Non-sortable column — render the label without affordance.
    return (
      <span
        className={cn(
          'text-[10.5px] font-bold tracking-eyebrow uppercase text-fg-muted',
          align === 'right' && 'text-right block w-full',
        )}
      >
        {label}
      </span>
    );
  }

  const Icon = sort === 'asc' ? ArrowUp : sort === 'desc' ? ArrowDown : ArrowUpDown;
  const sortLabel =
    sort === 'asc'
      ? 'Sorted ascending — click for descending'
      : sort === 'desc'
        ? 'Sorted descending — click to clear sort'
        : 'Click to sort ascending';

  return (
    <button
      type="button"
      onClick={(e) => onCycle(e)}
      title={sortLabel}
      aria-label={`${label} — ${sortLabel}`}
      className={cn(
        'inline-flex items-center gap-1.5',
        'text-[10.5px] font-bold tracking-eyebrow uppercase',
        'text-fg-muted hover:text-fg-primary',
        'focus-visible:outline-none focus-visible:text-fg-primary',
        'transition-colors duration-(--duration-base) ease-(--ease-out)',
        'cursor-pointer select-none',
        align === 'right' && 'flex-row-reverse w-full justify-start',
      )}
    >
      <span>{label}</span>
      <Icon
        className={cn(
          'h-3 w-3 shrink-0',
          sort === false ? 'opacity-30' : 'opacity-100 text-brand-blue',
        )}
        aria-hidden
      />
    </button>
  );
}
