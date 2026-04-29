import { describe, expect, it } from 'vitest';

import { pickPlotSuggestions } from '@/lib/viewer/pickPlotSuggestions';

function makeTable(rows: Array<Record<string, unknown>>) {
  return { rows };
}

describe('pickPlotSuggestions', () => {
  it('returns null primary when the table has nothing plottable', () => {
    const result = pickPlotSuggestions(makeTable([]), [], []);
    expect(result).toEqual({ primary: null, secondary: [] });
  });

  it('returns null when only categoricals are present and they are all single-value (degenerate)', () => {
    const table = makeTable([
      { onlyValue: 'X' },
      { onlyValue: 'X' },
      { onlyValue: 'X' },
    ]);
    // 'onlyValue' has 1 unique value — not groupable, not countable (need ≥ 2).
    const result = pickPlotSuggestions(table, [], ['onlyValue']);
    expect(result.primary).toBeNull();
  });

  it('picks histogram when only one numeric column is available', () => {
    const table = makeTable([
      { latency: 10 },
      { latency: 12 },
      { latency: 15 },
    ]);
    const result = pickPlotSuggestions(table, ['latency'], []);
    expect(result.primary).toEqual({
      plotType: 'histogram',
      yField: 'latency',
      xField: '',
    });
    expect(result.secondary).toEqual([]);
  });

  it('picks violin when a numeric col + a groupable categorical (≤8 uniques) are available', () => {
    const table = makeTable([
      { latency: 10, strain: 'WT' },
      { latency: 12, strain: 'KO' },
      { latency: 15, strain: 'WT' },
      { latency: 20, strain: 'KO' },
    ]);
    const result = pickPlotSuggestions(table, ['latency'], ['strain']);
    expect(result.primary).toEqual({
      plotType: 'violin',
      yField: 'latency',
      xField: 'strain',
    });
    // Secondary: histogram (case 3) and bar-count (case 4 — strain is also
    // a countable categorical with 2 uniques). Both are below the 2-cap.
    expect(result.secondary).toEqual([
      { plotType: 'histogram', yField: 'latency', xField: '' },
      { plotType: 'bar-count', yField: '', xField: 'strain' },
    ]);
  });

  it('picks scatter (priority 2) when two numerics are present but no groupable categorical', () => {
    const table = makeTable([
      { age: 5, latency: 10 },
      { age: 6, latency: 12 },
    ]);
    const result = pickPlotSuggestions(table, ['age', 'latency'], []);
    expect(result.primary).toEqual({
      plotType: 'scatter',
      yField: 'latency',
      xField: 'age',
    });
    expect(result.secondary).toEqual([
      { plotType: 'histogram', yField: 'age', xField: '' },
    ]);
  });

  it('returns full priority chain (violin, scatter, histogram) as primary + 2 secondary', () => {
    const table = makeTable([
      { age: 5, latency: 10, strain: 'WT' },
      { age: 6, latency: 12, strain: 'KO' },
      { age: 7, latency: 15, strain: 'WT' },
    ]);
    const result = pickPlotSuggestions(
      table,
      ['age', 'latency'],
      ['strain'],
    );
    expect(result.primary).toEqual({
      plotType: 'violin',
      yField: 'age',
      xField: 'strain',
    });
    expect(result.secondary).toEqual([
      { plotType: 'scatter', yField: 'latency', xField: 'age' },
      { plotType: 'histogram', yField: 'age', xField: '' },
    ]);
    // secondary capped at 2 — bar-count is dropped despite being available
    expect(result.secondary).toHaveLength(2);
  });

  it('falls through to bar-count when no numeric columns are available', () => {
    const table = makeTable([
      { strain: 'WT' },
      { strain: 'KO' },
      { strain: 'WT' },
    ]);
    const result = pickPlotSuggestions(table, [], ['strain']);
    expect(result.primary).toEqual({
      plotType: 'bar-count',
      yField: '',
      xField: 'strain',
    });
  });

  it('treats a categorical with exactly 8 uniques as groupable (violin)', () => {
    const rows = Array.from({ length: 16 }, (_, i) => ({
      latency: i,
      strain: `s${i % 8}`, // 8 unique strain values
    }));
    const result = pickPlotSuggestions(makeTable(rows), ['latency'], ['strain']);
    expect(result.primary?.plotType).toBe('violin');
  });

  it('treats a categorical with 9 uniques as countable but NOT groupable', () => {
    // 9 strain values: violin not picked (groupable cap is 8), but
    // bar-count is still allowed (countable cap is 20). Without numeric
    // cols, primary becomes bar-count.
    const rows = Array.from({ length: 18 }, (_, i) => ({
      strain: `s${i % 9}`,
    }));
    const result = pickPlotSuggestions(makeTable(rows), [], ['strain']);
    expect(result.primary?.plotType).toBe('bar-count');
  });

  it('treats a categorical with 21 uniques as neither groupable nor countable', () => {
    // 21 unique values: violin and bar-count both rejected. With no
    // numeric cols, primary is null.
    const rows = Array.from({ length: 42 }, (_, i) => ({
      identifier: `id${i % 21}`,
    }));
    const result = pickPlotSuggestions(makeTable(rows), [], ['identifier']);
    expect(result.primary).toBeNull();
  });

  it('skips empty/null cells when counting unique values', () => {
    // Strain has 2 real uniques + a row with empty string + a row with
    // null. Empty/null shouldn't count toward the cardinality bucket.
    const table = makeTable([
      { latency: 10, strain: 'WT' },
      { latency: 12, strain: '' },
      { latency: 15, strain: null },
      { latency: 20, strain: 'KO' },
    ]);
    const result = pickPlotSuggestions(table, ['latency'], ['strain']);
    expect(result.primary?.plotType).toBe('violin');
  });

  it('defends against high-cardinality identifier columns slipping into bar suggestions', () => {
    // A 5314-unique "Subject Doc ID" type column should never produce a
    // bar-count suggestion — even if classifyColumns mistakenly let it
    // through. This is the spec's hairbrush guard.
    const rows = Array.from({ length: 5314 }, (_, i) => ({
      docId: `doc-${i}`,
    }));
    const result = pickPlotSuggestions(makeTable(rows), [], ['docId']);
    expect(result.primary).toBeNull();
  });
});
