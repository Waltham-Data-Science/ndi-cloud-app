'use client';

/**
 * build-picker-columns — fully dynamic column construction from the
 * backend's `useSummaryTable` response envelope.
 *
 * # Principle (audit 2026-05-18, second pass)
 *
 * **NO column hardcoding in the workspace pickers.** Scientific
 * datasets express their own schema — Bhar subjects carry 28
 * columns, Haley a different set, Francesconi a third, Sophie's
 * dataset its own. Hardcoding a fixed subset means the workspace
 * silently drops data the public `/datasets/[id]/tables/<class>`
 * view exposes from the SAME backend response. That's a parity bug
 * dressed as a curated default.
 *
 * The first version of this helper had a `curated` parameter that
 * still hardcoded 5 columns visible-by-default. Audit feedback:
 * "we can't have any hardcoding at all — these datasets need to
 * express everything and that only happens if those are all
 * constructed dynamically." So this rewrite removes the curated
 * argument entirely. Columns + their labels + their order come
 * straight from `data.columns`. Cell rendering is purely
 * value-type-aware. The workspace's selection / row-id semantics
 * live elsewhere (rowId accessor passed to WorkspaceDataGrid),
 * which is workspace metadata about how a row participates in the
 * canvas — not column data.
 *
 * # Cell rendering
 *
 * The default cell auto-detects the value's shape and renders
 * appropriately:
 *
 * - `null` / `undefined` / `''` → em-dash with disabled styling
 * - ontology CURIE (`PREFIX:0000123`) → mono + popover-ready;
 *   the surrounding `useBatchOntologyLookup` populates the cache
 * - 24-char hex (Mongo ObjectId) or 32-char compound → mono
 * - URL → linkified (opens in new tab)
 * - number → right-aligned tabular-nums with locale formatting
 * - boolean → "yes" / "no"
 * - date-string ISO 8601 → readable local format
 * - array / object → JSON-stringified with truncation + title tooltip
 * - string → plain text with truncation at the cell width
 *
 * This list is intentionally generic — no class-specific paths. If a
 * particular value type needs richer rendering (e.g. an `imageStack`
 * cell wants a preview thumbnail), that's a separate component, not
 * a per-class override here.
 *
 * # Auto-hide empty columns
 *
 * Any column where every visible row's value is null/undefined/''
 * starts hidden. The user can still toggle it visible via the
 * column-menu — auto-hide is a "out of sight" affordance, not a
 * permanent filter. Mirrors SummaryTableView's logic on the public
 * side so a column the public view shows isn't surprising to find
 * via the workspace's toggle menu.
 */
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import type { ReactNode } from 'react';

import type { TableColumn } from '@/lib/api/tables';

interface BuildOptions {
  /**
   * Server-emitted column metadata. The order here drives the
   * column order in the grid. Backend `summary_table_service.py`
   * already canonicalizes the order (identifier-like columns first,
   * then attributes, then enrichments).
   *
   * When `undefined` (e.g. a picker reading from `useDocuments`
   * which doesn't carry a `data.columns` envelope), columns are
   * discovered by scanning every key present on any row. Order is
   * "first-seen across rows" — stable across re-renders.
   */
  serverColumns: ReadonlyArray<TableColumn> | undefined;
  /** Row data — used for column discovery + auto-hide-empty. */
  rows: ReadonlyArray<Record<string, unknown>>;
  /**
   * Optional: which column id is the "primary" identifier — gets
   * locked from hide, rendered with mono + primary color. When
   * omitted, the FIRST column in `serverColumns` (or first scanned
   * row key) is treated as primary. Pass explicitly when the
   * caller knows better; otherwise dynamic.
   */
  primaryColumnId?: string;
  /**
   * Override auto-hide-empty. Default true — hides columns whose
   * every value is null/undefined/''. Set false when the picker
   * wants the user to see what's missing.
   */
  autoHideEmpty?: boolean;
}

/**
 * Discover column metadata by scanning row keys. Used when no
 * server-emitted `data.columns` is available (e.g. pickers reading
 * from `useDocuments`). Labels are derived from the key by
 * converting camelCase / snake_case to "Title Case" so the column
 * header is readable. Order is the order keys are first seen.
 */
function discoverColumnsFromRows(
  rows: ReadonlyArray<Record<string, unknown>>,
): TableColumn[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      const label = key
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(.)/, (c) => c.toUpperCase());
      seen.set(key, label);
    }
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}

