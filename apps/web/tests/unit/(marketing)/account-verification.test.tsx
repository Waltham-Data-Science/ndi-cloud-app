/**
 * Account-verification form tests (CQ2).
 *
 * Final leg of the create-account flow: the user clicks the email
 * confirmation code, paste it here, and the account becomes
 * verified. On success the form routes to /login (the user signs in
 * with the password they set during create-account).
 *
 * Pinned behaviors:
 * - Email pre-fills from `?email=` query param. When the param is
 *   present the email field is hidden — there's nothing to edit.
 * - When the email param is absent (user navigated directly), the
 *   email field is shown so they can enter it manually.
 * - Submit hits `verifyEmail({ email, code })`.
 * - On success, route to `/login`.
 * - `invalid_code` and `expired_code` surface as field-level errors
 *   on the code input.
 * - Other ApiErrors surface as form-level errors.
 * - Network errors surface as the generic "Network error" string.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { AccountVerificationForm } from '@/app/(marketing)/account-verification/account-verification-form';

vi.mock('@/lib/api/auth', () => ({
  verifyEmail: vi.fn(),
}));

const pushMock = vi.fn();
const searchParamsMock = { get: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsMock,
}));

import { verifyEmail as verifyEmailMock } from '@/lib/api/auth';
const mockedVerify = vi.mocked(verifyEmailMock);

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
  mockedVerify.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AccountVerificationForm — email handling', () => {
  it('hides the email input when ?email= is present in the URL', () => {
    searchParamsMock.get.mockReturnValue('audri@example.com');
    const Wrapper = withClient();
    render(
      <Wrapper>
        <AccountVerificationForm />
      </Wrapper>,
    );

    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it('shows the email input when no ?email= query param is present', () => {
    searchParamsMock.get.mockReturnValue(null);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <AccountVerificationForm />
      </Wrapper>,
    );

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
});

describe('AccountVerificationForm — submission', () => {
  beforeEach(() => {
    searchParamsMock.get.mockReturnValue('audri@example.com');
  });

  it('submits email + code and routes to /login on success', async () => {
    mockedVerify.mockResolvedValueOnce({ verified: true });
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <AccountVerificationForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/verification code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => {
      expect(mockedVerify).toHaveBeenCalledWith({
        email: 'audri@example.com',
        code: '123456',
      });
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/login');
    });
  });

  it('surfaces invalid_code as a field-level error on the code input', async () => {
    mockedVerify.mockRejectedValueOnce(
      new ApiError(400, { code: 'invalid_code' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <AccountVerificationForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/verification code/i), 'BAD');
    await user.click(screen.getByRole('button', { name: /verify email/i }));

    expect(
      await screen.findByText(/invalid or has expired/i),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('surfaces expired_code with the same field-level message', async () => {
    mockedVerify.mockRejectedValueOnce(
      new ApiError(400, { code: 'expired_code' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <AccountVerificationForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/verification code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify email/i }));

    expect(
      await screen.findByText(/invalid or has expired/i),
    ).toBeInTheDocument();
  });

  it('surfaces other ApiErrors as form-level errors', async () => {
    mockedVerify.mockRejectedValueOnce(
      new ApiError(500, { code: 'INTERNAL' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <AccountVerificationForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/verification code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify email/i }));

    expect(await screen.findByText(/INTERNAL/)).toBeInTheDocument();
  });

  it('surfaces a network error for non-ApiError throws', async () => {
    mockedVerify.mockRejectedValueOnce(new TypeError('fetch failed'));
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <AccountVerificationForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/verification code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify email/i }));

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });
});
