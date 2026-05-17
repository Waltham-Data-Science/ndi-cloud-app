/**
 * StimuliPicker — empty state, render-on-data, row-click → set({
 * stimulus }), and merge of stimulus_presentation +
 * stimulus_response.
 *
 * Phase F3 of the one-canvas redesign. Mocks `useDocuments` (one
 * call per class — we assert the hook is called twice) and
 * `useWorkspaceSelection` (the single write target).
 *
 * Includes pure-helper coverage for `projectStimulusRow` (type-
 * derivation + count-derivation across known schemas) and
 * `filterStimuli`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// jsdom's `getBoundingClientRect` returns zeros, so the real
// `useVirtualizer` reports an empty getVirtualItems() and renders
// no body rows. Mock it to render a fixed window so we can assert
// row-click handlers fire.
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

import {
  StimuliPicker,
  filterStimuli,
  projectStimulusRow,
} from '@/components/workspace/canvas/StimuliPicker';

beforeEach(() => {
  useDocumentsMock.mockReset();
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
      500,
    );
    expect(useDocumentsMock).toHaveBeenCalledWith(
      'ds1',
      'stimulus_response',
      1,
      500,
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

  it('renders the table when stimuli are present and merges both classes', () => {
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

    expect(screen.getByText('gratings')).toBeInTheDocument();
    expect(screen.getByText('EPM_arms')).toBeInTheDocument();
    expect(screen.getByText(/2 stimulus documents/i)).toBeInTheDocument();
  });

  it('row click calls set({ stimulus: docId })', () => {
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

    render(<StimuliPicker datasetId="ds1" />);

    const row = screen.getByText('gratings').closest('tr');
    expect(row).toBeTruthy();
    fireEvent.click(row!);

    expect(setSelectionMock).toHaveBeenCalledTimes(1);
    expect(setSelectionMock).toHaveBeenCalledWith({
      stimulus: 'pres-target-id',
    });
  });
});
