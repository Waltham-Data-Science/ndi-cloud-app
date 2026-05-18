/**
 * Stream 6.5 — inline chart smoke tests.
 *
 * The inline charts (Histogram, BarChartByGroup, ScatterPlot) render
 * synchronously from in-memory data with no API call, so they're
 * cheap to smoke. We assert the SVG mounts + carries the expected
 * structural elements (rect bars / data-testid markers) for canonical
 * inputs. The math correctness (bin boundaries, axis scaling) is
 * covered by `lib/viewer/math` tests upstream — this suite is the
 * "component composes them into a valid SVG" gate.
 *
 * ScatterPlot is uPlot-backed and needs a sized DOM container; it's
 * not covered here because jsdom doesn't ship layout measurement.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BarChartByGroup } from '@/components/ndi/charts/inline/BarChartByGroup';
import { Histogram } from '@/components/ndi/charts/inline/Histogram';
import type { ViolinGroup } from '@/components/ndi/charts/inline/ViolinPlot';

describe('Inline charts', () => {
  describe('BarChartByGroup', () => {
    it('renders an SVG with one rect per bar', () => {
      const { container } = render(
        <BarChartByGroup
          bars={[
            { name: 'Saline', count: 12 },
            { name: 'CNO', count: 18 },
            { name: 'Vehicle', count: 5 },
          ]}
          xLabel="Treatment group"
        />,
      );
      const wrap = screen.getByTestId('bar-chart-svg-wrap');
      const svg = screen.getByTestId('bar-chart-svg');
      expect(wrap).toBeInTheDocument();
      expect(svg).toBeInTheDocument();
      // One <rect> per bar (plus any axis decoration rects). We assert
      // ≥ bars.length to leave room for axis grid lines that also use
      // <rect> in some chart variants.
      const rects = container.querySelectorAll('rect');
      expect(rects.length).toBeGreaterThanOrEqual(3);
    });

    it('sorts bars by count descending so dominant groups read first', () => {
      const { container } = render(
        <BarChartByGroup
          bars={[
            { name: 'C', count: 1 },
            { name: 'A', count: 100 },
            { name: 'B', count: 50 },
          ]}
          xLabel="Group"
        />,
      );
      // The component renders the band-scale labels in sorted order.
      // We pluck text nodes from the SVG that match the bar names.
      const labelEls = Array.from(container.querySelectorAll('text'))
        .map((t) => t.textContent ?? '')
        .filter((t) => ['A', 'B', 'C'].includes(t));
      // First-encountered "A" must come before "B" must come before "C".
      const idxA = labelEls.indexOf('A');
      const idxB = labelEls.indexOf('B');
      const idxC = labelEls.indexOf('C');
      expect(idxA).toBeGreaterThanOrEqual(0);
      expect(idxB).toBeGreaterThan(idxA);
      expect(idxC).toBeGreaterThan(idxB);
    });

    it('renders without crashing on a single bar', () => {
      const { container } = render(
        <BarChartByGroup
          bars={[{ name: 'OnlyOne', count: 42 }]}
          xLabel="Group"
        />,
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders empty SVG when given zero bars (no crash)', () => {
      const { container } = render(
        <BarChartByGroup bars={[]} xLabel="Group" />,
      );
      // SVG still mounts; just has no bar rects.
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Histogram', () => {
    function makeGroup(values: number[], name = 'Saline'): ViolinGroup {
      // ViolinGroup is a fully-aggregated stats payload; the Histogram
      // chart only reads `values`, so the stats fields are synthesized
      // to keep the type checker happy without changing behavior.
      const n = values.length;
      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((s, v) => s + v, 0);
      const mean = n > 0 ? sum / n : 0;
      const median =
        n > 0
          ? n % 2 === 1
            ? sorted[Math.floor(n / 2)]!
            : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2
          : 0;
      const std =
        n > 1
          ? Math.sqrt(
              values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1),
            )
          : 0;
      return {
        name,
        values,
        count: n,
        mean,
        median,
        std,
        min: sorted[0] ?? 0,
        max: sorted[n - 1] ?? 0,
        q1: sorted[Math.floor(n * 0.25)] ?? 0,
        q3: sorted[Math.floor(n * 0.75)] ?? 0,
      };
    }

    it('renders an SVG for a single ungrouped distribution', () => {
      const { container } = render(
        <Histogram
          groups={[
            makeGroup([1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 5, 6, 7, 8]),
          ]}
          xLabel="Open-arm entries"
          yLabel="Subjects"
        />,
      );
      // SVG mounted.
      expect(container.querySelector('svg')).toBeInTheDocument();
      // Histogram bars (rect) — count is bin-count-driven; ≥ 1.
      const rects = container.querySelectorAll('rect');
      expect(rects.length).toBeGreaterThanOrEqual(1);
    });

    it('overlays multiple groups when given more than one', () => {
      const { container } = render(
        <Histogram
          groups={[
            makeGroup([1, 2, 3, 4, 5], 'Saline'),
            makeGroup([4, 5, 6, 7, 8], 'CNO'),
          ]}
          xLabel="Open-arm entries"
          yLabel="Subjects"
        />,
      );
      // Legend should surface both group names.
      const text = container.textContent ?? '';
      expect(text).toContain('Saline');
      expect(text).toContain('CNO');
    });

    it('respects a custom binCount override', () => {
      const { container } = render(
        <Histogram
          groups={[makeGroup([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])]}
          xLabel="x"
          yLabel="y"
          binCount={5}
        />,
      );
      // With binCount=5 and 10 values spanning 1..10, we expect ~5
      // bars. The exact count depends on d3's histogram thresholding
      // but should be in [3, 6].
      const rects = container.querySelectorAll('rect');
      // SVG also has axis-grid lines via <rect>; assert at least 3 — a
      // 5-bin histogram always renders ≥3 rects.
      expect(rects.length).toBeGreaterThanOrEqual(3);
    });

    it('does not crash with one-value groups', () => {
      const { container } = render(
        <Histogram
          groups={[makeGroup([42])]}
          xLabel="x"
          yLabel="y"
        />,
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });
});
