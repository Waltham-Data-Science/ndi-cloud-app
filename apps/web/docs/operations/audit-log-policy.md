# Audit-log policy

**Audience:** SREs, on-call operators, IRB / CISO reviewers verifying
the public no-PHI-in-logs promise on `/security`.

**Last reviewed:** 2026-05-15
**Owner:** Audri Bhowmick — `audri@walthamdatascience.com`

This doc codifies what NDI Cloud's structured logs *contain* and what
they MUST NEVER contain. The public claim on
`apps/web/app/(marketing)/security/page.tsx`:

> Every API call is logged with user, timestamp, action, and outcome.
> Request bodies and response payloads are explicitly excluded — so
> PHI cannot leak into logs by accident.

The codified rules below + the regression test at
`backend/tests/unit/test_no_phi_in_logs.py` enforce that promise
mechanically — so a future log-line edit can't undermine it without
either the test failing or an audited `# noqa: phi-in-logs` exception
being added.

---

## 1. Log surfaces in NDI Cloud

| Surface | Where logs flow | Retention |
|---|---|---|
| **FastAPI structured logs** | stdout → Railway log shipper → 30-day Railway retention | 30 days (Railway plan default) |
| **Vercel function logs** | stdout → Vercel runtime logs | 30 days (Vercel Pro plan default) |
| **Vercel edge access logs** | Vercel-managed | 30 days |
| **AWS CloudTrail** (Cognito) | AWS CloudTrail in `ndi-cloud-node` AWS account | 90 days default, configurable |
| **Anthropic dashboard** | Vendor-managed usage logs | Vendor-managed retention |
| **Voyage dashboard** | Vendor-managed usage logs | Vendor-managed retention |

Stream 3.6 (this doc) covers the **FastAPI** and **Vercel function**
log surfaces — the two surfaces we own and emit code into. Vendor
logs are covered by their respective BAAs / DPAs (see
`apps/web/docs/operations/vendor-dependencies.md`).

---

## 2. What MAY appear in logs

These are the only kinds of fields permitted in any backend
`log.X(...)` or Vercel `console.log(JSON.stringify({...}))` call.
Reviewable lists, not free-form prose.

| Field shape | Examples | Why safe |
|---|---|---|
| Opaque identifiers | `user_id`, `organization_id`, `conversation_id`, `request_id`, `dataset_id`, `doc_id`, `session_id[:8]` (truncated) | No PHI; correlation only. Session id is truncated to 8 chars per Stream 1 T1.5. |
| SHA-256 hashes | `user_id_hash`, `email_hash[:16]`, `ip_addr_hash`, `user_agent_hash` | One-way; can be correlated but not reversed. |
| Counts | `tokens_in`, `tokens_out`, `tool_calls_count`, `row_count`, `total_documents`, `bytes_read` | Numbers only. |
| Enums | `outcome`, `error_kind`, `error_code`, `severity`, `tool_name`, `model_id`, `http_status` | Bounded vocabularies known at build time. |
| Timings | `duration_ms`, `latency_ms`, `started_at`, `expires_at` | Numbers / timestamps. |
| Configuration flags | `feature_enabled`, `is_admin`, `streamed` | Booleans / enums about the system, not the user. |
| Audited safe strings | `tool_name`, `endpoint_label`, `class_name` (the NDI class name being queried) | Schema-driven, not user-supplied. |

---

## 3. What MUST NEVER appear in logs

| Field shape | Reason |
|---|---|
| Plain-text passwords | Auth secret |
| Bearer / refresh / Cognito tokens | Auth secret (session token is the secret per ADR-004) |
| CSRF cookies | Auth secret |
| Full session IDs (any session-id string of length > 8) | Anyone with log access could replay the session |
| Raw email addresses | PII |
| Raw IP addresses | PII |
| Raw user-agent strings | PII (fingerprinting surface) |
| Request bodies | May contain PHI / PII |
| Response payloads | May contain PHI |
| Prompt text (chat user messages) | May contain PHI / sensitive content |
| Tool input arguments containing dataset content | May contain PHI |
| Tool output bodies (free-form text) | May contain PHI |
| Patient identifiers, MRN, SSN, DOB, phone | PHI / PII |
| Free-form notebook entries / annotations | May contain PHI |

The regression test (`backend/tests/unit/test_no_phi_in_logs.py`)
AST-walks every `log.X(...)` call in `backend/` and fails the build
if a keyword arg name is on the denylist (`password`, `body`,
`payload`, `email`, `ip`, `user_agent`, `access_token`, etc.).

