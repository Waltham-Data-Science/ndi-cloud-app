/**
 * PsthChart — verifies trace shape for both meanRateHz + counts
 * fallback, the dashed onset-line shape at x=0 (the visual hallmark
 * of a PSTH), empty-state handling, caption text, aria-label, and
 * citation link wiring. PlotlyMount is mocked so we can inspect
 * data/layout without dragging Plotly's UMD bundle through jsdom.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

vi.mock('@/components/ndi/charts/PlotlyMount', () => ({
  PlotlyMount: PlotlyMountMock,
}));

vi.mock('next/dynamic', () => ({
  default: () => PlotlyMountMock,
}));

import { PsthChart } from '@/components/ndi/charts/PsthChart';

describe('PsthChart', () => {
  afterEach(() => {
    plotlyCalls.length = 0;
    vi.clearAllMocks();
  });

  const BASE_PROPS = {
    datasetId: 'dataset123',
    binCenters: [-0.4, -0.2, 0, 0.2, 0.4],
    meanRateHz: [4, 8, 16, 24, 12],
    counts: [2, 4, 8, 12, 6],
    binSizeMs: 200,
    t0: -0.5,
    t1: 0.5,
  };

  it('renders an empty state when binCenters is empty', () => {
    render(
      <PsthChart {...BASE_PROPS} binCenters={[]} meanRateHz={[]} counts={[]} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/no psth data/i);
    expect(screen.queryByTestId('plotly-mount')).not.toBeInTheDocument();
  });

  it('renders a Bar trace with meanRateHz when provided', () => {
    render(<PsthChart {...BASE_PROPS} />);

    expect(plotlyCalls).toHaveLength(1);
    const { data, layout } = plotlyCalls[0]!;
    expect(data).toHaveLength(1);
    const trace = data[0] as {
      type: string;
      x: number[];
      y: number[];
      width: number[];
    };
    expect(trace.type).toBe('bar');
    expect(trace.x).toEqual([-0.4, -0.2, 0, 0.2, 0.4]);
    expect(trace.y).toEqual([4, 8, 16, 24, 12]);
    // Bar width = binSizeMs / 1000 = 0.2 s.
    expect(trace.width[0]).toBeCloseTo(0.2, 6);

    // Y axis labeled "Firing rate (Hz)" when meanRateHz is the source.
    const yAxis = layout.yaxis as { title?: { text?: string } };
    expect(yAxis.title?.text).toBe('Firing rate (Hz)');
    const xAxis = layout.xaxis as { title?: { text?: string }; range?: number[] };
    expect(xAxis.title?.text).toBe('Time relative to stimulus (s)');
    expect(xAxis.range).toEqual([-0.5, 0.5]);
  });

  it('falls back to counts on the Y axis when meanRateHz is absent', () => {
    render(<PsthChart {...BASE_PROPS} meanRateHz={undefined} />);

    expect(plotlyCalls).toHaveLength(1);
    const { data, layout } = plotlyCalls[0]!;
    const trace = data[0] as { y: number[] };
    expect(trace.y).toEqual([2, 4, 8, 12, 6]);
    const yAxis = layout.yaxis as { title?: { text?: string } };
    expect(yAxis.title?.text).toBe('Spike count');
  });

  it('renders the dashed vertical line at x=0 marking stimulus onset', () => {
    render(<PsthChart {...BASE_PROPS} />);

    const { layout } = plotlyCalls[0]!;
    const shapes = layout.shapes as Array<{
      type: string;
      x0: number;
      x1: number;
      line?: { dash?: string; color?: string };
    }>;
    expect(Array.isArray(shapes)).toBe(true);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.type).toBe('line');
    expect(shapes[0]!.x0).toBe(0);
    expect(shapes[0]!.x1).toBe(0);
    expect(shapes[0]!.line?.dash).toBe('dash');
  });

  it('applies the provided title to the figure aria-label and figcaption', () => {
    render(<PsthChart {...BASE_PROPS} title="Visual cortex PSTH" />);

    // Figure aria-label echoes the title.
    expect(
      screen.getByRole('figure', { name: 'Visual cortex PSTH' }),
    ).toBeInTheDocument();
  });

  it('falls back the aria-label to "PSTH for {unitName}" when no title is set', () => {
    render(<PsthChart {...BASE_PROPS} unitName="Unit 7" />);

    expect(
      screen.getByRole('figure', { name: /PSTH for Unit 7/i }),
    ).toBeInTheDocument();
  });

  it('renders a "View dataset" link pointing at the dataset overview', () => {
    render(<PsthChart {...BASE_PROPS} />);

    const link = screen.getByRole('link', { name: /view dataset/i });
    expect(link).toHaveAttribute(
      'href',
      `/datasets/${BASE_PROPS.datasetId}/overview`,
    );
  });

  it('shows the bin-size pill in the figcaption', () => {
    render(<PsthChart {...BASE_PROPS} binSizeMs={50} />);
    expect(screen.getByText('50 ms bins')).toBeInTheDocument();
  });
});
