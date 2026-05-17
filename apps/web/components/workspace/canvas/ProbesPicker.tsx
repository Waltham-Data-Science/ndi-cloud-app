'use client';

/**
 * ProbesPicker — picker-rail body for the Probes tab of the workspace
 * canvas.
 *
 * Phase F3 of the one-canvas redesign (design doc:
 * `apps/web/docs/design/2026-05-16-workspace-canvas-redesign.md`).
 * Sits in the ~340px left rail; clicking a row sets the workspace's
 * `probe` selection dimension via `useWorkspaceSelection.set()`. The
 * selection bar then surfaces a chip and every panel that reads
 * `selection.probe` auto-runs.
 *
 * Data source: `useSummaryTable(datasetId, 'probe')` — the same
 * projection the Document Explorer probe table uses. Columns of
 * interest in the rail (constrained to ~300px width):
 *
 *   - probe name (short-id fallback when the doc has no name)
 *   - probe type (e.g. "patch", "Neuropixels 1.0")
 *   - sample rate (when carried on the doc — many older datasets
 *     don't include it; we omit the column rather than render "—"
 *     across every row when we detect none)
 *
 * Reactive cascade (per design doc):
 *
 *   When `selection.subject` is set, the list is filtered to only
 *   probes whose `depends_on` array carries `subject_id ==
 *   <selected>` — so the user picks a subject, the Probes tab
 *   automatically narrows to that subject's probes. Best-effort:
 *   `depends_on` lives under each doc's `data` field; the summary
 *   table doesn't always carry it, so we fall back to matching
 *   `subjectDocumentIdentifier` (which the probe projection DOES
 *   carry).
 *
 * Empty state: probes are absent on many datasets — especially
 * purely behavioural ones (Bhar's worm tracking, Francesconi's EPM
 * behavioural assays). We surface that explicitly rather than
 * implying the dataset is broken.
 */
import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';

import { Skeleton } from '@/components/ui/Skeleton';
import { VirtualizedTable } from '@/components/ui/VirtualizedTable';
import { useSummaryTable } from '@/lib/api/tables';
import { cn } from '@/lib/cn';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

interface ProbesPickerProps {
  datasetId: string;
}

