# Session handoff — 2026-05-18 audit + UI sweep

**Read this first** if you're the next session picking up the
`feat/experimental-ask-chat` branch cold. Everything else flows
from here.

**Drafting context:** this is the third major handoff in the
experimental-ask-chat arc. The first was `2026-05-16-pre-compact-handoff.md`,
the second was `2026-05-18-post-compaction-audit-plan.md`. This
one captures the second-half of 2026-05-18 — comprehensive audit
execution + UI sweep driven by live tutorial replays.

---

## TL;DR

1. **A massive root-cause bug shipped fixed**: every workspace POST
   route (`/api/datasets/[id]/tabular-query`, `/psth`,
   `/treatment-timeline`, `/spike-summary`) was silently going to
   Railway and getting 405 because Vercel's external rewrite at
   the default placement overrides dynamic local route handlers.
   Moved the rewrite to `fallback` bucket. Local handlers now win.
   **This was the single biggest blocker** — every workspace
   analysis panel was effectively broken pre-fix.

2. **Workspace pickers are now fully dynamic — zero hardcoding**.
   Every column the backend returns surfaces in the workspace
   (was 5/3/2/3 hardcoded). Type-aware smart cell renderer
   (CURIE / Mongo ID / ISO date / URL / number / array / object).
   Group-by available on every non-locked column.

