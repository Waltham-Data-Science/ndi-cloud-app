'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
} from 'lucide-react';

import {
  useDistribution,
  type DistributionGroupedResponse,
  type DistributionUngroupedResponse,
} from '@/lib/api/visualize';
import type { TableResponse } from '@/lib/api/tables';
import { classifyColumns } from '@/lib/viewer/math';
import {
  inferPlotShape,
  type DispatchMode,
  type PlotType,
} from '@/lib/viewer/inferPlotShape';
import { pickPlotSuggestions } from '@/lib/viewer/pickPlotSuggestions';
import { formatPythonSnippet } from '@/lib/viewer/pythonSnippet';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/errors/ErrorState';
import { ViolinPlot, type ViolinGroup } from '@/components/ndi/charts/inline/ViolinPlot';
import { BoxPlot } from '@/components/ndi/charts/inline/BoxPlot';
import { Histogram } from '@/components/ndi/charts/inline/Histogram';
import { BarChartByGroup } from '@/components/ndi/charts/inline/BarChartByGroup';
import { ScatterPlot } from '@/components/ndi/charts/inline/ScatterPlot';
import { LinePlot } from '@/components/ndi/charts/inline/LinePlot';
import { QuickPlotControls } from './QuickPlotControls';

interface QuickPlotProps {
  datasetId: string;
  className: string;
  table: TableResponse;
}

/**
 * Collapsible Quick Plot card embedded in the SummaryTableView.
 *
 * Column-first redesign (2026-04-29): the user picks a Y column (or
 * an X column for solo bar-count) and a plot renders immediately —
 * no upfront plot-type or axis-mode decisions. Plot type is inferred
 * from the column types via `inferPlotShape`; the user can override
 * within a compatible family via the chip row in `QuickPlotControls`.
 *
 * On first expand, `pickPlotSuggestions` seeds the controls with a
 * deterministic primary suggestion so the empty card is replaced by
 * a real plot the moment the user opens it. Up to two secondary
 * suggestions render as inline chips below the plot — one click
 * re-seeds the controls.
 *
 * Dispatch is hidden behind the inference function:
 *
 * - `distribution-grouped` / `distribution-ungrouped` → POST
 *   /api/visualize/distribution. Server returns KDE + per-group stats
 *   that the SVG renderers (ViolinPlot, BoxPlot, Histogram) consume.
 * - `in-memory` → renderers read `table.rows` directly. No API call.
 *
 * Out of scope (matplotlib territory): multi-Y / shared-X subplots,
 * continuous color encoding, custom titles or axis-range controls,
 * statistical overlays beyond the violin's inset IQR box, log-axis
 * transforms, plotting from raw binary data. Hand-off to Python is
 * via the Copy-as-Python button (Task 9).
 */
