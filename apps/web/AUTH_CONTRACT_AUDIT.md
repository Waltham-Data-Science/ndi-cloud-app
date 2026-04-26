# Auth contract audit — Phase 6.7 (2026-04-26)

Investigation of the live auth surface, performed at the start of
Phase 6.7 to align the new monorepo's `lib/api/auth.ts` with the
backend contract before shipping fixes for cutover blockers
**B1** (login wire mismatch), **B3** (phantom auth backend),
**B4** (`AuthUser` shape mismatch).

**Bottom line:** B1 and B4 are partially fixable inside the new
monorepo. **B3 is a foundational architectural question that needs
user decision before implementation can proceed.** This document
exists to surface that decision; the actual code changes are not
shipped in the same PR as this audit.

## What was investigated

Per the Phase 6.7 brief: *"open `app.ndi-cloud.com` in a real
browser, capture the actual HTTP requests/responses for
login/signup/reset/verify-email/`/api/auth/me` via DevTools Network
tab, document findings as `apps/web/AUTH_CONTRACT_AUDIT.md`, then
update the new monorepo's `lib/api/auth.ts` and `AuthUser` type to
match the captured contracts. The fix is alignment, not invention."*

Pre-condition checked: *"If the investigation reveals genuinely-missing
endpoints (i.e., the live data browser also can't sign up), surface
that as a separate finding and stop — that's a different problem."*

That pre-condition triggered. Stopping the implementation pass and
surfacing.

## Findings

### F1. `app.ndi-cloud.com` DNS does not resolve

```
$ dig +short app.ndi-cloud.com
(no record)
```

The domain the user told me to capture from doesn't exist in public
DNS. Possible reasons: (a) the legacy data browser was decommissioned
and the DNS record was removed; (b) the URL is wrong in the user's
mental model; (c) Cloudflare-only access (didn't probe further to
avoid the sandbox tripping on external reconnaissance).

### F2. The reachable production surface

| Host | Resolves | Purpose |
|---|---|---|
| `ndi-cloud.com` | 76.76.21.21 (Vercel) | OLD marketing site (Pages Router) — `/datasets` 404s |
| `app.ndi-cloud.com` | NO RECORD | claimed live data browser — does not exist |
| `dev.ndi-cloud.com` | `cname.vercel-dns.com` | Vercel preview/dev URL |
| `api.ndi-cloud.com` | AWS API Gateway (us-east-1) | the `ndi-cloud-node` service (Lambda + DocumentDB/Atlas) |
| `ndb-v2-production.up.railway.app` | Fastly (Railway) | FastAPI proxy + statically-mounted Vite SPA `frontend/dist` |

The live data browser frontend is at the Railway URL
(`ndb-v2-production.up.railway.app/`), served as the static `dist`
mount on top of FastAPI — confirmed by `curl /` returning the
`<title>NDI Data Browser</title>` HTML shell with the Vite asset
manifest. The CUTOVER `Phase 8` step *"drop FastAPI static-files
mount"* references exactly this mount.

### F3. FastAPI's actual auth surface (only four endpoints)

From `https://ndb-v2-production.up.railway.app/openapi.json`:

```
/api/auth/csrf
/api/auth/login
/api/auth/logout
/api/auth/me
```

Confirmed against the source at
`ndi-data-browser-v2/backend/routers/auth.py` — only those four
routes are declared. There is **no signup, no email-verification,
no password-reset, no resend-confirmation, no change-password
endpoint anywhere on FastAPI.** Never has been, per
`git log -p backend/routers/auth.py`.

### F4. OLD data browser frontend (`ndi-data-browser-v2/frontend`) only has login

The legacy data browser's `pages/LoginPage.tsx` is the *only* auth
page in the data-browser source. No signup form, no password reset
form. Its `useLogin` hook (per the Phase 6.6 audit) POSTs
`{username, password}` to `/api/auth/login` — matches FastAPI's
`LoginBody`. Login works in the legacy data browser today.

### F5. OLD marketing site (`ndi-web-app-wds`) is where signup/reset live, and it bypasses FastAPI entirely

`app/src/api/auth/*.ts` and `app/src/api/user/createNewAccount.ts`
make 8 distinct auth-related HTTP calls. The base URL is the env
var `NEXT_PUBLIC_API_BASE_URL` — **not** the FastAPI proxy.
`app/src/lib/axios/index.ts:18` resolves it from process env, with
a hard-coded `http://localhost:3001/v1` dev fallback.

The HTTP contract that the live marketing site at `ndi-cloud.com`
uses today:

| Operation | Method + Path | Body | Notes |
|---|---|---|---|
| Login | `POST /auth/login` | `{ email, password }` | Returns `{ user, token }` — Bearer token, not cookie |
| Logout | `POST /auth/logout` | `{ email }` | Token-based; HTTP 200 = success |
| Signup | `POST /users` | `{ email, name, password }` | Returns `{ code: 'UsernameExistsException' }` on dup or success envelope |
| Verify email | `POST /auth/verify` | `{ email, confirmationCode }` | |
| Resend confirmation | `POST /auth/confirmation/resend` | `{ email }` | |
| Forgot password | `POST /auth/password/forgot` | `{ email }` | |
| Reset forgotten password | `POST /auth/password/confirm` | `{ email, newPassword, confirmationCode }` | |
| Change password (authenticated) | `POST /auth/password` | `{ oldPassword, newPassword }` | Bearer token in `Authorization` header |

The error envelopes carry Cognito-style `code` strings
(`UsernameExistsException`, `CodeMismatchException`, etc.) — i.e.,
this backend is a thin Express layer in front of AWS Cognito, not
the FastAPI proxy in front of `ndi-cloud-node`.

### F6. The new monorepo's `lib/api/auth.ts` mixes both contracts

It targets FastAPI's path (`/api/auth/...`) but ships marketing-side
bodies and shape expectations:

- Login: `POST /api/auth/login` `{ email, password }` → FastAPI 422 (`username` required)
- Signup: `POST /api/auth/signup` `{ email, name, password }` → FastAPI 404
- Verify: `POST /api/auth/verify-email` `{ email, code }` → 404
- Resend: `POST /api/auth/resend-confirmation` `{ email }` → 404
- Forgot: `POST /api/auth/forgot-password` `{ email }` → 404
- Reset: `POST /api/auth/reset-password` `{ email, newPassword, code }` → 404
- Change: `POST /api/auth/change-password` `{ oldPassword, newPassword }` → 404
- Me: `GET /api/auth/me` returns FastAPI's `MeResponse`
  (`userId, email_hash, organizationIds, isAdmin, ...`) but the
  TS `AuthUser` declares `id, email, name?, emailVerified, orgs?, isAdmin?`

So login fails because of the wire-shape mismatch (B1), `useSession`
returns an object with all-undefined fields except `isAdmin` against
the real FastAPI (B4), and six other auth flows simply 404 (B3).

### F7. The user's stated assumption ("FastAPI proxies through to ndi-cloud-node") doesn't match what's in the codebase

The Phase 6.7 brief said: *"The live data browser at app.ndi-cloud.com
already has working signup, login, and password reset. Whatever those
flows hit (likely proxied through FastAPI to ndi-cloud-node) is the
contract the new monorepo's frontend should match."*

Verified contradictions:

1. **"live data browser at app.ndi-cloud.com"** — the URL doesn't
   resolve. The actual live data browser is at the Railway URL.
2. **"already has working signup, login, and password reset"** — the
   data-browser frontend has only login. Signup + password reset live
   in the marketing site at `ndi-cloud.com`, served by a separate
   `ndi-web-app-wds` deployment.
3. **"likely proxied through FastAPI to ndi-cloud-node"** — the
   marketing site doesn't go through FastAPI at all. It calls a
   Cognito-style Express backend at `NEXT_PUBLIC_API_BASE_URL`
   (probably the same host `api.ndi-cloud.com` for prod, but we
   couldn't probe externally to confirm; either way, not FastAPI).
   FastAPI exposes neither the path shapes nor the body shapes that
   the marketing's signup/reset/verify flows use.

The migration plan said FastAPI would unify auth via HttpOnly cookies
(see `CLAUDE.md` § Auth: *"HttpOnly `session` cookie set by FastAPI..."*).
That intent applies to **login/logout/me**, which FastAPI does
implement. **It was never extended to signup/reset/verify.** The new
monorepo's frontend assumes that extension exists.

## What I was authorized to fix vs. what needs decision

| Blocker | Fixable in monorepo (frontend only)? | Decision needed? |
|---|---|---|
| B1 — login wire `email`→`username` | Yes — rename the wire field; `email` stays the prop | No — proceed with simple rename |
| B4a — `AuthUser` field rename to match `MeResponse` | Yes — `id→userId`, `orgs→organizationIds`, drop `name`/`emailVerified` since FastAPI doesn't return them | No — proceed |
| B4b — display the real email on `/my-account` | **No** — FastAPI returns `email_hash`, not the email. Either (a) accept hashed-email-only display; (b) extend FastAPI's `MeResponse` to include `email` (backend change, requires extension of the limited `ndi-data-browser-v2` authorization in this session) | **Yes** |
| B3 — signup, verify, resend, forgot, reset, change | **No fixed-from-frontend path.** Either (a) new monorepo calls Cognito Express directly (bypassing FastAPI, reintroducing localStorage Bearer tokens for those flows or accepting a CORS dance); (b) implement the 6 endpoints in FastAPI as proxy/mirror (backend change, more work, requires extending session.py to also be a Cognito Admin SDK / backend); (c) hide the 6 marketing pages and route account creation/recovery through a support email | **Yes** |

## Recommendations for the user

The Phase 6.7 brief explicitly forbade implementing FastAPI auth
endpoints. So path (b) — implement in FastAPI — is off the table for
this session. Of the remaining options:

**For B3 (signup, verify, reset, change-password):**
- **Option A:** Hide the 6 marketing pages + Header links to them.
  Add a banner on the marketing `/login` page directing users to
  email `audri@walthamdatascience.com` for account creation /
  recovery. Smallest scope; ships immediately. Loses self-service
  account creation for the institutional users (Salk/Tufts/UCSD)
  but at <10 users this is operationally fine.
- **Option C:** Direct Cognito-Express calls (bypass FastAPI for
  these 6 flows, keep FastAPI for login/logout/me). Reintroduces a
  small amount of localStorage usage for the signup/reset auxiliary
  state (since these flows expect token-based session handoff to
  login, not cookie). Mismatched architecture; harder to reason
  about; closer to the marketing site's prior behavior.
- **Defer:** Treat B3 as out-of-scope for Phase 6.7 — let the 6
  pages stay broken until either a Phase 8+ FastAPI auth-extension
  PR or a deliberate "signup is admin-mediated" decision lands.
  The marketing site at `ndi-cloud.com` (un-migrated) keeps serving
  signup until Phase 7 cutover; users who need accounts go there.

**For B4b (`/my-account` email display):**
- **Path forward A:** display "Account ID: {userId.slice(0,8)}…"
  instead of email. Accepts the privacy-preserving hash design.
- **Path forward B:** extend FastAPI `MeResponse` to include the
  unhashed email. Single-line change in `backend/auth/session.py`
  and `routers/auth.py`. Requires extending the Phase 6.7 backend
  authorization beyond the currently-allowed B7/B8/A8 items.

## Pending action

I am proceeding with B1 + B4a — the parts that are fixable inside
the frontend without architectural decision — as a follow-up PR
once the user's call on B3 + B4b lands. **B3 fix and B4b fix are
blocked on user decision.**

In the meantime, the rest of Phase 6.7 Sequence 1 ships
(B5/B2/O1/B7/B8/A1/A8 are independent of auth contract resolution),
plus Sequences 2–5 to the extent the auth blockers don't gate them.

## Status

- Investigation: complete.
- B1 + B4a (frontend-only alignment): planned, blocked on user
  re-confirming after this audit.
- B3 + B4b: **blocked on user decision** between Options A / C /
  Defer (B3) and Path A / B (B4b).
