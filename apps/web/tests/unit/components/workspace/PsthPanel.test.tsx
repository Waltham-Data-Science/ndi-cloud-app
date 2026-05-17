/**
 * PsthPanel — workspace panel for peri-stimulus time histogram.
 * Covers form rendering, validation, the mutation round-trip,
 * chart mounting, the error-kind surface, and Show-Code wiring.
 * PsthChart + CodeExportButton are mocked so the test exercises
 * panel logic rather than chart internals.
 *
 * Selection wiring (one-canvas redesign 2026-05-16):
 *   - unitDocId pre-fills from selection.unit
 *   - stimulusDocId pre-fills from selection.stimulus
 *   - Auto-runs when BOTH dimensions are set + form is auto-filled
 *   - "Auto from selection" hint is gated on both ids being auto-filled
 *   - Manual edit to either id hides the hint
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Hoisted mocks ───────────────────────────────────────────────────
const { psthChartCalls, codeExportCalls, apiFetchMock } = vi.hoisted(() => {
  const chart: Array<Record<string, unknown>> = [];
  const code: Array<Record<string, unknown>> = [];
  const fetchMock = vi.fn();
  return {
    psthChartCalls: chart,
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

vi.mock('@/components/ndi/charts/PsthChart', () => ({
  PsthChart: (props: Record<string, unknown>) => {
    psthChartCalls.push(props);
    return <div data-testid="psth-chart-mock" />;
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
// unit/stimulus context.
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

import { PsthPanel } from '@/components/workspace/PsthPanel';
import type { PsthToolResult } from '@/lib/ndi/tools/psth';

const VALID_UNIT_ID = 'b'.repeat(24);
const VALID_STIM_ID = 'c'.repeat(24);

function renderPanel(datasetId = 'dataset123') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PsthPanel datasetId={datasetId} />
    </QueryClientProvider>,
  );
}

function makeSuccessResult(): PsthToolResult {
  return {
    chart_payload: {
      kind: 'psth',
      datasetId: 'dataset123',
      binCenters: [-0.4, -0.2, 0, 0.2, 0.4],
      counts: [2, 4, 8, 12, 6],
      meanRateHz: [4, 8, 16, 24, 12],
      binSizeMs: 200,
      t0: -0.5,
      t1: 0.5,
      unitName: 'Unit 12',
    },
    n_trials: 25,
    n_spikes: 32,
    references: [],
    references_summary: {
      cited: 2,
      unit_doc_id: VALID_UNIT_ID,
      stimulus_doc_id: VALID_STIM_ID,
    },
  };
}

function makeNoEventsResult(): PsthToolResult {
  return {
    chart_payload: {
      kind: 'psth',
      datasetId: 'dataset123',
      binCenters: [],
      counts: [],
      meanRateHz: [],
      binSizeMs: 20,
      t0: -0.5,
      t1: 1.5,
    },
    n_trials: 0,
    n_spikes: 0,
    references: [],
    empty_hint: {
      reason:
        "The stimulus document doesn't carry event timestamps NDI-python recognizes.",
    },
  };
}

describe('PsthPanel', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    psthChartCalls.length = 0;
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

    expect(screen.getByLabelText(/unit document id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/stimulus document id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/t0/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/t1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bin size/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('psth-chart-mock')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('code-export-button-mock'),
    ).not.toBeInTheDocument();
    // No selection → no auto-fill hint.
    expect(screen.queryByTestId('psth-auto-hint')).not.toBeInTheDocument();
  });

  it('renders the illustrated empty state on mount when no ids are set', () => {
    renderPanel();

    const empty = screen.getByTestId('psth-empty');
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveAttribute('data-illustration', 'histogram');
    expect(screen.getByText(/build a psth/i)).toBeInTheDocument();
    expect(
      screen.getByText(/pick a unit and a stimulus/i),
    ).toBeInTheDocument();
  });

  it('pulses the PanelCard chrome when selection.unit OR selection.stimulus changes', async () => {
    // Stable QC so the rerender swaps props without remounting the
    // tree — otherwise the initial-mount guard in the hook would
    // suppress every "pulse" detection.
    selectionStub = { ...selectionStub, unit: VALID_UNIT_ID };
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const ui = (
      <QueryClientProvider client={qc}>
        <PsthPanel datasetId="dataset123" />
      </QueryClientProvider>
    );
    const { container, rerender } = render(ui);

    const section = container.querySelector('section#psth')!;
    expect(section.getAttribute('data-pulse')).toBeNull();

    // Adding a stimulus → second dep changed → pulse fires.
    selectionStub = { ...selectionStub, stimulus: VALID_STIM_ID };
    rerender(
      <QueryClientProvider client={qc}>
        <PsthPanel datasetId="dataset123" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        container.querySelector('section#psth')!.getAttribute('data-pulse'),
      ).toBe('true');
    });
  });

  it('blocks Run with empty unitDocId and surfaces an inline error', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      /unit document id is required/i,
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('blocks Run with malformed (non-hex) unitDocId', () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText(/unit document id/i), {
      target: { value: 'not-hex' },
    });
    fireEvent.change(screen.getByLabelText(/stimulus document id/i), {
      target: { value: VALID_STIM_ID },
    });
    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      /unit document id must be a 24-character hex/i,
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('blocks Run when t1 <= t0', () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText(/unit document id/i), {
      target: { value: VALID_UNIT_ID },
    });
    fireEvent.change(screen.getByLabelText(/stimulus document id/i), {
      target: { value: VALID_STIM_ID },
    });
    fireEvent.change(screen.getByLabelText(/t0/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/t1/i), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      /window end must be greater/i,
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to /api/datasets/{id}/psth with the form values', async () => {
    apiFetchMock.mockResolvedValueOnce(makeSuccessResult());
    renderPanel('abc123');

    fireEvent.change(screen.getByLabelText(/unit document id/i), {
      target: { value: VALID_UNIT_ID },
    });
    fireEvent.change(screen.getByLabelText(/stimulus document id/i), {
      target: { value: VALID_STIM_ID },
    });
    // Use defaults for t0/t1/bin_size.
    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = apiFetchMock.mock.calls[0]!;
    expect(url).toBe('/api/datasets/abc123/psth');
    expect(init).toMatchObject({
      method: 'POST',
      body: {
        unitDocId: VALID_UNIT_ID,
        stimulusDocId: VALID_STIM_ID,
        t0: -0.5,
        t1: 1.5,
        binSizeMs: 20,
      },
    });
  });

  it('renders the PsthChart with the resolved chart_payload after Run', async () => {
    apiFetchMock.mockResolvedValueOnce(makeSuccessResult());
    renderPanel();

    fireEvent.change(screen.getByLabelText(/unit document id/i), {
      target: { value: VALID_UNIT_ID },
    });
    fireEvent.change(screen.getByLabelText(/stimulus document id/i), {
      target: { value: VALID_STIM_ID },
    });
    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    await waitFor(() => {
      expect(screen.getByTestId('psth-chart-mock')).toBeInTheDocument();
    });
    expect(psthChartCalls).toHaveLength(1);
    expect(psthChartCalls[0]).toMatchObject({
      binCenters: [-0.4, -0.2, 0, 0.2, 0.4],
      meanRateHz: [4, 8, 16, 24, 12],
      binSizeMs: 200,
      t0: -0.5,
      t1: 0.5,
      unitName: 'Unit 12',
    });

    // Caption surfaces the spike/trial count summary.
    expect(screen.getByText(/32 spikes \/ 25 trials/i)).toBeInTheDocument();
  });

  it('surfaces empty_hint friendly copy when error_kind=no_events', async () => {
    apiFetchMock.mockResolvedValueOnce(makeNoEventsResult());
    renderPanel();

    fireEvent.change(screen.getByLabelText(/unit document id/i), {
      target: { value: VALID_UNIT_ID },
    });
    fireEvent.change(screen.getByLabelText(/stimulus document id/i), {
      target: { value: VALID_STIM_ID },
    });
    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/doesn't carry event timestamps/i),
      ).toBeInTheDocument();
    });
    // Empty case suppresses the chart — there's nothing to draw.
    expect(screen.queryByTestId('psth-chart-mock')).not.toBeInTheDocument();
  });

  it('renders an inline error when the API rejects with an Error', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('Network exploded'));
    renderPanel();

    fireEvent.change(screen.getByLabelText(/unit document id/i), {
      target: { value: VALID_UNIT_ID },
    });
    fireEvent.change(screen.getByLabelText(/stimulus document id/i), {
      target: { value: VALID_STIM_ID },
    });
    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    await waitFor(() => {
      // There can be two role=alert: the form's plus this one. Find the
      // network-error specifically.
      expect(screen.getByText(/network exploded/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('psth-chart-mock')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('code-export-button-mock'),
    ).not.toBeInTheDocument();
  });

  it('renders an inline error block when the response is a tool-error envelope', async () => {
    apiFetchMock.mockResolvedValueOnce({ error: 'invalid_dataset_id' });
    renderPanel();

    fireEvent.change(screen.getByLabelText(/unit document id/i), {
      target: { value: VALID_UNIT_ID },
    });
    fireEvent.change(screen.getByLabelText(/stimulus document id/i), {
      target: { value: VALID_STIM_ID },
    });
    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid_dataset_id/)).toBeInTheDocument();
    });
  });

  it('renders the Show Code button after a successful run with toolName="psth"', async () => {
    apiFetchMock.mockResolvedValueOnce(makeSuccessResult());
    renderPanel();

    expect(
      screen.queryByTestId('code-export-button-mock'),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/unit document id/i), {
      target: { value: VALID_UNIT_ID },
    });
    fireEvent.change(screen.getByLabelText(/stimulus document id/i), {
      target: { value: VALID_STIM_ID },
    });
    fireEvent.click(screen.getByRole('button', { name: /run/i }));

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
          toolName: 'psth',
          args: expect.objectContaining({
            datasetId: 'dataset123',
            unitDocId: VALID_UNIT_ID,
            stimulusDocId: VALID_STIM_ID,
          }),
        }),
      ],
    });
  });
});

describe('PsthPanel — selection auto-fill', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    psthChartCalls.length = 0;
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

  it('pre-fills both ids from selection.unit + selection.stimulus on mount', () => {
    selectionStub = {
      ...selectionStub,
      unit: VALID_UNIT_ID,
      stimulus: VALID_STIM_ID,
    };

    renderPanel();

    const unitInput = screen.getByLabelText(
      /unit document id/i,
    ) as HTMLInputElement;
    const stimInput = screen.getByLabelText(
      /stimulus document id/i,
    ) as HTMLInputElement;
    expect(unitInput.value).toBe(VALID_UNIT_ID);
    expect(stimInput.value).toBe(VALID_STIM_ID);
    expect(screen.getByTestId('psth-auto-hint')).toBeInTheDocument();
  });

  it('auto-runs after the debounce when BOTH dimensions are set', async () => {
    // Real timers + a short sleep — fake timers interact badly with
    // react-query's mutation chain (it queues microtasks the timer
    // advance can't reach). The 400ms debounce is fast enough to
    // wait through.
    apiFetchMock.mockResolvedValueOnce(makeSuccessResult());
    selectionStub = {
      ...selectionStub,
      unit: VALID_UNIT_ID,
      stimulus: VALID_STIM_ID,
    };

    renderPanel('ds-auto');

    expect(apiFetchMock).not.toHaveBeenCalled();

    await waitFor(
      () => {
        expect(apiFetchMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 },
    );
    const [url, init] = apiFetchMock.mock.calls[0]!;
    expect(url).toBe('/api/datasets/ds-auto/psth');
    expect(init).toMatchObject({
      method: 'POST',
      body: expect.objectContaining({
        unitDocId: VALID_UNIT_ID,
        stimulusDocId: VALID_STIM_ID,
      }),
    });
  });

  it('does NOT auto-run when only ONE dimension is set', async () => {
    selectionStub = { ...selectionStub, unit: VALID_UNIT_ID };

    renderPanel();

    // Wait twice the debounce + a generous slack to confirm no call
    // ever happens. If the implementation regressed and started
    // auto-running on a half-context, the apiFetch call would land
    // by the 800ms mark.
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('hides the auto-fill hint when the user edits the unit field', () => {
    selectionStub = {
      ...selectionStub,
      unit: VALID_UNIT_ID,
      stimulus: VALID_STIM_ID,
    };

    renderPanel();

    expect(screen.getByTestId('psth-auto-hint')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/unit document id/i), {
      target: { value: 'x' + VALID_UNIT_ID },
    });

    expect(screen.queryByTestId('psth-auto-hint')).not.toBeInTheDocument();
  });
});
