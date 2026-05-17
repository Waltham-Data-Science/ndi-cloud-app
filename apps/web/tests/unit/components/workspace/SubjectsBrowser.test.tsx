/**
 * SubjectsBrowser — pure filter coverage + picker-rail behaviour.
 *
 * Phase F3 of the one-canvas redesign (2026-05-16). The browser is
 * now a picker-rail body: row click writes through
 * `useWorkspaceSelection.set({ subject })` instead of the old
 * `?select=` URL param. The old ViewActionsRail is gone; no outbound
 * View Actions render.
 *
 * Tests in this file:
 *   - the pure `filterSubjects` algorithm (substring + sex equality +
 *     case insensitivity, AND semantics across fields)
 *   - clicking a row calls `set({ subject: docId })`
 *   - clicking the already-active row calls `set({ subject: null })`
 *     (toggle-off)
 *   - the "Active subject — analysis cards on the right will update."
 *     hint renders only when a subject is selected
 *   - no ViewActionsRail / outbound "View document" link renders
 *     (the rail is retired in F3 — the canvas's selection bar +
 *     auto-fill replaces it)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { filterSubjects } from '@/components/workspace/SubjectsBrowser';

// `useWorkspaceSelection` is mocked module-wide so each test can swap
// out the selection state. The hook's shape mirrors WorkspaceSelectionState.
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

// Next navigation — empty params + no-op router. The browser also
// reads ?strain=, ?species=, ?sex= directly via useSearchParams; we
// keep that empty so no filter is applied.
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

// Virtualizer stub — same pattern as summary-table-view.test.tsx;
// jsdom returns zero container dimensions so we expose every row.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: () => number;
  }) => {
    const size = estimateSize();
    const items = Array.from({ length: count }, (_, i) => ({
      index: i,
      key: i,
      start: i * size,
      end: (i + 1) * size,
      size,
      lane: 0,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * size,
    };
  },
}));

// Stub the summary-table fetch so the browser renders rows without
// hitting the network. The shape mirrors what the real backend
// returns (TableResponse).
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

// ── Row click → workspace selection. ──────────────────────────────
describe('SubjectsBrowser — row click writes through useWorkspaceSelection', () => {
  it('clicking a row calls set({ subject: <docId> })', () => {
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    // Two fixture rows render; the first identifier text is unique.
    const firstRow = screen.getByText('NSUBJ-001').closest('tr');
    expect(firstRow).not.toBeNull();
    fireEvent.click(firstRow!);
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({ subject: SUBJECT_DOC_ID_1 });
  });

  it('clicking the already-active row toggles selection off (set({ subject: null }))', () => {
    selectionStub.subject = SUBJECT_DOC_ID_1;
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    const activeRow = screen.getByText('NSUBJ-001').closest('tr');
    fireEvent.click(activeRow!);
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({ subject: null });
  });

  it('clicking a different row reassigns selection to that row', () => {
    selectionStub.subject = SUBJECT_DOC_ID_1;
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    const otherRow = screen.getByText('NSUBJ-002').closest('tr');
    fireEvent.click(otherRow!);
    expect(setMock).toHaveBeenCalledWith({ subject: SUBJECT_DOC_ID_2 });
  });
});

describe('SubjectsBrowser — selection-active hint', () => {
  it('renders the hint when a subject is selected', () => {
    selectionStub.subject = SUBJECT_DOC_ID_1;
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    expect(
      screen.getByTestId('subjects-selection-active-hint'),
    ).toBeInTheDocument();
  });

  it('hides the hint when nothing is selected', () => {
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    expect(
      screen.queryByTestId('subjects-selection-active-hint'),
    ).toBeNull();
  });
});

describe('SubjectsBrowser — no outbound View Actions render', () => {
  it('does not render a ViewActionsRail "Selected" eyebrow', () => {
    selectionStub.subject = SUBJECT_DOC_ID_1;
    render(withProviders(<SubjectsBrowser datasetId="ds-test" />));
    // The retired ViewActionsRail rendered an eyebrow that read
    // "Selected" — its absence guards against a regression where
    // someone re-mounts the rail. We only render the lightweight
    // testid-tagged hint above the table now.
    expect(screen.queryByText('Selected')).toBeNull();
  });

  it('does not render a "View document" outbound link', () => {
    selectionStub.subject = SUBJECT_DOC_ID_1;
    const { container } = render(
      withProviders(<SubjectsBrowser datasetId="ds-test" />),
    );
    // Belt-and-suspenders: no anchor pointing at the Document
    // Explorer's per-doc route should render anywhere inside the
    // browser body.
    expect(
      container.querySelector(
        `a[href*="/datasets/ds-test/documents/${SUBJECT_DOC_ID_1}"]`,
      ),
    ).toBeNull();
    // Also no button labelled "View document" (the old action's text).
    expect(
      screen.queryByRole('link', { name: /view document/i }),
    ).toBeNull();
  });
});
