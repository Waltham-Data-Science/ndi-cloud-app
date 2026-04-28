/**
 * QuickPlot — Phase 6.6 REBUILD-11 + Phase 6.7+ P0 plot-type chooser
 * and X=numeric scatter mode.
 *
 * Source: `apps/web/components/app/QuickPlot.tsx`. Tests pin the
 * dispatcher contract:
 *
 *   - Header collapse/expand state.
 *   - Auto-detected numeric + categorical columns populate the
 *     dropdowns from the table response.
 *   - Plot-type dropdown (violin/box/histogram/bar) swaps the renderer.
 *   - Plot button disabled until a numeric Y is picked (group mode) or
 *     until both X+Y are picked (xnumeric mode).
 *   - Plot button dispatches `/api/visualize/distribution` only when the
 *     plot type needs server-side aggregation; bar-by-count and scatter
 *     compute locally and don't hit the API.
 *   - X=numeric (scatter) mode replaces the categorical dropdown with
 *     numeric columns.
 *
 * D3 path emission is asserted only via `data-testid` presence/absence
 * (the SVG paths depend on jsdom SVG measurement which is unstable).
 * uPlot is mocked because jsdom can't drive its canvas measurement.
 */
import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
} from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { TableResponse } from '@/lib/api/tables';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// Stub uPlot — the constructor would crash in jsdom on first
// `getContext('2d')`. ScatterPlot uses it for the X=numeric path; the
// tests assert on the surrounding chrome / data-testid wrapper rather
// than the canvas-rendered chart itself.
vi.mock('uplot', () => ({
  default: vi.fn().mockImplementation(function () {
    return { destroy: vi.fn(), setSize: vi.fn() };
  }),
}));
vi.mock('uplot/dist/uPlot.min.css', () => ({}));

import { QuickPlot } from '@/components/app/QuickPlot';

function withClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

const TABLE: TableResponse = {
  columns: [
    { key: 'subject', label: 'subject' },
    { key: 'firingRate', label: 'firing rate (Hz)' },
    { key: 'spikeCount', label: 'spike count' },
    { key: 'region', label: 'region' },
    { key: 'time', label: 'time (s)' },
  ],
  rows: [
    { subject: 'm1', firingRate: 12.4, spikeCount: 4513, region: 'V1', time: 0.1 },
    { subject: 'm1', firingRate: 8.7, spikeCount: 3001, region: 'V1', time: 0.2 },
    { subject: 'm2', firingRate: 15.1, spikeCount: 5092, region: 'V2', time: 0.3 },
    { subject: 'm2', firingRate: 11.3, spikeCount: 4117, region: 'V2', time: 0.4 },
    { subject: 'm3', firingRate: 9.8, spikeCount: 3623, region: 'A1', time: 0.5 },
  ],
};

const GROUPED_RESPONSE = {
  groups: [
    {
      name: 'V1',
      values: [12.4, 8.7],
      count: 2,
      mean: 10.55,
      median: 10.55,
      std: 1.85,
      min: 8.7,
      max: 12.4,
      q1: 9.6,
      q3: 11.5,
    },
    {
      name: 'V2',
      values: [15.1, 11.3, 14.0, 13.5, 12.0],
      count: 5,
      mean: 13.18,
      median: 13.5,
      std: 1.4,
      min: 11.3,
      max: 15.1,
      q1: 12.0,
      q3: 14.0,
    },
  ],
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('QuickPlot — collapse / expand / dropdowns', () => {
  it('renders collapsed by default with a "Quick plot" header', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    const header = screen.getByRole('button', { name: /Quick plot/i });
    expect(header).toBeInTheDocument();
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Y \(numeric\)/i)).toBeNull();
  });

  it('clicking the header expands the body with axis-mode + plot-type + Y/X dropdowns', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
    expect(screen.getByText(/Axis mode/i)).toBeInTheDocument();
    expect(screen.getByText(/Plot type/i)).toBeInTheDocument();
    expect(screen.getByText(/Y \(numeric\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Group by/i)).toBeInTheDocument();
  });

  it('auto-detects numeric + categorical columns into the right dropdowns', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));

    const yDropdown = screen.getByRole('combobox', { name: /Y \(numeric\)/i });
    const xDropdown = screen.getByRole('combobox', { name: /Group by/i });

    const yOptions = Array.from(yDropdown.querySelectorAll('option')).map(
      (o) => o.value,
    );
    expect(yOptions).toContain('firingRate');
    expect(yOptions).toContain('spikeCount');
    expect(yOptions).toContain('time');
    expect(yOptions).not.toContain('subject');
    expect(yOptions).not.toContain('region');

    const xOptions = Array.from(xDropdown.querySelectorAll('option')).map(
      (o) => o.value,
    );
    expect(xOptions).toContain('subject');
    expect(xOptions).toContain('region');
    expect(xOptions).not.toContain('firingRate');
  });
});

describe('QuickPlot — dispatch (group mode, distribution endpoint)', () => {
  it('Plot button is disabled until a Y field is picked, then dispatches with field + groupBy', async () => {
    apiFetchMock.mockResolvedValue(GROUPED_RESPONSE);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));

    const plotBtn = screen.getByRole('button', { name: 'Plot' });
    expect(plotBtn).toBeDisabled();

    fireEvent.change(
      screen.getByRole('combobox', { name: /Y \(numeric\)/i }),
      { target: { value: 'firingRate' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: /Group by/i }),
      { target: { value: 'region' } },
    );

    expect(plotBtn).not.toBeDisabled();
    fireEvent.click(plotBtn);

    await vi.waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalled();
    });
    const [url, init] = apiFetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('/api/visualize/distribution');
    expect(init).toMatchObject({
      method: 'POST',
      body: {
        datasetId: 'd1',
        className: 'subject',
        field: 'firingRate',
        groupBy: 'region',
      },
    });
  });
});

