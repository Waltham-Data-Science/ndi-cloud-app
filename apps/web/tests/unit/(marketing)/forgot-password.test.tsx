/**
 * Forgot-password form tests (CQ2).
 *
 * The form is intentionally lean — single email input, single CTA. The
 * server returns 200 in *both* the email-exists and email-doesn't-
 * exist cases so we don't leak account-existence (a deliberate
 * timing-side-channel mitigation), and the form ALWAYS routes forward
 * to the reset-code page on success. These tests pin that contract:
 *
 * - Submit hits `forgotPassword({ email })` with the typed email.
 * - On any successful response, the form navigates to
 *   `/reset-forgotten-password?email=<encodeURIComponent>` so the
 *   downstream form can pre-fill the email field.
 * - On `ApiError`, surface the code in the form-level error message
 *   so support has something to correlate.
 * - On non-API errors (network), surface the generic "Network error"
 *   string (no leak of internal exception detail).
 *
 * The form is the entry point for the password-reset flow; if it
 * silently breaks, the user is stranded with no path forward.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ForgotPasswordForm } from '@/app/(marketing)/forgot-password/forgot-password-form';

vi.mock('@/lib/api/auth', () => ({
  forgotPassword: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { forgotPassword as forgotPasswordMock } from '@/lib/api/auth';
const mockedForgotPassword = vi.mocked(forgotPasswordMock);

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
  mockedForgotPassword.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ForgotPasswordForm', () => {
  it('submits the email and routes to /reset-forgotten-password on success', async () => {
    mockedForgotPassword.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ForgotPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'audri@example.com');
    await user.click(screen.getByRole('button', { name: /send reset code/i }));

    await waitFor(() => {
      expect(mockedForgotPassword).toHaveBeenCalledWith({
        email: 'audri@example.com',
      });
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        '/reset-forgotten-password?email=audri%40example.com',
      );
    });
  });

  it('surfaces the ApiError code on failure (so support can correlate)', async () => {
    mockedForgotPassword.mockRejectedValueOnce(
      new ApiError(429, { code: 'AUTH_RATE_LIMITED' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ForgotPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'audri@example.com');
    await user.click(screen.getByRole('button', { name: /send reset code/i }));

    expect(
      await screen.findByText(/AUTH_RATE_LIMITED/),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('surfaces a network-level error message for non-ApiError throws', async () => {
    mockedForgotPassword.mockRejectedValueOnce(new TypeError('fetch failed'));
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ForgotPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'audri@example.com');
    await user.click(screen.getByRole('button', { name: /send reset code/i }));

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  // Audit 2026-04-27 #7: heading describes the page action ("Forgot
  // your password?" — request a code), not the next page ("Reset
  // your password" — what /reset-forgotten-password does once the
  // code arrives).
  it('uses the question-form heading "Forgot your password?"', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ForgotPasswordForm />
      </Wrapper>,
    );
    expect(
      screen.getByRole('heading', { name: /forgot your password/i }),
    ).toBeInTheDocument();
    // The pre-fix heading must NOT render — pin the regression.
    expect(
      screen.queryByRole('heading', { name: /reset your password/i }),
    ).not.toBeInTheDocument();
  });
});
