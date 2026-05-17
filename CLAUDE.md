# CLAUDE.md — ndi-cloud-app

Agent context for the unified NDI Cloud monorepo at `ndi-cloud.com`.

---

## 🚨 ORIENTATION — READ THIS FIRST (every session)

You are working across **two sibling repos** under `~/Documents/ndi-projects/`:

| Repo | Path | Role | Hosted on |
|---|---|---|---|
| `ndi-cloud-app` | `~/Documents/ndi-projects/ndi-cloud-app` | Next.js 16 frontend + API routes | Vercel |
| `ndi-data-browser-v2` | `~/Documents/ndi-projects/ndi-data-browser-v2` | FastAPI backend + NDI-python integration | Railway |

**Active branches:**

| Repo | `main` | Draft branch (where we work) |
|---|---|---|
| `ndi-cloud-app` | production — **DO NOT push** | `feat/experimental-ask-chat` |
| `ndi-data-browser-v2` | production — **DO NOT push** | `feat/ndi-python-phase-a` |

### THE LIVE DEPLOYMENT IS SACRED — DO NOT TOUCH

| | Production (untouched) | Experimental / Preview (where we work) |
|---|---|---|
| **Frontend URL** | `https://ndi-cloud.com` | `https://ndi-cloud-app-web-git-feat-experiment-c5da7d-ndi-cloud-a83eb4e7.vercel.app` |
| **Backend URL** | `https://ndb-v2-production.up.railway.app` | `https://ndb-v2-experimental.up.railway.app` |
| **Railway env id** | `e0c00fb7-ac98-431f-acdb-f4988032160f` | `90101f6e-042b-44d6-8c8d-ec18d43b341b` |
| **Vercel env scope** | `Production` | `Preview` |
| **Branch wired to** | `main` of each repo | the draft branches above |

### Sacred rules (non-negotiable)

1. **NEVER push to `main`** on either repo.
2. **NEVER touch Vercel `Production`-scope env vars.** Touch only `Preview`.
3. **NEVER touch Railway `production` env.** Touch only `experimental` (env id `90101f6e-...` for ndb-v2). The Railway agent lets you specify env id — always use the experimental one.
4. **NEVER force-push to `main`.** Force-push on the draft branch is OK if explicitly authorized.
5. **NEVER skip pre-commit / pre-push hooks** (`--no-verify`, `--no-gpg-sign` are prohibited).
6. **Author rule (non-negotiable):** every commit must be `audriB <audri@walthamdatascience.com>`. Use `--author="audriB <audri@walthamdatascience.com>"` on every git commit.
7. **Co-Authored-By trailer required** on every Claude-driven commit: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

### Test credentials (Playwright form-fill ONLY; never persist or echo)

For workspace + chat smoke testing:
- email: `audri+test@walthamdatascience.com`
- password: `remhuz-ruwfy4-jiGcen`

Deliberately-scoped test account. Public datasets only — no private datasets attached. Use Playwright `browser_fill_form`; never write to disk; never echo in chat output.

### Verifying before any action

```bash
# Confirm you're on the right branch
git branch --show-current
# cloud-app should print: feat/experimental-ask-chat
# ndb-v2   should print: feat/ndi-python-phase-a

# Confirm Railway env id you're targeting (in railway-agent calls)
# experimental ndb-v2: 90101f6e-042b-44d6-8c8d-ec18d43b341b
# DO NOT use production: e0c00fb7-ac98-431f-acdb-f4988032160f
```

If you ever find yourself about to operate on `main` or on production Vercel/Railway, **STOP** and ask the user for explicit confirmation.

### Where to read next (pick up cold)

**🚨 IF YOU ARE THE POST-COMPACTION SESSION FROM 2026-05-18:** read this FIRST, before anything else:

**`apps/web/docs/reviews/2026-05-19b-post-handoff-execution.md`** (latest, evening 2026-05-19) — six new commits stacked on top of the earlier handoff, all six cloud-app capability gaps closed (time-coloring, video, BehavioralTrack, patch-clamp, derived columns, UI polish). Live G2/G3 verification with the fresh `steve+thing1@…` creds re-confirmed the B1 workspace-redirect bug from both directions — API-level parity green for Haley, but the workspace UI flips dataset within 3-10s. Contains the agent-collision postmortem for next session's parallel-agent dispatch.

