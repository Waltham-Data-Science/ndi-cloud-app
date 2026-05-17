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
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  type ExpandedState,
  type GroupingState,
  type Row,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/cn';
import { useTableMultiSelect } from '@/lib/workspace/use-table-multi-select';

import {
  DataGridBulkActions,
  type BulkAction,
} from './DataGridBulkActions';
import {
  DataGridColumnFilter,
  isFilterEmpty,
  type DataGridColumnFilterValue,
} from './DataGridColumnFilter';
import {
  DataGridColumnMenu,
  type ColumnVisibility,
  type GridDensity,
} from './DataGridColumnMenu';
import {
  DataGridContextMenu,
  type ContextMenuEntry,
} from './DataGridContextMenu';
import { DataGridRowKebab } from './DataGridRowKebab';
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

  /**
   * Global free-text filter (controlled by the picker). Matched
   * case-insensitively against every visible cell's stringified
   * value. Empty string disables. Phase H6.
   */
  globalFilter?: string;

  /**
   * Columns that can serve as a group-by key. When the user picks
   * a group-by column from the column menu, rows collapse into
   * group headers showing the value + member count. Phase H2.
   */
  groupableColumnIds?: ReadonlyArray<string>;

  /**
   * Called whenever the post-filter row count changes (after
   * globalFilter + per-column richFilter). The outer browser uses
   * this to keep the "Showing X of Y" header in sync with what's
   * actually visible. Audit 2026-05-18 finding D-C: prior to this
   * callback the outer header reflected only the URL-chip filter
   * and stayed stale when the user narrowed via the in-grid column
   * filter popover.
   */
  onFilteredRowsChange?: (count: number) => void;
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
  globalFilter = '',
  groupableColumnIds = [],
  onFilteredRowsChange,
}: WorkspaceDataGridProps<TRow>) {
  const multi = useTableMultiSelect();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    {},
  );
  // Phase H4 — per-column filter values. Tracked locally (parallel
  // to TanStack's columnFilters state) because the filter primitive
  // takes a richer shape (substring + whitelist) than TanStack's
  // default scalar filter value.
  const [columnFilterMap, setColumnFilterMap] = useState<
    Record<string, DataGridColumnFilterValue>
  >({});
  // Phase H2 — group-by state. A single column id grouped at a
  // time (consistent with Notion / Hex / Sheets defaults). Phase H3
  // — multi-column sort already supported by TanStack when the user
  // Shift+clicks sort headers; no extra state needed.
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  // Phase H5 — column-size state. Default sizes come from the
  // column defs; the user can drag column edges to override.
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [density, setDensity] = useState<GridDensity>(DEFAULT_DENSITY);
  // The currently focused row index (for keyboard nav). Independent
  // of selection — focus is a CARET concept, selection is a CHECKED
  // concept.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Build TanStack's ColumnFiltersState from our richer map. We
  // store the rich value (substring + whitelist) per column under
  // the same column id and project to TanStack's `{ id, value }`
  // tuples each render. TanStack hands the value to our custom
  // `filterFn`, which evaluates the substring + whitelist match.
  const columnFilters: ColumnFiltersState = useMemo(
    () =>
      Object.entries(columnFilterMap)
        .filter(([, v]) => !isFilterEmpty(v))
        .map(([id, value]) => ({ id, value })),
    [columnFilterMap],
  );

  // Build the TanStack Table. We pass column visibility, sorting,
  // and an explicit rowId so multi-select state survives sort/filter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable<TRow>({
    data: data as TRow[],
    columns,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      globalFilter,
      grouping,
      expanded,
      columnSizing,
    },
    getRowId: (row, idx) => rowId(row) || String(idx),
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    onColumnSizingChange: setColumnSizing,
    enableMultiSort: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    // Global filter: case-insensitive substring across all visible
    // cells. Each row passes if its concatenated stringified cell
    // values contain the query.
    globalFilterFn: (row, _columnId, filterValue: string) => {
      if (!filterValue || filterValue.trim().length === 0) return true;
      const q = filterValue.trim().toLowerCase();
      const cells = row.getVisibleCells();
      for (const cell of cells) {
        const v = cell.getValue();
        if (v == null) continue;
        if (String(v).toLowerCase().includes(q)) return true;
      }
      return false;
    },
    // Per-column filter: rich shape from DataGridColumnFilter.
    // Substring + whitelist combined as documented in the
    // primitive's `isFilterEmpty` comment.
    filterFns: {
      richFilter: (
        row: Row<TRow>,
        columnId: string,
        filterValue: DataGridColumnFilterValue,
      ) => {
        if (isFilterEmpty(filterValue)) return true;
        const raw = row.getValue(columnId);
        const s = raw == null ? '' : String(raw);
        const substringOk =
          filterValue.substring.length === 0 ||
          s.toLowerCase().includes(filterValue.substring.toLowerCase());
        const whitelistOk =
          filterValue.whitelist.size === 0 ||
          filterValue.whitelist.has(s);
        return substringOk && whitelistOk;
      },
    },
    defaultColumn: {
      // Default the per-column filterFn to our rich shape so any
      // column gets per-column filtering without per-column wiring.
      filterFn: 'richFilter' as never,
      // Default sort + resize on. Picker column defs can opt out
      // by setting `enableSorting: false` / `enableResizing: false`.
      enableSorting: true,
      enableResizing: true,
      minSize: 60,
      size: 140,
      maxSize: 600,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  // Audit 2026-05-18 finding D-C: notify the outer browser when the
  // post-filter row count changes, so the page-level "Showing X of Y"
  // header in WorkspaceFilterBar can reflect the in-grid column /
  // global-search narrowing too — not just the URL chip filters.
  const filteredRowsCount = table.getFilteredRowModel().rows.length;
  useEffect(() => {
    onFilteredRowsChange?.(filteredRowsCount);
  }, [onFilteredRowsChange, filteredRowsCount]);

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

  // Phase H2 — Group-by options for the column menu. Surfaces only
  // columns the picker marked as `groupableColumnIds`. The menu
  // shows a "Group by →" submenu (or list) where the user picks
  // one column to group by (or "None" to clear).
  const groupByEntries = useMemo(
    () =>
      groupableColumnIds
        .map((id) => ({
          id,
          label: columnLabels[id] ?? id,
          active: grouping[0] === id,
        }))
        // Defensive: only surface columns that actually exist on the
        // table — a picker can pass a stale id without us crashing.
        .filter((entry) =>
          table.getAllLeafColumns().some((col) => col.id === entry.id),
        ),
    [groupableColumnIds, columnLabels, grouping, table],
  );

  // Phase H4 — distinct values per visible column, sorted desc by
  // frequency. Used to populate the column filter popover's
  // checkbox list. Computed off the UNFILTERED row set so that
  // unchecking the active filter still shows what else is available.
  const distinctValuesPerColumn: Record<
    string,
    Array<{ value: string; count: number }>
  > = useMemo(() => {
    const result: Record<string, Array<{ value: string; count: number }>> = {};
    const allRows = table.getPreFilteredRowModel().rows;
    const visibleCols = table.getVisibleLeafColumns();
    for (const col of visibleCols) {
      if (col.id === '__select__') continue;
      const counts = new Map<string, number>();
      for (const row of allRows) {
        const v = row.getValue(col.id);
        if (v == null) continue;
        const s = String(v);
        if (s.length === 0) continue;
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      const entries = Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);
      result[col.id] = entries;
    }
    return result;
  }, [table, data, columnVisibility]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetGridState = useCallback(() => {
    setColumnVisibility({});
    setDensity(DEFAULT_DENSITY);
    setSorting([]);
    setColumnFilterMap({});
    setGrouping([]);
    setExpanded({});
    setColumnSizing({});
  }, []);

  // Set / clear the current group-by column. Passing null clears.
  const setGroupBy = useCallback((columnId: string | null) => {
    setGrouping(columnId ? [columnId] : []);
    setExpanded({}); // collapse all on group-by change
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
            style={{ width: table.getTotalSize() + 32 + 36 }}
          >
            <colgroup>
              <col style={{ width: 32 }} />
              {table.getVisibleLeafColumns().map((col) => (
                <col
                  key={col.id}
                  style={{ width: col.getSize() }}
                />
              ))}
              {/* Kebab cell column (Phase H1) — fixed-width slot at
                  end of every row for the visible row actions menu. */}
              <col style={{ width: 36 }} />
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
                    const col = header.column;
                    const sort = col.getIsSorted();
                    const onCycle = col.getCanSort()
                      ? (event?: ReactMouseEvent) => {
                          // Phase H3 — Shift+click stacks sorts.
                          // TanStack's `toggleSorting(undefined, true)`
                          // means "additive cycle" — preserves the
                          // existing sort on other columns. Without
                          // shift, replace the sort entirely.
                          const additive = !!event?.shiftKey;
                          col.toggleSorting(undefined, additive);
                        }
                      : null;
                    const sortIndex = col.getSortIndex();
                    const headerContent = flexRender(
                      col.columnDef.header,
                      header.getContext(),
                    );
                    const filterValue: DataGridColumnFilterValue =
                      columnFilterMap[col.id] ?? {
                        substring: '',
                        whitelist: new Set<string>(),
                      };
                    const canFilter = col.getCanFilter();
                    const distinct = distinctValuesPerColumn[col.id] ?? [];
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={cn(
                          'group/datagrid-th relative',
                          'px-2 py-1.5 text-left align-middle',
                        )}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="min-w-0 flex-1">
                            {typeof headerContent === 'string' ? (
                              <DataGridSortHeader
                                label={headerContent}
                                sort={sort}
                                onCycle={
                                  onCycle
                                    ? (e) => onCycle(e as unknown as ReactMouseEvent)
                                    : null
                                }
                              />
                            ) : (
                              headerContent
                            )}
                          </span>
                          {sortIndex >= 0 && sort !== false && (
                            <span
                              className="text-[9px] font-mono font-bold text-brand-blue tabular-nums shrink-0"
                              title={`Sort priority ${sortIndex + 1}`}
                              aria-label={`Sort priority ${sortIndex + 1}`}
                            >
                              {sortIndex + 1}
                            </span>
                          )}
                          {canFilter && distinct.length > 0 && (
                            <DataGridColumnFilter
                              label={
                                columnLabels[col.id] ??
                                (typeof headerContent === 'string'
                                  ? headerContent
                                  : col.id)
                              }
                              value={filterValue}
                              onChange={(next) => {
                                setColumnFilterMap((prev) => ({
                                  ...prev,
                                  [col.id]: next,
                                }));
                              }}
                              distinctValues={distinct}
                              totalRows={data.length}
                              filteredRows={
                                table.getFilteredRowModel().rows.length
                              }
                            />
                          )}
                        </div>
                        {/* Phase H5 — column resize handle. Renders
                            at the right edge of every column.
                            Translucent unless hovered / dragging. */}
                        {col.getCanResize() && (
                          <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={`Resize ${columnLabels[col.id] ?? col.id} column`}
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              'absolute right-0 top-0 h-full w-1 cursor-col-resize select-none',
                              'bg-border-subtle/0 hover:bg-brand-blue/50',
                              col.getIsResizing() && 'bg-brand-blue',
                              'transition-colors duration-(--duration-base) ease-(--ease-out)',
                            )}
                          />
                        )}
                      </th>
                    );
                  }),
                )}
                {/* Kebab header cell — empty header, just keeps the
                    column layout consistent. */}
                <th
                  scope="col"
                  className="px-1 py-1.5 align-middle"
                  aria-label="Row actions"
                />
              </tr>
            </thead>
          </table>
          <div className="flex items-center px-1 border-l border-border-subtle shrink-0">
            <DataGridColumnMenu
              columns={columnVisibilityEntries}
              density={density}
              onDensityChange={setDensity}
              groupBy={groupByEntries}
              onGroupByChange={setGroupBy}
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
              const visibleCols = table.getVisibleLeafColumns();

              // Phase H2 — group rows render with a chevron + label
              // + member count. Different shape than data rows. No
              // checkbox / kebab / primary-selection — group rows
              // are summary aggregations, not individually
              // actionable. Click expands/collapses.
              if (row.getIsGrouped()) {
                const groupedColumnId = row.groupingColumnId;
                const groupValue = groupedColumnId
                  ? row.getValue(groupedColumnId)
                  : null;
                const groupLabel =
                  groupValue == null || String(groupValue).length === 0
                    ? '(empty)'
                    : String(groupValue);
                const memberCount = row.subRows.length;
                return (
                  <div
                    key={virtualRow.key}
                    role="row"
                    aria-rowindex={virtualRow.index + 1}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${rowHeight}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => row.toggleExpanded()}
                    className={cn(
                      'flex items-center gap-2',
                      'px-2 border-b border-border-subtle/70',
                      'bg-bg-canvas/60 cursor-pointer select-none',
                      'transition-colors duration-(--duration-base) ease-(--ease-out)',
                      'hover:bg-bg-canvas',
                    )}
                  >
                    {row.getIsExpanded() ? (
                      <ChevronDown
                        className="h-3.5 w-3.5 text-fg-muted shrink-0"
                        aria-hidden
                      />
                    ) : (
                      <ChevronRight
                        className="h-3.5 w-3.5 text-fg-muted shrink-0"
                        aria-hidden
                      />
                    )}
                    <span className="text-[10.5px] font-bold tracking-eyebrow uppercase text-fg-muted shrink-0">
                      {columnLabels[groupedColumnId ?? ''] ?? groupedColumnId}
                    </span>
                    <span className="text-[12.5px] font-medium text-fg-primary truncate">
                      {groupLabel}
                    </span>
                    <span className="text-[11px] text-fg-muted tabular-nums ml-auto shrink-0">
                      {memberCount.toLocaleString()}{' '}
                      {memberCount === 1 ? noun : `${noun}s`}
                    </span>
                  </div>
                );
              }

              // Data row — full chrome.
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
                      // Indent member rows when grouped — visual
                      // affordance for "child of group above"
                      grouping.length > 0 && 'pl-3',
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
                    <table
                      className="flex-1 table-fixed"
                      style={{ width: table.getTotalSize() }}
                    >
                      <colgroup>
                        {visibleCols.map((col) => (
                          <col
                            key={col.id}
                            style={{ width: col.getSize() }}
                          />
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
                    {/* Phase H1 — visible row actions kebab. Same
                        action list as the right-click context menu,
                        exposed visibly for discoverability. */}
                    <div className="w-9 shrink-0 flex items-center justify-center">
                      <DataGridRowKebab
                        actions={contextMenuActions(row.original)}
                        rowLabel={noun}
                      />
                    </div>
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
