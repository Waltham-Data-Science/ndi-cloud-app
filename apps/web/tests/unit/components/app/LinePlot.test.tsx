import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('uplot', () => ({
  default: vi.fn().mockImplementation(function () {
    return { destroy: vi.fn(), setSize: vi.fn() };
  }),
}));
vi.mock('uplot/dist/uPlot.min.css', () => ({}));

import { LinePlot } from '@/components/ndi/charts/inline/LinePlot';

const monotonicRows = Array.from({ length: 50 }, (_, i) => ({
  t: i * 0.1,
  distance: Math.sin(i * 0.2) * 100,
}));

describe('LinePlot', () => {
  it('renders the line-plot container with a point count', () => {
    render(
      <LinePlot rows={monotonicRows} xField="t" yField="distance" />,
    );
    expect(screen.getByTestId('line-plot')).toBeInTheDocument();
    expect(screen.getByText(/50 points/)).toBeInTheDocument();
  });

  it('shows an empty-state message when no rows have finite numeric values for both X and Y', () => {
    render(
      <LinePlot
        rows={[
          { t: 'oops', distance: null },
          { t: '', distance: 'nope' },
        ]}
        xField="t"
        yField="distance"
      />,
    );
    expect(screen.getByTestId('line-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('line-plot')).toBeNull();
  });

  it('singularizes "1 point" when only one row is plottable', () => {
    render(
      <LinePlot
        rows={[
          { t: 0, distance: 5 },
          { t: 1, distance: 'bad' },
        ]}
        xField="t"
        yField="distance"
      />,
    );
    expect(screen.getByText(/^1 point$/)).toBeInTheDocument();
  });
});
