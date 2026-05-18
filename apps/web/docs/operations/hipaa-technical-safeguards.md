# HIPAA Technical Safeguards — control-by-control mapping

**Status:** verified against code on 2026-05-15
**Public claim being audited:** `/security` page renders
`apps/web/app/(marketing)/security/page.tsx:195`:

> HIPAA Technical Safeguards — Access control, audit controls, integrity, person
> authentication, transmission security — all architected against 45 CFR 164.312.

**Posture:** NDI Cloud is **HIPAA-aware by design** — every architectural decision
points at §164.312 — but is **not a HIPAA-covered entity** today. The
distinction matters: this document inventories every implementation hook, calls
out every gap that would surface if a covered-entity onboarding ever
materialized, and is the doc Compliance + IRB reviewers should read first.

The companion documents:

- **`apps/web/docs/compliance/posture.md`** — externalized posture for IRB / CISO
- **`apps/web/COMPLIANCE.md`** — internal contributor-facing posture (older;
  predates this audit; superseded by the two above but kept for the data-residency table)

---

## How to read each control row

Each of the five §164.312 controls is mapped four ways:

| Column | What it answers |
|---|---|
| **Public claim** | What `/security` (or another externally-visible doc) promises today |
| **Code that implements it** | Line-anchored references to the actual implementation |
| **Verification test** | Existing test (or "TBD" with what's needed) that pins the behavior |
| **Gap + remediation status** | What is *not* yet implemented, and what would close it |

"Verification test: TBD" rows mark places where the implementation exists but no
test pins the contract — adding the test is a Stream 6 line item.

---

## §164.312(a) — Access control

> *45 CFR §164.312(a)(1):* "Implement technical policies and procedures for
> electronic information systems that maintain electronic protected health
> information to allow access only to those persons or software programs that
> have been granted access rights."

### (a)(2)(i) — Unique user identification

| Aspect | Detail |
|---|---|
| **Public claim** | Pillar card: *"Tenant isolation at the data layer"* — every read filtered against the signed-in user's org permissions. |
| **Code** | Identity issued by AWS Cognito (`ndi-cloud-node` repo, not this monorepo). FastAPI proxies a Bearer access token containing the Cognito `sub` claim (`backend/clients/ndi_cloud.py:144`). Each session records `user_id` derived from the cloud's login response (`backend/auth/login.py:88-97`) plus a per-user `user_email_hash` (`backend/auth/session.py:180`). |
| **Verification test** | `backend/tests/unit/test_session_store.py::test_create_and_get_session` exercises the unique-id-per-create contract (each call to `SessionStore.create` mints `secrets.token_hex(16)` — 128 bits). |
| **Gap + remediation** | None at the user-identity layer. The org-level boundary itself is enforced by `ndi-cloud-node` (out of scope here); the FastAPI proxy is intentionally a thin pass-through that never trusts client-provided org_id / user_id values — confirmed via the Phase 6.7 §O6 IDOR audit. |

### (a)(2)(ii) — Emergency access procedure

| Aspect | Detail |
|---|---|
| **Public claim** | Implicit — not called out on `/security`. |
| **Code** | Operator-tier emergency access via the AWS console (Cognito user-pool admin) and the Railway dashboard (FastAPI redeploy / env-var rotation). Both are single-operator today. |
| **Verification test** | N/A — process control, not code. |
| **Gap + remediation** | Single-operator era. Adding a deputy operator with shared Cognito + Railway admin access before any covered-entity onboarding is documented in `apps/web/COMPLIANCE.md` §6 and `apps/web/docs/operations/disaster-recovery.md` (Stream 2.3). |

### (a)(2)(iii) — Automatic logoff

| Aspect | Detail |
|---|---|
| **Public claim** | Implicit — not called out on `/security` but required by §164.312(a)(2)(iii). |
| **Code** | `backend/config.py:51-52` defines `SESSION_IDLE_TTL_SECONDS = 2 * 60 * 60` (2 hours) and `SESSION_ABSOLUTE_TTL_SECONDS = 24 * 60 * 60` (24 hours). Enforcement: `backend/auth/dependencies.py:80-89` checks `idle_seconds > settings.SESSION_IDLE_TTL_SECONDS` on every request and drops the session if exceeded. Belt-and-suspenders Redis TTL in `SessionStore._write` (`backend/auth/session.py:225-249`) sets the key TTL to `min(remaining_absolute, idle_ttl)` so Redis naturally expires the key even if no request hits the explicit check. |
| **Verification test** | `backend/tests/unit/test_dependencies.py::test_*idle_timeout*` + `backend/tests/unit/test_session_idle_ttl.py`. |
| **Gap + remediation** | The 2-hour idle / 24-hour absolute TTLs sit on the more-permissive end of typical HIPAA configurations (15–30 min idle is common for workstations with PHI on-screen). For a covered-entity onboarding, drop both via Railway env overrides — no code change needed; `Settings` already reads them as env. |

### (a)(2)(iv) — Encryption and decryption

| Aspect | Detail |
|---|---|
| **Public claim** | Pillar card: *"Keys rotate automatically"* — metadata in MongoDB with at-rest encryption; raw data in S3 SSE; AWS KMS. |
| **Code** | Multi-layer: (a) cloud access tokens encrypted at the application layer with Fernet (AES-128-CBC + HMAC-SHA256) before Redis write — `backend/auth/session.py:87-89` + `_derive_fernet_key:52-64`. Key supplied via `SESSION_ENCRYPTION_KEY` env var (Railway-managed, 32+ byte minimum enforced in `backend/config.py:30`). (b) Cognito user records encrypted by AWS at rest (Cognito-internal). (c) DocumentDB encrypted at rest with customer-managed KMS key. (d) S3 objects use SSE-S3 (AES-256). |
| **Verification test** | `backend/tests/unit/test_session_store.py::test_get_returns_none_on_invalid_fernet_token` pins the inverse contract — an unsigned/tampered Redis blob fails Fernet decryption and the session-fetch returns `None` (forcing fresh login). |
| **Gap + remediation** | Key-rotation procedure documented in `Waltham-Data-Science/ndi-data-browser-v2/docs/RUNBOOK.md` §"Key rotation"; impact = forced global re-login (every encrypted session becomes undecryptable, falls through to fresh login). Stream 2.3 (disaster-recovery runbook) formalizes the on-call key-rotation checklist. |

---

## §164.312(b) — Audit controls

> *45 CFR §164.312(b):* "Implement hardware, software, and/or procedural
> mechanisms that record and examine activity in information systems that
> contain or use electronic protected health information."

| Aspect | Detail |
|---|---|
| **Public claim** | Pillar card: *"Structured logs, no PHI"* — every API call logged with user, timestamp, action, outcome. **"Request bodies and response payloads are explicitly excluded — so PHI cannot leak into logs by accident."** |
| **Code** | structlog JSON in `backend/observability/logging.py`. Every log line carries `request_id` (set by `backend/middleware/request_id.py`) + `user_id_hash` (set by `backend/auth/dependencies.py:93` on every authenticated request — `user_id_hash_ctx.set(session.user_email_hash[:16])`). Auth-event log lines explicitly logged: `auth.login.success` (`login.py:105`), `auth.login.failed` (`login.py:69`), `auth.logout.cloud_failed` (`login.py:167`), `session.ua_changed` (`dependencies.py:47`), `session.ip_changed` (`dependencies.py:56`), `session.idle_timeout` (`dependencies.py:82`), `session.corrupt_json` / `session.corrupt_payload` (`session.py:201, 210`). |
| **Verification test** | `backend/tests/unit/test_dependencies.py::test_ip_change_logs_warning_allows_request` pins (a) the structured event name, (b) that IP hashes are logged not raw IPs, (c) **after Stream 1**: that `session_id` is truncated to 8 chars and the full id never appears in the captured payload. **TBD (added in Stream 2.1 verification):** a regression test asserting structlog never auto-binds the request body or response payload onto a log event. |
| **Gap + remediation** | (1) **Tamper-evident audit log** — structured logs live in Railway log retention and are mutable by anyone with dashboard access. No append-only audit store (no S3 + Object Lock, no SIEM integration). Acceptable for current research scope, NOT acceptable for covered-entity onboarding. (2) **Per-row data-access trail** — we log endpoint hits but not "user X read dataset Y row Z." Would require per-row instrumentation in the FastAPI document-fetch layer. (3) **Long-term retention** — current ~30 day Railway retention; HIPAA typically wants 6 years on audit logs. Closure: ship logs to S3 (`us-east-1`, Object Lock + KMS, lifecycle to Glacier after 90 days). |

---

## §164.312(c) — Integrity

> *45 CFR §164.312(c)(1):* "Implement policies and procedures to protect electronic
> protected health information from improper alteration or destruction."

### (c)(1) — Integrity controls

| Aspect | Detail |
|---|---|
| **Public claim** | Hero: *"audit logs that record what happened — never what was inside the request."* Encryption band: *"AES-256, rotating keys."* |
| **Code** | (a) Session payloads HMAC-bound via Fernet's built-in MAC (AES-128-CBC + HMAC-SHA256) — tampering with the on-disk Redis blob raises `InvalidToken` and falls through to fresh login (`backend/auth/session.py:204-216`). (b) CSRF tokens HMAC-signed with `CSRF_SIGNING_KEY` (`backend/middleware/csrf.py:30-43`); tampered tokens fail `hmac.compare_digest`. (c) Cloud → ndi-cloud-node integrity enforced via TLS 1.2+. (d) DocumentDB / S3 integrity = AWS-managed. |
| **Verification test** | `backend/tests/unit/test_csrf.py::test_tampered_token_fails` + `backend/tests/unit/test_session_store.py::test_get_returns_none_on_invalid_fernet_token`. |
| **Gap + remediation** | None at the application boundary. Tamper-evidence at the *audit-log* layer is covered under §164.312(b) above. |

### (c)(2) — Mechanism to authenticate ePHI

| Aspect | Detail |
|---|---|
| **Public claim** | Implicit — the same Fernet + HMAC primitives serve as ePHI authentication for the session-layer payloads. |
| **Code** | Same as (c)(1). Fernet has built-in HMAC; CSRF tokens have explicit HMAC. Both fall through to "session invalid → re-login" on integrity failure rather than 500-ing. |
| **Verification test** | Same as above. |
| **Gap + remediation** | No application-level checksums on uploaded binary files. S3's built-in `ETag` is MD5 for non-multipart uploads, which is acceptable for tamper detection at AWS but NOT cryptographically strong. If a covered-entity onboarding needed cryptographic integrity on the binaries themselves, the upload pipeline (`ndi-cloud-node`) would need to compute + persist SHA-256 alongside each object. |

---

## §164.312(d) — Person or entity authentication

> *45 CFR §164.312(d):* "Implement procedures to verify that a person or entity
> seeking access to electronic protected health information is the one claimed."

| Aspect | Detail |
|---|---|
| **Public claim** | Pillar card: *"AWS Cognito identity — MFA, strong password policies, and short-lived JWTs come standard. No username/password databases on our side."* |
| **Code** | (a) Identity verification: AWS Cognito User Pool (managed externally). FastAPI never touches passwords directly — `backend/clients/ndi_cloud.py:256-270` forwards `{email, password}` to ndi-cloud-node which in turn calls Cognito's `InitiateAuth`. Cloud returns a short-lived JWT (default 1h, see `backend/clients/ndi_cloud.py:62`). (b) Session cookies are `HttpOnly` + `Secure` + `SameSite=Lax` (`backend/auth/login.py:113-119`); Domain conditionally `.ndi-cloud.com` only when the request Origin matches (`backend/auth/cookie_attrs.py:36-52`). (c) Device-binding via UA hash (hard reject on mismatch — `backend/auth/dependencies.py:46-54`) and IP hash (warn-only for mobile roaming — `backend/auth/dependencies.py:55-61`). (d) CSRF double-submit on every mutation (`backend/middleware/csrf.py`). (e) Origin enforcement on every mutation (`backend/middleware/origin_enforcement.py`). |
| **Verification test** | `backend/tests/unit/test_dependencies.py::test_ua_mismatch_revokes_session_and_returns_auth_required` + `::test_ip_change_logs_warning_allows_request` + `backend/tests/unit/test_csrf.py::test_*` + `backend/tests/unit/test_origin_enforcement.py::test_*`. |
| **Gap + remediation** | **MFA is offered by Cognito but is not enforced by application-side checks today.** The MFA policy lives in the Cognito User Pool config (managed in the AWS console, not in this repo). For covered-entity onboarding: (1) verify Cognito Pool's MFA setting is set to `REQUIRED` (today: assumed `OPTIONAL`); (2) add an integration test that asserts a login attempt without MFA on a MFA-enrolled account is rejected. Tracking under Stream 3 (auth-gated `/ask`) since the same pool would protect both surfaces. |

---

## §164.312(e) — Transmission security

> *45 CFR §164.312(e)(1):* "Implement technical security measures to guard
> against unauthorized access to electronic protected health information that
> is being transmitted over an electronic communications network."

### (e)(2)(i) — Integrity controls in transit

| Aspect | Detail |
|---|---|
| **Public claim** | Encryption band: *"All external traffic on TLS 1.2 or higher with HSTS. Internal service-to-service traffic runs over private VPC endpoints, not the public internet."* |
| **Code** | (a) **TLS 1.2+:** Vercel manages TLS termination on `ndi-cloud.com` (Let's Encrypt + auto-rotation, TLS 1.2/1.3); Railway manages TLS on `*.up.railway.app`. (b) **HSTS:** `backend/middleware/security_headers.py:74` emits `Strict-Transport-Security: max-age=31536000; includeSubDomains` on every response (1-year TTL). (c) **CSP `connect-src` whitelist** (`backend/middleware/security_headers.py:35-43`) prevents the SPA from POST-ing PHI to non-allowed origins. (d) **Origin-enforcement middleware** rejects mutating requests with a missing or non-allowlisted Origin (`backend/middleware/origin_enforcement.py`) — defense-in-depth for non-browser clients that ignore CORS. (e) **Internal hops:** FastAPI → ndi-cloud-node uses httpx with HTTP/2 over TLS to the AWS API Gateway URL (`backend/clients/ndi_cloud.py:108-114`); ndi-cloud-node → DocumentDB/Cognito/S3 stays within the `us-east-1` VPC. |
| **Verification test** | `backend/tests/unit/test_security_headers.py::test_baseline_security_headers_unchanged` pins HSTS + the rest of the fixed header bundle. `backend/tests/unit/test_origin_enforcement.py::test_post_with_disallowed_referer_origin_returns_403_forbidden` pins the Referer-fallback rejection path. **TBD:** an integration smoke that fails the build if the deployed certificate falls below TLS 1.2 (could automate via `openssl s_client -tls1_2 ndi-cloud.com` returning non-zero handshake). |
| **Gap + remediation** | (1) **TLS-version pinning** — currently relies on the platform defaults (Vercel + Railway both reject TLS 1.0/1.1 as of 2023+). Add a deploy-time check that asserts the live cert advertises TLS 1.2 minimum so a platform downgrade is caught. (2) The CSP is currently in `Content-Security-Policy` (enforced) mode — see `apps/web/docs/csp-audit-2026-05-14.md` for the dual-CSP story; no gap. |

### (e)(2)(ii) — Encryption in transit

| Aspect | Detail |
|---|---|
| **Public claim** | Same as above. |
| **Code** | Same as above — TLS 1.2+ at every external hop, no plaintext fallback. |
| **Verification test** | Same as above. |
| **Gap + remediation** | Same as above. |

---

## Gap remediation summary (consolidated)

The gaps surfaced above, ranked by what would block a covered-entity
onboarding. Numbered items map to follow-up streams in the master execution
plan (`apps/web/docs/specs/2026-05-15-master-execution-plan.md`).

| # | Gap | Severity (research scope → covered-entity scope) | Where it lives |
|---|---|---|---|
| 1 | MFA enforcement at application-side untested | LOW → BLOCKER | Stream 3 (auth-gated `/ask` will surface a per-user-MFA check we can pin) |
| 2 | Tamper-evident, externally-shipped audit log | LOW → BLOCKER | Stream 2.5 ADR-005 (Vercel KV) + Stream 3.6 (audit-log-policy.md) define the boundary; actual shipping is Stream 2.3 (DR runbook) follow-up |
| 3 | Long-term log retention (Railway 30 days → 6 years) | LOW → BLOCKER | Same — closure ships logs to S3 with Object Lock |
| 4 | Per-row data-access audit trail | OUT OF SCOPE → REQUIRED | Stream 5.8 (`/tables/{class}` pagination) is the first hook point; instrument there |
| 5 | TLS-version pinning at deploy time | LOW → MEDIUM | Add a CI check that fails if `openssl s_client -tls1_2 ndi-cloud.com` returns nothing |
| 6 | Cryptographic integrity (SHA-256) on uploaded binaries | OUT OF SCOPE → REQUIRED | `ndi-cloud-node`-side change; not in this monorepo |
| 7 | Single-operator privileged access | LOW → MEDIUM | Process control: add a deputy operator before any covered-entity onboarding |
| 8 | Idle-timeout default permissive (2h vs typical 15–30 min) | LOW → REQUIRED | Env override — no code change. Document the recommended HIPAA-mode value (`SESSION_IDLE_TTL_SECONDS=900` for 15 min) in the runbook. |

---

## Where this maps in the master plan

| Stream | Item | Closes which gap? |
|---|---|---|
| 1 (shipped) | T1.5 session-id log truncation | Eliminated session-id leak in the §164.312(b) log surface |
| 2.1 (this doc) | HIPAA Technical Safeguards audit | Establishes the baseline + gap list |
| 2.3 | Disaster-recovery runbook | Documents key-rotation, log-retention escalation, deputy-operator path |
| 2.6 | `compliance-posture.md` | Externalizes this baseline for IRB / CISO |
| 3 | `/ask` → My Workspace auth-gated tab | Surfaces MFA-required check (gap #1) + per-user audit log (gap #4 starter) |
| 5.8 | Server-side pagination for `/tables/{class}` | Instrument per-row access logging at the right boundary |

---

## Update history

| Date | Author | Change |
|---|---|---|
| 2026-05-15 | Stream 2.1 audit | Initial control-by-control mapping. |
