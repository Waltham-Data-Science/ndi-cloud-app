/**
 * SpikeActivityPanel — covers the parameter form, the mutation
 * round-trip, the kind-gated chart rendering, the inline error path,
 * and the Show-Code affordance. The chart components + the
 * CodeExportButton are mocked so the test exercises panel logic
 * (state, validation, mutation wiring) rather than chart internals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Hoisted mocks ──────────────────────────────────────────────────
// All call captures live in vi.hoisted so vi.mock factories (which
// also get hoisted) can reference them safely.
const { spikeRasterCalls, isiHistogramCalls, codeExportCalls, apiFetchMock } =
  vi.hoisted(() => {
    const spike: Array<Record<string, unknown>> = [];
    const isi: Array<Record<string, unknown>> = [];
    const code: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn();
    return {
      spikeRasterCalls: spike,
      isiHistogramCalls: isi,
      codeExportCalls: code,
      apiFetchMock: fetchMock,
    };
  });

vi.mock('@/lib/api/client', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/client')>(
      '@/lib/api/client',
    );
  return {
    ...actual,
    apiFetch: apiFetchMock,
  };
});

vi.mock('@/components/ndi/charts/SpikeRaster', () => ({
  SpikeRaster: (props: Record<string, unknown>) => {
    spikeRasterCalls.push(props);
    return <div data-testid="spike-raster-mock" />;
  },
}));

vi.mock('@/components/ndi/charts/IsiHistogram', () => ({
  IsiHistogram: (props: Record<string, unknown>) => {
    isiHistogramCalls.push(props);
    return <div data-testid="isi-histogram-mock" />;
  },
}));

vi.mock('@/components/ai/CodeExportButton', () => ({
  CodeExportButton: (props: Record<string, unknown>) => {
    codeExportCalls.push(props);
    return (
      <button type="button" data-testid="code-export-button-mock">
        Show code
      </button>
    );
  },
}));

import { SpikeActivityPanel } from '@/components/workspace/SpikeActivityPanel';
import type { FetchSpikeSummaryToolResult } from '@/lib/ndi/tools/fetch-spike-summary';

function renderPanel(datasetId = 'dataset123') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SpikeActivityPanel datasetId={datasetId} />
    </QueryClientProvider>,
  );
}

function makeRasterResult(): FetchSpikeSummaryToolResult {
  return {
    kind: 'raster',
    unit_count: 2,
    total_spikes: 6,
    time_range: { min: 0, max: 1 },
    chart_payloads: [
      {
        kind: 'raster',
        datasetId: 'dataset123',
        units: [
          { name: 'Unit 1', spikeTimes: [0.1, 0.2, 0.3] },
          { name: 'Unit 2', spikeTimes: [0.15, 0.25, 0.35] },
        ],
        title: 'Raster',
      },
    ],
    references: [],
  };
}

function makeIsiResult(): FetchSpikeSummaryToolResult {
  return {
    kind: 'isi_histogram',
    unit_count: 1,
    total_spikes: 4,
    time_range: { min: 0, max: 1 },
    chart_payloads: [
      {
        kind: 'isi_histogram',
        datasetId: 'dataset123',
        intervals: [10, 20, 30],
        unitName: 'Unit 1',
        logBins: true,
      },
    ],
    references: [],
  };
}

function makeBothResult(): FetchSpikeSummaryToolResult {
  return {
    kind: 'both',
    unit_count: 1,
    total_spikes: 4,
    time_range: { min: 0, max: 1 },
    chart_payloads: [
      {
        kind: 'raster',
        datasetId: 'dataset123',
        units: [{ name: 'Unit 1', spikeTimes: [0.1, 0.2, 0.3, 0.4] }],
      },
      {
        kind: 'isi_histogram',
        datasetId: 'dataset123',
        intervals: [100, 100, 100],
        logBins: true,
      },
    ],
    references: [],
  };
}

describe('SpikeActivityPanel', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    spikeRasterCalls.length = 0;
    isiHistogramCalls.length = 0;
    codeExportCalls.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the parameter form on mount without auto-fetching', () => {
    renderPanel();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Spike activity' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Unit document ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit name match')).toBeInTheDocument();
    expect(screen.getByLabelText('Time window start (s)')).toBeInTheDocument();
    expect(screen.getByLabelText('Time window end (s)')).toBeInTheDocument();
    expect(screen.getByLabelText('Max units')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Charts to render' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();

    // Default kind = "both"
    expect(screen.getByLabelText('Both')).toBeChecked();
    // The mutation has not fired yet.
    expect(apiFetchMock).not.toHaveBeenCalled();
    // No chart or code-export rendered yet.
    expect(screen.queryByTestId('spike-raster-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('isi-histogram-mock')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('code-export-button-mock'),
    ).not.toBeInTheDocument();
  });

  it('Run button is enabled by default with the kind radio set, and submits with default values', async () => {
    apiFetchMock.mockResolvedValueOnce(makeBothResult());
    renderPanel();
    const runButton = screen.getByRole('button', { name: 'Run' });
    expect(runButton).not.toBeDisabled();

    fireEvent.click(runButton);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = apiFetchMock.mock.calls[0]!;
    expect(url).toBe('/api/datasets/dataset123/spike-summary');
    expect(init).toMatchObject({
      method: 'POST',
      body: { kind: 'both', maxUnits: 10 },
    });
  });

  it('sends the right URL + body when the user fills the form and clicks Run', async () => {
    apiFetchMock.mockResolvedValueOnce(makeRasterResult());
    renderPanel('abc123');

    fireEvent.change(screen.getByLabelText('Unit name match'), {
      target: { value: 'Saline' },
    });
    fireEvent.change(screen.getByLabelText('Time window start (s)'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('Time window end (s)'), {
      target: { value: '60' },
    });
    fireEvent.change(screen.getByLabelText('Max units'), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByLabelText('Raster only'));

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = apiFetchMock.mock.calls[0]!;
    expect(url).toBe('/api/datasets/abc123/spike-summary');
    expect(init).toMatchObject({
      method: 'POST',
      body: {
        kind: 'raster',
        unitNameMatch: 'Saline',
        tWindow: [0, 60],
        maxUnits: 20,
      },
    });
    // `unitDocId` is blank — must be omitted, not sent as empty string.
    expect((init as { body: Record<string, unknown> }).body).not.toHaveProperty(
      'unitDocId',
    );
  });

  it('renders only the spike raster when kind=raster, and not the ISI histogram', async () => {
    apiFetchMock.mockResolvedValueOnce(makeRasterResult());
    renderPanel();

    fireEvent.click(screen.getByLabelText('Raster only'));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByTestId('spike-raster-mock')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('isi-histogram-mock')).not.toBeInTheDocument();
    expect(spikeRasterCalls).toHaveLength(1);
    expect(spikeRasterCalls[0]).toMatchObject({
      datasetId: 'dataset123',
      units: expect.any(Array),
    });
  });

  it('renders only the ISI histogram when kind=isi_histogram', async () => {
    apiFetchMock.mockResolvedValueOnce(makeIsiResult());
    renderPanel();

    fireEvent.click(screen.getByLabelText('ISI histogram only'));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByTestId('isi-histogram-mock')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('spike-raster-mock')).not.toBeInTheDocument();
    expect(isiHistogramCalls).toHaveLength(1);
    expect(isiHistogramCalls[0]).toMatchObject({
      intervals: [10, 20, 30],
      logBins: true,
    });
  });

  it('renders both charts when kind=both', async () => {
    apiFetchMock.mockResolvedValueOnce(makeBothResult());
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByTestId('spike-raster-mock')).toBeInTheDocument();
    });
    expect(screen.getByTestId('isi-histogram-mock')).toBeInTheDocument();
  });

  it('renders an inline error block when the API rejects with an Error', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('Boom: backend exploded'));
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Boom: backend exploded/,
      );
    });
    expect(screen.queryByTestId('spike-raster-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('isi-histogram-mock')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('code-export-button-mock'),
    ).not.toBeInTheDocument();
  });

  it('renders an inline error block when the response is a tool-error envelope', async () => {
    apiFetchMock.mockResolvedValueOnce({
      error: 'No vmspikesummary documents matched.',
    });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /No vmspikesummary documents matched/,
      );
    });
    // Tool-error envelopes do not count as successful runs.
    expect(
      screen.queryByTestId('code-export-button-mock'),
    ).not.toBeInTheDocument();
  });

  it('shows a client-side validation error when the time window is half-filled', async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText('Time window start (s)'), {
      target: { value: '5' },
    });
    // Leave the end empty.
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Time window requires/);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('renders the Show Code button after a successful run', async () => {
    apiFetchMock.mockResolvedValueOnce(makeBothResult());
    renderPanel();

    expect(
      screen.queryByTestId('code-export-button-mock'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(
        screen.getByTestId('code-export-button-mock'),
      ).toBeInTheDocument();
    });
    expect(codeExportCalls).toHaveLength(1);
    const props = codeExportCalls[0]!;
    expect(props).toMatchObject({
      toolCalls: [
        expect.objectContaining({
          toolName: 'fetch_spike_summary',
          args: expect.objectContaining({
            datasetId: 'dataset123',
            kind: 'both',
          }),
          result: expect.objectContaining({ kind: 'both' }),
        }),
      ],
    });
  });
});
