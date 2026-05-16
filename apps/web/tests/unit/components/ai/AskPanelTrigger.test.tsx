/**
 * AskPanelTrigger — floating button + Cmd+K shortcut.
 *
 * Phase D of the workspace redesign. Tests cover:
 *   1. Renders the trigger button when panel is closed.
 *   2. Hidden when panel is open (no double affordance).
 *   3. Clicking the button calls `openPanel()`.
 *   4. Cmd+K opens the panel.
 *   5. Ctrl+K (non-Mac) opens the panel.
 *   6. Cmd+K does NOT open when focus is inside an input/textarea
 *      (focus guard — don't steal the shortcut from a workspace
 *      filter input).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const openPanelMock = vi.fn();
let panelOpen = false;

vi.mock('@/lib/ai/use-ask-panel-state', () => ({
  useAskPanelState: () => ({
    open: panelOpen,
    mode: 'drawer' as const,
    openPanel: openPanelMock,
    expand: vi.fn(),
    contract: vi.fn(),
    close: vi.fn(),
    setMode: vi.fn(),
  }),
}));

import { AskPanelTrigger } from '@/components/ai/AskPanelTrigger';

beforeEach(() => {
  openPanelMock.mockReset();
  panelOpen = false;
});

afterEach(() => {
  panelOpen = false;
});

describe('AskPanelTrigger', () => {
  it('renders the button when the panel is closed', () => {
    render(<AskPanelTrigger />);
    expect(screen.getByLabelText(/open ask panel/i)).toBeInTheDocument();
  });

  it('renders nothing when the panel is open (avoids double affordance)', () => {
    panelOpen = true;
    const { container } = render(<AskPanelTrigger />);
    expect(container.firstChild).toBeNull();
  });

  it('calls openPanel when the button is clicked', () => {
    render(<AskPanelTrigger />);
    fireEvent.click(screen.getByLabelText(/open ask panel/i));
    expect(openPanelMock).toHaveBeenCalledTimes(1);
  });

  it('opens the panel on Cmd+K', () => {
    render(<AskPanelTrigger />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(openPanelMock).toHaveBeenCalledTimes(1);
  });

  it('opens the panel on Ctrl+K (non-Mac)', () => {
    render(<AskPanelTrigger />);
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(openPanelMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT open the panel on Cmd+K when a textarea has focus', () => {
    render(
      <div>
        <textarea data-testid="txt" />
        <AskPanelTrigger />
      </div>,
    );
    const ta = screen.getByTestId('txt') as HTMLTextAreaElement;
    ta.focus();
    fireEvent.keyDown(ta, { key: 'k', metaKey: true, bubbles: true });
    expect(openPanelMock).not.toHaveBeenCalled();
  });
});
