'use client';

/**
 * SubjectsBrowser — the picker-rail body for the Subjects picker tab.
 *
 * Phase F3 of the one-canvas redesign (design doc:
 * `apps/web/docs/design/2026-05-16-workspace-canvas-redesign.md`).
 * Replaces the prior Phase C full-page browser. Subjects are still
 * the universal NDI grain — every recording has a subject — so this
 * picker is where most filter-and-drill workflow lands. The mental
 * model is the tutorial's: filter the roster
 * (`StrainName contains PR811` → 76 rows), drill into one, **the
 * analysis cards on the right side of the canvas auto-update.**
 *
 * Selection contract: row click writes through `useWorkspaceSelection`'s
 * `set({ subject })`. Toggle-off by clicking the active row again.
 * Right-click opens a context menu with "Set as primary subject" /
 * "Copy ID" / "Open in Document Detail". Multi-select via the
 * checkbox column drives bulk actions.
 *
 * Filter state (?strain=, ?species=, ?sex=) stays in URL params as
 * before — those are LOCAL picker state, not workspace selection
 * context. They survive refresh + share but never leave the picker.
 *
 * Phase G7 (2026-05-16): the table body is now the shared
 * `WorkspaceDataGrid` primitive — same chrome (sticky header, sortable
 * columns, column visibility menu, bulk actions, context menu, kbd
 * nav) across every picker. The picker only owns the columns +
 * filter UI + the per-row action factory.
 */
import { Copy, Crosshair, ExternalLink, Sparkles } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import { buildPickerColumns } from '@/lib/workspace/build-picker-columns';

import { Skeleton } from '@/components/ui/Skeleton';
import {
  WorkspaceFilterBar,
  type FilterField,
} from '@/components/workspace/WorkspaceFilterBar';
import { WorkspaceDataGrid } from '@/components/workspace/canvas/WorkspaceDataGrid';
import type { BulkAction } from '@/components/workspace/canvas/DataGridBulkActions';
import type { ContextMenuEntry } from '@/components/workspace/canvas/DataGridContextMenu';
import { DataGridSearchInput } from '@/components/workspace/canvas/DataGridSearchInput';
import {
  buildPrefillPrompt,
  emitAskPrefill,
} from '@/lib/ai/ask-prefill-bus';
import { useSummaryTable } from '@/lib/api/tables';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

interface SubjectsBrowserProps {
  datasetId: string;
}

interface SubjectRow {
  subjectIdentifier?: string | null;
  subjectLocalIdentifier?: string | null;
  subjectDocumentIdentifier?: string | null;
  speciesName?: string | null;
  strainName?: string | null;
  biologicalSexName?: string | null;
  ageAtRecording?: string | number | null;
  [key: string]: unknown;
}

/**
 * Pure filter algorithm — exported for unit testing. Returns the
 * subset of rows matching all currently-active filters.
 */
export function filterSubjects(
  rows: SubjectRow[],
  filters: { strain: string; species: string; sex: string },
): SubjectRow[] {
  const strainQ = filters.strain.trim().toLowerCase();
  const speciesQ = filters.species.trim().toLowerCase();
  const sexQ = filters.sex.trim();
  return rows.filter((row) => {
    if (
      strainQ &&
      !String(row.strainName ?? '').toLowerCase().includes(strainQ)
    ) {
      return false;
    }
    if (
      speciesQ &&
      !String(row.speciesName ?? '').toLowerCase().includes(speciesQ)
    ) {
      return false;
    }
    if (sexQ && String(row.biologicalSexName ?? '') !== sexQ) return false;
    return true;
  });
}

/**
 * Derive the distinct values for the sex filter dropdown from the
 * current row set. We prepend an "Any" option (value '') so the
 * default state is unfiltered.
 */
function deriveSexOptions(
  rows: SubjectRow[],
): ReadonlyArray<{ value: string; label: string }> {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const v = (r.biologicalSexName ?? '').toString().trim();
    if (!v) continue;
    seen.set(v, (seen.get(v) ?? 0) + 1);
  }
  const sorted = Array.from(seen.entries()).sort((a, b) => b[1] - a[1]);
  return [
    { value: '', label: 'Any' },
    ...sorted.map(([v]) => ({ value: v, label: v })),
  ];
}

/**
 * Resolve the row's primary id — prefer the canonical
 * `subjectDocumentIdentifier`, fall back to `subjectIdentifier`. The
 * primary id is what every other workspace surface keys on, so the
 * grid + context menu + bulk actions all use the SAME accessor.
 */
function subjectRowId(row: SubjectRow): string {
  const id = row.subjectDocumentIdentifier ?? row.subjectIdentifier;
  return typeof id === 'string' && id.length > 0 ? id : '';
}