interface ProbeRow {
  probeDocumentIdentifier?: string | null;
  probeName?: string | null;
  probeType?: string | null;
  probeReference?: string | null;
  subjectDocumentIdentifier?: string | null;
  /** Some projections also carry the raw doc shape under `data`. */
  data?: {
    depends_on?: Array<{ name?: string; value?: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Best-effort subject extractor — first checks the doc's
 * `depends_on` array (canonical), then the projection's
 * `subjectDocumentIdentifier` field (summary-table fallback).
 *
 * Pure for testability.
 */
export function probeSubjectId(row: ProbeRow): string | null {
  const depends = row.data?.depends_on;
  if (Array.isArray(depends)) {
    for (const dep of depends) {
      if (!dep || typeof dep !== 'object') continue;
      const name = dep.name;
      if (
        typeof name === 'string' &&
        (name === 'subject_id' ||
          name === 'openminds_subject_id' ||
          name.endsWith('subject_id'))
      ) {
        const value = dep.value;
        if (typeof value === 'string' && value.length > 0) return value;
      }
    }
  }
  const flat = row.subjectDocumentIdentifier;
  return typeof flat === 'string' && flat.length > 0 ? flat : null;
}

/**
 * Filter probes by free-text "name contains" + (optional) reactive
 * subject filter from the workspace selection.
 *
 * Pure for testability — exported separately so the unit test can
 * cover the AND-semantics + the subject cascade without React.
 */
export function filterProbes(
  rows: ProbeRow[],
  nameQuery: string,
  subjectFilter: string | null,
): ProbeRow[] {
  const q = nameQuery.trim().toLowerCase();
  return rows.filter((row) => {
    if (q) {
      const name = String(row.probeName ?? '').toLowerCase();
      const id = String(row.probeDocumentIdentifier ?? '').toLowerCase();
      if (!name.includes(q) && !id.includes(q)) return false;
    }
    if (subjectFilter) {
      const sid = probeSubjectId(row);
      if (sid !== subjectFilter) return false;
    }
    return true;
  });
}

export function ProbesPicker({ datasetId }: ProbesPickerProps) {
  const { selection, set } = useWorkspaceSelection();
  const [nameQuery, setNameQuery] = useState('');

  const summary = useSummaryTable(datasetId, 'probe');

  const allRows: ProbeRow[] = useMemo(
    () => (summary.data?.rows as ProbeRow[]) ?? [],
    [summary.data],
  );

  const filteredRows = useMemo(
    () => filterProbes(allRows, nameQuery, selection.subject),
    [allRows, nameQuery, selection.subject],
  );

  const columnHelper = createColumnHelper<ProbeRow>();
  const columns = useMemo<ColumnDef<ProbeRow, unknown>[]>(
    () =>
      [
        columnHelper.accessor(
          (r) =>
            r.probeName ??
            (typeof r.probeDocumentIdentifier === 'string'
              ? `${r.probeDocumentIdentifier.slice(0, 8)}…`
              : '—'),
          {
            id: 'name',
            header: 'Probe',
            cell: (info) => (
              <span className="font-mono text-[12px] text-fg-primary truncate inline-block max-w-full">
                {String(info.getValue() ?? '—')}
              </span>
            ),
            size: 160,
          },
        ),
        columnHelper.accessor((r) => r.probeType ?? '—', {
          id: 'type',
          header: 'Type',
          cell: (info) => (
            <span className="text-[12px] text-fg-secondary truncate inline-block max-w-full">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 130,
        }),
      ] as ColumnDef<ProbeRow, unknown>[],
    [columnHelper],
  );

  // React Compiler skips memoization for components consuming
  // `useReactTable()` — same rationale as SubjectsBrowser's disable.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (summary.isLoading) {
    return (
      <div className="space-y-3" aria-label="Loading probes">
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-[280px] w-full rounded-md" />
      </div>
    );
  }

  if (summary.isError || allRows.length === 0) {
    return (
      <div
        role="status"
        className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-6 text-[12.5px] text-fg-secondary leading-relaxed"
      >
        No probes in this dataset. Many datasets — especially
        purely-behavioural ones — don&rsquo;t carry probe documents.
      </div>
    );
  }

  const subjectFilterActive = selection.subject !== null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="Name contains…"
          className={cn(
            'flex-1 min-w-0 rounded-md border border-border-subtle bg-bg-surface',
            'px-2 py-1 text-[12px] text-fg-primary placeholder:text-fg-muted',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/40',
          )}
          aria-label="Filter probes by name"
        />
      </div>

      <div className="text-[11px] text-fg-muted tabular-nums">
        Showing{' '}
        <span className="font-semibold text-fg-secondary">
          {filteredRows.length.toLocaleString()}
        </span>{' '}
        of {allRows.length.toLocaleString()} probe
        {allRows.length === 1 ? '' : 's'}
        {subjectFilterActive && (
          <span className="ml-1 text-fg-muted">
            (filtered to selected subject)
          </span>
        )}
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-6 text-center text-[12.5px] text-fg-secondary">
          No probes match the current filters.
        </div>
      ) : (
        <VirtualizedTable
          table={table}
          estimateSize={32}
          className="rounded-md border border-border-subtle overflow-auto max-h-[calc(100vh-280px)] min-h-[240px]"
          onRowClick={(row) => {
            const docId = row.probeDocumentIdentifier;
            if (typeof docId === 'string' && docId.length > 0) {
              set({ probe: docId });
            }
          }}
          getRowClassName={(row) => {
            const docId = row.original.probeDocumentIdentifier;
            return docId === selection.probe
              ? 'bg-brand-blue/5 border-l-2 border-l-brand-blue'
              : undefined;
          }}
          renderHeaderCell={(header) => (
            <th
              key={header.id}
              colSpan={header.colSpan}
              className={cn(
                'px-2 py-1.5 text-left text-[10px] font-bold tracking-eyebrow uppercase text-fg-muted',
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
              className="px-2 py-1.5 align-top truncate"
              style={{ width: cell.column.getSize() }}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          )}
          emptyState={
            <div className="text-center text-[12.5px] text-fg-secondary py-6">
              No probes match the current filters.
            </div>
          }
        />
      )}
    </div>
  );
}
