# Master execution plan — post-2026-05-15

---

## 🚨 ORIENTATION FOR THE POST-COMPACT BOT — READ FIRST

**Stop. Before doing anything, internalize this section.**

### The two repos (linked but separate)

You are working across **two sibling repos** that live under `~/Documents/ndi-projects/`:

| Repo | Path | Role | Hosted on |
|---|---|---|---|
| **`ndi-cloud-app`** | `~/Documents/ndi-projects/ndi-cloud-app` | Next.js 16 monorepo — frontend + Next.js API routes + marketing pages | Vercel |
| **`ndi-data-browser-v2`** | `~/Documents/ndi-projects/ndi-data-browser-v2` | FastAPI backend — NDI-python integration, Postgres + Redis | Railway |

Your shell's working directory is `ndi-cloud-app`. When you need to touch the backend, `cd /Users/audribhowmick/Documents/ndi-projects/ndi-data-browser-v2/...` (absolute paths are safer than `cd` because Bash tool resets cwd between calls).

### The branches we work on

| Repo | Branch | State |
|---|---|---|
| `ndi-cloud-app` | **`feat/experimental-ask-chat`** | DRAFT — PR #160 — DO NOT MERGE without explicit user approval |
| `ndi-data-browser-v2` | **`feat/ndi-python-phase-a`** | DRAFT — DO NOT MERGE |

`main` on both repos = **production**. **DO NOT push to `main` on either repo.** All work goes on the draft branches.

### THE LIVE DEPLOYMENT IS SACRED — DO NOT TOUCH IT

| | Production (untouched) | Experimental / Preview (where we work) |
|---|---|---|
| **Frontend URL** | `https://ndi-cloud.com` | `https://ndi-cloud-app-web-git-feat-experiment-c5da7d-ndi-cloud-a83eb4e7.vercel.app` |
| **Backend URL** | `https://ndb-v2-production.up.railway.app` | `https://ndb-v2-experimental.up.railway.app` |
| **Railway env** | `production` (env id `e0c00fb7-...`) | `experimental` (env id `90101f6e-...`) |
| **Vercel env scope** | `Production` | `Preview` |
| **Branch wired to** | `main` of each repo | the draft branches above |

**Rules of engagement:**

1. **NEVER push to `main`** on either repo.
2. **NEVER touch Vercel `Production`-scope env vars.** Touch only the `Preview` scope when needed.
3. **NEVER touch Railway `production` env.** Touch only the `experimental` env. The Railway agent lets you specify env id — always use the experimental one (`90101f6e-042b-44d6-8c8d-ec18d43b341b` for ndb-v2).
4. **NEVER force-push to `main`.** Force-pushing to the draft branch is OK if explicitly authorized (we did one today for the BFG scrub).
5. **NEVER skip pre-commit / pre-push hooks** (`--no-verify`, `--no-gpg-sign` are prohibited per CLAUDE.md).
6. **Author rule (non-negotiable):** every commit must be `audriB <audri@walthamdatascience.com>`. Use `--author="audriB <audri@walthamdatascience.com>"` on every git commit.
7. **Co-Authored-By trailer required** on every Claude-driven commit: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

### How the cross-repo flow works

- Frontend (`ndi-cloud-app`) commit → push to `feat/experimental-ask-chat` → Vercel auto-deploys to the **preview URL** above
- Backend (`ndi-data-browser-v2`) commit → push to `feat/ndi-python-phase-a` → Railway auto-deploys to the **experimental env**
- `apps/web/next.config.ts` has a **branch-aware rewrite**: when `VERCEL_GIT_COMMIT_REF === 'feat/experimental-ask-chat'`, `/api/*` rewrites to `https://ndb-v2-experimental.up.railway.app`. This is what makes the preview frontend talk to the experimental backend automatically.
- **Production** still uses the normal rewrite (`UPSTREAM_API_URL` env var pointing at production Railway). **Untouched.**

### Test credentials (use ONLY via Playwright form-fill; never store/echo)

