'use client';

/**
 * OntologyTablesView — Phase 6.6 REBUILD-7.
 *
 * The ontology table endpoint
 * (`GET /api/datasets/:id/tables/ontology`) returns
 * `{groups: OntologyTableGroup[]}`, not the standard `{columns, rows}`
 * shape. Each group gathers `ontologyTableRow` documents that share a
 * `variableNames` CSV, exposing per-group `variableNames`, `names`,
 * `ontologyNodes` (1:1 with variableNames), `docIds`, and a
 * `TableResponse` keyed to that group's row schema.
 *
 * Ported from `ndi-data-browser-v2/frontend/src/pages/TableTab.tsx:142-213`
 * (the inline `OntologyTablesView` + `OntologyGroupPicker` closures).
 * Lifted into its own module so the table-shell can dispatch on
 * `activeClass === 'ontology'` without ballooning.
 *
 * Single-group datasets render the table directly (no picker — matches
 * source's `if (groups.length <= 1) return null`). Multi-group datasets
 * get a top-strip sub-tab picker with `role="tab"` semantics inside a
 * `role="tablist"` so screen readers and keyboard users can move
 * between groups via standard tab semantics.
 *
 * The active group's table is rendered with `tableType="ontology"` +
 * `columnOntologyPrefixes` populated from the group's
 * `variableNames` ↔ `ontologyNodes` 1:1 mapping. SummaryTableView's
 * existing ontology-popover machinery picks that up and wires resolver
 * URLs onto the column headers.
 */
import { useState } from 'react';

import { ErrorState } from '@/components/errors/ErrorState';
import { SummaryTableView } from '@/components/app/SummaryTableView';
import { useOntologyTables } from '@/lib/api/tables';
import type { OntologyTableGroup } from '@/lib/api/tables';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

interface OntologyTablesViewProps {
  datasetId: string | undefined;
}

export function OntologyTablesView({ datasetId }: OntologyTablesViewProps) {
  const { data, isLoading, isError, error, refetch } =
    useOntologyTables(datasetId);
  const [groupIdx, setGroupIdx] = useState(0);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }
  if (isError) {
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }
  if (!data || data.groups.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        This dataset has no ontology table rows.
      </p>
    );
  }

  // `groupIdx` may have been left stale from a previous dataset that had
  // more groups; clamp to the current group count.
  const safeIdx = Math.min(groupIdx, data.groups.length - 1);
  const active = data.groups[safeIdx]!; // safeIdx ∈ [0, len-1] when len ≥ 1

  return (
    <div className="space-y-3">
      <OntologyGroupPicker
        groups={data.groups}
        active={safeIdx}
        onChange={setGroupIdx}
      />
      <SummaryTableView
        data={active.table}
        title={`ontology-${safeIdx}`}
        tableType="ontology"
        columnOntologyPrefixes={buildColumnOntology(active)}
        datasetId={datasetId}
      />
    </div>
  );
}

interface OntologyGroupPickerProps {
  groups: OntologyTableGroup[];
  active: number;
  onChange: (n: number) => void;
}