describe('QuickPlot — plot-type chooser swaps renderers', () => {
  async function runWithPlotType(plotType: 'violin' | 'box' | 'histogram') {
    apiFetchMock.mockResolvedValue(GROUPED_RESPONSE);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
    fireEvent.change(
      screen.getByRole('combobox', { name: /Y \(numeric\)/i }),
      { target: { value: 'firingRate' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: /Group by/i }),
      { target: { value: 'region' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: /Plot type/i }),
      { target: { value: plotType } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plot' }));
    await vi.waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalled();
    });
  }

  it('renders violin SVG when plot type is violin (default)', async () => {
    await runWithPlotType('violin');
    await vi.waitFor(() => {
      expect(screen.getByTestId('violin-plot-svg')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('box-plot-svg')).toBeNull();
    expect(screen.queryByTestId('histogram-svg')).toBeNull();
  });

  it('renders box-plot SVG when plot type is box', async () => {
    await runWithPlotType('box');
    await vi.waitFor(() => {
      expect(screen.getByTestId('box-plot-svg')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('violin-plot-svg')).toBeNull();
  });

  it('renders histogram SVG when plot type is histogram', async () => {
    await runWithPlotType('histogram');
    await vi.waitFor(() => {
      expect(screen.getByTestId('histogram-svg')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('violin-plot-svg')).toBeNull();
  });

  it('renders bar-by-count SVG without dispatching the API when plot type is bar', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
    fireEvent.change(
      screen.getByRole('combobox', { name: /Plot type/i }),
      { target: { value: 'bar' } },
    );
    // The X dropdown is now required; no Y field.
    const xDropdown = screen.getByRole('combobox', { name: /Group by/i });
    fireEvent.change(xDropdown, { target: { value: 'region' } });

    fireEvent.click(screen.getByRole('button', { name: 'Plot' }));

    expect(screen.getByTestId('bar-chart-svg')).toBeInTheDocument();
    // Bar-by-count is computed in-memory — it must not dispatch.
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe('QuickPlot — X=numeric (scatter) mode', () => {
  it('switching axis mode to xnumeric shows numeric options in X dropdown', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));

    fireEvent.change(
      screen.getByRole('combobox', { name: /Axis mode/i }),
      { target: { value: 'xnumeric' } },
    );

    const xDropdown = screen.getByRole('combobox', { name: /X \(numeric\)/i });
    const xOptions = Array.from(xDropdown.querySelectorAll('option')).map(
      (o) => o.value,
    );
    // After the flip, X exposes numeric columns — not categorical ones.
    expect(xOptions).toContain('firingRate');
    expect(xOptions).toContain('spikeCount');
    expect(xOptions).toContain('time');
    expect(xOptions).not.toContain('region');
    expect(xOptions).not.toContain('subject');
  });

  it('renders ScatterPlot from in-memory rows without hitting the API', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));

    fireEvent.change(
      screen.getByRole('combobox', { name: /Axis mode/i }),
      { target: { value: 'xnumeric' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: /X \(numeric\)/i }),
      { target: { value: 'time' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: /Y \(numeric\)/i }),
      { target: { value: 'firingRate' } },
    );

    expect(screen.getByTestId('scatter-plot')).toBeInTheDocument();
    // 5 rows in TABLE — all have numeric time + firingRate.
    expect(screen.getByText(/5 points/i)).toBeInTheDocument();
    // Must not dispatch the distribution endpoint.
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('flipping back to group mode resets the X picker (avoids carrying invalid choice)', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));

    // Pick a numeric X under xnumeric mode.
    fireEvent.change(
      screen.getByRole('combobox', { name: /Axis mode/i }),
      { target: { value: 'xnumeric' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: /X \(numeric\)/i }),
      { target: { value: 'firingRate' } },
    );

    // Flip back to group mode — X picker should reset (the categorical
    // dropdown wouldn't have "firingRate" as an option anyway, but
    // explicit reset prevents a stuck stale value).
    fireEvent.change(
      screen.getByRole('combobox', { name: /Axis mode/i }),
      { target: { value: 'group' } },
    );
    const xDropdown = screen.getByRole('combobox', { name: /Group by/i });
    expect((xDropdown as HTMLSelectElement).value).toBe('');
  });
});

describe('QuickPlot — small-n graceful degradation', () => {
  it('with n=2 group, violin mode does not crash (renders the SVG container)', async () => {
    apiFetchMock.mockResolvedValue({
      groups: [
        {
          name: 'V1',
          values: [12.4, 8.7],
          count: 2,
          mean: 10.55,
          median: 10.55,
          std: 1.85,
          min: 8.7,
          max: 12.4,
          q1: 9.6,
          q3: 11.5,
        },
      ],
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
    fireEvent.change(
      screen.getByRole('combobox', { name: /Y \(numeric\)/i }),
      { target: { value: 'firingRate' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: /Group by/i }),
      { target: { value: 'region' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plot' }));

    // Violin internal short-circuit: when group.values.length < 2 it
    // renders empty paths. n=2 still triggers KDE — but the box and
    // jitter paths should render without error and the SVG container
    // mounts cleanly.
    await vi.waitFor(() => {
      expect(screen.getByTestId('violin-plot-svg')).toBeInTheDocument();
    });
  });
});