interface BuildResult<TRow> {
  columns: ColumnDef<TRow, unknown>[];
  initialVisibility: VisibilityState;
  /** ids of columns that should be locked from the column-toggle UI. */
  lockedColumnIds: ReadonlyArray<string>;
  /** Map of column id → human label (the backend's label string). */
  columnLabels: Readonly<Record<string, string>>;
}

const DEFAULT_COLUMN_SIZE = 160;
const PRIMARY_COLUMN_SIZE = 200;

// ── value-type detection ────────────────────────────────────────────

const ONTOLOGY_CURIE_RE = /^[A-Z][A-Z0-9_]+:\d{4,}$/;
const HEX_24_RE = /^[a-f0-9]{24}$/i;
const COMPOUND_ID_RE = /^[a-f0-9]{16}_[a-f0-9]{16}$/i;
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const URL_RE = /^https?:\/\/\S+$/i;

function isOntologyCurie(s: string): boolean {
  return ONTOLOGY_CURIE_RE.test(s);
}
function isMongoOrCompoundId(s: string): boolean {
  return HEX_24_RE.test(s) || COMPOUND_ID_RE.test(s);
}
function isIsoDate(s: string): boolean {
  return ISO_DATE_RE.test(s);
}
function isUrl(s: string): boolean {
  return URL_RE.test(s);
}

function formatIsoDate(s: string): string {
  // ISO 8601 → readable. Trim sub-second precision for readability.
  // Fall back to the raw string if Date parsing fails.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  // Only show time if the string includes a T or :
  const hasTime = s.includes('T') || s.includes(':');
  return hasTime
    ? d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
}

// ── default cell renderers ──────────────────────────────────────────

/**
 * Smart cell for non-primary columns. Inspects the value type and
 * renders accordingly. NEVER changes its rendered shape based on
 * the column id — type-driven only.
 */
function defaultCell(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-fg-disabled">—</span>;
  }
  if (typeof value === 'number') {
    return (
      <span className="text-[12px] text-fg-secondary tabular-nums">
        {Number.isFinite(value) ? value.toLocaleString() : String(value)}
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
  if (typeof value === 'string') {
    if (isOntologyCurie(value)) {
      // Mono + slightly heavier weight signals "this is a CURIE you
      // can look up." The popover wiring lives in the existing
      // OntologyTermPopover; we mark the span so it can attach by
      // selector if the picker mounts one (out of scope here — just
      // make the visual cue clear).
      return (
        <span
          className="font-mono text-[11.5px] text-brand-blue-2"
          title={`Ontology term: ${value}`}
          data-ontology-term={value}
        >
          {value}
        </span>
      );
    }
    if (isMongoOrCompoundId(value)) {
      return (
        <span
          className="font-mono text-[11.5px] text-fg-secondary truncate inline-block max-w-full"
          title={value}
        >
          {value.length > 24
            ? `${value.slice(0, 8)}…${value.slice(-8)}`
            : value}
        </span>
      );
    }
    if (isUrl(value)) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-ndi-teal hover:underline truncate inline-block max-w-full"
          title={value}
        >
          {value}
        </a>
      );
    }
    if (isIsoDate(value)) {
      return (
        <span
          className="font-mono text-[11.5px] text-fg-secondary tabular-nums"
          title={value}
        >
          {formatIsoDate(value)}
        </span>
      );
    }
    return (
      <span
        className="text-[12px] text-fg-secondary truncate inline-block max-w-full"
        title={value.length > 60 ? value : undefined}
      >
        {value}
      </span>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-fg-disabled">—</span>;
    // Arrays of primitives → comma list; arrays of objects → count + tooltip.
    const allPrim = value.every(
      (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v),
    );
    if (allPrim) {
      const joined = value.map((v) => String(v ?? '—')).join(', ');
      return (
        <span
          className="text-[12px] text-fg-secondary truncate inline-block max-w-full"
          title={joined.length > 60 ? joined : undefined}
        >
          {joined}
        </span>
      );
    }
    return (
      <span
        className="text-[12px] text-fg-secondary"
        title={(() => {
          try {
            return JSON.stringify(value);
          } catch {
            return '[…]';
          }
        })()}
      >
        [{value.length} items]
      </span>
    );
  }
  // Object — likely a nested doc; truncate JSON.
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
 * Primary-column cell — same type inference but renders identifiers
 * with the workspace's `font-mono text-fg-primary` styling so the
 * "row identity" reads at a glance. Falls back to the regular
 * defaultCell for non-string values.
 */
function primaryCell(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-fg-disabled">—</span>;
  }
  if (typeof value === 'string') {
    return (
      <span
        className="font-mono text-[12px] text-fg-primary truncate inline-block max-w-full"
        title={value.length > 40 ? value : undefined}
      >
        {value}
      </span>
    );
  }
  return defaultCell(value);
}