function OntologyGroupPicker({
  groups,
  active,
  onChange,
}: OntologyGroupPickerProps) {
  // Single-group datasets don't need a picker — matches source.
  if (groups.length <= 1) return null;
  return (
    <div
      role="tablist"
      aria-label="Ontology groups"
      className="flex flex-wrap gap-1 border-b border-border-subtle pb-px"
    >
      {groups.map((g, i) => {
        // 2026-04-28 — per-tab label now reads the deduplicated
        // ontology prefixes (NCBITaxon · UBERON), not the raw column
        // names (subject_id + probe_id). Reviewer: "Using the first
        // column name is misleading." The ontology prefix actually
        // describes what's in the table — a controlled-vocabulary
        // mapping for THAT ontology — whereas the column name
        // describes what the row REFERS to. When a group has no
        // resolved ontology prefixes (only NDI-internal mappings),
        // we fall back to the previous "first 2 column names" form
        // so the user still gets something to click.
        //
        // 2026-04-28 visual-sweep hotfix — `uniquePrefixes` now
        // filters out the `EMPTY` sentinel prefix. NDI uses
        // `EMPTY:0000xxx` IDs as a placeholder for groups that have
        // no resolved external ontology mapping (treatments,
        // approaches, custom strain types). When every node in a
        // group used the EMPTY sentinel, the picker tab read
        // literally "EMPTY 6,160" — not useful. Falling through to
        // the variable-names label keeps the tab readable. If
        // variable names are also empty, fall through to a
        // 1-indexed `Group N` label, then `Untitled group` as a
        // last resort.
        const ontologyPrefixes = uniquePrefixes(g.ontologyNodes);
        const label = pickGroupLabel(ontologyPrefixes, g.variableNames, i);
        // Stable key per group so reorders (new dataset load) don't
        // defeat React reconciliation.
        const key = g.variableNames.join('|');
        const isActive = i === active;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(i)}
            className={cn(
              'px-2 py-1 text-xs font-medium rounded-t-md',
              isActive
                ? 'bg-bg-surface text-fg-primary border border-border-subtle border-b-bg-surface -mb-px'
                : 'text-fg-secondary hover:text-fg-primary',
            )}
          >
            <span className="font-mono truncate max-w-[200px] md:max-w-[300px] lg:max-w-[420px] inline-block align-bottom">
              {label}
            </span>
            <span className="ml-1.5 text-[10px] text-fg-muted">
              {g.rowCount.toLocaleString('en-US')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Map `variableNames` ↔ `ontologyNodes` 1:1 into the
 * `columnOntologyPrefixes` shape SummaryTableView consumes (each entry
 * keyed by column name → ontology term ID, or `null` when no ontology
 * node was annotated for that column). Matches source's
 * `buildColumnOntology` (TableTab.tsx:215-222).
 */
function buildColumnOntology(
  group: OntologyTableGroup,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < group.variableNames.length; i++) {
    const key = group.variableNames[i]!;
    out[key] = group.ontologyNodes[i] ?? null;
  }
  return out;
}

/**
 * Extract the unique ontology prefixes (`NCBITaxon`, `UBERON`, etc.)
 * from a group's `ontologyNodes`. Each ontology node is a
 * `PROVIDER:ID` form (`NCBITaxon:6239`, `UBERON:0001062`); the prefix
 * before the colon is the ontology source. Used to label per-group
 * tabs in `OntologyGroupPicker` with what the group is conceptually
 * about, not which columns happen to live in it. Order-preserving:
 * the prefix appears in the order it's first seen.
 *
 * Returns `[]` when no ontology nodes are annotated (the group
 * picker then falls back to the variable-name label).
 *
 * 2026-04-28 visual-sweep hotfix — the `EMPTY` sentinel prefix is
 * filtered out. NDI uses `EMPTY:0000xxx` IDs as a placeholder for
 * groups that have no resolved external ontology mapping (treatments,
 * approaches, custom strain types). Surfacing literal "EMPTY" as a
 * tab label is misleading and unreadable; if every node in a group
 * uses the EMPTY sentinel, this returns `[]` and the picker falls
 * through to the variable-names label.
 */
function uniquePrefixes(
  ontologyNodes: ReadonlyArray<string | null>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const node of ontologyNodes) {
    if (!node) continue;
    const colonIdx = node.indexOf(':');
    if (colonIdx <= 0) continue;
    const prefix = node.slice(0, colonIdx).trim();
    if (!prefix || seen.has(prefix)) continue;
    // EMPTY is an NDI internal sentinel meaning "no real ontology
    // mapping for this column"; treating it as a real prefix would
    // surface the literal word "EMPTY" as a tab label. Skip it so
    // the picker falls through to a readable fallback.
    if (prefix === 'EMPTY') continue;
    seen.add(prefix);
    out.push(prefix);
  }
  return out;
}

/**
 * Pick a per-tab label for an ontology group. Priority (visual-sweep
 * hotfix 2026-04-28):
 *
 *   1. Deduplicated ontology prefixes joined with ` · ` (e.g.
 *      `UBERON · PATO`) — the most descriptive label and the form a
 *      reviewer asked for in PR #128.
 *   2. The first 1-2 entries from `variableNames` joined by ` + ` —
 *      the pre-PR-#128 form. Less informative than the ontology
 *      prefixes but still readable.
 *   3. `Group N` (1-indexed, e.g. `Group 1`) when variable names are
 *      also missing.
 *   4. `Untitled group` as a last resort.
 *
 * Exported for unit-test coverage. The callers feed the same
 * `uniquePrefixes`-filtered list of ontology prefixes (no `EMPTY`
 * sentinel) so the priority cascade can never bottom out at a
 * literal "EMPTY" string.
 */
export function pickGroupLabel(
  ontologyPrefixes: ReadonlyArray<string>,
  variableNames: ReadonlyArray<string>,
  groupIndex: number,
): string {
  if (ontologyPrefixes.length > 0) {
    return ontologyPrefixes.join(' · ');
  }
  const firstTwoVars = variableNames
    .slice(0, 2)
    .filter((v) => typeof v === 'string' && v.length > 0);
  if (firstTwoVars.length > 0) {
    const ellipsis = variableNames.length > 2 ? '…' : '';
    return `${firstTwoVars.join(' + ')}${ellipsis}`;
  }
  if (groupIndex >= 0) {
    return `Group ${groupIndex + 1}`;
  }
  return 'Untitled group';
}
