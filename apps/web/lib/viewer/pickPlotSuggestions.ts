import type { PlotType } from './inferPlotShape';

export interface PlotSuggestion {
  plotType: PlotType;
  /** Numeric column for the Y axis. Empty string when the plot doesn't use a Y (bar-count). */
  yField: string;
  /** X axis column. Empty string when the plot doesn't use an X (histogram). */
  xField: string;
}

export interface SuggestionsResult {
  primary: PlotSuggestion | null;
  secondary: PlotSuggestion[];
}

/**
 * Deterministic empty-state default + alternative chips.
 *
 * Walks the priority list from the spec, building one candidate per
 * matched case:
 *
 *   1. ≥1 numeric col + a groupable categorical (2-8 uniques) → violin
 *   2. ≥2 numeric cols                                        → scatter
 *   3. ≥1 numeric col                                          → histogram
 *   4. a countable categorical (2-20 uniques)                 → bar-count
 *   5. otherwise                                              → null primary
 *
 * The first matching case is `primary` (auto-applied on Quick Plot
 * open); the next two become `secondary` chips.
 *
 * Two cardinality buckets defend against the high-cardinality-identifier
 * trap: a column like "Subject Doc ID" with 5,314 unique values would
 * produce a useless 5,314-bar hairbrush, so it must not slip into a bar
 * suggestion. `groupableCat` is tighter (≤8) because violins are
 * unreadable past that; `countableCat` is looser (≤20) because bars
 * tolerate more groups. If neither matches, fall through to null rather
 * than emit a degenerate plot.
 */
export function pickPlotSuggestions(
  table: { rows: ReadonlyArray<Record<string, unknown>> },
  numericCols: ReadonlyArray<string>,
  categoricalCols: ReadonlyArray<string>,
): SuggestionsResult {
  const uniqueCount = (col: string): number => {
    const seen = new Set<string>();
    for (const row of table.rows) {
      const v = row[col];
      if (v === null || v === undefined || v === '') continue;
      seen.add(String(v));
    }
    return seen.size;
  };

  const groupableCats = categoricalCols.filter((c) => {
    const n = uniqueCount(c);
    return n >= 2 && n <= 8;
  });
  const countableCats = categoricalCols.filter((c) => {
    const n = uniqueCount(c);
    return n >= 2 && n <= 20;
  });

  const candidates: PlotSuggestion[] = [];

  if (numericCols.length >= 1 && groupableCats.length >= 1) {
    candidates.push({
      plotType: 'violin',
      yField: numericCols[0]!,
      xField: groupableCats[0]!,
    });
  }
  if (numericCols.length >= 2) {
    candidates.push({
      plotType: 'scatter',
      yField: numericCols[1]!,
      xField: numericCols[0]!,
    });
  }
  if (numericCols.length >= 1) {
    candidates.push({
      plotType: 'histogram',
      yField: numericCols[0]!,
      xField: '',
    });
  }
  if (countableCats.length >= 1) {
    candidates.push({
      plotType: 'bar-count',
      yField: '',
      xField: countableCats[0]!,
    });
  }

  if (candidates.length === 0) {
    return { primary: null, secondary: [] };
  }

  return {
    primary: candidates[0]!,
    secondary: candidates.slice(1, 3),
  };
}