export function QuickPlot({ datasetId, className, table }: QuickPlotProps) {
  const [open, setOpen] = useState(false);
  const [yField, setYField] = useState<string>('');
  const [xField, setXField] = useState<string>('');
  const [seeded, setSeeded] = useState(false);
  const [plotTypeOverride, setPlotTypeOverride] = useState<PlotType | null>(
    null,
  );
  const [exportFeedback, setExportFeedback] = useState<
    'png-copied' | 'py-copied' | 'png-error' | null
  >(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const distribute = useDistribution();

  const { numericCols, categoricalCols } = useMemo(
    () => classifyColumns(table),
    [table],
  );

  const suggestions = useMemo(
    () => pickPlotSuggestions(table, numericCols, categoricalCols),
    [table, numericCols, categoricalCols],
  );

  // First expand seeds the controls from the primary suggestion so
  // the user sees a real plot, not blank dropdowns. Subsequent column
  // changes don't re-seed — once the user has touched the controls
  // they own them. Seeding fires from the open-click handler rather
  // than an effect to avoid the cascading-render lint rule.
  const handleOpenToggle = () => {
    if (!open && !seeded && suggestions.primary) {
      setYField(suggestions.primary.yField);
      setXField(suggestions.primary.xField);
      setPlotTypeOverride(null);
      setSeeded(true);
    }
    setOpen(!open);
  };

  const inferred = useMemo(
    () =>
      inferPlotShape({
        yField,
        xField,
        numericCols,
        categoricalCols,
        table,
      }),
    [yField, xField, numericCols, categoricalCols, table],
  );

  // Effective plot type: user override wins, but only when it remains
  // compatible with the current X/Y types (the chip row hides
  // incompatible types, but if the column choice changes after an
  // override, the override may have become invalid — fall back to
  // inferred in that case).
  const effectivePlotType: PlotType | null = useMemo(() => {
    if (!inferred) return null;
    if (!plotTypeOverride) return inferred.plotType;
    if (chipsAreCompatible(plotTypeOverride, inferred.plotType)) {
      return plotTypeOverride;
    }
    return inferred.plotType;
  }, [inferred, plotTypeOverride]);

  const dispatchMode: DispatchMode | null = useMemo(() => {
    if (!effectivePlotType || !inferred) return null;
    return dispatchForPlotType(effectivePlotType, inferred.dispatchMode);
  }, [effectivePlotType, inferred]);

  // Auto-fire the distribution mutation whenever the inputs settle on
  // a server-side combination. Each new (yField, xField, dispatchMode)
  // triggers a fresh request; the latest result wins.
  useEffect(() => {
    if (
      !yField ||
      !dispatchMode ||
      dispatchMode === 'in-memory'
    ) {
      return;
    }
    distribute.mutate({
      datasetId,
      className,
      field: yField,
      groupBy: dispatchMode === 'distribution-grouped' ? xField : undefined,
    });
    // The mutate ref is stable; including it in deps would loop. Same
    // pattern used elsewhere in the codebase for tanstack mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, className, yField, xField, dispatchMode]);

  const handleYChange = (next: string) => {
    setYField(next);
    setPlotTypeOverride(null);
  };
  const handleXChange = (next: string) => {
    setXField(next);
    setPlotTypeOverride(null);
  };
  const handlePlotTypeChange = (next: PlotType) => {
    setPlotTypeOverride(next);
  };
  const applySuggestion = (s: {
    plotType: PlotType;
    yField: string;
    xField: string;
  }) => {
    setYField(s.yField);
    setXField(s.xField);
    setPlotTypeOverride(s.plotType);
  };

  // Only show the bar-count helper data when we'd render a bar chart —
  // it's a derived count map over `table.rows[xField]`.
  const barCounts = useMemo(() => {
    if (effectivePlotType !== 'bar-count' || !xField) return [];
    const counts = new Map<string, number>();
    for (const row of table.rows) {
      const v = row[xField];
      const k =
        v === null || v === undefined || v === '' ? '(empty)' : String(v);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [effectivePlotType, xField, table.rows]);

  const result = distribute.data;
  const grouped =
    result && 'groups' in result ? (result as DistributionGroupedResponse) : null;

  // Whether anything plottable is rendered. Controls when the export
  // buttons are enabled — there's no point trying to copy a PNG of an
  // empty plot region or generate Python for a state with no plot.
  const hasRenderedPlot =
    !!effectivePlotType &&
    (effectivePlotType === 'scatter' ||
    effectivePlotType === 'line' ||
    effectivePlotType === 'bar-count'
      ? !!yField || !!xField
      : !!result &&
        (grouped
          ? grouped.groups.length > 0
          : 'n' in result && result.n > 0));

  const showFeedback = useCallback((kind: typeof exportFeedback) => {
    setExportFeedback(kind);
    setTimeout(() => setExportFeedback(null), 1800);
  }, []);

  const handleCopyPng = useCallback(async () => {
    if (!plotRef.current) return;
    try {
      // Lazy-loaded so html-to-image doesn't appear in the initial
      // bundle for users who never click the button.
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(plotRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });
      if (!blob) throw new Error('toBlob returned null');
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        throw new Error('Clipboard image API unavailable');
      }
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      showFeedback('png-copied');
    } catch (err) {
      console.error('Quick Plot: Copy PNG failed', err);
      showFeedback('png-error');
    }
  }, [showFeedback]);

  const handleCopyPython = useCallback(async () => {
    if (!effectivePlotType) return;
    const code = formatPythonSnippet({
      plotType: effectivePlotType,
      datasetId,
      className,
      yField,
      xField,
    });
    try {
      await navigator.clipboard.writeText(code);
      showFeedback('py-copied');
    } catch (err) {
      console.error('Quick Plot: Copy Python failed', err);
    }
  }, [
    effectivePlotType,
    datasetId,
    className,
    yField,
    xField,
    showFeedback,
  ]);

  return (
    <Card>
      <CardHeader className="py-3">
        <button
          type="button"
          onClick={handleOpenToggle}
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
          {numericCols.length === 0 && categoricalCols.length === 0 ? (
            <QuickPlotEmptyState
              testId="quickplot-empty-no-columns"
              title="No plottable columns in this table"
              description="Quick Plot needs at least one numeric column or a low-cardinality categorical column. This table has neither — try a different summary table on this dataset."
            />
          ) : (
            <>
              <QuickPlotControls
                numericCols={numericCols}
                categoricalCols={categoricalCols}
                yField={yField}
                xField={xField}
                plotType={effectivePlotType}
                onYChange={handleYChange}
                onXChange={handleXChange}
                onPlotTypeChange={handlePlotTypeChange}
              />

              {!effectivePlotType && (
                <QuickPlotEmptyState
                  testId="quickplot-empty-pick-y"
                  title="Pick a column to plot"
                  description="Quick Plot summarizes one or two columns of this table — pick a numeric Y for distributions and comparisons, or a categorical X for a bar count. Plot type is inferred from the column types."
                />
              )}

              {distribute.error &&
                dispatchMode &&
                dispatchMode !== 'in-memory' && (
                  <ErrorState
                    error={distribute.error}
                    onRetry={() => distribute.reset()}
                  />
                )}

              <div ref={plotRef}>
                {effectivePlotType === 'scatter' && yField && xField && (
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

                {effectivePlotType === 'line' && yField && xField && (
                  <div className="pt-2">
                    <LinePlot
                      rows={table.rows}
                      xField={xField}
                      yField={yField}
                      xLabel={xField}
                      yLabel={yField}
                    />
                  </div>
                )}

                {effectivePlotType === 'bar-count' && xField && (
                  <div className="pt-2">
                    <BarChartByGroup
                      bars={barCounts}
                      xLabel={xField}
                      width={720}
                      height={380}
                    />
                  </div>
                )}

                {(effectivePlotType === 'violin' ||
                  effectivePlotType === 'box' ||
                  effectivePlotType === 'histogram') &&
                  grouped &&
                  grouped.groups.length > 0 && (
                    <div className="pt-2">
                      <GroupedRenderer
                        plotType={effectivePlotType}
                        groups={grouped.groups.map(toViolinGroup)}
                        yLabel={yField}
                        xLabel={xField || '(ungrouped)'}
                      />
                    </div>
                  )}

                {(effectivePlotType === 'violin' ||
                  effectivePlotType === 'box' ||
                  effectivePlotType === 'histogram') &&
                  !grouped &&
                  result &&
                  'n' in result &&
                  result.n > 0 && (
                    <UngroupedResult
                      result={result}
                      yField={yField}
                      plotType={effectivePlotType}
                    />
                  )}
              </div>

              {hasRenderedPlot && (
                <div
                  className="flex flex-wrap items-center gap-2 pt-1"
                  data-testid="quickplot-export-row"
                >
                  <button
                    type="button"
                    onClick={handleCopyPng}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 hover:border-gray-400"
                    data-testid="quickplot-copy-png"
                  >
                    {exportFeedback === 'png-copied' ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    {exportFeedback === 'png-copied' ? 'Copied PNG' : 'Copy PNG'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyPython}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 hover:border-gray-400"
                    data-testid="quickplot-copy-python"
                  >
                    {exportFeedback === 'py-copied' ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {exportFeedback === 'py-copied'
                      ? 'Copied Python'
                      : 'Copy Python'}
                  </button>
                  {exportFeedback === 'png-error' && (
                    <span className="text-[11px] text-rose-600">
                      Couldn&apos;t copy — check browser permissions
                    </span>
                  )}
                </div>
              )}

              {suggestions.secondary.length > 0 && (
                <div
                  className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-gray-500"
                  data-testid="quickplot-secondary-suggestions"
                >
                  <span>Try:</span>
                  {suggestions.secondary.map((s, i) => (
                    <button
                      key={`${s.plotType}-${i}`}
                      type="button"
                      onClick={() => applySuggestion(s)}
                      className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:border-gray-400"
                    >
                      {describeSuggestion(s)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </CardBody>
      )}
    </Card>
  );
}

/** The chip row in QuickPlotControls only allows in-family overrides
 *  (histogram ↔ violin ↔ box; scatter ↔ line; bar-count alone). Used
 *  here to validate that an existing override is still compatible
 *  with the current inferred type after a column change. */
function chipsAreCompatible(override: PlotType, inferred: PlotType): boolean {
  const distribution: PlotType[] = ['histogram', 'violin', 'box'];
  const xy: PlotType[] = ['scatter', 'line'];
  if (distribution.includes(override) && distribution.includes(inferred))
    return true;
  if (xy.includes(override) && xy.includes(inferred)) return true;
  if (override === 'bar-count' && inferred === 'bar-count') return true;
  return false;
}

/** When the user overrides the plot type within a family, the dispatch
 *  mode usually stays the same (all distribution shapes share the
 *  /distribution endpoint; both XY shapes are in-memory). This helper
 *  encodes that — fall back to the inferred dispatch mode and only
 *  override when truly needed. */
function dispatchForPlotType(
  plotType: PlotType,
  inferredDispatch: DispatchMode,
): DispatchMode {
  if (plotType === 'scatter' || plotType === 'line' || plotType === 'bar-count')
    return 'in-memory';
  return inferredDispatch;
}

function describeSuggestion(s: {
  plotType: PlotType;
  yField: string;
  xField: string;
}): string {
  switch (s.plotType) {
    case 'violin':
    case 'box':
      return `${s.yField} by ${s.xField}`;
    case 'scatter':
    case 'line':
      return `${s.yField} vs ${s.xField}`;
    case 'histogram':
      return `${s.yField} distribution`;
    case 'bar-count':
      return `count by ${s.xField}`;
  }
}

function GroupedRenderer({
  plotType,
  groups,
  yLabel,
  xLabel,
}: {
  plotType: 'violin' | 'box' | 'histogram';
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
  plotType: 'violin' | 'box' | 'histogram';
}) {
  const groups = [ungroupedToViolin(yField, result)];
  return (
    <div className="pt-2">
      <p className="text-xs text-gray-500 font-mono">
        n={result.n} · mean={(result.mean ?? 0).toFixed(3)} · std=
        {(result.std ?? 0).toFixed(3)}
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
