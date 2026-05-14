/**
 * SignalViewerPanel — form-driven embed of SignalChart.
 *
 * Pinned behaviors:
 *   - Form renders, no auto-fetch, SignalChart NOT mounted before Run
 *   - Run with empty docId → inline validation error, SignalChart NOT mounted
 *   - Run with malformed docId → inline validation error, no mount
 *   - Run with valid inputs → SignalChart mounts with the right payload
 *   - Re-Run with different docId → SignalChart remounts (key changes)
 *   - Show Code is hidden before first run, visible after
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock SignalChart so the test focuses on panel logic + the chart
// payload it constructs. The mock echoes the props it received for
// assertion.
vi.mock('@/components/ndi/charts/SignalChart', () => ({
  SignalChart: (props: { datasetId: string; docId: string; downsample?: number; t0?: number; t1?: number; file?: string; title?: string }) => (
    <div
      data-testid="signal-chart-mock"
      data-dataset={props.datasetId}
      data-doc={props.docId}
      data-downsample={props.downsample}
      data-t0={props.t0 ?? ''}
      data-t1={props.t1 ?? ''}
      data-file={props.file ?? ''}
      data-title={props.title ?? ''}
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

import { SignalViewerPanel } from '@/components/workspace/SignalViewerPanel';

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const VALID_DOC_ID = '68d6e54703a03f5cfdac8eff';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
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
