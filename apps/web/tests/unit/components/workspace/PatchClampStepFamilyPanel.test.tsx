/**
 * PatchClampStepFamilyPanel — pinned behaviors.
 *
 * The panel fetches a 1D signal via the existing fetch_signal route,
 * segments it by NaN gaps via `segmentByNanGaps`, and overlays sweeps
 * in an inline SVG. These tests assert the form-driven contract +
 * empty/loading/error states. The segmentation helper itself is
 * tested separately in segment-step-family.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock apiFetch so we can drive the response shape per test without
// real network round-trips.
const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (url: string) => apiFetchMock(url),
  ApiError: class extends Error {},
}));

// Mock CodeExportButton so we don't drag the modal in.
vi.mock('@/components/ai/CodeExportButton', () => ({
  CodeExportButton: ({ toolCalls }: { toolCalls: { toolName: string; args: unknown }[] }) => (
    <div
      data-testid="code-export-mock"
      data-tool={toolCalls[0]?.toolName}
      data-docid={(toolCalls[0]?.args as { docId?: string })?.docId ?? ''}
    />
  ),
}));

// Mock workspace selection. Default = no selection.
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
} = { subject: null, session: null, probe: null, stimulus: null, unit: null };

vi.mock('@/lib/workspace/use-workspace-selection', () => ({
  useWorkspaceSelection: () => ({
    selection: selectionStub,
    set: setMock,
    clear: clearMock,
    clearOne: clearOneMock,
    setPickerTab: setPickerTabMock,
  }),
}));

import { PatchClampStepFamilyPanel } from '@/components/workspace/PatchClampStepFamilyPanel';

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const VALID_DOC = '6'.repeat(24);

beforeEach(() => {
  apiFetchMock.mockReset();
  selectionStub = {
    subject: null,
    session: null,
    probe: null,
    stimulus: null,
    unit: null,
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PatchClampStepFamilyPanel', () => {
  it('renders the form + empty state on mount with no selection', () => {
    render(wrap(<PatchClampStepFamilyPanel datasetId="ds1" />));
    expect(screen.getByTestId('patch-clamp-docid-input')).toBeTruthy();
    expect(screen.getByTestId('patch-clamp-empty')).toBeTruthy();
  });

  it('shows the auto-fill hint when session selection is set', () => {
    selectionStub = {
      subject: null,
      session: VALID_DOC,
      probe: null,
      stimulus: null,
      unit: null,
    };
    render(wrap(<PatchClampStepFamilyPanel datasetId="ds1" />));
    expect(screen.getByTestId('patch-clamp-autofill-hint')).toBeTruthy();
  });

  it('shows a validation error on empty Run', async () => {
    const user = userEvent.setup();
    render(wrap(<PatchClampStepFamilyPanel datasetId="ds1" />));
    await user.click(screen.getByRole('button', { name: /run/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Document ID is required/i);
  });

  it('shows a validation error for malformed docId', async () => {
    const user = userEvent.setup();
    render(wrap(<PatchClampStepFamilyPanel datasetId="ds1" />));
    const input = screen.getByTestId('patch-clamp-docid-input');
    await user.type(input, 'not-a-hex-id');
    await user.click(screen.getByRole('button', { name: /run/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/24-char hex/i);
  });

  it('renders the chart when the API returns a multi-sweep signal', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue({
      channels: {
        Vm: [0.1, 0.2, 0.3, null, 0.4, 0.5, null, 0.6, 0.7, 0.8],
      },
      timestamps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      sample_count: 10,
      format: 'nbf',
    });
    render(wrap(<PatchClampStepFamilyPanel datasetId="ds1" />));
    const input = screen.getByTestId('patch-clamp-docid-input');
    await user.type(input, VALID_DOC);
    await user.click(screen.getByRole('button', { name: /run/i }));
    await waitFor(() => {
      expect(screen.getByTestId('step-family-chart')).toBeTruthy();
    });
  });

  it('renders the "no step-family pattern" message when signal has no NaN gaps', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue({
      channels: { Vm: [0.1, 0.2, 0.3, 0.4] },
      timestamps: [0, 1, 2, 3],
      sample_count: 4,
      format: 'nbf',
    });
    render(wrap(<PatchClampStepFamilyPanel datasetId="ds1" />));
    const input = screen.getByTestId('patch-clamp-docid-input');
    await user.type(input, VALID_DOC);
    await user.click(screen.getByRole('button', { name: /run/i }));
    await waitFor(() => {
      expect(screen.getByText(/No step-family pattern detected/i)).toBeTruthy();
    });
  });

  it('surfaces backend soft-errors verbatim', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue({
      channels: {},
      timestamps: null,
      sample_count: 0,
      format: 'unknown',
      error: 'unsupported_signal_format',
    });
    render(wrap(<PatchClampStepFamilyPanel datasetId="ds1" />));
    const input = screen.getByTestId('patch-clamp-docid-input');
    await user.type(input, VALID_DOC);
    await user.click(screen.getByRole('button', { name: /run/i }));
    await waitFor(() => {
      expect(screen.getByText(/Signal decode: unsupported_signal_format/i)).toBeTruthy();
    });
  });

  it('emits fetch_signal as the Show Code tool name after a run', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue({
      channels: { Vm: [1, 2, NaN, 3, 4] },
      timestamps: [0, 1, 2, 3, 4],
      sample_count: 5,
      format: 'nbf',
    });
    render(wrap(<PatchClampStepFamilyPanel datasetId="ds1" />));
    const input = screen.getByTestId('patch-clamp-docid-input');
    await user.type(input, VALID_DOC);
    await user.click(screen.getByRole('button', { name: /run/i }));
    await waitFor(() => {
      const codeButton = screen.getByTestId('code-export-mock');
      expect(codeButton.getAttribute('data-tool')).toBe('fetch_signal');
      expect(codeButton.getAttribute('data-docid')).toBe(VALID_DOC);
    });
  });
});
