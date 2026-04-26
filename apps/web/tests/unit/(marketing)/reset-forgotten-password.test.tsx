/**
 * Reset-forgotten-password form tests (CQ2).
 *
 * This is the second leg of the forgot-password flow: the user has
 * the code from email plus a new password to set. The form has three
 * fields (email, code, new password) and gates submission on:
 *   - non-empty code
 *   - new password ≥ 12 chars
 *
 * Pinned behaviors:
 * - Email pre-fills from `?email=` query param so the user doesn't
 *   re-type. The reset-code page in `forgot-password-form.tsx`
 *   forwards the email this way (URL-encoded).
 * - On successful `resetForgottenPassword({email, code, newPassword})`,
 *   route to `/login`.
 * - `invalid_code` and `expired_code` ApiError codes surface as a
 *   FIELD-level error on the code input so the user knows what to
 *   fix without re-reading the entire page.
 * - Other ApiErrors surface as a form-level message with the code.
 * - Client-side validation: empty code OR password < 12 chars blocks
 *   submission and shows inline messages without firing the API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ResetForgottenPasswordForm } from '@/app/(marketing)/reset-forgotten-password/reset-forgotten-password-form';

vi.mock('@/lib/api/auth', () => ({
  resetForgottenPassword: vi.fn(),
}));

const pushMock = vi.fn();
const searchParamsMock = { get: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsMock,
}));

import { resetForgottenPassword as resetMock } from '@/lib/api/auth';
const mockedReset = vi.mocked(resetMock);

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
  searchParamsMock.get.mockReset();
  searchParamsMock.get.mockReturnValue('audri@example.com');
  mockedReset.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

const STRONG_PW = 'Strong!Pass99';

describe('ResetForgottenPasswordForm', () => {
  it('pre-fills email from ?email= query param', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetForgottenPasswordForm />
      </Wrapper>,
    );

    expect(screen.getByLabelText(/email/i)).toHaveValue('audri@example.com');
  });

  it('blocks submission when the code is empty', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetForgottenPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/new password/i), STRONG_PW);
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/reset code is required/i)).toBeInTheDocument();
    expect(mockedReset).not.toHaveBeenCalled();
  });

  it('blocks submission when the new password is shorter than 12 characters', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetForgottenPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/reset code/i), '123456');
    await user.type(screen.getByLabelText(/new password/i), 'tooshort1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(
      await screen.findByText(/at least 12 characters/i),
    ).toBeInTheDocument();
    expect(mockedReset).not.toHaveBeenCalled();
  });

  it('submits and routes to /login on success', async () => {
    mockedReset.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetForgottenPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/reset code/i), '123456');
    await user.type(screen.getByLabelText(/new password/i), STRONG_PW);
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(mockedReset).toHaveBeenCalledWith({
        email: 'audri@example.com',
        code: '123456',
        newPassword: STRONG_PW,
      });
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/login');
    });
  });

  it('surfaces invalid_code as a FIELD-level error on the code input', async () => {
    mockedReset.mockRejectedValueOnce(
      new ApiError(400, { code: 'invalid_code' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetForgottenPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/reset code/i), 'BADCODE');
    await user.type(screen.getByLabelText(/new password/i), STRONG_PW);
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(
      await screen.findByText(/invalid or has expired/i),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('surfaces expired_code with the same field-level message', async () => {
    mockedReset.mockRejectedValueOnce(
      new ApiError(400, { code: 'expired_code' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetForgottenPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/reset code/i), '123456');
    await user.type(screen.getByLabelText(/new password/i), STRONG_PW);
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(
      await screen.findByText(/invalid or has expired/i),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('surfaces other ApiError codes as form-level errors', async () => {
    mockedReset.mockRejectedValueOnce(
      new ApiError(500, { code: 'INTERNAL' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetForgottenPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/reset code/i), '123456');
    await user.type(screen.getByLabelText(/new password/i), STRONG_PW);
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(
      await screen.findByText(/INTERNAL/),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('surfaces a network-level error for non-ApiError throws', async () => {
    mockedReset.mockRejectedValueOnce(new TypeError('fetch failed'));
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <ResetForgottenPasswordForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/reset code/i), '123456');
    await user.type(screen.getByLabelText(/new password/i), STRONG_PW);
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });
});
