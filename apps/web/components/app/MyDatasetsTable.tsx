'use client';

/**
 * MyDatasetsTable — workspace dataset list, fully virtualized.
 *
 * **Closes audit 2026-04-23 #64.** The data-browser /my page shipped
 * a plain `<table>` + `.map()` over every dataset the org owns. For
 * orgs past a few hundred datasets, that put thousands of `<tr>` nodes
 * in the DOM at first paint and tanked scroll fps. This implementation
 * runs every row through `VirtualizedTable` (Phase 3a primitive over
 * TanStack Table + TanStack Virtual) so DOM row count scales with the
 * visible window, not the total dataset count.
 *
 * Columns:
 *   - Name — clickable link to `/datasets/[id]/overview`
 *   - Status — Published / In-review / Draft pill
 *   - License — mono, fallback `—`
 *   - Documents — count, fallback `—`
 *   - Size — formatBytes, fallback `—`
 *   - Updated — `formatDate`
 *
 * Per audit #64 the row uses `React.memo` to avoid expensive re-renders
 * when surrounding state (status filter, scope toggle) changes without
 * the dataset row itself changing.
 */
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import Link from 'next/link';
import { memo, useMemo } from 'react';

import type { DatasetRecord } from '@/lib/api/datasets';
import { Badge } from '@/components/ui/Badge';
import { VirtualizedTable } from '@/components/ui/VirtualizedTable';
import { formatBytes, formatDate } from '@/lib/format';

interface MyDatasetsTableProps {
  datasets: DatasetRecord[];
  /**
   * Optional row-click handler. Default behavior is the column's
   * `<Link>` navigates to `/datasets/[id]/overview`; this hook lets
   * callers handle row activation differently (e.g. open a side panel).
   */
  onRowClick?: (dataset: DatasetRecord) => void;
}

const StatusBadge = memo(function StatusBadge({
  dataset,
}: {
  dataset: DatasetRecord;
}) {
  const isPublished = dataset.publishStatus === 'published' || dataset.isPublished;
  if (isPublished) return <Badge variant="pub">Published</Badge>;
  if (dataset.publishStatus === 'in-review')
    return <Badge variant="teal">In review</Badge>;
  return <Badge variant="secondary">Draft</Badge>;
});

const NameCell = memo(function NameCell({
  dataset,
}: {
  dataset: DatasetRecord;
}) {
  return (
    <Link
      href={`/datasets/${dataset.id}/overview`}
      className="font-medium text-fg-primary hover:text-ndi-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ndi-teal"
    >
      {dataset.name}
    </Link>
  );
});

export function MyDatasetsTable({
  datasets,
  onRowClick,
}: MyDatasetsTableProps) {
  // Stable column defs across renders so TanStack Table keeps row
  // identity and the audit #64 memo barriers actually short-circuit.
  const columns = useMemo<ColumnDef<DatasetRecord>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => <NameCell dataset={row.original} />,
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge dataset={row.original} />,
      },
      {
        id: 'license',
        header: 'License',
        cell: ({ row }) =>
          row.original.license ? (
            <span className="font-mono text-xs text-fg-secondary">
              {row.original.license}
            </span>
          ) : (
            <span className="text-fg-muted">—</span>
          ),
      },
      {
        id: 'documents',
        header: 'Docs',
        cell: ({ row }) =>
          row.original.documentCount != null ? (
            <span className="font-mono text-xs text-fg-secondary">
              {row.original.documentCount.toLocaleString()}
            </span>
          ) : (
            <span className="text-fg-muted">—</span>
          ),
      },
      {
        id: 'size',
        header: 'Size',
        cell: ({ row }) =>
          row.original.totalSize != null ? (
            <span className="font-mono text-xs text-fg-secondary">
              {formatBytes(row.original.totalSize)}
            </span>
          ) : (
            <span className="text-fg-muted">—</span>
          ),
      },
      {
        id: 'updated',
        header: 'Updated',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-fg-muted">
            {formatDate(
              row.original.updatedAt ??
                row.original.uploadedAt ??
                row.original.createdAt,
            )}
          </span>
        ),
      },
    ],
    [],
  );

  // React Compiler skips memoization for components consuming
  // `useReactTable()` — the same TanStack-API-returns-functions issue
  // we accepted at one VirtualizedTable call site (PR #6 a350474).
  // Disabling at the call site, not globally, so other consumers of
  // this lint rule still flag genuine misuse.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: datasets,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // Stable row id by dataset.id so TanStack Table's row.id is the
    // same across re-renders (the memo keys upstream depend on it).
    getRowId: (row) => row.id,
  });

  if (datasets.length === 0) {
    return (
      <div
        role="region"
        aria-label="My datasets"
        className="rounded-md border border-dashed border-border-subtle bg-bg-surface p-10 text-center"
      >
        <p className="text-sm text-fg-secondary">
          No datasets yet. New datasets uploaded to your organization
          will appear here.
        </p>
      </div>
    );
  }

  return (
    <VirtualizedTable
      table={table}
      onRowClick={onRowClick}
      data-testid="my-datasets-table"
      emptyState={
        <p className="text-sm text-fg-secondary">No matching datasets.</p>
      }
      // Custom header: drop the default `px-3 py-2` for a denser look
      // matching the data-browser.html mockup's row treatment.
      renderHeaderCell={(header) => (
        <th
          key={header.id}
          className="px-3 py-2 text-left text-[10px] font-bold tracking-[0.08em] uppercase text-fg-muted whitespace-nowrap"
        >
          {header.isPlaceholder
            ? null
            : flexRender(header.column.columnDef.header, header.getContext())}
        </th>
      )}
    />
  );
}
