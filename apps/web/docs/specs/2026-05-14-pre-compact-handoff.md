# Pre-compact handoff — 2026-05-14

Written immediately before `/compact` so the post-compaction Claude (or
the human reader) can pick up cleanly. This is the **fourth** checkpoint
this week — read this one first; reach for the earlier ones only for
backfill:

1. `2026-05-13-ask-checkpoint-pre-compact.md` (archived) — initial scope
2. `2026-05-14-ask-checkpoint-plan-c-pivot.md` — Sprint 1 pivot
3. `2026-05-14-audit-report.md` — full thorough-audit findings
4. **This doc** — pre-compact handoff (post-audit state)

---

## TL;DR — what shipped this session, what's blocking next

**Shipped 5 commits this session** addressing **12 critical/P0 bugs**
across the chat surface AND the data-browser ontology pipeline. The chat
is meaningfully more robust at granular completeness (per-group sample
citations, transparent truncation, fence-renderer fixes, missing
get_document tool implemented). 1430/1430 frontend unit tests pass;
611+ backend tests pass; typecheck + lint clean; bundle ratchet
unchanged (+0.22 KB on 168 KB baseline).

**Hard P0 blocker still open**: dataset pages auto-redirect to `/ask`
after 3-10s dwell. Reproducible. Source not yet traced. Until fixed,
data-browser QA on the experimental preview is broken.

**1 audit agent still in flight** at compact time: chatbot accuracy E2E
(running 15 prompts against ground truth). Its findings should land in
the next session and be aggregated into the audit report.

---

## Current state — branches, commits, Vercel/Railway

| Repo | Branch | Latest commit | State |
|---|---|---|---|
| ndi-cloud-app | `feat/experimental-ask-chat` | `942257f` | DRAFT — DO NOT MERGE — experimental |
| ndi-data-browser-v2 | `feat/ndi-python-phase-a` | `26f71ad` | DRAFT — DO NOT MERGE — experimental |

**Vercel preview** (auto-rebuilds on push): latest commit at compact time
is `942257f`. Frontend deploys typically complete ~60 seconds after
push. Verify state via `vercel ls` if needed.

**Railway experimental backend**: `https://ndb-v2-experimental.up.railway.app`.
Auto-rebuilds on push to `feat/ndi-python-phase-a`. Backend deploys
typically complete ~2-3 minutes after push. Last commit pushed was
`26f71ad`. **By the time of next session, Railway will be live with the
ontology fixes** (WBStrain echo-back, UBERON/GO/OBI providers, tabular_query
typed 503 envelope).

**Shareable URL for Playwright** (Vercel SSO bypass):
`https://ndi-cloud-app-web-git-feat-experiment-c5da7d-ndi-cloud-a83eb4e7.vercel.app?_vercel_share=SuMAAzx33EA71RdkyGmJMUS3dkKT9dOP`
Append `?_vercel_share=…` to any URL on the preview. First visit sets
the bypass cookie; subsequent navigations work without the param.

---

## Commits this session (chronological)

| Commit | Repo | Summary |
|---|---|---|
| `0fc129b` | ndb-v2 | Ontology cache stub bypass — pre-Phase-A stub entries (label=None) no longer short-circuit the NDI-python fallback. Stuck stubs heal on first use after redeploy. |
| `293ddea` | cloud-app | **9 frontend critical fixes** — tabular_query crash hardening (safeParse + null baseUrl + Array.isArray), MultiTraceChart displayName (multi-trace legend was rendering inside `<pre>`), `get_document` tool implemented (was referenced in system-prompt+ndi_query but never registered), lookup_ontology field-name fix (had been silently returning found:false for all hits since shipping), aggregate_documents counter order, fetch_spike_summary stride-sample (token blowup), system-prompt "8 datasets" hardcode → "N datasets" |
| `26f71ad` | ndb-v2 | **3 backend critical fixes** — `_fetch_wormbase` echoed strain_id as label (caused "00000001" instead of "N2 wild-type" on every Bhar surface), UBERON/GO/OBI added to `_OLS_PROVIDERS` (was returning null for "frontal cortex" etc.), tabular_query router cloud errors → typed 503 envelope (was opaque 500) |
| `91d4396` | cloud-app | Audit report doc at `apps/web/docs/specs/2026-05-14-audit-report.md` — comprehensive triage of findings from 5 of 9 agents |
| `942257f` | cloud-app | Bundle/perf audit findings — `prefetch={false}` on /ask `<Link>` in marketing Header (was wasting 104 KB gz on every non-/ask page), rate-limit cost doc updated with real numbers ($0.05–$0.31/req instead of flat 5¢) |

