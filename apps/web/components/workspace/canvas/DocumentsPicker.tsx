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
 *     mode B. (Class-list mode is a plain button stack — no grid +
 *     no per-class context menu, since clicks are navigation within
 *     the picker, not selection writes.)
 *
 *   Mode B — `?docClass=<className>` is set: render the documents
 *     of that class via the shared `WorkspaceDataGrid`. Right-click
 *     on a row opens a context menu with a "Set as" group offering
 *     all 5 selection dimensions (Subject / Session / Probe /
 *     Stimulus / Unit), plus Copy ID and Open in Document Detail.
 *     A "← All classes" link at the top clears `?docClass=` and
 *     returns to mode A.
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
 *
 * Phase G7 (2026-05-16): doc-list mode migrated to the shared
 * `WorkspaceDataGrid` primitive. Class-list mode stays a button stack
 * (per-class context-menu actions would be confusing — class clicks
 * are navigation, not selection writes).
 */
import { ChevronRight, ChevronLeft, Copy, ExternalLink, Sparkles } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  createColumnHelper,
  type ColumnDef,
} from '@tanstack/react-table';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import { Skeleton } from '@/components/ui/Skeleton';
import { WorkspaceDataGrid } from '@/components/workspace/canvas/WorkspaceDataGrid';
import type { BulkAction } from '@/components/workspace/canvas/DataGridBulkActions';
import type { ContextMenuEntry, ContextMenuItem } from '@/components/workspace/canvas/DataGridContextMenu';
import { DataGridSearchInput } from '@/components/workspace/canvas/DataGridSearchInput';
import {
  buildPrefillPrompt,
  emitAskPrefill,
} from '@/lib/ai/ask-prefill-bus';
import { useClassCounts } from '@/lib/api/datasets';
import { useDocuments, type DocumentSummary } from '@/lib/api/documents';
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
      <DataGridSearchInput
        value={filter}
        onChange={setFilter}
        placeholder="Search classes…"
        ariaLabel="Search classes"
      />

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

/**
 * Normalised doc row shape for the doc-list grid. Pulls the
 * canonical id out of `DocumentSummary` once so the column accessors
 * + rowId callback stay simple.
 */
interface DocRow {
  docId: string;
  name: string | null;
  raw: DocumentSummary;
}

function projectDocRow(doc: DocumentSummary): DocRow | null {
  const docId = doc.id ?? doc.ndiId ?? '';
  if (typeof docId !== 'string' || docId.length === 0) return null;
  return {
    docId,
    name: typeof doc.name === 'string' ? doc.name : null,
    raw: doc,
  };
}

function docRowId(row: DocRow): string {
  return row.docId;
}

