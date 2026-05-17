'use client';

/**
 * StructureBrowser — class browser for the workspace canvas.
 *
 * Phase F3 of the one-canvas redesign. Lists every NDI document class
 * in the dataset with per-class counts. Sort + filter live
 * client-side; the underlying data is cached by `useClassCounts`.
 *
 * Behaviour change vs. Phase B: clicking a class row NO LONGER
 * navigates out to `/datasets/{id}/documents?class=...`. Instead it
 * **switches the picker to the Documents tab and pre-filters that
 * tab to the chosen class** by writing `?docClass=<className>` to
 * the URL. The DocumentsBrowser (built in parallel) reads that
 * param and narrows its table.
 *
 * This is the fix for the user's #1 complaint — the workspace used
 * to dump them into the Document Explorer on every drill, breaking
 * context. Now the drill stays inside the workspace: same canvas,
 * same selection bar, same analysis cards on the right; only the
 * picker body swaps.
 *
 * The single remaining Document Explorer escape lives at the bottom
 * of the PickerRail (DocumentExplorerEscape). Class rows here never
 * navigate out.
 */
import { ListOrdered, Search, SortAsc, SortDesc } from 'lucide-react';
import Link from 'next/link';
import {
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import { useMemo, useState } from 'react';

import { Skeleton } from '@/components/ui/Skeleton';
import { useClassCounts } from '@/lib/api/datasets';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

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

  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const { setPickerTab } = useWorkspaceSelection();

  // Click handler — switches the picker to Documents and writes
  // `?docClass=<className>` for the DocumentsBrowser to consume.
  // We write picker tab + docClass in ONE URL replace so the user
  // doesn't see a flash where Documents is open with no filter.
  //
  // `setPickerTab` and the docClass write race the router otherwise
  // — combining them into a single URLSearchParams mutation avoids
  // that. This mirrors how `useWorkspaceSelection.set` builds patches
  // atomically.
  const handleClassClick = (className: string): void => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('pick', 'documents');
    params.set('docClass', className);
    const qs = params.toString();
    // `scroll: false` keeps the scroll position intact — see
    // useWorkspaceSelection. Audit 2026-05-18 finding D-A.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // Fallback in case the parent isn't reading from useSearchParams
    // for the picker tab (defensive — the hook's reader is the
    // canonical path, this just hedges).
    setPickerTab('documents');
  };

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
            className="grid grid-cols-[1fr_auto] gap-3 items-center px-4 py-3 border-t first:border-t-0 border-border-subtle"
          >
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-12" />
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
    <div className="space-y-4">
      {/* Controls bar (sort + filter + totals). Compact layout for
          the ~316px-wide picker rail — totals on top, controls below
          (the prior single-row layout overflowed). */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[12.5px] text-fg-secondary">
          <ListOrdered className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
          <span>
            <span className="font-semibold text-fg-primary">
              {formatNumber(totalClasses)}
            </span>{' '}
            class{totalClasses === 1 ? '' : 'es'} ·{' '}
            <span className="font-semibold text-fg-primary">
              {formatNumber(totalDocuments)}
            </span>{' '}
            doc{totalDocuments === 1 ? '' : 's'}
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
              className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-[12px] text-fg-primary focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              aria-label="Sort classes"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 flex-1 min-w-[140px]">
            <Search
              className="h-3.5 w-3.5 text-fg-muted shrink-0"
              aria-hidden
            />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter class name"
              className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-[12px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand-500/40 w-full min-w-0"
              aria-label="Filter class names"
            />
          </label>
        </div>
      </div>

      {/* Class list — buttons (NOT links). Clicking switches the
          picker tab to Documents and writes ?docClass=...; we never
          leave the workspace. */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface px-4 py-6 text-center text-[13px] text-fg-secondary">
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
            <button
              key={className}
              type="button"
              onClick={() => handleClassClick(className)}
              className={cn(
                'grid grid-cols-[1fr_auto] gap-3 items-center w-full text-left',
                'px-4 py-3 border-t first:border-t-0 border-border-subtle',
                'bg-transparent transition-colors duration-(--duration-base) ease-(--ease-out) hover:bg-bg-muted',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40 focus-visible:bg-bg-muted',
              )}
            >
              <span className="font-mono text-[12.5px] text-fg-primary truncate">
                {className}
              </span>
              <span className="text-[12.5px] tabular-nums font-semibold text-fg-secondary">
                {formatNumber(count)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
