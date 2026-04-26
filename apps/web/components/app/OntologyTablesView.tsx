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
        const visibleNames = g.variableNames.slice(0, 2).join(' + ');
        const truncated = g.variableNames.length > 2 ? '…' : '';
        const label = `${visibleNames}${truncated}`;
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
              {g.rowCount.toLocaleString()}
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
