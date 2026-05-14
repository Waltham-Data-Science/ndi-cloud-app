/**
 * PsthPanel — workspace panel for peri-stimulus time histogram.
 * Covers form rendering, validation, the mutation round-trip,
 * chart mounting, the error-kind surface, and Show-Code wiring.
 * PsthChart + CodeExportButton are mocked so the test exercises
 * panel logic rather than chart internals.
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
  });

  afterEach(() => {
    vi.clearAllMocks();
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
