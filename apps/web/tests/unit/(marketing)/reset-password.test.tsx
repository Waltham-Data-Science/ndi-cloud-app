/**
 * Reset-password (change-password) form tests (CQ2).
 *
 * /reset-password is the AUTHENTICATED change-password flow — the
 * user is signed in and rotating their own password. Distinct from
 * /reset-forgotten-password (the post-emailed-code flow). This page
 * requires the current password as proof of session, which protects
 * against an attacker with a stolen XSRF cookie but no password from
 * silently rotating creds.
 *
 * Pinned behaviors:
 * - Submit hits `changePassword({ currentPassword, newPassword })`.
 * - Client-side validation: new password ≥ 12 chars; new ≠ current.
 *   Each fails with a field-level error and does not fire the API.
 * - 401 / `wrong_password` ApiError surfaces as a field-level error
 *   on the current-password input (so the user re-types the right
 *   field, not the new one).
 * - On success, switch to a "Password updated" success card with a
 *   `Back to account` CTA.
 * - On other errors, surface the code in a form-level message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ResetPasswordForm } from '@/app/(marketing)/reset-password/reset-password-form';

vi.mock('@/lib/api/auth', () => ({
  changePassword: vi.fn(),
}));

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

// Default mock for useSession: an authenticated user so the form
// renders. Individual tests override this for the auth-gate behavior.
type MockUser = {
  userId: string;
  email_hash: string;
  organizationIds: string[];
  isAdmin: boolean;
  sessionIssuedAt: number;
};
type MockSession = { user: MockUser | null; isLoading: boolean; error: Error | null };
const sessionMock = vi.fn<() => MockSession>(() => ({
  user: {
    userId: 'u-test',
    email_hash: 'h',
    organizationIds: [],
    isAdmin: false,
    sessionIssuedAt: 0,
  },
  isLoading: false,
  error: null,
}));
vi.mock('@/lib/auth/use-session', () => ({
  useSession: () => sessionMock(),
}));

import { changePassword as changePwMock } from '@/lib/api/auth';
const mockedChange = vi.mocked(changePwMock);

import { ApiError } from '@/lib/api/client';

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestQueryProvider;
}

beforeEach(() => {
  pushMock.mockClear();
  replaceMock.mockClear();
  sessionMock.mockClear();
  sessionMock.mockImplementation(() => ({
    user: {
      userId: 'u-test',
      email_hash: 'h',
      organizationIds: [],
      isAdmin: false,
      sessionIssuedAt: 0,
    },
    isLoading: false,
    error: null,
  }));
  mockedChange.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

const STRONG_NEW = 'NewStrong!Pass99';
const STRONG_OLD = 'OldStrong!Pass99';

describe('ResetPasswordForm — validation', () => {
  it('blocks when the new password is shorter than 12 characters', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/current password/i), STRONG_OLD);
    await user.type(screen.getByLabelText(/new password/i), 'tooshort1');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(
      await screen.findByText(/at least 12 characters/i),
    ).toBeInTheDocument();
    expect(mockedChange).not.toHaveBeenCalled();
  });

  it('blocks when the new password equals the current password', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/current password/i), STRONG_OLD);
    await user.type(screen.getByLabelText(/new password/i), STRONG_OLD);
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(
      await screen.findByText(/must differ from current password/i),
    ).toBeInTheDocument();
    expect(mockedChange).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordForm — submission', () => {
  it('submits and renders the success card on successful change', async () => {
    mockedChange.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/current password/i), STRONG_OLD);
    await user.type(screen.getByLabelText(/new password/i), STRONG_NEW);
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(mockedChange).toHaveBeenCalledWith({
        currentPassword: STRONG_OLD,
        newPassword: STRONG_NEW,
      });
    });
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  it('surfaces 401 as a field-level error on the current-password input', async () => {
    mockedChange.mockRejectedValueOnce(
      new ApiError(401, { code: 'AUTH_REQUIRED' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/current password/i), 'wrongpw1');
    await user.type(screen.getByLabelText(/new password/i), STRONG_NEW);
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(
      await screen.findByText(/current password is incorrect/i),
    ).toBeInTheDocument();
    // Stays on the form — does NOT show the success card.
    expect(screen.queryByText(/password updated/i)).not.toBeInTheDocument();
  });

  it('surfaces wrong_password as a field-level error too', async () => {
    mockedChange.mockRejectedValueOnce(
      new ApiError(400, { code: 'wrong_password' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/current password/i), 'wrongpw1');
    await user.type(screen.getByLabelText(/new password/i), STRONG_NEW);
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(
      await screen.findByText(/current password is incorrect/i),
    ).toBeInTheDocument();
  });

  it('surfaces other ApiErrors as form-level errors', async () => {
    mockedChange.mockRejectedValueOnce(
      new ApiError(500, { code: 'INTERNAL' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/current password/i), STRONG_OLD);
    await user.type(screen.getByLabelText(/new password/i), STRONG_NEW);
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText(/INTERNAL/)).toBeInTheDocument();
  });

  it('surfaces a network error for non-ApiError throws', async () => {
    mockedChange.mockRejectedValueOnce(new TypeError('fetch failed'));
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/current password/i), STRONG_OLD);
    await user.type(screen.getByLabelText(/new password/i), STRONG_NEW);
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });
});

describe('ResetPasswordForm — anonymous auth gate (P0-1 a63c agent fix, 2026-05-14)', () => {
  it('redirects anonymous users to /login with returnTo set', async () => {
    sessionMock.mockImplementation(() => ({
      user: null,
      isLoading: false,
      error: null,
    }));

    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetPasswordForm />
      </Wrapper>,
    );

    // The redirect fires inside a useEffect, so wait for it.
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login?returnTo=/reset-password');
    });
    // While auth is being resolved / redirect is in flight, the form
    // is replaced by a loading placeholder — NOT the in-account form.
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
  });

  it('shows a loading placeholder while useSession is still resolving', () => {
    sessionMock.mockImplementation(() => ({
      user: null,
      isLoading: true,
      error: null,
    }));

    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetPasswordForm />
      </Wrapper>,
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
    // No redirect yet — useSession still resolving.
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('renders the form with a "Reset via email" escape hatch for authenticated users', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetPasswordForm />
      </Wrapper>,
    );

    // Form visible.
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    // Escape hatch link visible — for users who realize they can't
    // remember the current password, link them to the forgot-password
    // flow rather than leaving them stuck.
    const link = screen.getByRole('link', { name: /reset it via email/i });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });
});
