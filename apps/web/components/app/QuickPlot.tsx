'use client';

import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Loader2, Play } from 'lucide-react';

import {
  useDistribution,
  type DistributionGroupedResponse,
  type DistributionUngroupedResponse,
} from '@/lib/api/visualize';
import type { TableResponse } from '@/lib/api/tables';
import { classifyColumns } from '@/lib/viewer/math';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/errors/ErrorState';
import { ViolinPlot, type ViolinGroup } from './ViolinPlot';

interface QuickPlotProps {
  datasetId: string;
  className: string;
  table: TableResponse;
}

/**
 * Collapsible card embedded in the SummaryTableView. Auto-detects numeric
 * columns (≥70% parse as numeric) and categorical columns (≤20 unique
 * values), then lets the user pick an x (categorical) + y (numeric)
 * pair and renders a server-computed grouped violin plot.
 *
 * Ported from v1 (230 LOC) with v2 adaptations:
 * - Column source is the v2 `TableResponse` with camelCase keys.
 * - Dispatches to `/api/visualize/distribution` with `groupBy` when a
 *   categorical is picked.
 */
export function QuickPlot({ datasetId, className, table }: QuickPlotProps) {
  const [open, setOpen] = useState(false);
  const [yField, setYField] = useState<string>('');
  const [xField, setXField] = useState<string>('');
  const distribute = useDistribution();

  const { numericCols, categoricalCols } = useMemo(
    () => classifyColumns(table),
    [table],
  );

  const canRun = !!datasetId && !!className && !!yField;

  const run = () => {
    if (!canRun) return;
    distribute.mutate(
      {
        datasetId,
        className,
        field: yField,
        groupBy: xField || undefined,
      },
    );
  };

  const result = distribute.data;
  const grouped =
    result && 'groups' in result ? (result as DistributionGroupedResponse) : null;

  return (
    <Card>
      <CardHeader className="py-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between gap-2"
          aria-expanded={open}
        >
          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Quick plot
          </CardTitle>
          {open ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      </CardHeader>
      {open && (
        <CardBody className="pt-0 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-gray-500">Y (numeric)</span>
              <select
                value={yField}
                onChange={(e) => setYField(e.target.value)}
                className="h-7 text-xs rounded border border-gray-300 bg-white px-2"
              >
                <option value="">— Pick numeric column —</option>
                {numericCols.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-gray-500">
                Group by (optional, categorical)
              </span>
              <select
                value={xField}
                onChange={(e) => setXField(e.target.value)}
                className="h-7 text-xs rounded border border-gray-300 bg-white px-2"
              >
                <option value="">— None —</option>
                {categoricalCols.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              onClick={run}
              disabled={!canRun || distribute.isPending}
              className="h-7 text-xs"
            >
              {distribute.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Play className="h-3 w-3 mr-1" />
              )}
              Plot
            </Button>
          </div>

          {numericCols.length === 0 && (
            <p className="text-xs text-gray-500">
              This table has no numeric columns to plot.
            </p>
          )}

          {distribute.error && (
            <ErrorState error={distribute.error} onRetry={() => distribute.reset()} />
          )}

          {grouped && grouped.groups.length > 0 && (
            <div className="pt-2">
              <ViolinPlot
                groups={grouped.groups.map(toViolinGroup)}
                yLabel={yField}
                xLabel={xField || '(ungrouped)'}
                width={720}
                height={380}
              />
            </div>
          )}

          {!grouped && result && 'n' in result && result.n > 0 && (
            <UngroupedResult result={result} yField={yField} />
          )}
        </CardBody>
      )}
    </Card>
  );
}

function UngroupedResult({
  result,
  yField,
}: {
  result: DistributionUngroupedResponse;
  yField: string;
}) {
  return (
    <div className="pt-2">
      <p className="text-xs text-gray-500 font-mono">
        n={result.n} · mean={(result.mean ?? 0).toFixed(3)} ·
        std={(result.std ?? 0).toFixed(3)}
      </p>
      <ViolinPlot
        groups={[ungroupedToViolin(yField, result)]}
        yLabel={yField}
        xLabel="(ungrouped)"
        width={360}
        height={320}
      />
    </div>
  );
}

function toViolinGroup(g: DistributionGroupedResponse['groups'][number]): ViolinGroup {
  return {
    name: g.name,
    values: g.values,
    count: g.count,
    mean: g.mean,
    median: g.median,
    std: g.std,
    min: g.min,
    max: g.max,
    q1: g.q1,
    q3: g.q3,
  };
}

function ungroupedToViolin(
  field: string,
  r: DistributionUngroupedResponse,
): ViolinGroup {
  const raw = r.raw ?? [];
  const q = r.quartiles ?? { q1: 0, median: 0, q3: 0 };
  return {
    name: field,
    values: raw,
    count: r.n,
    mean: r.mean ?? 0,
    std: r.std ?? 0,
    median: q.median,
    min: r.min ?? 0,
    max: r.max ?? 0,
    q1: q.q1,
    q3: q.q3,
  };
}

// `classifyColumns` and `coerceNumber` extracted to
// `apps/web/lib/viewer/math.ts` (CQ3) so the column-classification
// logic can be unit-tested in isolation. Behavior unchanged — this
// is a pure refactor.
