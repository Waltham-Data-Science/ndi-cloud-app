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
import { BoxPlot } from './BoxPlot';
import { Histogram } from './Histogram';
import { BarChartByGroup } from './BarChartByGroup';
import { ScatterPlot } from './ScatterPlot';

interface QuickPlotProps {
  datasetId: string;
  className: string;
  table: TableResponse;
}

type PlotType = 'violin' | 'box' | 'histogram' | 'bar';
type AxisMode = 'group' | 'xnumeric';

const PLOT_TYPE_LABELS: Record<PlotType, string> = {
  violin: 'Violin',
  box: 'Box',
  histogram: 'Histogram',
  bar: 'Bar (count by group)',
};

/**
 * Collapsible card embedded in the SummaryTableView. Auto-detects numeric
 * columns (≥70% parse as numeric) and categorical columns (≤20 unique
 * values), then lets the user pick a plot type and X/Y/group axes to render.
 *
 * Modes:
 *
 * - **Group axis (categorical X)** — distribution endpoint shapes (violin,
 *   box, histogram, bar by count).
 * - **X numeric axis** — pulls X+Y from in-memory `table.rows` and renders
 *   a uPlot scatter; no API call needed. Color-by-group when `groupBy` is
 *   also set.
 *
 * Phase 6.7+ P0: the third dropdown (plot type) lets users pick the shape
 * that fits their data — violin is meaningless for n=2 groups, histogram
 * is the right tool for "what does this distribution look like", bar
 * answers "how many rows fall in each group". Scatter unlocks the
 * headline plots from the reference tutorials (worm trajectory,
 * distance-to-patch, startle-over-trial).
 */
