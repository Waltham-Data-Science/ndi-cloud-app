/**
 * WorkspaceAuthGate — auth-gate behaviour for the redesigned
 * `/my/workspace/[id]/*` route group (Phase A, 2026-05-16).
 *
 * Replaces the pre-redesign `workspace-client.test.tsx` auth-gate
 * describe block; same invariants:
 *
 *   1. When `useSession` resolves to `user === null`, the gate
 *      pushes the user to `/login?returnTo=<current path>`.
 *      Pre-cutover audits caught a regression where the redirect
 *      didn't fire because of a missing effect dep — locking that
 *      here.
 *   2. While `session.isLoading` the gate renders a skeleton
 *      placeholder (not the children, not the redirect message).
 *   3. When authenticated the gate renders `children` verbatim.
 *
 * The `returnTo` value is derived from `usePathname()` so the user
 * lands back on the exact tab they were trying to reach (Overview /
 * Subjects / Sessions / …) after sign-in. Test stubs `usePathname`
 * to verify the URL roundtrip.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const replaceMock = vi.fn();
let pathnameStub: string = '/my/workspace/ds-test-1/overview';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => pathnameStub,
}));

let sessionStub: {
  user: { id: string; email: string } | null;
  isLoading: boolean;
} = { user: null, isLoading: true };

vi.mock('@/lib/auth/use-session', () => ({
  useSession: () => sessionStub,
}));

import { WorkspaceAuthGate } from '@/components/workspace/WorkspaceAuthGate';

describe('WorkspaceAuthGate', () => {
  it('redirects to /login with returnTo when session resolves user=null', () => {
    sessionStub = { user: null, isLoading: false };
    pathnameStub = '/my/workspace/ds-test-1/subjects';
    replaceMock.mockReset();

    render(
      <WorkspaceAuthGate datasetId="ds-test-1">
        <p>Gated content</p>
      </WorkspaceAuthGate>,
    );

    expect(replaceMock).toHaveBeenCalledTimes(1);
    const target = replaceMock.mock.calls[0]![0] as string;
    expect(target).toContain('/login');
    // returnTo encodes the CURRENT pathname, so a user trying to
    // reach the Subjects tab lands back on Subjects post-login —
    // not on the bare workspace root.
    expect(target).toContain(
      'returnTo=' + encodeURIComponent('/my/workspace/ds-test-1/subjects'),
    );
    expect(screen.getByText(/redirecting to sign in/i)).toBeInTheDocument();
    expect(screen.queryByText('Gated content')).not.toBeInTheDocument();
  });

  it('does NOT redirect while session is still loading', () => {
    sessionStub = { user: null, isLoading: true };
    pathnameStub = '/my/workspace/ds-test-2/overview';
    replaceMock.mockReset();

    render(
      <WorkspaceAuthGate datasetId="ds-test-2">
        <p>Gated content</p>
      </WorkspaceAuthGate>,
    );

    expect(replaceMock).not.toHaveBeenCalled();
    // The skeleton placeholder is visible; children are not.
    expect(screen.queryByText('Gated content')).not.toBeInTheDocument();
  });

  it('renders children when the user is authenticated', () => {
    sessionStub = {
      user: { id: 'u1', email: 'a@b.c' },
      isLoading: false,
    };
    pathnameStub = '/my/workspace/ds-test-3/overview';
    replaceMock.mockReset();

    render(
      <WorkspaceAuthGate datasetId="ds-test-3">
        <p>Gated content</p>
      </WorkspaceAuthGate>,
    );

    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByText('Gated content')).toBeInTheDocument();
  });

  it('falls back to /my/workspace/<id> when usePathname returns null', () => {
    // Defensive: usePathname can theoretically return null in edge-
    // case App Router transitions. The gate's `?? '/my/workspace/${id}'`
    // fallback keeps returnTo pointed at a sensible default rather
    // than `/login?returnTo=` (which strips the user's destination).
    sessionStub = { user: null, isLoading: false };
    // @ts-expect-error — intentionally testing the null branch
    pathnameStub = null;
    replaceMock.mockReset();

    render(
      <WorkspaceAuthGate datasetId="ds-fallback">
        <p>Gated content</p>
      </WorkspaceAuthGate>,
    );

    expect(replaceMock).toHaveBeenCalledTimes(1);
    const target = replaceMock.mock.calls[0]![0] as string;
    expect(target).toContain(
      'returnTo=' + encodeURIComponent('/my/workspace/ds-fallback'),
    );
  });
});