// ── builder ──────────────────────────────────────────────────────────

/**
 * Build TanStack column defs from the backend's server-emitted
 * column list. NO curated list, NO column omissions — every column
 * the backend returned becomes a column the workspace renders.
 */
export function buildPickerColumns<TRow extends Record<string, unknown>>({
  serverColumns,
  rows,
  primaryColumnId,
  autoHideEmpty = true,
}: BuildOptions): BuildResult<TRow> {
  // If the backend didn't ship a `data.columns` envelope (e.g.
  // pickers reading from `useDocuments`), discover the column set
  // by scanning row keys. Order is the first-seen-row-key order.
  const cols =
    serverColumns && serverColumns.length > 0
      ? serverColumns
      : discoverColumnsFromRows(rows);
  const labels: Record<string, string> = {};
  const initialVisibility: VisibilityState = {};
  const locked: string[] = [];

  // If no explicit primary, the first server column is primary.
  // Backend ordering puts identifier-bearing columns first per the
  // summary_table_service projection — so this lines up with what
  // the public table view shows as the leading column.
  const resolvedPrimaryId = primaryColumnId ?? cols[0]?.key ?? '';

  const columnDefs: ColumnDef<TRow, unknown>[] = cols.map((sc) => {
    labels[sc.key] = sc.label || sc.key;
    const isPrimary = sc.key === resolvedPrimaryId;
    if (isPrimary) locked.push(sc.key);

    return {
      id: sc.key,
      accessorFn: (row) => (row as Record<string, unknown>)[sc.key],
      header: sc.label || sc.key,
      cell: (info) =>
        isPrimary ? primaryCell(info.getValue()) : defaultCell(info.getValue()),
      size: isPrimary ? PRIMARY_COLUMN_SIZE : DEFAULT_COLUMN_SIZE,
    } as ColumnDef<TRow, unknown>;
  });

  // Auto-hide-empty: any column whose every visible row's value is
  // null/undefined/'' starts hidden. The user can still toggle it
  // visible via the column-menu — auto-hide is a soft default, not
  // a permanent filter. Skips the primary column (never hide the
  // row identifier even if it's empty — that's an upstream data
  // issue and the user needs to see it).
  if (autoHideEmpty && rows.length > 0) {
    for (const sc of cols) {
      if (sc.key === resolvedPrimaryId) continue;
      const isEmpty = rows.every((row) => {
        const v = row[sc.key];
        return v === null || v === undefined || v === '';
      });
      if (isEmpty) initialVisibility[sc.key] = false;
    }
  }

  return {
    columns: columnDefs,
    initialVisibility,
    lockedColumnIds: locked,
    columnLabels: labels,
  };
}

/**
 * Generic row-id resolver — picks the doc id out of any
 * summary-table row by trying the canonical NDI bulk-fetch field
 * names in preference order, then any key ending in `Identifier`,
 * then `id` / `ndiId`.
 *
 * Not column-display logic — purely about which scalar value the
 * workspace selection treats as the row's stable identity. Stays
 * generic across subject / element / probe / element_epoch /
 * stimulus / treatment / etc. without per-class branching.
 */
export function pickRowDocId(row: Record<string, unknown>): string {
  // 1) Try canonical NDI document-identifier shape: `<class>DocumentIdentifier`.
  for (const key of Object.keys(row)) {
    if (key.endsWith('DocumentIdentifier')) {
      const v = row[key];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  // 2) Try the generic `documentIdentifier` field.
  const docId = row['documentIdentifier'];
  if (typeof docId === 'string' && docId.length > 0) return docId;
  // 3) Try the bulk-fetch shape's `id` / `ndiId`.
  const id = row['id'];
  if (typeof id === 'string' && id.length > 0) return id;
  const ndi = row['ndiId'];
  if (typeof ndi === 'string' && ndi.length > 0) return ndi;
  // 4) Last resort: any other `*Identifier` field.
  for (const key of Object.keys(row)) {
    if (key.endsWith('Identifier')) {
      const v = row[key];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  return '';
}
