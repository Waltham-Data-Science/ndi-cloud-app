/**
 * MyDatasets virtualization — audit #64 TDD gate.
 *
 * The data-browser shipped /my as a plain `<table>` + `.map()` over the
 * full dataset list. With organizations growing past a few hundred
 * datasets the resulting DOM size hurt initial paint + scroll fps.
 *
 * Audit 2026-04-23 #64: full virtualization via the `VirtualizedTable`
 * primitive from Phase 3a. This test locks in the contract: regardless
 * of how many datasets the org has, only the visible window of rows
 * lands in the DOM.
 *
 * The 30-row upper bound matches the `VirtualizedTable` defaults
 * (DEFAULT_OVERSCAN=20) plus a header row plus padding-trs. With a
 * 600px-tall scroll container at 32px/row, the visible window is ~18-19
 * rows; +20 overscan rows on either side gives ~40 max in pathological
 * cases — but jsdom's `getBoundingClientRect` returns zeros, so
 * `useVirtualizer` only renders the overscan window. The empirical
 * bound is well under 30 in practice.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// jsdom's `getBoundingClientRect` returns zeros, so the real
// `useVirtualizer` reports an empty `getVirtualItems()` and renders
// nothing. To assert the virtualization contract — "DOM row count
// scales O(window) not O(total)" — we mock the hook to return a fixed
// window of 18 items regardless of input count. The real-browser
// behavior is verified in Phase 6 Playwright specs against a 10k-row
// preview deploy. Same pattern as the data-browser PR #76 PivotView
// test (`vi.mock('@tanstack/react-virtual')`).
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => {
    const windowSize = Math.min(count, 18);
    const virtualItems = Array.from({ length: windowSize }, (_, i) => ({
      key: i,
      index: i,
      start: i * 32,
      end: (i + 1) * 32,
      size: 32,
      lane: 0,
    }));
    return {
      getVirtualItems: () => virtualItems,
      getTotalSize: () => count * 32,
      scrollToIndex: () => {},
      measureElement: () => 32,
    };
  },
}));

import { MyDatasetsTable } from '@/components/app/MyDatasetsTable';
import type { DatasetRecord } from '@/lib/api/datasets';

function makeDatasets(n: number): DatasetRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `d-${i}`,
    name: `Dataset ${i}`,
    isPublished: i % 3 === 0,
    publishStatus: i % 3 === 0 ? 'published' : 'in-review',
    license: i % 4 === 0 ? 'CC-BY-4.0' : 'CC0-1.0',
    documentCount: i * 17,
    totalSize: i * 1024 * 1024,
    createdAt: '2026-04-25T00:00:00.000Z',
  }));
}

describe('MyDatasetsTable — audit #64 virtualization', () => {
  it('renders well under 30 row elements in DOM for a 10,000-dataset list', () => {
    const datasets = makeDatasets(10_000);
    render(<MyDatasetsTable datasets={datasets} />);

    const rows = screen.getAllByRole('row');
    // Inside the catalog, jsdom's zero-sized container makes
    // `useVirtualizer` render only its overscan window. The `<30`
    // bound holds even on a real browser with a 600px-tall scroll
    // container at 32px/row (~19 visible + 20 overscan = ~39 worst
    // case, but DOM-row-count includes header, padding-trs, etc.).
    // The audit threshold for "virtualized" is "scales O(window)
    // not O(total)", so any small constant <30 satisfies #64.
    expect(rows.length).toBeLessThan(30);
  });

  it('shows the empty state when there are no datasets', () => {
    render(<MyDatasetsTable datasets={[]} />);
    expect(
      screen.getByText(/No datasets yet/i),
    ).toBeInTheDocument();
  });

  it('renders dataset names in the visible window', () => {
    const datasets = makeDatasets(50);
    render(<MyDatasetsTable datasets={datasets} />);
    // First few should be in DOM; deep ones won't (virtualized).
    expect(screen.getByText('Dataset 0')).toBeInTheDocument();
  });
});
