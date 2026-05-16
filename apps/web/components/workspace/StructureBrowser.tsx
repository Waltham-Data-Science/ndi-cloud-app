'use client';

/**
 * StructureBrowser — class browser for the Structure tab.
 *
 * Phase B of the workspace redesign. Lists every NDI document class
 * in the dataset with per-class counts + drill links to the
 * Document Explorer (filtered to the class). Sort + filter live
 * client-side; the underlying data is cached by `useClassCounts`.
 *
 * Each row routes to `/datasets/[id]/documents?class=<className>` —
 * the existing Document Explorer surface. This is the v1 escalation
 * path; once Phase C's Subjects / Sessions tabs are live, certain
 * classes (subject, element_epoch) will reroute into the workspace
 * tabs instead. Other classes (imageStack, ontologyTableRow, generic_file,
 * …) stay routed to Document Explorer because the workspace has no
 * dedicated tab for them.
 *
 * Visual chrome: unified container with internal row dividers,
 * matching the StarterViewsSection + marketing BridgeRow pattern.
 * Hover tints the row to bg-muted (same as BridgeRow hover state).
 */
import {
  ChevronRight,
  ListOrdered,
  Search,
  SortAsc,
  SortDesc,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Skeleton } from '@/components/ui/Skeleton';
import { useClassCounts } from '@/lib/api/datasets';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

interface StructureBrowserProps {
  datasetId: string;
}

type SortKey = 'count-desc' | 'count-asc' | 'name-asc' | 'name-desc';

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'count-desc', label: 'Count (high → low)' },
  { value: 'count-asc', label: 'Count (low → high)' },
  { value: 'name-asc', label: 'Name (A → Z)' },
  { value: 'name-desc', label: 'Name (Z → A)' },
];

/**
 * Compute the displayed list given the raw class counts, the active
 * sort, and the filter text. Pure for testability.
 */
export function deriveClassList(
  classCounts: Record<string, number>,
  sort: SortKey,
  filter: string,
): Array<{ className: string; count: number }> {
  const normalisedFilter = filter.trim().toLowerCase();
  const filtered = Object.entries(classCounts).filter(([cls]) =>
    normalisedFilter ? cls.toLowerCase().includes(normalisedFilter) : true,
  );
  const sorted = filtered.sort((a, b) => {
    switch (sort) {
      case 'count-desc':
        return b[1] - a[1] || a[0].localeCompare(b[0]);
      case 'count-asc':
        return a[1] - b[1] || a[0].localeCompare(b[0]);
      case 'name-asc':
        return a[0].localeCompare(b[0]);
      case 'name-desc':
        return b[0].localeCompare(a[0]);
    }
  });
  return sorted.map(([className, count]) => ({ className, count }));
}

export function StructureBrowser({ datasetId }: StructureBrowserProps) {
  const classCounts = useClassCounts(datasetId);
  const [sort, setSort] = useState<SortKey>('count-desc');
  const [filter, setFilter] = useState('');

  const items = useMemo(() => {
    if (!classCounts.data) return [];
    return deriveClassList(classCounts.data.classCounts, sort, filter);
  }, [classCounts.data, sort, filter]);

  const totalClasses = classCounts.data
    ? Object.keys(classCounts.data.classCounts).length
    : 0;
  const totalDocuments = classCounts.data?.totalDocuments ?? 0;

  if (classCounts.isLoading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-bg-surface overflow-hidden shadow-sm">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto_24px] gap-4 items-center px-6 py-4 border-t first:border-t-0 border-border-subtle"
          >
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-4" />
          </div>
        ))}
      </div>
    );
  }

  if (classCounts.isError || !classCounts.data) {
    return (
      <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-4 py-3 text-[13px] text-fg-secondary">
        Couldn&rsquo;t load class counts for this dataset. Refresh the page,
        or open the{' '}
        <Link
          href={`/datasets/${datasetId}/documents`}
          className="text-ndi-teal hover:underline font-semibold"
        >
          Document Explorer
        </Link>{' '}
        to browse documents directly.
      </div>
    );
  }

  return (
    <>
      {/* ── Controls bar (sort + filter + totals) ──────────────── */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2 text-[13px] text-fg-secondary">
          <ListOrdered className="h-4 w-4 text-fg-muted" aria-hidden />
          <span>
            <span className="font-semibold text-fg-primary">
              {formatNumber(totalClasses)}
            </span>{' '}
            class{totalClasses === 1 ? '' : 'es'} ·{' '}
            <span className="font-semibold text-fg-primary">
              {formatNumber(totalDocuments)}
            </span>{' '}
            document{totalDocuments === 1 ? '' : 's'} total
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
            {sort.startsWith('count') ? (
              sort === 'count-desc' ? (
                <SortDesc className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <SortAsc className="h-3.5 w-3.5" aria-hidden />
              )
            ) : sort === 'name-asc' ? (
              <SortAsc className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <SortDesc className="h-3.5 w-3.5" aria-hidden />
            )}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-[12.5px] text-fg-primary focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              aria-label="Sort classes"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <Search
              className="h-3.5 w-3.5 text-fg-muted"
              aria-hidden
            />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter class name"
              className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-[12.5px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand-500/40 w-44"
              aria-label="Filter class names"
            />
          </label>
        </div>
      </div>

      {/* ── Class list ──────────────────────────────────────────── */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface px-6 py-8 text-center text-[13.5px] text-fg-secondary">
          No classes match &ldquo;{filter}&rdquo;.{' '}
          <button
            type="button"
            onClick={() => setFilter('')}
            className="text-ndi-teal hover:underline font-semibold"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border-subtle bg-bg-surface overflow-hidden shadow-sm">
          {items.map(({ className, count }) => (
            <Link
              key={className}
              href={`/datasets/${datasetId}/documents?class=${encodeURIComponent(className)}`}
              className={cn(
                'no-underline grid grid-cols-[1fr_auto_24px] gap-4 items-center',
                'px-6 py-4 border-t first:border-t-0 border-border-subtle',
                'bg-transparent transition-colors duration-(--duration-base) ease-(--ease-out) hover:bg-bg-muted',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40 focus-visible:bg-bg-muted',
              )}
            >
              <span className="font-mono text-[13.5px] text-fg-primary">
                {className}
              </span>
              <span className="text-[13.5px] tabular-nums font-semibold text-fg-secondary">
                {formatNumber(count)}
              </span>
              <ChevronRight
                className="h-4 w-4 text-fg-muted"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
