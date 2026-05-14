/**
 * IsiHistogram — verifies trace shape for both raw-interval and
 * pre-binned modes, log-axis selection, empty-state handling,
 * caption + footer text, and citation link wiring. PlotlyMount is
 * mocked so we can inspect data/layout without dragging Plotly's UMD
 * bundle through jsdom.
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

vi.mock('@/components/charts/PlotlyMount', () => ({
  PlotlyMount: PlotlyMountMock,
}));

vi.mock('next/dynamic', () => ({
  default: () => PlotlyMountMock,
}));

import { IsiHistogram } from '@/components/charts/IsiHistogram';

describe('IsiHistogram', () => {
  afterEach(() => {
    plotlyCalls.length = 0;
    vi.clearAllMocks();
  });

  it('renders an empty state when no intervals AND no bins are provided', () => {
    render(<IsiHistogram />);
    expect(screen.getByRole('status')).toHaveTextContent(
      /No inter-spike intervals/,
    );
    expect(screen.queryByTestId('plotly-mount')).not.toBeInTheDocument();
  });

  it('renders an empty state when intervals array is empty', () => {
    render(<IsiHistogram intervals={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      /No inter-spike intervals/,
    );
  });

  it('renders raw intervals as a log-binned Bar trace by default', () => {
    render(<IsiHistogram intervals={[2, 5, 10, 20, 100, 500, 1000]} />);
    const { data, layout } = plotlyCalls[0]!;
    expect(data).toHaveLength(1);
    // Default logBins=true emits a Bar (not histogram) with pre-computed
    // centers + widths.
    expect((data[0] as { type: string }).type).toBe('bar');
    expect(layout.xaxis).toMatchObject({
      type: 'log',
      title: { text: 'Inter-spike interval (ms)' },
    });
    expect(layout.yaxis).toMatchObject({ title: { text: 'Count' } });
  });

  it('emits a linear-axis histogram when logBins=false', () => {
    render(<IsiHistogram intervals={[2, 5, 10, 20]} logBins={false} />);
    const { data, layout } = plotlyCalls[0]!;
    expect((data[0] as { type: string }).type).toBe('histogram');
    expect(layout.xaxis).toMatchObject({ type: 'linear' });
  });

  it('drops non-finite + non-positive values before binning (log mode)', () => {
    render(
      <IsiHistogram
        intervals={[Number.NaN, -5, 0, 5, 10, Number.POSITIVE_INFINITY, 50]}
      />,
    );
    const { data } = plotlyCalls[0]!;
    // Bar trace y is the per-bin count vector; total should reflect 3
    // valid inputs (5, 10, 50).
    const counts = (data[0] as { y: number[] }).y;
    const total = counts.reduce((s, v) => s + v, 0);
    expect(total).toBe(3);
  });

  it('honors pre-binned form when bins + counts are provided', () => {
    // 3 bins, edges [0, 10, 100, 1000].
    render(<IsiHistogram bins={[0, 10, 100, 1000]} counts={[5, 12, 3]} />);
    const { data } = plotlyCalls[0]!;
    expect((data[0] as { type: string }).type).toBe('bar');
    expect((data[0] as { y: number[] }).y).toEqual([5, 12, 3]);
    // Centers in log mode use geometric mean; the [0, 10] bin has a 0
    // edge → falls back to arithmetic.
    const centers = (data[0] as { x: number[] }).x;
    expect(centers).toHaveLength(3);
    // [10, 100] geometric center = sqrt(1000) ≈ 31.62
    expect(centers[1]).toBeCloseTo(Math.sqrt(1000), 2);
  });

  it('falls back to arithmetic centers when logBins=false in pre-binned mode', () => {
    render(
      <IsiHistogram
        bins={[0, 10, 20, 30]}
        counts={[5, 12, 3]}
        logBins={false}
      />,
    );
    const { data, layout } = plotlyCalls[0]!;
    expect((data[0] as { x: number[] }).x).toEqual([5, 15, 25]);
    expect(layout.xaxis).toMatchObject({ type: 'linear' });
  });

  it('rejects malformed pre-binned input (bins.length != counts.length+1) and shows empty state', () => {
    render(<IsiHistogram bins={[0, 10]} counts={[5, 3, 2]} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      /No inter-spike intervals/,
    );
  });

  it('renders the configured title in the caption', () => {
    render(<IsiHistogram intervals={[2, 5]} title="ISI for Unit 12" />);
    expect(screen.getByText('ISI for Unit 12')).toBeInTheDocument();
  });

  it('falls back to "ISI histogram — <unitName>" when no title is given', () => {
    render(<IsiHistogram intervals={[2, 5]} unitName="Unit 12" />);
    expect(screen.getByText('ISI histogram — Unit 12')).toBeInTheDocument();
  });

  it('falls back to "ISI histogram" when no title or unit name is given', () => {
    render(<IsiHistogram intervals={[2, 5]} />);
    expect(screen.getByText('ISI histogram')).toBeInTheDocument();
  });

  it('shows the "log" badge in the caption when log axis is active', () => {
    render(<IsiHistogram intervals={[2, 5]} />);
    expect(screen.getByText('log')).toBeInTheDocument();
  });

  it('hides the "log" badge when logBins=false', () => {
    render(<IsiHistogram intervals={[2, 5]} logBins={false} />);
    expect(screen.queryByText('log')).not.toBeInTheDocument();
  });

  it('reports the total-interval count in the footer (raw mode)', () => {
    render(<IsiHistogram intervals={[2, 5, 10, 20, 50]} />);
    expect(screen.getByText(/5 intervals/)).toBeInTheDocument();
  });

  it('reports the total-interval count in the footer (pre-binned mode)', () => {
    render(<IsiHistogram bins={[0, 10, 100]} counts={[7, 13]} />);
    expect(screen.getByText(/20 intervals/)).toBeInTheDocument();
  });

  it('renders a citation link to the dataset overview when datasetId is provided', () => {
    render(<IsiHistogram datasetId="ds-xyz" intervals={[2, 5]} />);
    const link = screen.getByText(/View dataset/) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/datasets/ds-xyz/overview');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('suppresses the citation link when no datasetId is provided', () => {
    render(<IsiHistogram intervals={[2, 5]} />);
    expect(screen.queryByText(/View dataset/)).not.toBeInTheDocument();
  });

  it('passes xLabel through to layout.xaxis.title', () => {
    render(<IsiHistogram intervals={[2, 5]} xLabel="ISI (ms, log)" />);
    expect(plotlyCalls[0]!.layout.xaxis).toMatchObject({
      title: { text: 'ISI (ms, log)' },
    });
  });
});
