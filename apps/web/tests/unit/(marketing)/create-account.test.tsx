/**
 * Create-account form tests — name-required + password-complexity fidelity.
 *
 * M6: source `pages/createAccount/index.tsx:17-20` made `name` required
 * (`Yup.string().min(2).max(50).required('Name is required')`). The
 * Phase 2b port relaxed it to optional. Restoring required-name preserves
 * researcher attribution on published datasets — the user-visible reason
 * the source enforced it.
 *
 * M7: source `pages/createAccount/index.tsx:25-31` validated against
 * `/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,99}$/` —
 * 8+ chars, 1 upper, 1 lower, 1 digit, 1 special, no whitespace. The
 * Phase 2b port checked length only. Cognito user pool defaults enforce
 * complexity server-side, so a length-only frontend would let users
 * submit weak passwords and surface confusing 400s. We restore complexity
 * client-side and keep the target's stricter 12-char minimum.
 *
 * The hint must spell out *what's missing* (uppercase, digit, etc.) as
 * the user types — not just "invalid password" — so users can correct
 * incrementally instead of guessing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { CreateAccountForm } from '@/app/(marketing)/create-account/create-account-form';

vi.mock('@/lib/api/auth', () => ({
  signup: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { signup as signupMock } from '@/lib/api/auth';
const mockedSignup = vi.mocked(signupMock);

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
  mockedSignup.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// A password that satisfies the full complexity policy + 12-char floor.
const STRONG_PW = 'Strong!Pass99';

describe('CreateAccountForm — name required (M6)', () => {
  it('blocks submission when name is empty and shows an inline error', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <CreateAccountForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/email/i), 'audri@example.com');
    await user.type(screen.getByLabelText(/^password$/i), STRONG_PW);
    await user.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(
      await screen.findByText(/name is required/i),
    ).toBeInTheDocument();
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it('rejects names shorter than 2 characters', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <CreateAccountForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/^name$/i), 'A');
    await user.type(screen.getByLabelText(/email/i), 'audri@example.com');
    await user.type(screen.getByLabelText(/^password$/i), STRONG_PW);
    await user.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(
      await screen.findByText(/name must be at least 2 characters/i),
    ).toBeInTheDocument();
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it('rejects names longer than 50 characters', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <CreateAccountForm />
      </Wrapper>,
    );

    // The input has maxLength=50 as a hard cap (browser-enforced), so
    // `user.type()` truncates at 50. Use `fireEvent.change` directly to
    // simulate a paste / programmatic value — verifies the JS validation
    // rejects the over-long string even when the maxLength guard is
    // bypassed (e.g. by an attacker, or copy-paste in some environments).
    const { fireEvent } = await import('@testing-library/react');
    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'a'.repeat(51) } });
    await user.type(screen.getByLabelText(/email/i), 'audri@example.com');
    await user.type(screen.getByLabelText(/^password$/i), STRONG_PW);
    await user.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(
      await screen.findByText(/name must be 50 characters or fewer/i),
    ).toBeInTheDocument();
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it('passes the name through to signup() when valid', async () => {
    mockedSignup.mockResolvedValue({ pendingVerification: true });
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <CreateAccountForm />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText(/^name$/i), 'Audri Bhowmick');
    await user.type(screen.getByLabelText(/email/i), 'audri@example.com');
    await user.type(screen.getByLabelText(/^password$/i), STRONG_PW);
    await user.click(screen.getByRole('button', { name: /send verification code/i }));

    await waitFor(() => {
      expect(mockedSignup).toHaveBeenCalledWith({
        email: 'audri@example.com',
        password: STRONG_PW,
        name: 'Audri Bhowmick',
      });
    });
  });
});

describe('CreateAccountForm — password complexity (M7)', () => {
  // Helper: fill name + email, then type the password under test.
  async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, pw: string) {
    await user.type(screen.getByLabelText(/^name$/i), 'Audri Bhowmick');
    await user.type(screen.getByLabelText(/email/i), 'audri@example.com');
    await user.type(screen.getByLabelText(/^password$/i), pw);
    await user.click(screen.getByRole('button', { name: /send verification code/i }));
  }

  it('rejects passwords under 12 characters even if complexity is met', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <CreateAccountForm />
      </Wrapper>,
    );

    // 11-char password that meets every complexity rule but is too short.
    await fillAndSubmit(user, 'Aa1!Aa1!Aa1');
    expect(
      await screen.findByText(/at least 12 characters/i),
    ).toBeInTheDocument();
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it('rejects passwords missing an uppercase letter', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <CreateAccountForm />
      </Wrapper>,
    );

    await fillAndSubmit(user, 'strong!pass99');
    expect(
      await screen.findByText(/uppercase letter/i),
    ).toBeInTheDocument();
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it('rejects passwords missing a lowercase letter', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <CreateAccountForm />
      </Wrapper>,
    );

    await fillAndSubmit(user, 'STRONG!PASS99');
    expect(
      await screen.findByText(/lowercase letter/i),
    ).toBeInTheDocument();
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it('rejects passwords missing a digit', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <CreateAccountForm />
      </Wrapper>,
    );

    await fillAndSubmit(user, 'StrongPassword!');
    expect(await screen.findByText(/number/i)).toBeInTheDocument();
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it('rejects passwords missing a special character', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <CreateAccountForm />
      </Wrapper>,
    );

    await fillAndSubmit(user, 'StrongPass99x');
    expect(
      await screen.findByText(/special character/i),
    ).toBeInTheDocument();
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it('rejects passwords containing whitespace', async () => {
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <CreateAccountForm />
      </Wrapper>,
    );

    await fillAndSubmit(user, 'Strong! Pass99');
    expect(
      await screen.findByText(/no spaces/i),
    ).toBeInTheDocument();
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it('accepts a password meeting every requirement', async () => {
    mockedSignup.mockResolvedValue({ pendingVerification: true });
    const user = userEvent.setup();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <CreateAccountForm />
      </Wrapper>,
    );

    await fillAndSubmit(user, STRONG_PW);
    await waitFor(() => {
      expect(mockedSignup).toHaveBeenCalledWith({
        email: 'audri@example.com',
        password: STRONG_PW,
        name: 'Audri Bhowmick',
      });
    });
  });
});
