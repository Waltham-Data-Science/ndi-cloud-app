/**
 * SubjectsBrowser — pure filter coverage + picker-rail wiring.
 *
 * Phase G7 (2026-05-16). The browser now delegates row rendering to
 * the shared `WorkspaceDataGrid` primitive. We stub the grid (its own
 * tests cover internals) and assert the picker hands it the right
 * factory callbacks:
 *
 *   - `rowId(row)` returns the subject doc id (or fallback)
 *   - `contextMenuActions(row)` includes "Set as primary subject",
 *     "Copy ID", "Open in Document Detail" — each dispatches the
 *     right side-effect when invoked
 *   - `bulkActions(ids)` includes "Copy N IDs" and "Ask Claude"
 *   - `onPrimaryChange(id)` calls set({ subject: id })
 *
 * The pure `filterSubjects` algorithm coverage is unchanged from
 * Phase F3 — it's exported separately for testability and the grid
 * migration didn't touch it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { filterSubjects } from '@/components/workspace/SubjectsBrowser';
import type { BulkAction } from '@/components/workspace/canvas/DataGridBulkActions';
import type {
  ContextMenuEntry,
  ContextMenuItem,
} from '@/components/workspace/canvas/DataGridContextMenu';

// `useWorkspaceSelection` mock — same shape as today.
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
    hasAnySelection:
      selectionStub.subject !== null ||
      selectionStub.session !== null ||
      selectionStub.probe !== null ||
      selectionStub.stimulus !== null ||
      selectionStub.unit !== null,
  }),
}));

// next/navigation — empty params + no-op router.
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

// Stub the data fetch.
const SUBJECT_DOC_ID_1 = '68d6e54703a03f5cfdac8eff';
const SUBJECT_DOC_ID_2 = '68d6e54703a03f5cfdac8f00';
const FIXTURE_SUBJECTS = {
  columns: [
    { key: 'subjectIdentifier', label: 'Subject' },
    { key: 'speciesName', label: 'Species' },
    { key: 'strainName', label: 'Strain' },
    { key: 'biologicalSexName', label: 'Sex' },
    { key: 'ageAtRecording', label: 'Age' },
  ],
  rows: [
    {
      subjectDocumentIdentifier: SUBJECT_DOC_ID_1,
      subjectLocalIdentifier: 'NSUBJ-001',
      speciesName: 'Caenorhabditis elegans',
      strainName: 'N2',
      biologicalSexName: 'hermaphrodite',
      ageAtRecording: '3 days',
    },
    {
      subjectDocumentIdentifier: SUBJECT_DOC_ID_2,
      subjectLocalIdentifier: 'NSUBJ-002',
      speciesName: 'Caenorhabditis elegans',
      strainName: 'PR811',
      biologicalSexName: 'male',
      ageAtRecording: '4 days',
    },
  ],
};

vi.mock('@/lib/api/tables', () => ({
  useSummaryTable: () => ({
    data: FIXTURE_SUBJECTS,
    isLoading: false,
    isError: false,
  }),
}));

// ── Stub WorkspaceDataGrid to capture props. The grid's internals
// have their own coverage in tests/unit/components/workspace/canvas/
// WorkspaceDataGrid.test.tsx; here we just verify the picker hands it
// the right factories and callbacks.
interface CapturedGridProps {
  data: unknown[];
  rowId: (row: unknown) => string;
  noun: string;
  primaryId: string | null;
  onPrimaryChange: (id: string | null) => void;
  contextMenuActions: (row: unknown) => ReadonlyArray<ContextMenuEntry>;
  bulkActions: (ids: ReadonlyArray<string>) => ReadonlyArray<BulkAction>;
  columnLabels?: Record<string, string>;
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

import { SubjectsBrowser } from '@/components/workspace/SubjectsBrowser';

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

// ── Pure filter algorithm — unchanged from Phase C. ────────────────
const SAMPLE = [
  {
    subjectDocumentIdentifier: 's1',
    subjectLocalIdentifier: 'Fig1_Naive_01@babu-lab.iisc.ac.in',
    speciesName: 'Caenorhabditis elegans',
    strainName: 'N2',
    biologicalSexName: 'hermaphrodite',
  },
  {
    subjectDocumentIdentifier: 's2',
    subjectLocalIdentifier: 'Fig1_Trained_02@babu-lab.iisc.ac.in',
    speciesName: 'Caenorhabditis elegans',
    strainName: 'PR811',
    biologicalSexName: 'hermaphrodite',
  },
  {
    subjectDocumentIdentifier: 's3',
    subjectLocalIdentifier: 'NSUBJ-005-PR811',
    speciesName: 'Caenorhabditis elegans',
    strainName: 'PR811',
    biologicalSexName: 'male',
  },
  {
    subjectDocumentIdentifier: 's4',
    subjectLocalIdentifier: 'NSUBJ-006',
    speciesName: 'Rattus norvegicus',
    strainName: 'Sprague-Dawley',
    biologicalSexName: 'female',
  },
];

describe('filterSubjects', () => {
  it('returns every row when all filters are empty', () => {
    expect(
      filterSubjects(SAMPLE, { strain: '', species: '', sex: '' }),
    ).toHaveLength(SAMPLE.length);
  });

  it('filters strain by case-insensitive substring (tutorial pattern)', () => {
    const rows = filterSubjects(SAMPLE, {
      strain: 'pr811',
      species: '',
      sex: '',
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.strainName === 'PR811')).toBe(true);
  });

  it('filters species by substring', () => {
    const rows = filterSubjects(SAMPLE, {
      strain: '',
      species: 'rattus',
      sex: '',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.speciesName).toBe('Rattus norvegicus');
  });

  it('filters sex by exact match', () => {
    const rows = filterSubjects(SAMPLE, {
      strain: '',
      species: '',
      sex: 'female',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subjectDocumentIdentifier).toBe('s4');
  });

  it('combines filters with AND semantics', () => {
    const rows = filterSubjects(SAMPLE, {
      strain: 'PR811',
      species: 'elegans',
      sex: 'hermaphrodite',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subjectDocumentIdentifier).toBe('s2');
  });

  it('returns no rows when no row matches', () => {
    const rows = filterSubjects(SAMPLE, {
      strain: 'nonexistent',
      species: '',
      sex: '',
    });
    expect(rows).toEqual([]);
  });

  it('trims whitespace from text filters', () => {
    const rows = filterSubjects(SAMPLE, {
      strain: '   PR811   ',
      species: '',
      sex: '',
    });
    expect(rows).toHaveLength(2);
  });

  it('handles rows with null/missing fields gracefully', () => {
    const sparseRows = [
      { subjectDocumentIdentifier: 's-sparse' },
      {
        subjectDocumentIdentifier: 's-full',
        strainName: 'N2',
        speciesName: 'C. elegans',
        biologicalSexName: 'hermaphrodite',
      },
    ];
    const rows = filterSubjects(sparseRows, {
      strain: 'N2',
      species: '',
      sex: '',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subjectDocumentIdentifier).toBe('s-full');
  });
});

// ── Picker → grid wiring. ─────────────────────────────────────────
describe('SubjectsBrowser — grid wiring', () => {
  it('renders the grid stub with the subject noun', () => {
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    expect(screen.getByTestId('grid-noun')).toHaveTextContent('subject');
  });

  it('forwards the active subject as the grid primaryId', () => {
    selectionStub.subject = SUBJECT_DOC_ID_1;
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    expect(screen.getByTestId('grid-primary-id')).toHaveTextContent(
      SUBJECT_DOC_ID_1,
    );
  });

  it('passes filtered rows to the grid', () => {
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    expect(screen.getByTestId('grid-row-count')).toHaveTextContent('2');
  });

  it('rowId resolves to subjectDocumentIdentifier', () => {
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    expect(captured).not.toBeNull();
    expect(
      captured!.rowId({ subjectDocumentIdentifier: SUBJECT_DOC_ID_1 }),
    ).toBe(SUBJECT_DOC_ID_1);
  });

  it('rowId falls back to subjectIdentifier when documentIdentifier is missing', () => {
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    expect(captured).not.toBeNull();
    expect(captured!.rowId({ subjectIdentifier: 'NSUBJ-FB' })).toBe(
      'NSUBJ-FB',
    );
  });

  it('onPrimaryChange writes through set({ subject })', () => {
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    captured!.onPrimaryChange(SUBJECT_DOC_ID_1);
    expect(setMock).toHaveBeenCalledWith({ subject: SUBJECT_DOC_ID_1 });
  });

  it('locks the primary (first server-emitted) column', () => {
    // Audit 2026-05-18 follow-up: columns are now constructed
    // entirely from the backend `data.columns` envelope. The
    // picker locks the first column the backend emits — for the
    // subject projection that's `subjectIdentifier`.
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    expect(captured!.lockedColumnIds).toHaveLength(1);
    expect(captured!.lockedColumnIds![0]).toBe('subjectIdentifier');
  });
});

// ── Context-menu factory. ─────────────────────────────────────────
describe('SubjectsBrowser — context menu actions', () => {
  it('builds the canonical action list per row', () => {
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    const actions = captured!.contextMenuActions({
      subjectDocumentIdentifier: SUBJECT_DOC_ID_1,
    });
    // group/separator entries plus item entries — flatten the labels.
    const itemLabels = actions
      .filter((a): a is ContextMenuItem => a.kind === 'item')
      .map((a) => a.label);
    expect(itemLabels).toEqual([
      'Set as primary subject',
      'Copy ID',
      'Open in Document Detail',
    ]);
  });

  it('"Set as primary subject" calls set({ subject: id })', () => {
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    const actions = captured!.contextMenuActions({
      subjectDocumentIdentifier: SUBJECT_DOC_ID_1,
    });
    const item = actions.find(
      (a): a is ContextMenuItem =>
        a.kind === 'item' && a.label === 'Set as primary subject',
    );
    expect(item).toBeDefined();
    item!.onSelect();
    expect(setMock).toHaveBeenCalledWith({ subject: SUBJECT_DOC_ID_1 });
  });

  it('"Copy ID" writes the id to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    const actions = captured!.contextMenuActions({
      subjectDocumentIdentifier: SUBJECT_DOC_ID_1,
    });
    const item = actions.find(
      (a): a is ContextMenuItem => a.kind === 'item' && a.label === 'Copy ID',
    );
    item!.onSelect();
    expect(writeText).toHaveBeenCalledWith(SUBJECT_DOC_ID_1);
  });

  it('"Open in Document Detail" opens the doc-detail route in a new tab', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);

    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    const actions = captured!.contextMenuActions({
      subjectDocumentIdentifier: SUBJECT_DOC_ID_1,
    });
    const item = actions.find(
      (a): a is ContextMenuItem =>
        a.kind === 'item' && a.label === 'Open in Document Detail',
    );
    item!.onSelect();
    expect(open).toHaveBeenCalledWith(
      `/datasets/ds-test/documents/${SUBJECT_DOC_ID_1}`,
      '_blank',
      'noopener,noreferrer',
    );
    vi.unstubAllGlobals();
  });

  it('returns an empty action list when the row has no id', () => {
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    expect(captured!.contextMenuActions({})).toEqual([]);
  });
});

// ── Bulk actions factory. ─────────────────────────────────────────
describe('SubjectsBrowser — bulk actions', () => {
  it('builds the shared "copy IDs" + "Ask Claude" actions', () => {
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    const actions = captured!.bulkActions([SUBJECT_DOC_ID_1, SUBJECT_DOC_ID_2]);
    expect(actions.map((a) => a.id)).toEqual(['copy-ids', 'ask-claude']);
    expect(actions[0]!.label).toBe('Copy 2 IDs');
  });

  it('"copy IDs" writes newline-joined ids to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    const actions = captured!.bulkActions([SUBJECT_DOC_ID_1, SUBJECT_DOC_ID_2]);
    actions[0]!.onSelect([SUBJECT_DOC_ID_1, SUBJECT_DOC_ID_2]);
    expect(writeText).toHaveBeenCalledWith(
      `${SUBJECT_DOC_ID_1}\n${SUBJECT_DOC_ID_2}`,
    );
  });

  it('"Ask Claude" emits an ask-prefill payload via the bus', async () => {
    const {
      __resetAskPrefillBusForTests,
      subscribeToAskPrefill,
    } = await import('@/lib/ai/ask-prefill-bus');
    __resetAskPrefillBusForTests();
    const received: Array<{ text: string; autoSend?: boolean }> = [];
    const unsub = subscribeToAskPrefill((p) => received.push(p));

    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    const actions = captured!.bulkActions([SUBJECT_DOC_ID_1]);
    const ask = actions.find((a) => a.id === 'ask-claude');
    ask!.onSelect([SUBJECT_DOC_ID_1]);

    expect(received).toHaveLength(1);
    expect(received[0]!.text).toContain('subject');
    expect(received[0]!.text).toContain(SUBJECT_DOC_ID_1);
    expect(received[0]!.autoSend).toBe(false);

    unsub();
    __resetAskPrefillBusForTests();
  });
});
