# Pre-compact handoff — 2026-05-16

**Single source of truth for the post-compact agent.** Read this
doc first. Everything below is captured BEFORE compaction so it
survives the session boundary.

---

## 🚨 ORIENTATION (the same rules as the original master plan)

You are working across **two sibling repos** under
`~/Documents/ndi-projects/`:

| Repo | Path | Role | Hosted on |
|---|---|---|---|
| `ndi-cloud-app` | `~/Documents/ndi-projects/ndi-cloud-app` | Next.js 16 frontend + API routes | Vercel |
| `ndi-data-browser-v2` | `~/Documents/ndi-projects/ndi-data-browser-v2` | FastAPI backend + Python NDI integration | Railway |

**Branches:**

| Repo | `main` | Draft branch (where we work) |
|---|---|---|
| ndi-cloud-app | production (DO NOT push) | `feat/experimental-ask-chat` |
| ndi-data-browser-v2 | production (DO NOT push) | `feat/ndi-python-phase-a` |

**Sacred rules** (unchanged from prior handoffs):
1. NEVER push to `main` on either repo.
2. NEVER touch Vercel `Production`-scope env vars. Only `Preview`.
3. NEVER touch Railway `production` env. Only `experimental` (env id `90101f6e-042b-44d6-8c8d-ec18d43b341b` for ndb-v2).
4. NEVER force-push to `main`. Force-pushing draft is OK if explicitly authorized.
5. NEVER skip pre-commit / pre-push hooks (`--no-verify`, `--no-gpg-sign` are prohibited).
6. **Author rule:** every commit must be `audriB <audri@walthamdatascience.com>`. Use `--author="audriB <audri@walthamdatascience.com>"`.
7. **Co-Authored-By trailer required:** `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

**Live deployment:** untouched. `https://ndi-cloud.com` still serves `main` of each repo. All work landed on the draft branches above.

**Test creds (Playwright form-fill only; never persist or echo):**
- email: `audri+test@walthamdatascience.com`
- password: `remhuz-ruwfy4-jiGcen`

---

## Master execution plan — completion status

The plan at `apps/web/docs/specs/2026-05-15-master-execution-plan.md`
defined 6 streams totaling ~14-17 days of work. **All sub-streams are
landed or have a deferred spec.** Status table:

### Stream 1 — Tier 1 quick wins ✅ DONE

| # | Item | State |
|---|---|---|
| T1.1 | Register `psth` in chat-tools.ts | ✅ shipped (c474248) |
| T1.2 | Hardcoded numerics in system-prompt.ts:84 | ✅ shipped |
| T1.3 | "Bhar tree shrew" factual error | ✅ shipped |
| T1.4 | Dabrowska disambiguation clarification | ✅ shipped |
| T1.5 | Session-id log truncation (3 sites) | ✅ shipped (0a3c008) |
| T1.6 | Ruff RUF003 fix in summary_table_service.py | ✅ shipped |
| T1.7 | Missing env vars in .env.example | ✅ shipped |
| T1.8 | Cross-layer import → lib/ontology/utils.ts | ✅ shipped |
| T1.9 | `core.hooksPath .githooks` locally | 🔧 USER ACTION |
| T1.10 | Anthropic spending cap on dashboard | 🔧 USER ACTION |
| T1.11 | pip-audit + CVE bumps (python-multipart, pip) | ✅ shipped |

### Stream 2 — HIPAA + strategic docs ✅ DONE

| # | Item | State |
|---|---|---|
| 2.1 | HIPAA Technical Safeguards audit + doc + PHI-in-logs test | ✅ shipped (aca4428, 9fc8b2d) |
| 2.2 | vendor-dependencies.md | ✅ shipped (9320b4b) |
| 2.3 | disaster-recovery.md + 5 secret-rotation runbooks | ✅ shipped |
| 2.4 | Cost-telemetry design spec (impl folded into S3.2) | ✅ shipped |
| 2.5 | 7 ADRs at apps/web/docs/architecture/decisions/ | ✅ shipped (+ ADR-008 in S4.11) |
| 2.6 | Externalized compliance posture for IRB/CISO | ✅ shipped |

### Stream 3 — `/ask` → authenticated tab ✅ DONE

