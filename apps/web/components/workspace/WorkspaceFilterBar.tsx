'use client';

/**
 * WorkspaceFilterBar — filter controls for the Subjects / Sessions
 * tabs.
 *
 * Phase C of the workspace redesign. The bar is a thin composition
 * primitive — it doesn't own filter state. The parent passes the
 * current filter values + change handlers; the bar renders the
 * controls and the result-count banner ("Showing 76 of 5,314
 * subjects · [Clear filters]").
 *
 * Each filter is one of two kinds:
 *
 *   - **Text** — substring search. Matches the tutorial's "StrainName
 *     contains PR811" pattern exactly. Case-insensitive on the
 *     consumer side.
 *   - **Select** — discrete options. Used for fields with a small
 *     known set (sex, treatment group) where a dropdown beats a
 *     free-text input.
 *
 * The bar is intentionally NOT clever: no autocomplete, no chips
 * for active filters, no save-filter-set. v1 priority is "type a
 * substring, see the rows narrow down" — same UX as the existing
 * catalog FacetPanel + the cleaner-tutorial flow.
 */
import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type FilterFieldKind = 'text' | 'select';

export interface FilterFieldText {
  kind: 'text';
  key: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** Placeholder e.g. "contains PR811". */
  placeholder?: string;
}

export interface FilterFieldSelect {
  kind: 'select';
  key: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** Options shown in the dropdown. Include the "all" option as `{value: '', label: 'Any'}`. */
  options: ReadonlyArray<{ value: string; label: string }>;
}

export type FilterField = FilterFieldText | FilterFieldSelect;

export interface WorkspaceFilterBarProps {
  fields: ReadonlyArray<FilterField>;
  /** Total row count BEFORE filters apply. */
  totalRows: number;
  /** Row count AFTER filters apply. */
  filteredRows: number;
  /** Singular noun, e.g. "subject" / "session" / "epoch". */
  noun: string;
  /** Plural form (defaults to `${noun}s`). */
  nounPlural?: string;
  /**
   * Called when the user clicks "Clear filters". The parent resets
   * all field values + removes the URL params. The bar shows the
   * button only when at least one field has a non-empty value.
   */
  onClear?: () => void;
  /**
   * Optional right-side slot — e.g. a sort dropdown or a "save view"
   * affordance.
   */
  actions?: ReactNode;
  className?: string;
}

export function WorkspaceFilterBar({
  fields,
  totalRows,
  filteredRows,
  noun,
  nounPlural,
  onClear,
  actions,
  className,
}: WorkspaceFilterBarProps) {
  const hasActiveFilters = fields.some((f) => f.value !== '');
  const plural = nounPlural ?? `${noun}s`;
  const nounDisplay = filteredRows === 1 ? noun : plural;

  return (
    <div
      className={cn(
        'rounded-xl border border-border-subtle bg-bg-surface shadow-sm p-4',
        className,
      )}
    >
      {/* Field grid — 4 columns on desktop, collapses to 2 then 1. */}
      <div className="grid grid-cols-4 max-[840px]:grid-cols-2 max-[480px]:grid-cols-1 gap-3">
        {fields.map((field) => (
          <FilterFieldControl key={field.key} field={field} />
        ))}
      </div>

      {/* Result count + clear + actions row */}
      <div className="mt-3 pt-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12.5px] text-fg-secondary">
          Showing{' '}
          <span className="font-semibold text-fg-primary tabular-nums">
            {filteredRows.toLocaleString()}
          </span>{' '}
          of{' '}
          <span className="font-semibold text-fg-primary tabular-nums">
            {totalRows.toLocaleString()}
          </span>{' '}
          {nounDisplay}
        </div>
        <div className="flex items-center gap-3">
          {onClear && hasActiveFilters && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-secondary hover:text-ndi-teal transition-colors duration-(--duration-base) ease-(--ease-out)"
            >
              <X className="h-3 w-3" aria-hidden />
              Clear filters
            </button>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}

function FilterFieldControl({ field }: { field: FilterField }) {
  if (field.kind === 'select') {
    return (
      <label className="flex flex-col gap-1.5 min-w-0">
        <span className="text-[10.5px] font-bold tracking-eyebrow uppercase text-fg-muted">
          {field.label}
        </span>
        <select
          value={field.value}
          onChange={(e) => field.onChange(e.target.value)}
          className="rounded-md border border-border-subtle bg-bg-surface px-2.5 py-1.5 text-[13px] text-fg-primary focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition-colors"
          aria-label={field.label}
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  // text
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[10.5px] font-bold tracking-eyebrow uppercase text-fg-muted">
        {field.label}
      </span>
      <div className="relative">
        <Search
          className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted pointer-events-none"
          aria-hidden
        />
        <input
          type="search"
          value={field.value}
          onChange={(e) => field.onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full rounded-md border border-border-subtle bg-bg-surface pl-7 pr-2 py-1.5 text-[13px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition-colors"
          aria-label={field.label}
        />
      </div>
    </label>
  );
}