3. **G-verify (live Playwright on Francesconi) — 3 of 4 tutorial
   tasks PASS**, including the flagship Saline-vs-CNO EPM violin
   matching MATLAB to 2 decimal places (5.864/5.087 vs the
   tutorial's 5.86/5.09).

4. **D-B pulse and D-D column resize confirmed working** —
   earlier "inconclusive" was a Playwright synthetic-event artifact.
   Bypass the artifact via direct `MouseEvent` constructors with
   `bubbles: true` for resize; URL pushState + MutationObserver
   for pulse.

5. **G2 Bhar and G3 Haley live replays deferred** — the test
   account got rate-limited (AUTH_RATE_LIMITED, persistent after
   5+ logins today). Both sessions should be re-run when the
   rate-limit decays (~1 hour wait) or with a fresh test
   account.

6. **Five backend tickets filed** — F-1, F-1b, F-1c, F-1d, F-1e —
   for projection / alias issues that need ndb-v2 PRs. Cloud-app
   has stopgaps where possible.

---

## Branch state

| Repo | Branch | HEAD |
|---|---|---|
| `ndi-cloud-app` | `feat/experimental-ask-chat` | `e200f97` (or later if you pulled since) |
| `ndi-data-browser-v2` | `feat/ndi-python-phase-a` | unchanged this session |

**Preview URLs:**
- Frontend alias: `https://ndi-cloud-app-web-git-feat-experiment-c5da7d-ndi-cloud-a83eb4e7.vercel.app`
- Backend: `https://ndb-v2-experimental.up.railway.app`

**Test creds (per CLAUDE.md):**
- `audri+test@walthamdatascience.com / remhuz-ruwfy4-jiGcen`
- **⚠️ Rate-limited as of session end.** Wait ~1 hour after the
  last login attempt OR request fresh creds from the user before
  trying again. The limit fires after ~5 logins in a sliding
  window per email.

---

## Today's commits (chronological)

| Commit | Title | What it did |
|---|---|---|
| `bd58e07` | Fix 20 bugs from 2026-05-18 comprehensive audit | First pass: 5 runtime bugs (B1-B5), 5 system-prompt bugs (C1-C5), 10 export bugs (A1-A14 dedup), 2 visual bugs (D-A scroll, D-C stale count) |
| `c90cb59` | Dynamic-column auto-discovery v1 | First attempt at dynamic columns; still had a `curated` arg with hardcoded 5 visible-by-default cols. User flagged: "no hardcoding at all." |
| `eeb3dd1` | Dynamic columns v2 — no curated, no hardcoding | Dropped curated cols entirely. Smart type-aware cell. Discovery from row keys when serverColumns absent. Apply to all 4 pickers (Subjects/Sessions/Probes/Stimuli). |
| `9bf13fa` | **Critical: route handlers bypassed by Vercel rewrite + UI sweep** | The 405 root-cause fix (`rewrite → fallback` bucket). + Topbar Ask removed, Snapshot probes fallback, Safari layout (lg→md + auto-fit grid), column-menu max-h+scroll+collision. |
| `750b759` | Wave 2 UI sweep | Chat panel grid layout (Safari scroll + close button reliability), tables H-scroll, user-facing tutorial doc. |
| `f3e5529` | F-1c + F-1d backend followups | Filed. |
| `e200f97` | G-verify followup: chat header truncate + F-1e | Fix B1 (long-title pushed close X off-screen) + F-1e for Bhar's treatment_drug/treatment_transfer not recognized by treatment_timeline backend. |

---

## Audit findings table

| ID | Title | Severity | Status | Disposition |
|---|---|---|---|---|
| **The big one — Vercel rewrite override** | 405 on every workspace POST | CRITICAL | ✅ FIXED (`9bf13fa`) | `apiRewriteFor → fallback` bucket |
| B3 (runtime) | get_dataset_class_counts read `counts` not `classCounts` | HIGH (LLM-facing) | ✅ FIXED (`bd58e07`) | |
| B4 (runtime) | walk_provenance `?depth=` instead of `?max_depth=` | HIGH | ✅ FIXED (`bd58e07`) | |
| B1 (runtime) | tables/[className] proxy stripped pagination | HIGH | ✅ FIXED (`bd58e07`) | |
| B2 (runtime) | useImageStackParameters pageSize=500 > backend cap 200 | CRITICAL latent | ✅ FIXED (`bd58e07`) | |
| B5 (runtime) | list_published_datasets `&q=` ignored by backend | HIGH (LLM-facing) | ✅ FIXED (`bd58e07`) | Replaced with client-side substring filter |
| C1-C5 (schema) | thumbnail class, walk_provenance direction, lookup_ontology examples, aggregate_documents examples, ndi-query examples | MEDIUM (LLM-facing) | ✅ FIXED (`bd58e07`) | |
| A1-A14 (export) | Python downloadDataset target_folder, MATLAB return shape, ndiquery arg shape, ask-prefill invented names, cli-parity.md inventions, openbinarydoc, etc. | HIGH/MED (user-facing) | ✅ FIXED (`bd58e07`) | cli-parity.md whole-doc rewrite |
| D-A (visual) | Scroll position reset on row click | HIGH (user-flagged) | ✅ FIXED (`bd58e07`) | `{ scroll: false }` on every router.replace |
| D-C (visual) | "Showing X of Y" header stale after column filter | MEDIUM | ✅ FIXED (`bd58e07`) | onFilteredRowsChange callback |
| Curated columns hardcoded | Workspace showed 5/3/2/3 cols vs backend's 28+ | HIGH (user-flagged) | ✅ FIXED (`eeb3dd1`) | Full dynamic columns helper |
| 405 BehavioralCompare | Wave 1 unblocked | CRITICAL | ✅ FIXED (`9bf13fa`) + verified G-verify Task C |
| Safari layout | Analysis panels stacking vertically on Safari | HIGH (user-flagged) | ✅ FIXED (`9bf13fa`) | lg→md + auto-fit grid |
| Snapshot PROBES 0 lie | Francesconi shows 0 despite 606 elements + 3 probe types | MEDIUM (user-flagged) | ✅ FIXED (`9bf13fa`) | cloud-app fallback (backend F-1c) |
| Ask in topbar | User asked to remove | LOW (user-flagged) | ✅ FIXED (`9bf13fa`) | Dropped ASK_ENABLED conditional |
| Column-toggle menu cutoff | Long col list overflowed viewport | MEDIUM (user-flagged) | ✅ FIXED (`9bf13fa`) | max-h-[60vh] + collisionPadding |
| Chat panel close/scroll | "no close/expand button visible" on Safari | HIGH (user-flagged) | ✅ FIXED (`750b759` + `e200f97`) | grid layout + `flex-1` on title block |
| Table H-scroll | Hidden when 28+ cols | MEDIUM | ✅ FIXED (`750b759`) | minWidth on virtualizer inner div |
| D-B pulse animation | "Doesn't fire" earlier | NON-BUG | ✅ CONFIRMED WORKING (D-B/D-D agent) | Playwright synthetic-event artifact |
| D-D column resize | "Doesn't work" earlier | NON-BUG | ✅ CONFIRMED WORKING (D-B/D-D agent) | TanStack uses onMouseDown not onPointer |
| B1 chat close off-screen | Long dataset title pushed X off-screen | MEDIUM | ✅ FIXED (`e200f97`) | Added flex-1 + truncate to title block |
| Bhar treatment timeline empty | Backend doesn't recognize `treatment_drug`/`treatment_transfer` | OPEN | 📋 F-1e filed | Needs ndb-v2 PR |
| Francesconi 0 epochs | Uses legacy `epochfiles_ingested` class | OPEN | 📋 F-1d filed | Needs ndb-v2 PR |
| Treatment-broadcast columns missing | Sophie/Francesconi's Treatment_*/Optogenetic_* cols only via public table-shell pivot | OPEN | 📋 F-1b filed | Needs ndb-v2 PR |

---

## What's verified live (Francesconi, via G-verify)

| Task | Expected | Observed | Result |
|---|---|---|---|
| A — Bhar subject count | 5,314 / ≥11 cols | 5,314 / 15 cols | ✅ PASS |
| B — Francesconi AVP-Cre filter | 49 of 215 | exact match | ✅ PASS |
| C — Saline vs CNO EPM violin | n=22/23, mean 5.86/5.09 | n=22/23, mean **5.864/5.087** | ✅ PASS (2-decimal parity) |
| D — Bhar treatment timeline | ~11 Gantt bars | empty state | ❌ FAIL (F-1e backend) |

**UX checks:** Topbar no Ask ✅. Chat panel close button visible (post-`e200f97`) ✅. Analyses side-by-side at 1280px ✅. Snapshot Probes ≥ 0 ✅ (Francesconi shows 606).

Screenshots: `audit/2026-05-18-parity-and-tutorials/verification/`.

---

## What's deferred (couldn't complete this session)

### G2 Bhar live replay

Ran ~5 minutes before the test account got `AUTH_RATE_LIMITED`. Killed
the agent at retry #3 to save tokens. Bhar's 12 tutorial analyses
(B1-B12, of which 7 are doable, 4 partial, 1 not doable) need a
fresh login window. Re-dispatch using the same prompt as last time —
file lives in this session's transcript or just reconstruct from
`apps/web/audit/2026-05-18-parity-and-tutorials/agent-F-tutorial-analytics.md`
§ Bhar.

### G3 Haley live replay

Not dispatched (would hit same rate-limit). Same plan: 19 analyses
(H1-H19), 8 doable, 7 partial, 2 not-doable (H11/H12 = XY trajectory
+ video, known gap requiring new `BehavioralTrack` panel).

**Reactivation criteria for G2/G3:**
- Wait ~1 hour after the last login attempt (verified empirically),
  OR
- Request fresh test creds from the user.

---

## What's left, grouped by owner

### 🟥 Backend tickets (ndb-v2 PRs needed)

All filed in `apps/web/docs/specs/2026-05-18-backend-followups.md`.
Cloud-app has stopgaps where possible.

| ID | Title |
|---|---|
| F-1 | Backend projection for `stimulus_presentation` (StimuliPicker on useDocuments+200-cap) |
| F-1b | Treatment-broadcast cols pivot into summary_table_service |
| F-1c | Snapshot `counts.probes` alias `probe → element` |
| F-1d | Legacy epoch classes alias `element_epoch → [epochfiles_ingested, daqreader_*_ingested]` |
| F-1e | **G-verify follow-up** — treatment_timeline backend recognize `treatment_drug`/`treatment_transfer` |
| F-2 | `?subject=` filter on /tables/element_epoch |
| F-3 | Optional `?direction=downstream` on /dependencies |
| F-4 | Stable query keys + dedup on panel mutations |
| F-5 | ADR-009 documenting "Railway list endpoints return bulk-fetch shape" |
| F-6 | Verify 0-count regressions post-deploy |
| F-7 | aggregate_documents uses bulk_fetch for hydration |
| F-8 | Unify tabular_query POST/GET wrapper |

### 🟦 NDI SDK upstream asks

| ID | Title |
|---|---|
| S-1 | `walkDependencies()` SDK helper (Python + MATLAB) |
| S-2 | `tableFromDocuments()` helper |
| S-3 | Server-side text search on /datasets/published |
| S-4 | Python downloadDataset interactive default for target_folder |

### 🟨 New cloud-app capabilities (need new code)

Surfaced by Agent F's 45-analysis enumeration:

| Item | Triggering tutorial | Effort |
|---|---|---|
| BehavioralTrack panel — XY trajectory over arena image, color-by-time | Haley H11/H12 | Medium |
| Patch-clamp step-family view — NaN-gap segmentation, reshape (t × step) | Francesconi D8 | Medium |
| Cross-table joins UI | S5.3 (many tutorials) | Large |
| Derived/computed columns on tabular_query (pivot + math) | Francesconi D13 | Medium |
| Video playback | Bhar B10, Haley H12 | Medium |
| Multi-column timeseries with time-coloring | Haley H11/H14 | Small once SignalViewer accepts `color_by` |
| Binary domain-format viewers (SnapGene `.dna`, LC-MS `.xlsx`) | Bhar B12 | DEFER — open externally |

### 🟪 Visual / UX polish

| Item | Status |
|---|---|
| "Tools along boundaries" canvas redesign | Design exploration deferred — user hinted at it |
| Card gap consistency audit across pickers | Pending — visual sweep |
| Mobile responsive checks | Untested this session |
| Header table horizontal-scroll alignment with body H-scroll | Open — header doesn't currently track body's H-scroll position when 28+ cols |

### 🟩 Verification owed

| Item | When |
|---|---|
| G2 Bhar live replay | After rate-limit clears (~1 hour) |
| G3 Haley live replay | After G2 lands |
| Manual: Safari Tasks A-D on a real Safari browser | When the user gets to it |
| Verify post-Wave-1+2 deploy from a fresh laptop / different network | Optional |

---

## Where to read first (priority order)

1. **This doc** — orientation
2. `apps/web/docs/reviews/2026-05-18-comprehensive-audit-findings.md` — detailed audit synthesis (from earlier in this arc)
3. `apps/web/docs/operations/workspace-tutorial.md` — the user-facing tutorial we wrote; use it to drive G2/G3 + manual smoke
4. `apps/web/docs/specs/2026-05-18-backend-followups.md` — the 11 backend tickets + 4 SDK asks
5. `audit/2026-05-18-parity-and-tutorials/` — all agent reports + screenshots (the audit dir is git-ignored but the screenshots/reports persist on disk)
   - `agent-E-data-parity.md` — Agent E (data parity audit)
   - `agent-F-tutorial-analytics.md` — Agent F (45 analyses enumerated)
   - `agent-G-verify.md` — Live verification, 3/4 PASS
   - `agent-DB-DD-verify.md` — D-B pulse + D-D resize confirmed working

---

## CLAUDE.md auto-pointer

Updating `CLAUDE.md` (this commit) to point the next session at this
handoff doc as the FIRST thing to read, replacing the prior
2026-05-18-post-compaction-audit-plan.md pointer.

---

## Operational notes

- **`pnpm-lock.yaml` gotcha** still applies — lockfile lives at repo
  root, not in `apps/web/`. After ANY `pnpm add/remove`, `git add`
  the lockfile from the repo root.
- **Author rule** — every commit must be authored as
  `audriB <audri@walthamdatascience.com>` — use `--author=` explicitly
  on every commit. The user's pre-push hook checks this.
- **CI gates** — typecheck/lint/test all green at session end:
  1,986/1,986 tests pass.
- **Vercel** — preview redeploys on every push. Wait ~50-60s after
  push before testing. Latest deploy at session end:
  commit `e200f97`. Re-verify with `vercel list | head -7`.
- **Test account rate-limit** — recovery time ~1 hour. Don't burn
  the account with new login attempts until then.

---

## Things the user explicitly asked for that are DONE

- ✅ Side-by-side broken on Safari → fixed
- ✅ Column-toggle menu cut off → fixed
- ✅ Tables horizontal scroll → fixed
- ✅ Chat panel close button + scroll → fixed
- ✅ Ask in topbar removed
- ✅ User-facing tutorial → written + verified
- ✅ Run analyses live and prove they work → 3/4 Francesconi PASS with 2-decimal parity on the flagship violin

## Things the user explicitly asked for that need more work

- ⏳ "Tools along boundaries" canvas redesign — explored conceptually; needs a design session before code
- ⏳ Bhar + Haley replays — deferred to next session (rate-limit)
- ⏳ Manual Safari verification on a real user device

---

## Recommended first actions next session

1. Read this handoff
2. Pull the branch, confirm HEAD matches what's documented
3. Check Vercel status — confirm latest deploy is Ready
4. If user is around: ask whether they want G2/G3 today or want a
   different priority
5. If proceeding with G2/G3: wait for rate-limit decay (or use
   fresh creds) → re-dispatch the same agents
6. After verification: knock down the backend tickets in priority
   order (F-1d/F-1e first since they block specific tutorial tasks)
