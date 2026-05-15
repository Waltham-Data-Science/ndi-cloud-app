# ADR-004 — HttpOnly cookie + CSRF double-submit (not Bearer tokens)

**Status:** Accepted (codifies the Phase 4 cutover decision)
**Date:** 2026-05-15
**Supersedes:** an earlier marketing-side localStorage Bearer flow that
was removed in Phase 2b.

## Context

We had two reasonable choices for browser-to-API authentication:

1. **HttpOnly session cookie** issued by the backend, with a separate
   non-HttpOnly CSRF token in a "double-submit" pattern (the token also
   echoed in an `X-XSRF-TOKEN` header).

2. **localStorage Bearer JWT** — the SPA reads the JWT and attaches it
   to every `Authorization: Bearer ...` header.

Pre-Phase 4 the marketing site (`ndi-web-app-wds`) used (2): the JWT
lived in localStorage and the frontend manually attached `Authorization`
to every fetch.

## Decision

Use **(1) HttpOnly session cookie + CSRF double-submit**, with these
specifics:

- Session cookie `session` — `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Domain=.ndi-cloud.com` (production, on `*.ndi-cloud.com` Origin only —
  see `backend/auth/cookie_attrs.py`).
- CSRF cookie `XSRF-TOKEN` — non-HttpOnly (so the SPA can read it),
  same scope. Signed with `CSRF_SIGNING_KEY` (HMAC-SHA256).
- Every mutating request must echo the CSRF token in `X-XSRF-TOKEN`
  header. CSRF middleware (`backend/middleware/csrf.py`) rejects with
  403 on mismatch.
- Defense-in-depth: Origin-enforcement middleware
  (`backend/middleware/origin_enforcement.py`) rejects mutating
  requests with a missing or non-allowlisted Origin.

The legacy localStorage flow was removed entirely. An ESLint rule in
`apps/web/eslint.config.mjs` (or its equivalent) forbids
`localStorage.getItem('token')` / `setItem('token', ...)` patterns to
prevent reintroduction.

## Rationale

1. **JS-XSS theft protection.** An HttpOnly cookie cannot be read by
   `document.cookie`. A bug or supply-chain compromise that injects
   arbitrary JS still can't exfiltrate the session token. With
   localStorage Bearer, the same bug exfiltrates the JWT trivially.

2. **CSRF defense doesn't have to be perfect on its own.** SameSite=Lax
   already blocks the most common CSRF vectors (cross-site POSTs from
   untrusted top-level navigations). The double-submit pattern is the
   second layer; Origin enforcement is the third. Defense in depth.

3. **Cross-subdomain consistency.** The `Domain=.ndi-cloud.com` scope
   means the same cookie works for `ndi-cloud.com` (apex) AND
   `app.ndi-cloud.com` (legacy redirect target). Critical for the
   Phase 7 cutover.

4. **Preview-time correctness.** The cookie_attrs helper (added
   2026-05-14) conditionally drops the Domain attribute on preview
   hosts (`*.vercel.app`) because the browser silently rejects
   cross-domain cookies. This wasn't necessary with Bearer tokens —
   but the trade-off is acceptable.

## Consequences

**Positive:**
- XSS-resistant session storage.
- No "remember to re-attach Authorization on every fetch" mental
  overhead in the SPA.
- Backend can revoke a session by deleting the Redis key — no need to
  shorten JWT TTLs to compensate for the lack of revocation.

**Negative:**
- CSRF double-submit + Origin enforcement adds three middlewares to the
  FastAPI stack. Documented, tested, but is real cognitive surface.
- `Domain=.ndi-cloud.com` boundary subtlety on preview hosts caused the
  May 2026 preview-time login bug (cookie_attrs.py was hardcoding the
  domain). Fixed by reading the request Origin and only attaching
  Domain when the Origin matches `*.ndi-cloud.com`.
- Tooling that uses Bearer auth (Postman, curl scripts) needs to either
  switch to cookie-jar mode or use the auth bootstrap `/api/auth/csrf`
  endpoint to mint a CSRF before mutating.

## Verification

- `backend/tests/unit/test_csrf.py` exercises the double-submit happy
  path + tamper-detection.
- `backend/tests/unit/test_origin_enforcement.py` exercises the
  Origin-rejection path.
- `backend/tests/unit/test_dependencies.py` exercises the UA/IP
  fingerprint enforcement on the session itself.

## Related

- `apps/web/COMPLIANCE.md` §3 Authentication
- `apps/web/docs/operations/hipaa-technical-safeguards.md` §164.312(d)
- Sibling repo: `Waltham-Data-Science/ndi-data-browser-v2/docs/adr/002-session-cookies-not-jwt-in-js.md`
