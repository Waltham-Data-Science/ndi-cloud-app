# NDI Cloud — compliance posture

**Audience:** institutional review boards (IRB), CISO / InfoSec teams, prospective
enterprise partners. This document is externally distributable under NDA.

**Last reviewed:** 2026-05-15

**Owner:** Audri Bhowmick — `audri@walthamdatascience.com`

---

## TL;DR

NDI Cloud is **HIPAA-aware by design, NIH-DMSP compliant for every published
dataset, and SOC 2 Type II in-progress**. We are **not** a HIPAA-covered
entity today: the platform handles de-identified neuroscience research data
under research codes (`mouse-A12-2024`, not patient identifiers). The
technical architecture is built against §164.312 specifically so that an
institutional partnership requiring covered-entity status can be onboarded
with documented gap-remediation work — not a re-architect.

Full control-by-control mapping of how each §164.312 requirement is realized
in code lives in **`apps/web/docs/operations/hipaa-technical-safeguards.md`**.
This document summarizes the result for non-technical reviewers and lists the
artifacts an IRB or CISO can request directly.

---

## 1. Regulatory stance at a glance

| Framework | Status | Evidence |
|---|---|---|
| HIPAA Technical Safeguards (45 CFR §164.312) | Architected against | `hipaa-technical-safeguards.md` (5 controls × code references × verification tests) |
| HIPAA Covered Entity status | Not claimed; not in scope | No clinical workflow, no PHI on platform today |
| NIH Data Management & Sharing Plan (2023 final rule) | Compliant per published dataset | Every dataset has DOI, FAIR metadata, defined license, stable landing page (catalog at `/datasets`) |
| SOC 2 Type II | Observation window open | Attestation available on request once issued |
| GDPR / UK GDPR | Not in scope today | All users + data resident in US (`us-east-1`); no EU-resident data subjects on platform |
| FedRAMP / ITAR / CMMC | Not in scope | Research-data platform; no government-sensitive contracts |

---

## 2. Data residency

| Data class | Storage | Region | BAA in place? |
|---|---|---|---|
| User identities, passwords, MFA secrets | AWS Cognito User Pool | `us-east-1` | AWS BAA available, not yet executed |
| Dataset metadata, summaries, search indices | AWS DocumentDB | `us-east-1` | AWS BAA available, not yet executed |
| Binary recordings (NWB, OpenMINDS, attachments) | AWS S3 with SSE-S3 (AES-256) | `us-east-1` | AWS BAA available, not yet executed |
| Session cookies (Fernet-encrypted) | Redis on Railway | US (Railway region) | Railway does NOT offer BAA at any tier today |
| Rate-limit + summary cache | Redis on Railway | US | Same |
| Edge static assets | Vercel | Global CDN | Vercel BAA available on Enterprise plan only; current plan is Pro |
| Telemetry / analytics | Vercel Analytics + Speed Insights | Global | Same — no PHI traverses this surface |

All canonical user-impactful data lives in AWS `us-east-1`. Vercel + Railway
handle only ephemeral / derived state.

A covered-entity onboarding would require executing the AWS BAA and migrating
the Railway-hosted FastAPI proxy to a BAA-capable platform (Fly.io HIPAA tier,
AWS Lambda, GCP Cloud Run with BAA, etc.). ADR-004
(`Waltham-Data-Science/ndi-data-browser-v2/docs/adr/004-drop-sqlite-dataset-storage.md`)
was written specifically to keep that migration option open — the FastAPI is
stateless, so the relocation surface is the proxy code itself plus the Redis
swap.

---

## 3. The five §164.312 Technical Safeguards — summary

(Full mapping in `hipaa-technical-safeguards.md`.)

