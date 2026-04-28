# Compliance posture — `ndi-cloud-app` (2026-04-26)

This document records the data-handling, encryption, access-control,
audit-trail, and regulatory-fit posture of the unified
`ndi-cloud-app` monorepo. It is descriptive ("here is what is true
today") rather than aspirational ("here is what we plan to do") —
contributors looking at a compliance question (e.g. "can we onboard
an institution that requires HIPAA?") should be able to answer from
this file plus the ADRs it references.

NDI Cloud is a research-data platform serving a small set of
neuroscience labs (Salk, Tufts, UCSD as of 2026-Q2). It does **not**
process Protected Health Information (PHI) and is therefore not a
HIPAA-covered entity. The encryption and access-control choices
below are appropriate for research-grade data with named-account
access, not for clinical workflows.

## Scope

In scope for this document:
- The Next.js 15 monorepo at this repo (`apps/web/` UI + edge middleware).
- The FastAPI proxy at `Waltham-Data-Science/ndi-data-browser-v2/backend/`
  on Railway (handles all browser ↔ cloud traffic).
- The `ndi-cloud-node` AWS Lambda + DocumentDB stack that owns user
  accounts (Cognito) and dataset metadata.
- S3 buckets that hold uploaded NWB / OpenMINDS binaries.

Out of scope:
- `ndi-cloud-node` internal authorization model — owned in that
  repository's own compliance docs.
- AWS Cognito user-pool configuration (managed in the AWS console,
  not in any source repo).

## 1. Data residency

| Surface | Storage | Region | Owner |
|---|---|---|---|
| User accounts (email, password hash, MFA secrets) | AWS Cognito User Pool | `us-east-1` | `ndi-cloud-node` |
| Dataset metadata, summaries, queries | AWS DocumentDB | `us-east-1` | `ndi-cloud-node` |
| Binary files (NWB, OpenMINDS, attachments) | AWS S3 | `us-east-1` | `ndi-cloud-node` |
| Session cookies (Fernet-encrypted access tokens) | Redis on Railway | US (Railway region per project setting) | `ndi-data-browser-v2` |
| Rate-limit counters | Redis on Railway | US | `ndi-data-browser-v2` |
| Summary-table response cache | Redis on Railway | US (1h TTL) | `ndi-data-browser-v2` |
| Frontend static assets (HTML, JS, CSS) | Vercel Edge | Global CDN | `ndi-cloud-app` |
| Frontend logs / Vercel Analytics | Vercel | Global | `ndi-cloud-app` |

All canonical data (users, datasets, binaries) lives in AWS
`us-east-1`. Vercel and Railway both handle only ephemeral or
derived state (assets, cookies, caches) — full Railway loss does
not lose any user-impactful data. See `Audit_2026-04-26 Phase 6.7
A6` (folded into the post-Phase-6.7 plan-doc state) for the full
risk analysis.

International contributors (current institutional partners are all
US-based) would route through Vercel's nearest edge for static
content, but every authenticated request still terminates in
`us-east-1`.

## 2. Encryption

### In transit

| Hop | Protocol | Notes |
|---|---|---|
| Browser → Vercel | TLS 1.2+ | Vercel-managed certs (Let's Encrypt + auto-rotation). HSTS sent (set in `next.config.ts` headers). |
| Vercel → FastAPI (Railway) | TLS 1.2+ | Vercel rewrite to `https://api.ndi-cloud.com` (Railway-managed cert). |
| FastAPI → `ndi-cloud-node` | TLS 1.2+ | httpx client to AWS API Gateway URL, AWS-managed cert. |
| `ndi-cloud-node` → DocumentDB / Cognito / S3 | TLS 1.2+ | AWS internal — `us-east-1` VPC, AWS-managed certs. |

No plaintext hop. CSP `upgrade-insecure-requests` pinned in both the
Vercel HTML CSP (`proxy.ts`) and the FastAPI JSON CSP
(`backend/middleware/security_headers.py`) — see
`Waltham-Data-Science/ndi-data-browser-v2/docs/adr/014-dual-csp-architecture.md`
for why we have both.

### At rest

| Surface | Encryption | Key management |
|---|---|---|
| AWS Cognito user records | AWS-managed | Cognito-internal, rotated by AWS. |
| AWS DocumentDB | AES-256 (cluster-level) | AWS KMS, customer-managed key. |
| AWS S3 binary files | AES-256 (SSE-S3) | S3-managed. |
| Redis session payload | Fernet (AES-128-CBC + HMAC-SHA256) | `SESSION_ENCRYPTION_KEY` env, owned by FastAPI. ADR-003. |
| Redis CSRF tokens | None at-rest (HMAC-signed via `CSRF_SIGNING_KEY`) | Tokens are ephemeral (24h TTL), signing key in env. |

Two custom keys live in Railway environment variables:
- `SESSION_ENCRYPTION_KEY` — 32-byte Fernet key, encrypts the
  access-token-bearing session payload before it lands in Redis.
- `CSRF_SIGNING_KEY` — 32-byte HMAC key, signs CSRF tokens.

**Rotation procedure** for both is documented in
`Waltham-Data-Science/ndi-data-browser-v2/docs/RUNBOOK.md` §"Key
rotation". Blast radius: every active session is invalidated, all
users see one extra login. Acceptable for a <10-user research
platform; would need a key-pair rotation strategy (decrypt with old,
re-encrypt with new) if user count grew an order of magnitude.

**Offline backup of these keys is the single un-version-controlled
state**: if both Railway env vars and the operator's password
manager were lost simultaneously, the only impact would be one
forced global re-login (sessions can't be decrypted, so they're
discarded; users log in fresh). Documented in the A6 audit findings
(post-Phase-6.7-Sequence-4 plan state).

## 3. Access controls

### Authentication

- **Identity provider**: AWS Cognito User Pool (single tenant, all
  institutional users). Owned by `ndi-cloud-node`.
- **Session mechanism**: HttpOnly cookie scoped `Domain=.ndi-cloud.com`,
  `Secure`, `SameSite=Lax`. Set by FastAPI on `/api/auth/login`
  success (Phase 4 cutover wires the apex domain). Idle TTL 2 hours,
  absolute TTL 24 hours, see `backend/auth/session.py`.
- **CSRF defense**: Double-submit cookie pattern. `XSRF-TOKEN` cookie
  + `X-XSRF-TOKEN` request header. Both checked by `CsrfMiddleware`
  on every state-changing method (POST/PUT/PATCH/DELETE). Origin/
  Referer also enforced via `OriginEnforcementMiddleware` (Phase 6.7
  O5).
- **No localStorage tokens, ever** — Phase 2b explicitly removed the
  legacy marketing-side localStorage flow. ESLint rule in
  `apps/web/eslint.config.mjs` forbids `localStorage` reads of any
  token-shaped key.

### Authorization

- **No client-side authorization decisions.** The frontend renders
  whatever `/api/me` reports plus whatever the API returns for
  resource fetches; FastAPI re-checks authorization on every
  request by passing the access token through to `ndi-cloud-node`.
- **Per-organization scoping** is enforced in `ndi-cloud-node`. The
  FastAPI proxy is intentionally a thin pass-through — the audit
  in Phase 6.7 §O6 (IDOR investigation) verified the proxy never
  trusts client-provided `org_id` / `user_id` for authorization
  decisions; everything that matters comes from the token claim
  set re-read in `ndi-cloud-node`.

### Privileged access

Two operator-level surfaces exist:
1. **Vercel dashboard** — controls deploy promotion + env vars for
   the frontend. Currently single-operator (Audri).
2. **Railway dashboard** — controls FastAPI deploys + env vars
   (including `SESSION_ENCRYPTION_KEY`, `CSRF_SIGNING_KEY`, etc.).
   Currently single-operator (Audri).

Plus the AWS console (`ndi-cloud-node` ownership), out of scope here.

No documented "who has admin access" inventory yet — single-operator
era. Adding a second operator before Phase 7 cutover would warrant a
short follow-up doc; not blocking for current scale.

## 4. Audit trail

### What we have

- **Vercel access logs**: 30-day retention, queryable in dashboard.
  Captures every request hitting the edge (including 4xx/5xx).
- **Railway / FastAPI structured logs**: every request log line
  carries `request_id`, `user_id` (when authenticated), `path`,
  `method`, `status`, `duration_ms`. Retention is whatever Railway's
  log plan retains (typically 30 days). Format:
  `backend/logging.py` (structlog JSON).
- **Cognito CloudTrail events**: AWS records every Cognito API call
  in `ndi-cloud-node`'s account. Auth failures, password changes,
  MFA setup are visible.
- **Auth-event logs in FastAPI**: structured log lines for `login`,
  `logout`, `change_password`, `confirm_email`, `password_reset`,
  `csrf_invalid`, `session_idle_timeout`, `rate_limited`. See
  `backend/routers/auth.py` and `backend/middleware/csrf.py`.

### What we don't have

- **Tamper-evident audit log.** The structured logs above live in
  Vercel / Railway / CloudTrail and are mutable by an operator with
  dashboard access. There is no append-only, externally-shipped audit
  store (no SIEM integration, no S3-with-Object-Lock log archive).
  Acceptable for current scale; not acceptable for SOC 2 / HIPAA.
- **Per-row dataset-access trail.** We do not log which user read
  which dataset row when. Only the request-level log captures the
  endpoint hit; if a future requirement needs "who accessed dataset
  X between dates Y-Z", it would have to come from request-log
  reconstruction.
- **Long-term retention.** 30 days is short for incident
  investigation. Documented gap; would require shipping logs to a
  longer-retention store (S3 + Athena typical).

These gaps are flagged here so a future contributor evaluating the
"what would HIPAA / SOC 2 require?" question doesn't have to rederive
the inventory.

## 5. HIPAA stance

**NDI Cloud is not a HIPAA-covered entity.** The platform handles
neuroscience research data — mostly subject-level recording metadata
(electrode locations, recording sessions, file paths) — that is
de-identified at upload. Subject identifiers are research codes
(e.g. `mouse-A12-2024`), not patient identifiers. There is no
clinical workflow, no provider-patient relationship, no insurance
billing data, no diagnosis or treatment record.

**If a future institutional partner required HIPAA compliance**, the
following work would be in scope (rough order of cost):

1. **Business Associate Agreement** with AWS (already available;
   Cognito + DocumentDB + S3 are all HIPAA-eligible AWS services).
2. **BAA with Vercel** — Vercel offers BAAs on enterprise plans
   only; current plan would need an upgrade.
3. **BAA with Railway** — Railway does not currently offer BAAs at
   any tier (as of 2026-Q2). Would force a migration of the FastAPI
   proxy to a HIPAA-eligible host (Fly.io's HIPAA tier, AWS Lambda,
   GCP Cloud Run with BAA, etc.). ADR-004's portability claim
   (`Waltham-Data-Science/ndi-data-browser-v2/docs/adr/004-drop-sqlite-dataset-storage.md`)
   was written specifically to keep this option open.
4. **Tamper-evident audit log** (see §4 above) shipping every PHI
   access to S3 with Object Lock + KMS, retained ≥6 years per HIPAA.
5. **Encryption-at-rest review** — current setup already meets HIPAA
   technical safeguards (AES-256 at every persistent layer); nothing
   to change.
6. **Access reviews** — quarterly review of Cognito user list, key
   rotation schedule (current keys rotate on demand only).
7. **Risk assessment + workforce training** — process documents,
   not code.

None of this is blocking for the current research-data scope. This
section exists so a future "we want to onboard a clinical partner"
conversation can start from a known baseline rather than from
scratch.

## 6. Open compliance items

| Item | Severity | Owner | Notes |
|---|---|---|---|
| Offline backup of `SESSION_ENCRYPTION_KEY` / `CSRF_SIGNING_KEY` | Low | Operator (manual, in password manager) | Documented in Phase 6.7 A6; only impact of loss is a forced global re-login. |
| Single-operator privileged access (Vercel + Railway) | Low | Operator | Acceptable at current scale (<10 users, single-operator era). Add a deputy before Phase 7 if onboarding institutions with stricter operational requirements. |
| Long-term log retention | Low | Operator | 30-day retention is fine for routine ops; would tighten for HIPAA / SOC 2. |
| Per-row data-access audit trail | Out of scope | — | Would build only if a partner contractually requires it. |
| Tamper-evident audit log | Out of scope | — | HIPAA / SOC 2 requirement; not pursued at current scope. |

## 7. References

- ADR-003 — Redis sessions, why they're "ephemeral by design".
  (`Waltham-Data-Science/ndi-data-browser-v2/docs/adr/003-redis-sessions.md`)
- ADR-004 — Drop SQLite dataset storage; FastAPI is stateless. Keeps
  HIPAA-relocate option open.
  (`Waltham-Data-Science/ndi-data-browser-v2/docs/adr/004-drop-sqlite-dataset-storage.md`)
- ADR-014 — Dual-CSP architecture (Vercel HTML + FastAPI JSON).
  (`Waltham-Data-Science/ndi-data-browser-v2/docs/adr/014-dual-csp-architecture.md`)
- AUTH_CONTRACT_AUDIT.md — Phase 6.7 auth wire contract +
  cookie/CSRF posture.
- RUNBOOK.md — operational reference (Phase 6.7 A7+A9).
  (`Waltham-Data-Science/ndi-data-browser-v2/docs/RUNBOOK.md`)
- Plan doc — full Phase 6.7 audit follow-ups including A6 backup
  audit, O5 origin enforcement, O6 IDOR investigation.
  (`Waltham-Data-Science/ndi-data-browser-v2/docs/plans/cross-repo-unification-2026-04-24.md`)

## 8. Update history

| Date | Change | Reason |
|---|---|---|
| 2026-04-26 | First draft. | Phase 6.7 Sequence 5 audit follow-up A10. |
