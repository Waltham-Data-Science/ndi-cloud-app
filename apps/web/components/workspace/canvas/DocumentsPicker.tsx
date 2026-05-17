'use client';

/**
 * DocumentsPicker — picker-rail body for the Documents tab of the
 * workspace canvas.
 *
 * Phase F3 of the one-canvas redesign (design doc:
 * `apps/web/docs/design/2026-05-16-workspace-canvas-redesign.md`).
 * The Documents tab is the GENERIC document browser inside the
 * picker rail. It's the fallback escape route when a document the
 * user wants isn't surfaced by Subjects / Sessions / Probes /
 * Stimuli.
 *
 * Two-mode UI (controlled by a workspace-local URL param `?docClass=`):
 *
 *   Mode A — no `?docClass=`: render the class-counts list. The user
 *     sees every NDI class in the dataset with its document count;
 *     clicking a class sets `?docClass=<className>` and switches to
 *     mode B.
 *
 *   Mode B — `?docClass=<className>` is set: render the documents
 *     of that class. Each row carries a "Set as…" dropdown letting
 *     the user assign the doc to one of the 5 selection dimensions
 *     (Subject / Session / Probe / Stimulus / Unit) via the
 *     workspace selection hook. A "← All classes" link at the top
 *     clears `?docClass=` and returns to mode A.
 *
 * Why `?docClass=` lives on the URL instead of local React state:
 *   - Deep-link / share survives ("show me Bhar's stimulus_presentation
 *     docs in the picker"). The class chip in the StructureBrowser's
 *     replacement story (`StatTile.tsx`) writes `?docClass=` to land
 *     here pre-filtered.
 *   - Browser back navigates from doc list → class list without
 *     reloading.
 *
 * `?docClass=` is intentionally kept separate from the 5 selection
 * dimensions (`useWorkspaceSelection` only owns those). It's a
 * picker-tab-local UI state — same way `?pick=` is.
 */
import { ChevronRight, ChevronLeft, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import { Skeleton } from '@/components/ui/Skeleton';
import { useClassCounts } from '@/lib/api/datasets';
import { useDocuments } from '@/lib/api/documents';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import {
  SELECTION_TITLES,
  useWorkspaceSelection,
  type SelectionKey,
} from '@/lib/workspace/use-workspace-selection';

interface DocumentsPickerProps {
  datasetId: string;
}

/**
 * Compute the displayed class list given raw counts + a filter query.
 * Pure for testability — exported separately. Sort is count-desc with
 * a name-asc tiebreaker, matching `StructureBrowser.deriveClassList`'s
 * default mode.
 */
export function deriveDocumentClasses(
  classCounts: Record<string, number>,
  filter: string,
): Array<{ className: string; count: number }> {
  const normalisedFilter = filter.trim().toLowerCase();
  return Object.entries(classCounts)
    .filter(([cls]) =>
      normalisedFilter ? cls.toLowerCase().includes(normalisedFilter) : true,
    )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([className, count]) => ({ className, count }));
}

