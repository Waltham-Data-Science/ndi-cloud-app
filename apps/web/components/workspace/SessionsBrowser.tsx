'use client';

/**
 * SessionsBrowser — the picker-rail body for the Sessions picker tab.
 *
 * Phase F3 of the one-canvas redesign. Session-grain counterpart to
 * SubjectsBrowser — same filter-and-drill flow, different underlying
 * class (`element_epoch` instead of `subject`).
 *
 * Selection contract: row click writes `selection.session` via
 * `useWorkspaceSelection.set({ session })`. Toggle-off by clicking
 * the active row again. There are NO outbound View Actions in this
 * body — the analysis panels on the canvas read `selection.session`
 * directly.
 *
 * Reactive cascade: when `selection.subject` is set, the table
 * pre-filters client-side to only that subject's epochs. The
 * `element_epoch` summary table includes `subjectDocumentIdentifier`
 * per row, so we can compare against `selection.subject` directly
 * without a backend round-trip. This matches the design doc's "Hex /
 * Neurosift reactive cascade" pattern — pick a subject, see only its
 * sessions.
 *
 * Filter UI: kept the time-window text filter (the tutorial's
 * `global_t0 contains Jun-2023` pattern). Dropped the old free-text
 * Subject + Probe filters — those URL params now collide with the
 * workspace selection keys, and the cascade-from-selection covers the
 * Subject case. Probes get their own picker tab.
 *
 * Layout adapted for the ~340px-wide picker rail. Columns trimmed
 * from 5 → 3 (Epoch / Start / Approach); the Stop column + Subject
 * column are dropped (Subject is the cascade source, Stop is
 * available in the Document Explorer drill).
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

interface SessionsBrowserProps {
  datasetId: string;
}

/**
 * Epoch row shape — projected by `summary_table_service`. The
 * t0/t1 fields are objects (`{devTime, globalTime}`) per the
 * backend's `_normalize_t0_t1`; we treat them as opaque and use a
 * small helper to extract a displayable string.
 */
interface EpochRow {
  epochNumber?: string | number | null;
  epochDocumentIdentifier?: string | null;
  subjectDocumentIdentifier?: string | null;
  probeDocumentIdentifier?: string | null;
  epochStart?: { devTime?: unknown; globalTime?: unknown } | null;
  epochStop?: { devTime?: unknown; globalTime?: unknown } | null;
  approachName?: string | null;
  mixtureName?: string | null;
  [key: string]: unknown;
}

/**
 * Extract a displayable string for an epoch's t0/t1 cell. Prefers
 * globalTime when set; falls back to devTime. Returns "—" when both
 * are missing.
 */
export function formatEpochTime(
  t: EpochRow['epochStart'] | EpochRow['epochStop'],
): string {
  if (!t) return '—';
  const g = t.globalTime;
  if (g !== null && g !== undefined && g !== '') return String(g);
  const d = t.devTime;
  if (d !== null && d !== undefined && d !== '') return String(d);
  return '—';
}

/**
 * Pure filter algorithm — exported for unit testing. The `subject`
 * key is now the cascade source (an exact-equality match on
 * `subjectDocumentIdentifier`), not a free-text substring. The
 * `window` key remains a substring match against the t0/t1 display
 * strings. The `probe` key is preserved for backward compatibility
 * with the existing test suite but is not wired to any UI control
 * (probes get their own picker tab in the one-canvas layout).
 */
export function filterEpochs(
  rows: EpochRow[],
  filters: { subject: string; window: string; probe: string },
): EpochRow[] {
  const subjQ = filters.subject.trim().toLowerCase();
  const winQ = filters.window.trim().toLowerCase();
  const probeQ = filters.probe.trim().toLowerCase();
  return rows.filter((row) => {
    if (
      subjQ &&
      !String(row.subjectDocumentIdentifier ?? '')
        .toLowerCase()
        .includes(subjQ)
    ) {
      return false;
    }
    if (
      probeQ &&
      !String(row.probeDocumentIdentifier ?? '')
        .toLowerCase()
        .includes(probeQ)
    ) {
      return false;
    }
    if (winQ) {
      const startText = formatEpochTime(row.epochStart).toLowerCase();
      const stopText = formatEpochTime(row.epochStop).toLowerCase();
      if (!startText.includes(winQ) && !stopText.includes(winQ)) return false;
    }
    return true;
  });
}

