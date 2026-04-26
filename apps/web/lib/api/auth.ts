/**
 * Auth API helpers — Phase 2b.
 *
 * Thin wrappers over apiFetch covering the surface area the 9 auth
 * pages need. Every call:
 *   - hits the FastAPI proxy via /api/auth/* (Phase 4 wires the
 *     Vercel rewrite to Railway; Phase 2b deploys can hit the
 *     proxy directly via UPSTREAM_API_URL env)
 *   - relies on cookie-based session (credentials: 'include' is set
 *     in apiFetch)
 *   - returns the parsed JSON or throws ApiError
 *
 * Phase 3a brings the full data-browser surface (datasets, documents,
 * query, etc.) — auth is the slice that Phase 2b needs to wire login
 * + signup flows.
 */

import { apiFetch } from './client';

/**
 * Mirrors FastAPI's `MeResponse` Pydantic model
 * (`backend/routers/auth.py:27-39`) verbatim. The wire is
 * mixed-case — `userId`, `organizationIds`, `isAdmin`, `issuedAt`,
 * `lastActive`, `expiresAt` are camelCase; `email_hash` is the only
 * snake_case field. The frontend type matches the JSON shape
 * exactly so `apiFetch<AuthUser>('/api/auth/me')` is a pure cast,
 * no transform layer.
 *
 * `email` and `name` are NOT on the cookie session — FastAPI returns
 * a 16-char SHA-256 prefix as `email_hash` and never carries the
 * raw email or display name in the session blob (see
 * `backend/auth/session.py::SessionData`). Consumers that previously
 * showed `user.email` must either show the hash, the userId prefix,
 * or omit the row entirely.
 *
 * AUTH_CONTRACT_AUDIT.md is the canonical record. See B4.
 */
export type AuthUser = {
  userId: string;
  /** 16-char SHA-256 prefix of the user's email (deduplicates without reversibility). */
  email_hash: string;
  /** Org IDs the user belongs to; cached on the FastAPI session at login. */
  organizationIds: string[];
  /** Cloud-admin flag — drives `/my` scope-toggle visibility (REBUILD-6). */
  isAdmin: boolean;
  /** Session issuance timestamp (unix seconds). */
  issuedAt: number;
  /** Session last-touched timestamp (unix seconds). */
  lastActive: number;
  /** Cloud access-token expiry (unix seconds) — NOT the session cookie's expiry. */
  expiresAt: number;
};

/**
 * GET /api/auth/me — returns the current session's user, or null on
 * 401/unauthenticated. Most consumers want this through the
 * useSession() hook which adds TanStack Query caching.
 */
export async function me(): Promise<AuthUser | null> {
  try {
    return await apiFetch<AuthUser>('/api/auth/me');
  } catch (err) {
    // 401 = unauthenticated → caller's "logged-out" state, not an error
    // worth bubbling up. Other errors (5xx, network) re-throw.
    if (err instanceof Error && 'status' in err && (err as { status: number }).status === 401) {
      return null;
    }
    throw err;
  }
}

/**
 * POST /api/auth/login — exchanges email + password for a session
 * cookie. The server sets the HttpOnly `session` + non-HttpOnly
 * `XSRF-TOKEN` cookies. On 200 the caller routes to the post-login
 * destination (typically `?returnTo=` or `/my`).
 *
 * Wire-field note: FastAPI's `LoginBody` (backend/routers/auth.py:22-25)
 * requires the field `username`, not `email`. Cognito treats email as
 * the username; FastAPI passes the value through as-is. The function
 * keeps `email` as its public parameter name (matches the form's
 * user-facing "Email" label) and renames only on the wire. See
 * AUTH_CONTRACT_AUDIT.md.
 */
export async function login(email: string, password: string): Promise<AuthUser> {
  return apiFetch<AuthUser>('/api/auth/login', {
    method: 'POST',
    body: { username: email, password },
  });
}

/**
 * POST /api/auth/logout — clears the session. The HttpOnly cookie is
 * cleared server-side; the XSRF-TOKEN cookie is cleared via Set-Cookie
 * with Max-Age=0. UI should invalidate the ['session'] TanStack
 * cache after this so useSession() re-reads.
 */
export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

/**
 * POST /api/auth/signup — creates an unverified account, sends a
 * confirmation code to email. The flow continues at
 * /account-verification with the code.
 */
export async function signup(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ pendingVerification: true }> {
  return apiFetch('/api/auth/signup', {
    method: 'POST',
    body: input,
  });
}

/**
 * POST /api/auth/verify-email — exchanges the email code for a
 * verified-account state. On success the user can log in.
 */
export async function verifyEmail(input: {
  email: string;
  code: string;
}): Promise<{ verified: true }> {
  return apiFetch('/api/auth/verify-email', {
    method: 'POST',
    body: input,
  });
}

/**
 * POST /api/auth/resend-confirmation — re-sends the verification
 * code if the user lost the original email.
 */
export async function resendConfirmation(input: { email: string }): Promise<void> {
  await apiFetch('/api/auth/resend-confirmation', {
    method: 'POST',
    body: input,
  });
}

/**
 * POST /api/auth/forgot-password — kicks off password reset by
 * emailing a reset code to the user.
 */
export async function forgotPassword(input: { email: string }): Promise<void> {
  await apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: input,
  });
}

/**
 * POST /api/auth/reset-password — completes the forgot-password flow
 * by setting a new password using the emailed code.
 */
export async function resetForgottenPassword(input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  await apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: input,
  });
}

/**
 * POST /api/auth/change-password — changes an authenticated user's
 * password. Requires the current password as proof of session.
 */
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await apiFetch('/api/auth/change-password', {
    method: 'POST',
    body: input,
  });
}