| Control | Architected against | Notable gap if covered-entity onboarding |
|---|---|---|
| **(a) Access control** — unique ID, automatic logoff, encryption | ✅ Cognito unique ID; 2h idle / 24h absolute session TTLs; Fernet-encrypted access tokens in Redis; Cognito + DocumentDB + S3 all encrypted at rest | Idle TTL configurable to 15–30 min via env override; deputy operator needed for emergency access |
| **(b) Audit controls** — record + examine activity | ✅ structlog JSON logs with `request_id` + `user_id_hash` on every line; explicit auth-event log lines; "no PHI in logs" promise enforced by never auto-logging request bodies | No tamper-evident externally-shipped log store; 30-day retention (HIPAA wants 6 years on audit trail) |
| **(c) Integrity** — guard against improper alteration | ✅ Fernet HMAC on session payloads; CSRF tokens HMAC-signed; TLS 1.2+ end-to-end; AWS-managed integrity on persistent stores | No SHA-256 cryptographic checksum on uploaded binaries (S3 ETag is MD5 — acceptable for tamper detection, not cryptographic) |
| **(d) Person/entity authentication** — verify identity before access | ✅ Cognito identity; HttpOnly + Secure + SameSite=Lax cookies; double-submit CSRF; Origin enforcement; UA-mismatch hard reject + IP-change warn-only (mobile-roaming-tolerant) | MFA is *available* on Cognito Pool but not *enforced* by application-side checks; needs Cognito Pool MFA setting flipped to REQUIRED + an integration test pinning the reject |
| **(e) Transmission security** — encrypted in transit + integrity | ✅ TLS 1.2+ at every external hop; HSTS `max-age=31536000; includeSubDomains` on every response; CSP `connect-src` whitelist; Origin-enforcement middleware blocks non-allowlisted POSTs | No deploy-time TLS-version pin (relies on Vercel + Railway platform defaults) — would add a smoke check before covered-entity onboarding |

---

## 4. NIH Data Management & Sharing Plan compliance

Every dataset published on NDI Commons satisfies the NIH 2023 DMSP final rule
out of the box. Per published dataset:

| Requirement | How NDI Cloud satisfies it |
|---|---|
| DOI + persistent identifier | Each dataset assigned a Crossref DOI on publication (e.g. `10.63884/ndic.2026.0oxgzbjb`) |
| FAIR metadata | OpenMINDS Schema + NDI-native classes covering subject, element, treatment, ontology |
| Defined license | Every dataset record carries a `license` field (CC-BY-4.0 by default; can override per dataset) |
| Stable landing page | `https://ndi-cloud.com/datasets/{dataset-id}` is a permanent URL with `generateMetadata` rendering proper `<title>` + JSON-LD `Dataset` schema for citation harvesters |
| FAIR-aligned search | `/datasets` catalog with faceted search across species, brain region, strain, technique |

The catalog index is rebuilt nightly so DMSP-required updates surface
without operational intervention.

---

## 5. SOC 2 Type II — in progress

Observation window opened **2026-Q2**. Public attestation will be available
on request to prospective enterprise customers under NDA once issued.

Pre-audit posture:

| Trust Service Criteria | Pre-audit status |
|---|---|
| CC6 Logical Access | Cognito-backed identity; tenant-scoped reads enforced upstream in `ndi-cloud-node`; CSRF + Origin middleware on every mutation |
| CC7 System Operations | Structured logging; metrics surfaced via Prometheus endpoint; OpenTelemetry-ready (env-gated, see `apps/web/docs/observability/`) |
| CC8 Change Management | All changes ship via PR + CI gates (lint, typecheck, unit, build, e2e, security audit); author-rule enforced on every commit |
| Availability | Vercel + Railway both ≥ 99.9% SLOs; circuit-breaker on FastAPI → ndi-cloud-node calls |
| Confidentiality | Encryption at rest + in transit at every layer (see §3) |
| Privacy | No PHI on platform today; "no PHI in logs" enforced by code review + the audit-log policy documented at `apps/web/docs/operations/audit-log-policy.md` (Stream 3.6) |

---

## 6. Business Associate Agreements (BAAs)

