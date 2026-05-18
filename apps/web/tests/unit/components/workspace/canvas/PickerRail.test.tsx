/**
 * PickerRail — left rail container that mounts the picker tabs and
 * the active picker body slot.
 *
 * Phase F2 tests:
 *   - the slot for the active tab renders (the others don't)
 *   - the optional footer renders below the slot when provided
 *   - the picker tabs nav is mounted (rendering the 5 tabs)
 *   - the tabpanel role + id match the active tab
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let pickerTabStub: 'subjects' | 'sessions' | 'probes' | 'stimuli' | 'documents' =
  'subjects';

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
      hasAnySelection: false,
      pickerTab: pickerTabStub,
      set: vi.fn(),
      clear: vi.fn(),
      clearOne: vi.fn(),
      setPickerTab: vi.fn(),
    }),
  };
});

import { PickerRail } from '@/components/workspace/canvas/PickerRail';

beforeEach(() => {
  pickerTabStub = 'subjects';
});

const SLOTS = {
  subjects: <div data-testid="subjects-slot">Subjects body</div>,
  sessions: <div data-testid="sessions-slot">Sessions body</div>,
  probes: <div data-testid="probes-slot">Probes body</div>,
  stimuli: <div data-testid="stimuli-slot">Stimuli body</div>,
  documents: <div data-testid="documents-slot">Documents body</div>,
} as const;

describe('PickerRail — slot rendering', () => {
  it('renders only the slot for the active picker tab', () => {
    pickerTabStub = 'subjects';
    render(<PickerRail slots={SLOTS} />);
    expect(screen.getByTestId('subjects-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('sessions-slot')).toBeNull();
    expect(screen.queryByTestId('probes-slot')).toBeNull();
  });

  it('renders the Sessions slot when pickerTab=sessions', () => {
    pickerTabStub = 'sessions';
    render(<PickerRail slots={SLOTS} />);
    expect(screen.getByTestId('sessions-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('subjects-slot')).toBeNull();
  });

  it('renders the Documents slot when pickerTab=documents', () => {
    pickerTabStub = 'documents';
    render(<PickerRail slots={SLOTS} />);
    expect(screen.getByTestId('documents-slot')).toBeInTheDocument();
  });
});

describe('PickerRail — chrome', () => {
  it('mounts the picker tabs nav (5 tab buttons)', () => {
    render(<PickerRail slots={SLOTS} />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('renders the optional footer when provided', () => {
    render(
      <PickerRail
        slots={SLOTS}
        footer={<a data-testid="footer-link">escape</a>}
      />,
    );
    expect(screen.getByTestId('footer-link')).toBeInTheDocument();
  });

  it('omits the footer when not provided', () => {
    render(<PickerRail slots={SLOTS} />);
    expect(screen.queryByTestId('footer-link')).toBeNull();
  });

  it('exposes a tabpanel role whose id matches the active tab', () => {
    pickerTabStub = 'sessions';
    render(<PickerRail slots={SLOTS} />);
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'picker-panel-sessions',
    );
  });
});
