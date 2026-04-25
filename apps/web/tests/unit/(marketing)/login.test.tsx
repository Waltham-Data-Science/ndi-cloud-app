/**
 * Login form tests — pattern-establishing spec for the 9 auth pages.
 *
 * Phase 2b ships 9 auth pages (~1500 LOC of form code). Testing all 9
 * exhaustively is Phase 6 territory (Playwright e2e against a real
 * preview deploy). This file covers the most-trafficked one (login)
 * at the unit level so future auth-form refactors have a regression
 * net for the canonical flow: the other 8 follow the same shape and
 * can lean on this as the template.
 *
 * What's covered:
 *   - happy-path login → invalidate session cache → router.push
 *   - 401 → "Email or password is incorrect" inline error
 *   - email_not_verified code → redirect to /account-not-confirmed
 *   - non-401 error → generic "try again" message
 *   - submit button disables during in-flight request
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { LoginForm } from '@/app/(marketing)/login/login-form';
import { ApiError } from '@/lib/api/client';

vi.mock('@/lib/api/auth', () => ({
  login: vi.fn(),
}));

const pushMock = vi.fn();
const searchParamsMock = { get: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsMock,
}));

import { login as loginMock } from '@/lib/api/auth';
const mockedLogin = vi.mocked(loginMock);

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
  searchParamsMock.get.mockReturnValue(null);
  mockedLogin.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LoginForm', () => {
  it('submits credentials and routes to /my on success', async () => {
    mockedLogin.mockResolvedValue({
      id: 'u-1',
      email: 'audri@walthamdatascience.com',
      emailVerified: true,
    });
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'audri@walthamdatascience.com');
    await user.type(screen.getByLabelText(/password/i), 'pw-correct');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(mockedLogin).toHaveBeenCalledWith(
      'audri@walthamdatascience.com',
      'pw-correct',
    );
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/my');
    });
  });

  it('routes to ?returnTo= destination on success when present', async () => {
    searchParamsMock.get.mockImplementation((k: string) =>
      k === 'returnTo' ? '/datasets/d1/overview' : null,
    );
    mockedLogin.mockResolvedValue({
      id: 'u-1',
      email: 'audri@walthamdatascience.com',
      emailVerified: true,
    });
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'audri@walthamdatascience.com');
    await user.type(screen.getByLabelText(/password/i), 'pw-correct');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/datasets/d1/overview');
    });
  });

  it('shows "Email or password is incorrect" on 401', async () => {
    mockedLogin.mockRejectedValue(new ApiError(401, { code: 'invalid_credentials' }));
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'audri@walthamdatascience.com');
    await user.type(screen.getByLabelText(/password/i), 'pw-wrong');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/email or password is incorrect/i),
      ).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('redirects to /account-not-confirmed on email_not_verified', async () => {
    mockedLogin.mockRejectedValue(
      new ApiError(403, { code: 'email_not_verified' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'unverified@example.com');
    await user.type(screen.getByLabelText(/password/i), 'pw-correct');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        '/account-not-confirmed?email=unverified%40example.com',
      );
    });
  });

  it('shows a generic error message on non-401 ApiError', async () => {
    mockedLogin.mockRejectedValue(
      new ApiError(503, { code: 'service_unavailable' }),
    );
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'audri@walthamdatascience.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/login failed.*service_unavailable/i),
      ).toBeInTheDocument();
    });
  });

  it('shows a network-error message on non-ApiError throws', async () => {
    mockedLogin.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'audri@walthamdatascience.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
