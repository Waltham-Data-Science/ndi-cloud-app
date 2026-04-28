/**
 * Viewer math primitives — extracted (CQ3) from the chart components
 * (`ViolinPlot.tsx`, `QuickPlot.tsx`, `TimeseriesChart.tsx`) so the
 * pure functions can be unit-tested in isolation. The components
 * re-import from here.
 *
 * Each function is a pure function over plain JS values — no React,
 * no DOM. Adding a new test file is the canonical change shape if a
 * regression sneaks in.
 *
 * Closes the testability gap flagged in synthesis §CQ3 / GH#45.
 */
import * as d3Array from 'd3-array';

// ---------------------------------------------------------------------------
// Kernel-density estimation (ViolinPlot)
// ---------------------------------------------------------------------------

/**
 * Gaussian kernel density estimator. Each value contributes a normal
 * bump centered at v with width = bandwidth; the result is the average
 * bump density at `nBins + 1` evenly spaced x positions across `extent`.
 *
 * The output is a probability density: integrating it over a sufficiently
 * wide extent gets close to 1.0.
 *
 * Ported from v1 (`ndi-data-browser-v2/frontend/src/components/ViolinPlot.tsx`)
 * with no math change — kept that way so visual regression tests against
 * the legacy chart still match pixel-for-pixel.
 */
export function kernelDensity(
  values: number[],
  bandwidth: number,
  extent: [number, number],
  nBins: number = 80,
): Array<[number, number]> {
  const [lo, hi] = extent;
  const step = (hi - lo) / nBins;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= nBins; i++) {
    const x = lo + i * step;
    let sum = 0;
    for (const v of values) {
      const u = (x - v) / bandwidth;
      sum += Math.exp(-0.5 * u * u) / (bandwidth * Math.sqrt(2 * Math.PI));
    }
    points.push([x, values.length === 0 ? 0 : sum / values.length]);
  }
  return points;
}

/**
 * Silverman's rule of thumb for KDE bandwidth selection:
 *   h = 0.9 * min(std, IQR/1.34) * n^(-1/5)
 *
 * Returns 1 as a safe fallback when n < 2 (insufficient data to
 * estimate spread). This matches the legacy chart's behavior — a
 * single-point group renders with bandwidth=1 instead of erroring.
 *
 * Reference: Silverman (1986), "Density Estimation for Statistics and
 * Data Analysis." The 1.34 divisor comes from the relationship between
 * IQR and σ for a Normal distribution: IQR_normal ≈ 1.349σ.
 */
export function silvermanBandwidth(values: number[]): number {
  const n = values.length;
  if (n < 2) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(n * 0.25)]!;
  const q3 = sorted[Math.floor(n * 0.75)]!;
  const iqr = q3 - q1;
  const std = Math.sqrt(d3Array.variance(values) ?? 1);
  return 0.9 * Math.min(std, iqr / 1.34) * Math.pow(n, -0.2);
}

// ---------------------------------------------------------------------------
// Histogram binning (Histogram chart)
// ---------------------------------------------------------------------------

export interface HistogramBin {
  /** Lower edge of the bin (inclusive). */
  x0: number;
  /** Upper edge of the bin (exclusive, except for the rightmost bin which is
   *  inclusive on both sides so the max value lands somewhere). */
  x1: number;
  /** Number of values that fell into this bin. */
  count: number;
}

/**
 * Histogram binning. Returns equal-width bins spanning [min, max] of the
 * input values, with a count per bin.
 *
 * - `binCount` is optional. When omitted, falls back to a Sturges-style
 *   estimate (`ceil(log2(n) + 1)`) clamped to [10, 50] — matching what
 *   d3.bin's default thresholder uses for "reasonable" bar counts on
 *   small-to-medium samples.
 * - Empty input → `[]`. Single distinct value → one synthetic bin of
 *   width 1 around the value (so the rendered bar has a non-zero base).
 * - The rightmost bin is inclusive on its upper edge so the max value
 *   doesn't fall off the end (standard histogram convention).
 *
 * Pure function — no React, no DOM. Tested in `tests/unit/lib/viewer/
 * math.test.ts` alongside `kernelDensity` / `silvermanBandwidth`.
 */
export function histogramBins(
  values: ReadonlyArray<number>,
  binCount?: number,
): HistogramBin[] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [];
  const min = d3Array.min(finite) ?? 0;
  const max = d3Array.max(finite) ?? 0;
  if (min === max) {
    // Degenerate: all values identical. Render a single bar of width 1
    // centered on the value so the histogram doesn't collapse to zero
    // width.
    return [{ x0: min - 0.5, x1: min + 0.5, count: finite.length }];
  }
  const nBins =
    binCount && binCount > 0
      ? Math.floor(binCount)
      : Math.min(50, Math.max(10, Math.ceil(Math.log2(finite.length) + 1)));
  const step = (max - min) / nBins;
  const bins: HistogramBin[] = Array.from({ length: nBins }, (_, i) => ({
    x0: min + i * step,
    x1: min + (i + 1) * step,
    count: 0,
  }));
  for (const v of finite) {
    let idx = Math.floor((v - min) / step);
    // Clamp the rightmost edge into the last bin (inclusive on upper edge).
    if (idx >= nBins) idx = nBins - 1;
    if (idx < 0) idx = 0;
    bins[idx]!.count++;
  }
  return bins;
}

