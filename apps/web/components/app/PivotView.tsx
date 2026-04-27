'use client';

/**
 * PivotView — grain-selectable pivot grid (Plan B B6e).
 *
 * Ported from `ndi-data-browser-v2/frontend/src/components/datasets/PivotView.tsx`
 * (Phase 6.5b of the cross-repo unification — see
 * `docs/plans/cross-repo-unification-2026-04-24.md`). Three monorepo
 * adaptations vs. v2 source:
 *
 *   1. URL params (`id`, `grain`) flow in as props from the route
 *      page (`/datasets/[id]/pivot/[grain]/page.tsx`) instead of being
 *      pulled from `useParams()`. Navigation between grains uses
 *      `useRouter().push()` from `next/navigation`.
 *   2. Imports rewritten for monorepo layout (`@/lib/api/...`,
 *      `@/components/ui/...`, `@/lib/data/...`).
 *   3. Behind the same `FEATURE_PIVOT_V1` backend flag — a 503 from any
 *      pivot fetch surfaces the disabled card. The route still renders
 *      something even if a user lands directly via URL.
 *
 * Original behavior:
 *
 * - Grain selector auto-populated from `DatasetSummary.counts` (any grain
 *   with count ≥ 1 is offered).
 * - Per amendment §4.B6e only subject/session/element grains ship in v1.
 * - Audit 2026-04-23 #63: virtualized rendering via the shared
 *   `<VirtualizedTable>` primitive.
 * - Header tooltip (per-column description) pulled from
 *   `lib/data/table-column-definitions` so column hints agree with the
 *   summary-table view.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';

import { ApiError } from '@/lib/api/errors';
import {
  useDatasetPivot,
  useDatasetSummary,
  type PivotGrain,
  type PivotResponse,
} from '@/lib/api/datasets';
import { ErrorState } from '@/components/errors/ErrorState';
import { VirtualizedTable } from '@/components/ui/VirtualizedTable';
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { TableLoadingPanel } from '@/components/ui/Skeleton';
import { getColumnDefinition } from '@/lib/data/table-column-definitions';

/** Grains offered in v1. Order drives the selector dropdown order. */
const GRAIN_ORDER: PivotGrain[] = ['subject', 'session', 'element'];

/** Per-grain human-readable label in the selector. */
const GRAIN_LABELS: Record<PivotGrain, string> = {
  subject: 'Subject',
  session: 'Session',
  element: 'Element',
};

/** Map each grain to the `DatasetSummary.counts` field that populates it. */
function grainCount(
  grain: PivotGrain,
  counts: { subjects: number; sessions: number; elements: number },
): number {
  if (grain === 'subject') return counts.subjects;
  if (grain === 'session') return counts.sessions;
  return counts.elements;
}

interface PivotViewProps {
  datasetId: string;
  grain: PivotGrain;
}

export function PivotView({ datasetId, grain }: PivotViewProps) {
  const router = useRouter();
  const summary = useDatasetSummary(datasetId);
  const pivot = useDatasetPivot(datasetId, grain);

  // Hooks MUST run in the same order on every render — compute
  // `availableGrains` before any early return.
  const availableGrains: PivotGrain[] = useMemo(() => {
    if (!summary.data) return [];
    const counts = summary.data.counts;
    return GRAIN_ORDER.filter((g) => grainCount(g, counts) >= 1);
  }, [summary.data]);

  const handleGrainChange = (next: PivotGrain) => {
    router.push(`/datasets/${datasetId}/pivot/${next}`);
  };

  // 503 on any pivot fetch means the feature flag is off. Surface a
  // dedicated disabled-state card.
  if (pivot.isError && isFeatureDisabled(pivot.error)) {
    return <PivotDisabledCard />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Grain pivot</CardTitle>
            <CardDescription className="text-xs">
              Cross-class pivot keyed by a single grain. v1 supports
              subject, session, and element grains.
            </CardDescription>
          </div>
          <GrainSelector
            active={grain}
            available={availableGrains}
            onChange={handleGrainChange}
            disabled={summary.isLoading}
          />
        </div>
      </CardHeader>
      <CardBody>
        <PivotBody pivot={pivot} grain={grain} />
      </CardBody>
    </Card>
  );
}

// `DatasetPivotNavGuard` was previously exported here as a probe-
// based feature-flag wrapper for the pivot tab. Architectural-audit
// review (Tier 1 #4) flagged it as a potential double-fetch source
// because the probe fires `useDatasetPivot(id, 'subject')` on every
// mount in addition to whatever the leaf route fetches. Verified
// the export is referenced ONLY by `tests/unit/(app)/pivot-view.test.tsx`
// and never imported from production app code — the pivot tab nav
// is currently always-visible (the feature-disabled state is
// rendered as a banner in PivotView itself when the user lands on
// `/pivot/<grain>`). The guard was therefore dead in production.
// Removing the export + the test block that exercised it. If a
// future caller needs feature-gated nav-link visibility, prefer a
// cheap dedicated `/api/health/features` endpoint over a probe.