**`apps/web/docs/reviews/2026-05-19-session-handoff.md`** (prior — still relevant) — Captured the comprehensive audit + UI sweep arc: seven commits including the critical Vercel-rewrite bug fix, full audit findings table (33 items), G-verify live results (3 of 4 Francesconi tutorial tasks PASS including the flagship Saline-vs-CNO violin matching MATLAB to 2 decimal places).

**Critical operational caveat:** the test accounts `audri+test@walthamdatascience.com` AND `steve+thing1@walthamdatascience.com` are BOTH rate-limited as of 2026-05-19 evening. Wait ~1 hour after the last login attempt OR request fresh creds from the user before re-dispatching any Playwright agent that logs in. The auth rate-limit fires after ~5 logins per email in a sliding window; the workspace-redirect bug triggers more retries than expected because each redirect appears to re-trip the login flow.

For ongoing context (older but still relevant):

1. **`apps/web/docs/reviews/2026-05-18-comprehensive-audit-findings.md`** — detailed audit synthesis from earlier in the arc (first pass; this handoff supersedes for current state).
2. **`apps/web/docs/specs/2026-05-18-backend-followups.md`** — the 11 backend tickets (F-1 → F-1e + F-2 → F-8) + 4 SDK asks.
3. **`apps/web/docs/operations/workspace-tutorial.md`** — the user-facing tutorial; use it to drive G2/G3 + manual smoke.
4. **`apps/web/docs/specs/2026-05-16-pre-compact-handoff.md`** — older session source-of-truth.
5. `apps/web/docs/reviews/2026-05-17-carryability-and-architecture.md` — earlier carryability review.
6. `apps/web/docs/specs/2026-05-15-master-execution-plan.md` — the canonical plan.
7. `apps/web/docs/specs/2026-05-15-remaining-backend-work.md` — S4.9/S5.3/S5.8 deferred specs.

Audit artifacts (gitignored, on-disk only — DO NOT try to commit them):
- `audit/2026-05-18-parity-and-tutorials/` — agent reports (E/F/G/G-verify/G2-stub/DB-DD-verify), screenshots from every Playwright session.

---

## What this repo is

Next.js 16 App Router monorepo. Replaces:
- `Waltham-Data-Science/ndi-web-app-wds` (Pages Router marketing site)
- `Waltham-Data-Science/ndi-data-browser-v2` frontend (Vite SPA + React Router)

The FastAPI proxy in `Waltham-Data-Science/ndi-data-browser-v2/backend/`
continues to serve `/api/*` from Railway. This repo handles all routing,
rendering, and edge-cached delivery via Vercel.

## Migration status

**Phase 7 atomic domain swap SHIPPED 2026-05-11 at 00:00 EDT.** `https://ndi-cloud.com` now serves the unified monorepo. LOGIN GATE passed in incognito browser test; the 60-minute watch window closed clean. Post-cutover steady state: strict apex-only Origin allowlist at Vercel edge, `SESSION_ENCRYPTION_KEY` rotated on Railway, all 9 legacy camelCase auth-route redirects live, www → apex 308. Phase 8 (archiving legacy repos + dropping FastAPI static-files mount) waits for the 30-day burn-in window to close (~2026-06-10).

Phases that have landed (chronological, by lead PR):

