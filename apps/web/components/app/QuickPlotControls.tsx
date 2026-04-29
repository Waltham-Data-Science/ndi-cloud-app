'use client';

import type { PlotType } from '@/lib/viewer/inferPlotShape';

interface QuickPlotControlsProps {
  numericCols: ReadonlyArray<string>;
  categoricalCols: ReadonlyArray<string>;
  yField: string;
  xField: string;
  /** Current effective plot type. Null when no plot is renderable yet
   *  (e.g., empty state, no Y picked). When null, the chip row is
   *  hidden — there's nothing to highlight or override. */
  plotType: PlotType | null;
  onYChange: (y: string) => void;
  onXChange: (x: string) => void;
  onPlotTypeChange: (p: PlotType) => void;
}

const CHIP_LABELS: Record<PlotType, string> = {
  histogram: 'Histogram',
  violin: 'Violin',
  box: 'Box',
  scatter: 'Scatter',
  line: 'Line',
  'bar-count': 'Bar count',
};

/**
 * Maps the current effective plot type to the set of chips that make
 * sense for the underlying column types. Each row of the inference
 * table has a small family of compatible plot types; the user can
 * override within that family via the chip row, but cross-family
 * overrides (e.g. switching scatter→violin) require changing the X
 * column. This avoids the "I clicked violin but my X is numeric and
 * nothing renders" trap.
 */
function chipsForPlotType(plotType: PlotType): readonly PlotType[] {
  switch (plotType) {
    case 'histogram':
    case 'violin':
    case 'box':
      return ['histogram', 'violin', 'box'];
    case 'scatter':
    case 'line':
      return ['scatter', 'line'];
    case 'bar-count':
      return ['bar-count'];
  }
}

/**
 * The column-first picker UX: Y picker (numeric only), X picker (all
 * columns + None), plot-type chip row (visibility derived from plot
 * type). The chip row is hidden when there's no plotType — empty state
 * is the parent's responsibility.
 *
 * Why Y is numeric-only: none of the in-scope plots have a meaningful
 * categorical Y. Surfacing categoricals in the Y picker would just let
 * the user reach a state where nothing renders and they'd wonder why.
 */
export function QuickPlotControls({
  numericCols,
  categoricalCols,
  yField,
  xField,
  plotType,
  onYChange,
  onXChange,
  onPlotTypeChange,
}: QuickPlotControlsProps) {
  const chips = plotType ? chipsForPlotType(plotType) : [];
  const xOptions = [...numericCols, ...categoricalCols].sort();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-gray-500">Y axis (numeric)</span>
          <select
            aria-label="Y axis (numeric)"
            value={yField}
            onChange={(e) => onYChange(e.target.value)}
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
          <span className="text-gray-500">X axis (optional)</span>
          <select
            aria-label="X axis (optional)"
            value={xField}
            onChange={(e) => onXChange(e.target.value)}
            className="h-7 text-xs rounded border border-gray-300 bg-white px-2"
          >
            <option value="">— None —</option>
            {xOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {chips.length > 0 && (
        <div
          role="radiogroup"
          aria-label="Plot type"
          className="flex flex-wrap gap-1"
        >
          {chips.map((p) => {
            const isActive = p === plotType;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={CHIP_LABELS[p]}
                onClick={() => {
                  if (!isActive) onPlotTypeChange(p);
                }}
                className={
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ' +
                  (isActive
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400')
                }
              >
                {CHIP_LABELS[p]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
