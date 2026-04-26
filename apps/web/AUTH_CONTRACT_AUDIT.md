# Auth contract audit — Phase 6.7 (2026-04-26)

This document records the auth wire contract for the unified
`ndi-cloud-app` monorepo. It pins what the new frontend must call,
how `useSession` interprets the response, and what shape the cookie-
backed session presents to UI consumers.

The investigation that produced this audit started from cutover
blockers **B1** (login wire mismatch), **B3** (phantom auth backend),
and **B4** (`AuthUser` shape mismatch) raised by the independent
review. The first pass surfaced findings that needed user
confirmation before fixes could ship; this document is the
post-confirmation canonical record.

## Architecture (canonical)

The unified monorepo's auth flows route exclusively through the
FastAPI proxy at `/api/auth/*`, which lives on Railway. FastAPI is
the cookie-and-CSRF surface the browser sees. Server-side, FastAPI
calls the underlying `ndi-cloud` (Node + AWS Lambda) at
`api.ndi-cloud.com/v1/auth/*` to do the actual user-account work
(Cognito, DocumentDB, etc.). The browser never talks to
`api.ndi-cloud.com` directly.

```
┌────────────┐         ┌─────────┐         ┌──────────────────┐
│  Browser   │  /api/* │  Vercel │  /api/* │  FastAPI         │  /v1/auth/*
│ (RSC + JS) │ ───────▶│  proxy  │ ───────▶│  on Railway      │ ───────────▶  api.ndi-cloud.com
│            │         │         │         │  (httpx client)  │
└─────┬──────┘         └─────────┘         └─────────┬────────┘
      │                                              │
      │  HttpOnly session cookie                     │  Bearer access_token
      │  Domain=.ndi-cloud.com                       │  (server-side only,
      │  CSRF cookie + X-XSRF-TOKEN header           │   never leaves Railway)
      ▼                                              ▼
   useSession()                                  Cognito + DocumentDB
```

Three properties lock this in:

1. **HttpOnly + apex-level cookie** — Phase 4 set the session cookie
   `Domain=.ndi-cloud.com; HttpOnly; Secure; SameSite=Lax`. JS cannot
   read it; XSS cannot steal it. This is the migration's whole point.
2. **CSRF double-submit on every mutation** — `/api/auth/csrf`
   issues a signed (HMAC-SHA256, `CSRF_SIGNING_KEY`) token in both a
   non-HttpOnly cookie and the response body. Every mutation echoes
   the cookie value back as `X-XSRF-TOKEN`. `apiFetch` handles this
   transparently (`apps/web/lib/api/client.ts:55-81`).
3. **`api.ndi-cloud.com` is server-side only** — `connect-src` in the
   Vercel CSP intentionally lists FastAPI's host
   (`ndb-v2-production.up.railway.app`) and *not* `api.ndi-cloud.com`.
   The Lambda layer's URL exists in DNS but is never a fetch target
   from the browser.

The `app.ndi-cloud.com` DNS-not-resolving observation from the
initial audit pass is non-blocking: the data browser was previously
served from Railway directly, and the Phase 7 cutover plan
re-attaches the legacy host as a 301 redirect to the apex.

## What the legacy `ndi-web-app-wds` did is NOT the model

The legacy marketing site stored a **Bearer token in localStorage**
(`ndi-web-app-wds/app/src/lib/axios/index.ts:40-64`) and sent it as
`Authorization: Bearer ...` on every request. It called a Cognito-
style Express backend at `NEXT_PUBLIC_API_BASE_URL` directly, with
paths under `/auth/*` and `/users`.

This pattern is **explicitly not the target architecture** of the
unified monorepo:

- **localStorage tokens are XSS-exposed.** Any successful injection
  (third-party script, transitive dep compromise, etc.) reads the
  token and the attacker has full session privileges off-host.
- **Direct-to-Cognito flows skip the FastAPI seam** that lets us add
  rate-limiting, audit logging, request-shape validation, and origin
  enforcement in one place. The migration explicitly invests in
  FastAPI as the single auth surface.

The legacy code is referenced **only** for the cloud-side
request/response shapes (what fields Cognito expects in a forgot-
password call, what the verify-email body looks like, etc.). The
HTTP transport itself — Bearer + localStorage — is replaced by the
HttpOnly-cookie + CSRF pattern that login already uses on FastAPI.

## Canonical FastAPI auth surface (today + planned)

| Endpoint | Today | Phase 6.7 plans |
|---|---|---|
| `GET /api/auth/csrf` | ✅ exists | (no change) |
| `POST /api/auth/login` | ✅ exists; body `{ username, password }`; returns `{ ok, user, expiresAt }`, sets session + CSRF cookies | (no change) |
| `POST /api/auth/logout` | ✅ exists; returns `{ ok }`; clears cookies | (no change) |
| `GET /api/auth/me` | ✅ exists; returns `MeResponse` (see below) | (no change) |
| `POST /api/auth/signup` | ❌ missing | **Add** — proxies cloud `/auth/signup` |
| `POST /api/auth/forgot-password` | ❌ missing | **Add** — proxies cloud `/auth/forgotPassword` |
| `POST /api/auth/reset-password` | ❌ missing | **Add** — proxies cloud `/auth/updatePassword` |
| `POST /api/auth/confirm-email` | ❌ missing | **Add** — proxies cloud `/auth/confirmEmailAccount` |
| `POST /api/auth/resend-confirmation` | ❌ missing | **Add** — proxies cloud `/auth/resendEmailConfirmation` |

