# Pre-compact handoff + execution plan — 2026-05-15

This is the briefing for the post-compact agent. Two audit docs were
written this session; this doc says **what to do with them**.

**Read these in this order:**

1. **THIS doc** — the plan + what's been verified vs deferred
2. `apps/web/docs/architecture/2026-05-15-architecture-audit.md` — macro lens (10 smells)
3. `apps/web/docs/specs/2026-05-15-comprehensive-audit.md` — micro lens (20 findings)
4. `apps/web/docs/specs/2026-05-14-tutorial-ground-truth.md` — source-of-truth for parity work
5. `apps/web/docs/specs/2026-05-14-parity-smoke-report.md` — yesterday's exact-match validation

---

## TL;DR for post-compact

**Verified before compact** (these are real, fix them):
- ✅ `psth` tool handler exists in `lib/ndi/tools/psth.ts` but is NOT registered in `lib/ai/chat-tools.ts`. Bot literally cannot call PSTH. Fix: register it.
- ⚠️ "Dabrowska ID" finding is MORE NUANCED than the audit said: dataset `67f723d574f5f79c6062389d` IS Francesconi (Walter Francesconi first author). The system prompt at `lib/ai/system-prompt.ts:62-68` INTENTIONALLY routes "Dabrowska BNST" → this id because it's the only ingested dataset from Dabrowska's lab group. The routing is correct; the LABELING is misleading. Fix: rewrite the disambiguation prose to clarify "Dabrowska's lab" vs "Dabrowska first author" without changing the id.
- ✅ Hardcoded numeric example at `system-prompt.ts:84` (`"9 distinct strains across 10 sampled subjects, totalRows=5314"`) confirmed — replace with `{N}`/`{K}`/`{T}` placeholders. Likely root cause of yesterday's GUI-9 vs chat-10 strain-count drift.
- ✅ Factual error at `system-prompt.ts:259` (`"Bhar tree shrew study includes 9 C. elegans strains"`) — Bhar is C. elegans, NOT tree shrew. Tree shrew is the Van Hooser dataset. Fix: change "Bhar tree shrew study" to either "Bhar memory study" OR keep the example but use accurate dataset names.

**Other audit findings: trust them but spot-check at the file:line before bulk-fixing.** The audit agents read code; some claims are inference from reading the code without running it.

---

## Triage: what we tackle vs defer

### TIER 1 — Tackle this session (quick wins, <2 hours total)

These are all verified-real or trivially-true. None should take more than 30 min individually.

| # | Finding | File / location | Effort | Why now |
|---|---|---|---|---|
| 1 | Register `psth` in chat tools | `apps/web/lib/ai/chat-tools.ts` | 5 min | VERIFIED — bot can't call PSTH |
| 2 | Replace hardcoded numerics in system prompt | `lib/ai/system-prompt.ts:84` | 5 min | VERIFIED — hallucination amplifier |
| 3 | Fix "Bhar tree shrew" factual error | `lib/ai/system-prompt.ts:259` | 2 min | VERIFIED — wrong species in example |
| 4 | Clarify Dabrowska disambiguation prose | `lib/ai/system-prompt.ts:62-68` | 5 min | VERIFIED — id is correct, wording is misleading |
| 5 | Truncate session IDs in logs | ndb-v2 `backend/auth/dependencies.py:49,58` + `auth/login.py:170` | 10 min | Security replay-attack vector |
| 6 | Ruff RUF003 fail | ndb-v2 `backend/services/summary_table_service.py:64` | 2 min | CI lint gate red |
| 7 | Add missing env vars to `.env.example` | `apps/web/.env.example` | 10 min | Fresh clone won't boot |
| 8 | Fix `lib/api/ontology.ts` cross-layer import | `apps/web/lib/api/ontology.ts:11` | 15 min | Architecture smell #5 |
| 9 | Set `core.hooksPath .githooks` locally | `git config` | 1 min | One-time setup (USER does) |
| 10 | Set Anthropic spending cap on dashboard | Anthropic web UI | 5 min | Defense in depth (USER does) |
| 11 | `pnpm audit` + `pip-audit` CVE rollover | dependency bumps | 30 min | 50+ moderate CVEs on ndb-v2 |

**Total: ~90 min of focused work + 2 user-side items.**

### TIER 2 — Tackle next session(s) — architectural rectifications

These are the high-leverage architectural fixes from the macro audit. Each is bounded, well-scoped, and unblocks something downstream.

