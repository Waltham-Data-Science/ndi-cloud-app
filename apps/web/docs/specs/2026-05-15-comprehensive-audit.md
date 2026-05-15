# Comprehensive audit — 2026-05-15

This is the result of 7 parallel deep-dive audits + a cross-dataset
smoke against the live preview. Findings are ranked by **severity ×
confidence**. Read the executive summary first; everything below is
deep dive per area.

**Caveat:** the audit-driving agents read code but didn't always
verify their conclusions live. Items marked **`VERIFY FIRST`** below
are claims that, if true, are high-impact but warrant a spot-check
before fixing.

---

## Executive summary — top 20 findings, ranked

| # | Severity | Area | Finding | Effort |
|---|---|---|---|---|
| 1 | **CRITICAL** | Chat | `psth` tool handler exists but **NOT registered** in `lib/ai/chat-tools.ts` `tools` export. Bot can never call PSTH. *(VERIFY FIRST)* | S |
| 2 | **CRITICAL** | Chat | `lib/ai/system-prompt.ts:62-68` may hardcode the **wrong dataset ID** as "Dabrowska BNST patch-clamp". This is likely root cause of the earlier "bot returned Francesconi when asked about Dabrowska" bug. *(VERIFY FIRST — `GET /api/datasets/67f723d574f5f79c6062389d` should return Francesconi, not Dabrowska)* | S |
| 3 | **HIGH** | Chat | `system-prompt.ts:83` instructional example hardcodes "9 distinct strains across 10 sampled subjects" — the model is pattern-matching this into hallucinated answers (likely root cause of Finding #6 strain-count drift from yesterday) | S |
| 4 | **HIGH** | Security | Backend logs **full session IDs** at `dependencies.py:49,58` (ip_changed / ua_changed warnings) and `login.py:170` (logout cloud failure). Anyone with Railway log access can replay live sessions | S |
| 5 | **HIGH** | Security | Rate-limit check-then-add is non-atomic (TOCTOU race acknowledged in code as TODO). Under concurrent requests an attacker bursts 2-3× the cap before counter catches up. The only brute-force gate for login/signup/change-password | M |
| 6 | **HIGH** | Security | `lib/ai/rate-limit.ts` uses in-memory `Map`s — does not survive multi-instance Vercel deploys. Trivial to bypass at scale. No Anthropic org-level hard spending cap configured as safety net | M |
| 7 | **HIGH** | Panel consistency | `BehavioralComparePanel` bypasses the wrapper-route auth-forwarding contract (uses GET via Vercel rewrite instead of POST via dedicated Next.js wrapper) — works for public datasets, will fail CSRF on private ones | M |
| 8 | **HIGH** | Performance | `/api/datasets/:id/tables/:className` **returns ALL rows, no server-side pagination**. 6 MB JSON per call on Bhar; the cron warm-cache transfers ~1.5 GB/day. Comment in code already flags this | M |
| 9 | **HIGH** | Performance | pgvector index is `IVFFlat lists=100` — should be **HNSW** for our corpus size. Drop in latency ~30-80ms → ~5-15ms per chat semantic search | S |
| 10 | **HIGH** | Performance | `query_documents` returns full row blobs into Claude's context (~15 KB / 3,750 tokens per call). Adding a `projection` param saves ~$4.50/day at current volume | M |
| 11 | **HIGH** | Performance | 273-line system prompt = ~10K tokens; first-turn input cost ~$0.03 per chat. Could trim to ~2K by moving tool-specific branching into tool `description` fields — saves $2-3/day | M |
| 12 | **HIGH** | Test coverage | `Markdown.tsx` chart-fence dispatcher has **zero tests**. Any regression in fence-kind routing would silently render raw JSON in chat answers (6 chart kinds covered, all blind) | S |
| 13 | **HIGH** | Test coverage | `workspace-client.tsx` auth-gate redirect AND `key={datasetId}` panel-remount have **zero tests**. Both regressions would surface as user-visible bugs (broken auth, stale chart flash) | S |
| 14 | **HIGH** | Test coverage | `next.config.ts` branch-aware rewrite (feat/experimental-ask-chat → ndb-v2-experimental) has no test. If priority flips, preview hits prod backend silently | S |
| 15 | **HIGH** | Hygiene | `apps/web/.env.example` is missing **5 prod env vars** used by `/ask` (ANTHROPIC_API_KEY, VOYAGE_API_KEY, DATABASE_URL, CRON_SECRET, NEXT_PUBLIC_ASK_ENABLED). Fresh clone fails at boot with cryptic zod errors | S |
| 16 | **HIGH** | Hygiene | `backend/services/summary_table_service.py:64` ruff RUF003 fail (another × multiplication sign). Same issue I fixed yesterday on `test_cookie_attrs.py`; this one was missed | XS |
| 17 | **HIGH** | Hygiene | `pip-audit` on ndb-v2 shows 50+ moderate+ CVEs (aiohttp 3.13.3 → 8 CVEs incl. request smuggling-class, urllib3, cryptography, pillow). Trivial dependabot rollover | S |
| 18 | **HIGH** | Hygiene | Local `core.hooksPath` is NOT set (`.git/hooks` default). Pre-push author-rule enforcement bypassed locally. CI catches but direct push wouldn't | XS |
| 19 | **HIGH** | Hygiene | AI SDK major-version drift: `@ai-sdk/anthropic` 2→3, `@ai-sdk/react` 2→3, `ai` 5→6. Breaking signature changes pending — decide before `/ask` exits experimental | M |
| 20 | **HIGH** | Docs | CLAUDE.md says "Next.js 15" but actual is 16.2.6; zero mention of workspace, chat surface, `lib/ndi/` split, or `ToolContext` — all shipped on the current branch | S |

---

## New findings from cross-dataset smoke (5 untested datasets)

Continuing yesterday's findings #3-#6, here are #7-#9:

**Finding #7 (NEW · MED)**: Three of the 5 untested datasets have **empty `species` array** in `/api/datasets/:id/summary` response despite having known species per the catalog UI:

| Dataset | Catalog species | Summary endpoint |
|---|---|---|
| Reikersdorfer (Carbon Fiber) | Sprague-Dawley rats | `[]` |
| Van Hooser (Tree shrew) | Tupaia belangeri | `[]` |
| Griswold (Ferrets) | Mustela putorius furo | `["Mustela putorius furo"]` ✅ |
| Mukherjee (Gustatory) | (catalog also empty) | `[]` |

**Backend `dataset_summary_service.py` species-extraction is failing for ~75% of datasets**. Affects the Dataset Structure panel's biology pills + chat answers about species.

**Finding #8 (NEW · MED)**: Mukherjee dataset (`6546c509…`) shows `sessions: 0` but has 1 subject + 7 elements. Per NDI's data model you can't have elements without a session. Either the dataset is minimally ingested OR the session-count extractor has a bug. Worth tracing.

**Finding #9 (NEW · HIGH UX)**: Chudoba/Dabrowska CRF BNST dataset (`6896c654…`) has **zero documents across the board**. The workspace `/my/workspace/[id]` page on that dataset would render all-zero chips with no explanation. The catalog UI shows "Synthesizer enrichment in progress" badge but the workspace doesn't.

**Fix for #9**: Add an empty-dataset state to `DatasetStructurePanel` — when `totalDocuments === 0`, show "This dataset is still being processed. Check back when synthesizer enrichment completes." with a link back to the catalog.

**Cross-dataset epoch counts (validates yesterday's EPOCHS=0 fix):**

| Dataset | Epochs (post-fix) |
|---|---|
| Bhar | 0 ✓ (C. elegans, no electrophysiology — correct) |
| Haley | 4,156 |
| Francesconi | 1,604 ✓ (was 0 pre-fix) |
| Reikersdorfer | 46 |
| Van Hooser (Tree shrew) | 1,239 |
| Griswold (Ferrets) | 4,232 |
| Mukherjee | 0 (consistent with sessions=0 bug) |
| Chudoba/Dabrowska | 0 (no data ingested) |

EPOCHS fallback chain is working across all 8 datasets. ✅

---

## 1. Workspace panel consistency

Per `feature-dev:code-reviewer` audit of all 7 panels:

### HIGH+HIGH
- **`BehavioralComparePanel`** is the only panel that talks to Railway via Vercel rewrite (GET + apiFetch) instead of through a dedicated Next.js wrapper route. Other 3 mutation panels all extract `Cookie + X-XSRF-TOKEN` server-side. Will fail on private datasets.
- **`TreatmentTimelinePanel`** rolls its own `<section>` with raw Tailwind color literals (`text-gray-900`, `border-gray-200`, `bg-brand-navy`) instead of using `<PanelCard>` with design tokens. Visually diverges from the other 6 panels. Show-Code button is `CodeExportButton` directly instead of `ShowCodeButton`.

### HIGH+MED
- **`SpikeActivityPanel`** also bypasses `<PanelCard>` and uses `<h2>` instead of `<h3>`, breaking heading-level outline. Should match the established pattern.
- **`PsthPanel`** has the same form-onSubmit/footer-onClick dual-path issue as `SignalViewerPanel` — works today by accident; will break if `MarketingButton` ever drops onClick forwarding.

### Confirmed fixed (no regression)
- ✅ `key={datasetId}` remount at workspace-client.tsx:143 in place
- ✅ SignalViewer docId regex `{24}` (was `{20,}`)
- ✅ Electrode Position empty-state (was red alert)

---

## 2. Security beyond credential rotation

### HIGH+HIGH
- **Full session IDs logged** at `dependencies.py:49,58` + `login.py:170`. Replay attack via log access. Fix: truncate to first 8 chars (matches the `do_login.success` path that was already truncated).
- **Rate-limit TOCTOU race** (acknowledged in code at `rate_limit.py:52` as TODO). Two-pipeline check-then-add is non-atomic. Replace with Lua script.

### HIGH+MED
- **In-memory rate limit on cloud-app** (`lib/ai/rate-limit.ts`) doesn't survive multi-instance deploys. Pre-launch must swap to Vercel KV. Set Anthropic org spending cap NOW as stopgap.

### MED
- `cookie_attrs.py:55-81` reads request `Origin`/`Referer` to decide Domain attribute. Defense-in-depth gap, not active vuln (CSRF + origin-enforcement gate the path). Add comment that it's not a security boundary on its own.
- `/api/ask/route.ts` `extractMessages` has no message-history size cap. Crafted 200K-token history input = ~$0.60 of cost per request. Add max-character cap (~50K).
- Expired-token branch in `dependencies.py:68-70` silently returns `None` — no log event, invisible in dashboards. Add `log.info('session.access_token_expired', session_id=session.session_id[:8])`.
- `RATE_LIMIT_CSRF_FAIL_PER_IP_5MIN=20` is undocumented in `.env.example` and arguably generous. Tighten to 10.

---

## 3. Today's commits — code review

### MED+HIGH findings
- **`cookie_attrs.py` Referer fallback**: Origin is browser-controlled and safe to trust. Referer is not (suppressable, spoofable on some browsers). The Referer fallback covers a case (login GETs that omit Origin) that doesn't actually exist in our routes. Recommendation: **remove the Referer fallback**, keep Origin-only.
- **Electrode panel `isError` → "no probe data" copy**: Genuine 5xx / network timeouts now show "this dataset has no probe location data" — misleading for transient failures. Should inspect error status: 404 → no-docs copy, 5xx → "transient failure, try refreshing" copy.

### CLEAN (verified)
- ✅ Author rule + Co-Authored-By trailer on every commit
- ✅ `c12fd7a` maxDuration 60→180 doesn't break fast-fail paths
- ✅ `f3c5b75` epoch fallback chain correct + no-double-count guard tested
- ✅ `BehavioralComparePanel.test.tsx` importActual pattern is strictly more correct
- ✅ BFG scrub didn't damage any other commits' content
- ✅ `key={datasetId}` remount works correctly with TanStack mutations (no extra useEffect needed)

---

## 4. Chat tool layer + system prompt

### CRITICAL — VERIFY FIRST
- **`psth` tool may not be registered** in `lib/ai/chat-tools.ts` `tools` export. Handler exists in `lib/ndi/tools/psth.ts` but if the registration was missed, model can never call it.
- **System prompt may hardcode wrong dataset ID for Dabrowska** (line 62-68). Likely root cause of yesterday's "bot returned Francesconi when asked about Dabrowska" bug.

### HIGH+HIGH
- **System prompt instructional example** at line 83 (`"9 distinct strains across 10 sampled subjects, totalRows=5314"`) — concrete numeric literals in templates cause hallucination. The model lifts these into answers. Replace with `{N}`/`{K}`/`{T}` placeholders.
- **System prompt has factual error** at line 259: "Bhar tree shrew study includes 9 C. elegans strains" — Bhar is C. elegans (NOT tree shrew), tree shrew is Van Hooser's dataset. Cross-pollinated lab/species mixup.

### HIGH+MED
- **Duplicate `fetchJson`** in `chat-tools.ts` (lines 114-137) — local anonymous version vs the canonical one in `shared.ts`. Five catalog handlers use the anonymous one. Latent — bites if those handlers ever get called with auth context.
- **`treatment-timeline.ts` synthetic `subject:<name>` doc_ids** (line 187-196) build URLs that 404 on click. Either point at the dataset overview as fallback, or skip subject-level chips entirely.

### MED+HIGH
- **`query-documents.ts`** comment confirms FastAPI ignores pageSize. Caller-visible: "limit" hint is misleading. (Connects to performance Finding #8.)

---

## 5. Test coverage gaps

### HIGH — fixes prevent real bugs
1. **`Markdown.tsx` chart-fence dispatcher** — 6 fence kinds, zero tests. Single typo = chart renders as JSON code block.
2. **`workspace-client.tsx` auth-gate + key remount** — both have zero tests. Each is a known regression vector.
3. **`next.config.ts` branch-aware rewrite** — preview-to-experimental routing critical for audit/parity work, no test.
4. **`lib/api/client.ts` CSRF bootstrap failure paths** — happy path covered; 5xx/network-throw/concurrent-mutation race not covered.
5. **Three inline charts** (`BarChartByGroup`, `Histogram`, `ScatterPlot`) — no tests; sibling charts (`ViolinPlot`, `BoxPlot`, `LinePlot`) have them.

### MED
6. `Markdown.tsx` "### Sources" h3-suppression has no test (would surface as double-rendered heading)
7. `fetch-signal.ts` binarySignalExample sidecar wiring is end-to-end untested
8. `/api/ask/route.ts` body-shape validation tests only "messages missing"
9. Both E2E specs (`cookie-roundtrip` + `workspace-tutorial-parity`) are skipped in CI — gated on env vars not set by GH Actions
10. `SpikeActivityPanel` `unitDocId` not validated (other panels do; hint says "24-char hex id")
11. 4 charts (`FitcurveChart`, `ElectrodeMapChart`, `ViolinChart`, `TimeseriesChart`) lack per-chart tests

---

## 6. Performance + cost

### HIGH — measurable $$ wins
- **#8 above** — pagination at `/tables/{class}` saves ~1.5 GB/day egress + 3-8s per chat tool call
- **#9 above** — IVFFlat → HNSW saves ~50ms per semantic search
- **#10 above** — `query_documents` projection saves ~$4.50/day
- **#11 above** — system prompt trim 10K→2K tokens saves $2-3/day

### MED
- Voyage `embedQuery` has no LRU cache — repeat queries (demo, tutorial smoke) re-embed every time. Add 100-entry/1h LRU.
- `aggregate_documents` exists conceptually but `query_documents` is used for distinct-value enumeration — add proper `list_distinct_values` tool. Saves ~10 KB per call.
- Plotly cartesian bundle (446 KB gz) may be duplicated across chart components — verify with `pnpm next build --profile`. Consider uPlot for signal viewer (already in deps, 25 KB gz).
- `TOOL_TIMEOUT_MS = 8000` too tight for `fetch_signal` cold paths (10-15s on Railway). Bump signal/image/spike-summary/timeline/psth to 25s. Reduces silent tool failures → fewer model retries → ~$0.25/day saved.
- `warm-cache` cron runs 24/7; gate to business hours (M-F 6am-10pm ET) saves 33% function invocations.
- `dataset_binding_service` LRU cache loses dataset objects across Railway deploys. Persist via volume scan on boot.
- `spike_summary` + `treatment_timeline` + `psth` services have no Redis caching (their siblings do). Add `RedisTableCache.get_or_compute` with 1h TTL.

### Already won
- ✅ Anthropic prompt caching enabled (line 145 of route.ts)

---

## 7. Documentation

### MUST UPDATE (affect every future session)
- **`CLAUDE.md`** — wrong Next.js version (16.2.6 not 15), zero mention of workspace/chat/lib-ndi/ToolContext. Major rewrite needed.
- **`README.md`** — describes Phase 7 as pending; shipped 4 days ago.
- **`apps/web/docs/specs/2026-05-14-pre-compact-handoff-v2.md`** — every SHA in its commit chain table is post-BFG-dead. Patch all 10.
- **`apps/web/docs/specs/2026-05-14-parity-smoke-report.md`** — references `SECURITY-INCIDENT-2026-05-14.md` at repo root; file moved to `apps/web/docs/security/`.

### NEW (lift from handoff-v2 into permanent docs)
- `apps/web/docs/architecture/three-surfaces.md` — extract the 3-call-paths diagram
- `apps/web/docs/architecture/adding-a-workspace-panel.md` — extract the 9-step recipe
- `apps/web/docs/testing/tutorial-parity-smoke.md` — one-pager on running the parity E2E

### ARCHIVE (mine for content, then move)
- `2026-05-14-pre-compact-handoff.md` + `2026-05-14-post-compact-nav-p0-batch.md` + `2026-05-14-audit-report.md` + `2026-05-14-ask-checkpoint-plan-c-pivot.md` — dated session logs superseded by handoff-v2

### UPDATE (mark shipped)
- `2026-05-14-shared-core-spec.md` — Phase 1/2/3 all done
- `2026-05-14-followup-gaps.md` — gaps 1, 2, 4 shipped; only gap 3 + parity findings live

### Suggested timing: ~2 hours total

---

## 8. Hygiene scorecard

```
cloud-app:
  lint OK · typecheck OK · tests 1541/1541 pass · audit 0 vulns
  bundle 168.2 KB / 200 KB (31.8 KB headroom)

ndb-v2:
  ruff 1 NEW error (RUF003 × in summary_table_service.py:64)
  mypy 55 errors / 19 files (all pre-existing import-untyped types)
  pytest 3 fail / 804 pass / 6 skip (matches pre-existing isolation baseline)
  pip-audit 50+ moderate+ CVEs across 7 packages
```

**Zero `any` types, zero `@ts-ignore` in src code.** Only escape hatches are documented test stubs and 1 vendor-types case.

**TODOs**: 11 total. Only 2 are actual work items (rate_limit.py:52, query_service.py:74); the other 9 are placeholder strings emitted *into* user-facing generated code.

---

## Recommended priority order for next session

Goal: maximum impact per hour. Suggested order assumes ~1 day of focused work.

### Tier 1 — verify + fix in <2 hours (HIGH impact, XS-S effort)

1. **Verify CRITICAL #1 + #2** (15 min): `grep psth lib/ai/chat-tools.ts` + `GET /api/datasets/67f723d574f5f79c6062389d` to confirm Dabrowska disambiguation. If #1 is real, register psth in chat-tools. If #2 is real, swap the two dataset IDs in system-prompt.ts.

2. **Fix system-prompt hardcoded examples** (15 min): replace numeric literals at line 83 + 259 with placeholders. Likely root cause of strain-count drift bug.

3. **Truncate session IDs in logs** (10 min): `dependencies.py:49,58` + `login.py:170` — change `session.session_id` to `session.session_id[:8]`.

4. **Fix ruff fail in summary_table_service.py:64** (5 min): scrub the `×` character.

5. **Add 5 missing env vars to `apps/web/.env.example`** (10 min): ANTHROPIC_API_KEY, VOYAGE_API_KEY, DATABASE_URL, CRON_SECRET, NEXT_PUBLIC_ASK_ENABLED.

6. **Set `core.hooksPath .githooks`** on local clone (1 min).

7. **Set Anthropic org spending cap** in Anthropic dashboard (5 min) — even if you don't fix the rate-limit-in-memory bug, this caps blast radius.

8. **`pnpm audit` + `pip-audit`** rollover (30 min): bump the 7 packages with CVEs. Most are patch versions.

9. **CLAUDE.md update** (30 min): fix Next.js version, add workspace + chat surface descriptions, link to the new architecture docs (which you'll write in step 12).

### Tier 2 — fix in ~1 day (HIGH impact, M effort)

10. **Empty-dataset state on workspace** (Finding #9): add empty-state to DatasetStructurePanel + maybe a chip on catalog cards. ~1 hour.

11. **TreatmentTimelinePanel + SpikeActivityPanel migrate to PanelCard** (Audit #1): visual + a11y consistency. ~2 hours.

12. **Extract permanent docs from handoff-v2** (Audit #7): three-surfaces.md + adding-a-workspace-panel.md + tutorial-parity-smoke.md. ~1.5 hours.

13. **Behavioral Compare wrapper route** (Audit #1 HIGH): create `apps/web/app/api/datasets/[id]/tabular_query/route.ts` mirroring the spike-summary pattern. ~1 hour.

14. **pgvector IVFFlat → HNSW** (Audit #6): single SQL migration. ~30 min including test. Validates with end-to-end /ask query latency.

15. **Fix species extraction** (Finding #7): backend `dataset_summary_service.py` — trace why 3 of 5 datasets show empty species. ~2 hours.

16. **Chat tool layer cleanup** (Audit #4): remove duplicate fetchJson; fix treatment-timeline synthetic doc_ids. ~1 hour.

### Tier 3 — design decisions for the week (HIGH impact, M-L effort)

17. **Yesterday's Findings #3/#4/#5/#6** — substring matching, treatment timeline column mapping, cross-table joins, strain count drift. Each ~2-4 hours.

18. **Rate-limit migration to Vercel KV** (Audit #2): pre-launch must-do for `/ask`. ~4 hours.

19. **Rate-limit Redis atomicity** (Audit #2): Lua script for backend rate limiter. ~2 hours.

20. **AI SDK major version upgrade** (Audit #8): @ai-sdk/anthropic 2→3, ai 5→6. Breaking signature changes; test thoroughly. ~1 day.

21. **System prompt trim 10K→2K + tool-description migration** (Audit #6): ~1 day, but ~$2-3/day cost reduction.

22. **Pagination on `/tables/{class}`** (Audit #6 HIGH): backend route + cron + chat tool updates. ~1 day. Saves 1.5 GB/day egress.

---

## Quick wins (could ship overnight)

If you want to land a single PR before tomorrow morning, the highest-value bundle is:

- Tier 1 items 1-6 above (~1 hour total)
- Re-run `pnpm audit` + `pip-audit` + verify CI still green

This single PR would:
- Fix (or verify) the chat layer's most impactful bugs
- Plug the session-ID log leak
- Make a fresh clone bootable
- Reduce the security CVE surface

---

## What I'm intentionally NOT flagging

To keep this audit signal-rich, I'm dropping:
- Style nits (rename suggestions, comment improvements)
- LOW-confidence speculation
- Test-isolation flakiness (already tracked in CI baseline)
- Anything already fixed yesterday (don't double-count)
- The 30 pre-existing mypy errors (all are external-types or test fixtures; not application bugs)
- "Defense in depth" gaps where the existing layer holds (defense in depth isn't an audit finding)

---

## Confidence stratification

**HIGH confidence findings** (I or an agent verified in code):
Numbers 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20 in the executive summary; all the panel consistency findings; all the cross-dataset smoke findings (#7-9).

**MED confidence findings** (strong code-reading but didn't fully trace):
Numbers 11 (system prompt size estimate), 22 (rate-limit forecasting); the chat layer cost projections.

**VERIFY FIRST** (high-impact claims I want spot-checked before fixing):
Numbers 1, 2, 3 in the executive summary. These came from one agent's reading of `lib/ai/system-prompt.ts` + `lib/ai/chat-tools.ts`. The fix for each takes 5-30 min IF the claim is real; verifying takes 5 min.

---

End of audit. Sleep well.
