'use client';

/**
 * SubjectsBrowser — the workhorse browser for the Subjects tab.
 *
 * Phase C of the workspace redesign (design doc:
 * `apps/web/docs/design/2026-05-16-workspace-redesign.md`). Subjects
 * are the universal NDI grain — every recording has a subject — so
 * this tab is where ~80% of scientific filter-and-drill workflow
 * lands per the MATLAB tutorial analysis. The mental model is the
 * tutorial's: filter the roster (`StrainName contains PR811` → 76
 * rows), drill into one, launch an analysis scoped to that subject.
 *
 * Data shape: pulls from `useSummaryTable` (the existing
 * `/api/datasets/[id]/tables/subject` summary-tables endpoint). The
 * subject row shape carries 15+ columns (subjectIdentifier,
 * speciesName, strainName, biologicalSexName, age, etc.) projected
 * by the backend's `summary_table_service`. We render a focused
 * subset of the most useful columns and reserve the full set for
 * the Document Explorer drill.
 *
 * URL state (lives in `?strain=`, `?species=`, `?sex=`, `?select=`):
 *   - Filters persist across refresh + share.
 *   - Selection is the doc id of the active row, displayed in the
 *     ViewActionsRail below the table.
 *
 * Table: TanStack Table on top of `VirtualizedTable` so a 5,314-row
 * roster (Bhar) renders smoothly with no virtualization stutter.
 *
 * Note on filtering: filtering is client-side after the full row
 * set is fetched. For the largest Bhar dataset that's ~6 MB once
 * over the wire and then instant on every keystroke. Server-side
 * filtering would require a tables-endpoint extension; deferred to
 * a Phase E follow-up.
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
import { BarChart3, FlaskConical, Layers, Microscope, Workflow } from 'lucide-react';

import { Skeleton } from '@/components/ui/Skeleton';
import { VirtualizedTable } from '@/components/ui/VirtualizedTable';
import {
  WorkspaceFilterBar,
  type FilterField,
} from '@/components/workspace/WorkspaceFilterBar';
import {
  ViewActionsRail,
  type ViewAction,
} from '@/components/workspace/ViewActionsRail';
import { useSummaryTable } from '@/lib/api/tables';
import { cn } from '@/lib/cn';

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

  // URL-state-driven filter + selection values.
  const strainFilter = searchParams?.get('strain') ?? '';
  const speciesFilter = searchParams?.get('species') ?? '';
  const sexFilter = searchParams?.get('sex') ?? '';
  const selectedDocId = searchParams?.get('select') ?? '';

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
      // Keep `select` so a deselect doesn't fire as a side effect of
      // clearing filters. Selection is a separate UI concept.
    });
  };

  const clearSelection = (): void => {
    setParam('select', '');
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

  // Identify the selected row (if any). Selection key is the
  // subject document id — same id the tutorial drills into.
  const selectedRow = useMemo(
    () =>
      selectedDocId
        ? filteredRows.find(
            (r) => r.subjectDocumentIdentifier === selectedDocId,
          ) ?? null
        : null,
    [filteredRows, selectedDocId],
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

  // Action set for a selected subject — links to the analysis tabs
  // with the subject id pre-filled. Phase D will add anchor hashes
  // once each panel carries a matching headingId; for Phase C we
  // route to /analyses and the user scrolls to the relevant panel.
  const buildActions = (docId: string): ViewAction[] => {
    const base = `/my/workspace/${datasetId}/analyses?subject=${encodeURIComponent(docId)}`;
    return [
      {
        label: 'Signal trace',
        href: `${base}#signal-viewer`,
        icon: Workflow,
        hint: 'signal',
      },
      {
        label: 'Treatment timeline',
        href: `${base}#treatment-timeline`,
        icon: Layers,
        hint: 'gantt',
      },
      {
        label: 'Spike raster',
        href: `${base}#spike-activity`,
        icon: BarChart3,
        hint: 'raster',
      },
      {
        label: 'Behavioural compare',
        href: `${base}#behavioral-compare`,
        icon: Microscope,
        hint: 'violin',
      },
      {
        label: 'View document',
        href: `/datasets/${datasetId}/documents/${encodeURIComponent(docId)}`,
        icon: FlaskConical,
      },
    ];
  };

  // TanStack table — columns curated to fit the desktop view; the
  // full 15-column subject projection lives in the Summary Tables
  // surface (one click away via the action rail).
  const columnHelper = createColumnHelper<SubjectRow>();
  const columns = useMemo<ColumnDef<SubjectRow, unknown>[]>(
    () =>
      [
        columnHelper.accessor((r) => r.subjectLocalIdentifier ?? r.subjectIdentifier ?? '—', {
          id: 'identifier',
          header: 'Subject',
          cell: (info) => (
            <span className="font-mono text-[12.5px] text-fg-primary truncate inline-block max-w-full">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 280,
        }),
        columnHelper.accessor((r) => r.speciesName ?? '—', {
          id: 'species',
          header: 'Species',
          cell: (info) => (
            <span className="text-[12.5px] text-fg-secondary">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 160,
        }),
        columnHelper.accessor((r) => r.strainName ?? '—', {
          id: 'strain',
          header: 'Strain',
          cell: (info) => (
            <span className="text-[12.5px] text-fg-secondary">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 140,
        }),
        columnHelper.accessor((r) => r.biologicalSexName ?? '—', {
          id: 'sex',
          header: 'Sex',
          cell: (info) => (
            <span className="text-[12.5px] text-fg-secondary">
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
              <span className="text-[12.5px] text-fg-secondary tabular-nums">
                {String(info.getValue() ?? '—')}
              </span>
            ),
            size: 100,
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
    <div className="space-y-5">
      <WorkspaceFilterBar
        fields={filterFields}
        totalRows={allRows.length}
        filteredRows={filteredRows.length}
        noun="subject"
        onClear={clearFilters}
      />

      {hasNoSubjects ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface p-8 text-center text-[13.5px] text-fg-secondary">
          This dataset doesn&rsquo;t have any subject documents yet. The
          structure tab lists every class with rows.
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
            if (typeof docId === 'string' && docId.length > 0) {
              setParam('select', docId);
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

      {selectedRow && (
        <ViewActionsRail
          selection={{
            label: String(
              selectedRow.subjectLocalIdentifier ??
                selectedRow.subjectIdentifier ??
                selectedDocId,
            ),
            sublabel: [
              selectedRow.speciesName,
              selectedRow.strainName,
              selectedRow.biologicalSexName,
            ]
              .filter((v) => v && String(v).trim() !== '' && v !== '—')
              .join(' · ') || undefined,
          }}
          actions={buildActions(selectedDocId)}
          onClear={clearSelection}
        />
      )}
    </div>
  );
}
