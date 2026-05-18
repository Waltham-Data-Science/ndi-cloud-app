/**
 * SpikeActivityPanel — covers the parameter form, the mutation
 * round-trip, the kind-gated chart rendering, the inline error path,
 * and the Show-Code affordance. The chart components + the
 * CodeExportButton are mocked so the test exercises panel logic
 * (state, validation, mutation wiring) rather than chart internals.
 *
 * Selection wiring (one-canvas redesign 2026-05-16):
 *   - unitDocId pre-fills from selection.unit on mount
 *   - "Auto from selection" hint shows while pre-filled
 *   - Auto-runs after ~400ms debounce when unit is set
 *   - Manual edit of unit hides the hint + suppresses further auto-runs
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

// Mockable selection — default = all-null. Tests reassign to inject
// unit context for the auto-fill suite.
const setMock = vi.fn();
const clearMock = vi.fn();
const clearOneMock = vi.fn();
const setPickerTabMock = vi.fn();
let selectionStub: {
  subject: string | null;
  session: string | null;
  probe: string | null;
  stimulus: string | null;
  unit: string | null;
} = {
  subject: null,
  session: null,
  probe: null,
  stimulus: null,
  unit: null,
};

vi.mock('@/lib/workspace/use-workspace-selection', () => ({
  useWorkspaceSelection: () => ({
    selection: selectionStub,
    set: setMock,
    clear: clearMock,
    clearOne: clearOneMock,
    pickerTab: 'subjects',
    setPickerTab: setPickerTabMock,
    hasAnySelection: Object.values(selectionStub).some((v) => v !== null),
  }),
}));

import { SpikeActivityPanel } from '@/components/workspace/SpikeActivityPanel';
import type { FetchSpikeSummaryToolResult } from '@/lib/ndi/tools/fetch-spike-summary';

const VALID_UNIT_ID = 'b'.repeat(24);

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
    vi.useRealTimers();
    selectionStub = {
      subject: null,
      session: null,
      probe: null,
      stimulus: null,
      unit: null,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('renders the parameter form on mount without auto-fetching', () => {
    renderPanel();

    expect(
      screen.getByRole('heading', { level: 3, name: 'Spike activity' }),
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
    // No selection → no auto-fill hint.
    expect(screen.queryByTestId('spike-activity-auto-hint')).not.toBeInTheDocument();
  });

  it('renders the illustrated empty state when no unit is set', () => {
    renderPanel();

    const empty = screen.getByTestId('spike-activity-empty');
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveAttribute('data-illustration', 'raster');
    expect(screen.getByText(/plot spike activity/i)).toBeInTheDocument();
    expect(
      screen.getByText(/pick a unit \(vmspikesummary document\)/i),
    ).toBeInTheDocument();
  });

  it('pulses the PanelCard chrome when selection.unit changes', async () => {
    // Stable QC so the rerender keeps the same hook instance.
    selectionStub = { ...selectionStub, unit: VALID_UNIT_ID };
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { container, rerender } = render(
      <QueryClientProvider client={qc}>
        <SpikeActivityPanel datasetId="dataset123" />
      </QueryClientProvider>,
    );

    const section = container.querySelector('section#spike-activity')!;
    expect(section.getAttribute('data-pulse')).toBeNull();

    // Change the unit dimension → pulse fires.
    const NEW_UNIT_ID = 'd'.repeat(24);
    selectionStub = { ...selectionStub, unit: NEW_UNIT_ID };
    rerender(
      <QueryClientProvider client={qc}>
        <SpikeActivityPanel datasetId="dataset123" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        container.querySelector('section#spike-activity')!.getAttribute('data-pulse'),
      ).toBe('true');
    });
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

describe('SpikeActivityPanel — selection auto-fill', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    spikeRasterCalls.length = 0;
    isiHistogramCalls.length = 0;
    codeExportCalls.length = 0;
    vi.useRealTimers();
    selectionStub = {
      subject: null,
      session: null,
      probe: null,
      stimulus: null,
      unit: null,
    };
  });

  it('pre-fills unitDocId from selection.unit on mount', () => {
    selectionStub = { ...selectionStub, unit: VALID_UNIT_ID };

    renderPanel();

    const input = screen.getByLabelText('Unit document ID') as HTMLInputElement;
    expect(input.value).toBe(VALID_UNIT_ID);
    expect(screen.getByTestId('spike-activity-auto-hint')).toBeInTheDocument();
  });

  it('auto-runs after the debounce when selection.unit is set', async () => {
    // Real timers (not fake) — see PsthPanel test note on react-query
    // microtask interaction. 400ms debounce is short enough to wait.
    apiFetchMock.mockResolvedValueOnce(makeBothResult());
    selectionStub = { ...selectionStub, unit: VALID_UNIT_ID };

    renderPanel('ds-auto');

    expect(apiFetchMock).not.toHaveBeenCalled();

    await waitFor(
      () => {
        expect(apiFetchMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 },
    );
    const [url, init] = apiFetchMock.mock.calls[0]!;
    expect(url).toBe('/api/datasets/ds-auto/spike-summary');
    expect(init).toMatchObject({
      method: 'POST',
      body: expect.objectContaining({ unitDocId: VALID_UNIT_ID }),
    });
  });

  it('hides the auto-fill hint when the user edits the unit field', () => {
    selectionStub = { ...selectionStub, unit: VALID_UNIT_ID };

    renderPanel();

    expect(screen.getByTestId('spike-activity-auto-hint')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Unit document ID'), {
      target: { value: 'x' + VALID_UNIT_ID },
    });

    expect(screen.queryByTestId('spike-activity-auto-hint')).not.toBeInTheDocument();
  });

  // F-4: TanStack Query dedups by queryKey hash. Selecting unit A,
  // then unit B, then unit A again used to re-fire the mutation; with
  // useQuery the cached result for A is reused and apiFetch is NOT
  // called a third time. Mirror of the "subject A → B → A" picker-rail
  // path the F-4 ticket describes.
  it('dedups by queryKey when selection ping-pongs across the same unit', async () => {
    const OTHER_UNIT_ID = 'a'.repeat(24);
    // Two responses staged: one for VALID_UNIT, one for OTHER_UNIT.
    // If the implementation regressed and re-fired for the third pick,
    // the test would consume a non-existent 3rd mock (or fall through
    // to undefined) — the assertion `toHaveBeenCalledTimes(2)` would
    // fail in either case.
    apiFetchMock.mockResolvedValueOnce(makeBothResult());
    apiFetchMock.mockResolvedValueOnce(makeBothResult());

    selectionStub = { ...selectionStub, unit: VALID_UNIT_ID };

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <SpikeActivityPanel datasetId="ds-dedup" />
      </QueryClientProvider>,
    );

    await waitFor(
      () => {
        expect(apiFetchMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 },
    );

    // Switch to a different unit — fetches a new result.
    selectionStub = { ...selectionStub, unit: OTHER_UNIT_ID };
    rerender(
      <QueryClientProvider client={qc}>
        <SpikeActivityPanel datasetId="ds-dedup" />
      </QueryClientProvider>,
    );
    await waitFor(
      () => {
        expect(apiFetchMock).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 },
    );

    // Switch BACK to the original unit. queryKey hashes the same as the
    // first commit → useQuery serves the cached result instead of
    // re-fetching. apiFetch stays at 2 calls.
    selectionStub = { ...selectionStub, unit: VALID_UNIT_ID };
    rerender(
      <QueryClientProvider client={qc}>
        <SpikeActivityPanel datasetId="ds-dedup" />
      </QueryClientProvider>,
    );

    // Wait long enough for the 400ms debounce + a buffer to confirm
    // no second fetch fired.
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
});
