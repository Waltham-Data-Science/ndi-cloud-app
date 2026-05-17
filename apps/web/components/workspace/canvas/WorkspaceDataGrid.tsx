'use client';

/**
 * WorkspaceDataGrid — the rich data-grid primitive used by every
 * picker rail body (Subjects, Sessions, Probes, Stimuli, Documents).
 *
 * Phase G7 of the data-grid redesign (2026-05-16). Replaces the
 * raw `VirtualizedTable` + ad-hoc onRowClick wiring each picker used
 * to spell out. Now every picker gets:
 *
 *   - Virtualization (TanStack Virtual)
 *   - Sortable column headers (`DataGridSortHeader`)
 *   - Multi-row selection with checkboxes (`useTableMultiSelect`)
 *   - Right-click context menu (`DataGridContextMenu`)
 *   - Bulk actions bar that surfaces on selection
 *     (`DataGridBulkActions`)
 *   - Column visibility + density toggle
 *     (`DataGridColumnMenu`)
 *   - Sticky header that survives scroll
 *   - Selected-row visual treatment (brand-blue tint + left border)
 *   - Primary-row visual treatment (subtle accent — "this is the
 *     row currently driving the analysis panels")
 *   - Keyboard navigation: ↑/↓ to move focus, Space to multi-toggle,
 *     Enter to set primary, Esc to clear multi-select, Shift+Click
 *     range select, Cmd/Ctrl+A to select all visible
 *
 * ## Design notes
 *
 * The grid takes a `rowId` getter rather than relying on
 * TanStack Table's row.id (which is just the row index). Picker
 * tables in NDI are keyed by document id, not position — the user
 * expects multi-select to survive a re-sort.
 *
 * `primaryId` is a separate concept from multi-select: it tracks
 * the single row that drives the workspace's selection bar (the
 * one analyses run against). Clicking the row body sets it;
 * clicking the checkbox toggles multi-select. Different gestures
 * for different concepts.
 *
 * The bulk actions bar mounts INSIDE the grid container (above the
 * table), not at the page level — it's scoped to "actions on the
 * grid's selection," and rendering it inside keeps state + UI
 * co-located.
 */
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { LucideIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/cn';
import { useTableMultiSelect } from '@/lib/workspace/use-table-multi-select';

import {
  DataGridBulkActions,
  type BulkAction,
} from './DataGridBulkActions';
import {
  DataGridColumnMenu,
  type ColumnVisibility,
  type GridDensity,
} from './DataGridColumnMenu';
import {
  DataGridContextMenu,
  type ContextMenuEntry,
} from './DataGridContextMenu';
import { DataGridSortHeader } from './DataGridSortHeader';

export interface WorkspaceDataGridProps<TRow> {
  /** Rows to render. */
  data: ReadonlyArray<TRow>;
  /** Column definitions (TanStack Table format). */
  columns: ColumnDef<TRow, unknown>[];
  /** Stable row identifier — used for selection state + virtualization keys. */
  rowId: (row: TRow) => string;
  /** Human label for the row noun ("subject" / "session") — used in bulk-actions copy. */
  noun: string;

  /** Currently-active primary row id (the chip-bar selection). null if none. */
  primaryId: string | null;
  /** Called when the user clicks a row body to set it as primary. */
  onPrimaryChange: (id: string | null) => void;

  /** Right-click action factory — receives the right-clicked row. */
  contextMenuActions: (row: TRow) => ReadonlyArray<ContextMenuEntry>;
  /** Bulk action factory — receives the selected ids. */
  bulkActions: (
    selectedIds: ReadonlyArray<string>,
  ) => ReadonlyArray<BulkAction>;

  /** Optional empty state — shown when data.length === 0. */
  emptyState?: ReactNode;
  /** Optional loading state — shown when isLoading is true. */
  isLoading?: boolean;
  loadingState?: ReactNode;

  /** Optional table-wide label for a11y. */
  label?: string;

  /** Column labels for the column-visibility menu. Keyed by column id. */
  columnLabels?: Readonly<Record<string, string>>;
  /** Locked columns (cannot be hidden) — typically the identifier column. */
  lockedColumnIds?: ReadonlyArray<string>;

  /**
   * Per-row icon shown to the left of the primary indicator. Used
   * sparingly — kept optional so simple tables stay simple.
   */
  rowIcon?: (row: TRow) => LucideIcon | null;
}

const DEFAULT_ROW_HEIGHTS: Readonly<Record<GridDensity, number>> = {
  compact: 32,
  comfortable: 40,
};

const DEFAULT_DENSITY: GridDensity = 'compact';

export function WorkspaceDataGrid<TRow>({
  data,
  columns,
  rowId,
  noun,
  primaryId,
  onPrimaryChange,
  contextMenuActions,
  bulkActions,
  emptyState,
  isLoading = false,
  loadingState,
  label,
  columnLabels = {},
  lockedColumnIds = [],
  rowIcon,
}: WorkspaceDataGridProps<TRow>) {
  const multi = useTableMultiSelect();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    {},
  );
  const [density, setDensity] = useState<GridDensity>(DEFAULT_DENSITY);
  // The currently focused row index (for keyboard nav). Independent
  // of selection — focus is a CARET concept, selection is a CHECKED
  // concept.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Build the TanStack Table. We pass column visibility, sorting,
  // and an explicit rowId so multi-select state survives sort/filter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable<TRow>({
    data: data as TRow[],
    columns,
    state: { sorting, columnVisibility },
    getRowId: (row, idx) => rowId(row) || String(idx),
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const orderedIds = useMemo(() => rows.map((r) => r.id), [rows]);

  // Virtualization — sticky header + scrollable body.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowHeight = DEFAULT_ROW_HEIGHTS[density];
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  // Re-measure on density change so the virtualizer picks up the
  // new row height immediately.
  useEffect(() => {
    virtualizer.measure();
  }, [density, virtualizer]);

  // Keyboard nav on the container — capture focus + arrow keys.
  // Scoped to when the container has focus or when a child has focus.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (rows.length === 0) return;
      const focusedRow =
        focusedIndex !== null ? rows[focusedIndex] : null;
      const focusedRowId = focusedRow ? focusedRow.id : null;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = Math.min(
            (focusedIndex ?? -1) + 1,
            rows.length - 1,
          );
          setFocusedIndex(next);
          virtualizer.scrollToIndex(next, { align: 'auto' });
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const next = Math.max((focusedIndex ?? rows.length) - 1, 0);
          setFocusedIndex(next);
          virtualizer.scrollToIndex(next, { align: 'auto' });
          break;
        }
        case 'Home': {
          e.preventDefault();
          setFocusedIndex(0);
          virtualizer.scrollToIndex(0, { align: 'start' });
          break;
        }
        case 'End': {
          e.preventDefault();
          setFocusedIndex(rows.length - 1);
          virtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
          break;
        }
        case ' ': {
          // Space — toggle multi-select on focused row.
          if (focusedRowId !== null) {
            e.preventDefault();
            if (e.shiftKey) {
              multi.toggleRange(focusedRowId, orderedIds);
            } else {
              multi.toggle(focusedRowId);
            }
          }
          break;
        }
        case 'Enter': {
          // Enter — set focused row as primary selection.
          if (focusedRowId !== null) {
            e.preventDefault();
            // Toggle off if already primary.
            onPrimaryChange(focusedRowId === primaryId ? null : focusedRowId);
          }
          break;
        }
        case 'Escape': {
          if (multi.count > 0) {
            e.preventDefault();
            multi.clear();
          }
          break;
        }
        case 'a':
        case 'A': {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            multi.selectAll(orderedIds);
          }
          break;
        }
      }
    },
    [
      rows,
      focusedIndex,
      orderedIds,
      multi,
      onPrimaryChange,
      primaryId,
      virtualizer,
    ],
  );

  // Column visibility menu data — derive from the table's columns
  // + the provided label map.
  const columnVisibilityEntries: ColumnVisibility[] = useMemo(
    () =>
      table
        .getAllLeafColumns()
        .filter((col) => col.id !== '__select__')
        .map((col) => ({
          id: col.id,
          label: columnLabels[col.id] ?? col.id,
          visible: col.getIsVisible(),
          onToggle: (next) => col.toggleVisibility(next),
          locked: lockedColumnIds.includes(col.id),
        })),
    [table, columnLabels, lockedColumnIds],
  );

  const resetGridState = useCallback(() => {
    setColumnVisibility({});
    setDensity(DEFAULT_DENSITY);
    setSorting([]);
  }, []);

  // Bulk actions — recomputed when selection changes.
  const selectedIds = useMemo(
    () => Array.from(multi.selected),
    [multi.selected],
  );
  const bulkActionList = useMemo(
    () => bulkActions(selectedIds),
    [bulkActions, selectedIds],
  );

  // Empty / loading states — render early so we don't waste a tree.
  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {loadingState ?? <DefaultLoadingState />}
      </div>
    );
  }
  if (data.length === 0) {
    return <>{emptyState ?? <DefaultEmptyState noun={noun} />}</>;
  }

  return (
    <div className="space-y-2">
      <DataGridBulkActions
        selectedIds={selectedIds}
        noun={noun}
        actions={bulkActionList}
        onClear={multi.clear}
      />

      <div
        className={cn(
          'rounded-md border border-border-subtle bg-bg-surface',
          'overflow-hidden',
        )}
      >
        {/* Header: column titles + column-menu trigger */}
        <div className="flex items-stretch border-b border-border-subtle bg-bg-canvas/50 sticky top-0 z-10">
          <table
            className="flex-1 table-fixed"
            role="table"
            aria-label={label ?? `${noun}s`}
          >
            <colgroup>
              <col style={{ width: 32 }} />
              {table.getVisibleLeafColumns().map((col) => (
                <col key={col.id} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="px-2 py-1.5 text-left align-middle"
                  aria-label="Select all"
                >
                  <HeaderCheckbox
                    allSelected={
                      orderedIds.length > 0 &&
                      orderedIds.every((id) => multi.isSelected(id))
                    }
                    someSelected={multi.count > 0}
                    onToggle={() => {
                      const allOn = orderedIds.every((id) =>
                        multi.isSelected(id),
                      );
                      if (allOn) multi.clear();
                      else multi.selectAll(orderedIds);
                    }}
                  />
                </th>
                {table.getHeaderGroups().map((hg) =>
                  hg.headers.map((header) => {
                    const sort = header.column.getIsSorted();
                    const onCycle = header.column.getCanSort()
                      ? () => header.column.toggleSorting()
                      : null;
                    const headerContent = flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    );
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className="px-2 py-1.5 text-left align-middle"
                      >
                        {typeof headerContent === 'string' ? (
                          <DataGridSortHeader
                            label={headerContent}
                            sort={sort}
                            onCycle={onCycle}
                          />
                        ) : (
                          headerContent
                        )}
                      </th>
                    );
                  }),
                )}
              </tr>
            </thead>
          </table>
          <div className="flex items-center px-1 border-l border-border-subtle shrink-0">
            <DataGridColumnMenu
              columns={columnVisibilityEntries}
              density={density}
              onDensityChange={setDensity}
              onReset={resetGridState}
            />
          </div>
        </div>

        {/* Body: virtualised, scrollable */}
        <div
          ref={containerRef}
          tabIndex={0}
          role="grid"
          aria-label={label ?? `${noun}s grid`}
          aria-rowcount={rows.length}
          aria-multiselectable="true"
          onKeyDown={handleKeyDown}
          className={cn(
            'relative overflow-auto max-h-[60vh]',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ndi-teal/30',
          )}
          style={{ minHeight: 200 }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              const id = row.id;
              const isPrimary = id === primaryId;
              const isMultiSelected = multi.isSelected(id);
              const isFocused = focusedIndex === virtualRow.index;
              const Icon = rowIcon ? rowIcon(row.original) : null;

              return (
                <DataGridContextMenu
                  key={virtualRow.key}
                  actions={contextMenuActions(row.original)}
                >
                  <div
                    role="row"
                    aria-selected={isMultiSelected}
                    aria-rowindex={virtualRow.index + 1}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${rowHeight}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onMouseEnter={() => setFocusedIndex(virtualRow.index)}
                    onClick={(e) => {
                      // Click on row body — set as primary. Click on
                      // checkbox (stopPropagation in HeaderCheckbox /
                      // RowCheckbox) handles multi-select directly.
                      if (e.shiftKey) {
                        multi.toggleRange(id, orderedIds);
                        return;
                      }
                      if (e.metaKey || e.ctrlKey) {
                        multi.toggle(id);
                        return;
                      }
                      onPrimaryChange(id === primaryId ? null : id);
                    }}
                    className={cn(
                      'flex items-stretch border-b border-border-subtle/70',
                      'transition-colors duration-(--duration-base) ease-(--ease-out)',
                      'cursor-pointer select-none',
                      isPrimary
                        ? 'bg-brand-blue/5 border-l-2 border-l-brand-blue'
                        : isMultiSelected
                          ? 'bg-ndi-teal/5 border-l-2 border-l-ndi-teal'
                          : 'border-l-2 border-l-transparent hover:bg-bg-muted/40',
                      isFocused &&
                        !isPrimary &&
                        !isMultiSelected &&
                        'bg-bg-muted/60',
                    )}
                  >
                    <div className="w-8 shrink-0 flex items-center justify-center">
                      <RowCheckbox
                        checked={isMultiSelected}
                        onToggle={(shift) => {
                          if (shift) multi.toggleRange(id, orderedIds);
                          else multi.toggle(id);
                        }}
                        ariaLabel={`Select row`}
                      />
                    </div>
                    <table className="flex-1 table-fixed">
                      <colgroup>
                        {table.getVisibleLeafColumns().map((col) => (
                          <col key={col.id} />
                        ))}
                      </colgroup>
                      <tbody>
                        <tr>
                          {row.getVisibleCells().map((cell, cellIdx) => (
                            <td
                              key={cell.id}
                              className={cn(
                                'px-2 align-middle truncate',
                                density === 'compact'
                                  ? 'py-1.5 text-[12.5px]'
                                  : 'py-2 text-[13px]',
                              )}
                            >
                              {cellIdx === 0 && Icon ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Icon
                                    className="h-3 w-3 shrink-0 text-fg-muted"
                                    aria-hidden
                                  />
                                  {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                  )}
                                </span>
                              ) : (
                                flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </DataGridContextMenu>
              );
            })}
          </div>
        </div>

        {/* Footer: row count + selection hint */}
        <div
          className={cn(
            'flex items-center justify-between gap-2',
            'px-2.5 py-1.5 text-[11px] text-fg-muted',
            'border-t border-border-subtle bg-bg-canvas/30',
          )}
        >
          <span>
            {rows.length.toLocaleString()} {rows.length === 1 ? noun : `${noun}s`}
            {primaryId && (
              <span className="ml-2 text-brand-blue">
                · 1 primary
              </span>
            )}
            {multi.count > 0 && (
              <span className="ml-2 text-ndi-teal">
                · {multi.count} selected
              </span>
            )}
          </span>
          <span className="font-mono opacity-60">
            ↑↓ nav · Space toggle · Enter primary · ⌘A all · Esc clear
          </span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Checkboxes                                                                  */
/* -------------------------------------------------------------------------- */

interface HeaderCheckboxProps {
  allSelected: boolean;
  someSelected: boolean;
  onToggle: () => void;
}

function HeaderCheckbox({
  allSelected,
  someSelected,
  onToggle,
}: HeaderCheckboxProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={
        allSelected ? 'Clear all selections' : 'Select all visible rows'
      }
      aria-checked={allSelected ? 'true' : someSelected ? 'mixed' : 'false'}
      role="checkbox"
      className={cn(
        'inline-flex items-center justify-center',
        'h-3.5 w-3.5 rounded border shrink-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40',
        'transition-colors duration-(--duration-base) ease-(--ease-out)',
        allSelected
          ? 'bg-brand-blue border-brand-blue'
          : someSelected
            ? 'bg-brand-blue/40 border-brand-blue'
            : 'bg-transparent border-border-strong hover:border-brand-blue',
      )}
    >
      {allSelected ? (
        <svg
          viewBox="0 0 12 12"
          className="h-2 w-2 text-white"
          aria-hidden
        >
          <path
            d="M2.5 6.5L4.5 8.5L9.5 3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : someSelected ? (
        <span
          className="block h-[1.5px] w-1.5 bg-white rounded-sm"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

interface RowCheckboxProps {
  checked: boolean;
  onToggle: (shift: boolean) => void;
  ariaLabel: string;
}

function RowCheckbox({ checked, onToggle, ariaLabel }: RowCheckboxProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e.shiftKey);
      }}
      aria-label={ariaLabel}
      aria-checked={checked}
      role="checkbox"
      className={cn(
        'inline-flex items-center justify-center',
        'h-3.5 w-3.5 rounded border shrink-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40',
        'transition-colors duration-(--duration-base) ease-(--ease-out)',
        checked
          ? 'bg-brand-blue border-brand-blue'
          : 'bg-transparent border-border-strong hover:border-brand-blue',
      )}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="h-2 w-2 text-white" aria-hidden>
          <path
            d="M2.5 6.5L4.5 8.5L9.5 3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Defaults for loading / empty                                                */
/* -------------------------------------------------------------------------- */

// Deterministic widths for the skeleton placeholders so render is
// pure (no Math.random) and the same rows always render at the same
// width — easier on the eye than a re-randomized blink on hover.
const SKELETON_WIDTHS = ['88%', '74%', '92%', '70%', '83%', '78%'];

function DefaultLoadingState() {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface p-3 space-y-2">
      {SKELETON_WIDTHS.map((width, i) => (
        <div
          key={i}
          className="h-6 rounded bg-bg-muted/60 animate-pulse"
          style={{ width }}
        />
      ))}
    </div>
  );
}

function DefaultEmptyState({ noun }: { noun: string }) {
  return (
    <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface p-4 text-center text-[13px] text-fg-secondary">
      No {noun}s match.
    </div>
  );
}
