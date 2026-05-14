/**
 * SpikeRaster — verifies trace assembly (one scatter trace per unit),
 * categorical Y axis ordering (first unit at top), tWindow filtering,
 * empty-state, MAX_UNITS cap + truncation note, citation link, and
 * per-unit color cycling. PlotlyMount is mocked so we inspect the
 * generated traces + layout without dragging Plotly's UMD bundle
 * through jsdom.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Capture the props PlotlyMount receives so tests can introspect the
// generated traces + layout.
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

// next/dynamic returns the loader's module wrapped in a Suspense-y
// component in real Next; under vitest we sidestep the loading state
// entirely by having dynamic() return the mocked PlotlyMount directly.
vi.mock('next/dynamic', () => ({
  default: () => PlotlyMountMock,
}));

import { SpikeRaster, type SpikeRasterUnit } from '@/components/charts/SpikeRaster';

describe('SpikeRaster', () => {
  afterEach(() => {
    plotlyCalls.length = 0;
    vi.clearAllMocks();
  });

  it('renders an empty state when units array is empty', () => {
    render(<SpikeRaster units={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent(/No spike data/);
    expect(screen.queryByTestId('plotly-mount')).not.toBeInTheDocument();
  });

  it('renders the configured title in the caption', () => {
    render(
      <SpikeRaster
        title="BNST units (Saline vs CNO)"
        units={[{ name: 'Unit 1', spikeTimes: [0.1, 0.2] }]}
      />,
    );
    expect(screen.getByText('BNST units (Saline vs CNO)')).toBeInTheDocument();
  });

  it('falls back to "Spike raster" when no title is provided', () => {
    render(<SpikeRaster units={[{ name: 'Unit 1', spikeTimes: [0.1] }]} />);
    expect(screen.getByText('Spike raster')).toBeInTheDocument();
  });

  it('emits one scatter trace per unit with line-ns marker and x=spikeTimes', () => {
    render(
      <SpikeRaster
        units={[
          { name: 'Unit A', spikeTimes: [0.1, 0.2, 0.3] },
          { name: 'Unit B', spikeTimes: [0.15, 0.25] },
        ]}
      />,
    );
    expect(plotlyCalls).toHaveLength(1);
    const { data } = plotlyCalls[0]!;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      type: 'scatter',
      mode: 'markers',
      name: 'Unit A',
      x: [0.1, 0.2, 0.3],
      y: ['Unit A', 'Unit A', 'Unit A'],
      marker: { symbol: 'line-ns', size: 10 },
    });
    expect(data[1]).toMatchObject({
      type: 'scatter',
      mode: 'markers',
      name: 'Unit B',
      x: [0.15, 0.25],
      y: ['Unit B', 'Unit B'],
    });
  });

  it('puts the first unit at the top of the Y axis (categoryarray reversed)', () => {
    render(
      <SpikeRaster
        units={[
          { name: 'Unit A', spikeTimes: [0.1] },
          { name: 'Unit B', spikeTimes: [0.2] },
          { name: 'Unit C', spikeTimes: [0.3] },
        ]}
      />,
    );
    const { layout } = plotlyCalls[0]!;
    expect(layout.yaxis).toMatchObject({
      type: 'category',
      categoryarray: ['Unit C', 'Unit B', 'Unit A'],
    });
  });

  it('cycles colors from the shared PALETTE across units', () => {
    render(
      <SpikeRaster
        units={[
          { name: 'A', spikeTimes: [0.1] },
          { name: 'B', spikeTimes: [0.1] },
        ]}
      />,
    );
    const { data } = plotlyCalls[0]!;
    const colorA = (data[0] as { marker: { color: string } }).marker.color;
    const colorB = (data[1] as { marker: { color: string } }).marker.color;
    expect(colorA).not.toBe(colorB);
    // First entry of PALETTE is sky-blue.
    expect(colorA).toBe('#0284c7');
  });

  it('filters spikes outside tWindow before rendering', () => {
    render(
      <SpikeRaster
        units={[{ name: 'A', spikeTimes: [0.0, 0.5, 1.0, 1.5, 2.0] }]}
        tWindow={[0.5, 1.5]}
      />,
    );
    const { data, layout } = plotlyCalls[0]!;
    expect((data[0] as { x: number[] }).x).toEqual([0.5, 1.0, 1.5]);
    expect(layout.xaxis).toMatchObject({ range: [0.5, 1.5] });
  });

  it('renders the total-spike count in the footer', () => {
    render(
      <SpikeRaster
        units={[
          { name: 'A', spikeTimes: [0.1, 0.2, 0.3] },
          { name: 'B', spikeTimes: [0.4, 0.5] },
        ]}
      />,
    );
    expect(screen.getByText(/5 total spikes/)).toBeInTheDocument();
    expect(screen.getByText(/2 units/)).toBeInTheDocument();
  });

  it('caps at 50 units and shows a truncation note in the footer', () => {
    const units: SpikeRasterUnit[] = Array.from({ length: 60 }, (_, i) => ({
      name: `Unit ${i}`,
      spikeTimes: [i * 0.01],
    }));
    render(<SpikeRaster units={units} />);
    const { data } = plotlyCalls[0]!;
    expect(data).toHaveLength(50);
    expect(
      screen.getByText(/Showing first 50 of 60 units/),
    ).toBeInTheDocument();
  });

  it('renders a citation link to the dataset overview when datasetId is provided', () => {
    render(
      <SpikeRaster
        datasetId="ds-xyz"
        units={[{ name: 'A', spikeTimes: [0.1] }]}
      />,
    );
    const link = screen.getByText(/View dataset/) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/datasets/ds-xyz/overview');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('suppresses the citation link when no datasetId is provided', () => {
    render(<SpikeRaster units={[{ name: 'A', spikeTimes: [0.1] }]} />);
    expect(screen.queryByText(/View dataset/)).not.toBeInTheDocument();
  });

  it('passes xLabel through to layout.xaxis.title', () => {
    render(
      <SpikeRaster
        xLabel="Time since stimulus (s)"
        units={[{ name: 'A', spikeTimes: [0.1] }]}
      />,
    );
    expect(plotlyCalls[0]!.layout.xaxis).toMatchObject({
      title: { text: 'Time since stimulus (s)' },
    });
  });

  it('scales chart height by unit count (capped at 360)', () => {
    // 1 unit → minimum 180
    render(<SpikeRaster units={[{ name: 'A', spikeTimes: [0.1] }]} />);
    expect(plotlyCalls[0]!.layout.height).toBe(180);
    plotlyCalls.length = 0;

    // Many units → capped at 360
    const many = Array.from({ length: 40 }, (_, i) => ({
      name: `U${i}`,
      spikeTimes: [i * 0.01],
    }));
    render(<SpikeRaster units={many} />);
    expect(plotlyCalls[0]!.layout.height).toBe(360);
  });
});