---

## Open P0/P1 issues — priority order for next session

### 1. Auto-redirect `/datasets/*` → `/ask` after 3-10s dwell (P0, BLOCKER)

**Reproduced** in this session via Playwright. After landing on
`/datasets/67f723d574f5f79c6062389d/overview` the URL flips to
`/ask#c=<uuid>` within 10 seconds with NO user interaction. The
`#c=<uuid>` hash format is set by the conversation-persistence hook
(`use-conversation.ts`), so SOMETHING is navigating to `/ask` and the
hook runs after mount.

**Ruled out** during the session:
- `use-conversation.ts` itself only mounts via `ask-shell.tsx` → only
  runs on `/ask`. Can't be the source.
- `proxy.ts` middleware has no `/datasets → /ask` rewrite.
- The marketing layout, app layout, and root layout have no global
  `router.push('/ask')` calls.
- Header's `useEffect` doesn't push to /ask.
- The page-level dataset components don't push to /ask.

**Hypotheses** (try in order):
1. **React #418 hydration mismatch** — visual UX audit observed this on
   every dataset page. Likely culprit: the "Last computed Xs ago"
   relative-time labels in the dataset-summary sidebar render different
   strings server-side vs client-side. When React tears down the SSR
   tree and remounts client-side, a stale closure with `router.push`
   could fire. Wrap those relative-time renderers in `useEffect`-gated
   `useState` so only client-side renders the time.
2. **Vercel Live preview script** — preview-only iframe at vercel.live
   could be doing something. Check by appending `?vercel-live=0` to a
   dataset URL and see if redirect still fires.
3. **A prefetch race** — even with our just-shipped `prefetch={false}` on
   the /ask Link, the chat shell might still be triggered by some other
   path. Verify the redirect persists after `942257f` deploy completes.
4. **Some session/auth timeout** — `/api/auth/me` returning 401 on every
   page might trigger a fallback navigation. Worth checking the
   session-handling code.

**How to verify when fixed**: Navigate to `/datasets/.../overview`, wait
30s, URL should remain at /datasets/.../overview. Test on both desktop
and mobile viewports per the agent's report.

### 2. `/api/ontology/batch-lookup` returns 403 on anonymous (P0)

The visual UX audit agent reported every anonymous summary-table view
triggers a 403 from this endpoint, falling back to label-only display
and surfacing a "1 warning · Some entries lack canonical ontology IDs"
indicator. This is an auth-posture mismatch: the endpoint is shaped like
an anonymous read but appears to require a session on the preview.

**Verify** by curl-ing the experimental Railway directly:
```
curl -X POST https://ndb-v2-experimental.up.railway.app/api/ontology/batch-lookup \
  -H 'Content-Type: application/json' \
  -d '{"terms":["UBERON:0001870","NCBITaxon:10116"]}'
```

If 403 → backend issue (router uses authenticated dep). If 200 → the
problem is in the frontend proxy/cookie posture.

### 3. fetch_image + treatment_timeline + fetch_spike_summary missing from code-export (P1)

Found by the frontend components review. The "Show code" modal renders
a TODO comment instead of usable Python/MATLAB for these three tools.
Each needs a `case` branch in `code-export/python.ts` + `matlab.ts`'s
`renderToolBody` switch. NDI-python doesn't have direct equivalents for
image / timeline / spike-summary; emit comment-heavy partial blocks
similar to how `walk_provenance` is handled.

### 4. DocumentDetailView renders CURIEs raw in JsonTree (P1)

