/**
 * SignalChart — verifies the fetch + state surface (loading, error,
 * empty, soft-error, success). The actual uPlot rendering is owned
 * by `TimeseriesChart` (already covered by its own test file); we
 * mock it here so we don't drag uPlot's DOM dependencies into the
 * SignalChart test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock TimeseriesChart so SignalChart's wrapper logic is the unit
// under test, not the uPlot rendering. The mock surfaces a marker
// node we can assertion on, plus echoes the sample_count it received
// so we can verify the fetch result is wired through.
vi.mock('@/components/app/TimeseriesChart', () => ({
  TimeseriesChart: ({ data }: { data: { sample_count: number } }) => (
    <div data-testid="timeseries-chart">samples={data.sample_count}</div>
  ),
}));

// Mock apiFetch so we can drive the query state from each test.
vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { SignalChart } from '@/components/ai/SignalChart';
import { apiFetch } from '@/lib/api/client';

const mockedApiFetch = vi.mocked(apiFetch);

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function Provider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Provider;
}

const baseSignalResponse = {
  channels: { ch0: [1, 2, 3] },
  timestamps: [0, 0.001, 0.002],
  sample_count: 3,
  format: 'nbf',
  error: null,
  downsampled: false,
  original_sample_count: 3,
  source: {
    dataset_id: 'ds1',
    document_id: 'doc1',
    doc_class: 'element_epoch',
    doc_name: 'Sweep 5',
  },
};

describe('SignalChart', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the loading state while the fetch is in flight', () => {
    mockedApiFetch.mockReturnValueOnce(new Promise(() => {})); // never resolves
    render(
      <SignalChart datasetId="ds1" docId="doc1" title="Voltage trace" />,
      { wrapper: withClient() },
    );
    expect(screen.getByText(/Loading signal/i)).toBeInTheDocument();
  });

  it('hits the signal endpoint with the right URL + query params', async () => {
    mockedApiFetch.mockResolvedValueOnce(baseSignalResponse);
    render(
      <SignalChart
        datasetId="ds1"
        docId="doc1"
        downsample={500}
        t0={1.5}
        t1={4.5}
      />,
      { wrapper: withClient() },
    );
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/datasets/ds1/documents/doc1/signal?'),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    const url = mockedApiFetch.mock.calls[0]![0] as string;
    expect(url).toContain('downsample=500');
    expect(url).toContain('t0=1.5');
    expect(url).toContain('t1=4.5');
  });

  it('mounts TimeseriesChart with the fetched data on success', async () => {
    mockedApiFetch.mockResolvedValueOnce(baseSignalResponse);
    render(
      <SignalChart datasetId="ds1" docId="doc1" title="Voltage trace" />,
      { wrapper: withClient() },
    );
    await waitFor(() =>
      expect(screen.getByTestId('timeseries-chart')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('timeseries-chart')).toHaveTextContent('samples=3');
  });

  it('shows the explicit title from props in the caption', async () => {
    mockedApiFetch.mockResolvedValueOnce(baseSignalResponse);
    render(
      <SignalChart datasetId="ds1" docId="doc1" title="Patch-Vm sweep 5" />,
      { wrapper: withClient() },
    );
    await waitFor(() =>
      expect(screen.getByText('Patch-Vm sweep 5')).toBeInTheDocument(),
    );
  });

  it("falls back to source.doc_name when title prop isn't provided", async () => {
    mockedApiFetch.mockResolvedValueOnce(baseSignalResponse);
    render(<SignalChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() => expect(screen.getByText('Sweep 5')).toBeInTheDocument());
  });

  it('shows the soft-error message when backend returns a decoder error', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...baseSignalResponse,
      channels: {},
      timestamps: null,
      sample_count: 0,
      error: 'vlt library is not available',
      errorKind: 'vlt_library',
    });
    render(<SignalChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() =>
      expect(screen.getByText(/vlt library/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('timeseries-chart')).not.toBeInTheDocument();
  });

  it("shows 'No samples' when timestamps are empty or null", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...baseSignalResponse,
      channels: {},
      timestamps: [],
      sample_count: 0,
    });
    render(<SignalChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() =>
      expect(screen.getByText(/No samples/i)).toBeInTheDocument(),
    );
  });

  it('shows the network-error state when apiFetch throws', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('Network down'));
    render(<SignalChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() =>
      expect(screen.getByText(/Network down/i)).toBeInTheDocument(),
    );
  });

  it('renders a "View source document" link to the Document Explorer', async () => {
    mockedApiFetch.mockResolvedValueOnce(baseSignalResponse);
    render(<SignalChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() => screen.getByText(/View source document/));
    const link = screen.getByText(/View source document/) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/datasets/ds1/documents/doc1');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('shows the downsampling note when the response was reduced', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...baseSignalResponse,
      downsampled: true,
      sample_count: 500,
      original_sample_count: 50_000,
    });
    render(<SignalChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Downsampled from 50,000 samples to 500/),
      ).toBeInTheDocument(),
    );
  });
});
