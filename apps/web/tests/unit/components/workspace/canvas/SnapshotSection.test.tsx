/**
 * SnapshotSection — top-of-canvas section with stats + provenance +
 * cold-start guidance.
 *
 * Phase F4 tests:
 *   - cold-start guidance shows when nothing is selected
 *   - cold-start guidance hides as soon as anything is selected
 *   - "Snapshot" eyebrow + h2 render
 *   - stat tiles render with picker-tab-switching clicks (no
 *     navigate-out)
 *   - provenance band mount is exercised (data hooks mocked)
 *
 * Stat tiles' click → picker tab is the cardinal behavioral change
 * from the deprecated /overview tile (which routed out to
 * /datasets/{id}/tables/probe).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const setPickerTabMock = vi.fn();
let hasAnySelectionStub = false;

vi.mock('@/lib/workspace/use-workspace-selection', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/workspace/use-workspace-selection')
  >('@/lib/workspace/use-workspace-selection');
  return {
    ...actual,
    useWorkspaceSelection: () => ({
      selection: {
        subject: null,
        session: null,
        probe: null,
        stimulus: null,
        unit: null,
      },
      hasAnySelection: hasAnySelectionStub,
      pickerTab: 'subjects' as const,
      set: vi.fn(),
      clear: vi.fn(),
      clearOne: vi.fn(),
      setPickerTab: setPickerTabMock,
    }),
  };
});

vi.mock('@/lib/api/datasets', () => ({
  useDatasetSummary: () => ({
    data: {
      counts: {
        subjects: 5314,
        sessions: 2,
        probes: 606,
        epochs: 4887,
        elements: 64,
        totalDocuments: 31234,
      },
      species: [{ label: 'Rattus norvegicus' }],
      probeTypes: ['Neuropixels 1.0', 'Tetrode'],
      brainRegions: [{ label: 'CA1', ontologyId: 'UBERON:0003881' }],
      strains: [{ label: 'PR811', ontologyId: null }],
      sexes: [{ label: 'female', ontologyId: 'PATO:0000383' }],
      citation: { paperDois: ['10.1000/foo'] },
    },
    isLoading: false,
  }),
  useClassCounts: () => ({
    data: {
      classCounts: {
        subject: 5314,
        element: 64,
        probe: 606,
        treatment: 30,
      },
    },
    isLoading: false,
  }),
}));

import { SnapshotSection } from '@/components/workspace/canvas/SnapshotSection';

beforeEach(() => {
  setPickerTabMock.mockReset();
  hasAnySelectionStub = false;
});

describe('SnapshotSection — chrome', () => {
  it('renders the "Snapshot" eyebrow and section h2', () => {
    render(<SnapshotSection datasetId="ds-test" />);
    expect(screen.getByText('Snapshot')).toBeInTheDocument();
    // `&rsquo;` renders as the curly apostrophe (U+2019), not ASCII.
    expect(
      screen.getByText(/What.s in this dataset/i),
    ).toBeInTheDocument();
  });
});

describe('SnapshotSection — stat tiles', () => {
  it('renders all 6 stat tiles with formatted counts', () => {
    render(<SnapshotSection datasetId="ds-test" />);
    expect(screen.getByText('5,314')).toBeInTheDocument(); // Subjects
    expect(screen.getByText('606')).toBeInTheDocument(); // Probes
    expect(screen.getByText('4,887')).toBeInTheDocument(); // Epochs
    expect(screen.getByText('31,234')).toBeInTheDocument(); // Documents
  });

  it('clicking the Subjects tile switches the picker to "subjects"', async () => {
    const user = userEvent.setup();
    render(<SnapshotSection datasetId="ds-test" />);
    await user.click(
      screen.getByRole('button', { name: /Subjects: 5,314/i }),
    );
    expect(setPickerTabMock).toHaveBeenCalledWith('subjects');
  });

  it('clicking the Probes tile switches the picker to "probes" (NOT route out)', async () => {
    const user = userEvent.setup();
    render(<SnapshotSection datasetId="ds-test" />);
    await user.click(screen.getByRole('button', { name: /Probes: 606/i }));
    expect(setPickerTabMock).toHaveBeenCalledWith('probes');
  });

  it('clicking the Documents tile switches the picker to "documents"', async () => {
    const user = userEvent.setup();
    render(<SnapshotSection datasetId="ds-test" />);
    await user.click(
      screen.getByRole('button', { name: /Documents: 31,234/i }),
    );
    expect(setPickerTabMock).toHaveBeenCalledWith('documents');
  });

  it('Species tile is non-clickable (display-only)', () => {
    render(<SnapshotSection datasetId="ds-test" />);
    // The species tile renders its label + value without a button role
    // — it's a display tile, the ontology pills live in the provenance
    // band below.
    expect(
      screen.queryByRole('button', { name: /Species: 1/i }),
    ).toBeNull();
  });
});

describe('SnapshotSection — cold-start guidance', () => {
  it('renders the cold-start hint when nothing is selected', () => {
    hasAnySelectionStub = false;
    render(<SnapshotSection datasetId="ds-test" />);
    expect(
      screen.getByText(/Pick a subject or session in the left rail/i),
    ).toBeInTheDocument();
  });

  it('hides the cold-start hint when any dimension is set', () => {
    hasAnySelectionStub = true;
    render(<SnapshotSection datasetId="ds-test" />);
    expect(
      screen.queryByText(/Pick a subject or session/i),
    ).toBeNull();
  });
});
