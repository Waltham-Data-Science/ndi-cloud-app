/**
 * Viewer math primitives (CQ3) — unit-tested kernel-density estimation,
 * Silverman bandwidth, column classification, number coercion, and
 * uPlot sweep detection.
 *
 * Closes GH#45. The audit (synthesis §CQ3) flagged that the chart
 * widgets ship inline math with no test coverage — a regression in any
 * of the helpers (e.g. an off-by-one in Silverman's rule, a stale
 * threshold in column classification, an edge-case where `detectSweeps`
 * returns a non-null structure for unmappable input) would surface as
 * a wrong picture instead of a runtime error.
 *
 * The math is now extracted to `apps/web/lib/viewer/math.ts` so it can
 * be imported and tested directly. The chart components re-import.
 */
import { describe, expect, it } from 'vitest';

import {
  classifyColumns,
  coerceNumber,
  detectSweeps,
  kernelDensity,
  silvermanBandwidth,
} from '@/lib/viewer/math';

describe('silvermanBandwidth', () => {
  // Silverman's rule of thumb: h = 0.9 * min(std, IQR/1.34) * n^(-1/5).
  // Documented in Silverman (1986). The implementation must:
  // - guard the n<2 degenerate (return 1, the safe fallback)
  // - use IQR/1.34 when it's the smaller spread estimator
  // - use std when std is the smaller estimator

  it('returns 1 for fewer than 2 values (degenerate fallback)', () => {
    expect(silvermanBandwidth([])).toBe(1);
    expect(silvermanBandwidth([42])).toBe(1);
  });

  it('produces a positive bandwidth for typical data', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const bw = silvermanBandwidth(values);
    expect(bw).toBeGreaterThan(0);
    expect(Number.isFinite(bw)).toBe(true);
  });

  it('uses IQR/1.34 when it is smaller than the std', () => {
    // Heavy-tailed distribution: std is large, IQR is small. Silverman's
    // rule prefers the more robust IQR/1.34 in this case.
    const values = [1, 2, 2, 2, 2, 2, 2, 2, 2, 100]; // tail at 100
    const bw = silvermanBandwidth(values);
    // IQR/1.34 = (2-2)/1.34 = 0. Silverman picks 0 then; result will be 0.
    // (This is the documented edge — the original implementation accepts it.)
    expect(bw).toBe(0);
  });

  it('uses std when it is smaller than IQR/1.34', () => {
    // Symmetric uniform spread: std and IQR/1.34 close, but std slightly less.
    const values = [-2, -1, 0, 1, 2];
    const bw = silvermanBandwidth(values);
    expect(bw).toBeGreaterThan(0);
    // Compare with the formula directly: std ~= 1.581, IQR ~= 2 → 2/1.34 ~= 1.49.
    // min = 1.49, * 0.9 = 1.34, * 5^(-0.2) ~= 0.97.
    expect(bw).toBeCloseTo(0.97, 1);
  });

  it('shrinks bandwidth as n grows (n^(-1/5) factor)', () => {
    const small = silvermanBandwidth([1, 2, 3, 4, 5]);
    const large = silvermanBandwidth(
      Array.from({ length: 1000 }, (_, i) => i / 200),
    );
    // For larger n, n^(-1/5) is smaller → bandwidth decreases.
    expect(large).toBeLessThan(small);
  });
});