For workspace + chat smoke testing:
- email: `audri+test@walthamdatascience.com`
- password: `remhuz-ruwfy4-jiGcen`

This is a deliberately-scoped test account. It can access the 8 public datasets only — no private datasets attached. Use Playwright `browser_fill_form` to type these into the live preview's login form; never write them to disk, never echo them in chat output.

### What's currently DEPLOYED to production vs to preview

| Feature | In production (main → ndi-cloud.com) | In preview (this branch) |
|---|---|---|
| Marketing pages, catalog, dataset detail | ✅ live | ✅ live (same code) |
| Document Explorer, Tabular Query, summary tables | ✅ live | ✅ live |
| Workspace at `/my/workspace/[id]` | ❌ not in main | ✅ this branch only |
| `/ask` chat | ❌ not in main | ✅ this branch only — but stays anonymous-public until Stream 3 |
| Auth-gated `/my/ask` | ❌ doesn't exist | will be added in Stream 3 |
| All today's bug fixes (CSRF cookie, EPOCHS chip, electrode copy, etc.) | ❌ not in main | ✅ this branch only |

The plan below WILL touch:
- The experimental backend's Postgres (e.g. new `chat_usage_events` table) — that's the experimental env, fine
- Vercel `Preview`-scope env vars (e.g. new Vercel KV connection) — that's preview, fine
- The branch's source code — that's where we work

The plan will NOT touch:
- Production cookies, sessions, Cognito users
- Production Postgres
- Production Vercel env vars
- The `main` branch on either repo

### Verifying before any action

When in doubt, run these diagnostics:

```bash
# Confirm you're on the right branch
git branch --show-current
# Should be 'feat/experimental-ask-chat' (cloud-app)
# or 'feat/ndi-python-phase-a' (ndb-v2)

# Confirm Railway env you're targeting
# (in railway-agent tool calls, environmentId should be:)
# experimental ndb-v2: 90101f6e-042b-44d6-8c8d-ec18d43b341b
# DON'T use production: e0c00fb7-ac98-431f-acdb-f4988032160f

# Confirm the preview URL you're testing
echo $PLAYWRIGHT_PREVIEW_URL
# https://ndi-cloud-app-web-git-feat-experiment-c5da7d-ndi-cloud-a83eb4e7.vercel.app
```

If you ever find yourself about to operate on `main` or on production Vercel/Railway, **STOP** and ask the user for explicit confirmation.

---

## What this plan covers

This is the consolidated plan covering EVERYTHING agreed-on across both audits, the strategic-gap work, and the major architectural shifts confirmed in chat:

1. All tactical fixes from the bug audit (yesterday's micro lens)
2. All architectural rectifications from the macro audit
3. Strategic gaps that weren't in either audit (vendor deps, cost tracking, DR, compliance, ADRs, code polish)
4. **`/ask` migration to authenticated-only inside My Workspace** (NEW major scope)
5. **HIPAA Technical Safeguards audit + remediation** (NEW major scope — we've publicly committed to 45 CFR 164.312)
6. **Per-user cost tracking + access control** (NEW — enables the "clients only" gating)

**Post-compact agent: read THIS doc first.** Everything else is reference material below.

**Reading order:**
1. **THIS doc** (the plan)
2. `apps/web/docs/architecture/2026-05-15-architecture-audit.md` (macro lens)
3. `apps/web/docs/specs/2026-05-15-comprehensive-audit.md` (micro lens)
4. `apps/web/app/(marketing)/security/page.tsx` (HIPAA commitments we must maintain)
5. `apps/web/docs/specs/2026-05-14-tutorial-ground-truth.md` (parity ref)

---

## TL;DR

Scope estimate: **15-20 days of focused work** across ~7-8 sessions. The work falls into 6 streams that can mostly be parallelized after the foundation work:

| Stream | Effort | Critical path? |
|---|---|---|
| Tier 1 quick wins | ~90 min | YES — foundation for everything |
| HIPAA + strategic docs | ~2-3 days | YES — informs `/ask` design |
| `/ask` → auth-gated + per-user cost | ~3-4 days | YES — biggest new scope |
| Tier 2 architecture rectifications | ~3 days | NO — parallelizable |
| Tier 3 data correctness | ~3-4 days | NO — parallelizable |
| Tier 4 + 5 (tests + Dataset Health) | ~2 days | NO |

---

## WHAT'S CHANGED FROM THE PRIOR PLAN

### Now actively scoped (was deferred)
- **D2** — AI SDK v5 → v6 major upgrade (scheduled in Stream 6)
- **D3** — Rate-limit → Vercel KV (folded into Stream 3 per-user rate limit work; eliminates duplicate effort)

### Now actively scoped (was strategic gap)
- **Vendor dependencies doc** — `docs/operations/vendor-dependencies.md`
- **Architecture decision records** — `docs/architecture/decisions/` (5-7 ADRs)
- **Cost trajectory telemetry + dashboard** — backend logging + admin UI
- **Disaster recovery runbook** — `docs/operations/disaster-recovery.md`
- **General code polish / comment update** — opportunistic, paired with each session's commits

### Now actively scoped (was completely missing)
- **HIPAA Technical Safeguards audit + remediation** — verify code matches the 45 CFR 164.312 commitments on the security page; close any gaps
- **`/ask` → My Workspace tab** — move from anonymous marketing route to authenticated workspace tab
- **Per-user cost tracking** — Postgres table + middleware + admin UI
- **Per-org access control for chat** — `enable_ask` flag on org, default off, enabled for paying customers

### Still won't fix / will reconsider later
- D6 (Plotly → uPlot) — wait for bundle pressure
- D9 (Conversation persistence) — feature, defer until post-launch
- D11 (Tutorial pipeline) — premature, defer until 4+ tutorials exist
- W2 (mypy external-types) — yak-shave, optional `mypy.ini` ignore
- W3 (NDI-python coupling) — this IS the moat
- W4 (no ORM) — revisit only if Postgres migration becomes a need
- W5 (TanStack Query) — correct choice, stay

---

## STREAM 1 — Tier 1 quick wins (~90 min, do first)

Verified-real fixes from yesterday's audit. Bundle as one PR.

| # | Item | File | Effort |
|---|---|---|---|
| T1.1 | Register `psth` in chat tools | `apps/web/lib/ai/chat-tools.ts` | 5 min |
| T1.2 | Replace hardcoded numerics in system prompt | `apps/web/lib/ai/system-prompt.ts:84` | 5 min |
| T1.3 | Fix "Bhar tree shrew" factual error | `apps/web/lib/ai/system-prompt.ts:259` | 2 min |
| T1.4 | Clarify Dabrowska disambiguation prose | `apps/web/lib/ai/system-prompt.ts:62-68` | 5 min |
| T1.5 | Truncate session IDs in logs | ndb-v2 `backend/auth/dependencies.py:49,58` + `backend/auth/login.py:170` | 10 min |
| T1.6 | Ruff RUF003 fail | ndb-v2 `backend/services/summary_table_service.py:64` | 2 min |
| T1.7 | Add missing env vars to `.env.example` | `apps/web/.env.example` | 10 min |
| T1.8 | Fix `lib/api/ontology.ts` cross-layer import | `apps/web/lib/api/ontology.ts:11` | 15 min |
| T1.9 | Set `core.hooksPath .githooks` | git config (USER does) | 1 min |
| T1.10 | Anthropic spending cap on dashboard | Anthropic UI (USER does) | 5 min |
| T1.11 | Run `pip-audit` + bump 7 CVE'd packages | ndb-v2 `requirements.txt` | 30 min |

**Verification:** After T1.1, fire one `/ask` probe like "Show me a PSTH for [unitDocId] aligned to [stimulusDocId]" and confirm the model can now call the tool. After T1.2-T1.4, fire one Bhar-strain question and confirm the count matches the GUI (9, not 10).

---

## STREAM 2 — HIPAA + strategic documentation (~2-3 days)

This stream both creates new docs AND verifies that public commitments match reality. Doing it BEFORE the `/ask` migration ensures the new feature is designed compliant from day 1.

### S2.1 — HIPAA Technical Safeguards audit (~1 day)

Our public claim on `apps/web/app/(marketing)/security/page.tsx:195`:

> "HIPAA Technical Safeguards — Access control, audit controls, integrity, person authentication, transmission security — all architected against 45 CFR 164.312."

Verify EACH of the five 45 CFR 164.312 requirements against actual code:

| Requirement | Current state | Gap to close |
|---|---|---|
| **§164.312(a) Access control** — unique user ID, automatic logoff, encryption/decryption | Cognito unique-ID ✓; encryption ✓; **automatic logoff?** Verify `SESSION_IDLE_TTL_SECONDS` + `SESSION_ABSOLUTE_TTL_SECONDS` defaults are reasonable for HIPAA (typically 15-30 min idle) | Document timeout policy; verify enforcement |
| **§164.312(b) Audit controls** — record + examine activity | Structured logs exist; "no PHI in logs" promise from security page | Verify request bodies + response payloads are EXCLUDED from logs in code. Establish retention policy. Surface log review process to compliance team. |
| **§164.312(c) Integrity** — protect ePHI from improper alteration/destruction | KMS encryption ✓; backups ✓ (Railway-managed) | Document integrity controls + audit trail for data mutations. Verify per-tenant key isolation. |
| **§164.312(d) Person/entity authentication** — verify identity before access | Cognito MFA, JWT ✓ | Verify MFA is required for any account touching PHI (currently optional?). Verify session cookies use HttpOnly + Secure + SameSite. |
| **§164.312(e) Transmission security** — encryption + integrity controls | TLS 1.2+ external ✓; VPC internal ✓ (per claim) | Verify TLS is actually 1.2+ (not 1.0/1.1) on every Vercel + Railway public endpoint. |

**Deliverable:** `apps/web/docs/operations/hipaa-technical-safeguards.md` — a control-by-control mapping with:
- The public claim
- The code that implements it
- The verification test
- Any gap + remediation status

### S2.2 — Vendor dependencies doc (~2 hrs)

`docs/operations/vendor-dependencies.md` — for each of: Anthropic, Voyage AI, Railway (Postgres + Redis), Vercel, AWS Cognito (via "the cloud"), Crossref DOI, S3 tutorials bucket:

- What we use it for
- Data sensitivity (does it touch PHI? is there a BAA?)
- What happens when it's down
- Migration path if we needed to switch
- Renewal / contract dates if applicable

### S2.3 — Disaster recovery runbook (~2 hrs)

`docs/operations/disaster-recovery.md`:

- RTO (recovery time objective) per service
- RPO (recovery point objective) per service
- Backup verification cadence
- Step-by-step "production Postgres is down at 3 AM" runbook
- Step-by-step "SESSION_ENCRYPTION_KEY leaked" rotation runbook
- Restore-test schedule (quarterly?)

### S2.4 — Cost trajectory telemetry (~3 hrs)

- Backend: log every `/ask` request as `{userId, requestId, conversationId, tokensIn, tokensOut, voyageEmbedCost, voyageRerankCost, anthropicInputCost, anthropicOutputCost, totalCostCents, durationMs}` to a new Postgres table `chat_usage_events`
- Vercel: simple admin page at `/admin/cost-dashboard` showing daily/weekly/monthly per-user + per-org rollups
- Tripwire: webhook alert when daily spend exceeds $X

(This is also part of the per-user cost tracking in Stream 3; do them together.)

### S2.5 — Architecture Decision Records (~3 hrs)

`docs/architecture/decisions/` — write 7 ADRs capturing the key choices:

- ADR-001: Heart on Railway (why orchestration is on Python, not Node)
- ADR-002: `lib/ndi` shared core (why we split chat-specific from shared)
- ADR-003: ToolContext auth-forwarding (why this pattern over alternatives)
- ADR-004: HttpOnly cookie + CSRF double-submit (why not bearer tokens)
- ADR-005: Branch-aware preview routing (why per-branch backend mapping)
- ADR-006: pgvector for RAG (why not Pinecone/Weaviate)
- ADR-007: Vercel KV for session-affine state (post-Stream 3)

### S2.6 — Compliance posture doc (~1 hr)

`docs/compliance/posture.md` — for IRB / CISO conversations:

- What we're HIPAA-aware for (with §164.312 mapping from S2.1)
- NIH DMSP compliance
- SOC 2 Type II status + ETA
- BAAs in place (AWS, Vercel, Railway)
- Data residency (US-East currently)

---

## STREAM 3 — `/ask` → authenticated tab in My Workspace (~3-4 days)

Major new feature. Architectural shift.

### S3.1 — Route migration (~2 hrs)

**From:** `apps/web/app/(marketing)/ask/page.tsx` (anonymous-accessible)
**To:** `apps/web/app/(app)/my/ask/page.tsx` (auth-gated, like `/my/workspace/[id]`)

Plus:
- Update marketing nav: `/ask` link removed from public header
- Public visitors → marketing page describing the feature + CTA to sign up
- Redirect old `/ask` → `/login?returnTo=/my/ask` if user clicks a stale link
- Add "Ask" tab inside `/my` tab strip (alongside "Your datasets" and "Public NDI catalog")
- Or: integrate as a tab inside `/my/workspace/[id]` for dataset-scoped chat

**Decision needed:** Workspace-scoped (`/my/workspace/[id]/ask` — dataset context implicit) or workspace-global (`/my/ask` — user picks dataset per chat). Architecture audit suggested workspace-scoped for cleaner tenant isolation. Recommend going with workspace-scoped + a "switch dataset" affordance inside the tab.

### S3.2 — Per-user cost tracking infrastructure (~6 hrs)

**Backend (ndb-v2):**
- New Postgres table `chat_usage_events` (userId, requestId, conversationId, tokensIn, tokensOut, voyageEmbedTokens, voyageRerankUnits, costCents, durationMs, timestamp)
- New service `services/usage_tracking_service.py`
- New router `routers/usage.py` exposing `GET /api/usage/me` (per-user summary) + `GET /api/usage/org/:orgId` (per-org rollup, admin-only)
- Middleware on `/api/ask` that logs the event after each request

**Frontend (cloud-app):**
- Backend's `/api/ask` route emits the usage event via `logUsage()` call after `result.toUIMessageStreamResponse()`
- New page `/my-account/usage` showing per-user spending: today / this week / this month, with charts
- Per-user hard cap reads from org settings (`max_chat_spend_cents_per_month`); when hit, `/api/ask` returns `429 { error: 'quota_exceeded' }`

### S3.3 — Per-user rate limiting via Vercel KV (~4 hrs)

This subsumes the original D3 (Vercel KV migration). Now keyed by user, not IP:

- Replace `lib/ai/rate-limit.ts` in-memory `Map`s with Vercel KV reads/writes
- Per-user limits: 50/day (heavy) + 10/10min (burst)
- Per-org limits: configurable
- Hard cap on monthly spend: configurable per-org
- Headers communicate remaining quota: `X-RateLimit-Remaining-Daily`, `X-RateLimit-Reset`

### S3.4 — Per-org access control (`enable_ask` flag) (~3 hrs)

- New field on `organization` model: `enable_ask: bool` (default `false`)
- Admin UI to toggle per-org
- `/api/ask` checks org flag before processing; returns `403 { error: 'feature_not_enabled' }` if disabled
- Marketing/sales flow: when an org subscribes, ops toggles this on
- Per-user attribution: even within an org, individual users get usage capped

### S3.5 — Tenant-aware chat tools (~4 hrs)

The 14 tool handlers in `lib/ndi/tools/` need a HIPAA review:

- Every tool that touches dataset data must forward `ctx.authHeaders` (already mostly done via ToolContext)
- Every tool's empty-result branch should NOT leak the existence of inaccessible private datasets (e.g. "you have no access to this dataset" vs "this dataset doesn't exist" — pick the right message based on whether tenant boundary applies)
- Verify the 5 catalog handlers being moved out of `chat-tools.ts` (Stream 4 architecture work) — those are catalog-public so they don't need tenant filtering, but document the boundary

### S3.6 — Audit logging without PHI (~3 hrs)

The security page promises "audit logs, no PHI." Verify + enforce:

- Audit every `/api/ask` invocation with `{userId, conversationId, requestSummary: 'classified', responseSummary: 'classified'}`
- Tool calls logged as `{tool: 'fetch_signal', argsSummary: {dataset: '...', elementClass: 'redacted'}, durationMs, costCents}`
- NEVER log the actual prompt text, tool input bodies, or response bodies — those may contain PHI
- Backend tools log NDI doc IDs but never doc content fields

**Deliverable:** `apps/web/docs/operations/audit-log-policy.md` documenting what IS logged, what is NEVER logged, and the data retention policy.

---

## STREAM 4 — Tier 2 architecture rectifications (~3 days, parallelizable with Streams 2-3)

Original architecture audit findings. From this audit's revised plan:

| # | Item | Effort |
|---|---|---|
| S4.1 | Canonicalize workspace panel pattern (Pattern A for mutations, D for read-only) — migrate BehavioralCompare to wrapper route | 3 hrs |
| S4.2 | Single Button + ShowCodeButton primitives across all panels | 2 hrs |
| S4.3 | Move 5 catalog handlers from `chat-tools.ts` → `lib/ndi/tools/` (with proper `ctx?: ToolContext`) — eliminates duplicate `fetchJson` | 3 hrs |
| S4.4 | TreatmentTimelinePanel + SpikeActivityPanel → PanelCard (consistent chrome + a11y heading levels) | 2 hrs |
| S4.5 | Cross-boundary request tracing (`X-Request-Id` propagation Vercel→Railway) | 2 hrs |
| S4.6 | Extract permanent docs from handoff-v2 (`three-surfaces.md`, `adding-a-workspace-panel.md`, `tutorial-parity-smoke.md`) | 2 hrs |
| S4.7 | Update CLAUDE.md + README.md (Next.js version, workspace mention, Phase 7 status, BFG rewrite note, post-2026-05-15 architecture state) | 1 hr |
| S4.8 | Backend service-dependency README (which services call which other services) | 1 hr |
| S4.9 | Move `aggregate-documents.ts` to Railway (Heart-on-Railway compliance) | 1 day |
| S4.10 | pgvector IVFFlat → HNSW migration | 1.5 hrs |
| S4.11 | Incremental SYSTEM_PROMPT decomposition: extract `dataset-aliases.json` + ADR for the prompt-structure pattern (full decomposition deferred to after launch) | 2 hrs |

---

## STREAM 5 — Tier 3 data correctness (~3-4 days, parallelizable)

| # | Item | Effort |
|---|---|---|
| S5.1 | Fuzzier substring matching in Behavioral Compare (Finding #3 from yesterday) | 2 hrs |
| S5.2 | Treatment Timeline recognizes `treatment_drug` + `administration_*_time` columns (Finding #4) — ndb-v2 backend work | 3 hrs |
| S5.3 | Behavioral Compare cross-table joins (Finding #5) | 4 hrs |
| S5.4 | Strain count drift between GUI (9) and chat (10) (Finding #6) — likely closed by Stream 1's system-prompt fix; verify | 1 hr |
| S5.5 | Mukherjee dataset: sessions=0 with 7 elements investigation (Finding #8) | 1 hr |
| S5.6 | Backend species extraction fix (Finding #7 — 3 of 5 datasets show empty species array) | 2 hrs |
| S5.7 | Empty-dataset state on workspace (Finding #9 — Chudoba zero-docs needs "still processing" copy) | 1 hr |
| S5.8 | `/tables/{class}` server-side pagination (perf — 1.5 GB/day egress savings) | 1 day |

---

## STREAM 6 — Tier 4 test coverage + Tier 5 Dataset Health + D2 upgrade (~3-4 days, do last)

### Tier 4 test coverage (~6 hrs)

| # | Test | Effort |
|---|---|---|
| S6.1 | Markdown chart-fence dispatcher tests | 1 hr |
| S6.2 | workspace-client.tsx auth-gate + key-remount tests | 1 hr |
| S6.3 | next.config.ts branch-aware rewrite test | 30 min |
| S6.4 | CSRF bootstrap retry/failure path tests | 1 hr |
| S6.5 | 3 inline charts (BarChartByGroup, Histogram, ScatterPlot) tests | 1.5 hrs |
| S6.6 | Fix 3 pretest isolation failures (resource cleanup) | 1 hr |

### Tier 5 Dataset Health dashboard (~1.5 days)

The merged D8+D10 from the architecture audit:

| # | Item | Effort |
|---|---|---|
| S6.7 | `lib/data-quality/` module with invariants (subjects > 0 IFF totalDocuments > 0, elements > 0 ⇒ sessions > 0, species not empty, etc) | 4 hrs |
| S6.8 | Nightly cron checking each dataset against invariants → writes to Postgres | 3 hrs |
| S6.9 | Admin page at `/admin/data-health` showing per-dataset violations with drill-downs | 4 hrs |
| S6.10 | Catalog UI badge: "⚠ ingestion incomplete" for datasets failing invariants | 1 hr |

### D2 AI SDK v5 → v6 upgrade (~1 day)

| # | Item | Effort |
|---|---|---|
| S6.11 | Inventory breaking changes between v5 → v6 (Anthropic SDK + AI SDK) | 1 hr |
| S6.12 | Migrate `lib/ai/anthropic-client.ts` + tool registration shape | 4 hrs |
| S6.13 | Run replay harness (`tests/replay/`) on the new version; regression-test all tools | 2 hrs |
| S6.14 | Update tests for new API shape | 1 hr |

---

## SUGGESTED CALENDAR (~3-4 weeks total)

This is a suggested order; the user can re-order. Each "session" is a focused 4-8 hour block.

### Week 1 (~4 days)
- **Session 1** (~2 hrs): Stream 1 quick wins + verify
- **Session 2** (~6 hrs): Stream 2.1 (HIPAA audit) + S2.6 (compliance posture doc)
- **Session 3** (~4 hrs): Stream 2.2-2.5 (vendor deps + DR + ADRs + cost telemetry foundation)
- **Session 4** (~6 hrs): Stream 4.1-4.5 (panel canonicalization + button + catalog handlers + cross-boundary tracing)

### Week 2 (~5 days)
- **Session 5** (~8 hrs): Stream 3.1-3.3 (`/ask` migration foundation + per-user cost + Vercel KV rate limit)
- **Session 6** (~6 hrs): Stream 3.4-3.6 (org access control + tenant-aware tools + audit logging)
- **Session 7** (~4 hrs): Stream 4.6-4.10 (doc extracts + CLAUDE.md + service-dep README + aggregate-documents migration + HNSW)
- **Session 8** (~6 hrs): Stream 5.1-5.7 (data correctness yesterday's findings)

### Week 3 (~3 days)
- **Session 9** (~8 hrs): Stream 5.8 (`/tables` pagination — the big perf win)
- **Session 10** (~6 hrs): Stream 4.11 (incremental SYSTEM_PROMPT decomp) + Stream 6.1-6.6 (test coverage)
- **Session 11** (~6 hrs): Stream 6.7-6.10 (Dataset Health dashboard MVP)

### Week 4 (~2 days, optional)
- **Session 12** (~6 hrs): Stream 6.11-6.14 (AI SDK v5→v6 upgrade)
- **Session 13** (~4 hrs): Polish + verification + production smoke

### Total: ~14-17 days of focused work + verification across ~12-13 sessions

---

## SUCCESS CRITERIA (how we'll know we're done)

After all streams are complete:

| | Done when |
|---|---|
| **Tier 1** | All 11 items shipped; chat probe confirms PSTH callable + Bhar strain count = 9 (matches GUI) |
| **HIPAA** | Each of the 5 §164.312 controls has a code-mapped test + doc; security page claims match reality |
| **`/ask` migration** | `/ask` only accessible to signed-in users; per-user spending visible in `/my-account/usage`; org-level `enable_ask` flag enforced |
| **Cost tracking** | Daily/weekly/monthly per-user + per-org rollups; tripwire alert at $X/day spend |
| **Workspace consistency** | All 7 panels use Pattern A or D; single Button + ShowCodeButton primitives; all panels in PanelCard |
| **Data correctness** | All yesterday's Findings #3-#9 resolved; cross-dataset smoke green on all 8 public datasets |
| **Architecture docs** | CLAUDE.md current; three-surfaces + adding-a-panel + tutorial-parity-smoke docs exist; 7 ADRs written |
| **Operational docs** | vendor-dependencies + disaster-recovery + hipaa-technical-safeguards + audit-log-policy + compliance-posture all exist |
| **Tests** | All HIGH-impact coverage gaps closed; 3 pretest isolation failures fixed; CI 100% green |
| **Dataset Health** | Nightly cron running; admin dashboard live; catalog badge surfaces inflight datasets |
| **AI SDK** | Upgraded to v6; replay harness green on full conversation suite |

---

## RISK REGISTER (what could go wrong)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| HIPAA audit reveals real gaps requiring infra changes | MED | HIGH | Stream 2 done first; gaps surface before chat migration locks in the new shape |
| `/ask` migration breaks production catalog visitors | LOW | MED | Marketing page replacement + 302 redirect from old `/ask` |
| Vercel KV migration breaks rate limiting under load | LOW | MED | Behind feature flag; gradual rollout |
| Per-user cost tracking under-reports costs (silent budget creep) | MED | MED | Reconcile against Anthropic dashboard weekly during rollout |
| AI SDK v6 upgrade breaks tool calling shape | MED | HIGH | Replay harness is the gate; full regression before merge |
| Backend Pagination breaks chat tools that assumed full-table | LOW | MED | Add explicit `?page=1&pageSize=...` to all chat tool calls; verify counts |
| Dataset Health invariants are too strict / too loose | MED | LOW | Start with 2-3 high-confidence invariants; tune over weeks |

---

## WHAT SURVIVES COMPACT

After compact, the post-compact agent has:

1. This master plan (canonical reference)
2. The two audit docs (background)
3. The tutorial ground-truth doc (parity reference)
4. The security page source (HIPAA commitments)
5. The git history (all commits since 2026-05-14)
6. The full repo state at `feat/experimental-ask-chat` HEAD
7. The two Railway environments (production + experimental) configured correctly
8. The 3 active vendor connections (Anthropic, Voyage, Railway/Vercel)
9. Open user-side items (rollback tag deletion 2026-05-22, hooksPath setup, spending cap)

**What does NOT survive:**
- The in-context details of HOW each finding was discovered (read the audit docs)
- The specific Playwright session state (will need to reauth)
- The reasoning trail behind each triage decision (read this doc + audits)

---

## OPEN DECISIONS FOR USER (when convenient)

Not blocking; can be made along the way:

1. **`/ask` location: `/my/workspace/[id]/ask` (workspace-scoped) vs `/my/ask` (workspace-global)?** Recommend workspace-scoped for cleaner tenant boundary.
2. **Per-user monthly chat cap default**: $20/user/month? $50? Configurable per-org.
3. **Org-level `enable_ask` rollout policy**: opt-in for all paying orgs? require explicit sales activation? require BAA on file?
4. **HIPAA gap remediation prioritization**: if Stream 2.1 audit finds gaps, fix all before chat migration, or fix in parallel?
5. **Compliance documentation distribution**: public on `/security` page (current model) vs gated/NDA-only (typical SOC 2 pattern)?
6. **Rollback tag deletion date**: keeping 2026-05-22, or earlier?
7. **Dataset Health alerting**: email? Slack? In-app banner? All?

These are all non-blocking; reasonable defaults exist for each.

---

End of master plan. **Post-compact agent: start with Stream 1, then Stream 2.1 + 2.6 (HIPAA audit + compliance posture doc) before anything else.**
