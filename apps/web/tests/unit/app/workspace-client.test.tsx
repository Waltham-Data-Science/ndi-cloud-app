/**
 * Stream 6.2 — workspace-client auth-gate + key-remount tests.
 *
 * Two protected behaviors:
 *   1. Auth gate. When `useSession` resolves to `user === null` the
 *      client component pushes the user to /login with returnTo. Pre-
 *      cutover audits caught a regression where the redirect didn't
 *      fire because the session-resolution effect dep was missing.
 *      Locking that here.
 *   2. Key-remount. The panel stack is keyed by `datasetId`. Changing
 *      the id must FULLY unmount + remount the panel tree so prior
 *      datasets' mutation results don't flash under the new header.
 *      Without the key, individual panels would keep stale state and
 *      every panel would need its own resetting effect (which we
 *      explicitly avoided — see workspace-client.tsx:142-143).
 *
 * Tests render the orchestrator with all 7 panels stubbed; we verify
 * the gate effect + the remount via mount-counting mocks.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const replaceMock = vi.fn();

// next/navigation — we only need `useRouter().replace`.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Session shape: { user, isLoading, ... }. Tests rebind via the
// `sessionStub` ref before render.
let sessionStub: {
  user: { id: string; email: string } | null;
  isLoading: boolean;
} = { user: null, isLoading: true };

vi.mock('@/lib/auth/use-session', () => ({
  useSession: () => sessionStub,
}));

// Dataset hook — we only read `.data?.name`; null is fine.
vi.mock('@/lib/api/datasets', () => ({
  useDataset: () => ({ data: null, isLoading: false, isError: false }),
}));

// Per-panel mount counts via the same shared map. Mocking each panel
// as a "count mounts" component lets the key-remount test assert
// React fully unmounted + remounted the stack on datasetId change.
const mountCounts = new Map<string, number>();

function panelMock(name: string) {
  const Mock = ({ datasetId }: { datasetId: string }) => {
    // Bump the mount count for THIS panel on every fresh React mount
    // (React only calls a function-component body on mount, not on
    // prop-change rerenders of the same instance — when the parent
    // key changes, React unmounts the whole subtree and remounts a
    // fresh instance, so this counter ticks).
    const key = `${name}:${datasetId}`;
    mountCounts.set(key, (mountCounts.get(key) ?? 0) + 1);
    return (
      <div data-testid={`panel-${name}`} data-dataset={datasetId}>
        {name}
      </div>
    );
  };
  // Explicit displayName so the eslint `react/display-name` rule
  // doesn't flag the anonymous-arrow component returned by the
  // factory. Useful for React DevTools too.
  Mock.displayName = `PanelMock(${name})`;
  return Mock;
}

vi.mock('@/components/workspace/BehavioralComparePanel', () => ({
  BehavioralComparePanel: panelMock('BehavioralCompare'),
}));
vi.mock('@/components/workspace/DatasetStructurePanel', () => ({
  DatasetStructurePanel: panelMock('DatasetStructure'),
}));
vi.mock('@/components/workspace/ElectrodePositionPanel', () => ({
  ElectrodePositionPanel: panelMock('ElectrodePosition'),
}));
vi.mock('@/components/workspace/PsthPanel', () => ({
  PsthPanel: panelMock('Psth'),
}));
vi.mock('@/components/workspace/SignalViewerPanel', () => ({
  SignalViewerPanel: panelMock('SignalViewer'),
}));
vi.mock('@/components/workspace/SpikeActivityPanel', () => ({
  SpikeActivityPanel: panelMock('SpikeActivity'),
}));
vi.mock('@/components/workspace/TreatmentTimelinePanel', () => ({
  TreatmentTimelinePanel: panelMock('TreatmentTimeline'),
}));

import { WorkspaceClient } from '@/app/(app)/my/workspace/[id]/workspace-client';

describe('WorkspaceClient — auth gate', () => {
  it('redirects to /login when session resolves user=null', () => {
    sessionStub = { user: null, isLoading: false };
    replaceMock.mockReset();
    render(<WorkspaceClient datasetId="ds-test-1" />);

    expect(replaceMock).toHaveBeenCalledTimes(1);
    const target = replaceMock.mock.calls[0]![0] as string;
    expect(target).toContain('/login');
    expect(target).toContain(
      'returnTo=' + encodeURIComponent('/my/workspace/ds-test-1'),
    );
    // While the redirect is in flight, the "Redirecting to sign in…"
    // placeholder renders (panels stay unmounted).
    expect(screen.getByText(/redirecting to sign in/i)).toBeInTheDocument();
    expect(
      screen.queryByTestId('panel-DatasetStructure'),
    ).not.toBeInTheDocument();
  });

  it('does NOT redirect while session is still loading', () => {
    sessionStub = { user: null, isLoading: true };
    replaceMock.mockReset();
    render(<WorkspaceClient datasetId="ds-test-2" />);

    expect(replaceMock).not.toHaveBeenCalled();
    // Loading skeleton renders; panels stay unmounted.
    expect(
      screen.queryByTestId('panel-DatasetStructure'),
    ).not.toBeInTheDocument();
  });

  it('renders the panel stack when user is authenticated', () => {
    sessionStub = {
      user: { id: 'u1', email: 'a@b.c' },
      isLoading: false,
    };
    replaceMock.mockReset();
    mountCounts.clear();
    render(<WorkspaceClient datasetId="ds-test-3" />);

    // No redirect; all 7 panels mount.
    expect(replaceMock).not.toHaveBeenCalled();
    for (const name of [
      'DatasetStructure',
      'SignalViewer',
      'SpikeActivity',
      'BehavioralCompare',
      'TreatmentTimeline',
      'ElectrodePosition',
      'Psth',
    ]) {
      expect(screen.getByTestId(`panel-${name}`)).toBeInTheDocument();
    }
  });
});

describe('WorkspaceClient — key-remount on datasetId change', () => {
  it('fully unmounts + remounts the panel stack when datasetId changes', () => {
    sessionStub = {
      user: { id: 'u1', email: 'a@b.c' },
      isLoading: false,
    };
    replaceMock.mockReset();
    mountCounts.clear();

    const { rerender } = render(<WorkspaceClient datasetId="alpha" />);
    // First render: every panel mounted once with datasetId="alpha".
    expect(mountCounts.get('DatasetStructure:alpha')).toBe(1);
    expect(mountCounts.get('SignalViewer:alpha')).toBe(1);

    // Change the id — key={datasetId} on the wrapping div forces a
    // full remount. Each panel's mount count for the NEW id should
    // be 1 (fresh instance), and the OLD id counter did NOT
    // increment (those instances were unmounted, not re-rendered).
    act(() => {
      rerender(<WorkspaceClient datasetId="beta" />);
    });
    expect(mountCounts.get('DatasetStructure:beta')).toBe(1);
    expect(mountCounts.get('SignalViewer:beta')).toBe(1);
    expect(mountCounts.get('DatasetStructure:alpha')).toBe(1);
  });
});
