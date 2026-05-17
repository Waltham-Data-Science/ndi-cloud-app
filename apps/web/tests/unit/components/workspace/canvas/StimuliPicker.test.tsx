/**
 * StimuliPicker — pure-helper coverage + picker-rail wiring.
 *
 * Phase G7 (2026-05-16). The picker now delegates row rendering to
 * the shared `WorkspaceDataGrid` primitive; we stub the grid and
 * assert the picker hands it the right factory callbacks.
 *
 * Includes pure-helper coverage for `projectStimulusRow` (type-
 * derivation + count-derivation across known schemas) and
 * `filterStimuli`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { BulkAction } from '@/components/workspace/canvas/DataGridBulkActions';
import type {
  ContextMenuEntry,
  ContextMenuItem,
} from '@/components/workspace/canvas/DataGridContextMenu';

const useDocumentsMock = vi.fn();
const setSelectionMock = vi.fn();
const useWorkspaceSelectionMock = vi.fn();

vi.mock('@/lib/api/documents', () => ({
  useDocuments: (...args: unknown[]) => useDocumentsMock(...args),
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
  StimuliPicker,
  filterStimuli,
  projectStimulusRow,
} from '@/components/workspace/canvas/StimuliPicker';

beforeEach(() => {
  useDocumentsMock.mockReset();
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
    pickerTab: 'stimuli',
    set: setSelectionMock,
    clear: vi.fn(),
    clearOne: vi.fn(),
    setPickerTab: vi.fn(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('projectStimulusRow', () => {
  it('derives type from data.stimulus_presentation.stim_type', () => {
    const row = projectStimulusRow(
      {
        id: 'doc1',
        data: {
          stimulus_presentation: {
            stim_type: 'drifting_gratings',
            presentations: [{}, {}, {}],
          },
        },
      },
      'stimulus_presentation',
    );
    expect(row).toMatchObject({
      docId: 'doc1',
      stimulusType: 'drifting_gratings',
      presentationCount: 3,
    });
  });

  it('falls back to data.<class>.name when stim_type is absent', () => {
    const row = projectStimulusRow(
      {
        id: 'doc2',
        data: {
          stimulus_response: {
            name: 'EPM_test',
            responses: [{}, {}],
          },
        },
      },
      'stimulus_response',
    );
    expect(row).toMatchObject({
      docId: 'doc2',
      stimulusType: 'EPM_test',
      presentationCount: 2,
    });
  });

  it('falls back to doc.name then class label', () => {
    const namedDoc = projectStimulusRow(
      { id: 'doc3', name: 'session intro', data: {} },
      'stimulus_presentation',
    );
    expect(namedDoc?.stimulusType).toBe('session intro');

    const fallbackDoc = projectStimulusRow(
      { id: 'doc4', data: {} },
      'stimulus_response',
    );
    expect(fallbackDoc?.stimulusType).toBe('Response');
  });

  it('returns null when there is no doc id', () => {
    expect(projectStimulusRow({ data: {} }, 'stimulus_presentation')).toBeNull();
  });

  it('sets presentationCount to null when arrays are absent', () => {
    const row = projectStimulusRow(
      { id: 'doc5', data: { stimulus_presentation: {} } },
      'stimulus_presentation',
    );
    expect(row?.presentationCount).toBeNull();
  });
});

describe('filterStimuli', () => {
  const SAMPLE = [
    {
      docId: 'doc1',
      className: 'stimulus_presentation',
      stimulusType: 'drifting_gratings',
      presentationCount: 60,
    },
    {
      docId: 'doc2',
      className: 'stimulus_response',
      stimulusType: 'EPM_arms',
      presentationCount: 12,
    },
  ];

  it('returns all when query is empty', () => {
    expect(filterStimuli(SAMPLE, '')).toHaveLength(2);
  });

  it('filters by stimulus type substring (case-insensitive)', () => {
    expect(filterStimuli(SAMPLE, 'GRATING')).toHaveLength(1);
  });

  it('also matches against className', () => {
    expect(filterStimuli(SAMPLE, 'response')).toHaveLength(1);
  });
});

describe('StimuliPicker — render', () => {
  it('calls useDocuments for both stimulus classes', () => {
    useDocumentsMock.mockReturnValue({
      data: { documents: [] },
      isLoading: false,
      isError: false,
    });

    render(<StimuliPicker datasetId="ds1" />);

    expect(useDocumentsMock).toHaveBeenCalledWith(
      'ds1',
      'stimulus_presentation',
      1,
      200,
    );
    expect(useDocumentsMock).toHaveBeenCalledWith(
      'ds1',
      'stimulus_response',
      1,
      200,
    );
  });

  it('renders the empty state when no stimuli are returned', () => {
    useDocumentsMock.mockReturnValue({
      data: { documents: [] },
      isLoading: false,
      isError: false,
    });

    render(<StimuliPicker datasetId="ds1" />);

    expect(
      screen.getByText(/no stimulus documents in this dataset/i),
    ).toBeInTheDocument();
  });

  it('renders the loading skeleton while data is pending', () => {
    useDocumentsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<StimuliPicker datasetId="ds1" />);
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders the grid when stimuli are present and merges both classes', () => {
    // useDocuments is called twice — return different shapes per call.
    let call = 0;
    useDocumentsMock.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return {
          data: {
            documents: [
              {
                id: 'pres1',
                data: {
                  stimulus_presentation: {
                    stim_type: 'gratings',
                    presentations: [{}, {}, {}],
                  },
                },
              },
            ],
          },
          isLoading: false,
          isError: false,
        };
      }
      return {
        data: {
          documents: [
            {
              id: 'resp1',
              data: {
                stimulus_response: {
                  name: 'EPM_arms',
                  responses: [{}, {}],
                },
              },
            },
          ],
        },
        isLoading: false,
        isError: false,
      };
    });

    render(<StimuliPicker datasetId="ds1" />);

    expect(screen.getByTestId('grid-row-count')).toHaveTextContent('2');
    // Phase H6 — the "Showing N of M" count line was dropped in
    // favor of the grid's own footer row-count. Grid is mocked
    // out in this test so we only verify the data length above.
  });
});

// ── Picker → grid wiring. ─────────────────────────────────────────
describe('StimuliPicker — grid wiring', () => {
  beforeEach(() => {
    let call = 0;
    useDocumentsMock.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return {
          data: {
            documents: [
              {
                id: 'pres-target-id',
                data: {
                  stimulus_presentation: {
                    stim_type: 'gratings',
                    presentations: [{}],
                  },
                },
              },
            ],
          },
          isLoading: false,
          isError: false,
        };
      }
      return {
        data: { documents: [] },
        isLoading: false,
        isError: false,
      };
    });
  });

  it('passes "stimulus" as the noun', () => {
    render(<StimuliPicker datasetId="ds1" />);
    expect(screen.getByTestId('grid-noun')).toHaveTextContent('stimulus');
  });

  it('rowId resolves to docId', () => {
    render(<StimuliPicker datasetId="ds1" />);
    expect(captured!.rowId({ docId: 'pres-target-id' })).toBe('pres-target-id');
  });

  it('onPrimaryChange writes through set({ stimulus })', () => {
    render(<StimuliPicker datasetId="ds1" />);
    captured!.onPrimaryChange('pres-target-id');
    expect(setSelectionMock).toHaveBeenCalledWith({
      stimulus: 'pres-target-id',
    });
  });

  it('locks the type column', () => {
    render(<StimuliPicker datasetId="ds1" />);
    expect(captured!.lockedColumnIds).toContain('type');
  });
});

// ── Context-menu factory. ─────────────────────────────────────────
describe('StimuliPicker — context menu actions', () => {
  beforeEach(() => {
    useDocumentsMock.mockReturnValue({
      data: { documents: [{ id: 's1', data: { stimulus_presentation: {} } }] },
      isLoading: false,
      isError: false,
    });
  });

  it('builds the canonical action list per row', () => {
    render(<StimuliPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({ docId: 's1' });
    const itemLabels = actions
      .filter((a): a is ContextMenuItem => a.kind === 'item')
      .map((a) => a.label);
    expect(itemLabels).toEqual([
      'Set as primary stimulus',
      'Copy ID',
      'Use in PSTH',
      'Open in Document Detail',
    ]);
  });

  it('"Set as primary stimulus" calls set({ stimulus: id })', () => {
    render(<StimuliPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({ docId: 's1' });
    const item = actions.find(
      (a): a is ContextMenuItem =>
        a.kind === 'item' && a.label === 'Set as primary stimulus',
    );
    item!.onSelect();
    expect(setSelectionMock).toHaveBeenCalledWith({ stimulus: 's1' });
  });

  it('"Use in PSTH" sets stimulus and scrolls PSTH into view', () => {
    const scrollIntoView = vi.fn();
    const target = document.createElement('div');
    target.id = 'psth';
    Object.defineProperty(target, 'scrollIntoView', {
      value: scrollIntoView,
      writable: true,
    });
    document.body.appendChild(target);

    render(<StimuliPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({ docId: 's1' });
    const item = actions.find(
      (a): a is ContextMenuItem =>
        a.kind === 'item' && a.label === 'Use in PSTH',
    );
    item!.onSelect();

    expect(setSelectionMock).toHaveBeenCalledWith({ stimulus: 's1' });
    expect(scrollIntoView).toHaveBeenCalled();

    document.body.removeChild(target);
  });

  it('"Open in Document Detail" opens the doc-detail route', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);

    render(<StimuliPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({ docId: 's1' });
    const item = actions.find(
      (a): a is ContextMenuItem =>
        a.kind === 'item' && a.label === 'Open in Document Detail',
    );
    item!.onSelect();
    expect(open).toHaveBeenCalledWith(
      '/datasets/ds1/documents/s1',
      '_blank',
      'noopener,noreferrer',
    );
    vi.unstubAllGlobals();
  });
});

// ── Bulk actions factory. ─────────────────────────────────────────
describe('StimuliPicker — bulk actions', () => {
  beforeEach(() => {
    useDocumentsMock.mockReturnValue({
      data: { documents: [{ id: 's1', data: { stimulus_presentation: {} } }] },
      isLoading: false,
      isError: false,
    });
  });

  it('builds copy-ids + ask-claude actions', () => {
    render(<StimuliPicker datasetId="ds1" />);
    const actions = captured!.bulkActions(['s1', 's2']);
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

    render(<StimuliPicker datasetId="ds1" />);
    const actions = captured!.bulkActions(['s1']);
    const ask = actions.find((a) => a.id === 'ask-claude');
    ask!.onSelect(['s1']);

    expect(received).toHaveLength(1);
    expect(received[0]!.text).toContain('stimulus');
    expect(received[0]!.text).toContain('s1');
    expect(received[0]!.autoSend).toBe(false);

    unsub();
    __resetAskPrefillBusForTests();
  });
});
