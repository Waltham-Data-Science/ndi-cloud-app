/**
 * auth.ts wrappers — call-shape contract.
 *
 * These tests don't exercise React hooks (auth.ts is plain functions,
 * not hooks); they just assert each wrapper hits the right path with
 * the right method + body. Covers the 9 wrappers in `lib/api/auth.ts`
 * — the catalog of "what the FastAPI auth surface looks like" from
 * the client's perspective.
 *
 * `me()` has its 401-→-null branch covered; the others assert that
 * the wrapper composes the apiFetch call correctly. Real semantics
 * (cookies set, redirects taken) are covered by the integration spec
 * `Header.auth-integration.test.tsx` and Phase 6's Playwright suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
  ApiError: class extends Error {
    status: number;
    code: string;
    body: unknown;
    constructor(status: number, body: unknown) {
      super(`API error ${status}`);
      this.status = status;
      this.code =
        body && typeof body === 'object' && 'code' in body
          ? String((body as { code: unknown }).code)
          : 'unknown';
      this.body = body;
    }
  },
}));

import {
  changePassword,
  confirmEmail,
  forgotPassword,
  login,
  logout,
  me,
  resendConfirmation,
  resetForgottenPassword,
  signup,
} from '@/lib/api/auth';
import { apiFetch, ApiError } from '@/lib/api/client';
import { mockAuthUser } from '@/tests/fixtures/auth';

const mockedApiFetch = vi.mocked(apiFetch);

describe('lib/api/auth wrappers', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('me()', () => {
    it('returns the parsed user on success', async () => {
      const fixture = mockAuthUser();
      mockedApiFetch.mockResolvedValueOnce(fixture);
      await expect(me()).resolves.toEqual(fixture);
      // CQ1: me() now passes `schema: MeResponseSchema` to apiFetch so
      // a backend shape drift surfaces as RESPONSE_SHAPE_INVALID
      // instead of a silent null-deref. The schema arg is opaque here;
      // we assert the path + presence of a parse method.
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({ schema: expect.objectContaining({ parse: expect.any(Function) }) }),
      );
    });

    it('returns null on 401 (treats logged-out as a normal state)', async () => {
      mockedApiFetch.mockRejectedValueOnce(new ApiError(401, { code: 'AUTH_REQUIRED' }));
      await expect(me()).resolves.toBeNull();
    });

    it('rethrows on non-401 errors', async () => {
      mockedApiFetch.mockRejectedValueOnce(new ApiError(500, { code: 'INTERNAL' }));
      await expect(me()).rejects.toBeInstanceOf(ApiError);
    });
  });

  it('login posts credentials to /api/auth/login with the wire field `username`', async () => {
    // FastAPI's LoginBody requires `username`, not `email`. The form's
    // user-facing label and prop name stay as "Email" — only the JSON
    // wire field name differs (Cognito treats email as the username
    // field). See AUTH_CONTRACT_AUDIT.md.
    //
    // CQ1: login() now returns the wire shape `{ ok, user, expiresAt }`
    // (was previously a typed-as-AuthUser cast that never matched the
    // backend response). Mock returns the right shape; assertion uses
    // objectContaining so the schema arg is asserted-by-shape rather
    // than by reference equality.
    mockedApiFetch.mockResolvedValueOnce({
      ok: true,
      user: { id: 'u-1' },
      expiresAt: 1761504000 + 3600,
    });
    await login('a@b.com', 'pw');
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: { username: 'a@b.com', password: 'pw' },
        schema: expect.objectContaining({ parse: expect.any(Function) }),
      }),
    );
  });

  it('logout posts to /api/auth/logout', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    await logout();
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
    });
  });

  it('signup posts the new-account body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ pendingVerification: true });
    await signup({ email: 'a@b.com', password: 'pw', name: 'A' });
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/auth/signup', {
      method: 'POST',
      body: { email: 'a@b.com', password: 'pw', name: 'A' },
    });
  });

  it('confirmEmail posts the code body to /api/auth/confirm-email', async () => {
    // B3 close-out: renamed from `verifyEmail` to align with the audit's
    // canonical endpoint name (matches the cloud's `confirmEmailAccount`
    // action verb). Path was previously `/api/auth/verify-email` which
    // the backend never served — every account-verification submit
    // 404'd silently before this rename.
    mockedApiFetch.mockResolvedValueOnce({ verified: true });
    await confirmEmail({ email: 'a@b.com', code: '123456' });
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/auth/confirm-email', {
      method: 'POST',
      body: { email: 'a@b.com', code: '123456' },
    });
  });

  it('resendConfirmation posts the email body', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    await resendConfirmation({ email: 'a@b.com' });
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/auth/resend-confirmation', {
      method: 'POST',
      body: { email: 'a@b.com' },
    });
  });

  it('forgotPassword posts the email body', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    await forgotPassword({ email: 'a@b.com' });
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'a@b.com' },
    });
  });

  it('resetForgottenPassword posts email + code + newPassword', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    await resetForgottenPassword({
      email: 'a@b.com',
      code: '123',
      newPassword: 'newpw',
    });
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/auth/reset-password', {
      method: 'POST',
      body: { email: 'a@b.com', code: '123', newPassword: 'newpw' },
    });
  });

  it('changePassword posts currentPassword + newPassword', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    await changePassword({ currentPassword: 'old', newPassword: 'new' });
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: 'old', newPassword: 'new' },
    });
  });
});