export function SessionsBrowser({ datasetId }: SessionsBrowserProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const { selection, set } = useWorkspaceSelection();

  // Local picker state — only the time-window text filter remains.
  // The old Subject + Probe text filters were removed (their URL
  // params collide with the workspace selection keys, and the
  // subject cascade below covers the most common case).
  const windowFilter = searchParams?.get('window') ?? '';

  // Workspace selection — the cascade source (selection.subject
  // pre-filters this table client-side) and the active row marker
  // (selection.session is the picked epoch's doc id).
  const subjectCascadeId = selection.subject;
  const selectedDocId = selection.session;

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
      p.delete('window');
    });
  };

  // Fetch the element_epoch summary table. Same hook + endpoint
  // SubjectsBrowser uses; the backend just projects a different
  // column set when class_name is 'element_epoch'.
  const summary = useSummaryTable(datasetId, 'element_epoch');

  const allRows: EpochRow[] = useMemo(
    () => (summary.data?.rows as EpochRow[]) ?? [],
    [summary.data],
  );

  // Apply the subject cascade FIRST (an exact-equality match on the
  // subjectDocumentIdentifier), then the local filter (currently
  // just the time window).
  //
  // Defensive client-side filter: the FastAPI summary-table endpoint
  // doesn't currently accept a subject filter, so we fetch the full
  // epoch set and narrow in-memory. For Bhar (~4,887 epochs) that's
  // ~150 KB and the filter is instant. If the backend grows a
  // subject-filter knob later, the cascade can move server-side
  // transparently — this component just looks at `subjectCascadeId`.
  const filteredRows = useMemo(() => {
    const base = subjectCascadeId
      ? allRows.filter(
          (r) => r.subjectDocumentIdentifier === subjectCascadeId,
        )
      : allRows;
    return filterEpochs(base, {
      subject: '',
      window: windowFilter,
      probe: '',
    });
  }, [allRows, subjectCascadeId, windowFilter]);

  const filterFields: FilterField[] = [
    {
      kind: 'text',
      key: 'window',
      label: 'Time window',
      value: windowFilter,
      placeholder: 'contains Jun-2023',
      onChange: (v) => setParam('window', v),
    },
  ];

  const columnHelper = createColumnHelper<EpochRow>();
  const columns = useMemo<ColumnDef<EpochRow, unknown>[]>(
    () =>
      [
        columnHelper.accessor(
          (r) =>
            r.epochNumber !== null && r.epochNumber !== undefined
              ? String(r.epochNumber)
              : '—',
          {
            id: 'epoch',
            header: 'Epoch',
            cell: (info) => (
              <span className="font-mono text-[12px] text-fg-primary truncate inline-block max-w-full">
                {String(info.getValue() ?? '—')}
              </span>
            ),
            size: 130,
          },
        ),
        columnHelper.accessor((r) => formatEpochTime(r.epochStart), {
          id: 'start',
          header: 'Start',
          cell: (info) => (
            <span className="font-mono text-[11.5px] text-fg-secondary tabular-nums truncate inline-block max-w-full">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 130,
        }),
        columnHelper.accessor((r) => r.approachName ?? '—', {
          id: 'approach',
          header: 'Approach',
          cell: (info) => (
            <span className="text-[12px] text-fg-secondary truncate inline-block max-w-full">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 90,
        }),
      ] as ColumnDef<EpochRow, unknown>[],
    [columnHelper],
  );

  // React Compiler skip — same rationale as SubjectsBrowser /
  // VirtualizedTable: useReactTable returns functions that can't be
  // safely memoized. TanStack Table handles its own memoization.
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
        Couldn&rsquo;t load sessions/epochs for this dataset. Refresh the
        page, or try the{' '}
        <a
          href={`/datasets/${datasetId}/tables/element_epoch`}
          className="text-ndi-teal hover:underline font-semibold"
        >
          summary epoch table
        </a>{' '}
        for the raw data.
      </div>
    );
  }

  const hasNoEpochs = allRows.length === 0;

  return (
    <div className="space-y-4">
      <WorkspaceFilterBar
        fields={filterFields}
        totalRows={subjectCascadeId ? filteredRows.length : allRows.length}
        filteredRows={filteredRows.length}
        noun="epoch"
        onClear={clearFilters}
      />

      {subjectCascadeId && (
        // Cascade indicator — explains why the table is narrowed.
        // Without this the user might wonder where all the other
        // epochs went. The bar above also reflects the count, but
        // this line names the cause.
        <p
          data-testid="sessions-cascade-hint"
          className="text-[11.5px] text-fg-secondary"
        >
          Filtered to the active subject. Clear the subject chip in
          the selection bar to see all epochs.
        </p>
      )}

      {selectedDocId && (
        // Selection-active hint — mirrors SubjectsBrowser's pattern.
        <p
          data-testid="sessions-selection-active-hint"
          className="text-[11.5px] text-fg-secondary"
        >
          Active session — analysis cards on the right will update.
        </p>
      )}

      {hasNoEpochs ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface p-8 text-center text-[13.5px] text-fg-secondary">
          This dataset doesn&rsquo;t have any element_epoch documents yet.
          The Documents picker lists every class with rows.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface p-8 text-center text-[13.5px] text-fg-secondary">
          {subjectCascadeId
            ? "No epochs for the active subject match the current filters."
            : 'No epochs match the current filters.'}{' '}
          <button
            type="button"
            onClick={clearFilters}
            className="text-ndi-teal hover:underline font-semibold"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <VirtualizedTable
          table={table}
          estimateSize={36}
          onRowClick={(row) => {
            const docId = row.epochDocumentIdentifier;
            if (typeof docId !== 'string' || docId.length === 0) return;
            // Toggle: clicking the active row again clears it.
            if (docId === selectedDocId) {
              set({ session: null });
            } else {
              set({ session: docId });
            }
          }}
          getRowClassName={(row) => {
            const docId = row.original.epochDocumentIdentifier;
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
        />
      )}
    </div>
  );
}
