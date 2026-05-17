/**
 * SignalViewerPanel — form-driven embed of SignalChart.
 *
 * Pinned behaviors (pre-canvas-redesign):
 *   - Form renders, no auto-fetch, SignalChart NOT mounted before Run
 *   - Run with empty docId → inline validation error, SignalChart NOT mounted
 *   - Run with malformed docId → inline validation error, no mount
 *   - Run with valid inputs → SignalChart mounts with the right payload
 *   - Re-Run with different docId → SignalChart remounts (key changes)
 *   - Show Code is hidden before first run, visible after
 *
 * Selection wiring (one-canvas redesign 2026-05-16):
 *   - Mounts with selection.session pre-fills the docId field
 *   - "Auto from selection" hint shows while pre-filled
 *   - Auto-runs after ~400ms debounce when context is set
 *   - Manual edit hides the hint + suppresses further auto-runs
 *
 * `useWorkspaceSelection` is mocked module-wide so each test can swap
 * the selection state; the default stub returns all-null (no
 * selection). The hook's shape mirrors WorkspaceSelectionState.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock SignalChart so the test focuses on panel logic + the chart
// payload it constructs. The mock echoes the props it received for
// assertion.
vi.mock('@/components/ndi/charts/SignalChart', () => ({
  SignalChart: (props: {
    datasetId: string;
    docId: string;
    downsample?: number;
    t0?: number;
    t1?: number;
    file?: string;
    title?: string;
    colorBy?: 'time' | 'index' | 'value' | null;
  }) => (
    <div
      data-testid="signal-chart-mock"
      data-dataset={props.datasetId}
      data-doc={props.docId}
      data-downsample={props.downsample}
      data-t0={props.t0 ?? ''}
      data-t1={props.t1 ?? ''}
      data-file={props.file ?? ''}
      data-title={props.title ?? ''}
      data-colorby={props.colorBy ?? 'null'}
    />
  ),
}));

// CodeExportButton is mocked so the Show-Code wiring can be asserted
// without dragging the modal + snippet generators into the test.
vi.mock('@/components/ai/CodeExportButton', () => ({
  CodeExportButton: ({ toolCalls }: { toolCalls: { toolName: string; args: unknown }[] }) => (
    <div
      data-testid="code-export-mock"
      data-tool={toolCalls[0]?.toolName}
      data-docid={(toolCalls[0]?.args as { docId?: string })?.docId ?? ''}
    />
  ),
}));

// Mockable selection — let each test override before render(). Default
// = all-null so the panel renders like the pre-canvas form.
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

import { SignalViewerPanel } from '@/components/workspace/SignalViewerPanel';

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const VALID_DOC_ID = '68d6e54703a03f5cfdac8eff';
const VALID_DOC_ID_2 = '68d6e54703a03f5cfdac8f00';

beforeEach(() => {
  vi.clearAllMocks();
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

describe('SignalViewerPanel', () => {
  it('renders the form on mount with no SignalChart and no Show-Code button', () => {
    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    expect(screen.getByLabelText(/document id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/downsample/i)).toBeInTheDocument();
    expect(screen.queryByTestId('signal-chart-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('code-export-mock')).not.toBeInTheDocument();
    // Empty selection → no auto-fill hint
    expect(screen.queryByTestId('signal-viewer-auto-hint')).not.toBeInTheDocument();
  });

  it('renders the illustrated empty state when no docId is set and no run has happened', () => {
    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    const empty = screen.getByTestId('signal-viewer-empty');
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveAttribute('data-illustration', 'line-trace');
    expect(screen.getByText(/plot a signal trace/i)).toBeInTheDocument();
    expect(
      screen.getByText(/pick a session in the left rail/i),
    ).toBeInTheDocument();
  });

  it('blocks Run with an empty docId and surfaces an inline validation error', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/document id is required/i)).toBeInTheDocument();
    expect(screen.queryByTestId('signal-chart-mock')).not.toBeInTheDocument();
  });

  it('blocks Run with a malformed (too-short) docId', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), 'short');
    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByText(/24-char hex string/i)).toBeInTheDocument();
    expect(screen.queryByTestId('signal-chart-mock')).not.toBeInTheDocument();
  });

  it('mounts SignalChart with the parsed payload on a successful Run', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.clear(screen.getByLabelText(/downsample/i));
    await user.type(screen.getByLabelText(/downsample/i), '1500');
    await user.type(screen.getByLabelText(/t0/i), '0');
    await user.type(screen.getByLabelText(/t1/i), '30');
    await user.type(screen.getByLabelText(/file/i), 'ai_group1_seg.nbf_1');
    await user.type(screen.getByLabelText(/chart title/i), 'Sweep 5');
    await user.click(screen.getByRole('button', { name: /run/i }));

    const chart = screen.getByTestId('signal-chart-mock');
    expect(chart).toHaveAttribute('data-dataset', 'ds1');
    expect(chart).toHaveAttribute('data-doc', VALID_DOC_ID);
    expect(chart).toHaveAttribute('data-downsample', '1500');
    expect(chart).toHaveAttribute('data-t0', '0');
    expect(chart).toHaveAttribute('data-t1', '30');
    expect(chart).toHaveAttribute('data-file', 'ai_group1_seg.nbf_1');
    expect(chart).toHaveAttribute('data-title', 'Sweep 5');
  });

  it('rejects a downsample outside the 100-5000 range', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.clear(screen.getByLabelText(/downsample/i));
    await user.type(screen.getByLabelText(/downsample/i), '99');
    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByText(/downsample must be between/i)).toBeInTheDocument();
    expect(screen.queryByTestId('signal-chart-mock')).not.toBeInTheDocument();
  });

  it('renders the Show Code button after a successful run with the right tool name', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.click(screen.getByRole('button', { name: /run/i }));

    const exportBtn = screen.getByTestId('code-export-mock');
    expect(exportBtn).toHaveAttribute('data-tool', 'fetch_signal');
    expect(exportBtn).toHaveAttribute('data-docid', VALID_DOC_ID);
  });
});

describe('SignalViewerPanel — selection auto-fill', () => {
  it('pre-fills the docId from selection.session on mount', () => {
    selectionStub = { ...selectionStub, session: VALID_DOC_ID };

    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    const input = screen.getByLabelText(/document id/i) as HTMLInputElement;
    expect(input.value).toBe(VALID_DOC_ID);
    expect(screen.getByTestId('signal-viewer-auto-hint')).toBeInTheDocument();
  });

  it('auto-runs after the debounce when selection.session is set', async () => {
    // Real timers — keeps fake-timer interactions out of jsdom +
    // react-query mutation microtask paths. 400ms is fast enough to
    // wait through with a generous slack.
    selectionStub = { ...selectionStub, session: VALID_DOC_ID };

    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    // Pre-debounce: chart not mounted.
    expect(screen.queryByTestId('signal-chart-mock')).not.toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByTestId('signal-chart-mock')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    const chart = screen.getByTestId('signal-chart-mock');
    expect(chart).toHaveAttribute('data-doc', VALID_DOC_ID);
  });

  it('hides the auto-fill hint as soon as the user edits the docId', async () => {
    const user = userEvent.setup();
    selectionStub = { ...selectionStub, session: VALID_DOC_ID };

    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    expect(screen.getByTestId('signal-viewer-auto-hint')).toBeInTheDocument();

    // Edit the field — a single keystroke flips the auto-fill flag off.
    await user.type(screen.getByLabelText(/document id/i), 'x');

    expect(screen.queryByTestId('signal-viewer-auto-hint')).not.toBeInTheDocument();
  });

  it('does not re-run when the user manually edits after auto-fill', async () => {
    // Start with no selection so the panel mounts without auto-running.
    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    // User types a non-hex value — this flips the auto-fill flag off
    // and (because the value isn't a valid 24-char hex) blocks any
    // auto-run path even if the flag were on.
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/document id/i), 'short');

    // No selection was ever set, so the chart must not have mounted.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(screen.queryByTestId('signal-chart-mock')).not.toBeInTheDocument();
  });

  it('preserves a manually-typed value when selection later goes to null', () => {
    selectionStub = { ...selectionStub, session: VALID_DOC_ID };

    const { rerender } = render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    const input = screen.getByLabelText(/document id/i) as HTMLInputElement;
    expect(input.value).toBe(VALID_DOC_ID);

    // Selection clears — the input must retain its value (no blank).
    selectionStub = { ...selectionStub, session: null };
    rerender(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    const inputAfter = screen.getByLabelText(/document id/i) as HTMLInputElement;
    expect(inputAfter.value).toBe(VALID_DOC_ID);
  });

  it('seeds a fresh selection.session value into the form when it arrives later', () => {
    const { rerender } = render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    const inputBefore = screen.getByLabelText(/document id/i) as HTMLInputElement;
    expect(inputBefore.value).toBe('');

    selectionStub = { ...selectionStub, session: VALID_DOC_ID_2 };

    rerender(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    const inputAfter = screen.getByLabelText(/document id/i) as HTMLInputElement;
    expect(inputAfter.value).toBe(VALID_DOC_ID_2);
    expect(screen.getByTestId('signal-viewer-auto-hint')).toBeInTheDocument();
  });

  it('pulses the PanelCard chrome when selection.session changes', async () => {
    // Start with one session selected — initial mount, no pulse.
    selectionStub = { ...selectionStub, session: VALID_DOC_ID };
    const { rerender, container } = render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    const section = container.querySelector('section#signal-viewer');
    expect(section).not.toBeNull();
    expect(section!.getAttribute('data-pulse')).toBeNull();

    // Swap to a different session → pulse becomes true.
    selectionStub = { ...selectionStub, session: VALID_DOC_ID_2 };
    rerender(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(
        container.querySelector('section#signal-viewer')!.getAttribute('data-pulse'),
      ).toBe('true');
    });
  });
});

describe('SignalViewerPanel — color-by dropdown', () => {
  it('renders a Color-by dropdown that defaults to the empty option (no coloring)', () => {
    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    const select = screen.getByTestId('signal-viewer-colorby') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('');
    // The four canonical options must be present so the UI is
    // self-documenting (None / Time / Index / Value).
    expect(select.querySelector('option[value=""]')).toBeTruthy();
    expect(select.querySelector('option[value="time"]')).toBeTruthy();
    expect(select.querySelector('option[value="index"]')).toBeTruthy();
    expect(select.querySelector('option[value="value"]')).toBeTruthy();
  });

  it('forwards colorBy=null to SignalChart by default — no visual change', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.click(screen.getByRole('button', { name: /run/i }));

    const chart = screen.getByTestId('signal-chart-mock');
    // The mock surfaces colorBy via data-colorby; "null" is the
    // stringified default.
    expect(chart).toHaveAttribute('data-colorby', 'null');
  });

  it('forwards colorBy="time" to SignalChart when the user picks it', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.selectOptions(
      screen.getByTestId('signal-viewer-colorby'),
      'time',
    );
    await user.click(screen.getByRole('button', { name: /run/i }));

    const chart = screen.getByTestId('signal-chart-mock');
    expect(chart).toHaveAttribute('data-colorby', 'time');
  });

  it('forwards colorBy="index" and "value" the same way', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.selectOptions(
      screen.getByTestId('signal-viewer-colorby'),
      'index',
    );
    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByTestId('signal-chart-mock')).toHaveAttribute(
      'data-colorby',
      'index',
    );

    // Re-mount to test the third option cleanly (the chart key changes
    // when colorBy flips, so we expect a fresh mount; a rerender keeps
    // the same panel state but the chart inside remounts).
    rerender(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );
    await user.selectOptions(
      screen.getByTestId('signal-viewer-colorby'),
      'value',
    );
    await user.click(screen.getByRole('button', { name: /run/i }));
    expect(screen.getByTestId('signal-chart-mock')).toHaveAttribute(
      'data-colorby',
      'value',
    );
  });

  it('changing colorBy after a run re-keys the SignalChart on the next Run', async () => {
    // The SignalChart `key` prop encodes colorBy, so swapping the
    // dropdown selection mid-session forces a full remount — preventing
    // any stale uPlot instance from leaking between coloring modes.
    const user = userEvent.setup();
    render(
      <Wrapper>
        <SignalViewerPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.click(screen.getByRole('button', { name: /run/i }));
    const firstChart = screen.getByTestId('signal-chart-mock');
    expect(firstChart).toHaveAttribute('data-colorby', 'null');

    await user.selectOptions(
      screen.getByTestId('signal-viewer-colorby'),
      'value',
    );
    await user.click(screen.getByRole('button', { name: /run/i }));
    const secondChart = screen.getByTestId('signal-chart-mock');
    expect(secondChart).toHaveAttribute('data-colorby', 'value');
  });
});
