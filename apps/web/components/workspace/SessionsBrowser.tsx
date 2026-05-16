'use client';

/**
 * SessionsBrowser — session/epoch browser for the Sessions tab.
 *
 * Phase C of the workspace redesign. The session-grain counterpart
 * to SubjectsBrowser — same filter-and-drill flow, different
 * underlying class (`element_epoch` instead of `subject`) and
 * different filters that match the tutorial's epoch workflow:
 *
 *   - **Subject ID** — filter epochs to one subject (tutorial:
 *     drill to subject 360, then look at that subject's 6 epochs).
 *   - **Time window** — substring match against epochStart's
 *     globalTime / devTime (tutorial: `global_t0 contains Jun-2023`
 *     → 99 epochs).
 *   - **Probe ID** — filter to epochs from one probe/element.
 *
 * Selection key: `epochDocumentIdentifier`. View actions: Signal
 * trace, PSTH, Electrode position, View document. All route to
 * /analyses with `?epoch=<id>` so the panels can pre-fill (Phase D
 * follow-up wires the panel reads).
 *
 * Same data plumbing as Subjects: client-side filter + virtualised
 * table on top of the existing `useSummaryTable` hook. Reuses the
 * same primitives (WorkspaceFilterBar, ViewActionsRail) for visual
 * consistency.
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
import { Activity, BarChart3, FlaskConical, MapPin } from 'lucide-react';

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
 * Pure filter algorithm — exported for unit testing.
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

  const subjectFilter = searchParams?.get('subject') ?? '';
  const windowFilter = searchParams?.get('window') ?? '';
  const probeFilter = searchParams?.get('probe') ?? '';
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
      p.delete('subject');
      p.delete('window');
      p.delete('probe');
    });
  };

  const clearSelection = (): void => {
    setParam('select', '');
  };

  // Fetch the element_epoch summary table. Same hook + endpoint
  // SubjectsBrowser uses; the backend just projects a different
  // column set when class_name is 'element_epoch'.
  const summary = useSummaryTable(datasetId, 'element_epoch');

  const allRows: EpochRow[] = useMemo(
    () => (summary.data?.rows as EpochRow[]) ?? [],
    [summary.data],
  );

  const filteredRows = useMemo(
    () =>
      filterEpochs(allRows, {
        subject: subjectFilter,
        window: windowFilter,
        probe: probeFilter,
      }),
    [allRows, subjectFilter, windowFilter, probeFilter],
  );

  const selectedRow = useMemo(
    () =>
      selectedDocId
        ? filteredRows.find(
            (r) => r.epochDocumentIdentifier === selectedDocId,
          ) ?? null
        : null,
    [filteredRows, selectedDocId],
  );

  const filterFields: FilterField[] = [
    {
      kind: 'text',
      key: 'subject',
      label: 'Subject',
      value: subjectFilter,
      placeholder: 'contains subject id',
      onChange: (v) => setParam('subject', v),
    },
    {
      kind: 'text',
      key: 'window',
      label: 'Time window',
      value: windowFilter,
      placeholder: 'contains Jun-2023',
      onChange: (v) => setParam('window', v),
    },
    {
      kind: 'text',
      key: 'probe',
      label: 'Probe / element',
      value: probeFilter,
      placeholder: 'contains probe id',
      onChange: (v) => setParam('probe', v),
    },
  ];

  const buildActions = (docId: string): ViewAction[] => {
    const base = `/my/workspace/${datasetId}/analyses?epoch=${encodeURIComponent(docId)}`;
    return [
      {
        label: 'Signal trace',
        href: `${base}#signal-viewer`,
        icon: Activity,
        hint: 'signal',
      },
      {
        label: 'PSTH',
        href: `${base}#psth`,
        icon: BarChart3,
        hint: 'psth',
      },
      {
        label: 'Electrode position',
        href: `${base}#electrode-position`,
        icon: MapPin,
        hint: 'scatter',
      },
      {
        label: 'View document',
        href: `/datasets/${datasetId}/documents/${encodeURIComponent(docId)}`,
        icon: FlaskConical,
      },
    ];
  };

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
              <span className="font-mono text-[12.5px] text-fg-primary">
                {String(info.getValue() ?? '—')}
              </span>
            ),
            size: 200,
          },
        ),
        columnHelper.accessor(
          (r) =>
            (r.subjectDocumentIdentifier ?? '—').toString().slice(0, 16),
          {
            id: 'subject',
            header: 'Subject',
            cell: (info) => (
              <span
                className="font-mono text-[12px] text-fg-secondary"
                title={
                  typeof info.row.original.subjectDocumentIdentifier ===
                  'string'
                    ? info.row.original.subjectDocumentIdentifier
                    : undefined
                }
              >
                {String(info.getValue() ?? '—')}
              </span>
            ),
            size: 180,
          },
        ),
        columnHelper.accessor((r) => formatEpochTime(r.epochStart), {
          id: 'start',
          header: 'Start',
          cell: (info) => (
            <span className="font-mono text-[12px] text-fg-secondary tabular-nums">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 180,
        }),
        columnHelper.accessor((r) => formatEpochTime(r.epochStop), {
          id: 'stop',
          header: 'Stop',
          cell: (info) => (
            <span className="font-mono text-[12px] text-fg-secondary tabular-nums">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 180,
        }),
        columnHelper.accessor((r) => r.approachName ?? '—', {
          id: 'approach',
          header: 'Approach',
          cell: (info) => (
            <span className="text-[12.5px] text-fg-secondary">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 160,
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
    <div className="space-y-5">
      <WorkspaceFilterBar
        fields={filterFields}
        totalRows={allRows.length}
        filteredRows={filteredRows.length}
        noun="epoch"
        onClear={clearFilters}
      />

      {hasNoEpochs ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface p-8 text-center text-[13.5px] text-fg-secondary">
          This dataset doesn&rsquo;t have any element_epoch documents yet.
          The Structure tab lists every class with rows.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface p-8 text-center text-[13.5px] text-fg-secondary">
          No epochs match the current filters.{' '}
          <button
            type="button"
            onClick={clearFilters}
            className="text-ndi-teal hover:underline font-semibold"
          >
            Clear filters
          </button>{' '}
          to see all {allRows.length.toLocaleString()} epochs.
        </div>
      ) : (
        <VirtualizedTable
          table={table}
          estimateSize={36}
          onRowClick={(row) => {
            const docId = row.epochDocumentIdentifier;
            if (typeof docId === 'string' && docId.length > 0) {
              setParam('select', docId);
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

      {selectedRow && (
        <ViewActionsRail
          selection={{
            label:
              selectedRow.epochNumber !== null &&
              selectedRow.epochNumber !== undefined
                ? `Epoch ${String(selectedRow.epochNumber)}`
                : selectedDocId,
            sublabel: [
              selectedRow.subjectDocumentIdentifier &&
                `subject ${String(selectedRow.subjectDocumentIdentifier).slice(0, 12)}…`,
              selectedRow.approachName,
            ]
              .filter(Boolean)
              .join(' · ') || undefined,
          }}
          actions={buildActions(selectedDocId)}
          onClear={clearSelection}
        />
      )}
    </div>
  );
}
