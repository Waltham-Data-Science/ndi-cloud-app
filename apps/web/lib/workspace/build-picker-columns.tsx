'use client';

/**
 * build-picker-columns — bridge between the backend's `useSummaryTable`
 * envelope and TanStack Table column defs for the workspace canvas
 * pickers (Subjects / Sessions / Probes / etc.).
 *
 * # Why
 *
 * Phase F-G left the pickers with HARDCODED column subsets (5 cols on
 * Subjects, 3 on Sessions, 2 on Probes, 3 on Stimuli) even though the
 * backend's `summary_table_service.py` returns the full enriched set
 * (28+ cols for Bhar subjects, 51 for the Francesconi EPM table,
 * etc.). Audit 2026-05-18 flagged that the same dataset on the public
 * `/datasets/[id]/tables/subject` view shows every column the backend
 * returns, while `/my/workspace/[id]` drops everything beyond the
 * curated 5 silently. Same data source — different rendered surface
 * area — confusing for scientists trying to find a column they know
 * exists.
 *
 * # What
 *
 * Given:
 *   - a list of CURATED column defs (the priority columns we always
 *     want visible by default — e.g. {identifier, species, strain,
 *     sex, age} for subjects)
 *   - the SERVER column metadata from `useSummaryTable.data.columns`
 *     (the full backend column list, with backend labels)
 *   - the row data
 *
 * Returns:
 *   - a single TanStack `ColumnDef<TRow>[]` that places the curated
 *     columns FIRST in their authored order, then every server
 *     column the curated list doesn't already cover
 *   - an `initialColumnVisibility` map that hides the server-only
 *     "extra" columns by default — they're reachable through the
 *     column-toggle menu, but the rail isn't cluttered out of the gate
 *
 * # Design choices
 *
 * - **Curated cols win on overlap.** If the curated list defines an
 *   `id: 'strain'` accessor with custom rendering, we use it — even
 *   if the server also emits a `strain` column. The cell renderer the
 *   workspace authored almost always beats a generic stringify.
 *
 * - **Server cols inherit a permissive renderer** that handles
 *   strings, numbers, null, undefined, simple objects (JSON.stringify
 *   when an object snuck through), and arrays. Anything that doesn't
 *   fit gets the dash `'—'` fallback.
 *
 * - **Backend labels are honored.** The server already emits
 *   "Subject Doc ID", "Strain Name", "DOI" etc. We respect that
 *   string verbatim for the column header rather than reformat.
 *
 * - **Auto-hide empty cols** mirrors `SummaryTableView`'s
 *   `autoHiddenColumns` logic: any server column where every row's
 *   value is null/undefined/'' starts hidden. Otherwise a workspace
 *   that ports the full 28-col Bhar subject table would show 23
 *   columns of `'—'` — useless rail clutter.
 */
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import type { ReactNode } from 'react';

import type { TableColumn } from '@/lib/api/tables';

export interface CuratedPickerColumn<TRow extends Record<string, unknown>> {
  /** Column id. Should match the server column key when the curated
   *  renderer is replacing a server-discoverable column. */
  id: string;
  /** Header text. */
  header: string;
  /** Row accessor. Defaults to `row[id]` when omitted. */
  accessor?: (row: TRow) => unknown;
  /** Cell renderer. Defaults to a permissive text cell. */
  cell?: (value: unknown, row: TRow) => ReactNode;
  /** Default column width (pixels). */
  size?: number;
  /** If false, the column starts hidden but is reachable via the
   *  column-toggle menu. Defaults to true. */
  visible?: boolean;
  /** Optional: mark as locked (can't be hidden via the menu). */
  locked?: boolean;
}

interface BuildOptions<TRow extends Record<string, unknown>> {
  curated: ReadonlyArray<CuratedPickerColumn<TRow>>;
  serverColumns: ReadonlyArray<TableColumn> | undefined;
  rows: ReadonlyArray<TRow>;
  /** Override the auto-hide-empty fallback. Set `false` to keep empty
   *  columns visible (rare — useful when the table is intentionally
   *  sparse and the user needs to see what's missing). */
  autoHideEmpty?: boolean;
}

interface BuildResult<TRow> {
  columns: ColumnDef<TRow, unknown>[];
  initialVisibility: VisibilityState;
  /** ids of columns that should be locked from the column-toggle UI. */
  lockedColumnIds: ReadonlyArray<string>;
  /** Map of column id → human label, suitable for the column-menu UI. */
  columnLabels: Readonly<Record<string, string>>;
}

