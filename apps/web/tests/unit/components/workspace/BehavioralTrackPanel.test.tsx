/**
 * BehavioralTrackPanel — form-driven embed of TrajectoryChart.
 *
 * Pinned behaviors (mirrors SignalViewerPanel for the form-staging +
 * selection-bridge contract; only the icon/title/illustration/
 * tool-name differ):
 *
 *   - Form renders, no auto-fetch, TrajectoryChart NOT mounted before Run
 *   - Empty state uses the "scatter" illustration
 *   - Run with empty docId → inline validation error
 *   - Run with malformed docId → inline validation error
 *   - Run with valid inputs → TrajectoryChart mounts with the right payload
 *   - Re-Run with different docId → TrajectoryChart remounts (key changes)
 *   - Show Code is hidden before first run, visible after, named "fetch_signal"
 *
 * Selection wiring:
 *   - Mounts with selection.session pre-fills the docId field
 *   - "Auto from selection" hint shows while pre-filled
 *   - Auto-runs after ~400ms debounce when context is set
 *   - Manual edit hides the hint + suppresses further auto-runs
 *
 * `useWorkspaceSelection` is mocked module-wide.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/components/ndi/charts/TrajectoryChart', () => ({
  TrajectoryChart: (props: {
    datasetId: string;
    docId: string;
    downsample?: number;
    t0?: number;
    t1?: number;
    file?: string;
    title?: string;
    xChannel?: string;
    yChannel?: string;
  }) => (
    <div
      data-testid="trajectory-chart-mock"
      data-dataset={props.datasetId}
      data-doc={props.docId}
      data-downsample={props.downsample}
      data-t0={props.t0 ?? ''}
      data-t1={props.t1 ?? ''}
      data-file={props.file ?? ''}
      data-title={props.title ?? ''}
      data-xchannel={props.xChannel ?? ''}
      data-ychannel={props.yChannel ?? ''}
    />
  ),
}));

vi.mock('@/components/ai/CodeExportButton', () => ({
  CodeExportButton: ({ toolCalls }: { toolCalls: { toolName: string; args: unknown }[] }) => (
    <div
      data-testid="code-export-mock"
      data-tool={toolCalls[0]?.toolName}
      data-docid={(toolCalls[0]?.args as { docId?: string })?.docId ?? ''}
    />
  ),
}));

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

import { BehavioralTrackPanel } from '@/components/workspace/BehavioralTrackPanel';

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

describe('BehavioralTrackPanel', () => {
  it('renders the form on mount with no chart and no Show-Code button', () => {
    render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    expect(screen.getByLabelText(/document id \(x axis\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/downsample/i)).toBeInTheDocument();
    expect(screen.queryByTestId('trajectory-chart-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('code-export-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('behavioral-track-auto-hint')).not.toBeInTheDocument();
  });

  it('renders the scatter empty-state illustration when no docId is set', () => {
    render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    const empty = screen.getByTestId('behavioral-track-empty');
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveAttribute('data-illustration', 'scatter');
    expect(screen.getByText(/plot an xy trajectory/i)).toBeInTheDocument();
  });

  it('blocks Run with an empty docId and surfaces a validation error', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/document id is required/i)).toBeInTheDocument();
    expect(screen.queryByTestId('trajectory-chart-mock')).not.toBeInTheDocument();
  });

  it('blocks Run with a malformed (too-short) docId', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id \(x axis\)/i), 'short');
    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByText(/24-char hex string/i)).toBeInTheDocument();
    expect(screen.queryByTestId('trajectory-chart-mock')).not.toBeInTheDocument();
  });

  it('mounts TrajectoryChart with the parsed payload on a successful Run', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id \(x axis\)/i), VALID_DOC_ID);
    await user.clear(screen.getByLabelText(/downsample/i));
    await user.type(screen.getByLabelText(/downsample/i), '1500');
    await user.type(screen.getByLabelText(/t0/i), '0');
    await user.type(screen.getByLabelText(/t1/i), '30');
    await user.click(screen.getByRole('button', { name: /run/i }));

    const chart = screen.getByTestId('trajectory-chart-mock');
    expect(chart).toHaveAttribute('data-dataset', 'ds1');
    expect(chart).toHaveAttribute('data-doc', VALID_DOC_ID);
    expect(chart).toHaveAttribute('data-downsample', '1500');
    expect(chart).toHaveAttribute('data-t0', '0');
    expect(chart).toHaveAttribute('data-t1', '30');
  });

  it('passes explicit x/y channel hints through to the chart', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id \(x axis\)/i), VALID_DOC_ID);
    await user.type(screen.getByLabelText(/^x channel/i), 'pos_x');
    await user.type(screen.getByLabelText(/^y channel/i), 'pos_y');
    await user.click(screen.getByRole('button', { name: /run/i }));

    const chart = screen.getByTestId('trajectory-chart-mock');
    expect(chart).toHaveAttribute('data-xchannel', 'pos_x');
    expect(chart).toHaveAttribute('data-ychannel', 'pos_y');
  });

  it('rejects a downsample outside the 100-5000 range', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id \(x axis\)/i), VALID_DOC_ID);
    await user.clear(screen.getByLabelText(/downsample/i));
    await user.type(screen.getByLabelText(/downsample/i), '99');
    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByText(/downsample must be between/i)).toBeInTheDocument();
    expect(screen.queryByTestId('trajectory-chart-mock')).not.toBeInTheDocument();
  });

  it('emits Show Code with the fetch_signal tool name after a successful run', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id \(x axis\)/i), VALID_DOC_ID);
    await user.click(screen.getByRole('button', { name: /run/i }));

    const exportBtn = screen.getByTestId('code-export-mock');
    expect(exportBtn).toHaveAttribute('data-tool', 'fetch_signal');
    expect(exportBtn).toHaveAttribute('data-docid', VALID_DOC_ID);
  });
});

describe('BehavioralTrackPanel — selection auto-fill', () => {
  it('pre-fills the docId from selection.session on mount', () => {
    selectionStub = { ...selectionStub, session: VALID_DOC_ID };

    render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    const input = screen.getByLabelText(/document id \(x axis\)/i) as HTMLInputElement;
    expect(input.value).toBe(VALID_DOC_ID);
    expect(screen.getByTestId('behavioral-track-auto-hint')).toBeInTheDocument();
  });

  it('auto-runs after the debounce when selection.session is set', async () => {
    selectionStub = { ...selectionStub, session: VALID_DOC_ID };

    render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    expect(screen.queryByTestId('trajectory-chart-mock')).not.toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByTestId('trajectory-chart-mock')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    const chart = screen.getByTestId('trajectory-chart-mock');
    expect(chart).toHaveAttribute('data-doc', VALID_DOC_ID);
  });

  it('hides the auto-fill hint as soon as the user edits the docId', async () => {
    const user = userEvent.setup();
    selectionStub = { ...selectionStub, session: VALID_DOC_ID };

    render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    expect(screen.getByTestId('behavioral-track-auto-hint')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/document id \(x axis\)/i), 'x');

    expect(screen.queryByTestId('behavioral-track-auto-hint')).not.toBeInTheDocument();
  });

  it('seeds a fresh selection.session value into the form when it arrives later', () => {
    const { rerender } = render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    const inputBefore = screen.getByLabelText(/document id \(x axis\)/i) as HTMLInputElement;
    expect(inputBefore.value).toBe('');

    selectionStub = { ...selectionStub, session: VALID_DOC_ID_2 };

    rerender(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    const inputAfter = screen.getByLabelText(/document id \(x axis\)/i) as HTMLInputElement;
    expect(inputAfter.value).toBe(VALID_DOC_ID_2);
    expect(screen.getByTestId('behavioral-track-auto-hint')).toBeInTheDocument();
  });

  it('pulses the PanelCard chrome when selection.session changes', async () => {
    selectionStub = { ...selectionStub, session: VALID_DOC_ID };
    const { rerender, container } = render(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    const section = container.querySelector('section#behavioral-track');
    expect(section).not.toBeNull();
    expect(section!.getAttribute('data-pulse')).toBeNull();

    selectionStub = { ...selectionStub, session: VALID_DOC_ID_2 };
    rerender(
      <Wrapper>
        <BehavioralTrackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(
        container.querySelector('section#behavioral-track')!.getAttribute('data-pulse'),
      ).toBe('true');
    });
  });
});