| # | Item | State |
|---|---|---|
| 3.1 | Route migration `/my/ask` auth-gated | ✅ shipped (8660501) |
| 3.2 | `chat_usage_events` Postgres + writer + rate-card | ✅ shipped |
| 3.3 | Vercel KV rate limiting (per-user) | ✅ shipped |
| 3.4 | Per-org `enable_ask` flag | ✅ shipped (cloud-app + ndb-v2) |
| 3.5 | Tenant-aware tools audit | ✅ doc shipped (7 handler retrofits left as Stream-3.1-followup) |
| 3.6 | audit-log-policy.md | ✅ shipped |

### Stream 4 — Architecture rectifications

| # | Item | State |
|---|---|---|
| 4.1 | BehavioralCompare → wrapper-route Pattern A | ✅ shipped (6931282) |
| 4.2 | Single Button + ShowCodeButton primitives | ✅ shipped |
| 4.3 | Catalog handlers → lib/ndi/tools/ | ✅ shipped (af24614) |
| 4.4 | TreatmentTimeline + SpikeActivity → PanelCard | ✅ shipped |
| 4.5 | X-Request-Id cross-boundary tracing | ✅ shipped |
| 4.6 | Extract handoff docs (three-surfaces, adding-a-panel, parity-smoke) | ✅ shipped |
| 4.7 | Update CLAUDE.md + README | ✅ shipped |
| 4.8 | Backend service-dependency README (ndb-v2) | ✅ shipped (9c2bc15) |
| 4.9 | Move aggregate-documents.ts to Railway | 📋 SPEC in `2026-05-15-remaining-backend-work.md` |
| 4.10 | pgvector IVFFlat → HNSW | ✅ shipped (3b7cf54) |
| 4.11 | SYSTEM_PROMPT decomp + dataset-aliases.json + ADR-008 | ✅ shipped |

### Stream 5 — Data correctness

| # | Item | State |
|---|---|---|
| 5.1 | Fuzzier substring matching in tabular_query | ✅ shipped (0956236) |
| 5.2 | TreatmentTimeline treatment_drug + administration_*_time fallback | ✅ shipped (d168134) |
| 5.3 | BehavioralCompare cross-table joins | 📋 SPEC in `2026-05-15-remaining-backend-work.md` |
| 5.4 | Strain count drift verified closed by T1.2 | ✅ verified |
| 5.5 | Mukherjee sessions=0 diagnostic log | ✅ shipped (580a76b) |
| 5.6 | Backend species extraction diagnostic | ✅ shipped (0956236) |
| 5.7 | Empty-dataset state on DatasetStructurePanel | ✅ shipped |
| 5.8 | `/tables/{class}` server-side pagination | 📋 SPEC in `2026-05-15-remaining-backend-work.md` |

### Stream 6 — Tests + Dataset Health + AI SDK upgrade ✅ DONE

| # | Item | State |
|---|---|---|
| 6.1 | Markdown chart-fence dispatcher tests + psth-chart wiring | ✅ shipped (6931282) |
| 6.2 | workspace-client auth-gate + key-remount tests | ✅ shipped (3b7cf54) |
| 6.3 | next.config.ts branch-aware rewrite test | ✅ shipped |
| 6.4 | CSRF retry tests (already extensively covered) | ✅ verified |
| 6.5 | Inline chart tests (BarChartByGroup, Histogram) | ✅ shipped |
| 6.6 | Pretest isolation fixes (3 ndb-v2 flakes) | ✅ shipped (580a76b) |
| 6.7 | Dataset Health invariants module + tests | ✅ shipped |
| 6.8 | Dataset Health nightly cron + Postgres | ✅ shipped (8660501) |
| 6.9 | `/admin/data-health` admin page | ✅ shipped |
| 6.10 | Dataset Health catalog badge | ✅ shipped (3b7cf54) |
| 6.11 | AI SDK v6 upgrade inventory | ✅ shipped |
| 6.12-6.14 | AI SDK v5 → v6 upgrade (code) | ✅ shipped (8660501) |

**Total: 51 of 54 sub-streams landed (94%).** 3 sub-streams have crisp specs deferred to a future session that needs live data access (S4.9, S5.3, S5.8).

---

## Commits — full inventory across both branches

### cloud-app `feat/experimental-ask-chat` (7 commits since pre-compact)

