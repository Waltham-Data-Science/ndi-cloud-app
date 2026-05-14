/**
 * BehavioralComparePanel — covers:
 *  1. Form renders on mount
 *  2. Variable name required → Run shows validation message
 *  3. Successful Run → ViolinChart + summary table render
 *  4. Empty result with empty_hint → column-pick retry buttons
 *  5. Clicking a column-pick retries with that column as groupBy
 *  6. Error → inline alert renders
 *  7. Show Code button appears after success
 *
 * We mock ViolinChart + CodeExportButton so the panel's wiring is the
 * unit under test, not the chart or modal internals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock ViolinChart so we don't drag Plotly into jsdom. We assert it
// renders and echoes the chart_payload values back for verification.
vi.mock('@/components/ndi/charts/ViolinChart', () => ({
  ViolinChart: (props: {
    datasetId: string;
    variableNameContains: string;
    groupBy?: string;
    title?: string;
  }) => (
    <div data-testid="violin-chart">
      <span data-testid="violin-dataset">{props.datasetId}</span>
      <span data-testid="violin-variable">{props.variableNameContains}</span>
      <span data-testid="violin-groupby">{props.groupBy ?? ''}</span>
      <span data-testid="violin-title">{props.title ?? ''}</span>
    </div>
  ),
}));

// Mock CodeExportButton (used inside ShowCodeButton) — we only need to
// assert that the pill renders after a successful run; the snippet
// logic has its own dedicated tests in lib/ai/code-export.
vi.mock('@/components/ai/CodeExportButton', () => ({
  CodeExportButton: (props: { toolCalls: Array<{ toolName: string }> }) => (
    <button data-testid="code-export-button" type="button">
      Show code [{props.toolCalls[0]?.toolName ?? ''}]
    </button>
  ),
}));

// Mock apiFetch so the mutation runs synchronously against canned
// responses.
// Partial mock — keep `ApiError` (a real class used by the panel's
// ErrorBox via `error instanceof ApiError`) and only stub the network
// boundary. Pattern matches SpikeActivityPanel / PsthPanel tests.
vi.mock('@/lib/api/client', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/client')>(
      '@/lib/api/client',
    );
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

import { BehavioralComparePanel } from '@/components/workspace/BehavioralComparePanel';
import { apiFetch } from '@/lib/api/client';

const mockedApiFetch = vi.mocked(apiFetch);

function withClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  function Provider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Provider;
}

const successResponse = {
  groups: [
    {
      name: 'Saline',
      count: 12,
      mean: 5.2,
      median: 5.0,
      std: 1.1,
      min: 3.0,
      max: 7.5,
      q1: 4.5,
      q3: 6.1,
    },
    {
      name: 'CNO',
      count: 14,
      mean: 8.3,
      median: 8.1,
      std: 1.4,
      min: 6.0,
      max: 11.0,
      q1: 7.4,
      q3: 9.2,
    },
  ],
};

const emptyWithHintResponse = {
  groups: [],
  _meta: {
    reason: "No column matched groupBy 'Treatment' in the selected table.",
    columns: ['Treatment_CNOOrSaline', 'Strain', 'AnimalID'],
  },
};

describe('<BehavioralComparePanel/>', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the parameter form on mount', () => {
    render(<BehavioralComparePanel datasetId="ds1" />, {
      wrapper: withClient(),
    });
    expect(
      screen.getByTestId('behavioral-compare-variable-input'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('behavioral-compare-groupby-input'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('behavioral-compare-grouporder-input'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('behavioral-compare-title-input'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('behavioral-compare-run'),
    ).toHaveTextContent(/run/i);
    // No result area until the first run.
    expect(
      screen.queryByTestId('behavioral-compare-result'),
    ).not.toBeInTheDocument();
  });

  it('shows a validation message when Run is clicked with empty variable name', async () => {
    const user = userEvent.setup();
    render(<BehavioralComparePanel datasetId="ds1" />, {
      wrapper: withClient(),
    });
    await user.click(screen.getByTestId('behavioral-compare-run'));
    expect(
      await screen.findByText(/Variable name is required/i),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('renders the violin chart + summary table on a successful run', async () => {
    mockedApiFetch.mockResolvedValueOnce(successResponse);
    const user = userEvent.setup();
    render(<BehavioralComparePanel datasetId="ds1" />, {
      wrapper: withClient(),
    });
    await user.type(
      screen.getByTestId('behavioral-compare-variable-input'),
      'ElevatedPlusMaze',
    );
    await user.type(
      screen.getByTestId('behavioral-compare-groupby-input'),
      'Treatment',
    );
    await user.click(screen.getByTestId('behavioral-compare-run'));

    await waitFor(() =>
      expect(screen.getByTestId('violin-chart')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('violin-dataset')).toHaveTextContent('ds1');
    expect(screen.getByTestId('violin-variable')).toHaveTextContent(
      'ElevatedPlusMaze',
    );
    expect(screen.getByTestId('violin-groupby')).toHaveTextContent('Treatment');

    // Summary table rows render once per group.
    const table = screen.getByTestId('behavioral-compare-summary-table');
    expect(table).toBeInTheDocument();
    expect(table).toHaveTextContent('Saline');
    expect(table).toHaveTextContent('CNO');
    expect(table).toHaveTextContent('12'); // n for Saline
    expect(table).toHaveTextContent('14'); // n for CNO

    // Verify the call shape — query string carries both filters.
    const calledUrl = mockedApiFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('/api/datasets/ds1/tabular_query');
    expect(calledUrl).toContain('variableNameContains=ElevatedPlusMaze');
    expect(calledUrl).toContain('groupBy=Treatment');
  });

  it('renders the column-pick retry buttons when the result is empty with empty_hint', async () => {
    mockedApiFetch.mockResolvedValueOnce(emptyWithHintResponse);
    const user = userEvent.setup();
    render(<BehavioralComparePanel datasetId="ds1" />, {
      wrapper: withClient(),
    });
    await user.type(
      screen.getByTestId('behavioral-compare-variable-input'),
      'ElevatedPlusMaze',
    );
    await user.type(
      screen.getByTestId('behavioral-compare-groupby-input'),
      'Treatment',
    );
    await user.click(screen.getByTestId('behavioral-compare-run'));

    await waitFor(() =>
      expect(
        screen.getByTestId('behavioral-compare-empty-hint'),
      ).toBeInTheDocument(),
    );
    const picks = screen.getAllByTestId('behavioral-compare-empty-column-pick');
    expect(picks).toHaveLength(3);
    expect(picks.map((b) => b.textContent)).toEqual([
      'Treatment_CNOOrSaline',
      'Strain',
      'AnimalID',
    ]);
    // The reason text is surfaced for context.
    expect(
      screen.getByText(/No column matched groupBy 'Treatment'/),
    ).toBeInTheDocument();
  });

  it('retries the query when a column-pick button is clicked', async () => {
    mockedApiFetch.mockResolvedValueOnce(emptyWithHintResponse);
    mockedApiFetch.mockResolvedValueOnce(successResponse);
    const user = userEvent.setup();
    render(<BehavioralComparePanel datasetId="ds1" />, {
      wrapper: withClient(),
    });
    await user.type(
      screen.getByTestId('behavioral-compare-variable-input'),
      'ElevatedPlusMaze',
    );
    await user.click(screen.getByTestId('behavioral-compare-run'));

    // First call returns empty + hint → picks render.
    await waitFor(() =>
      expect(
        screen.getByTestId('behavioral-compare-empty-hint'),
      ).toBeInTheDocument(),
    );
    const picks = screen.getAllByTestId('behavioral-compare-empty-column-pick');
    expect(picks[0]!).toHaveTextContent('Treatment_CNOOrSaline');

    // Click the first pick → mutation reruns with that column.
    await user.click(picks[0]!);
    await waitFor(() =>
      expect(screen.getByTestId('violin-chart')).toBeInTheDocument(),
    );
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    const secondUrl = mockedApiFetch.mock.calls[1]![0] as string;
    expect(secondUrl).toContain('groupBy=Treatment_CNOOrSaline');
    // The groupBy input was updated so the user can see what fired.
    expect(
      (screen.getByTestId('behavioral-compare-groupby-input') as HTMLInputElement)
        .value,
    ).toBe('Treatment_CNOOrSaline');
  });

  it('renders an inline error when the request fails', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('Network down'));
    const user = userEvent.setup();
    render(<BehavioralComparePanel datasetId="ds1" />, {
      wrapper: withClient(),
    });
    await user.type(
      screen.getByTestId('behavioral-compare-variable-input'),
      'ElevatedPlusMaze',
    );
    await user.click(screen.getByTestId('behavioral-compare-run'));
    await waitFor(() =>
      expect(
        screen.getByTestId('behavioral-compare-error'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Network down/)).toBeInTheDocument();
  });

  it('renders the Show code button after a successful run', async () => {
    mockedApiFetch.mockResolvedValueOnce(successResponse);
    const user = userEvent.setup();
    render(<BehavioralComparePanel datasetId="ds1" />, {
      wrapper: withClient(),
    });
    // Before any run, the Show code button is not present.
    expect(
      screen.queryByTestId('code-export-button'),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByTestId('behavioral-compare-variable-input'),
      'ElevatedPlusMaze',
    );
    await user.click(screen.getByTestId('behavioral-compare-run'));
    await waitFor(() =>
      expect(screen.getByTestId('violin-chart')).toBeInTheDocument(),
    );
    const btn = screen.getByTestId('code-export-button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('tabular_query');
  });
});
