'use client';

/**
 * useTableMultiSelect — ephemeral multi-row selection state for the
 * workspace data grid.
 *
 * Phase G2 of the data-grid redesign (2026-05-16). Multi-select is
 * the SECOND selection concept the workspace tracks; see
 * `useWorkspaceSelection` for the FIRST.
 *
 * ## Why two concepts
 *
 *   - **Primary selection** (chip bar, URL-state, one per dimension)
 *     drives the analysis panels. Picking a subject sets
 *     `selection.subject` and the Signal Viewer / PSTH / ... cards
 *     react automatically.
 *
 *   - **Multi-select** (checkboxes in the table, in-memory, N per
 *     table) drives bulk operations. Pick 3 subjects → the bulk
 *     actions bar offers "Ask Claude about these 3", "Copy all IDs",
 *     "Compare in BehavioralCompare" (when panels accept arrays).
 *
 * Multi-select is intentionally NOT in the URL. Refresh / share
 * preserving N row ids would inflate URLs (a 24-char hex × N could
 * push past common share-link length limits) and the ergonomic
 * expectation is "multi-select is a transient editing mode" — the
 * same model Notion / Linear / Hex use.
 *
 * ## API
 *
 * The hook returns an immutable state object + methods. Pass the
 * returned `toggle` / `toggleRange` / `selectAll` to the data grid;
 * pass the `selected` set to the bulk actions bar. Both consumers
 * stay in sync because they share the same hook call inside the
 * grid's component tree.
 *
 * The state lives in `useState`, scoped to the component that calls
 * the hook. To share state across siblings, lift the hook to a
 * parent — there is no module-level / global store. This is
 * deliberate: each workspace data grid carries its own multi-select
 * scope; switching picker tabs cleanly resets.
 */
import { useCallback, useMemo, useRef, useState } from 'react';

export interface TableMultiSelectState {
  /** Ids that are currently selected. */
  selected: ReadonlySet<string>;
  /** Number of selected ids (shortcut to selected.size). */
  count: number;
  /** True iff `id` is in the selection. */
  isSelected: (id: string) => boolean;
  /** Add or remove `id` from selection. */
  toggle: (id: string) => void;
  /**
   * Range-toggle from the last-toggled id to `id`. Mimics
   * Shift+click behavior — every row between (inclusive) is
   * forced ON. Caller passes the full ordered list of visible ids
   * so the range can be computed. No-op if there is no last anchor.
   */
  toggleRange: (id: string, orderedIds: ReadonlyArray<string>) => void;
  /** Replace selection with the given ids (Cmd+A). */
  selectAll: (ids: ReadonlyArray<string>) => void;
  /** Empty the selection. */
  clear: () => void;
}

export function useTableMultiSelect(): TableMultiSelectState {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  // Anchor for range-select: the last id the user single-toggled.
  // Set on every individual toggle (Cmd+click / space / single tap).
  // Range-toggle uses [anchor → currentId] as its inclusive range.
  const anchorRef = useRef<string | null>(null);

  const isSelected = useCallback(
    (id: string) => selected.has(id),
    [selected],
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchorRef.current = id;
  }, []);

  const toggleRange = useCallback(
    (id: string, orderedIds: ReadonlyArray<string>) => {
      const anchor = anchorRef.current;
      if (anchor === null) {
        // No anchor yet — fall back to a single toggle so Shift+click
        // on the first interaction still does something useful.
        toggle(id);
        return;
      }
      const fromIdx = orderedIds.indexOf(anchor);
      const toIdx = orderedIds.indexOf(id);
      if (fromIdx === -1 || toIdx === -1) {
        // Anchor or target isn't visible — fall back to single toggle.
        toggle(id);
        return;
      }
      const [lo, hi] =
        fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      const rangeIds = orderedIds.slice(lo, hi + 1);
      setSelected((prev) => {
        const next = new Set(prev);
        // Force ON for every id in the inclusive range. Shift+click
        // is an additive gesture in every data grid (Excel, Sheets,
        // Notion, Linear); we don't toggle off any pre-selected ids.
        for (const rid of rangeIds) next.add(rid);
        return next;
      });
      // Anchor moves to the last range endpoint — matches Sheets.
      anchorRef.current = id;
    },
    [toggle],
  );

  const selectAll = useCallback((ids: ReadonlyArray<string>) => {
    setSelected(new Set(ids));
    anchorRef.current = ids.length > 0 ? ids[ids.length - 1]! : null;
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set<string>());
    anchorRef.current = null;
  }, []);

  return useMemo<TableMultiSelectState>(
    () => ({
      selected,
      count: selected.size,
      isSelected,
      toggle,
      toggleRange,
      selectAll,
      clear,
    }),
    [selected, isSelected, toggle, toggleRange, selectAll, clear],
  );
}