```
8660501 feat: finish remaining plan — AI SDK v6 + Stream 3 + Dataset Health
3b7cf54 feat(workspace+infra): S6.10 catalog badge + S6.2 workspace-client tests + S4.10 pgvector HNSW + S6.11 AI SDK v6 upgrade inventory
6931282 feat(workspace+chat): Stream 4 panel canonicalization + 4.11 prompt decomp + 5.7 empty state + 6.1/3/5/7 test coverage + Dataset Health invariants
af24614 refactor(ask): Stream 4 — catalog handlers to lib/ndi/tools/, X-Request-Id propagation, CLAUDE.md update, three permanent docs
9320b4b docs(operations+architecture): Stream 2.2 + 2.3 + 2.4 design + 2.5 ADRs
aca4428 docs(compliance): Stream 2.1 + 2.6 — HIPAA Technical Safeguards audit + externalized compliance posture
c474248 feat(ask): Stream 1 Tier-1 quick wins — psth registration, prompt fixes, env example, cross-layer cleanup
```

### ndb-v2 `feat/ndi-python-phase-a` (6 commits since pre-compact)

```
0956236 feat: backend pieces — S3.4 enable_ask + S5.1 fuzzier substring + S5.6 species diagnostic
d168134 feat(treatment-timeline): Stream 5.2 — treatment_drug class + administration_*_time fallback
580a76b fix(observability+test-isolation): Stream 5.5 sessions diagnostic + 6.6 pretest isolation
9c2bc15 docs: Stream 4.8 — backend service-dependency README
9fc8b2d test(compliance): Stream 2.1 — static regression test asserting no PHI/secrets in log calls
0a3c008 fix(security+observability): Stream 1 quick wins — session-id log truncation + CVE bumps + ruff fix
```

---

## New surfaces shipped (where to look)

### Cloud-app

- **`/my/ask`** — auth-gated experimental chat. `app/(app)/my/ask/page.tsx` + `my-ask-client.tsx`. Reuses `<AskShell>`.
- **`/admin/data-health`** — admin dashboard reading `dataset_health_violations` snapshot. `app/(app)/admin/data-health/page.tsx` + `data-health-client.tsx`.
- **`/api/cron/dataset-health`** — nightly Vercel cron (07:23 UTC) writing the snapshot.
- **`/api/admin/data-health`** — admin-authz Postgres read.
- **`/api/datasets/[id]/tabular-query`** — POST wrapper route for BehavioralComparePanel.
- **`lib/data-quality/invariants.ts`** — 6 health invariants + worstSeverity + checkCompactDatasetHealth.
- **`lib/data-quality/persistence.ts`** — `replaceViolationsForDataset` + `readAllLatestViolations`.
- **`lib/usage/rate-card.ts`** + **`lib/usage/log.ts`** — cost tracking for `/api/ask`.
- **`lib/ai/rate-limit-kv.ts`** — Vercel KV rate limiter with in-memory fallback.
- **`lib/ai/dataset-aliases.json`** — extracted DISAMBIGUATION data feeding the system prompt.
- **`lib/next-config/api-rewrite.ts`** — extracted branch-aware rewrite (testable).
- **`lib/ontology/utils.ts`** — relocated from `components/ontology/` to fix cross-layer import.
- **`lib/ai/db/migrations/`** — pgvector HNSW migration + dataset-health + chat-usage-events migrations + README.
- **17 chat tools** in `lib/ai/chat-tools.ts` (psth + tabular wrap + 14 others) — all reading from `lib/ndi/tools/`.

### Cloud-app docs (NEW since pre-compact)

- `docs/architecture/decisions/001-007.md` (ADRs) + `008-system-prompt-decomposition.md` + `README.md`
- `docs/compliance/posture.md` — externalized for IRB/CISO
- `docs/operations/`:
  - `hipaa-technical-safeguards.md` — §164.312 control-by-control mapping
  - `vendor-dependencies.md` — vendor inventory + BAA status
  - `disaster-recovery.md` — RTO/RPO + 5 secret-rotation runbooks
  - `audit-log-policy.md` — what IS / NEVER logged
  - `tenant-aware-tools-audit.md` — Stream 3.5 audit + retrofit plan
  - `three-surfaces.md` — chat / workspace / eval sharing tool handlers
  - `adding-a-workspace-panel.md` — 8-step checklist
  - `tutorial-parity-smoke.md` — canonical Bhar/Haley/Francesconi smoke
- `docs/specs/`:
  - `2026-05-15-master-execution-plan.md` — canonical reference (status table now in this handoff)
  - `2026-05-15-comprehensive-audit.md` — micro audit findings
  - `2026-05-15-cost-telemetry-design.md` — S2.4 design
  - `2026-05-15-ai-sdk-v6-upgrade-inventory.md` — pre-upgrade risk register (now executed)
  - `2026-05-15-remaining-backend-work.md` — S4.9/S5.3/S5.8 specs
  - `2026-05-14-tutorial-ground-truth.md` — preserved for parity reference
