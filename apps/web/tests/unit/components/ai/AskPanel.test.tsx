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

// Stub AskShell — we test panel chrome, not the chat surface. The
// mock captures the `context` and `prefill` props so the F7 + G
// enrichment tests can assert what AskPanel forwarded.
const askShellPropsLog: Array<{ context: unknown; prefill: unknown }> = [];
vi.mock('@/components/ai/AskShell', () => ({
  AskShell: (props: { context?: unknown; prefill?: unknown }) => {
    askShellPropsLog.push({
      context: props.context,
      prefill: props.prefill,
    });
    return <div data-testid="ask-shell-mock">Ask shell</div>;
  },
}));

// Phase F (W7 fix): AskPanel now calls useWorkspaceSelection to
// enrich context with the live selection. The hook is mocked so the
// panel tests stay focused on chrome + forwarding (the hook has its
// own unit test).
let workspaceSelectionStub = {
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
      selection: workspaceSelectionStub,
      hasAnySelection: Object.values(workspaceSelectionStub).some(
        (v) => v !== null,
      ),
      pickerTab: 'subjects' as const,
      set: vi.fn(),
      clear: vi.fn(),
      clearOne: vi.fn(),
      setPickerTab: vi.fn(),
    }),
  };
});

import { AskPanel } from '@/components/ai/AskPanel';

function setMode(mode: string | null) {
  const p = new URLSearchParams();
  if (mode !== null) p.set('ask', mode);
  searchParamsStub = p;
}

