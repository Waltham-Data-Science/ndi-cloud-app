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
 * There are NO outbound View Actions in this body — the analysis
 * panels on the canvas read `selection.subject` directly. The single
 * remaining Document Explorer escape lives at the bottom of the
 * PickerRail (see `DocumentExplorerEscape`).
 *
 * Filter state (?strain=, ?species=, ?sex=) stays in URL params as
 * before — those are LOCAL picker state, not workspace selection
 * context. They survive refresh + share but never leave the picker.
 *
 * Layout adapted for the ~340px-wide picker rail (~316px of usable
 * space after padding). Columns trimmed from 5 → 3 (Subject / Species
 * / Age); strain + sex remain in the filter chips above the table.
 * The filter cascade logic + filter UI is otherwise intact.
 */
import { useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import { Skeleton } from '@/components/ui/Skeleton';
import { VirtualizedTable } from '@/components/ui/VirtualizedTable';
import {
  WorkspaceFilterBar,
  type FilterField,
} from '@/components/workspace/WorkspaceFilterBar';
import { useSummaryTable } from '@/lib/api/tables';
import { cn } from '@/lib/cn';
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

  // Workspace selection context — drives the "active row" highlight
  // and the analysis panels on the canvas. Lives in ?subject= via
  // useWorkspaceSelection (single source of truth across the canvas).
  const selectedDocId = selection.subject;

  const updateSearch = (mutate: (p: URLSearchParams) => void): void => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    mutate(params);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
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

  // TanStack table — columns trimmed for the narrow picker rail.
  // Strain + Sex are filter-only (they live in the filter chips above
  // the table); the table shows Subject identifier, Species, and Age.
  const columnHelper = createColumnHelper<SubjectRow>();
  const columns = useMemo<ColumnDef<SubjectRow, unknown>[]>(
    () =>
      [
        columnHelper.accessor((r) => r.subjectLocalIdentifier ?? r.subjectIdentifier ?? '—', {
          id: 'identifier',
          header: 'Subject',
          cell: (info) => (
            <span className="font-mono text-[12px] text-fg-primary truncate inline-block max-w-full">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 180,
        }),
        columnHelper.accessor((r) => r.speciesName ?? '—', {
          id: 'species',
          header: 'Species',
          cell: (info) => (
            <span className="text-[12px] text-fg-secondary truncate inline-block max-w-full">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 110,
        }),
        columnHelper.accessor(
          (r) =>
            r.ageAtRecording != null && r.ageAtRecording !== ''
              ? String(r.ageAtRecording)
              : '—',
          {
            id: 'age',
            header: 'Age',
            cell: (info) => (
              <span className="text-[12px] text-fg-secondary tabular-nums">
                {String(info.getValue() ?? '—')}
              </span>
            ),
            size: 60,
          },
        ),
      ] as ColumnDef<SubjectRow, unknown>[],
    [columnHelper],
  );

  // React Compiler skips memoization for components consuming
  // `useReactTable()` — same rationale as VirtualizedTable's
  // useVirtualizer disable. The compiler's reduced optimization here
  // is acceptable; TanStack Table memoizes its own state. Disabled
  // at the call site only.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (summary.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-[420px] w-full rounded-xl" />
      </div>
    );
  }

  if (summary.isError) {
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
    <div className="space-y-4">
      <WorkspaceFilterBar
        fields={filterFields}
        totalRows={allRows.length}
        filteredRows={filteredRows.length}
        noun="subject"
        onClear={clearFilters}
      />

      {selectedDocId && (
        // Selection-active hint — confirms the user that their row
        // click took effect AND that the canvas panels will react.
        // Hidden when nothing is selected so we don't add chrome to
        // the cold-start state.
        <p
          data-testid="subjects-selection-active-hint"
          className="text-[11.5px] text-fg-secondary"
        >
          Active subject — analysis cards on the right will update.
        </p>
      )}

      {hasNoSubjects ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface p-8 text-center text-[13.5px] text-fg-secondary">
          This dataset doesn&rsquo;t have any subject documents yet. The
          Documents picker lists every class with rows.
        </div>
      ) : filteredRows.length === 0 ? (
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
      ) : (
        <VirtualizedTable
          table={table}
          estimateSize={36}
          onRowClick={(row) => {
            const docId = row.subjectDocumentIdentifier;
            if (typeof docId !== 'string' || docId.length === 0) return;
            // Toggle: clicking the active row again clears it.
            // Otherwise activate this row as the selection context.
            if (docId === selectedDocId) {
              set({ subject: null });
            } else {
              set({ subject: docId });
            }
          }}
          getRowClassName={(row) => {
            const docId = row.original.subjectDocumentIdentifier;
            return docId === selectedDocId
              ? 'bg-brand-blue/5 border-l-2 border-l-brand-blue'
              : undefined;
          }}
          renderHeaderCell={(header) => (
            <th
              key={header.id}
              colSpan={header.colSpan}
              className={cn(
                'px-3 py-2 text-left text-[10.5px] font-bold tracking-eyebrow uppercase text-fg-muted',
                'border-b border-border-subtle bg-bg-muted/40 sticky top-0',
              )}
              style={{ width: header.getSize() }}
            >
              {header.isPlaceholder
                ? null
                : flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
            </th>
          )}
          renderCell={(cell) => (
            <td
              key={cell.id}
              className="px-3 py-2 align-top truncate"
              style={{ width: cell.column.getSize() }}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          )}
          emptyState={
            <div className="text-center text-[13.5px] text-fg-secondary py-8">
              No subjects match the current filters.
            </div>
          }
        />
      )}
    </div>
  );
}