export function DocumentsPicker({ datasetId }: DocumentsPickerProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const docClass = searchParams?.get('docClass') ?? null;

  const setDocClass = (next: string | null): void => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (next) {
      params.set('docClass', next);
    } else {
      params.delete('docClass');
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  if (docClass) {
    return (
      <DocumentList
        datasetId={datasetId}
        docClass={docClass}
        onBack={() => setDocClass(null)}
      />
    );
  }

  return <ClassList datasetId={datasetId} onPick={setDocClass} />;
}

// ---------------------------------------------------------------------------
// Mode A — class list
// ---------------------------------------------------------------------------

interface ClassListProps {
  datasetId: string;
  onPick: (className: string) => void;
}

function ClassList({ datasetId, onPick }: ClassListProps) {
  const classCounts = useClassCounts(datasetId);
  const [filter, setFilter] = useState('');

  const items = useMemo(() => {
    if (!classCounts.data) return [];
    return deriveDocumentClasses(classCounts.data.classCounts, filter);
  }, [classCounts.data, filter]);

  if (classCounts.isLoading) {
    return (
      <div className="space-y-2" aria-label="Loading classes">
        <Skeleton className="h-8 w-full rounded-md" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (classCounts.isError || !classCounts.data) {
    return (
      <div
        role="status"
        className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-6 text-[12.5px] text-fg-secondary leading-relaxed"
      >
        Couldn&rsquo;t load class counts for this dataset.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter class name"
          className={cn(
            'flex-1 min-w-0 rounded-md border border-border-subtle bg-bg-surface',
            'px-2 py-1 text-[12px] text-fg-primary placeholder:text-fg-muted',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/40',
          )}
          aria-label="Filter classes"
        />
      </label>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-6 text-center text-[12.5px] text-fg-secondary">
          No classes match &ldquo;{filter}&rdquo;.{' '}
          <button
            type="button"
            onClick={() => setFilter('')}
            className="text-ndi-teal hover:underline font-semibold"
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="rounded-md border border-border-subtle bg-bg-surface overflow-hidden">
          {items.map(({ className, count }) => (
            <button
              key={className}
              type="button"
              onClick={() => onPick(className)}
              className={cn(
                'w-full grid grid-cols-[1fr_auto_16px] gap-2 items-center text-left',
                'px-3 py-2 border-t first:border-t-0 border-border-subtle',
                'transition-colors duration-(--duration-base) ease-(--ease-out)',
                'hover:bg-bg-muted',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40 focus-visible:bg-bg-muted',
              )}
            >
              <span className="font-mono text-[12px] text-fg-primary truncate">
                {className}
              </span>
              <span className="text-[11.5px] tabular-nums font-semibold text-fg-secondary">
                {formatNumber(count)}
              </span>
              <ChevronRight
                className="h-3.5 w-3.5 text-fg-muted"
                aria-hidden
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode B — document list inside a class
// ---------------------------------------------------------------------------

interface DocumentListProps {
  datasetId: string;
  docClass: string;
  onBack: () => void;
}

const ASSIGNABLE_KEYS: ReadonlyArray<SelectionKey> = [
  'subject',
  'session',
  'probe',
  'stimulus',
  'unit',
];

function DocumentList({ datasetId, docClass, onBack }: DocumentListProps) {
  const { set } = useWorkspaceSelection();
  const [searchQuery, setSearchQuery] = useState('');
  const docs = useDocuments(datasetId, docClass, 1, 200);

  const items = useMemo(() => {
    const all = docs.data?.documents ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((doc) => {
      const id = String(doc.id ?? doc.ndiId ?? '').toLowerCase();
      const name = String(doc.name ?? '').toLowerCase();
      return id.includes(q) || name.includes(q);
    });
  }, [docs.data, searchQuery]);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className={cn(
          'inline-flex items-center gap-1 text-[12px] text-ndi-teal hover:underline font-semibold',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40 rounded-sm',
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        All classes
      </button>

      <div className="text-[11px] text-fg-muted">
        Browsing{' '}
        <span className="font-mono text-[11.5px] text-fg-secondary font-semibold">
          {docClass}
        </span>
      </div>

      <label className="flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter by name / id"
          className={cn(
            'flex-1 min-w-0 rounded-md border border-border-subtle bg-bg-surface',
            'px-2 py-1 text-[12px] text-fg-primary placeholder:text-fg-muted',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/40',
          )}
          aria-label="Filter documents"
        />
      </label>

      {docs.isLoading ? (
        <div className="space-y-2" aria-label="Loading documents">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : docs.isError ? (
        <div
          role="status"
          className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-6 text-[12.5px] text-fg-secondary"
        >
          Couldn&rsquo;t load documents for this class.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-6 text-center text-[12.5px] text-fg-secondary">
          {searchQuery
            ? `No documents match "${searchQuery}".`
            : 'No documents in this class.'}
        </div>
      ) : (
        <ul className="rounded-md border border-border-subtle bg-bg-surface overflow-hidden divide-y divide-border-subtle">
          {items.map((doc) => {
            const docId = doc.id ?? doc.ndiId ?? '';
            return (
              <li
                key={docId}
                className="px-2 py-2 flex items-center gap-2 hover:bg-bg-muted"
              >
                <div className="min-w-0 flex-1">
                  {doc.name && (
                    <div className="text-[12px] text-fg-primary truncate">
                      {doc.name}
                    </div>
                  )}
                  <div className="font-mono text-[10.5px] text-fg-muted truncate">
                    {docId}
                  </div>
                </div>
                <AssignMenu
                  docId={docId}
                  onAssign={(key) => set({ [key]: docId })}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface AssignMenuProps {
  docId: string;
  onAssign: (key: SelectionKey) => void;
}

/**
 * Native `<select>`-backed "Set as…" dropdown. We use a real
 * `<select>` rather than a custom popover so the rail stays under
 * the bundle budget and keyboard / screen-reader navigation Just
 * Works. The first option is a sentinel that re-renders after each
 * choice via the controlled-empty-value reset.
 */
function AssignMenu({ docId, onAssign }: AssignMenuProps) {
  return (
    <select
      aria-label={`Set document ${docId.slice(0, 8)} as…`}
      value=""
      onChange={(e) => {
        const next = e.target.value;
        if (next && ASSIGNABLE_KEYS.includes(next as SelectionKey)) {
          onAssign(next as SelectionKey);
        }
      }}
      className={cn(
        'shrink-0 rounded-md border border-border-subtle bg-bg-canvas',
        'px-1.5 py-1 text-[11px] text-fg-secondary',
        'focus:outline-none focus:ring-2 focus:ring-brand-500/40',
        'hover:border-border-strong cursor-pointer',
      )}
    >
      <option value="">Set as…</option>
      {ASSIGNABLE_KEYS.map((key) => (
        <option key={key} value={key}>
          {SELECTION_TITLES[key]}
        </option>
      ))}
    </select>
  );
}