beforeEach(() => {
  replaceMock.mockReset();
  searchParamsStub = new URLSearchParams();
  askShellPropsLog.length = 0;
  workspaceSelectionStub = {
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

describe('AskPanel — F7 context enrichment from workspace selection', () => {
  // The point of these tests: AskPanel reads useWorkspaceSelection
  // and merges live selection into the context it passes to AskShell.
  // The forwarded context is what `DefaultChatTransport.body.context`
  // posts to /api/ask. Pre-fix (W7 audit), AskShell underscored its
  // context prop — these tests prevent regression.

  it('forwards no selection context when nothing is picked', () => {
    setMode('drawer');
    render(
      <AskPanel
        context={{ datasetId: 'abc', datasetName: 'Test dataset' }}
      />,
    );
    const last = askShellPropsLog[askShellPropsLog.length - 1]!;
    expect(last.context).toMatchObject({
      datasetId: 'abc',
      datasetName: 'Test dataset',
    });
    expect(last.context).not.toHaveProperty('selectedSubjectId');
    expect(last.context).not.toHaveProperty('selectedSessionId');
  });

  it('forwards selectedSubjectId when subject is picked', () => {
    workspaceSelectionStub = {
      ...workspaceSelectionStub,
      subject: '4126945ae99b0be0_40c293809848f24d',
    };
    setMode('drawer');
    render(
      <AskPanel
        context={{ datasetId: 'abc', datasetName: 'Test dataset' }}
      />,
    );
    const last = askShellPropsLog[askShellPropsLog.length - 1]!;
    expect(last.context).toMatchObject({
      selectedSubjectId: '4126945ae99b0be0_40c293809848f24d',
    });
  });

  it('forwards all selection keys when all are set', () => {
    workspaceSelectionStub = {
      subject: 'sub-1',
      session: 'sess-1',
      probe: 'probe-1',
      stimulus: 'stim-1',
      unit: 'unit-1',
    };
    setMode('drawer');
    render(<AskPanel context={{ datasetId: 'abc' }} />);
    const last = askShellPropsLog[askShellPropsLog.length - 1]!;
    expect(last.context).toMatchObject({
      datasetId: 'abc',
      selectedSubjectId: 'sub-1',
      selectedSessionId: 'sess-1',
      selectedProbeId: 'probe-1',
      selectedStimulusId: 'stim-1',
      selectedUnitId: 'unit-1',
    });
  });

  it('preserves the baseline context when no selection is set', () => {
    setMode('drawer');
    render(
      <AskPanel context={{ datasetId: 'abc', datasetName: 'Hello' }} />,
    );
    const last = askShellPropsLog[askShellPropsLog.length - 1]!;
    expect(last.context).toMatchObject({
      datasetId: 'abc',
      datasetName: 'Hello',
    });
  });

  it('omits keys whose selection is null (no undefined leaking through)', () => {
    workspaceSelectionStub = {
      ...workspaceSelectionStub,
      subject: 'sub-1',
      // session/probe/stimulus/unit remain null
    };
    setMode('drawer');
    render(<AskPanel context={{ datasetId: 'abc' }} />);
    const last = askShellPropsLog[askShellPropsLog.length - 1]! as {
      context: Record<string, unknown>;
    };
    expect(last.context.selectedSubjectId).toBe('sub-1');
    expect('selectedSessionId' in last.context).toBe(false);
    expect('selectedProbeId' in last.context).toBe(false);
    expect('selectedStimulusId' in last.context).toBe(false);
    expect('selectedUnitId' in last.context).toBe(false);
  });

  it('returns undefined context when no baseline and no selection', () => {
    setMode('drawer');
    render(<AskPanel />);
    const last = askShellPropsLog[askShellPropsLog.length - 1]!;
    expect(last.context).toBeUndefined();
  });
});

describe('AskPanel — G Phase prefill bus integration', () => {
  // The bus is module-level; reset between tests so a stale event
  // from a previous test doesn't fire on a fresh subscriber.

  // Lazy-import so the vi.mock above settles first.
  it('opens the panel when emitAskPrefill fires while closed', async () => {
    const { emitAskPrefill, __resetAskPrefillBusForTests } = await import(
      '@/lib/ai/ask-prefill-bus'
    );
    __resetAskPrefillBusForTests();
    setMode(null); // panel closed
    const { rerender } = render(<AskPanel context={{ datasetId: 'abc' }} />);

    // Initially closed — nothing in DOM.
    expect(screen.queryByTestId('ask-shell-mock')).toBeNull();

    // Emit a prefill — AskPanel should call openPanel which writes
    // ?ask=drawer via router.replace.
    emitAskPrefill({ text: 'Tell me about these 3 subjects' });
    // Verify the open call was routed; second render reflects open state.
    expect(replaceMock).toHaveBeenCalled();
    const lastUrl = replaceMock.mock.calls[replaceMock.mock.calls.length - 1]![0] as string;
    expect(lastUrl).toContain('ask=drawer');

    // Simulate the URL update by re-rendering with ?ask=drawer.
    setMode('drawer');
    rerender(<AskPanel context={{ datasetId: 'abc' }} />);
    expect(screen.getByTestId('ask-shell-mock')).toBeInTheDocument();

    __resetAskPrefillBusForTests();
  });

  it('forwards the prefill payload to AskShell once the panel opens', async () => {
    const { emitAskPrefill, __resetAskPrefillBusForTests } = await import(
      '@/lib/ai/ask-prefill-bus'
    );
    __resetAskPrefillBusForTests();
    setMode('drawer'); // already open
    askShellPropsLog.length = 0;
    render(<AskPanel context={{ datasetId: 'abc' }} />);
    askShellPropsLog.length = 0; // ignore initial mount log

    emitAskPrefill({
      text: 'Ask me about these subjects',
      autoSend: true,
    });

    // Wait a tick for React state to flush.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // After the event AskShell re-receives a prefill prop.
    const last = askShellPropsLog[askShellPropsLog.length - 1]!;
    expect(last.prefill).toMatchObject({
      text: 'Ask me about these subjects',
      autoSend: true,
    });

    __resetAskPrefillBusForTests();
  });

  it('does not error when emit fires before AskPanel mounts (silent drop)', async () => {
    const { emitAskPrefill, __resetAskPrefillBusForTests } = await import(
      '@/lib/ai/ask-prefill-bus'
    );
    __resetAskPrefillBusForTests();
    // No render — no subscribers — emit is a no-op.
    expect(() =>
      emitAskPrefill({ text: 'into the void' }),
    ).not.toThrow();
  });
});
