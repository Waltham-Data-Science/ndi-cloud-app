/**
 * ProbesPicker — pure-helper coverage + picker-rail wiring.
 *
 * Phase G7 (2026-05-16). The picker now delegates row rendering to
 * the shared `WorkspaceDataGrid` primitive; we stub the grid and
 * assert the picker hands it the right factory callbacks.
 *
 * Includes pure-helper coverage for `probeSubjectId` and
 * `filterProbes` (unchanged from Phase F3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { BulkAction } from '@/components/workspace/canvas/DataGridBulkActions';
import type {
  ContextMenuEntry,
  ContextMenuItem,
} from '@/components/workspace/canvas/DataGridContextMenu';

const useSummaryTableMock = vi.fn();
const setSelectionMock = vi.fn();
const useWorkspaceSelectionMock = vi.fn();

vi.mock('@/lib/api/tables', () => ({
  useSummaryTable: (...args: unknown[]) => useSummaryTableMock(...args),
}));

vi.mock('@/lib/workspace/use-workspace-selection', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/workspace/use-workspace-selection')
  >();
  return {
    ...actual,
    useWorkspaceSelection: () => useWorkspaceSelectionMock(),
  };
});

// Stub WorkspaceDataGrid — capture props.
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

import {
  ProbesPicker,
  filterProbes,
  probeSubjectId,
} from '@/components/workspace/canvas/ProbesPicker';

beforeEach(() => {
  useSummaryTableMock.mockReset();
  setSelectionMock.mockReset();
  useWorkspaceSelectionMock.mockReset();
  captured = null;
  useWorkspaceSelectionMock.mockReturnValue({
    selection: {
      subject: null,
      session: null,
      probe: null,
      stimulus: null,
      unit: null,
    },
    hasAnySelection: false,
    pickerTab: 'probes',
    set: setSelectionMock,
    clear: vi.fn(),
    clearOne: vi.fn(),
    setPickerTab: vi.fn(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('probeSubjectId', () => {
  it('extracts subject id from depends_on.subject_id', () => {
    const row = {
      data: {
        depends_on: [{ name: 'subject_id', value: 'subj-A' }],
      },
    };
    expect(probeSubjectId(row)).toBe('subj-A');
  });

  it('falls back to subjectDocumentIdentifier when depends_on is absent', () => {
    const row = { subjectDocumentIdentifier: 'subj-flat' };
    expect(probeSubjectId(row)).toBe('subj-flat');
  });

  it('returns null when no subject info is available', () => {
    expect(probeSubjectId({})).toBeNull();
  });
});

describe('filterProbes', () => {
  const SAMPLE = [
    {
      probeDocumentIdentifier: 'p1',
      probeName: 'Neuropixel Probe A',
      probeType: 'extracellular',
      subjectDocumentIdentifier: 'subj-A',
    },
    {
      probeDocumentIdentifier: 'p2',
      probeName: 'Patch Pipette B',
      probeType: 'patch',
      subjectDocumentIdentifier: 'subj-A',
    },
    {
      probeDocumentIdentifier: 'p3',
      probeName: 'Stimulator',
      probeType: 'stim',
      subjectDocumentIdentifier: 'subj-B',
    },
  ];

  it('returns all rows on empty query + no subject filter', () => {
    expect(filterProbes(SAMPLE, '', null)).toHaveLength(3);
  });

  it('filters by name substring (case-insensitive)', () => {
    const rows = filterProbes(SAMPLE, 'PATCH', null);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.probeName).toBe('Patch Pipette B');
  });

  it('falls back to id substring when name does not match', () => {
    const rows = filterProbes(SAMPLE, 'p3', null);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.probeDocumentIdentifier).toBe('p3');
  });

  it('filters by selected subject', () => {
    const rows = filterProbes(SAMPLE, '', 'subj-A');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.subjectDocumentIdentifier === 'subj-A')).toBe(
      true,
    );
  });

  it('combines name + subject filters with AND semantics', () => {
    const rows = filterProbes(SAMPLE, 'patch', 'subj-A');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.probeDocumentIdentifier).toBe('p2');
  });
});

describe('ProbesPicker — render', () => {
  it('renders the empty state when the summary table is empty', () => {
    useSummaryTableMock.mockReturnValue({
      data: { rows: [] },
      isLoading: false,
      isError: false,
    });

    render(<ProbesPicker datasetId="ds1" />);

    expect(
      screen.getByText(/no probes in this dataset/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/purely-behavioural/i)).toBeInTheDocument();
  });

  it('renders the empty state when the summary table errors', () => {
    useSummaryTableMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<ProbesPicker datasetId="ds1" />);

    expect(
      screen.getByText(/no probes in this dataset/i),
    ).toBeInTheDocument();
  });

  it('renders the loading skeleton while data is pending', () => {
    useSummaryTableMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<ProbesPicker datasetId="ds1" />);
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders the grid when probes are present', () => {
    useSummaryTableMock.mockReturnValue({
      data: {
        rows: [
          {
            probeDocumentIdentifier: 'p1',
            probeName: 'Neuropixel A',
            probeType: 'extracellular',
            subjectDocumentIdentifier: 'subj-A',
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<ProbesPicker datasetId="ds1" />);

    expect(screen.getByTestId('grid-noun')).toHaveTextContent('probe');
    expect(screen.getByTestId('grid-row-count')).toHaveTextContent('1');
  });

  it('applies the reactive subject filter when selection.subject is set', () => {
    useSummaryTableMock.mockReturnValue({
      data: {
        rows: [
          {
            probeDocumentIdentifier: 'p1',
            probeName: 'Probe in selected subject',
            probeType: 'extracellular',
            subjectDocumentIdentifier: 'subj-A',
          },
          {
            probeDocumentIdentifier: 'p2',
            probeName: 'Probe in different subject',
            probeType: 'extracellular',
            subjectDocumentIdentifier: 'subj-B',
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    useWorkspaceSelectionMock.mockReturnValue({
      selection: {
        subject: 'subj-A',
        session: null,
        probe: null,
        stimulus: null,
        unit: null,
      },
      hasAnySelection: true,
      pickerTab: 'probes',
      set: setSelectionMock,
      clear: vi.fn(),
      clearOne: vi.fn(),
      setPickerTab: vi.fn(),
    });

    render(<ProbesPicker datasetId="ds1" />);

    expect(screen.getByTestId('grid-row-count')).toHaveTextContent('1');
    // The cascade hint moved from a "filtered to selected subject"
    // tooltip line to the picker-rail header in Phase H6. Same
    // semantics — when subject is set, the table narrows.
    expect(
      screen.getByText(/active subject/i),
    ).toBeInTheDocument();
  });
});

// ── Picker → grid wiring. ─────────────────────────────────────────
describe('ProbesPicker — grid wiring', () => {
  beforeEach(() => {
    useSummaryTableMock.mockReturnValue({
      data: {
        rows: [
          {
            probeDocumentIdentifier: 'probe-doc-id-1',
            probeName: 'Neuropixel A',
            probeType: 'extracellular',
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
  });

  it('rowId resolves to probeDocumentIdentifier', () => {
    render(<ProbesPicker datasetId="ds1" />);
    expect(captured).not.toBeNull();
    expect(
      captured!.rowId({ probeDocumentIdentifier: 'probe-doc-id-1' }),
    ).toBe('probe-doc-id-1');
  });

  it('onPrimaryChange writes through set({ probe })', () => {
    render(<ProbesPicker datasetId="ds1" />);
    captured!.onPrimaryChange('probe-doc-id-1');
    expect(setSelectionMock).toHaveBeenCalledWith({ probe: 'probe-doc-id-1' });
  });

  it('locks the primary (first server-emitted) column', () => {
    // Audit 2026-05-18 follow-up: probe columns are dynamic now;
    // backend emits `probeDocumentIdentifier` as the canonical
    // first column.
    render(<ProbesPicker datasetId="ds1" />);
    expect(captured!.lockedColumnIds).toHaveLength(1);
    expect(captured!.lockedColumnIds![0]).toBe('probeDocumentIdentifier');
  });
});

// ── Context-menu factory. ─────────────────────────────────────────
describe('ProbesPicker — context menu actions', () => {
  beforeEach(() => {
    useSummaryTableMock.mockReturnValue({
      data: {
        rows: [
          { probeDocumentIdentifier: 'p1', probeName: 'Probe A' },
        ],
      },
      isLoading: false,
      isError: false,
    });
  });

  it('builds the canonical action list per row', () => {
    render(<ProbesPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({
      probeDocumentIdentifier: 'p1',
    });
    const itemLabels = actions
      .filter((a): a is ContextMenuItem => a.kind === 'item')
      .map((a) => a.label);
    expect(itemLabels).toEqual([
      'Set as primary probe',
      'Copy ID',
      'Show electrode positions',
      'Open in Document Detail',
    ]);
  });

  it('"Set as primary probe" calls set({ probe: id })', () => {
    render(<ProbesPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({
      probeDocumentIdentifier: 'p1',
    });
    const item = actions.find(
      (a): a is ContextMenuItem =>
        a.kind === 'item' && a.label === 'Set as primary probe',
    );
    item!.onSelect();
    expect(setSelectionMock).toHaveBeenCalledWith({ probe: 'p1' });
  });

  it('"Show electrode positions" sets probe and scrolls panel into view', () => {
    const scrollIntoView = vi.fn();
    const target = document.createElement('div');
    target.id = 'electrode-position';
    Object.defineProperty(target, 'scrollIntoView', {
      value: scrollIntoView,
      writable: true,
    });
    document.body.appendChild(target);

    render(<ProbesPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({
      probeDocumentIdentifier: 'p1',
    });
    const item = actions.find(
      (a): a is ContextMenuItem =>
        a.kind === 'item' && a.label === 'Show electrode positions',
    );
    item!.onSelect();

    expect(setSelectionMock).toHaveBeenCalledWith({ probe: 'p1' });
    expect(scrollIntoView).toHaveBeenCalled();

    document.body.removeChild(target);
  });

  it('"Open in Document Detail" opens the doc-detail route in a new tab', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);

    render(<ProbesPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({
      probeDocumentIdentifier: 'p1',
    });
    const item = actions.find(
      (a): a is ContextMenuItem =>
        a.kind === 'item' && a.label === 'Open in Document Detail',
    );
    item!.onSelect();
    expect(open).toHaveBeenCalledWith(
      '/datasets/ds1/documents/p1',
      '_blank',
      'noopener,noreferrer',
    );
    vi.unstubAllGlobals();
  });
});

// ── Bulk actions factory. ─────────────────────────────────────────
describe('ProbesPicker — bulk actions', () => {
  beforeEach(() => {
    useSummaryTableMock.mockReturnValue({
      data: {
        rows: [{ probeDocumentIdentifier: 'p1', probeName: 'Probe A' }],
      },
      isLoading: false,
      isError: false,
    });
  });

  it('builds copy-ids + ask-claude actions', () => {
    render(<ProbesPicker datasetId="ds1" />);
    const actions = captured!.bulkActions(['p1', 'p2']);
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

    render(<ProbesPicker datasetId="ds1" />);
    const actions = captured!.bulkActions(['p1']);
    const ask = actions.find((a) => a.id === 'ask-claude');
    ask!.onSelect(['p1']);

    expect(received).toHaveLength(1);
    expect(received[0]!.text).toContain('probe');
    expect(received[0]!.text).toContain('p1');
    expect(received[0]!.autoSend).toBe(false);

    unsub();
    __resetAskPrefillBusForTests();
  });
});
