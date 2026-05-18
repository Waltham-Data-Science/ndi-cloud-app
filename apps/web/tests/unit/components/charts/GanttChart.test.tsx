/**
 * GanttChart — verifies subject deduplication, color assignment,
 * legend collapse (one entry per treatment), Y-axis ordering,
 * empty-state, and per-bar trace shape. PlotlyMount is mocked so we
 * inspect the data/layout it receives without dragging Plotly's UMD
 * bundle through jsdom.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Capture the props PlotlyMount receives so tests can introspect the
// generated traces + layout. Stash both the call array and the mock
// component in a vi.hoisted block so vi.mock factories below (which
// also get hoisted by Vitest) can reference them safely.
const { plotlyCalls, PlotlyMountMock } = vi.hoisted(() => {
  const calls: Array<{ data: unknown[]; layout: Record<string, unknown> }> = [];
  const Mock = (props: { data: unknown[]; layout: Record<string, unknown> }) => {
    calls.push({ data: props.data, layout: props.layout });
    return (
      <div data-testid="plotly-mount" data-trace-count={props.data.length} />
    );
  };
  return { plotlyCalls: calls, PlotlyMountMock: Mock };
});

// Mock the PlotlyMount module so any direct import resolves to the mock.
vi.mock('@/components/ndi/charts/PlotlyMount', () => ({
  PlotlyMount: PlotlyMountMock,
}));

// `next/dynamic` returns the loader's module wrapped in a Suspense-y
// component in real Next; under vitest we sidestep the loading state
// entirely by having dynamic() return the mocked PlotlyMount directly.
// This also avoids the ESM/CJS interop hoops that real dynamic() does.
vi.mock('next/dynamic', () => ({
  default: () => PlotlyMountMock,
}));

import { GanttChart, type GanttChartItem } from '@/components/ndi/charts/GanttChart';

describe('GanttChart', () => {
  afterEach(() => {
    plotlyCalls.length = 0;
    vi.clearAllMocks();
  });

  it('renders an empty state when items array is empty', () => {
    render(<GanttChart datasetId="ds1" items={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      /No treatment-timeline data/,
    );
    expect(screen.queryByTestId('plotly-mount')).not.toBeInTheDocument();
  });

  it('renders the configured title in the caption', () => {
    render(
      <GanttChart datasetId="ds1" title="My timeline" items={sampleItems()} />,
    );
    expect(screen.getByText('My timeline')).toBeInTheDocument();
  });

  it('falls back to "Treatment timeline" when no title is provided', () => {
    render(<GanttChart datasetId="ds1" items={sampleItems()} />);
    expect(screen.getByText('Treatment timeline')).toBeInTheDocument();
  });

  it('deduplicates subjects on the Y-axis (3 bars across 2 subjects → 2 rows)', () => {
    render(
      <GanttChart
        datasetId="ds1"
        items={[
          { subject: 'A', treatment: 'Saline', start: 0, end: 1 },
          { subject: 'A', treatment: 'CNO', start: 1, end: 2 },
          { subject: 'B', treatment: 'Saline', start: 0, end: 1 },
        ]}
      />,
    );
    expect(screen.getByText('2 subjects')).toBeInTheDocument();
    expect(screen.getByText('3 treatment bars')).toBeInTheDocument();
    expect(plotlyCalls).toHaveLength(1);
    const { layout } = plotlyCalls[0]!;
    expect(layout.yaxis).toMatchObject({
      type: 'category',
      categoryarray: ['A', 'B'],
    });
  });

  it('emits one Plotly trace per item with line.width=16 and start/end on x', () => {
    render(
      <GanttChart
        datasetId="ds1"
        items={[
          { subject: 'A', treatment: 'Saline', start: 0, end: 1 },
          { subject: 'A', treatment: 'CNO', start: 1, end: 2 },
        ]}
      />,
    );
    const { data } = plotlyCalls[0]!;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      type: 'scatter',
      mode: 'lines',
      x: [0, 1],
      y: ['A', 'A'],
      line: { width: 16 },
      name: 'Saline',
    });
    expect(data[1]).toMatchObject({
      x: [1, 2],
      y: ['A', 'A'],
      name: 'CNO',
    });
  });

  it('assigns the same color to repeats of the same treatment (PALETTE per-treatment, not per-bar)', () => {
    render(
      <GanttChart
        datasetId="ds1"
        items={[
          { subject: 'A', treatment: 'Saline', start: 0, end: 1 },
          { subject: 'B', treatment: 'Saline', start: 0, end: 1 },
          { subject: 'A', treatment: 'CNO', start: 1, end: 2 },
        ]}
      />,
    );
    const { data } = plotlyCalls[0]!;
    const colorOf = (i: number) =>
      (data[i] as { line?: { color?: string } }).line?.color;
    expect(colorOf(0)).toBe(colorOf(1)); // both Saline → same color
    expect(colorOf(2)).not.toBe(colorOf(0)); // CNO → different
  });

  it('honors explicit per-item color overrides', () => {
    render(
      <GanttChart
        datasetId="ds1"
        items={[
          {
            subject: 'A',
            treatment: 'Custom',
            start: 0,
            end: 1,
            color: '#ff00aa',
          },
        ]}
      />,
    );
    const { data } = plotlyCalls[0]!;
    expect((data[0] as { line: { color: string } }).line.color).toBe('#ff00aa');
  });

  it('shows the legend only once per distinct treatment (collapses duplicates)', () => {
    render(
      <GanttChart
        datasetId="ds1"
        items={[
          { subject: 'A', treatment: 'Saline', start: 0, end: 1 },
          { subject: 'B', treatment: 'Saline', start: 0, end: 1 },
          { subject: 'A', treatment: 'CNO', start: 1, end: 2 },
        ]}
      />,
    );
    const { data } = plotlyCalls[0]!;
    // Only the first bar of each treatment surfaces in the legend.
    const showLegendFlags = data.map(
      (t) => (t as { showlegend?: boolean }).showlegend,
    );
    expect(showLegendFlags).toEqual([true, false, true]);
  });

  it('renders a citation link to the dataset overview', () => {
    render(<GanttChart datasetId="ds-xyz" items={sampleItems()} />);
    const link = screen.getByText(/View source document/) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/datasets/ds-xyz/overview');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('clamps chart height by subject count', () => {
    // 1 subject — minimum height
    render(
      <GanttChart
        datasetId="ds1"
        items={[{ subject: 'A', treatment: 'X', start: 0, end: 1 }]}
      />,
    );
    expect(plotlyCalls[0]!.layout.height).toBe(240);
    plotlyCalls.length = 0;

    // 100 subjects — capped at 800
    const items = Array.from({ length: 100 }, (_, i) => ({
      subject: `S${i}`,
      treatment: 'X',
      start: 0,
      end: 1,
    }));
    render(<GanttChart datasetId="ds1" items={items} />);
    expect(plotlyCalls[0]!.layout.height).toBe(800);
  });

  it('passes xLabel through to layout.xaxis.title', () => {
    render(
      <GanttChart
        datasetId="ds1"
        xLabel="Days since baseline"
        items={sampleItems()}
      />,
    );
    expect(plotlyCalls[0]!.layout.xaxis).toMatchObject({
      title: { text: 'Days since baseline' },
    });
  });

  it('accepts ISO-date start/end strings (Plotly auto-detects date axis)', () => {
    const items: GanttChartItem[] = [
      {
        subject: 'A',
        treatment: 'Saline',
        start: '2024-03-15T09:00:00Z',
        end: '2024-03-16T09:00:00Z',
      },
    ];
    render(<GanttChart datasetId="ds1" items={items} />);
    const { data } = plotlyCalls[0]!;
    expect((data[0] as { x: unknown[] }).x).toEqual([
      '2024-03-15T09:00:00Z',
      '2024-03-16T09:00:00Z',
    ]);
  });
});

function sampleItems(): GanttChartItem[] {
  return [
    { subject: 'A', treatment: 'Saline', start: 0, end: 1 },
    { subject: 'A', treatment: 'CNO', start: 1, end: 2 },
  ];
}
