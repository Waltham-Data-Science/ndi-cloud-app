/**
 * PickerRailTabs — sub-tab nav inside the left rail of the canvas.
 *
 * Phase F2 tests:
 *   - all 5 tabs render with the correct labels
 *   - the active tab gets aria-selected="true" and the brand-blue
 *     underline class; others are dim
 *   - clicking a tab calls setPickerTab(id) via the hook
 *   - ArrowLeft / ArrowRight cycle through tabs and call setPickerTab
 *   - exposes role="tablist" + each button has role="tab"
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const setPickerTabMock = vi.fn();
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
      setPickerTab: setPickerTabMock,
    }),
  };
});

import { PickerRailTabs } from '@/components/workspace/canvas/PickerRailTabs';

beforeEach(() => {
  setPickerTabMock.mockReset();
  pickerTabStub = 'subjects';
});

describe('PickerRailTabs — render', () => {
  it('renders all 5 tabs with correct labels', () => {
    render(<PickerRailTabs />);
    expect(screen.getByRole('tab', { name: 'Subjects' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sessions' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Probes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Stimuli' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Documents' })).toBeInTheDocument();
  });

  it('marks the active tab with aria-selected="true"', () => {
    pickerTabStub = 'sessions';
    render(<PickerRailTabs />);
    expect(screen.getByRole('tab', { name: 'Sessions' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Subjects' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('exposes a tablist role with horizontal orientation', () => {
    render(<PickerRailTabs />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('aria-orientation', 'horizontal');
  });
});

describe('PickerRailTabs — interaction', () => {
  it('clicking a tab calls setPickerTab with its id', async () => {
    const user = userEvent.setup();
    render(<PickerRailTabs />);
    await user.click(screen.getByRole('tab', { name: 'Sessions' }));
    expect(setPickerTabMock).toHaveBeenCalledWith('sessions');
  });

  it('ArrowRight on the active tab calls setPickerTab(next)', async () => {
    pickerTabStub = 'subjects';
    const user = userEvent.setup();
    render(<PickerRailTabs />);
    const active = screen.getByRole('tab', { name: 'Subjects' });
    active.focus();
    await user.keyboard('{ArrowRight}');
    expect(setPickerTabMock).toHaveBeenCalledWith('sessions');
  });

  it('ArrowLeft on the first tab wraps around to the last tab', async () => {
    pickerTabStub = 'subjects';
    const user = userEvent.setup();
    render(<PickerRailTabs />);
    const active = screen.getByRole('tab', { name: 'Subjects' });
    active.focus();
    await user.keyboard('{ArrowLeft}');
    expect(setPickerTabMock).toHaveBeenCalledWith('documents');
  });

  it('ArrowRight on the last tab wraps around to the first', async () => {
    pickerTabStub = 'documents';
    const user = userEvent.setup();
    render(<PickerRailTabs />);
    const active = screen.getByRole('tab', { name: 'Documents' });
    active.focus();
    await user.keyboard('{ArrowRight}');
    expect(setPickerTabMock).toHaveBeenCalledWith('subjects');
  });
});

describe('PickerRailTabs — roving tabindex', () => {
  it('only the active tab has tabIndex=0; others are -1', () => {
    pickerTabStub = 'probes';
    render(<PickerRailTabs />);
    expect(screen.getByRole('tab', { name: 'Probes' })).toHaveAttribute(
      'tabIndex',
      '0',
    );
    expect(screen.getByRole('tab', { name: 'Subjects' })).toHaveAttribute(
      'tabIndex',
      '-1',
    );
    expect(screen.getByRole('tab', { name: 'Documents' })).toHaveAttribute(
      'tabIndex',
      '-1',
    );
  });
});
