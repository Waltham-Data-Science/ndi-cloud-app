import { coerceNumber } from './math';

export type PlotType =
  | 'histogram'
  | 'violin'
  | 'box'
  | 'scatter'
  | 'line'
  | 'bar-count';

export type DispatchMode =
  | 'distribution-grouped'
  | 'distribution-ungrouped'
  | 'in-memory';

export interface InferPlotShapeArgs {
  yField: string;
  xField: string;
  numericCols: ReadonlyArray<string>;
  categoricalCols: ReadonlyArray<string>;
  table: { rows: ReadonlyArray<Record<string, unknown>> };
}

export interface InferenceResult {
  plotType: PlotType;
  dispatchMode: DispatchMode;
}

const TIME_LIKE_NAME =
  /^(time|t|epoch|trial|frame|timestamp|sec|seconds|ms)$/i;

/**
 * Pure inference: given the user's column picks plus the table's column
 * type buckets, return the canonical default plot shape and the dispatch
 * mode (server-aggregated /distribution endpoint vs. in-memory render).
 *
 * Returns null when the inputs don't form a renderable plot — the caller
 * (QuickPlot) is then responsible for showing the empty state or falling
 * back to a suggested default.
 *
 * The branch table mirrors the spec's Inference rules:
 *
 *   Y empty, X empty                  → null
 *   Y empty, X categorical            → bar-count (count rows per group)
 *   Y empty, X numeric                → null   (no useful default)
 *   Y numeric, X empty                → histogram (ungrouped distribution)
 *   Y numeric, X categorical          → violin  (grouped distribution)
 *   Y numeric, X numeric, time-shaped → line    (in-memory)
 *   Y numeric, X numeric, other       → scatter (in-memory)
 *
 * "Time-shaped" = column name matches `/^(time|t|epoch|trial|frame|
 * timestamp|sec|seconds|ms)$/i` AND the X values are monotonically
 * non-decreasing across `table.rows` (skipping nulls). Both conditions
 * must hold; either alone falls through to scatter.
 */
export function inferPlotShape(
  args: InferPlotShapeArgs,
): InferenceResult | null {
  const { yField, xField, numericCols, categoricalCols, table } = args;

  const yIsNumeric = !!yField && numericCols.includes(yField);
  const xIsNumeric = !!xField && numericCols.includes(xField);
  const xIsCategorical = !!xField && categoricalCols.includes(xField);

  if (!yIsNumeric) {
    if (xIsCategorical) {
      return { plotType: 'bar-count', dispatchMode: 'in-memory' };
    }
    return null;
  }

  if (!xField) {
    return { plotType: 'histogram', dispatchMode: 'distribution-ungrouped' };
  }

  if (xIsCategorical) {
    return { plotType: 'violin', dispatchMode: 'distribution-grouped' };
  }

  if (xIsNumeric) {
    if (isTimeShaped(xField, table)) {
      return { plotType: 'line', dispatchMode: 'in-memory' };
    }
    return { plotType: 'scatter', dispatchMode: 'in-memory' };
  }

  return null;
}

function isTimeShaped(
  xField: string,
  table: { rows: ReadonlyArray<Record<string, unknown>> },
): boolean {
  if (!TIME_LIKE_NAME.test(xField)) return false;
  let prev = -Infinity;
  for (const row of table.rows) {
    const v = coerceNumber(row[xField]);
    if (!Number.isFinite(v)) continue;
    if (v < prev) return false;
    prev = v;
  }
  return true;
}