- Phase 1 — Bootstrap (Next.js 15 + pnpm + CI hygiene)
- Phase 2 — Marketing site port (home, about, platform, security, products) + auth flows expanded (forgot-password, account-verification, reset-forgotten-password as explicit pages)
- Phase 3 — Catalog + dataset detail (Overview, Summary tables, Pivot stub, Document Explorer, Document Detail with dependency graph + AppearsElsewhere)
- Phase 4 — Auth contract: HttpOnly `Domain=.ndi-cloud.com` cookie + CSRF double-submit (no localStorage tokens)
- Phase 5 — Vercel Analytics + Speed Insights wiring; Edge middleware Origin enforcement on `/api/*` mutations
- Phase 6.5 — Data browser leaf component ports (PivotView, QueryBuilder, FacetPanel, DataPanel for binary blobs, ontology popovers)
- Phase 6.6 — REBUILD-8 chrome gate for document-detail drilldown (chrome hidden via `data-dataset-chrome` selectors + inline `<style>` pre-paint)
- Phase 6.7 A1–A11 — bundle ratchet, `generateMetadata` per-dataset titles, RSC prefetch, edge cache, ISR+SSG for top-20 datasets
- Phase 6.7 audit batches A–G (PRs #94–#100) — 24-finding frontend polish: instant route-shell paint, degraded-data UX, error/empty-state polish, auth-flow polish, nav consistency, narrow-width responsive, hygiene/a11y
- PR #101–#102 — dataset-detail 500 hotfix + bad-id 400 routing + tighter existence-check timeout
- PR #103 — `useLinkStatus` pending pill for catalog-card click feedback
- PR #104 — architectural fix: existence check moved layout→page so `loading.tsx` Suspense fires + `notFound()` resolves dataset-scoped `not-found.tsx`
- PR #105 — cache-poisoning hotfix: don't write `null` to TanStack Query cache when prefetch times out (caught during pre-cutover audit; tree-shrew dataset was rendering bare-id)
- PRs #147–155 — round-4 + round-5 team review polish (Steve's feedback): ontology Name-cell linkification, marketing copy without Crossref branding, dataset-DOI restructure with PMID/PMC pills, QuickPlot column-first redesign, SEO upgrades (Dataset JSON-LD, per-dataset sitemap), Griswold timeout bump, Cite modal copy + Download buttons, test-suite audit (+106 tests)
- PR #156 — Phase 7 cleanup: restore strict apex-only Origin allowlist (drop pre-cutover hardcode + env-var escape hatch), shipped immediately post-swap

### Current draft branch in flight — `feat/experimental-ask-chat` (PR #160)

**This branch is NOT on production.** It carries the experimental `/ask` chat + the workspace at `/my/workspace/[id]` + several Phase 8 polish items. It is paired with a separate Railway env (`ndb-v2-experimental`) running NDI-python integration Phase A. The branch-aware rewrite in `apps/web/next.config.ts` routes preview deploys of this branch to the experimental Railway env automatically.

**Key in-flight work (post-2026-05-15, 94% of master plan landed):**
- `/ask` chat with 17 tools (psth, fetch_signal, fetch_image, fetch_spike_summary, treatment_timeline, tabular_query, query_documents, walk_provenance, ndi_query, ndi_dataset_overview, get_document, aggregate_documents, lookup_ontology, list_published_datasets, get_dataset, get_dataset_summary, get_dataset_class_counts, get_facets, semantic_search_datasets). Architecture: ADR-001 keeps the heart on Railway; ADR-002 puts every handler in `lib/ndi/tools/`; ADR-003 forwards auth via the optional `ToolContext`. **AI SDK is now v6** (`ai@6 @ai-sdk/anthropic@3 @ai-sdk/react@3`).
- **NEW auth-gated `/my/ask`** route reusing the same `<AskShell>`. Anonymous → redirect to /login. `canUseAsk === false` → "feature not enabled for your org" notice. The legacy `/(marketing)/ask` route stays live during the transition.
- Workspace at `/my/workspace/[id]/...` with 7 panels (DatasetStructure, BehavioralCompare, TreatmentTimeline, SignalViewer, PSTH, SpikeActivity, ElectrodePosition). Each panel ports a chat tool's chart_payload contract into a per-dataset UI. **All 7 canonicalized to `<PanelCard>` chrome.**
- **Dataset Health:** invariants module at `lib/data-quality/invariants.ts` (6 invariants), nightly cron at `/api/cron/dataset-health` (07:23 UTC in vercel.json) writing to `dataset_health_violations` Postgres table, admin dashboard at `/admin/data-health`, catalog badge at `<DatasetHealthBadge>` on each `DatasetCard`.
- **Cost tracking:** `chat_usage_events` Postgres table; `lib/usage/rate-card.ts` + `lib/usage/log.ts` wired into `/api/ask:onFinish` + `:onError`. Anthropic counts captured; Voyage counts still TODO (see pre-compact handoff). Per-user / per-org / per-org_id rollups indexed.
- **Vercel KV rate limiting:** `lib/ai/rate-limit-kv.ts` — atomic INCR + EXPIRE via REST API, per-user keying for authenticated chat. Graceful in-memory fallback when KV isn't configured.
- **Per-org `enable_ask` gate:** `Settings.ENABLE_ASK_ORG_IDS` + `MeResponse.canUseAsk` on the backend; `canUseAskFor(req)` gate at `/api/ask` returns 403 `feature_not_enabled` early when the user's orgs aren't allowlisted (admins always pass; empty allowlist = open).
- HIPAA-aware compliance posture documented at `apps/web/docs/operations/hipaa-technical-safeguards.md` (control-by-control mapping) + `apps/web/docs/compliance/posture.md` (externalized for IRB / CISO) + `apps/web/docs/operations/audit-log-policy.md` (what IS / NEVER logged). The legacy `apps/web/COMPLIANCE.md` carries a header pointing to these docs.
- Architecture Decision Records at `apps/web/docs/architecture/decisions/001-008` covering heart-on-Railway, shared lib/ndi/, ToolContext, HttpOnly+CSRF, branch-aware preview, pgvector RAG (now **HNSW** post Stream 4.10), Vercel KV, and SYSTEM_PROMPT decomposition.
- pgvector index swapped IVFFlat → HNSW (Stream 4.10 migration at `apps/web/lib/ai/db/migrations/2026-05-15-hnsw.sql`). Expected ~30-80ms → ~5-15ms per `semantic_search_datasets`.
- **Pre-compact handoff doc**: `apps/web/docs/specs/2026-05-16-pre-compact-handoff.md` — the single source-of-truth status doc for the next session. Has the master-plan completion table, all 13 commits in this session arc, all findings + their disposition, user-side action items.
- Master execution plan at `apps/web/docs/specs/2026-05-15-master-execution-plan.md` — canonical reference; status reproduced in the handoff doc above.
- Security incident closed: 2026-05-13/14 leaked Voyage + Railway-Postgres credentials in a pre-compact doc, rotated + BFG-rewritten + force-pushed. Full timeline at `apps/web/docs/security/2026-05-14-leaked-credentials-resolved.md`. Rollback tag `gitleaks-pre-scrub-2026-05-15-rollback` retained until 2026-05-22 then deleted.

**Remaining backend work (deferred with specs)** at `apps/web/docs/specs/2026-05-15-remaining-backend-work.md`:
- S4.9 — port `aggregate-documents.ts` to FastAPI (ADR-001 Heart-on-Railway compliance). ~1 day.
- S5.3 — BehavioralCompare cross-table joins. ~1-2 days.
- S5.8 — `/tables/{class}` server-side pagination. ~1 day. ~95% egress saving.

These need live data access; deferred to a session that has it.

**Rules of engagement for any agent working on this branch (also documented in `apps/web/docs/specs/2026-05-15-master-execution-plan.md` §"Orientation"):**

| Repo | `main` | Draft branch |
|---|---|---|
| `ndi-cloud-app` | production (DO NOT push) | `feat/experimental-ask-chat` (this) |
| `ndi-data-browser-v2` | production (DO NOT push) | `feat/ndi-python-phase-a` |

- Production frontend URL: `https://ndi-cloud.com` (untouched)
- Preview frontend URL: `https://ndi-cloud-app-web-git-feat-experiment-c5da7d-ndi-cloud-a83eb4e7.vercel.app`
- Production backend: `https://ndb-v2-production.up.railway.app` (env id `e0c00fb7-ac98-431f-acdb-f4988032160f`)
- Experimental backend: `https://ndb-v2-experimental.up.railway.app` (env id `90101f6e-042b-44d6-8c8d-ec18d43b341b`)
- Test creds for Playwright smokes (workspace + chat): `audri+test@walthamdatascience.com / remhuz-ruwfy4-jiGcen` — Playwright form-fill ONLY, never write to disk, never echo in chat output.

Reference plans (read in this order if picking up the branch cold):
- **Pre-compact handoff (NEWEST — 2026-05-16):** `apps/web/docs/specs/2026-05-16-pre-compact-handoff.md` — the single source-of-truth status doc covering everything shipped, all findings, all user-side action items.
- **Master execution plan (2026-05-15):** `apps/web/docs/specs/2026-05-15-master-execution-plan.md` — the canonical plan; sub-stream IDs referenced everywhere.
- **Remaining backend work specs:** `apps/web/docs/specs/2026-05-15-remaining-backend-work.md` — S4.9 / S5.3 / S5.8 crisp specs.
- Architecture audit (macro): `apps/web/docs/architecture/2026-05-15-architecture-audit.md`
- Comprehensive bug audit (micro): `apps/web/docs/specs/2026-05-15-comprehensive-audit.md`
- Tutorial ground-truth (parity reference): `apps/web/docs/specs/2026-05-14-tutorial-ground-truth.md`
- HIPAA Technical Safeguards mapping: `apps/web/docs/operations/hipaa-technical-safeguards.md`
- Audit-log policy: `apps/web/docs/operations/audit-log-policy.md`
- Tenant-aware tools audit + retrofit plan: `apps/web/docs/operations/tenant-aware-tools-audit.md`
- Three surfaces (chat/workspace/eval): `apps/web/docs/operations/three-surfaces.md`
- Adding a workspace panel: `apps/web/docs/operations/adding-a-workspace-panel.md`
- Tutorial parity smoke: `apps/web/docs/operations/tutorial-parity-smoke.md`
- Compliance posture (externalized): `apps/web/docs/compliance/posture.md`
- Architecture decision records: `apps/web/docs/architecture/decisions/` (ADR-001 through ADR-008)
- Vendor dependencies inventory: `apps/web/docs/operations/vendor-dependencies.md`
- Disaster recovery runbook: `apps/web/docs/operations/disaster-recovery.md`
- Cost telemetry design (now implemented): `apps/web/docs/specs/2026-05-15-cost-telemetry-design.md`
- AI SDK v6 upgrade inventory (now executed): `apps/web/docs/specs/2026-05-15-ai-sdk-v6-upgrade-inventory.md`
- High-level: see Audri's plan file at `/Users/audribhowmick/.claude/plans/sharded-puzzling-dragonfly.md`
- Pre-cutover audit (this session): `/Users/audribhowmick/.claude/plans/atomic-sniffing-island.md`
- Architectural rationale: `ndi-data-browser-v2/docs/plans/cross-repo-unification-2026-04-24.md`
- v2 audit preserved: `ndi-data-browser-v2/docs/reviews/Audit_2026-04-23.md`
- Frontend polish audit: `apps/web/docs/reviews/Audit_2026-04-27_frontend_polish.md` (23/24 SHIPPED, 1 deferred-by-design as of `main` post-PR-#100)

## Stack

- **Framework:** Next.js 16.2.4 App Router (Turbopack), React 19
- **AI:** **AI SDK v6** (`ai@6 @ai-sdk/anthropic@3 @ai-sdk/react@3`); upgrade landed 2026-05-15. Streaming via `streamText` with `await convertToModelMessages()`. Tool handlers in `lib/ndi/tools/*` (one per file, ~14 total). Anthropic Sonnet 4.x as the chat model. Voyage `voyage-4-large` for embeddings + `voyage rerank-2.5` for hybrid retrieval. RAG store on pgvector (Railway Postgres, HNSW index).
- **Styling:** Tailwind v4 with `@theme` design tokens. NO SCSS Modules. NO MUI in `components/app/` (eslint enforced; MUI permitted only in `components/marketing/` for `<Menu>`/`<Modal>` where the a11y lift is real).
- **Data:** TanStack Query 5 (with PersistQueryClient layered on top in Phase 3a). Native `fetch()` via `apiFetch<T>()`. No axios. **Postgres (Railway)** via `pg` pool at `apps/web/lib/ai/db/pool.ts` — also serves `chunks` (RAG), `dataset_health_violations`, and `chat_usage_events`.
- **Rate limit:** Per-user via Vercel KV (`lib/ai/rate-limit-kv.ts`) with graceful in-memory fallback when KV isn't configured.
- **Cost tracking:** `lib/usage/{rate-card,log}.ts` writes one `chat_usage_events` row per /api/ask invocation. Anthropic rates pinned at module-level; Voyage rates likewise. Server-side computation of `total_cost_cents`.
- **Tests:** Vitest + Testing Library (jsdom) for unit (cloud-app, 1,612 tests); Playwright for E2E. pytest for ndb-v2 (893 tests).
- **Bundle gate:** `scripts/check-bundle-size.mjs` — marketing 80 KB gz, app 200 KB gz. Ratchets DOWN over time, never up.
- **Package manager:** pnpm 10.22 via Corepack.
- **pnpm-lock.yaml gotcha:** the lockfile lives at the repo root (NOT inside `apps/web/`). After ANY `pnpm add` / `pnpm remove`, you MUST `git add pnpm-lock.yaml` from the repo root (or `git add -A` from the repo root, NOT from `apps/web/`). Phase G + Phase H both shipped commits where the lockfile silently dropped because `git add -A apps/web` scoped to the wrong dir, and Vercel CI failed with `ERR_PNPM_OUTDATED_LOCKFILE`. Fixed in commit `61562ff` with a documented process note.

## Route groups

- `app/(marketing)/*` → `ndi-cloud.com` content (RSC-first, ISR where possible). Includes `/(marketing)/ask` (anonymous-capable chat during transition).
- `app/(app)/*` → former `app.ndi-cloud.com` content (mostly client; catalog is RSC + ISR). Includes:
  - `/my/workspace/[id]/...` — auth-gated workspace with 7 panels (Stream 6+)
  - `/my/ask` — auth-gated chat route (Stream 3.1, 2026-05-15)
  - `/admin/data-health` — admin Dataset Health dashboard (Stream 6.9)
- `app/api/cron/` — Vercel-scheduled crons (`warm-cache` every 5min; `dataset-health` 07:23 UTC daily).
- `app/api/admin/` — admin-authz read routes (currently `data-health`).
- `app/api/ask/` — anonymous-capable chat endpoint (gated by `askEnabled()` + `canUseAskFor(req)` for per-org access).
- `app/api/datasets/[id]/<tool>/` — workspace wrapper routes for psth, spike-summary, tabular-query, treatment-timeline (auth-forwarding via `toolContextFromRequest`).

`app.ndi-cloud.com` becomes a 301-to-apex redirect at Phase 7 cutover. Until then, both old domains keep serving production traffic from their respective old projects — this repo only deploys to Vercel preview URLs during Phases 1-6.

## Auth

HttpOnly `session` cookie set by FastAPI, scoped to `Domain=.ndi-cloud.com` (Phase 4). CSRF via double-submit `XSRF-TOKEN` cookie + echoed `X-XSRF-TOKEN` header. **No localStorage tokens** — Phase 2b rewrites the marketing-side auth flow that previously used localStorage Bearer tokens.

**Per-org `enable_ask` gate (Stream 3.4):** the backend's `MeResponse.canUseAsk` is true iff `is_admin` OR the user has at least one org in the FastAPI `Settings.ENABLE_ASK_ORG_IDS` allowlist (empty allowlist = open). The cloud-app's `/api/ask` route gates on this via `canUseAskFor(req)` and returns 403 `feature_not_enabled` early. The `/my/ask` page renders a "contact ops" notice when `canUseAsk === false`.

## Author rule (non-negotiable)

Every commit MUST be authored as `audriB <audri@walthamdatascience.com>`. Use `--author=` explicitly:

```bash
git commit --author="audriB <audri@walthamdatascience.com>" -m "..."
```

Vercel + Railway both gate deploys on this. The `.githooks/pre-push` hook verifies before push. CI also rejects PRs with non-conforming authors.

Activate the hook locally:
```bash
git config core.hooksPath .githooks
```

## CI gates (.github/workflows/ci.yml)

All must be green to merge:
1. **hygiene** — Finder duplicate-file rejection + PR commit author check
2. **lint** — `next lint`
3. **typecheck** — `tsc -b --noEmit`, strict mode
4. **unit** — vitest with coverage thresholds (35/27/34/37 floor; ratchets up)
5. **build** — `next build` + bundle-size budget enforcement
6. **e2e** — Playwright against the production-like `next start`
7. **security** — `pnpm audit --audit-level=moderate`

Skip-hook variants (`--no-verify`, `--no-gpg-sign`) are NOT permitted. If a hook fails, fix the underlying issue.

## What to do / not do

- ✅ Use `apiFetch<T>()` for all backend calls. It handles credentials, CSRF, error mapping.
- ✅ Use `next/dynamic({ ssr: false })` for component-level deferral of heavy below-the-fold widgets.
- ✅ Use `next/image` for any imagery — Vercel Image Optimization handles AVIF/WebP automatically.
- ✅ Read env via `lib/env.ts` (zod-validated). Never `process.env.X` directly outside that module.
- ❌ No `dark:*` Tailwind classes. The app forces `color-scheme: light`.
- ❌ No `@mui/*` imports in `components/app/` (eslint enforced).
- ❌ No `// @ts-ignore`, `eslint-disable`, or `# noqa` without an inline justification comment.
- ❌ No skipped/xfailed tests without an explanation comment.
- ❌ Never push direct to `main`. Every change goes through a feature branch + PR + CI green.
- ❌ Never bypass the author rule.

## Post-cutover operations

Phase 7 shipped 2026-05-11. The remaining post-cutover work is non-traffic-moving (code cleanup, archiving legacy repos, documentation). Specifically:

- The 30-day burn-in window expires ~2026-06-10. After that:
  - Archive `Waltham-Data-Science/ndi-web-app-wds` and `Waltham-Data-Science/ndi-data-browser-v2` (archive preserves history; not delete).
  - Drop the FastAPI static-files mount in `ndi-data-browser-v2/backend/app.py` so Railway becomes API-only.
  - Optionally delete the orphan `ndi-web-app-v2` Vercel project.
- CSP enforce flip (Report-Only → enforced) is deferred indefinitely. A prior attempt (PR #152, closed) broke under `script-src 'self'` because Next.js App Router emits inline streaming scripts (`self.__next_f.push(...)`). Re-attempting requires either `'unsafe-inline'` (security regression) or proper nonce wiring; not urgent — Report-Only logs violations without blocking, which is fine in steady state.
- `app.ndi-cloud.com` redirect-to-apex (CUTOVER.md step 4) was skipped because the subdomain has no DNS. Add a CNAME at Google Cloud DNS if legacy bookmark support is wanted; defer otherwise.

## Rollback (read this before any production-affecting change)

The full rollback procedure lives outside this repo at `~/Documents/ndi-projects/cutover-keys.md` (owner-only `chmod 600`). It contains the pre-rotation `SESSION_ENCRYPTION_KEY` for restoring decryptable sessions if a Vercel domain detach is ever needed. Move both keys to a vault after the 30-day burn-in.

Operational disaster-recovery runbooks (per failure mode, with RTO + RPO targets) live at `apps/web/docs/operations/disaster-recovery.md`. Five secret-rotation procedures (`SESSION_ENCRYPTION_KEY`, `CSRF_SIGNING_KEY`, `VOYAGE_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`) are documented there.

## Postgres migrations

Run order against the experimental Railway env (and later production). Idempotent — safe to re-run.

```bash
# /ask RAG store (already applied)
psql "$DATABASE_URL" -f apps/web/lib/ai/db/schema.sql

# Stream 4.10 — pgvector IVFFlat → HNSW
psql "$DATABASE_URL" -f apps/web/lib/ai/db/migrations/2026-05-15-hnsw.sql

# Stream 6.8 — Dataset Health
psql "$DATABASE_URL" -f apps/web/lib/ai/db/migrations/2026-05-15-dataset-health.sql

# Stream 3.2 — chat_usage_events
psql "$DATABASE_URL" -f apps/web/lib/ai/db/migrations/2026-05-15-chat-usage-events.sql
```

See `apps/web/lib/ai/db/migrations/README.md` for the operational guide.
