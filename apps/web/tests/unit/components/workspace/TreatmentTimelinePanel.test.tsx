/**
 * TreatmentTimelinePanel — covers the parameter form mount, the apiFetch
 * call shape on Run, the temporal_source warning surface (explicit vs
 * ordinal), the empty-hint branch, the inline error branch, and the
 * Show-Code button's appearance after a successful Run.
 *
 * One-canvas redesign (2026-05-16): the panel now AUTO-RUNS on mount
 * with an empty body (backend picks defaults). Tests that need to
 * isolate manual-Run behavior assert against the SECOND call, not the
 * first.
 *
 * Both GanttChart and CodeExportButton are mocked so this test stays
 * focused on the panel's orchestration — those components carry their
 * own dedicated test suites (GanttChart isn't directly unit tested today
 * but its rendering is covered in apps/web/tests/unit/components/charts/
 * via a future round; CodeExportButton lives at
 * apps/web/tests/unit/components/ai/CodeExportButton.test.tsx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock GanttChart so the test asserts on the panel's wiring — the actual
// Plotly rendering is not under test here. The mock surfaces the props it
// received via data-testid attributes so each test can assert the panel
// forwarded chart_payload correctly.
vi.mock('@/components/ndi/charts/GanttChart', () => ({
  GanttChart: ({
    datasetId,
    title,
    items,
  }: {
    datasetId: string;
    title?: string;
    items: Array<{ subject: string; treatment: string }>;
  }) => (
    <div data-testid="gantt-chart-mock">
      <span data-testid="gantt-dataset-id">{datasetId}</span>
      <span data-testid="gantt-title">{title ?? ''}</span>
      <span data-testid="gantt-item-count">{items.length}</span>
    </div>
  ),
}));

// Mock CodeExportButton to a simple marker so we can assert it appeared
// (after success) without exercising the modal / snippet generation path.
vi.mock('@/components/ai/CodeExportButton', () => ({
  CodeExportButton: ({
    toolCalls,
  }: {
    toolCalls: Array<{ toolName: string; args: Record<string, unknown> }>;
  }) => (
    <div
      data-testid="code-export-button-mock"
      data-tool-name={toolCalls[0]?.toolName ?? ''}
    >
      Show code
    </div>
  ),
}));

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { TreatmentTimelinePanel } from '@/components/workspace/TreatmentTimelinePanel';
import { apiFetch } from '@/lib/api/client';

const mockedApiFetch = vi.mocked(apiFetch);

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  function Provider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Provider;
}

const explicitResponse = {
  chart_payload: {
    datasetId: 'ds1',
    title: 'Treatment timeline',
    items: [
      { subject: 'S1', treatment: 'Saline', start: 0, end: 30 },
      { subject: 'S1', treatment: 'CNO', start: 30, end: 60 },
      { subject: 'S2', treatment: 'Saline', start: 0, end: 30 },
    ],
  },
  total_subjects: 2,
  total_treatments: 3,
  temporal_source: 'explicit' as const,
};

const ordinalResponse = {
  chart_payload: {
    datasetId: 'ds1',
    items: [
      { subject: 'S1', treatment: 'Saline', start: 0, end: 1 },
      { subject: 'S1', treatment: 'CNO', start: 1, end: 2 },
    ],
    xLabel: 'Treatment order (ordinal)',
  },
  total_subjects: 1,
  total_treatments: 2,
  temporal_source: 'ordinal' as const,
};

const emptyResponse = {
  chart_payload: {
    datasetId: 'ds1',
    items: [],
  },
  total_subjects: 0,
  total_treatments: 0,
  temporal_source: 'ordinal' as const,
  empty_hint: {
    reason: 'no temporal info in treatment docs',
    available_columns: ['subject_id', 'treatment_name'],
  },
};

describe('<TreatmentTimelinePanel/>', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    // Default to a non-resolving mock so the auto-run-on-mount sits
    // pending and doesn't interfere with tests that don't care about it.
    mockedApiFetch.mockImplementation(() => new Promise(() => {}));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the parameter form (title + max subjects) on mount', () => {
    render(<TreatmentTimelinePanel datasetId="ds1" />, { wrapper: withClient() });
    expect(screen.getByText(/Treatment timeline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Max subjects/i)).toBeInTheDocument();
    expect(screen.getByTestId('treatment-timeline-run')).toHaveTextContent(/Running/i);
  });

  it('auto-runs on mount with an empty body (backend picks defaults)', async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValueOnce(explicitResponse);
    render(<TreatmentTimelinePanel datasetId="ds1" />, { wrapper: withClient() });

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    });
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/datasets/ds1/treatment-timeline',
      expect.objectContaining({
        method: 'POST',
        body: {},
      }),
    );
  });

  it('Run calls apiFetch with the right URL + body', async () => {
    // First call is the auto-run on mount; second call is the manual Run.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValueOnce(explicitResponse);
    mockedApiFetch.mockResolvedValueOnce(explicitResponse);
    const user = userEvent.setup();
    render(<TreatmentTimelinePanel datasetId="ds1" />, { wrapper: withClient() });

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    });

    await user.type(screen.getByLabelText(/Title/i), 'My chart');
    await user.type(screen.getByLabelText(/Max subjects/i), '10');
    await user.click(screen.getByTestId('treatment-timeline-run'));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    });
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      '/api/datasets/ds1/treatment-timeline',
      expect.objectContaining({
        method: 'POST',
        body: { title: 'My chart', maxSubjects: 10 },
      }),
    );
  });

  it('explicit timing: renders GanttChart with no warning text', async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValueOnce(explicitResponse);
    render(<TreatmentTimelinePanel datasetId="ds1" />, { wrapper: withClient() });

    await waitFor(() =>
      expect(screen.getByTestId('gantt-chart-mock')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('gantt-item-count')).toHaveTextContent('3');
    expect(screen.queryByTestId('treatment-timeline-ordinal-warning')).toBeNull();
    expect(
      screen.queryByText(/Bars show administration ORDER/i),
    ).toBeNull();
    expect(screen.getByTestId('treatment-timeline-meta')).toHaveTextContent(
      '2 subjects, 3 treatments',
    );
  });

  it('ordinal timing: renders GanttChart AND the order-not-time warning', async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValueOnce(ordinalResponse);
    render(<TreatmentTimelinePanel datasetId="ds1" />, { wrapper: withClient() });

    await waitFor(() =>
      expect(screen.getByTestId('gantt-chart-mock')).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId('treatment-timeline-ordinal-warning'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Bars show administration ORDER, not real time/i),
    ).toBeInTheDocument();
  });

  it('empty items + empty_hint: surfaces the hint plainly, no chart', async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValueOnce(emptyResponse);
    render(<TreatmentTimelinePanel datasetId="ds1" />, { wrapper: withClient() });

    await waitFor(() =>
      expect(screen.getByTestId('treatment-timeline-empty')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('gantt-chart-mock')).toBeNull();
    expect(
      screen.getByText(/no temporal info in treatment docs/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/subject_id, treatment_name/i)).toBeInTheDocument();
  });

  it('error: renders the inline error message', async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValueOnce(new Error('Dataset not found'));
    render(<TreatmentTimelinePanel datasetId="ds1" />, { wrapper: withClient() });

    await waitFor(() =>
      expect(screen.getByTestId('treatment-timeline-error')).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Couldn't run treatment timeline: Dataset not found/i),
    ).toBeInTheDocument();
  });

  it('Show Code button appears after a successful Run', async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValueOnce(explicitResponse);
    render(<TreatmentTimelinePanel datasetId="ds1" />, { wrapper: withClient() });

    await waitFor(() =>
      expect(screen.getByTestId('code-export-button-mock')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('code-export-button-mock')).toHaveAttribute(
      'data-tool-name',
      'treatment_timeline',
    );
  });
});