The five new endpoints follow the existing `/api/auth/login`
architectural model:

- Per-IP rate limit on the unauthenticated paths (signup,
  forgot-password, reset-password, confirm-email, resend-
  confirmation). Same envelope as `RATE_LIMIT_LOGIN_PER_IP_15MIN`.
- CSRF middleware enforces double-submit on all five (they're
  mutating endpoints; not exempt).
- Sanitized error responses through `BrowserError` subclasses — no
  Cognito error details (`UsernameExistsException`, etc.) leak in
  raw form; they get mapped to typed `ApiError` codes the frontend
  recognizes (`InvalidEmail`, `WeakPassword`, `EmailNotVerified`,
  etc.).
- `NdiCloudClient` extended with the five corresponding methods,
  wrapping the existing httpx + retry + circuit-breaker plumbing
  (`backend/clients/ndi_cloud.py:227 onward` is the model).

## Login (B1)

**Frontend wire shape — corrected:**

```ts
// apps/web/lib/api/auth.ts — login()
fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': csrf },
  credentials: 'include',
  body: JSON.stringify({ username: email, password }),
});
```

Note the wire field is `username`, not `email` — the FastAPI
`LoginBody` requires `username` (Cognito treats email as the
username field). The form's user-facing label and prop name remain
"Email"; only the JSON wire field name changes.

**Pre-fix:** target shipped `{ email, password }` → FastAPI Pydantic
validation returned 422 on every login attempt. CI didn't catch
because Playwright e2e ran against `next start` only with no live
FastAPI integration; unit-test mocks for `login()` matched the
frontend's wire shape, not the backend's.

## `MeResponse` and `AuthUser` (B4)

**Canonical shape (matches FastAPI `MeResponse` Pydantic model):**

```ts
// apps/web/lib/api/auth.ts
export type AuthUser = {
  userId: string;
  user_email_hash: string;     // 16-char prefix of SHA-256(email),
                               // sufficient to dedup but not reverse
  organization_ids: string[];  // captured from cloud login response,
                               // cached on the server-side session
  is_admin: boolean;
  issued_at: number;           // unix seconds
  last_active: number;         // unix seconds
  expires_at: number;          // unix seconds — the cloud-issued
                               // access token's expiry, not the
                               // session cookie's
};
```

**Pre-fix:** target's `AuthUser` mirrored the marketing-side stub
shape — `{ id, email, name?, emailVerified, orgs?, isAdmin? }` — none
of which FastAPI returns. Against the real backend, every consumer
of `useSession().user` saw `email===undefined`,
`organization_ids===undefined`, `is_admin===undefined` (only one
field survived because the original `isAdmin` was the right name by
chance via REBUILD-6's verification scope).

**Consumers to update:**

- `apps/web/app/(app)/my-account/my-account-client.tsx` — drop the
  email row (or render a hashed-prefix tag) and the email-verified
  row (FastAPI doesn't track this fact in the cookie session).
- `apps/web/app/(app)/my/my-datasets-client.tsx` —
  `orgCount = session.user.organization_ids.length`.
- `apps/web/components/marketing/Header.tsx` — surfaces `is_admin`
  for nav gating; field-name change only.

## What this means for marketing auth pages (B3)

The new monorepo unifies the marketing surface and the data browser.
Prior to unification, the marketing site at `ndi-cloud.com` did its
own auth via the legacy localStorage pattern; the data browser only
had login. Unification means **the unified site needs all the auth
flows that the marketing site had — but routed through FastAPI's
cookie pattern, not the legacy bearer pattern.**

The five missing FastAPI endpoints close that gap. Once they ship,
the marketing pages (`/create-account`, `/forgot-password`,
`/reset-password`, `/account-verification`,
`/account-not-confirmed`, `/resend-verification`) become fully
cookie-authed React surfaces. Successful signup → user is logged in
via the same session-cookie mechanism login uses.

## Ship plan

1. **B1 frontend rename** — single small PR against `ndi-cloud-app`.
   Rename the wire field, keep the `email` prop. ~5 LOC + a test
   update.
2. **B4 `AuthUser` shape change** — single small PR against
   `ndi-cloud-app`. Update the type + 3 consumers. ~30 LOC.
3. **B3 backend** — PR against `ndi-data-browser-v2`. Five proxy
   endpoints + `NdiCloudClient` extensions + Pydantic body schemas
   + tests. ~400-500 LOC.
4. **B3 frontend** — PR against `ndi-cloud-app`. Wire
   `lib/api/auth.ts` to the five new endpoints + e2e tests against a
   Vercel preview. ~150 LOC.

After (4) ships, every cutover blocker tagged B1/B3/B4 is closed.

## Status

- Architecture: **confirmed canonical** (this document).
- B1: planned, ships next.
- B4: planned, ships after B1.
- B3 backend + frontend: planned, ship after B4.