function PivotBody({
  pivot,
  grain,
}: {
  pivot: ReturnType<typeof useDatasetPivot>;
  grain: PivotGrain;
}) {
  if (pivot.isLoading) {
    return <TableLoadingPanel tableType={`${grain} pivot`} rows={10} />;
  }
  if (pivot.isError) {
    return <ErrorState error={pivot.error} onRetry={() => pivot.refetch()} />;
  }
  if (!pivot.data || pivot.data.rows.length === 0) {
    return (
      <p className="text-sm text-fg-muted" data-testid="pivot-empty">
        No {GRAIN_LABELS[grain].toLowerCase()} rows for this dataset.
      </p>
    );
  }
  return <PivotTable data={pivot.data} grain={grain} />;
}

function PivotTable({ data, grain }: { data: PivotResponse; grain: PivotGrain }) {
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      data.columns.map((col) => ({
        accessorKey: col.key,
        id: col.key,
        header: col.label,
        cell: (info) => formatCell(info.getValue()),
      })),
    [data.columns],
  );
  // Same React-Compiler / `react-hooks/incompatible-library` carve-out
  // as Phase 3a's `VirtualizedTable` and Phase 3c's `MyDatasetsTable`:
  // TanStack Table returns identity-changing helpers by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <VirtualizedTable
      data-testid="pivot-table"
      table={table}
      estimateSize={28}
      renderHeaderCell={(header) => {
        const def = getColumnDefinition(grain, header.column.id);
        return (
          <div
            title={def?.description}
            className="px-2 py-1.5 font-semibold text-fg-primary"
          >
            {header.isPlaceholder
              ? null
              : flexRender(header.column.columnDef.header, header.getContext())}
          </div>
        );
      }}
      renderCell={(cell) => (
        <td
          key={cell.id}
          className="px-2 py-1 text-fg-primary font-mono whitespace-nowrap align-top"
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      )}
    />
  );
}

function GrainSelector({
  active,
  available,
  onChange,
  disabled,
}: {
  active: PivotGrain;
  available: PivotGrain[];
  onChange: (next: PivotGrain) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className="flex items-center gap-2 text-xs text-fg-secondary"
      data-testid="pivot-grain-selector"
    >
      <span className="font-medium">Grain</span>
      <select
        aria-label="Pivot grain"
        className="rounded-md border border-border-strong bg-bg-surface px-2 py-1 text-xs"
        value={active}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as PivotGrain)}
      >
        {GRAIN_ORDER.map((g) => (
          <option
            key={g}
            value={g}
            disabled={!available.includes(g)}
            data-testid={`pivot-grain-option-${g}`}
          >
            {GRAIN_LABELS[g]}
            {!available.includes(g) && ' (0)'}
          </option>
        ))}
      </select>
    </label>
  );
}

function PivotDisabledCard() {
  return (
    <Card data-testid="pivot-disabled">
      <CardHeader>
        <CardTitle className="text-base">Grain pivot</CardTitle>
        {/*
          Audit 2026-04-27 #11 — the pre-fix copy ("Set FEATURE_PIVOT_V1=true
          to enable.") leaked an internal env-var name into user copy. End
          users can't toggle backend env vars; the operator-grade hint was
          wasted screen real estate AND read like a runtime error. Replaced
          with a forward-looking note. Operators can still tell the feature
          is gated by the env var via the data-flag attribute below.
        */}
        <CardDescription
          className="text-xs"
          data-feature-flag="FEATURE_PIVOT_V1"
        >
          Pivot view is in development and not available on this deployment yet.
          Check back soon — the table tabs above cover the same shape today.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

/**
 * A 503 from /api/datasets/:id/pivot/:grain is exactly the signal that
 * the backend flag is off — the router raises an HTTPException with the
 * feature-flag message. Status 503 from this specific endpoint is the
 * stable contract.
 */
function isFeatureDisabled(err: unknown): boolean {
  if (err instanceof ApiError && err.status === 503) {
    return true;
  }
  return false;
}

/** Format a row cell:
 * - `null` / `undefined` → em-dash (matches MATLAB's blank-cell convention).
 * - Strings: verbatim.
 * - Numbers / booleans: `String(v)`.
 * - Objects: JSON-encoded.
 */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