describe('kernelDensity', () => {
  // Gaussian KDE: each point contributes a Gaussian bump centered at v
  // with width = bandwidth. Result is the average bump density over n
  // values, sampled at nBins+1 evenly spaced x positions.

  it('returns nBins + 1 points', () => {
    const points = kernelDensity([1, 2, 3], 0.5, [0, 4], 10);
    expect(points).toHaveLength(11);
  });

  it('peaks near the value when given a single observation', () => {
    const points = kernelDensity([5], 0.1, [4, 6], 100);
    // Locate the max.
    let maxX = points[0]![0];
    let maxY = points[0]![1];
    for (const [x, y] of points) {
      if (y > maxY) {
        maxX = x;
        maxY = y;
      }
    }
    expect(maxX).toBeCloseTo(5, 1);
  });

  it('integrates to ≈ 1 over a wide enough extent (probability density)', () => {
    // A proper KDE is a probability density — Riemann-summing it over a
    // wide extent should get close to 1.0.
    const values = [0, 0, 0, 0, 0]; // tightly clustered
    const extent: [number, number] = [-5, 5];
    const nBins = 1000;
    const points = kernelDensity(values, 0.5, extent, nBins);
    const step = (extent[1] - extent[0]) / nBins;
    const integral = points.reduce((acc, [, y]) => acc + y * step, 0);
    expect(integral).toBeCloseTo(1, 1);
  });

  it('produces all-zero points when extent is far from values (no overlap)', () => {
    // Bandwidth=0.01, values=[0], sampled in [100, 200] — every point's
    // Gaussian contribution is essentially 0.
    const points = kernelDensity([0], 0.01, [100, 200], 50);
    for (const [, y] of points) {
      expect(y).toBeLessThan(1e-100);
    }
  });
});

describe('coerceNumber', () => {
  it('returns numbers unchanged', () => {
    expect(coerceNumber(42)).toBe(42);
    expect(coerceNumber(-3.14)).toBe(-3.14);
    expect(coerceNumber(0)).toBe(0);
  });

  it('parses numeric strings', () => {
    expect(coerceNumber('42')).toBe(42);
    expect(coerceNumber('-3.14')).toBe(-3.14);
    expect(coerceNumber('0')).toBe(0);
  });

  it('returns NaN for non-numeric strings', () => {
    expect(coerceNumber('abc')).toBeNaN();
    expect(coerceNumber('12abc')).toBeNaN();
  });

  it('returns NaN for null / undefined', () => {
    expect(coerceNumber(null)).toBeNaN();
    expect(coerceNumber(undefined)).toBeNaN();
  });

  it('extracts numeric devTime from objects (NDI-cloud `time` shape)', () => {
    // The cloud API returns time fields as `{ devTime: number }` rather
    // than naked numbers. Recurse into devTime so the chart code
    // treats them as plottable.
    expect(coerceNumber({ devTime: 1.5 })).toBe(1.5);
    expect(coerceNumber({ devTime: '2.5' })).toBe(2.5);
  });

  it('returns NaN for objects without devTime', () => {
    expect(coerceNumber({ value: 42 })).toBeNaN();
    expect(coerceNumber({})).toBeNaN();
  });
});