export function SubjectsBrowser({ datasetId }: SubjectsBrowserProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const { selection, set } = useWorkspaceSelection();

  // Local picker state — these are URL params (?strain=, ?species=,
  // ?sex=) so they survive refresh + share. They have NOTHING to do
  // with the workspace selection context; they're filter chips.
  const strainFilter = searchParams?.get('strain') ?? '';
  const speciesFilter = searchParams?.get('species') ?? '';
  const sexFilter = searchParams?.get('sex') ?? '';
  // Phase H6 — global free-text search. In-memory state (cleared
  // on picker tab switch); not a URL param because it's a transient
  // editing mode, not a shareable filter.
  const [globalSearch, setGlobalSearch] = useState('');

  // Workspace selection context — drives the "active row" highlight
  // and the analysis panels on the canvas. Lives in ?subject= via
  // useWorkspaceSelection (single source of truth across the canvas).
  const selectedDocId = selection.subject;

  const updateSearch = (mutate: (p: URLSearchParams) => void): void => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    mutate(params);
    const qs = params.toString();
    // `scroll: false` — see useWorkspaceSelection comment. Audit
    // 2026-05-18 finding D-A.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setParam = (key: string, value: string): void => {
    updateSearch((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
    });
  };

  const clearFilters = (): void => {
    updateSearch((p) => {
      p.delete('strain');
      p.delete('species');
      p.delete('sex');
      // We do NOT clear the workspace selection here — that's a
      // separate concept owned by useWorkspaceSelection.
    });
  };

  // Backend fetch — full subject table. Pages this hook returns are
  // already projected by the summary_table_service.
  const summary = useSummaryTable(datasetId, 'subject');

  const allRows: SubjectRow[] = useMemo(
    () => (summary.data?.rows as SubjectRow[]) ?? [],
    [summary.data],
  );

  const filteredRows = useMemo(
    () =>
      filterSubjects(allRows, {
        strain: strainFilter,
        species: speciesFilter,
        sex: sexFilter,
      }),
    [allRows, strainFilter, speciesFilter, sexFilter],
  );

  // Audit 2026-05-18 finding D-C: the in-grid column-filter popovers
  // and global search live inside WorkspaceDataGrid (TanStack state).
  // Before this, the outer "Showing X of Y subjects" header reflected
  // only the URL-chip filters, so narrowing via the grid's funnel
  // icons or the search input left the page-level count stale. The
  // grid now reports its post-filter row count up via
  // onFilteredRowsChange; we default to the URL-filter count for
  // the very first paint (before the grid's effect fires) and fall
  // back to it whenever the URL filters change.
  const [gridFilteredCount, setGridFilteredCount] = useState<
    number | null
  >(null);
  // The grid's effect re-fires on filtered-row count changes; the
  // displayed count is the grid's report when known, otherwise the
  // URL-filter count. No effect/state-sync needed here.
  const displayedFilteredCount =
    gridFilteredCount ?? filteredRows.length;

  const sexOptions = useMemo(() => deriveSexOptions(allRows), [allRows]);

  const filterFields: FilterField[] = [
    {
      kind: 'text',
      key: 'strain',
      label: 'Strain',
      value: strainFilter,
      placeholder: 'contains PR811',
      onChange: (v) => setParam('strain', v),
    },
    {
      kind: 'text',
      key: 'species',
      label: 'Species',
      value: speciesFilter,
      placeholder: 'contains elegans',
      onChange: (v) => setParam('species', v),
    },
    {
      kind: 'select',
      key: 'sex',
      label: 'Sex',
      value: sexFilter,
      options: sexOptions,
      onChange: (v) => setParam('sex', v),
    },
  ];

  // Audit 2026-05-18 (data-parity round, follow-up): build columns
  // ENTIRELY from the server-emitted `data.columns` envelope. No
  // curated list, no per-column custom cells, no class-specific
  // accessors. The backend's `summary_table_service` projection
  // already canonicalises column order (identifier-first, then
  // attributes, then enrichments); the smart default cell auto-
  // formats values by type (CURIE / Mongo id / URL / ISO date /
  // number / boolean / array / object). Same code path serves
  // every dataset, every class, without dropping any column the
  // public `/datasets/[id]/tables/subject` view exposes.
  const built = useMemo(
    () =>
      buildPickerColumns<SubjectRow>({
        serverColumns: summary.data?.columns,
        rows: allRows,
      }),
    [summary.data, allRows],
  );

  const columns = built.columns;
  const initialColumnVisibility = built.initialVisibility;
  const dynamicColumnLabels = built.columnLabels;
  const dynamicLockedColumnIds = built.lockedColumnIds;

  // Context menu factory — per-row. The grid calls this with the
  // right-clicked row's original data; we resolve the doc id and
  // build the action list. Keep this stable across renders so Radix
  // doesn't re-mount the menu.
  const contextMenuActions = useCallback(
    (row: SubjectRow): ReadonlyArray<ContextMenuEntry> => {
      const id = subjectRowId(row);
      if (!id) return [];
      return [
        {
          kind: 'item',
          label: 'Set as primary subject',
          icon: Crosshair,
          onSelect: () => set({ subject: id }),
        },
        {
          kind: 'item',
          label: 'Copy ID',
          icon: Copy,
          shortcut: '⌘C',
          onSelect: () => {
            void navigator.clipboard?.writeText(id);
          },
        },
        { kind: 'separator' },
        {
          kind: 'item',
          label: 'Open in Document Detail',
          icon: ExternalLink,
          // Explicit user gesture → external nav is the expected
          // behavior. NOT an automatic redirect.
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

  // Bulk-action factory — receives the selection set as ordered ids.
  // Two shared actions across every picker: copy-ids and ask-claude.
  // Ask-Claude dispatches a custom event so a future AskPanel listener
  // can pre-fill chat; we ALSO copy to clipboard so the button does
  // something useful TODAY even without a listener.
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
        label: `Ask Claude about these subjects`,
        variant: 'primary',
        icon: Sparkles,
        onSelect: (ids) => {
          emitAskPrefill({
            text: buildPrefillPrompt('subject', ids),
            autoSend: false,
          });
        },
      },
    ],
    [],
  );

  if (summary.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-[420px] w-full rounded-xl" />
      </div>
    );
  }

  if (summary.isError) {
    // Rich error copy with a fallback link to the summary table —
    // mounted ABOVE the grid (the grid's default empty state is
    // generic; this one names the dataset-level fallback).
    return (
      <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-4 py-3 text-[13px] text-fg-secondary">
        Couldn&rsquo;t load subjects for this dataset. Refresh the page, or
        try the{' '}
        <a
          href={`/datasets/${datasetId}/tables/subject`}
          className="text-ndi-teal hover:underline font-semibold"
        >
          summary subject table
        </a>{' '}
        for the raw data.
      </div>
    );
  }

  const hasNoSubjects = allRows.length === 0;

  return (
    <div className="space-y-3">
      <DataGridSearchInput
        value={globalSearch}
        onChange={setGlobalSearch}
        placeholder="Search subjects…"
        ariaLabel="Search subjects"
      />
      <WorkspaceFilterBar
        fields={filterFields}
        totalRows={allRows.length}
        // Audit 2026-05-18 finding D-C: use the grid-reported count so
        // the header narrows when the user filters via a column-funnel
        // or the search box — not just the URL chip filters.
        filteredRows={displayedFilteredCount}
        noun="subject"
        onClear={clearFilters}
      />

      {hasNoSubjects ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface p-8 text-center text-[13.5px] text-fg-secondary">
          This dataset doesn&rsquo;t have any subject documents yet. The
          Documents picker lists every class with rows.
        </div>
      ) : (
        <WorkspaceDataGrid<SubjectRow>
          data={filteredRows}
          columns={columns}
          rowId={subjectRowId}
          noun="subject"
          primaryId={selectedDocId}
          onPrimaryChange={(id) => set({ subject: id })}
          contextMenuActions={contextMenuActions}
          bulkActions={bulkActions}
          globalFilter={globalSearch}
          onFilteredRowsChange={setGridFilteredCount}
          // No explicit groupableColumnIds — every column the backend
          // returns is offered as a group-by option (audit 2026-05-18
          // follow-up: no hardcoding). The grid filters out the locked
          // identifier column automatically. Users can group by Strain,
          // Species, Sex, OR any backend-discovered enrichment (e.g.
          // Treatment, FigureName, etc.) without the workspace author
          // having pre-enumerated them.
          columnLabels={dynamicColumnLabels}
          lockedColumnIds={dynamicLockedColumnIds}
          initialColumnVisibility={initialColumnVisibility}
          label="Subjects"
          emptyState={
            <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface p-8 text-center text-[13.5px] text-fg-secondary">
              No subjects match the current filters.{' '}
              <button
                type="button"
                onClick={clearFilters}
                className="text-ndi-teal hover:underline font-semibold"
              >
                Clear filters
              </button>{' '}
              to see all {allRows.length.toLocaleString()} subjects.
            </div>
          }
        />
      )}
    </div>
  );
}
