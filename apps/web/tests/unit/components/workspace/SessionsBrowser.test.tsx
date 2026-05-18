/**
 * SessionsBrowser — pure filter coverage + picker-rail wiring.
 *
 * Phase G7 (2026-05-16). The browser now delegates row rendering to
 * the shared `WorkspaceDataGrid` primitive. We stub the grid (its own
 * tests cover internals) and assert the picker hands it the right
 * factory callbacks:
 *
 *   - `rowId(row)` returns the epoch doc id
 *   - `contextMenuActions(row)` includes "Set as primary session",
 *     "Copy ID", "Plot signal trace", "Open in Document Detail" —
 *     each dispatches the right side-effect
 *   - `bulkActions(ids)` includes "Copy N IDs" and "Ask Claude"
 *   - `onPrimaryChange(id)` calls set({ session: id })
 *
 * The pure `filterEpochs` / `formatEpochTime` helpers are unchanged
 * (the grid migration didn't touch them).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  filterEpochs,
  formatEpochTime,
} from '@/components/workspace/SessionsBrowser';
import type { BulkAction } from '@/components/workspace/canvas/DataGridBulkActions';
import type {
  ContextMenuEntry,
  ContextMenuItem,
} from '@/components/workspace/canvas/DataGridContextMenu';

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
    pickerTab: 'sessions',
    setPickerTab: setPickerTabMock,
    hasAnySelection:
      selectionStub.subject !== null ||
      selectionStub.session !== null ||
      selectionStub.probe !== null ||
      selectionStub.stimulus !== null ||
      selectionStub.unit !== null,
  }),
}));

let searchParamsStub: URLSearchParams = new URLSearchParams();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => searchParamsStub,
  usePathname: () => '/my/workspace/ds-test',
}));

const EPOCH_DOC_ID_1 = '68d6e54703a03f5cfdac8e01';
const EPOCH_DOC_ID_2 = '68d6e54703a03f5cfdac8e02';
const EPOCH_DOC_ID_3 = '68d6e54703a03f5cfdac8e03';
const SUBJ_ID_A = '68d6e54703a03f5cfdac8a01';
const SUBJ_ID_B = '68d6e54703a03f5cfdac8a02';

const FIXTURE_EPOCHS = {
  columns: [
    { key: 'epochNumber', label: 'Epoch' },
    { key: 'subjectDocumentIdentifier', label: 'Subject' },
    { key: 'epochStart', label: 'Start' },
    { key: 'approachName', label: 'Approach' },
  ],
  rows: [
    {
      epochDocumentIdentifier: EPOCH_DOC_ID_1,
      epochNumber: 'epoch_1',
      subjectDocumentIdentifier: SUBJ_ID_A,
      epochStart: { devTime: 0, globalTime: '2023-06-14T10:00:00Z' },
      epochStop: { devTime: 60, globalTime: '2023-06-14T10:01:00Z' },
      approachName: 'patch-Vm',
    },
    {
      epochDocumentIdentifier: EPOCH_DOC_ID_2,
      epochNumber: 'epoch_2',
      subjectDocumentIdentifier: SUBJ_ID_A,
      epochStart: { devTime: 0, globalTime: '2024-01-08T14:00:00Z' },
      epochStop: { devTime: 120, globalTime: '2024-01-08T14:02:00Z' },
      approachName: 'patch-I',
    },
    {
      epochDocumentIdentifier: EPOCH_DOC_ID_3,
      epochNumber: 'epoch_3',
      subjectDocumentIdentifier: SUBJ_ID_B,
      epochStart: { devTime: 0, globalTime: '2025-02-01T09:00:00Z' },
      epochStop: { devTime: 30, globalTime: '2025-02-01T09:00:30Z' },
      approachName: 'stimulator',
    },
  ],
};

vi.mock('@/lib/api/tables', () => ({
  useSummaryTable: () => ({
    data: FIXTURE_EPOCHS,
    isLoading: false,
    isError: false,
  }),
}));

// Stub the grid — capture props so we can drive them in the test.
interface CapturedGridProps {
  data: unknown[];
  rowId: (row: unknown) => string;
  noun: string;
  primaryId: string | null;
  onPrimaryChange: (id: string | null) => void;
  contextMenuActions: (row: unknown) => ReadonlyArray<ContextMenuEntry>;
  bulkActions: (ids: ReadonlyArray<string>) => ReadonlyArray<BulkAction>;
  lockedColumnIds?: ReadonlyArray<string>;
}

let captured: CapturedGridProps | null = null;

vi.mock('@/components/workspace/canvas/WorkspaceDataGrid', () => ({
  WorkspaceDataGrid: (props: CapturedGridProps) => {
    captured = props;
    return (
      <div data-testid="workspace-data-grid-stub">
        <span data-testid="grid-noun">{props.noun}</span>
        <span data-testid="grid-row-count">{props.data.length}</span>
        <span data-testid="grid-primary-id">{props.primaryId ?? 'none'}</span>
      </div>
    );
  },
}));

import { SessionsBrowser } from '@/components/workspace/SessionsBrowser';

function withProviders(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  setMock.mockReset();
  clearMock.mockReset();
  clearOneMock.mockReset();
  setPickerTabMock.mockReset();
  replaceMock.mockReset();
  searchParamsStub = new URLSearchParams();
  selectionStub = {
    subject: null,
    session: null,
    probe: null,
    stimulus: null,
    unit: null,
  };
  captured = null;
});

afterEach(() => {
  searchParamsStub = new URLSearchParams();
});

// ── Pure helpers — unchanged from Phase C. ────────────────────────
const SAMPLE = [
  {
    epochDocumentIdentifier: 'e1',
    epochNumber: '1',
    subjectDocumentIdentifier: 'subj-A',
    probeDocumentIdentifier: 'probe-X',
    epochStart: { devTime: 0, globalTime: '2023-06-14T10:00:00Z' },
    epochStop: { devTime: 60, globalTime: '2023-06-14T10:01:00Z' },
    approachName: 'patch-Vm',
  },
  {
    epochDocumentIdentifier: 'e2',
    epochNumber: '2',
    subjectDocumentIdentifier: 'subj-A',
    probeDocumentIdentifier: 'probe-Y',
    epochStart: { devTime: 0, globalTime: '2024-01-08T14:00:00Z' },
    epochStop: { devTime: 120, globalTime: '2024-01-08T14:02:00Z' },
    approachName: 'patch-I',
  },
  {
    epochDocumentIdentifier: 'e3',
    epochNumber: '3',
    subjectDocumentIdentifier: 'subj-B',
    probeDocumentIdentifier: 'probe-X',
    epochStart: { devTime: 0, globalTime: null },
    epochStop: { devTime: 30, globalTime: null },
    approachName: 'stimulator',
  },
];

describe('formatEpochTime', () => {
  it('prefers globalTime when present', () => {
    expect(formatEpochTime(SAMPLE[0]!.epochStart)).toBe(
      '2023-06-14T10:00:00Z',
    );
  });

  it('falls back to devTime when globalTime is null', () => {
    expect(formatEpochTime(SAMPLE[2]!.epochStart)).toBe('0');
  });

  it('returns em-dash when both fields are missing', () => {
    expect(formatEpochTime({ devTime: null, globalTime: null })).toBe('—');
    expect(formatEpochTime({})).toBe('—');
  });

  it('returns em-dash for null input', () => {
    expect(formatEpochTime(null)).toBe('—');
  });
});

describe('filterEpochs', () => {
  it('returns every row when all filters are empty', () => {
    expect(
      filterEpochs(SAMPLE, { subject: '', window: '', probe: '' }),
    ).toHaveLength(SAMPLE.length);
  });

  it('filters by subject id substring (case-insensitive)', () => {
    const rows = filterEpochs(SAMPLE, {
      subject: 'SUBJ-A',
      window: '',
      probe: '',
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.subjectDocumentIdentifier === 'subj-A')).toBe(
      true,
    );
  });

  it('filters by probe id substring', () => {
    const rows = filterEpochs(SAMPLE, {
      subject: '',
      window: '',
      probe: 'probe-X',
    });
    expect(rows).toHaveLength(2);
  });

  it('filters by time-window substring against globalTime', () => {
    const rows = filterEpochs(SAMPLE, {
      subject: '',
      window: '2023-06',
      probe: '',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.epochDocumentIdentifier).toBe('e1');
  });

  it('matches window filter against devTime when globalTime is null', () => {
    const rows = filterEpochs(SAMPLE, {
      subject: '',
      window: '30', // matches e3's stop.devTime
      probe: '',
    });
    expect(rows.some((r) => r.epochDocumentIdentifier === 'e3')).toBe(true);
  });

  it('combines subject + probe filters with AND semantics', () => {
    const rows = filterEpochs(SAMPLE, {
      subject: 'subj-A',
      window: '',
      probe: 'probe-Y',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.epochDocumentIdentifier).toBe('e2');
  });

  it('returns no rows when filters are mutually exclusive', () => {
    const rows = filterEpochs(SAMPLE, {
      subject: 'subj-A',
      window: '',
      probe: 'probe-Z',
    });
    expect(rows).toEqual([]);
  });
});

// ── Picker → grid wiring. ─────────────────────────────────────────
describe('SessionsBrowser — grid wiring', () => {
  it('renders the grid stub with the session noun', () => {
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(screen.getByTestId('grid-noun')).toHaveTextContent('session');
  });

  it('forwards the active session as the grid primaryId', () => {
    selectionStub.session = EPOCH_DOC_ID_1;
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(screen.getByTestId('grid-primary-id')).toHaveTextContent(
      EPOCH_DOC_ID_1,
    );
  });

  it('rowId resolves to epochDocumentIdentifier', () => {
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(captured).not.toBeNull();
    expect(
      captured!.rowId({ epochDocumentIdentifier: EPOCH_DOC_ID_1 }),
    ).toBe(EPOCH_DOC_ID_1);
  });

  it('onPrimaryChange writes through set({ session })', () => {
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    captured!.onPrimaryChange(EPOCH_DOC_ID_1);
    expect(setMock).toHaveBeenCalledWith({ session: EPOCH_DOC_ID_1 });
  });

  it('locks the primary (first server-emitted) column', () => {
    // Audit 2026-05-18 follow-up: dynamic columns from backend; the
    // first server-emitted column (here `epochNumber`) is locked.
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(captured!.lockedColumnIds).toHaveLength(1);
    expect(captured!.lockedColumnIds![0]).toBe('epochNumber');
  });
});

// ── Subject cascade. ──────────────────────────────────────────────
describe('SessionsBrowser — subject cascade', () => {
  it('passes all epochs to the grid when no subject is selected', () => {
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(screen.getByTestId('grid-row-count')).toHaveTextContent('3');
  });

  it('narrows the grid data to only the cascade subject\'s epochs', () => {
    selectionStub.subject = SUBJ_ID_A;
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(screen.getByTestId('grid-row-count')).toHaveTextContent('2');
  });

  it('renders the cascade hint when subject is set', () => {
    selectionStub.subject = SUBJ_ID_A;
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(
      screen.getByTestId('sessions-cascade-hint'),
    ).toBeInTheDocument();
  });

  it('hides the cascade hint when no subject is set', () => {
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(screen.queryByTestId('sessions-cascade-hint')).toBeNull();
  });
});

// ── Context-menu factory. ─────────────────────────────────────────
describe('SessionsBrowser — context menu actions', () => {
  it('builds the canonical action list per row', () => {
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    const actions = captured!.contextMenuActions({
      epochDocumentIdentifier: EPOCH_DOC_ID_1,
    });
    const itemLabels = actions
      .filter((a): a is ContextMenuItem => a.kind === 'item')
      .map((a) => a.label);
    expect(itemLabels).toEqual([
      'Set as primary session',
      'Copy ID',
      'Plot signal trace for this session',
      'Open in Document Detail',
    ]);
  });

  it('"Set as primary session" calls set({ session: id })', () => {
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    const actions = captured!.contextMenuActions({
      epochDocumentIdentifier: EPOCH_DOC_ID_1,
    });
    const item = actions.find(
      (a): a is ContextMenuItem =>
        a.kind === 'item' && a.label === 'Set as primary session',
    );
    item!.onSelect();
    expect(setMock).toHaveBeenCalledWith({ session: EPOCH_DOC_ID_1 });
  });

  it('"Plot signal trace" sets the session and scrolls SignalViewer into view', () => {
    const scrollIntoView = vi.fn();
    const target = document.createElement('div');
    target.id = 'signal-viewer';
    Object.defineProperty(target, 'scrollIntoView', {
      value: scrollIntoView,
      writable: true,
    });
    document.body.appendChild(target);

    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    const actions = captured!.contextMenuActions({
      epochDocumentIdentifier: EPOCH_DOC_ID_1,
    });
    const item = actions.find(
      (a): a is ContextMenuItem =>
        a.kind === 'item' && a.label === 'Plot signal trace for this session',
    );
    item!.onSelect();

    expect(setMock).toHaveBeenCalledWith({ session: EPOCH_DOC_ID_1 });
    expect(scrollIntoView).toHaveBeenCalled();

    document.body.removeChild(target);
  });

  it('"Open in Document Detail" opens the doc-detail route in a new tab', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);

    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    const actions = captured!.contextMenuActions({
      epochDocumentIdentifier: EPOCH_DOC_ID_1,
    });
    const item = actions.find(
      (a): a is ContextMenuItem =>
        a.kind === 'item' && a.label === 'Open in Document Detail',
    );
    item!.onSelect();
    expect(open).toHaveBeenCalledWith(
      `/datasets/ds-test/documents/${EPOCH_DOC_ID_1}`,
      '_blank',
      'noopener,noreferrer',
    );
    vi.unstubAllGlobals();
  });

  it('returns an empty list when row id is missing', () => {
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(captured!.contextMenuActions({})).toEqual([]);
  });
});

// ── Bulk actions factory. ─────────────────────────────────────────
describe('SessionsBrowser — bulk actions', () => {
  it('builds the shared "copy IDs" + "Ask Claude" actions', () => {
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    const actions = captured!.bulkActions([EPOCH_DOC_ID_1, EPOCH_DOC_ID_2]);
    expect(actions.map((a) => a.id)).toEqual(['copy-ids', 'ask-claude']);
    expect(actions[0]!.label).toBe('Copy 2 IDs');
  });

  it('"Ask Claude" emits an ask-prefill payload via the bus', async () => {
    const {
      __resetAskPrefillBusForTests,
      subscribeToAskPrefill,
    } = await import('@/lib/ai/ask-prefill-bus');
    __resetAskPrefillBusForTests();
    const received: Array<{ text: string; autoSend?: boolean }> = [];
    const unsub = subscribeToAskPrefill((p) => received.push(p));

    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    const actions = captured!.bulkActions([EPOCH_DOC_ID_1]);
    const ask = actions.find((a) => a.id === 'ask-claude');
    ask!.onSelect([EPOCH_DOC_ID_1]);

    expect(received).toHaveLength(1);
    expect(received[0]!.text).toContain('session');
    expect(received[0]!.text).toContain(EPOCH_DOC_ID_1);
    expect(received[0]!.autoSend).toBe(false);

    unsub();
    __resetAskPrefillBusForTests();
  });
});