function DocumentList({ datasetId, docClass, onBack }: DocumentListProps) {
  const { set } = useWorkspaceSelection();
  const [searchQuery, setSearchQuery] = useState('');
  const docs = useDocuments(datasetId, docClass, 1, 200);
  // F3 — surface the server-side total when it exceeds what we
  // fetched. Pre-fix the grid footer read "200 documents" even when
  // the class had 5,000 — misleading the user into thinking the
  // class was tiny. Backend always returns `total` alongside `documents`.
  const serverTotal = docs.data?.total ?? 0;
  const fetchedCount = docs.data?.documents?.length ?? 0;
  const truncated = serverTotal > fetchedCount;

  // Project + filter once.
  const filteredRows = useMemo<DocRow[]>(() => {
    const all = docs.data?.documents ?? [];
    const projected: DocRow[] = [];
    for (const doc of all) {
      const row = projectDocRow(doc);
      if (row) projected.push(row);
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projected;
    return projected.filter(
      (row) =>
        row.docId.toLowerCase().includes(q) ||
        (row.name ?? '').toLowerCase().includes(q),
    );
  }, [docs.data, searchQuery]);

  const columnHelper = createColumnHelper<DocRow>();
  const columns = useMemo<ColumnDef<DocRow, unknown>[]>(
    () =>
      [
        columnHelper.accessor((r) => r.name ?? r.docId, {
          id: 'name',
          header: 'Document',
          cell: (info) => {
            const row = info.row.original;
            return (
              <div className="min-w-0">
                {row.name && (
                  <div className="text-[12px] text-fg-primary truncate">
                    {row.name}
                  </div>
                )}
                <div
                  className="font-mono text-[10.5px] text-fg-muted truncate"
                  aria-label={`Set document ${row.docId.slice(0, 8)} as…`}
                >
                  {row.docId}
                </div>
              </div>
            );
          },
          size: 260,
        }),
      ] as ColumnDef<DocRow, unknown>[],
    [columnHelper],
  );

  // Context menu — the "Set as" group exposes every selection
  // dimension as a separate item. Mirrors the old AssignMenu's
  // native <select>, but right-click discovery + grouping per the
  // grid's chrome.
  const contextMenuActions = useCallback(
    (row: DocRow): ReadonlyArray<ContextMenuEntry> => {
      const id = row.docId;
      if (!id) return [];
      const setAsItems: ReadonlyArray<ContextMenuItem> = ASSIGNABLE_KEYS.map(
        (key) => ({
          kind: 'item' as const,
          label: SELECTION_TITLES[key],
          onSelect: () => set({ [key]: id }),
        }),
      );
      return [
        { kind: 'group', label: 'Set as', items: setAsItems },
        { kind: 'separator' },
        {
          kind: 'item',
          label: 'Copy ID',
          icon: Copy,
          shortcut: '⌘C',
          onSelect: () => {
            void navigator.clipboard?.writeText(id);
          },
        },
        {
          kind: 'item',
          label: 'Open in Document Detail',
          icon: ExternalLink,
          onSelect: () => {
            window.open(
              `/datasets/${datasetId}/documents/${id}`,
              '_blank',
              'noopener,noreferrer',
            );
          },
        },
      ];
    },
    [set, datasetId],
  );

  const bulkActions = useCallback(
    (selectedIds: ReadonlyArray<string>): ReadonlyArray<BulkAction> => [
      {
        id: 'copy-ids',
        label: `Copy ${selectedIds.length} IDs`,
        icon: Copy,
        onSelect: (ids) => {
          void navigator.clipboard?.writeText(ids.join('\n'));
        },
      },
      {
        id: 'ask-claude',
        label: `Ask Claude about these documents`,
        variant: 'primary',
        icon: Sparkles,
        onSelect: (ids) => {
          // Use the doc class as the noun if we have one — keeps
          // the prompt specific ("3 probe_location documents" vs
          // generic "3 documents").
          const noun = docClass ?? 'document';
          emitAskPrefill({
            text: buildPrefillPrompt(noun, ids),
            autoSend: false,
          });
        },
      },
    ],
    [docClass],
  );

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

      <DataGridSearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search documents…"
        ariaLabel="Search documents"
      />

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
      ) : (
        <>
          {truncated && (
            <div
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900"
            >
              Showing the first {fetchedCount.toLocaleString()} of{' '}
              <span className="font-semibold tabular-nums">
                {serverTotal.toLocaleString()}
              </span>{' '}
              documents in this class. Use the search above to find a
              specific id, or pick a more specific class from the
              class list.
            </div>
          )}
          <WorkspaceDataGrid<DocRow>
          data={filteredRows}
          columns={columns}
          rowId={docRowId}
          noun="document"
          // Documents picker has no per-class primary selection
          // concept — assignment is via the "Set as" context menu
          // group instead. Pass null + no-op so the grid never
          // highlights a row as primary.
          primaryId={null}
          onPrimaryChange={() => undefined}
          contextMenuActions={contextMenuActions}
          bulkActions={bulkActions}
          // Documents picker doesn't pass globalFilter — the
          // existing searchQuery already filters at the
          // filteredRows derivation (server-tied keys + class
          // metadata). Keeping it client-side avoids re-filtering
          // twice. Other pickers use the grid's globalFilter
          // because they don't have a pre-filtered derivation.
          columnLabels={{ name: 'Document' }}
          lockedColumnIds={['name']}
          label="Documents"
          emptyState={
            <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-6 text-center text-[12.5px] text-fg-secondary">
              {searchQuery
                ? `No documents match "${searchQuery}".`
                : 'No documents in this class.'}
            </div>
          }
        />
        </>
      )}
    </div>
  );
}
