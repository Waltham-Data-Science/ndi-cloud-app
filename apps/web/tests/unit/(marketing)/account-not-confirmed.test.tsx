/**
 * Account-not-confirmed client tests (CQ2).
 *
 * Shown when login succeeds but the account's email isn't yet
 * verified — the typical "I created the account, never opened the
 * email, now I can't log in" recovery path. Single-action card.
 *
 * Pinned behaviors:
 * - When `?email=` is missing, the resend button routes the user to
 *   `/resend-verification` (where they can enter the email manually).
 * - When `?email=` is present, the button calls
 *   `resendConfirmation({ email })` and routes to
 *   `/account-verification?email=<encodeURIComponent>`.
 * - On ApiError, surface the code so support can correlate.
 * - On network error, surface the generic "Network error" string.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { AccountNotConfirmedClient } from '@/app/(marketing)/account-not-confirmed/account-not-confirmed-client';

vi.mock('@/lib/api/auth', () => ({
  resendConfirmation: vi.fn(),
}));

const pushMock = vi.fn();
const searchParamsMock = { get: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsMock,
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
  searchParamsMock.get.mockReset();
  mockedResend.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AccountNotConfirmedClient', () => {
  it('routes to /resend-verification when no email is in the query string', async () => {
    searchParamsMock.get.mockReturnValue(null);
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <AccountNotConfirmedClient />
      </Wrapper>,
    );

    await user.click(
      screen.getByRole('button', { name: /send a new verification code/i }),
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/resend-verification');
    });
    expect(mockedResend).not.toHaveBeenCalled();
  });

  it('resends + routes to /account-verification when email is in the query string', async () => {
    searchParamsMock.get.mockReturnValue('audri@example.com');
    mockedResend.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <AccountNotConfirmedClient />
      </Wrapper>,
    );

    await user.click(
      screen.getByRole('button', { name: /send a new verification code/i }),
    );

    await waitFor(() => {
      expect(mockedResend).toHaveBeenCalledWith({
        email: 'audri@example.com',
      });
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        '/account-verification?email=audri%40example.com',
      );
    });
  });

  it('surfaces an ApiError code on resend failure', async () => {
    searchParamsMock.get.mockReturnValue('audri@example.com');
    mockedResend.mockRejectedValueOnce(
      new ApiError(429, { code: 'AUTH_RATE_LIMITED' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <AccountNotConfirmedClient />
      </Wrapper>,
    );

    await user.click(
      screen.getByRole('button', { name: /send a new verification code/i }),
    );

    expect(
      await screen.findByText(/AUTH_RATE_LIMITED/),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('surfaces a network error for non-ApiError throws', async () => {
    searchParamsMock.get.mockReturnValue('audri@example.com');
    mockedResend.mockRejectedValueOnce(new TypeError('fetch failed'));
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <AccountNotConfirmedClient />
      </Wrapper>,
    );

    await user.click(
      screen.getByRole('button', { name: /send a new verification code/i }),
    );

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });
});
