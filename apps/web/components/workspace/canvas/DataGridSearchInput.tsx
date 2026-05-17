'use client';

/**
 * DataGridSearchInput — the global free-text search input that
 * sits at the top of every picker rail body. Filters across all
 * visible columns of the underlying data grid.
 *
 * Phase H6 (2026-05-17). Pre-fix, each picker had a custom
 * filter chip strip that only covered 2-3 dimensions per picker
 * (Subjects: strain + species + sex; Sessions: time window).
 * Scientists looking for "find subject NSUBJ-005" had to scroll —
 * no way to type the id and have rows narrow. This adds a
 * single, prominent search input above the grid that filters
 * across every visible column.
 *
 * The filter is OR-of-substrings across columns: a row passes if
 * the search string appears (case-insensitively) in any of its
 * visible cells. Combined with per-column filters (AND) so the
 * user can narrow by, e.g., "search NSUBJ" + filter Sex=female.
 *
 * Visual: leading magnifying glass icon, trailing × clear button
 * when the input is non-empty. Tracks the WorkspaceFilterBar
 * input styling so the page reads as one filter system.
 */
import { Search, X } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface DataGridSearchInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Placeholder text — defaults to "Search…". */
  placeholder?: string;
  /** A11y label — defaults to placeholder. */
  ariaLabel?: string;
  className?: string;
}

export function DataGridSearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  ariaLabel,
  className,
}: DataGridSearchInputProps) {
  return (
    <div
      className={cn(
        'relative flex items-center',
        'rounded-md border border-border-subtle bg-bg-surface',
        'focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-brand-blue/20',
        'transition-colors duration-(--duration-base) ease-(--ease-out)',
        className,
      )}
    >
      <Search
        className="absolute left-2 h-3.5 w-3.5 text-fg-muted pointer-events-none"
        aria-hidden
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          'flex-1 bg-transparent',
          'pl-7 pr-7 py-1.5 text-[12.5px] text-fg-primary',
          'placeholder:text-fg-muted/70',
          'focus-visible:outline-none',
        )}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          title="Clear search"
          className={cn(
            'absolute right-1.5',
            'inline-flex items-center justify-center h-5 w-5 rounded',
            'text-fg-muted hover:text-fg-primary hover:bg-bg-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40',
            'transition-colors duration-(--duration-base) ease-(--ease-out)',
          )}
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
  );
}