| Vendor | BAA available? | Status |
|---|---|---|
| AWS | Yes (for Cognito, DocumentDB, S3, Lambda) | Available; not executed (not needed at current research scope) |
| Vercel | Yes, Enterprise plan only | Current plan is Pro; would upgrade for covered-entity onboarding |
| Railway | Not offered at any tier as of 2026-Q2 | Would force FastAPI proxy migration to BAA-capable host |
| Anthropic | Yes, Enterprise plan only | Not in scope today (Anthropic API only used for the experimental `/ask` chat; chat is currently anonymous-public and processes no PHI) |
| Voyage AI | Inquire on enterprise contract | Same — embedding service used by `/ask` only |

---

## 7. Audit-log policy

We log enough to investigate incidents but **never** log content that could be PHI.
The explicit rules:

| Logged | Never logged |
|---|---|
| Request method + path + status code | Request body |
| Authenticated `user_id_hash` (SHA-256, first 16 chars) | Email address |
| `request_id` (correlation across services) | Plaintext IP address (IP hash only, for device-binding) |
| Auth-event names (`auth.login.success`, `session.idle_timeout`, etc.) | Session ID (truncated to 8 chars only) |
| Tool name + duration for AI-orchestration calls | Tool input arguments containing dataset content |
| Cloud-call endpoint label + outcome | Cloud-call response body |

Stream 3.6 (`apps/web/docs/operations/audit-log-policy.md`) will formalize this
into a contract with regression tests asserting nothing in the prohibited
column ever appears in a captured structlog event.

---

## 8. Disaster recovery + business continuity

(Full runbook at `apps/web/docs/operations/disaster-recovery.md` — Stream 2.3
deliverable.)

| Scenario | RTO | RPO | How |
|---|---|---|---|
| Vercel deploy regression | < 5 min | 0 (instant rollback) | Vercel "Promote previous" |
| Railway redeploy regression | < 10 min | 0 | Railway "Rollback to previous" |
| FastAPI Postgres data loss | < 1 hour | < 24 hours | Railway-managed Postgres backups |
| `SESSION_ENCRYPTION_KEY` loss | < 1 hour | 0 (forced global re-login) | Documented in disaster-recovery runbook |
| AWS DocumentDB regional outage | Dependent on AWS recovery | < 1 hour | Out of scope (AWS-managed); failover not configured |
| S3 binary loss | Cannot recover without backup | Cannot recover | `ndi-cloud-node` owns; S3 versioning recommended but not required for research scope |

---

## 9. What an IRB / CISO can request directly

| Artifact | Reference |
|---|---|
| Control-by-control HIPAA mapping | `apps/web/docs/operations/hipaa-technical-safeguards.md` |
| Vendor inventory + dependency map | `apps/web/docs/operations/vendor-dependencies.md` (Stream 2.2 deliverable) |
| Disaster recovery runbook | `apps/web/docs/operations/disaster-recovery.md` (Stream 2.3 deliverable) |
| Audit-log policy | `apps/web/docs/operations/audit-log-policy.md` (Stream 3.6 deliverable) |
| Architecture Decision Records | `apps/web/docs/architecture/decisions/` (Stream 2.5 — 7 ADRs covering cookie auth, ToolContext, Vercel/Railway split, pgvector, etc.) |
| Architecture audit (2026-05-15) | `apps/web/docs/architecture/2026-05-15-architecture-audit.md` |
| Security incident postmortems | `apps/web/docs/security/` (currently one: `2026-05-14-leaked-credentials-resolved.md`) |
| SOC 2 Type II attestation | Available once issued (observation window opened 2026-Q2) |
| Penetration test summary | Not commissioned at current scale; can be on request |

---

## 10. Update history

| Date | Author | Change |
|---|---|---|
| 2026-04-26 | Audri | Internal `apps/web/COMPLIANCE.md` first draft (Phase 6.7 audit follow-up A10). |
| 2026-05-15 | Stream 2.6 | Externalized version (this doc). Adds the §164.312 cross-reference, NIH DMSP table, SOC 2 status, BAA inventory. The earlier internal doc is preserved as `apps/web/COMPLIANCE.md` for the data-residency table; this doc supersedes it for external distribution. |