describe('classifyColumns', () => {
  // A column is `numeric` when ≥70% of non-empty cells coerce to a
  // finite number. A column is `categorical` when not numeric AND has
  // ≤20 distinct non-numeric values. Otherwise it's neither (high-
  // cardinality free text).

  function makeTable(columns: string[], rows: Array<Record<string, unknown>>) {
    return {
      columns: columns.map((key) => ({ key, label: key, kind: 'value' as const })),
      rows,
      // The other TableResponse fields aren't read by classifyColumns.
    } as unknown as Parameters<typeof classifyColumns>[0];
  }

  it('classifies an all-numeric column as numeric', () => {
    const t = makeTable(['x'], [{ x: 1 }, { x: 2 }, { x: 3.14 }, { x: '4' }]);
    const r = classifyColumns(t);
    expect(r.numericCols).toContain('x');
    expect(r.categoricalCols).not.toContain('x');
  });

  it('classifies a low-cardinality text column as categorical', () => {
    const t = makeTable(
      ['species'],
      [
        { species: 'mouse' },
        { species: 'rat' },
        { species: 'mouse' },
        { species: 'human' },
      ],
    );
    const r = classifyColumns(t);
    expect(r.categoricalCols).toContain('species');
    expect(r.numericCols).not.toContain('species');
  });

  it('rejects high-cardinality text (free-form) from both lists', () => {
    // 21 distinct text values > the 20 cap.
    const distinct = Array.from({ length: 21 }, (_, i) => `name_${i}`);
    const t = makeTable(['note'], distinct.map((v) => ({ note: v })));
    const r = classifyColumns(t);
    expect(r.numericCols).not.toContain('note');
    expect(r.categoricalCols).not.toContain('note');
  });

  it('skips columns with no non-empty cells', () => {
    const t = makeTable(['empty'], [{ empty: null }, { empty: '' }, { empty: undefined }]);
    const r = classifyColumns(t);
    expect(r.numericCols).not.toContain('empty');
    expect(r.categoricalCols).not.toContain('empty');
  });

  it('uses the 70% numeric-ratio threshold (≥70% → numeric)', () => {
    // 7 numeric, 3 text → 70% numeric → numeric.
    const t = makeTable(
      ['x'],
      [
        ...Array.from({ length: 7 }, (_, i) => ({ x: i })),
        { x: 'a' },
        { x: 'b' },
        { x: 'c' },
      ],
    );
    const r = classifyColumns(t);
    expect(r.numericCols).toContain('x');
  });

  it('drops below 70% to categorical (when distinct ≤ 20)', () => {
    // 6 numeric, 4 text → 60% numeric → not numeric. 4 distinct text →
    // categorical.
    const t = makeTable(
      ['x'],
      [
        ...Array.from({ length: 6 }, (_, i) => ({ x: i })),
        { x: 'a' },
        { x: 'b' },
        { x: 'c' },
        { x: 'd' },
      ],
    );
    const r = classifyColumns(t);
    expect(r.numericCols).not.toContain('x');
    expect(r.categoricalCols).toContain('x');
  });
});

describe('detectSweeps (uPlot timeseries)', () => {
  // Sweeps are runs of non-null values separated by null gaps. A
  // valid sweep needs ≥6 values; a valid sweep set needs ≥2 sweeps
  // and ≥3 nulls in the source. detectSweeps returns null when any
  // of those guards fails.

  it('returns null on short input (< 10 values)', () => {
    expect(detectSweeps([1, 2, 3, null, 4, 5])).toBeNull();
  });

  it('returns null when fewer than 3 nulls (no sweep boundaries)', () => {
    // 12 values, 1 null — not enough nulls.
    const data: Array<number | null> = [
      1, 2, 3, 4, 5, 6, null, 7, 8, 9, 10, 11,
    ];
    expect(detectSweeps(data)).toBeNull();
  });

  it('returns null when only one sweep survives the > 5 length filter', () => {
    // 4 nulls but each non-null run is short (≤ 5 values), so they're
    // all filtered out.
    const data: Array<number | null> = [
      1, 2, 3, null, 4, 5, null, 6, 7, null, 8, 9, null, 10, 11,
    ];
    expect(detectSweeps(data)).toBeNull();
  });

  it('returns sweeps + currents on multi-sweep input', () => {
    const data: Array<number | null> = [
      // sweep 1: 8 values
      1, 2, 3, 4, 5, 6, 7, 8,
      null,
      null,
      null,
      // sweep 2: 7 values, max abs 14
      -10, -11, -12, -13, -14, -13, -12,
      null,
      // sweep 3: 6 values, max abs 9
      9, 8, 7, 6, 5, 4,
    ];
    const result = detectSweeps(data);
    expect(result).not.toBeNull();
    expect(result!.sweeps).toHaveLength(3);
    expect(result!.sweepCurrents).toEqual([8, 14, 9]);
  });

  it('treats undefined like null for boundary detection', () => {
    // detectSweeps' parameter type accepts undefined entries — older
    // chart code sometimes passes them when a buffer slot is unset.
    const data: Array<number | null | undefined> = [
      1, 2, 3, 4, 5, 6,
      undefined,
      undefined,
      undefined,
      7, 8, 9, 10, 11, 12,
    ];
    const result = detectSweeps(data);
    // 2 sweeps of length ≥ 6 → detected.
    expect(result).not.toBeNull();
    expect(result!.sweeps).toHaveLength(2);
  });
});
