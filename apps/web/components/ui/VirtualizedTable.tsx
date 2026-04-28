'use client';

/**
 * Virtualized table primitive over TanStack Table + TanStack Virtual.
 *
 * Ported from `ndi-data-browser-v2/frontend/src/components/tables/VirtualizedTable.tsx`
 * (audit 2026-04-23 #63: factored out of `SummaryTableView.tsx` so other
 * consumers can virtualize without duplicating the scroll-container +
 * padded-tr pattern). Phase 3c uses this to close audit #64 (MyDatasets
 * full virtualization).
 *
 * Usage:
 *
 *     const table = useReactTable({
 *       data,
 *       columns,
 *       getCoreRowModel: getCoreRowModel(),
 *     });
 *     <VirtualizedTable table={table} />
 *
 * Optional:
 *   - `onRowClick`: wire a row-click handler. The row gets
 *     `cursor-pointer` + `hover:bg-bg-muted` automatically.
 *   - `estimateSize`: override row height in px (default 32 — matches
 *     SummaryTableView's density).
 *   - `overscan`: how many rows to render outside the visible area
 *     (default 20).
 *   - `className`: override the scroll container classes.
 *   - `getRowClassName`: per-row class augmentation.
 *   - `renderHeaderCell` / `renderCell`: override header/cell wrapper
 *     markup (e.g. denser `px-2 py-1` variants).
 */
import { useRef, type ReactNode } from 'react';
import {
  flexRender,
  type Cell,
  type Header,
  type Row,
  type Table,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

import { cn } from '@/lib/cn';

const DEFAULT_ROW_HEIGHT = 32;
const DEFAULT_OVERSCAN = 20;

export interface VirtualizedTableProps<T> {
  table: Table<T>;
  onRowClick?: (row: T) => void;
  estimateSize?: number;
  overscan?: number;
  /**
   * Scroll-container class override. Default caps height to viewport
   * minus ~220px (hero + filter bar).
   */
  className?: string;
  /** Per-row class augmentation. */
  getRowClassName?: (row: Row<T>) => string | undefined;
  /** Test id passed through to the root scrollable div. */
  'data-testid'?: string;
  /** Optional header-cell renderer; default uses `px-3 py-2`. */
  renderHeaderCell?: (header: Header<T, unknown>) => ReactNode;
  /** Optional body-cell renderer; default uses `px-3 py-1.5 align-top`. */
  renderCell?: (cell: Cell<T, unknown>) => ReactNode;
  /** Optional empty-state text (default: "No data"). */
  emptyState?: ReactNode;
}

const DEFAULT_SCROLL_CLS =
  'rounded-md border border-border-subtle overflow-auto max-h-[calc(100vh-220px)] min-h-[320px]';

export function VirtualizedTable<T>({
  table,
  onRowClick,
  estimateSize = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  className,
  getRowClassName,
  renderHeaderCell,
  renderCell,
  emptyState,
  ...rest
}: VirtualizedTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { rows } = table.getRowModel();
  // React Compiler skips memoization for components that consume
  // `useVirtualizer()` — its API returns functions (not values) that
  // can't be safely memoized. The compiler's reduced optimization on
  // this component is acceptable here: TanStack Virtual already
  // memoizes its own internal state and the compiler's broad skip
  // doesn't cause stale UI in practice (verified via the data-browser
  // production build for 12+ months). Disabling the warning at the
  // call site, not globally, so other consumers of this lint rule
  // continue to flag genuine misuse.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0]!.start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - (virtualItems[virtualItems.length - 1]!.end ?? 0)
      : 0;
  const columnCount = table.getVisibleLeafColumns().length;

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className={className ?? DEFAULT_SCROLL_CLS}
        data-testid={rest['data-testid']}
      >
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-bg-muted z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b border-border-subtle"
              >
                {headerGroup.headers.map((header) =>
                  renderHeaderCell ? (
                    <th
                      key={header.id}
                      className="text-left font-medium text-fg-muted whitespace-nowrap"
                    >
                      {renderHeaderCell(header)}
                    </th>
                  ) : (
                    <th
                      key={header.id}
                      className="px-3 py-2 text-left font-medium text-fg-muted whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ),
                )}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-3 py-8 text-center text-fg-muted"
                >
                  {emptyState ?? 'No data'}
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr>
                    <td
                      colSpan={columnCount}
                      style={{
                        height: paddingTop,
                        padding: 0,
                        border: 'none',
                      }}
                    />
                  </tr>
                )}
                {virtualItems.map((vr) => {
                  const row = rows[vr.index]!;
                  return (
                    <tr
                      key={row.id}
                      data-index={vr.index}
                      className={cn(
                        'border-b border-border-subtle/60',
                        onRowClick && 'cursor-pointer hover:bg-bg-muted',
                        getRowClassName?.(row),
                      )}
                      style={{ height: estimateSize }}
                      onClick={() => onRowClick?.(row.original)}
                    >
                      {row.getVisibleCells().map((cell) =>
                        renderCell ? (
                          renderCell(cell)
                        ) : (
                          <td
                            key={cell.id}
                            className="px-3 py-1.5 whitespace-nowrap align-top"
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </td>
                        ),
                      )}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr>
                    <td
                      colSpan={columnCount}
                      style={{
                        height: paddingBottom,
                        padding: 0,
                        border: 'none',
                      }}
                    />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
