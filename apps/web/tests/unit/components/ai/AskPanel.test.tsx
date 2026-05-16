/**
 * AskPanel — mode rendering + ARIA invariants.
 *
 * Phase D of the workspace redesign (2026-05-16). The panel is a
 * three-mode UI (drawer / sidebar / fullscreen) driven by URL state.
 * Tests mock the underlying AskShell (we test panel chrome, not the
 * chat shell — that has its own tests in semantic-search-tool.test
 * + voyage-client.test) and verify:
 *
 *   1. Renders nothing when `?ask` is absent.
 *   2. Drawer mode: role="dialog" + aria-modal, contract button
 *      disabled (drawer IS the minimum).
 *   3. Sidebar mode: role="complementary", both expand + contract
 *      enabled.
 *   4. Fullscreen mode: role="dialog" + aria-modal, expand button
 *      disabled (fullscreen IS the maximum).
 *   5. Context line ("Asking about: <dataset>") shown when
 *      `context.datasetName` is passed.
 *   6. Close button calls `router.replace` without `?ask`.
 *   7. Esc key closes the panel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const replaceMock = vi.fn();
let searchParamsStub: URLSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsStub,
  usePathname: () => '/my/workspace/ds-test/overview',
}));

// Stub AskShell — we test panel chrome, not the chat surface.
vi.mock('@/components/ai/AskShell', () => ({
  AskShell: () => <div data-testid="ask-shell-mock">Ask shell</div>,
}));

import { AskPanel } from '@/components/ai/AskPanel';

function setMode(mode: string | null) {
  const p = new URLSearchParams();
  if (mode !== null) p.set('ask', mode);
  searchParamsStub = p;
}

beforeEach(() => {
  replaceMock.mockReset();
  searchParamsStub = new URLSearchParams();
});

afterEach(() => {
  searchParamsStub = new URLSearchParams();
});

describe('AskPanel — closed state', () => {
  it('renders nothing when ?ask is absent', () => {
    const { container } = render(<AskPanel />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});

describe('AskPanel — drawer mode', () => {
  it('renders role="dialog" with ask-shell inside', () => {
    setMode('drawer');
    render(<AskPanel />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('ask-shell-mock')).toBeInTheDocument();
  });

  it('has aria-modal=true in drawer mode', () => {
    setMode('drawer');
    render(<AskPanel />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('does NOT render a contract button in drawer mode (drawer is the minimum)', () => {
    setMode('drawer');
    render(<AskPanel />);
    expect(screen.queryByLabelText(/contract panel/i)).toBeNull();
  });

  it('renders an enabled expand button in drawer mode', () => {
    setMode('drawer');
    render(<AskPanel />);
    expect(screen.getByLabelText(/expand panel/i)).not.toBeDisabled();
  });

  it('shows context line when datasetName is provided', () => {
    setMode('drawer');
    render(<AskPanel context={{ datasetName: 'Francesconi EPM' }} />);
    expect(
      screen.getByText(/Asking about: Francesconi EPM/i),
    ).toBeInTheDocument();
  });

  it('omits the context line when datasetName is not provided', () => {
    setMode('drawer');
    render(<AskPanel />);
    expect(screen.queryByText(/Asking about:/i)).toBeNull();
  });
});

describe('AskPanel — sidebar mode', () => {
  it('renders role="complementary" (not a modal dialog)', () => {
    setMode('sidebar');
    render(<AskPanel />);
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('shows BOTH expand and contract buttons (sidebar is the middle)', () => {
    setMode('sidebar');
    render(<AskPanel />);
    expect(screen.getByLabelText(/expand panel/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/contract panel/i)).not.toBeDisabled();
  });
});

describe('AskPanel — fullscreen mode', () => {
  it('renders role="dialog" + aria-modal in fullscreen', () => {
    setMode('fullscreen');
    render(<AskPanel />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('does NOT render an expand button in fullscreen (fullscreen is the maximum)', () => {
    setMode('fullscreen');
    render(<AskPanel />);
    expect(screen.queryByLabelText(/expand panel/i)).toBeNull();
  });

  it('contract button is enabled in fullscreen', () => {
    setMode('fullscreen');
    render(<AskPanel />);
    expect(screen.getByLabelText(/contract panel/i)).not.toBeDisabled();
  });
});

describe('AskPanel — close interactions', () => {
  it('calls router.replace without ?ask when the close button is clicked', () => {
    setMode('drawer');
    render(<AskPanel />);
    fireEvent.click(screen.getByLabelText(/close ask panel/i));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).not.toContain('ask=');
  });

  it('closes the panel on Esc keypress (when open)', () => {
    setMode('sidebar');
    render(<AskPanel />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).not.toContain('ask=');
  });

  it('does NOT bind an Esc listener when closed (no spurious replaces on idle Esc)', () => {
    // ?ask absent — panel renders nothing — no Esc listener registered.
    render(<AskPanel />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
