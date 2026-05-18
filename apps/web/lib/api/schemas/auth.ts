/**
 * Auth response schemas (CQ1).
 *
 * Runtime-validates the highest-traffic auth response shapes so a
 * backend rename or shape drift surfaces as a typed `ApiError` with
 * code `RESPONSE_SHAPE_INVALID` instead of a downstream null-deref
 * (or worse, silent wrong data).
 *
 * Wired through `apiFetch` via the `schema` option (see
 * `apps/web/lib/api/client.ts`). Each schema's inferred type is
 * exported as the canonical client-side type for that endpoint;
 * `lib/api/auth.ts` re-exports them as the public surface.
 *
 * Conventions:
 * - These are STRICT shapes (the contract is tight on both ends, we
 *   own the FastAPI proxy). Unknown fields get stripped by zod's
 *   default `.parse()` behavior — this is intentional sanitization
 *   so an accidental backend leak (e.g. internal flag) doesn't
 *   silently traverse into client state.
 * - Field-name casing matches the wire shape verbatim (mixed
 *   camelCase + the single `email_hash` snake_case). See
 *   `apps/web/AUTH_CONTRACT_AUDIT.md` for the rationale.
 */
import { z } from 'zod';

/**
 * `GET /api/auth/me` — mirrors FastAPI's `MeResponse` Pydantic model
 * at `backend/routers/auth.py:27-39`.
 */
export const MeResponseSchema = z.object({
  userId: z.string(),
  /** 16-char SHA-256 prefix of the user's email. */
  email_hash: z.string(),
  /** Org IDs the user belongs to; cached on the FastAPI session at login. */
  organizationIds: z.array(z.string()),
  /** Cloud-admin flag — drives `/my` scope-toggle visibility. */
  isAdmin: z.boolean(),
  /** Session issuance timestamp (unix seconds). */
  issuedAt: z.number(),
  /** Session last-touched timestamp (unix seconds). */
  lastActive: z.number(),
  /** Cloud access-token expiry (unix seconds) — NOT the session cookie's expiry. */
  expiresAt: z.number(),
  /**
   * Stream 3.4 (2026-05-15): true when this user is allowed to use
   * the /ask chat. Defaults to true for forward-compat — older
   * FastAPI builds that haven't shipped the gate yet still return
   * a working session shape. The /api/ask route re-checks
   * server-side via the same FastAPI flag, so an outdated frontend
   * can't bypass the gate.
   */
  canUseAsk: z.boolean().optional().default(true),
});

export type MeResponse = z.infer<typeof MeResponseSchema>;

/**
 * `POST /api/auth/login` — mirrors the FastAPI handler's return
 * (`backend/routers/auth.py:79-83`):
 *   `{ ok: true, user: { id }, expiresAt }`
 *
 * NOTE: this is the WIRE shape, not an `AuthUser`. The Phase 2b code
 * had a type lie — `login()` was declared `Promise<AuthUser>` but
 * the backend never returned that shape. Callers don't actually read
 * the return value (they invalidate the `['session']` query and let
 * `useSession` re-read `/api/auth/me`), so the lie was benign at
 * runtime. CQ1 fixes the declaration to match the wire.
 */
export const LoginResponseSchema = z.object({
  ok: z.literal(true),
  user: z.object({ id: z.string() }),
  /** Cloud access-token expiry (unix seconds). */
  expiresAt: z.number(),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;
