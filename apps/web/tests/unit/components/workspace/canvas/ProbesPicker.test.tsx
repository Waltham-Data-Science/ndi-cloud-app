/**
 * ProbesPicker — empty state, render-on-data, row-click → set({ probe }),
 * and reactive subject filtering.
 *
 * Phase F3 of the one-canvas redesign. Mocks `useSummaryTable` (the
 * single data dependency) and `useWorkspaceSelection` (the single
 * write target) so the component logic is exercised without dragging
 * in router or React Query setup.
 *
 * Includes pure-helper coverage for `probeSubjectId` and `filterProbes`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// jsdom's `getBoundingClientRect` returns zeros, so the real
// `useVirtualizer` reports an empty getVirtualItems() and renders
// no body rows. Mock it to render a fixed window so we can assert
// row-click handlers fire. Same pattern as
// `tests/unit/(app)/my-datasets-virtualization.test.tsx`.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => {
    const windowSize = Math.min(count, 50);
    const virtualItems = Array.from({ length: windowSize }, (_, i) => ({
      key: i,
      index: i,
      start: i * 32,
      end: (i + 1) * 32,
      size: 32,
      lane: 0,
    }));
    return {
      getVirtualItems: () => virtualItems,
      getTotalSize: () => count * 32,
      scrollToIndex: () => {},
      measureElement: () => 32,
    };
  },
}));

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

import {
  ProbesPicker,
  filterProbes,
  probeSubjectId,
} from '@/components/workspace/canvas/ProbesPicker';

beforeEach(() => {
  useSummaryTableMock.mockReset();
  setSelectionMock.mockReset();
  useWorkspaceSelectionMock.mockReset();
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

  it('renders the table when probes are present', () => {
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

    expect(screen.getByText('Neuropixel A')).toBeInTheDocument();
    expect(screen.getByText('extracellular')).toBeInTheDocument();
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
  });

  it('row click calls set({ probe: docId })', () => {
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

    render(<ProbesPicker datasetId="ds1" />);

    const row = screen.getByText('Neuropixel A').closest('tr');
    expect(row).toBeTruthy();
    fireEvent.click(row!);

    expect(setSelectionMock).toHaveBeenCalledTimes(1);
    expect(setSelectionMock).toHaveBeenCalledWith({
      probe: 'probe-doc-id-1',
    });
  });

  it('applies reactive subject filter when selection.subject is set', () => {
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

    expect(
      screen.getByText('Probe in selected subject'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Probe in different subject'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/filtered to selected subject/i),
    ).toBeInTheDocument();
  });
});
