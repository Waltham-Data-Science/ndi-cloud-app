/**
 * SessionsBrowser — pure filter coverage + picker-rail behaviour.
 *
 * Phase F3 of the one-canvas redesign (2026-05-16). The browser is
 * now a picker-rail body: row click writes through
 * `useWorkspaceSelection.set({ session })` instead of the old
 * `?select=` URL param. The old ViewActionsRail is gone.
 *
 * Tests in this file:
 *   - `filterEpochs` pure substring + AND semantics
 *   - `formatEpochTime` prefers globalTime / falls back to devTime
 *   - clicking a row calls `set({ session: <docId> })`
 *   - clicking the active row toggles selection off
 *   - reactive cascade: when selection.subject is set, the table
 *     filters to only that subject's epochs (and the cascade hint
 *     renders)
 *   - no ViewActionsRail / outbound View Actions render
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  filterEpochs,
  formatEpochTime,
} from '@/components/workspace/SessionsBrowser';

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

// ── Row click → workspace selection. ──────────────────────────────
describe('SessionsBrowser — row click writes through useWorkspaceSelection', () => {
  it('clicking a row calls set({ session: <docId> })', () => {
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    const row = screen.getByText('epoch_1').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({ session: EPOCH_DOC_ID_1 });
  });

  it('clicking the already-active row toggles selection off', () => {
    selectionStub.session = EPOCH_DOC_ID_1;
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    const activeRow = screen.getByText('epoch_1').closest('tr');
    fireEvent.click(activeRow!);
    expect(setMock).toHaveBeenCalledWith({ session: null });
  });
});

describe('SessionsBrowser — selection-active hint', () => {
  it('renders the hint when a session is selected', () => {
    selectionStub.session = EPOCH_DOC_ID_1;
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(
      screen.getByTestId('sessions-selection-active-hint'),
    ).toBeInTheDocument();
  });

  it('hides the hint when nothing is selected', () => {
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(
      screen.queryByTestId('sessions-selection-active-hint'),
    ).toBeNull();
  });
});

describe('SessionsBrowser — subject cascade', () => {
  it('renders all epochs when no subject is selected', () => {
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(screen.getByText('epoch_1')).toBeInTheDocument();
    expect(screen.getByText('epoch_2')).toBeInTheDocument();
    expect(screen.getByText('epoch_3')).toBeInTheDocument();
  });

  it('filters to only the cascade subject when selection.subject is set', () => {
    selectionStub.subject = SUBJ_ID_A;
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    // epoch_1 and epoch_2 belong to subj-A; epoch_3 belongs to subj-B.
    expect(screen.getByText('epoch_1')).toBeInTheDocument();
    expect(screen.getByText('epoch_2')).toBeInTheDocument();
    expect(screen.queryByText('epoch_3')).toBeNull();
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

describe('SessionsBrowser — no outbound View Actions render', () => {
  it('does not render a ViewActionsRail "Selected" eyebrow', () => {
    selectionStub.session = EPOCH_DOC_ID_1;
    render(withProviders(<SessionsBrowser datasetId="ds-test" />));
    expect(screen.queryByText('Selected')).toBeNull();
  });

  it('does not render a "View document" outbound link', () => {
    selectionStub.session = EPOCH_DOC_ID_1;
    const { container } = render(
      withProviders(<SessionsBrowser datasetId="ds-test" />),
    );
    expect(
      container.querySelector(
        `a[href*="/datasets/ds-test/documents/${EPOCH_DOC_ID_1}"]`,
      ),
    ).toBeNull();
    expect(
      screen.queryByRole('link', { name: /view document/i }),
    ).toBeNull();
  });
});