const PICKER_DEFAULT_SIZE = 140;

/**
 * Default text cell for server-discovered columns. Permissive about
 * the input shape — server data has been through both the Cloud API
 * and the Railway summary_table_service projection, so values can be
 * strings, numbers, dates-as-strings, nulls, or small objects that
 * snuck through (e.g. a depends_on entry that wasn't flattened).
 */
function defaultServerCell(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-fg-disabled">—</span>;
  }
  if (typeof value === 'number') {
    return (
      <span className="text-[12px] text-fg-secondary tabular-nums">
        {value.toLocaleString()}
      </span>
    );
  }
  if (typeof value === 'string') {
    return (
      <span className="text-[12px] text-fg-secondary truncate inline-block max-w-full">
        {value}
      </span>
    );
  }
  if (typeof value === 'boolean') {
    return (
      <span className="text-[12px] text-fg-secondary">
        {value ? 'yes' : 'no'}
      </span>
    );
  }
  // Arrays / objects — stringify but keep it short. The full value is
  // still reachable via the row-detail flyout when that lands.
  let str: string;
  try {
    str = JSON.stringify(value);
  } catch {
    str = String(value);
  }
  return (
    <span
      className="text-[12px] text-fg-secondary truncate inline-block max-w-full"
      title={str}
    >
      {str.length > 50 ? `${str.slice(0, 47)}…` : str}
    </span>
  );
}

/**
 * Build the column defs + initial visibility for a workspace picker.
 *
 * The curated columns come first in their authored order. Then every
 * server column the curated set didn't claim, appended in the order
 * the backend emitted (which is canonical-then-discovered per the
 * summary_table_service projection rules).
 */
export function buildPickerColumns<TRow extends Record<string, unknown>>({
  curated,
  serverColumns,
  rows,
  autoHideEmpty = true,
}: BuildOptions<TRow>): BuildResult<TRow> {
  const curatedIds = new Set(curated.map((c) => c.id));
  const labels: Record<string, string> = {};
  const locked: string[] = [];
  const initialVisibility: VisibilityState = {};

  // 1) Curated columns first — full custom renderer, preferred widths.
  const curatedDefs: ColumnDef<TRow, unknown>[] = curated.map((c) => {
    labels[c.id] = c.header;
    if (c.locked) locked.push(c.id);
    if (c.visible === false) initialVisibility[c.id] = false;
    const accessor = c.accessor ?? ((row: TRow) => row[c.id] as unknown);
    return {
      id: c.id,
      accessorFn: accessor,
      header: c.header,
      cell: (info) => {
        const v = info.getValue();
        if (c.cell) return c.cell(v, info.row.original);
        return defaultServerCell(v);
      },
      size: c.size ?? PICKER_DEFAULT_SIZE,
    } as ColumnDef<TRow, unknown>;
  });

  // 2) Server columns the curated set didn't claim. Default text cell,
  //    backend label, hidden-by-default for rail compactness.
  const serverDefs: ColumnDef<TRow, unknown>[] = [];
  for (const sc of serverColumns ?? []) {
    if (curatedIds.has(sc.key)) continue;
    labels[sc.key] = sc.label || sc.key;
    initialVisibility[sc.key] = false; // hidden-by-default
    serverDefs.push({
      id: sc.key,
      accessorFn: (row) => (row as Record<string, unknown>)[sc.key],
      header: sc.label || sc.key,
      cell: (info) => defaultServerCell(info.getValue()),
      size: PICKER_DEFAULT_SIZE,
    } as ColumnDef<TRow, unknown>);
  }

  // 3) Auto-hide empty columns (any column where every visible row's
  //    value is null/undefined/''). Mirrors SummaryTableView's logic.
  if (autoHideEmpty && rows.length > 0) {
    const allDefs = [...curatedDefs, ...serverDefs];
    for (const def of allDefs) {
      const id = def.id;
      if (!id) continue;
      // Skip curated columns the author marked locked — they're
      // probably the row identifier; never auto-hide an identifier.
      if (locked.includes(id)) continue;
      const isEmpty = rows.every((row) => {
        const v = (row as Record<string, unknown>)[id];
        return v === null || v === undefined || v === '';
      });
      if (isEmpty) initialVisibility[id] = false;
    }
  }

  return {
    columns: [...curatedDefs, ...serverDefs],
    initialVisibility,
    lockedColumnIds: locked,
    columnLabels: labels,
  };
}