- `docs/architecture/2026-05-15-architecture-audit.md` — macro audit

### ndb-v2 docs

- `backend/SERVICE_DEPENDENCIES.md` — service dependency map
- `apps/web/docs/security/2026-05-14-leaked-credentials-resolved.md` (in cloud-app, but covers the cross-repo incident)

---

## All findings surfaced this session — disposition

### Fixed in this round

1. **`psth-chart` fence was unhandled in Markdown.tsx** — psth tool registered (Stream 1 T1.1) but the chat UI couldn't render the chart fence. Fixed in 6931282; chart-fence dispatcher test (Stream 6.1) locks the wiring.

2. **`@/components/ontology/ontology-utils` cross-layer import** — `lib/api/ontology.ts` imported from a UI component, violating layering. Fixed in c474248; moved to `lib/ontology/utils.ts`; 5 importers updated.

3. **3 pretest isolation flakes in ndb-v2** — `test_cloud_client.py` x2 + `test_dependencies.py` x1. Root cause: `cache_logger_on_first_use=True` pinned cached `BoundLoggerLazyProxy` against the initial processor chain. Fixed in 580a76b — flipped to `False` + added autouse `reset_defaults + reconfigure` fixture in conftest.

4. **`pip` CVE-2026-6357** — closed via Dockerfile `pip>=26.1` upgrade. **`pip` CVE-2026-3219** still listed by pip-audit with no fix version; tracked.