Every `/datasets/:id/documents/:docId` page displays raw `"NCBITaxon:10116"`
etc. without resolution. Should route through `OntologyPopover` like
`SummaryTableView` already does — same `isOntologyTerm` check inside
the `string` branch of the JsonTree leaf renderer.

### 5. Chart figure elements missing aria-label (P1)

All 6 chart types wrap content in `<figure>` but no aria-label. Plotly
renders into a `<div>` with no inherent ARIA role. Add
`aria-label={title ?? variableNameContains}` to each `<figure>` element.

### 6. ToolCallIndicator missing labels for new tools (P1)

`TOOL_LABELS` map covers only 5 tools. The 10+ new tools fall through
to raw snake_case labels (`fetch_spike_summary` instead of "loading
spike data"). Visible on the chat surface.

### 7. Anthropic prompt caching (P1, big cost win)

Per bundle/perf audit: every tool roundtrip pays the full ~10K-token
system+tool context again. Enabling Anthropic prompt caching cuts that
to 10% of original cost on cache hits — 6× cost reduction. Requires
AI SDK config change in `lib/ai/anthropic-client.ts`.

### 8. `/api/ask` stalls 55s on rate-limit retry (P1)

The chat retries 3× internally before surfacing a 429. UX is
"tool indicator → nothing for 55s → error toast." Stream the error to
the client after the FIRST upstream rejection.

### 9. Tool description verbosity (P2)

Tool descriptions total ~5K tokens. Several disambiguation paragraphs
(e.g., the Dabrowska-BNST-has-two-datasets passage) repeat info that's
already in `dataset-metadata.json` sidecars. Moving disambiguation into
tool result text rather than the prompt cuts per-request input by ~30%.

### 10. Process.env access bypassing lib/env.ts (P2, convention)

5 places read `process.env` directly: `anthropic-client.ts`,
`voyage-client.ts`, `db/pool.ts`, `tools.ts` (lines 100, 104, 410, 416),
`tools/shared.ts` (lines 22, 26). CLAUDE.md mandates `lib/env.ts`.
Consolidate via zod-validated parser. Add `VERCEL_GIT_COMMIT_REF` to
the env schema.

---

## What's still in flight at compact time

**1 audit agent** still running when I wrote this doc:

- **a71c (chatbot accuracy E2E)** — running 15 representative prompts
  against the live chat, ground-truth-verified via direct backend curl.
  Validates tool path, numeric accuracy, citation correctness, hallucination
  patterns. Expected output: per-prompt PASS/PARTIAL/FAIL verdict + bug
  list. Worth waiting for and aggregating into a follow-up doc.

To check on it post-compact:
```bash
ls /private/tmp/claude-501/-Users-audribhowmick-Documents-ndi-projects-ndi-cloud-app/8a559085-dc56-49cb-8aca-9e97bde4dca5/tasks/
# Look for a71c27e288aaa7a88.output
```

---

## What survives compaction (verified)

- All git history + commits pushed to remote
- Audit report at `apps/web/docs/specs/2026-05-14-audit-report.md`
- Plan-C checkpoint at `apps/web/docs/specs/2026-05-14-ask-checkpoint-plan-c-pivot.md`
- All sidecar metadata + system prompt + tools registry
- Railway experimental env config (rebuilt with latest backend fixes)
- Vercel preview (rebuilt with latest frontend fixes)
- Test count baseline: 1430 FE, 611+ BE

## What does NOT survive compaction

- Open Playwright browser state (re-navigate as needed; the bypass token
  in the share URL is still valid)
- Working memory of in-flight agent contexts (the a71c agent transcript
  is at `/private/tmp/claude-501/.../tasks/a71c27e288aaa7a88.output` —
  if needed, read just the result section, not the full transcript)
- The hypothesis trail on the auto-redirect bug (captured above in
  "Hypotheses" — start there)

---

## Reading order for next session

1. Read this doc.
2. Read `2026-05-14-audit-report.md` for the full P0/P1/P2/P3 table.
3. If the a71c agent has returned by then, check the output file (use
   `bash` with `tail` only — NOT `cat` of the full transcript).
4. First task to attempt: trace the auto-redirect P0. Start with the
   "React #418 hydration" hypothesis (most likely root cause per the
   visual UX audit).

---

## Test/lint/build state at compact time

```
$ cd apps/web && pnpm typecheck
  ✓ clean

$ pnpm lint
  ✓ clean

$ pnpm test
  Test Files  123 passed (123)
  Tests      1430 passed (1430)

$ node ../../scripts/check-bundle-size.mjs
  Total initial JS: 168.2 KB gz
  Baseline:         168.0 KB gz
  Hard ceiling:     200 KB gz
  Delta vs baseline: +0.22 KB
  ✅ Under baseline
```

Backend:
```
$ cd ndi-data-browser-v2 && python3 -m pytest backend/tests/unit/
  611 passed, 1 skipped
```

All gates green at compact time.

---

## Critical file pointers (for the next session to grep)

### Frontend
- `apps/web/lib/ai/tools.ts` — 15-tool registry (added `get_document` this session)
- `apps/web/lib/ai/system-prompt.ts` — 340-line LLM guidance
- `apps/web/lib/ai/tools/lookup-ontology.ts` — fixed field-name bug
- `apps/web/lib/ai/tools/tabular-query.ts` — crash hardening + Array.isArray guard
- `apps/web/lib/ai/tools/get-document.ts` — newly-implemented tool
- `apps/web/lib/ai/dataset-metadata.json` — 8-dataset sidecar
- `apps/web/components/ai/Markdown.tsx` — chart fence interceptor (signal/violin/gantt/image/spike-raster/isi-histogram)
- `apps/web/components/ai/MultiTraceChart.tsx` — has `displayName='MultiTraceChart'` (added this session)
- `apps/web/components/marketing/Header.tsx` — has `prefetch={false}` on /ask (added this session)

### Backend (ndb-v2)
- `backend/services/ontology_service.py` — stub bypass + UBERON/GO/OBI providers + WBStrain fix
- `backend/services/tabular_query_service.py` — per-group docIds + totalRows
- `backend/services/dataset_binding_service.py` — Sprint 1.5 (auth gap documented)
- `backend/routers/tabular_query.py` — typed 503 envelope

### Docs
- `apps/web/docs/specs/2026-05-14-pre-compact-handoff.md` — **THIS DOC** (read first)
- `apps/web/docs/specs/2026-05-14-audit-report.md` — full triage
- `apps/web/docs/specs/2026-05-14-ask-checkpoint-plan-c-pivot.md` — Sprint 1 plan
- `apps/web/docs/observability/2026-05-14-rate-limit-audit.md` — earlier rate-limit audit (note cost analysis was incorrect — see updated rate-limit.ts doc comment)
- `apps/web/docs/pr-descriptions/pr-160-rewritten.md` — PR #160 rewrite draft

---

## Post-compact action list (priority order)

1. **CHECK THE a71c AGENT OUTPUT.** If it returned, aggregate findings
   into the audit report. If still running, decide whether to wait or
   proceed.

2. **Trace the auto-redirect P0.** Start with the React #418 hypothesis:
   use Playwright to navigate to `/datasets/.../overview`, inspect the
   console for hydration warnings, look at which client component is
   re-mounting. The visual UX audit captured a screenshot showing the
   redirected page at `audit/audit-15-mobile-overview.png` — that may
   have additional context.

3. **Verify `/api/ontology/batch-lookup` 403** with a direct curl
   against Railway. Fix the auth posture once root cause is clear.

4. **Apply the P1 fixes** in priority order (code-export missing tool
   cases, JsonTree CURIE rendering, chart aria-labels, ToolCallIndicator
   labels). These are isolated and can be parallelized with another wave
   of agents.

5. **Enable Anthropic prompt caching** (significant cost win + reliability
   win — eliminates the 55s retry stall on rate-limit hits).

6. **DO NOT**:
   - Merge anything to main (both branches stay experimental)
   - Touch live production data
   - Build new chart types until existing P0/P1 are clean
   - Spawn more agents without checking the a71c output first

---

**Ready for `/compact`.** Post-compact: read this doc, then act on the
priority list. The chat is much more robust than it was at session start;
the data-browser side needs the auto-redirect bug fixed before it's
demo-viable.
