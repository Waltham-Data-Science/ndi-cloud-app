/**
 * SignalChart — verifies the fetch + state surface (loading, error,
 * empty, soft-error, success) and the routing between the legacy
 * 1-channel TimeseriesChart delegate vs. the new multi-trace
 * renderer (covered in MultiTraceChart.test.tsx).
 *
 * The actual uPlot rendering is owned by `TimeseriesChart` (already
 * covered by its own test file) and `MultiTraceChart`; we mock both
 * here so we don't drag uPlot's DOM dependencies into the
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
vi.mock('@/components/ndi/charts/TimeseriesChart', () => ({
  TimeseriesChart: ({ data }: { data: { sample_count: number } }) => (
    <div data-testid="timeseries-chart">samples={data.sample_count}</div>
  ),
}));

// Mock MultiTraceChart in the same way — we have a separate unit
// test file (MultiTraceChart.test.tsx) for its color-ramp + legend +
// colorbar semantics. Here we only care that SignalChart routes to
// the right renderer based on channel count + colorbar prop.
vi.mock('@/components/ndi/charts/MultiTraceChart', () => ({
  MultiTraceChart: ({
    data,
    colorbar,
    colorBy,
  }: {
    data: { sample_count: number; channels: Record<string, unknown> };
    colorbar?: { label: string };
    colorBy?: 'time' | 'index' | 'value' | null;
  }) => (
    <div
      data-testid="multitrace-chart"
      data-colorby={colorBy ?? 'null'}
    >
      <span data-testid="multitrace-channel-count">
        {Object.keys(data.channels ?? {}).length}
      </span>
      <span data-testid="multitrace-samples">samples={data.sample_count}</span>
      {colorbar && (
        <span data-testid="multitrace-colorbar-label">{colorbar.label}</span>
      )}
    </div>
  ),
}));

// Mock apiFetch so we can drive the query state from each test.
vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { SignalChart } from '@/components/ndi/charts/SignalChart';
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

const multiChannelResponse = {
  ...baseSignalResponse,
  channels: {
    'voltage_+10pA': [1, 2, 3],
    'voltage_+20pA': [2, 3, 4],
    'voltage_+30pA': [3, 4, 5],
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

  // -------------------------------------------------------------------
  // Multi-trace + colorbar routing
  // -------------------------------------------------------------------
  describe('multi-trace + colorbar', () => {
    it('routes 2+ channels to MultiTraceChart (not the legacy single-channel delegate)', async () => {
      mockedApiFetch.mockResolvedValueOnce(multiChannelResponse);
      render(<SignalChart datasetId="ds1" docId="doc1" />, {
        wrapper: withClient(),
      });
      await waitFor(() =>
        expect(screen.getByTestId('multitrace-chart')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('timeseries-chart')).not.toBeInTheDocument();
      // Verifies the channels payload was passed through verbatim.
      expect(screen.getByTestId('multitrace-channel-count')).toHaveTextContent('3');
    });

    it('passes the colorbar prop through to MultiTraceChart when set', async () => {
      mockedApiFetch.mockResolvedValueOnce(multiChannelResponse);
      render(
        <SignalChart
          datasetId="ds1"
          docId="doc1"
          colorbar={{
            label: 'Injection (pA)',
            min: 10,
            max: 30,
            scale: 'viridis',
          }}
        />,
        { wrapper: withClient() },
      );
      await waitFor(() =>
        expect(screen.getByTestId('multitrace-chart')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('multitrace-colorbar-label')).toHaveTextContent(
        'Injection (pA)',
      );
    });

    it('routes single-channel data through MultiTraceChart when a colorbar is explicitly requested', async () => {
      // Edge case: the LLM might want a colorbar even on a single
      // trace to label the y-axis ramp. SignalChart honors that by
      // routing to MultiTraceChart rather than the legacy delegate.
      mockedApiFetch.mockResolvedValueOnce(baseSignalResponse);
      render(
        <SignalChart
          datasetId="ds1"
          docId="doc1"
          colorbar={{ label: 'Voltage (mV)', min: -80, max: 40 }}
        />,
        { wrapper: withClient() },
      );
      await waitFor(() =>
        expect(screen.getByTestId('multitrace-chart')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('timeseries-chart')).not.toBeInTheDocument();
    });

    it('1-channel + no colorbar STILL routes to the legacy TimeseriesChart delegate (regression guard)', async () => {
      // The pre-existing EPM single-channel example must keep working
      // exactly as before — TimeseriesChart owns its sweep detection
      // semantics and we don't want to drift behavior for that path.
      mockedApiFetch.mockResolvedValueOnce(baseSignalResponse);
      render(<SignalChart datasetId="ds1" docId="doc1" />, {
        wrapper: withClient(),
      });
      await waitFor(() =>
        expect(screen.getByTestId('timeseries-chart')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('multitrace-chart')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------
  // colorBy prop — per-point continuous coloring
  // -------------------------------------------------------------------
  describe('colorBy prop', () => {
    it('passes colorBy through to MultiTraceChart on multi-channel data', async () => {
      mockedApiFetch.mockResolvedValueOnce(multiChannelResponse);
      render(
        <SignalChart datasetId="ds1" docId="doc1" colorBy="time" />,
        { wrapper: withClient() },
      );
      await waitFor(() =>
        expect(screen.getByTestId('multitrace-chart')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('multitrace-chart')).toHaveAttribute(
        'data-colorby',
        'time',
      );
    });

    it('routes single-channel data through MultiTraceChart when colorBy is set', async () => {
      // Single-channel + colorBy = the user wants per-point coloring
      // even on a flat trace — must route to MultiTraceChart so the
      // per-segment paths builder is available.
      mockedApiFetch.mockResolvedValueOnce(baseSignalResponse);
      render(
        <SignalChart datasetId="ds1" docId="doc1" colorBy="value" />,
        { wrapper: withClient() },
      );
      await waitFor(() =>
        expect(screen.getByTestId('multitrace-chart')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('timeseries-chart')).not.toBeInTheDocument();
      expect(screen.getByTestId('multitrace-chart')).toHaveAttribute(
        'data-colorby',
        'value',
      );
    });

    it('omits colorBy (passes null) when not specified — default behavior unchanged', async () => {
      // Default-null path must keep the legacy single-channel delegate
      // for 1-channel responses without colorbar.
      mockedApiFetch.mockResolvedValueOnce(baseSignalResponse);
      render(<SignalChart datasetId="ds1" docId="doc1" />, {
        wrapper: withClient(),
      });
      await waitFor(() =>
        expect(screen.getByTestId('timeseries-chart')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('multitrace-chart')).not.toBeInTheDocument();
    });

    it('supports all three colorBy modes', async () => {
      // Quick smoke that each enum value propagates verbatim.
      for (const mode of ['time', 'index', 'value'] as const) {
        mockedApiFetch.mockResolvedValueOnce(multiChannelResponse);
        const { unmount } = render(
          <SignalChart datasetId="ds1" docId="doc1" colorBy={mode} />,
          { wrapper: withClient() },
        );
        await waitFor(() =>
          expect(screen.getByTestId('multitrace-chart')).toHaveAttribute(
            'data-colorby',
            mode,
          ),
        );
        unmount();
      }
    });
  });
});
