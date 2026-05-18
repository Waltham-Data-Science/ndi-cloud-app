'use client';

/**
 * DataGridColumnFilter — per-column filter popover.
 *
 * Phase H4 (2026-05-17). Clicking the filter icon in a sortable
 * column header opens a popover with:
 *
 *   1. A text input for substring matching (debounced)
 *   2. A list of distinct values from the column (top N, sorted
 *      by frequency desc) — each value is a checkbox the user
 *      can toggle ON to include / OFF to exclude
 *   3. A "Clear filter" button at the bottom
 *
 * Mode semantics:
 *   - Substring + distinct-values are combined with OR within
 *     each mode, AND across modes. Effectively: row passes if
 *     (substring matches) AND (no distinct values picked OR row
 *     value is in the picked set).
 *   - The empty state (no input, no checked values) passes all
 *     rows — the column is unfiltered.
 *
 * Visual model mirrors Sheets / Notion / Airtable per-column
 * filter — a discrete affordance that doesn't dominate the
 * header.
 *
 * Built on Radix Popover (not DropdownMenu) because the popover
 * contains a TEXT INPUT, and DropdownMenu's keyboard semantics
 * (arrow keys to nav menu items) fight with input typing.
 */
import {
  Anchor as PopAnchor,
  Content as PopContent,
  Portal as PopPortal,
  Root as PopRoot,
  Trigger as PopTrigger,
} from '@radix-ui/react-popover';
import { Filter, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/cn';

export interface DataGridColumnFilterValue {
  /** Substring matched against the column's stringified value. */
  substring: string;
  /** Whitelist of exact values; empty → no whitelist (all pass). */
  whitelist: ReadonlySet<string>;
}

export interface DataGridColumnFilterProps {
  /** Column display label, e.g. "Strain". */
  label: string;
  /** Current filter value (controlled). */
  value: DataGridColumnFilterValue;
  /** Called when the user changes either dimension. */
  onChange: (next: DataGridColumnFilterValue) => void;
  /**
   * Distinct values + their frequency in the underlying data,
   * sorted desc by frequency. Truncated to the top N at the call
   * site (typically 50) so the popover stays light.
   */
  distinctValues: ReadonlyArray<{ value: string; count: number }>;
  /** Total row count for context ("matches N of M"). */
  totalRows: number;
  /** Filtered row count under the current filter, for live feedback. */
  filteredRows: number;
}

/** True iff the filter is in its no-op state. */
export function isFilterEmpty(v: DataGridColumnFilterValue): boolean {
  return v.substring.length === 0 && v.whitelist.size === 0;
}

export function DataGridColumnFilter({
  label,
  value,
  onChange,
  distinctValues,
  totalRows,
  filteredRows,
}: DataGridColumnFilterProps) {
  const active = !isFilterEmpty(value);
  // Local search inside the distinct-values list — for columns
  // with many values, the user can find the one they want.
  const [valueSearch, setValueSearch] = useState('');

  const visibleValues = useMemo(() => {
    if (valueSearch.trim().length === 0) return distinctValues;
    const q = valueSearch.trim().toLowerCase();
    return distinctValues.filter((v) =>
      v.value.toLowerCase().includes(q),
    );
  }, [distinctValues, valueSearch]);

  const toggleWhitelist = (v: string) => {
    const next = new Set(value.whitelist);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange({ ...value, whitelist: next });
  };

  const clear = () => {
    onChange({ substring: '', whitelist: new Set() });
    setValueSearch('');
  };

  return (
    <PopRoot>
      <PopAnchor />
      <PopTrigger asChild>
        <button
          type="button"
          aria-label={`Filter ${label}${active ? ' (active)' : ''}`}
          title={`Filter ${label}${active ? ' (active)' : ''}`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center justify-center',
            'h-4 w-4 rounded shrink-0',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40',
            'transition-colors duration-(--duration-base) ease-(--ease-out)',
            active
              ? 'text-brand-blue bg-brand-blue/10'
              : 'text-fg-muted/60 hover:text-fg-secondary hover:bg-bg-muted opacity-0 group-hover/datagrid-th:opacity-100 data-[state=open]:opacity-100',
          )}
        >
          <Filter className="h-2.5 w-2.5" aria-hidden />
        </button>
      </PopTrigger>
      <PopPortal>
        <PopContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => {
            // Don't auto-focus the substring input — Radix's default
            // is to focus the first focusable child. We let the user
            // tab to the input themselves so the popover doesn't
            // immediately consume their keystrokes.
            e.preventDefault();
          }}
          className={cn(
            'z-50 w-[260px]',
            'rounded-md border border-border-subtle bg-bg-surface',
            'shadow-lg shadow-black/5 p-2',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10.5px] font-bold tracking-eyebrow uppercase text-fg-muted">
              Filter {label}
            </span>
            {active && (
              <button
                type="button"
                onClick={clear}
                className="text-[11px] text-fg-secondary hover:text-fg-primary focus-visible:outline-none focus-visible:underline"
              >
                Clear
              </button>
            )}
          </div>

          <input
            type="text"
            value={value.substring}
            onChange={(e) =>
              onChange({ ...value, substring: e.target.value })
            }
            placeholder="Contains…"
            className={cn(
              'w-full rounded-md border border-border-subtle bg-bg-canvas',
              'px-2 py-1 text-[12.5px] text-fg-primary',
              'placeholder:text-fg-muted/70',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:border-brand-blue',
            )}
          />

          {distinctValues.length > 0 && (
            <>
              <div className="mt-2 mb-1 flex items-center justify-between">
                <span className="text-[10.5px] font-medium tracking-eyebrow uppercase text-fg-muted">
                  Values
                </span>
                {value.whitelist.size > 0 && (
                  <span className="text-[10.5px] text-fg-muted">
                    {value.whitelist.size} selected
                  </span>
                )}
              </div>
              {distinctValues.length > 8 && (
                <input
                  type="text"
                  value={valueSearch}
                  onChange={(e) => setValueSearch(e.target.value)}
                  placeholder="Find a value…"
                  className={cn(
                    'w-full rounded border border-border-subtle bg-bg-canvas',
                    'px-2 py-0.5 mb-1 text-[11px] text-fg-primary',
                    'placeholder:text-fg-muted/60',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-blue/40',
                  )}
                />
              )}
              <div
                role="listbox"
                aria-label={`${label} values`}
                aria-multiselectable
                className="max-h-[180px] overflow-y-auto rounded border border-border-subtle bg-bg-canvas"
              >
                {visibleValues.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-fg-muted italic text-center">
                    No values match
                  </p>
                ) : (
                  visibleValues.map((v) => {
                    const checked = value.whitelist.has(v.value);
                    return (
                      <button
                        key={v.value}
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggleWhitelist(v.value)}
                        className={cn(
                          'w-full flex items-center gap-2',
                          'px-2 py-1 text-[12px] text-left',
                          'focus-visible:outline-none',
                          'transition-colors duration-(--duration-base) ease-(--ease-out)',
                          checked
                            ? 'bg-brand-blue/5 text-fg-primary'
                            : 'text-fg-primary hover:bg-bg-muted',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'inline-flex items-center justify-center',
                            'h-3 w-3 rounded border shrink-0',
                            checked
                              ? 'bg-brand-blue border-brand-blue'
                              : 'bg-transparent border-border-strong',
                          )}
                        >
                          {checked && (
                            <svg
                              viewBox="0 0 12 12"
                              className="h-2 w-2 text-white"
                              aria-hidden
                            >
                              <path
                                d="M2.5 6.5L4.5 8.5L9.5 3.5"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <span className="flex-1 truncate">{v.value}</span>
                        <span className="text-[10.5px] text-fg-muted tabular-nums">
                          {v.count.toLocaleString()}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          <div className="mt-2 pt-1.5 border-t border-border-subtle flex items-center justify-between">
            <span className="text-[10.5px] text-fg-muted">
              {filteredRows.toLocaleString()} of {totalRows.toLocaleString()}
            </span>
            {active && (
              <button
                type="button"
                onClick={clear}
                aria-label="Clear filter"
                className={cn(
                  'inline-flex items-center justify-center',
                  'h-5 w-5 rounded text-fg-muted hover:text-fg-primary hover:bg-bg-muted',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40',
                )}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            )}
          </div>
        </PopContent>
      </PopPortal>
    </PopRoot>
  );
}
