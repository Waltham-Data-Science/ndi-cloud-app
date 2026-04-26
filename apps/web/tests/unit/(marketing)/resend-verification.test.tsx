/**
 * Resend-verification form tests (CQ2).
 *
 * Standalone entry point for "I lost the verification email, send me
 * a new code." Distinct from /account-not-confirmed (which is post-
 * login, has a known email) — /resend-verification is direct-nav and
 * asks the user for their email.
 *
 * Pinned behaviors:
 * - Submit hits `resendConfirmation({ email })`.
 * - On success, route to `/account-verification?email=<encodeURIComponent>`
 *   so the verification form can pre-fill the email.
 * - On ApiError, surface the code.
 * - On network error, surface the generic "Network error" string.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ResendVerificationForm } from '@/app/(marketing)/resend-verification/resend-verification-form';

vi.mock('@/lib/api/auth', () => ({
  resendConfirmation: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { resendConfirmation as resendMock } from '@/lib/api/auth';
const mockedResend = vi.mocked(resendMock);

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
  mockedResend.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ResendVerificationForm', () => {
  it('submits email and routes to /account-verification on success', async () => {
    mockedResend.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResendVerificationForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'audri@example.com');
    await user.click(screen.getByRole('button', { name: /send verification code/i }));

    await waitFor(() => {
      expect(mockedResend).toHaveBeenCalledWith({ email: 'audri@example.com' });
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        '/account-verification?email=audri%40example.com',
      );
    });
  });

  it('surfaces an ApiError code on failure', async () => {
    mockedResend.mockRejectedValueOnce(
      new ApiError(429, { code: 'AUTH_RATE_LIMITED' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResendVerificationForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'audri@example.com');
    await user.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(
      await screen.findByText(/AUTH_RATE_LIMITED/),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('surfaces a network error for non-ApiError throws', async () => {
    mockedResend.mockRejectedValueOnce(new TypeError('fetch failed'));
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResendVerificationForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'audri@example.com');
    await user.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });
});
