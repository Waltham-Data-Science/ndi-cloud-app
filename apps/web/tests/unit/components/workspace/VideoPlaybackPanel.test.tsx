/**
 * VideoPlaybackPanel — workspace panel for playing back imageStack
 * video documents (Bhar B10 behavioral video, Haley H12 microscopy
 * video). Pinned behaviors:
 *
 *   - Renders an empty state when no docId is set + no run has happened
 *   - Run with empty docId → inline validation error, viewer NOT mounted
 *   - Run with malformed docId → inline validation error, no mount
 *   - Run with valid id → useDocument query fires; while loading shows
 *     skeleton
 *   - Doc resolves to an imageStack video → ImageStackVideoViewer mounts
 *   - Doc resolves to a non-imageStack class → unsupported message
 *   - Doc resolves to imageStack without video formatOntology → unsupported
 *   - Show Code button is hidden until first run, then visible with the
 *     right tool name
 *   - selection.session pre-fills the docId field + shows auto-hint
 *
 * Pattern follows SignalViewerPanel.test.tsx: hooks + child viewer +
 * CodeExportButton are mocked so the test exercises panel routing
 * logic without dragging the `<video>` element or apiFetch in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock the reused viewer so we can assert the panel routes the right
// inputs through without instantiating a real <video> element.
vi.mock('@/components/app/ImageStackVideoViewer', () => ({
  ImageStackVideoViewer: (props: { datasetId: string; documentId: string }) => (
    <div
      data-testid="imagestack-video-mock"
      data-dataset={props.datasetId}
      data-doc={props.documentId}
    />
  ),
}));

// Mock CodeExportButton to verify the Show-Code wiring without dragging
// the snippet generator + modal in.
vi.mock('@/components/ai/CodeExportButton', () => ({
  CodeExportButton: ({ toolCalls }: { toolCalls: { toolName: string; args: unknown }[] }) => (
    <div
      data-testid="code-export-mock"
      data-tool={toolCalls[0]?.toolName}
      data-docid={(toolCalls[0]?.args as { docId?: string })?.docId ?? ''}
    />
  ),
}));

// Mockable useDocument — let each test stub the response shape.
const useDocumentMock = vi.fn();
vi.mock('@/lib/api/documents', () => ({
  useDocument: (...args: unknown[]) => useDocumentMock(...args),
}));

// Mockable selection state. Default = all-null so the panel mounts
// with no auto-fill.
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

import { VideoPlaybackPanel } from '@/components/workspace/VideoPlaybackPanel';

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const VALID_DOC_ID = '68d6e54703a03f5cfdac8eff';

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
  // Default: no payload yet → useDocument returns the "not enabled" shape.
  useDocumentMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('VideoPlaybackPanel', () => {
  it('renders the form on mount with no viewer and no Show-Code button', () => {
    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    expect(screen.getByLabelText(/document id/i)).toBeInTheDocument();
    expect(screen.queryByTestId('imagestack-video-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('code-export-mock')).not.toBeInTheDocument();
    // Empty selection → no auto-fill hint
    expect(screen.queryByTestId('video-playback-auto-hint')).not.toBeInTheDocument();
  });

  it('renders the illustrated empty state when no docId is set and no run has happened', () => {
    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    const empty = screen.getByTestId('video-playback-empty');
    expect(empty).toBeInTheDocument();
    expect(screen.getByText(/pick a video document to play/i)).toBeInTheDocument();
  });

  it('blocks Run with an empty docId and surfaces an inline validation error', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/document id is required/i)).toBeInTheDocument();
    expect(screen.queryByTestId('imagestack-video-mock')).not.toBeInTheDocument();
  });

  it('blocks Run with a malformed (too-short) docId', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), 'short');
    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(
      screen.getByText(
        /24-char hex Mongo id OR a 16\+16 hex NDI id/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('imagestack-video-mock')).not.toBeInTheDocument();
  });

  it('shows the loading skeleton while the doc query is pending after Run', async () => {
    const user = userEvent.setup();
    useDocumentMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByTestId('video-playback-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('imagestack-video-mock')).not.toBeInTheDocument();
  });

  it('mounts ImageStackVideoViewer when the doc resolves to an imageStack with video formatOntology', async () => {
    const user = userEvent.setup();
    useDocumentMock.mockReturnValue({
      data: {
        id: VALID_DOC_ID,
        className: 'imageStack',
        data: {
          imageStack: { formatOntology: 'NCIT:C190180' },
        },
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.click(screen.getByRole('button', { name: /run/i }));

    const viewer = screen.getByTestId('imagestack-video-mock');
    expect(viewer).toHaveAttribute('data-dataset', 'ds1');
    expect(viewer).toHaveAttribute('data-doc', VALID_DOC_ID);
    expect(screen.queryByTestId('video-playback-unsupported')).not.toBeInTheDocument();
  });

  it('renders the unsupported message when the doc resolves to a non-imageStack class', async () => {
    const user = userEvent.setup();
    useDocumentMock.mockReturnValue({
      data: {
        id: VALID_DOC_ID,
        className: 'element_epoch',
        data: {},
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByTestId('video-playback-unsupported')).toBeInTheDocument();
    expect(
      screen.getByText(/this document does not contain playable video/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('imagestack-video-mock')).not.toBeInTheDocument();
  });

  it('renders the unsupported message when the doc is an imageStack but not a video format', async () => {
    const user = userEvent.setup();
    useDocumentMock.mockReturnValue({
      data: {
        id: VALID_DOC_ID,
        className: 'imageStack',
        data: {
          // PNG-family format ontology — NOT video. Real production case
          // for Haley's H12 PNG imageStacks.
          imageStack: { formatOntology: 'NCIT:C70631' },
        },
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByTestId('video-playback-unsupported')).toBeInTheDocument();
    expect(screen.queryByTestId('imagestack-video-mock')).not.toBeInTheDocument();
    // The unsupported copy mentions the format ontology we did find.
    expect(screen.getByText(/NCIT:C70631/)).toBeInTheDocument();
  });

  it('renders an error message when the doc fetch itself fails', async () => {
    const user = userEvent.setup();
    useDocumentMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.click(screen.getByRole('button', { name: /run/i }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    // The rendered copy uses `&rsquo;` (curly apostrophe) — match
    // either ASCII or curly to keep the test resilient to typography
    // tweaks.
    expect(
      screen.getByText(/couldn['’]t load that document/i),
    ).toBeInTheDocument();
  });

  it('renders the Show Code button after a successful run with the right tool name', async () => {
    const user = userEvent.setup();
    useDocumentMock.mockReturnValue({
      data: {
        id: VALID_DOC_ID,
        className: 'imageStack',
        data: { imageStack: { formatOntology: 'NCIT:C190180' } },
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/document id/i), VALID_DOC_ID);
    await user.click(screen.getByRole('button', { name: /run/i }));

    const exportBtn = screen.getByTestId('code-export-mock');
    expect(exportBtn).toHaveAttribute('data-tool', 'get_document');
    expect(exportBtn).toHaveAttribute('data-docid', VALID_DOC_ID);
  });
});

describe('VideoPlaybackPanel — selection auto-fill', () => {
  it('pre-fills the docId from selection.session on mount and shows the auto hint', () => {
    selectionStub = { ...selectionStub, session: VALID_DOC_ID };

    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    const input = screen.getByLabelText(/document id/i) as HTMLInputElement;
    expect(input.value).toBe(VALID_DOC_ID);
    expect(screen.getByTestId('video-playback-auto-hint')).toBeInTheDocument();
  });

  it('auto-runs after the debounce when selection.session is set', async () => {
    selectionStub = { ...selectionStub, session: VALID_DOC_ID };
    useDocumentMock.mockReturnValue({
      data: {
        id: VALID_DOC_ID,
        className: 'imageStack',
        data: { imageStack: { formatOntology: 'NCIT:C190180' } },
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    // Pre-debounce: viewer not mounted.
    expect(screen.queryByTestId('imagestack-video-mock')).not.toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByTestId('imagestack-video-mock')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it('hides the auto-fill hint as soon as the user edits the docId', async () => {
    const user = userEvent.setup();
    selectionStub = { ...selectionStub, session: VALID_DOC_ID };

    render(
      <Wrapper>
        <VideoPlaybackPanel datasetId="ds1" />
      </Wrapper>,
    );

    expect(screen.getByTestId('video-playback-auto-hint')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/document id/i), 'x');

    expect(screen.queryByTestId('video-playback-auto-hint')).not.toBeInTheDocument();
  });
});