// ---------------------------------------------------------------------------
// Column classification (QuickPlot)
// ---------------------------------------------------------------------------

interface ClassifiableTable {
  columns: ReadonlyArray<{ key: string }>;
  rows: ReadonlyArray<Record<string, unknown>>;
}

/**
 * Splits a table's columns into numeric vs categorical buckets.
 *
 * - **Numeric**: ≥70% of non-empty cells coerce to a finite number.
 *   Threshold tuned to forgive a small tail of free-text "N/A" /
 *   "n/a" / "?" cells in otherwise-clean numeric columns.
 * - **Categorical**: not numeric AND has ≤20 distinct non-numeric
 *   values. The cap rejects high-cardinality free text (notes,
 *   descriptions) that would render as a useless 200-bar bar chart.
 *
 * Columns with no non-empty cells are dropped from both lists — there's
 * no plot to render for an entirely missing column.
 */
export function classifyColumns(table: ClassifiableTable): {
  numericCols: string[];
  categoricalCols: string[];
} {
  const numericCols: string[] = [];
  const categoricalCols: string[] = [];
  const rows = table.rows;
  for (const col of table.columns) {
    const key = col.key;
    let numericHits = 0;
    let totalHits = 0;
    const distinct = new Set<string>();
    for (const row of rows) {
      const v = row[key];
      if (v === null || v === undefined || v === '') continue;
      totalHits++;
      const n = coerceNumber(v);
      if (Number.isFinite(n)) {
        numericHits++;
      } else {
        distinct.add(String(v));
      }
    }
    if (totalHits === 0) continue;
    const numericRatio = numericHits / totalHits;
    if (numericRatio >= 0.7) {
      numericCols.push(key);
    } else if (distinct.size > 0 && distinct.size <= 20) {
      categoricalCols.push(key);
    }
  }
  return { numericCols, categoricalCols };
}

/**
 * Best-effort numeric coercion. Used by `classifyColumns` to decide
 * whether a cell is plottable as a number.
 *
 * Recurses into the cloud-side `{ devTime: number }` time wrapper —
 * NDI cloud documents wrap time fields this way, and we want them to
 * be plottable like naked numbers.
 *
 * Returns NaN for anything else (so `Number.isFinite` rejects them).
 */
export function coerceNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  if (v && typeof v === 'object' && 'devTime' in (v as Record<string, unknown>)) {
    return coerceNumber((v as Record<string, unknown>).devTime);
  }
  return NaN;
}

// ---------------------------------------------------------------------------
// uPlot sweep detection (TimeseriesChart)
// ---------------------------------------------------------------------------

/**
 * Splits a flat time-series buffer into per-sweep arrays based on
 * null-gap boundaries.
 *
 * A "sweep" is a run of consecutive non-null values; null entries are
 * the boundaries between sweeps. The function rejects:
 *
 * - Inputs shorter than 10 values (no usable structure).
 * - Inputs with fewer than 3 nulls (probably a single sweep with a
 *   couple of dropped samples — not a real multi-sweep recording).
 * - Sweeps shorter than 6 values (too short to plot meaningfully).
 * - Final result with fewer than 2 surviving sweeps.
 *
 * On success returns each sweep's values plus the per-sweep
 * peak |value| (used to color the sweeps by injected current in the
 * patch-clamp viewer).
 */
export function detectSweeps(
  values: ReadonlyArray<number | null | undefined>,
): { sweeps: Array<Array<number | null>>; sweepCurrents: number[] } | null {
  if (!values || values.length < 10) return null;
  let nullCount = 0;
  for (const v of values) if (v === null || v === undefined) nullCount++;
  if (nullCount < 3) return null;

  const sweeps: Array<Array<number | null>> = [];
  let current: Array<number | null> = [];
  for (const v of values) {
    if (v === null || v === undefined) {
      if (current.length > 5) sweeps.push(current);
      current = [];
    } else {
      current.push(v);
    }
  }
  if (current.length > 5) sweeps.push(current);
  if (sweeps.length < 2) return null;

  const sweepCurrents = sweeps.map((sweep) => {
    let maxAbs = 0;
    for (const v of sweep) {
      if (v !== null && v !== undefined) {
        const abs = Math.abs(v);
        if (abs > maxAbs) maxAbs = abs;
      }
    }
    return maxAbs;
  });
  return { sweeps, sweepCurrents };
}
