/**
 * SelectionBar — sticky chip strip at the top of the workspace
 * canvas showing the current selection context.
 *
 * Phase F2 tests:
 *   - empty state: all 5 chips render as "— pick" affordances
 *   - filled state: a selected dimension renders as a brand-blue
 *     chip with a short-id label and a ✕ to clear
 *   - clicking ✕ calls the hook's clearOne(key)
 *   - clicking an empty chip switches the picker tab via the hook
 *   - "Clear all" appears only when something is selected
 *
 * The hook is mocked rather than driven through real URL state
 * because we're testing the bar's interaction with the hook's API,
 * not URL plumbing (which the hook's own test covers).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const clearOneMock = vi.fn();
const clearMock = vi.fn();
const setPickerTabMock = vi.fn();
const setMock = vi.fn();
let hasAnySelectionStub = false;
let selectionStub = {
  subject: null as string | null,
  session: null as string | null,
  probe: null as string | null,
  stimulus: null as string | null,
  unit: null as string | null,
};

vi.mock('@/lib/workspace/use-workspace-selection', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/workspace/use-workspace-selection')
  >('@/lib/workspace/use-workspace-selection');
  return {
    ...actual,
    useWorkspaceSelection: () => ({
      selection: selectionStub,
      hasAnySelection: hasAnySelectionStub,
      pickerTab: 'subjects' as const,
      set: setMock,
      clear: clearMock,
      clearOne: clearOneMock,
      setPickerTab: setPickerTabMock,
    }),
  };
});

import { SelectionBar } from '@/components/workspace/canvas/SelectionBar';

beforeEach(() => {
  clearOneMock.mockReset();
  clearMock.mockReset();
  setPickerTabMock.mockReset();
  setMock.mockReset();
  hasAnySelectionStub = false;
  selectionStub = {
    subject: null,
    session: null,
    probe: null,
    stimulus: null,
    unit: null,
  };
});

describe('SelectionBar — empty state', () => {
  it('renders all 5 empty-chip affordances', () => {
    render(<SelectionBar />);
    // Each empty chip says "<Label> — pick"; their title attributes
    // carry the full hint. Probe the buttons directly.
    expect(
      screen.getByTitle(/Pick a subject from the left rail/i),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle(/Pick a session from the left rail/i),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle(/Pick a probe from the left rail/i),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle(/Pick a stimulus from the left rail/i),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle(/Pick a unit from the left rail/i),
    ).toBeInTheDocument();
  });

  it('does NOT render "Clear all" when nothing is selected', () => {
    render(<SelectionBar />);
    expect(screen.queryByText('Clear all')).toBeNull();
  });

  it('clicking an empty chip switches picker tab via the hook', async () => {
    const user = userEvent.setup();
    render(<SelectionBar />);
    await user.click(screen.getByTitle(/Pick a session/i));
    expect(setPickerTabMock).toHaveBeenCalledWith('sessions');
  });

  it('clicking the empty "Probe" chip jumps to the probes picker tab', async () => {
    const user = userEvent.setup();
    render(<SelectionBar />);
    await user.click(screen.getByTitle(/Pick a probe/i));
    expect(setPickerTabMock).toHaveBeenCalledWith('probes');
  });
});

describe('SelectionBar — filled state', () => {
  it('renders the selected subject as a brand-blue chip with short-id', () => {
    selectionStub = {
      ...selectionStub,
      subject: '4126945ae99b0be0_40c293809848f24d',
    };
    hasAnySelectionStub = true;

    render(<SelectionBar />);
    // Short-id is first 8 + last 4 with an ellipsis.
    expect(screen.getByText(/4126945a…f24d/)).toBeInTheDocument();
    // The "Clear Subject selection" button is exposed via aria-label.
    expect(
      screen.getByRole('button', { name: /Clear Subject selection/i }),
    ).toBeInTheDocument();
  });

  it('clicking the chip ✕ calls clearOne(subject)', async () => {
    selectionStub = {
      ...selectionStub,
      subject: '4126945ae99b0be0_40c293809848f24d',
    };
    hasAnySelectionStub = true;
    const user = userEvent.setup();

    render(<SelectionBar />);
    await user.click(
      screen.getByRole('button', { name: /Clear Subject selection/i }),
    );
    expect(clearOneMock).toHaveBeenCalledWith('subject');
  });

  it('renders "Clear all" when any dimension is set', () => {
    selectionStub = { ...selectionStub, unit: '68d6e54703a03f5cfdac8eff' };
    hasAnySelectionStub = true;

    render(<SelectionBar />);
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('clicking "Clear all" calls clear()', async () => {
    selectionStub = { ...selectionStub, unit: '68d6e54703a03f5cfdac8eff' };
    hasAnySelectionStub = true;
    const user = userEvent.setup();

    render(<SelectionBar />);
    await user.click(screen.getByText('Clear all'));
    expect(clearMock).toHaveBeenCalled();
  });

  it('mixes empty chips and selected chips when only some keys are set', () => {
    selectionStub = {
      subject: '4126945ae99b0be0_40c293809848f24d',
      session: null,
      probe: null,
      stimulus: '68d6e54703a03f5cfdac8eff',
      unit: null,
    };
    hasAnySelectionStub = true;

    render(<SelectionBar />);
    // Filled: subject + stimulus carry mono short-id text.
    expect(screen.getByText(/4126945a…f24d/)).toBeInTheDocument();
    expect(screen.getByText(/68d6e547…8eff/)).toBeInTheDocument();
    // Empty: session/probe/unit show their "— pick" affordances.
    expect(screen.getByTitle(/Pick a session/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Pick a probe/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Pick a unit/i)).toBeInTheDocument();
  });
});

describe('SelectionBar — accessibility', () => {
  it('exposes a region role with a meaningful label', () => {
    render(<SelectionBar />);
    expect(
      screen.getByRole('region', { name: /Workspace selection context/i }),
    ).toBeInTheDocument();
  });
});