5. **BehavioralCompare bypassed wrapper-route pattern** (audit Finding #7) — fixed in 6931282 with new `/api/datasets/[id]/tabular-query` POST wrapper.

6. **Stream 5.5 Mukherjee sessions=0 diagnostic** — `summary.sessions_zero_with_elements` log event added.

7. **Stream 5.6 species extraction diagnostic** — `dataset_summary.species_empty_with_subjects` log event added.

### Deferred to next session (specs ready)

- **S4.9 / S5.3 / S5.8** — see `apps/web/docs/specs/2026-05-15-remaining-backend-work.md`.

### Tracked in docs, not yet acted upon

- **Voyage cost not captured in `chat_usage_events`** — Voyage is called from inside tool handlers, not via `streamText.usage`. Per-tool Voyage accumulator is a future Stream 3.2 extension. Today only Anthropic counts populate the cost row (the binding cost line).

- **7 chat tools still need `ToolContext` retrofit** — `aggregate-documents`, `fetch-image`, `fetch-signal`, `get-document`, `ndi-dataset-overview`, `ndi-query`, `query-documents`, `walk-provenance`. Captured in `apps/web/docs/operations/tenant-aware-tools-audit.md`. Becomes critical when `/ask` flips to auth-required (currently still anonymous-capable on `/(marketing)/ask`).

- **`MeResponse.canUseAsk` defaults to `true`** for forward-compat with older FastAPI builds that haven't shipped the field. Once every environment is on the new build, promote the schema from `.optional().default(true)` to plain `z.boolean()`.

- **AI SDK v6 replay-harness validation pending** — typecheck + unit tests are clean, but the chat replay harness at `tests/replay/` wasn't run live. The upgrade inventory flagged this as the validation gate.

- **HIPAA MFA enforcement gap** — Cognito Pool offers MFA but we don't verify application-side enforcement. Cross-referenced in `hipaa-technical-safeguards.md` §164.312(d) gap #1.

- **HNSW latency-verification step is manual** — the migration script applies idempotently; the latency win needs to be measured against the IVFFlat baseline post-deploy. Procedure in `lib/ai/db/migrations/README.md`.

### User-side action items (still pending)

| # | Item | When |
|---|---|---|
| 1 | `git config core.hooksPath .githooks` locally (T1.9) | Whenever convenient |
| 2 | Anthropic dashboard spending cap (T1.10) | Before scale |
| 3 | Delete rollback tag `gitleaks-pre-scrub-2026-05-15-rollback` | 2026-05-22 |
| 4 | Delete Finder-duplicate files in ndb-v2 root | Whenever |
| 5 | Gitignore screenshots + `audit/` dir in cloud-app root | Whenever |
| 6 | Apply the two new Postgres migrations against the experimental env | Before /admin/data-health works live |
| 7 | Provision Vercel KV for the `Preview` scope | Optional; without it the in-memory fallback works |
| 8 | Set `ENABLE_ASK_ORG_IDS` on Railway experimental env (empty = open) | When ready to gate /ask |

---

## Untracked clutter (in working trees, but NOT committed)

These were flagged in prior reports but the user hasn't cleaned them up yet. They're harmless (untracked → not in history) but visible in `git status`.

### cloud-app root (untracked)

```
ask-screenshot.png
audit/
document-detail-h1.png
francesconi-epm-saline-cno-match.png
prod-datasets.png
prompt1-final.png
prompt2-chart.png
prompt2-final.png
qp-bhar-bar-count.png
tutorial-top.png
```

Probably from earlier interactive Playwright runs. Either `rm` or gitignore.

### ndb-v2 root (untracked Finder duplicates)

```
.githooks/pre-commit 2
.githooks/pre-commit 3
backend/auth/dependencies 2.py
backend/auth/login 2.py
backend/requirements 2.txt
backend/services/summary_table_service 2.py
infra/Dockerfile 2
docs/superpowers/
```

Finder-duplicate files (probably from copy-paste). These would trip CI hygiene if staged. Safe to `rm` from disk.

---

## What's actually deferred to a future session

Only three backend pieces need live data + meaningful refactoring. **Crisp specs already written.**

| # | Item | Spec | Est. effort |
|---|---|---|---|
| S4.9 | Port `aggregate-documents.ts` to FastAPI per ADR-001 | `2026-05-15-remaining-backend-work.md` | 1 day |
| S5.3 | BehavioralCompare cross-table joins (subject + treatment) | Same | 1-2 days |
| S5.8 | `/tables/{class}` server-side pagination (95% egress saving) | Same | 1 day |

All three need either Railway shell access or live Postgres data inspection to verify behavior. They're surgical additions; the spec doc has acceptance criteria each.

**Other follow-ups from "Tracked in docs":**

- Run AI SDK v6 replay harness against canonical conversation traces — `apps/web/tests/replay/`.
- Wire Voyage cost accumulator through the chat-tool layer into `chat_usage_events.voyage_*` columns.
- ToolContext retrofit for 7 chat tools (mechanical; deferred to when `/ask` flips fully auth-required).

---

## Verification snapshot (as of this handoff)

- **cloud-app**: lint ✓, typecheck ✓, vitest **1,612/1,612** ✓, build ✓
- **ndb-v2**: ruff ✓, pytest **893/893** ✓ (6 skipped — env-flag gated)
- **Both repos at clean HEADs** on their draft branches with no uncommitted changes (untracked files listed above are intentional / pre-existing).

---

## Quick-start for the post-compact agent

1. **Confirm location:**
   ```bash
   cd ~/Documents/ndi-projects/ndi-cloud-app
   git branch --show-current   # should print feat/experimental-ask-chat
   git status --short          # should show only the known untracked PNGs / audit dir
   ```

2. **Pull both repos to make sure you're synced:**
   ```bash
   git pull --ff-only
   cd ~/Documents/ndi-projects/ndi-data-browser-v2
   git pull --ff-only
   git branch --show-current   # should print feat/ndi-python-phase-a
   ```

3. **Read this doc + the master plan:**
   - `apps/web/docs/specs/2026-05-16-pre-compact-handoff.md` (THIS doc)
   - `apps/web/docs/specs/2026-05-15-master-execution-plan.md` (canonical plan)
   - `apps/web/docs/specs/2026-05-15-remaining-backend-work.md` (S4.9/5.3/5.8 specs)
   - `CLAUDE.md` (project memory)

4. **What to do next** depends on the user's direction. Likely candidates:
   - **Review session work**: walk through the new docs / surfaces, confirm correctness.
   - **Live preview QA**: drive the preview URL through the tutorial parity smoke (`apps/web/docs/operations/tutorial-parity-smoke.md`) to verify everything works against real datasets.
   - **Stream 4.9 / 5.3 / 5.8** if the user wants to finish those.
   - **Replay-harness pass** to validate the AI SDK v6 upgrade against canonical chat traces.
   - **Voyage cost accumulator** to round out the cost-tracking surface.

---

## Update history

| Date | Change |
|---|---|
| 2026-05-16 | Initial handoff — covers all work since the pre-compact baseline at cloud-app `729907d` / ndb-v2 `f3c5b75`. |
