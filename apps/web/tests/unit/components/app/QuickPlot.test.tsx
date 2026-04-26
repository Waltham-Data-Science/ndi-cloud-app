/**
 * QuickPlot — Phase 6.6 REBUILD-11.
 *
 * Collapsible violin-plot card embedded in the SummaryTableView.
 * Source: `ndi-data-browser-v2/frontend/src/components/visualization/
 * QuickPlot.tsx`. Tests pin the dispatcher behavior:
 *
 *   - Header collapse/expand state.
 *   - Auto-detected numeric + categorical columns populate the
 *     dropdowns from the table response.
 *   - Plot button disabled until a numeric Y is picked.
 *   - Plot button dispatches `/api/visualize/distribution` with the
 *     right `field` + `groupBy`.
 *
 * D3 (`d3-array`/`d3-scale`/`d3-shape`) is imported by ViolinPlot
 * which only renders after a successful distribution response. Tests
 * stop short of asserting the violin SVG path — that surface depends
 * on jsdom's SVG measurement which is unstable. The dispatcher contract
 * is what the SummaryTableView wiring depends on; the visual fidelity
 * of the violin path is the source's contract, locked through the
 * verbatim port.
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
  ],
  rows: [
    { subject: 'm1', firingRate: 12.4, spikeCount: 4513, region: 'V1' },
    { subject: 'm1', firingRate: 8.7, spikeCount: 3001, region: 'V1' },
    { subject: 'm2', firingRate: 15.1, spikeCount: 5092, region: 'V2' },
    { subject: 'm2', firingRate: 11.3, spikeCount: 4117, region: 'V2' },
    { subject: 'm3', firingRate: 9.8, spikeCount: 3623, region: 'A1' },
  ],
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('QuickPlot — Phase 6.6 REBUILD-11', () => {
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
    // Body controls should not be visible while collapsed.
    expect(screen.queryByText(/Y \(numeric\)/i)).toBeNull();
  });

  it('clicking the header expands the body with Y/group-by dropdowns', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
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

    // Numeric: firingRate + spikeCount (both ≥70% parse-as-number).
    const yOptions = Array.from(yDropdown.querySelectorAll('option')).map(
      (o) => o.value,
    );
    expect(yOptions).toContain('firingRate');
    expect(yOptions).toContain('spikeCount');
    expect(yOptions).not.toContain('subject');
    expect(yOptions).not.toContain('region');

    // Categorical: subject (3 unique strings) + region (3 unique).
    // The xDropdown includes a leading "" empty option.
    const xOptions = Array.from(xDropdown.querySelectorAll('option')).map(
      (o) => o.value,
    );
    expect(xOptions).toContain('subject');
    expect(xOptions).toContain('region');
    expect(xOptions).not.toContain('firingRate');
  });

  it('Plot button is disabled until a Y field is picked, then dispatches with field + groupBy', async () => {
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

    // Exact-match "Plot" — `/Plot/i` would also match the "Quick plot"
    // header button. The submit button's label is just "Plot".
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

    // Dispatcher should POST /api/visualize/distribution with body
    // {datasetId, className, field, groupBy}. `useDistribution` is a
    // useMutation; field + groupBy ride in the request body.
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