export function QuickPlot({ datasetId, className, table }: QuickPlotProps) {
  const [open, setOpen] = useState(false);
  const [yField, setYField] = useState<string>('');
  const [xField, setXField] = useState<string>('');
  const [plotType, setPlotType] = useState<PlotType>('violin');
  const [axisMode, setAxisMode] = useState<AxisMode>('group');
  const distribute = useDistribution();

  const { numericCols, categoricalCols } = useMemo(
    () => classifyColumns(table),
    [table],
  );

  // Group-mode: needs Y (except for `bar`) and dispatches to /distribution.
  // X-numeric mode: needs both X numeric + Y numeric (no API).
  const groupModeCanRun =
    !!datasetId && !!className && (plotType === 'bar' ? !!xField : !!yField);
  const scatterCanRun = !!xField && !!yField;
  const canRun = axisMode === 'xnumeric' ? scatterCanRun : groupModeCanRun;

  // For the bar-by-count plot, X is required (it's the group axis).
  const xRequired = axisMode === 'xnumeric' || plotType === 'bar';

  const run = () => {
    if (!canRun) return;
    if (axisMode === 'xnumeric') {
      // Scatter reads in-memory rows; nothing to dispatch. The render
      // path just consults `xField` + `yField`.
      return;
    }
    if (plotType === 'bar') {
      // Bar-by-count is computed locally from `table.rows` — no API call.
      return;
    }
    distribute.mutate({
      datasetId,
      className,
      field: yField,
      groupBy: xField || undefined,
    });
  };

  const result = distribute.data;
  const grouped =
    result && 'groups' in result ? (result as DistributionGroupedResponse) : null;

  // For the bar-by-count chart we don't need the API — count rows in-memory.
  const barCounts = useMemo(() => {
    if (axisMode !== 'group' || plotType !== 'bar' || !xField) return [];
    const counts = new Map<string, number>();
    for (const row of table.rows) {
      const v = row[xField];
      const k =
        v === null || v === undefined || v === '' ? '(empty)' : String(v);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [axisMode, plotType, xField, table.rows]);

  // The X-axis dropdown's option set depends on axisMode: categorical when
  // grouping (violin/box/histogram/bar payloads), numeric when scattering.
  const xOptions = axisMode === 'xnumeric' ? numericCols : categoricalCols;
  const xLabelText =
    axisMode === 'xnumeric'
      ? 'X (numeric)'
      : plotType === 'bar'
        ? 'Group by (categorical, required)'
        : 'Group by (optional, categorical)';

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
              <span className="text-gray-500">Axis mode</span>
              <select
                value={axisMode}
                onChange={(e) => {
                  const next = e.target.value as AxisMode;
                  setAxisMode(next);
                  // Resetting the X picker avoids carrying a now-invalid
                  // column choice across the categorical↔numeric flip
                  // (e.g. "region" was valid for grouping; if the user
                  // switches to scatter mode, it shouldn't stick because
                  // the dropdown will repopulate with numeric columns).
                  setXField('');
                }}
                className="h-7 text-xs rounded border border-gray-300 bg-white px-2"
              >
                <option value="group">Group (categorical)</option>
                <option value="xnumeric">X (numeric)</option>
              </select>
            </label>

            {axisMode === 'group' && (
              <label className="flex flex-col gap-0.5 text-xs">
                <span className="text-gray-500">Plot type</span>
                <select
                  value={plotType}
                  onChange={(e) => setPlotType(e.target.value as PlotType)}
                  className="h-7 text-xs rounded border border-gray-300 bg-white px-2"
                >
                  {(Object.keys(PLOT_TYPE_LABELS) as PlotType[]).map((p) => (
                    <option key={p} value={p}>
                      {PLOT_TYPE_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-gray-500">
                {axisMode === 'xnumeric' || plotType !== 'bar'
                  ? 'Y (numeric)'
                  : 'Y (numeric, ignored for bar)'}
              </span>
              <select
                value={yField}
                onChange={(e) => setYField(e.target.value)}
                className="h-7 text-xs rounded border border-gray-300 bg-white px-2"
                disabled={axisMode === 'group' && plotType === 'bar'}
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
              <span className="text-gray-500">{xLabelText}</span>
              <select
                value={xField}
                onChange={(e) => setXField(e.target.value)}
                className="h-7 text-xs rounded border border-gray-300 bg-white px-2"
              >
                <option value="">{xRequired ? '— Pick column —' : '— None —'}</option>
                {xOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            {/*
              2026-04-28 — team-review feedback: the Plot button
              previously read "Quick plot doesn't seem to be plotting
              anything meaningful" because the user couldn't tell why
              the button was disabled. Adding a tooltip via `title`
              spells out the unmet precondition (a Y column hasn't
              been picked yet, or in xnumeric mode both X+Y are
              required). The disabled state stays the same — this is
              purely the "tell the user why" affordance.
            */}
            <Button
              size="sm"
              onClick={run}
              disabled={!canRun || distribute.isPending}
              title={
                distribute.isPending
                  ? 'Plotting…'
                  : canRun
                    ? undefined
                    : axisMode === 'xnumeric'
                      ? 'Pick numeric X and Y columns to plot'
                      : plotType === 'bar'
                        ? 'Pick a Group-by column'
                        : 'Pick a Y column'
              }
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

          {/*
            2026-04-28 — team-review empty-state polish. Three
            mutually-exclusive empty states render INSIDE the plot
            area (a dashed-border placeholder), in priority order:

              1. Table has zero numeric columns at all → tell the
                 user the table can't be plotted by Quick Plot. This
                 takes precedence over the "pick a column" hint
                 because there's nothing to pick.
              2. Y unset (group mode, non-bar plots; or xnumeric
                 with X+Y missing) → tell the user what to pick AND
                 give a one-line "what is Quick Plot" description so
                 they understand the feature without leaving the
                 page.
              3. Otherwise: the canRun flag is true and the renderer
                 below shows the actual plot.

            Group/bar mode is a special case: Y isn't used, so the
            empty state asks for the X (Group-by) column instead.
          */}
          {numericCols.length === 0 ? (
            <QuickPlotEmptyState
              testId="quickplot-empty-no-numeric"
              title="No numeric columns in this table"
              description="Quick Plot needs at least one numeric column. This table has none — try a different summary table on this dataset."
            />
          ) : axisMode === 'xnumeric' && !scatterCanRun ? (
            <QuickPlotEmptyState
              testId="quickplot-empty-pick-xy"
              title="Pick numeric X and Y columns to plot"
              description="Quick Plot summarizes one column of this table — pick a numeric Y column and (optionally) a categorical Group-by, and choose violin / box / histogram / bar."
            />
          ) : axisMode === 'group' && plotType === 'bar' && !xField ? (
            <QuickPlotEmptyState
              testId="quickplot-empty-pick-group"
              title="Pick a Group-by column to plot"
              description="Quick Plot summarizes one column of this table — pick a numeric Y column and (optionally) a categorical Group-by, and choose violin / box / histogram / bar."
            />
          ) : axisMode === 'group' && plotType !== 'bar' && !yField ? (
            <QuickPlotEmptyState
              testId="quickplot-empty-pick-y"
              title="Pick a numeric column on the Y axis to plot"
              description="Quick Plot summarizes one column of this table — pick a numeric Y column and (optionally) a categorical Group-by, and choose violin / box / histogram / bar."
            />
          ) : null}

          {distribute.error && axisMode === 'group' && plotType !== 'bar' && (
            <ErrorState error={distribute.error} onRetry={() => distribute.reset()} />
          )}

          {/* Renderers — only one mounts at a time based on axisMode +
            plotType. Mounting/unmounting trumps a hidden-but-rendered
            approach because the children all instantiate uPlot or do
            heavy d3 work in their effects/useMemo paths. */}

          {axisMode === 'xnumeric' && scatterCanRun && (
            <div className="pt-2">
              <ScatterPlot
                rows={table.rows}
                xField={xField}
                yField={yField}
                groupBy={null}
                xLabel={xField}
                yLabel={yField}
              />
            </div>
          )}

          {axisMode === 'group' && plotType === 'bar' && xField && (
            <div className="pt-2">
              <BarChartByGroup
                bars={barCounts}
                xLabel={xField}
                width={720}
                height={380}
              />
            </div>
          )}

          {axisMode === 'group' &&
            plotType !== 'bar' &&
            grouped &&
            grouped.groups.length > 0 && (
              <div className="pt-2">
                <GroupedRenderer
                  plotType={plotType}
                  groups={grouped.groups.map(toViolinGroup)}
                  yLabel={yField}
                  xLabel={xField || '(ungrouped)'}
                />
              </div>
            )}

          {axisMode === 'group' &&
            plotType !== 'bar' &&
            !grouped &&
            result &&
            'n' in result &&
            result.n > 0 && (
              <UngroupedResult result={result} yField={yField} plotType={plotType} />
            )}
        </CardBody>
      )}
    </Card>
  );
}

/** Picks the right SVG sibling for a grouped distribution payload. The
 *  three plotters all consume `ViolinGroup[]` — they just emit different
 *  SVG geometries. */
function GroupedRenderer({
  plotType,
  groups,
  yLabel,
  xLabel,
}: {
  plotType: Exclude<PlotType, 'bar'>;
  groups: ViolinGroup[];
  yLabel: string;
  xLabel: string;
}) {
  if (plotType === 'box') {
    return (
      <BoxPlot
        groups={groups}
        yLabel={yLabel}
        xLabel={xLabel}
        width={720}
        height={380}
      />
    );
  }
  if (plotType === 'histogram') {
    return (
      <Histogram
        groups={groups}
        yLabel={yLabel}
        xLabel={xLabel}
        width={720}
        height={380}
      />
    );
  }
  return (
    <ViolinPlot
      groups={groups}
      yLabel={yLabel}
      xLabel={xLabel}
      width={720}
      height={380}
    />
  );
}

function UngroupedResult({
  result,
  yField,
  plotType,
}: {
  result: DistributionUngroupedResponse;
  yField: string;
  plotType: Exclude<PlotType, 'bar'>;
}) {
  const groups = [ungroupedToViolin(yField, result)];
  return (
    <div className="pt-2">
      <p className="text-xs text-gray-500 font-mono">
        n={result.n} · mean={(result.mean ?? 0).toFixed(3)} ·
        std={(result.std ?? 0).toFixed(3)}
      </p>
      <GroupedRenderer
        plotType={plotType}
        groups={groups}
        yLabel={yField}
        xLabel="(ungrouped)"
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

/**
 * Friendly empty-state placeholder rendered inside the Quick Plot
 * card when the user hasn't yet picked enough columns to render a
 * plot, or when the table has no numeric columns at all.
 *
 * The dashed border + min-height makes the empty state feel like
 * "the place where the plot will go" rather than a stray sentence
 * of helper text. The description gives a one-line "what is Quick
 * Plot" hand-off so first-time users understand the feature
 * without leaving the page (team-review feedback 2026-04-28).
 */
function QuickPlotEmptyState({
  title,
  description,
  testId,
}: {
  title: string;
  description: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-h-[180px] flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center"
    >
      <BarChart3 className="h-5 w-5 text-gray-400" aria-hidden />
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <p className="max-w-md text-xs text-gray-500">{description}</p>
    </div>
  );
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