| # | Smell / Finding | Effort | Unlocks |
|---|---|---|---|
| 12 | Canonicalize workspace panel pattern (BehavioralCompare → wrapper route + Pattern A) | 3 hrs | Auth-uniform; consistent UX |
| 13 | Single Button + ShowCodeButton primitives in workspace | 2 hrs | Theme consistency; smaller cognitive load |
| 14 | Move 5 catalog handlers from `chat-tools.ts` → `lib/ndi/tools/` | 3 hrs | Workspace can use catalog with auth |
| 15 | Workspace empty-dataset state (Finding #9 / Chudoba-zero-docs) | 1 hr | UX clarity for processing datasets |
| 16 | Fix species extraction (Finding #7 / 3-of-5-datasets-empty) | 2 hrs | Data accuracy — affects 75% of catalog |
| 17 | TreatmentTimelinePanel + SpikeActivityPanel → PanelCard | 2 hrs | Visual + a11y consistency |
| 18 | Cross-boundary request tracing (X-Request-Id propagation) | 2 hrs | Observability — incident-response unblock |
| 19 | Extract permanent docs from handoff-v2 (three-surfaces + adding-a-panel + parity-smoke) | 2 hrs | Onboarding |
| 20 | Update CLAUDE.md + README.md (stale Phase 7, Next.js version, missing workspace mention) | 1 hr | Every future session benefits |

**Total: ~18 hrs ≈ 2-3 focused sessions.**

### TIER 3 — Yesterday's filed findings (#3-#6) — accuracy/UX

| # | Finding | Effort |
|---|---|---|
| 21 | #3 Fuzzier substring matching in Behavioral Compare | 2 hrs |
| 22 | #4 Treatment Timeline recognizes `treatment_drug` + `administration_*_time` | 3 hrs (backend) |
| 23 | #5 Behavioral Compare cross-table joins (subject-attribute groupBy) | 4 hrs (design + impl) |
| 24 | #6 Strain count drift between GUI (9) and chat (10) | 1 hr |
| 25 | #8 Mukherjee sessions=0 with 7 elements investigation | 1 hr |
| 26 | aggregate-documents.ts → Railway (Smell #4 — Heart-on-Railway) | 1 day |

**Total: ~3 days.**

### TIER 4 — Test coverage gaps (selective)

Only the HIGH-impact ones; lower-priority gaps can be added opportunistically as we touch the code.

| # | Finding | Effort |
|---|---|---|
| 27 | Markdown chart-fence dispatcher tests | 1 hr |
| 28 | workspace-client.tsx auth-gate + key-remount tests | 1 hr |
| 29 | next.config.ts branch-aware rewrite test | 30 min |
| 30 | CSRF bootstrap retry/failure path tests | 1 hr |
| 31 | 3 inline charts (BarChartByGroup, Histogram, ScatterPlot) tests | 1.5 hrs |

**Total: ~5 hrs.**

---

## DEFERRED — explicit list of what we're NOT tackling

Each of these is a real finding but is either out-of-scope for this push, requires a focused dedicated session, or is blocked on infrastructure decisions:

### Deferred to separate focused sessions

| # | Item | Why deferred |
|---|---|---|
| D1 | Full SYSTEM_PROMPT decomposition (Smell #6 → structured config) | ~1 day; needs replay-harness regression testing; better as its own focused session AFTER tier 1 quick fixes prove the model behaves correctly post-edit |
| D2 | AI SDK major version upgrade (v5 → v6) | Breaking signature changes; risky during active feature work. Wait until /ask exits experimental. |
| D3 | Rate-limit migration to Vercel KV (Smell from yesterday's #2) | Pre-launch must-do BEFORE /ask leaves experimental; not urgent now while it's behind a feature flag |
| D4 | `/tables/{class}` pagination (Smell #6 perf) | 1 day backend + frontend; high impact ($$ savings) but doesn't gate other work. Tackle as a dedicated perf sprint. |
| D5 | pgvector IVFFlat → HNSW migration | 30 min code but needs production-data benchmark. Tackle in a dedicated perf sprint. |
| D6 | Plotly → uPlot for SignalChart | ~1 week; only urgent if bundle headroom drops below 10 KB (currently 32 KB) |
| D7 | Backend service-dep README → Protocols | Light version (README) is in Tier 2 #19. Full Protocols are big refactor; defer. |

### Deferred to new "build" sessions (each is its own scope)

| # | Item | Why this needs its own scope |
|---|---|---|
| D8 | Dataset Health dashboard (architecture audit new-build #1) | ~3 days; needs design + frontend + backend |
| D9 | Conversation persistence model (new-build #2) | ~3 days; new backend model + Postgres schema + UI |
| D10 | data-quality cron (new-build #3) | ~2 days; depends on D8 partially |
| D11 | Programmatic tutorial generation (Smell #10) | ~3 days; only worth doing when adding the 4th tutorial |

### Won't fix (intentional decisions)

| # | Item | Why won't fix |
|---|---|---|
| W1 | 3 pre-existing pytest isolation failures | Tracked baseline; not our regression |
| W2 | 55 pre-existing mypy errors on ndb-v2 | All are external-library-import-untyped or test stubs; not application bugs |
| W3 | NDI-python tightly coupled to backend services | This coupling IS the value; NDI is the moat |
| W4 | No ORM on backend | Direct cloud client calls are fine for current scope |
| W5 | TanStack Query vs alternatives | TanStack is the right choice for our needs |

---

## Suggested post-compact execution order

The most efficient flow:

### Session 1 (post-compact): Quick wins
Tier 1 items 1-8 + 11 (~90 min). Skip 9-10 unless user is around to do them.

Verification at the end: confirm `psth` is callable from chat, confirm prompt edits didn't break the bot (run one /ask probe), CI green.

### Session 2: Workspace consistency
Tier 2 items 12, 13, 17 (~7 hrs). All workspace-panel rectifications in one PR. Easier to review as a single migration.

End state: workspace looks/behaves consistently across all 7 panels.

### Session 3: Data correctness
Tier 2 items 14, 15, 16 + Tier 3 items 21, 22, 24, 25 (~9 hrs). All "the numbers should be right" fixes.

End state: every dataset's chip counts + behavioral compare + treatment timeline matches the tutorial ground-truth where it exists.

### Session 4: Observability + docs
Tier 2 items 18-20 (~5 hrs). Tracing + docs + CLAUDE.md update.

End state: a new contributor can be productive without senior help.

### Session 5: Selected test coverage
Tier 4 items 27-31 (~5 hrs). Lock in the wins before they regress.

### Session 6 (optional): SYSTEM_PROMPT decomposition
D1 only when ready to spend a full day with replay-harness verification. Probably right before /ask exits experimental.

---

## What's already shipped this session

Don't redo any of these — they're in `feat/experimental-ask-chat` history at the commits below:

| Commit | What |
|---|---|
| `b850d1f` (ndb-v2) | CSRF cookie Domain scoping by request Origin |
| `f3c5b75` (ndb-v2) | Epoch fallback chain widened (Francesconi EPOCHS=0 → 1604) |
| `bb8c910` (cloud-app, now `9a13de8` post-BFG) | Electrode Position error copy softened |
| `c12fd7a` (cloud-app) | /api/ask maxDuration 60 → 180s |
| `7d92e42` (cloud-app) | gitleaks annotations + ignorefile |
| `1a3794a` (cloud-app) | Security incident doc archived (resolved) |
| `24b9590` (cloud-app) | Yesterday's comprehensive bug audit |
| `619febf` (cloud-app) | Architecture macro audit |

Plus: rotated Voyage AI key + Railway Postgres password + force-pushed BFG history scrub. All credentials are live + verified. The leaked-credentials incident is closed.

---

## Open user-side items (not blocking; gentle reminders)

| | Item |
|---|---|
| 🗓 | **2026-05-22** (in 7 days): delete the rollback tag `gitleaks-pre-scrub-2026-05-15-rollback` after burn-in. Then delete `.gitleaksignore` (entries become no-ops). |
| 🔧 | `git config core.hooksPath .githooks` — local hook activation (Tier 1 #9) |
| 💰 | Anthropic dashboard: set org-level spending cap as defense-in-depth (Tier 1 #10) |

---

## Final state at compact

Both audit docs + this plan are pushed to `feat/experimental-ask-chat`. The post-compact agent should `git pull && cat apps/web/docs/specs/2026-05-15-pre-compact-handoff-and-execution-plan.md` to bootstrap.

Reading order again (for the post-compact agent):
1. THIS file
2. `apps/web/docs/architecture/2026-05-15-architecture-audit.md`
3. `apps/web/docs/specs/2026-05-15-comprehensive-audit.md`
4. Begin Session 1 quick wins.

Sleep well. Audits + execution plan are persisted; everything else compacts cleanly.