For Vercel function logs the same discipline applies via the
`logEvent` helper at `apps/web/lib/ndi/tools/shared.ts:117`. The
helper's docstring explicitly forbids passing free-form text or
input payloads.

---

## 4. Canonical event names

Use these event names. Anything new should follow the same dotted
convention (`<area>.<verb>` or `<area>.<noun>.<state>`).

### Auth (FastAPI)
- `auth.login.success`
- `auth.login.failed`
- `auth.logout.cloud_failed`
- `auth.csrf.invalid`
- `auth.rate_limited`

### Session lifecycle (FastAPI)
- `session.ip_changed`
- `session.ua_changed`
- `session.idle_timeout`
- `session.corrupt_json`
- `session.corrupt_payload`

### Cloud calls (FastAPI)
- `cloud.timeout`
- `cloud.network_error`
- `cloud.logout_failed`
- `cloud.download.off_allowlist_host`

### Dataset summary (FastAPI)
- `dataset_summary.build`
- `dataset_summary.species_empty_with_subjects` (Stream 5.6 diagnostic)
- `summary.sessions_zero_with_elements` (Stream 5.5 diagnostic)

### Treatment timeline (FastAPI)
- `treatment_timeline.primary_resolved`
- `treatment_timeline.primary_failed`
- `treatment_timeline.fallback_failed`

### Dataset health (cloud-app)
- `dataset_health.cron.no_datasets`
- `dataset_health.cron.complete`
- `dataset_health.admin.read`
- `dataset_health.admin.read_error`

### Chat (cloud-app `/api/ask`)
- `ask.feature_disabled`
- `ask.feature_not_enabled_for_org` (Stream 3.4)
- `ask.rate_limited`
- `ask.invalid_body`
- `ask.request.start`
- `ask.stream.error`
- `chat.tool.<tool_name>.invoked`

### Cost tracking (Stream 3.2 — when shipped)
- `usage.event.recorded`
- `usage.event.write_failed`
- `usage.tripwire.daily_spend_exceeded`

Add new event names here when introducing a new log line. The list
also serves as a search-time index for SREs.

---

## 5. PHI-redaction in shared helpers

Two helpers in `backend/auth/session.py` do the hashing:

- `_hash_ip(ip)` — SHA-256 → first 32 hex chars
- `_hash_user_agent(ua)` — SHA-256 → first 32 hex chars

Loggers MUST use these (or the bound `ip_addr_hash` / `user_agent_hash`
fields on `SessionData`) instead of the raw values. The
`session.ip_changed` warning at `backend/auth/dependencies.py:56` is
the canonical example.

For session IDs use the `[:8]` slice — first 8 hex chars give enough
correlation across log lines for a single session without enabling
replay (the full session ID is 32 hex chars = 128 bits of entropy).

---

## 6. Audit-log discipline checklist

When adding a new log line:

- [ ] Event name follows the dotted convention + is appended to §4.
- [ ] No raw email / IP / UA / password / token / body.
- [ ] Counts and enums only; no free-form text from user input.
- [ ] If the line carries a session id, use the `[:8]` slice.
- [ ] Run `pytest backend/tests/unit/test_no_phi_in_logs.py` locally.
- [ ] If the new field is on the denylist but you've audited it safe,
      add `# noqa: phi-in-logs` AND an entry in
      `ALLOWED_LINE_MARKERS` in the regression test, with a one-line
      audit note in the test diff.

---

## 7. Future hardening (out of scope today)

For HIPAA-covered-entity onboarding (see
`apps/web/docs/operations/hipaa-technical-safeguards.md` §164.312(b)
gaps), three additional items would be required beyond today's
discipline:

1. **Tamper-evident, externally-shipped log store** — ship every log
   line to S3 with Object Lock + KMS, retained ≥6 years per
   HIPAA. Vercel + Railway logs alone are mutable by anyone with
   dashboard access.
2. **Long-term retention escalation** — 30 days → 6 years on the
   audit-event subset (auth events, dataset reads, admin actions).
3. **Per-row dataset-access audit trail** — log "user X read dataset
   Y row Z" beyond today's per-endpoint hit logs.

These are not blocking for the current research-data scope.
Documented in `apps/web/docs/operations/hipaa-technical-safeguards.md`
Gap #2 and Stream 6.8 cron-side write of `chat_usage_events`
(Stream 3.2 spec).

---

## 8. Update history

| Date | Change |
|---|---|
| 2026-05-15 | Initial doc — Stream 3.6 deliverable. |
