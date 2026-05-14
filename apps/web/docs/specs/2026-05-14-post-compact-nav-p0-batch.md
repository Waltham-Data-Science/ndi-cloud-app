# Post-compact session — nav P0 + P1 polish batch (2026-05-14)

Picks up from `2026-05-14-pre-compact-handoff.md`. The pre-compact
handoff identified 4 navigation P0s + several P1 polish items; this
session resolved most of them in three commits across two repos.

---

## TL;DR

**7 commits shipped this session** (6 cloud-app + 1 ndb-v2)
addressing **4 navigation P0s, 1 auth-form P0, 4 P1 polish items,
plus 3 cost/perf items**. 1468 frontend tests pass (+38 vs handoff
baseline); 612 backend tests pass (+1). Typecheck + lint clean
across both repos. Bundle ratchet held at 168.2 KB gz (delta
+0.22 KB vs baseline).

**Smoke test (Playwright on Vercel preview) confirms 6/7 verifications PASS** (P0-A, P0-B, P0-C, P0-D, P0-1, P0 #3). The 7th — Document detail H1 — was PARTIAL on first pass (some doc classes return `name: "Document"` as literal placeholder); follow-up commit `1b32560` hardens against this edge case.

The 4 navigation P0s from the handoff are now either fixed (3) or
defended in-depth (1):

| P0 | Status | Approach |
|---|---|---|
| 0a — Citation chips auto-navigate during streaming | FIXED | `<Link>` → `<a>` in CitationChip + SourcesPanel; plain anchors have no SPA click interceptor |
| 0b — Chat silently hangs at 60s with no UI feedback | FIXED | Client-side watchdog at 65s + Stop button replacing "New chat" during streaming |
| 0c — Stale tool indicators persist across refresh | FIXED | ChatThread `inProgress` gating + flushPersist drops trailing in-flight assistant messages |
| 1 — Dataset pages auto-redirect to /ask after 3-10s | MITIGATED | Header `<Link href="/ask">` onClick guards `isTrusted=false` (synthetic events). Root cause may also be addressed by 942257f's `prefetch={false}`. Needs preview verification. |

**P0/P1 polish landed** in commit `c2bea43`:
- 6 chart `<figure>` elements gain aria-labels (a834 P1 #I-6)
- JsonTree on `/documents/[docId]` resolves CURIEs through OntologyPopover (ontology-sweep B4/F2)
- Document-detail H1 fallback no longer renders bare "Document" (a395 P0 #5)
- code-export Python + MATLAB cases for fetch_image, treatment_timeline, fetch_spike_summary (a834 P1 #C-1)
- ToolCallIndicator gains labels for all 14 tools + dynamic-tool prefix stripping (a834 P1 #I-4)
- `/reset-password` auth-gates anonymous users + adds escape-hatch link to /forgot-password (a63c P0-1)

**Backend (`b1bb29f` on `feat/ndi-python-phase-a`)**:
- `/api/ontology/batch-lookup` added to CSRF EXEMPT_PATHS. Anonymous
  visitors no longer 403 → "1 warning" banner gone from
  SummaryTableView popovers.

---

## Commits this session

| Commit | Repo | Description |
|---|---|---|
| `1d1154c` | cloud-app | **4 nav P0s + reset-password gate** — Link→a in CitationChip/SourcesPanel; 65s watchdog + Stop button in ask-shell; ToolCallIndicator inProgress + ChatThread wiring; flushPersist drops trailing in-flight assistant messages; Header `<Link href="/ask">` defensive onClick guard; useSession auth-gate + escape-hatch link on /reset-password |
| `c2bea43` | cloud-app | **P1 polish** — chart aria-labels (6 charts); JsonTree CURIE resolution; document-detail H1 fallback; code-export Python+MATLAB for fetch_image + treatment_timeline + fetch_spike_summary |
| `841779c` | cloud-app | **Session notes doc** (this file's initial version) |
| `2cd0a64` | cloud-app | **Anthropic prompt caching** — `cacheControl: { type: 'ephemeral' }` on system prompt cuts per-turn system input cost ~10× on cache hits (Sonnet 4.5 cache reads at 10% of input rate). Within a conversation, second turn onward hits the 5-minute cache window. |
| `7eccf11` | cloud-app | **streamText `maxRetries: 1`** — default 2 retries with exponential backoff would burn the full 60s function budget on transient failures. Cap at one quick retry; real failures surface in ~5s. |
| `1b32560` | cloud-app | **H1 placeholder hardening** — smoke test caught that some NDI doc classes return `name: "Document"` literally; my prior fallback only handled the falsy case. Extended detection to also catch the placeholder string (case-insensitive, trimmed). |
| `b1bb29f` | ndb-v2 | **CSRF exemption** for /api/ontology/batch-lookup so anonymous popovers resolve |

---

## Files changed (24 total cloud-app + 2 ndb-v2)

### cloud-app (24 files)
```
NEW (4 test files):
  apps/web/tests/unit/components/ai/ChatThread.test.tsx
  apps/web/tests/unit/components/ai/ToolCallIndicator.test.tsx
  apps/web/docs/specs/2026-05-14-post-compact-nav-p0-batch.md  (this doc)

MODIFIED (cloud-app, 22 files):
  apps/web/app/(marketing)/ask/ask-shell.tsx               (watchdog + Stop button)
  apps/web/app/(marketing)/reset-password/reset-password-form.tsx  (auth gate + escape hatch)
  apps/web/app/(app)/datasets/[id]/documents/[docId]/document-detail-shell.tsx  (H1 fallback)
  apps/web/components/ai/ChatThread.tsx                    (inProgress wiring)
  apps/web/components/ai/CitationChip.tsx                  (Link → a)
  apps/web/components/ai/SourcesPanel.tsx                  (Link → a)
  apps/web/components/ai/SignalChart.tsx                   (aria-label)
  apps/web/components/ai/ToolCallIndicator.tsx             (inProgress + new labels)
  apps/web/components/app/DocumentDetailView.tsx           (JsonTree CURIE resolution)
  apps/web/components/charts/GanttChart.tsx                (aria-label)
  apps/web/components/charts/ImageChart.tsx                (aria-label)
  apps/web/components/charts/IsiHistogram.tsx              (aria-label)
  apps/web/components/charts/SpikeRaster.tsx               (aria-label)
  apps/web/components/charts/ViolinChart.tsx               (aria-label)
  apps/web/components/marketing/Header.tsx                 (defensive onClick on /ask Link)
  apps/web/lib/ai/code-export/matlab.ts                    (3 new tool cases)
  apps/web/lib/ai/code-export/python.ts                    (3 new tool cases)
  apps/web/lib/ai/use-conversation.ts                      (normalizeForPersist)
  apps/web/tests/unit/(marketing)/reset-password.test.tsx  (auth-gate tests)
  apps/web/tests/unit/ai/code-export/matlab.test.ts        (new branches)
  apps/web/tests/unit/ai/code-export/python.test.ts        (new branches)
  apps/web/tests/unit/ai/use-conversation.test.tsx         (persist normalization tests)
```

### ndb-v2 (2 files)
```
MODIFIED:
  backend/middleware/csrf.py                               (EXEMPT_PATHS entry)
  backend/tests/unit/test_csrf.py                          (exemption regression test)
```

---

## P0 root-cause traces (for next session reference)

### P0-A — Citation chips
**Root cause:** `next/link` injects a click interceptor on the
underlying anchor for SPA navigation. Even with `target="_blank"`,
on Chrome and Safari the SPA router occasionally fires
`router.push(href)` when chips get focus mid-stream (the `aria-live`
chat log moves focus during DOM updates). The destination URL was
`/datasets/.../documents/...` → user lands on the dataset detail
page mid-stream.

**Fix:** swap `<Link>` to plain `<a>` in CitationChip.tsx +
SourcesPanel.tsx. Plain anchors don't have the click interceptor;
new-tab nav always wins.

### P0-B — Chat hang at 60s
**Root cause:** `/api/ask` has `maxDuration=60`. When Vercel cuts
the response without emitting an SSE error frame, useChat's
`status` sticks at `'streaming'` forever — the UI shows a frozen
"using <tool>…" indicator.

**Fix:**
1. Client-side watchdog: 65s timer that calls `stop()`, sets an
   error banner, drops the in-flight tool indicator to its static
   "completed/restored" rendering.
2. Stop button (replaces "New chat" during streaming) so the user
   can abort on demand without waiting for the watchdog.

### P0-C — Stale tool indicators after refresh
**Root cause:** Two compounding issues.
1. `ToolCallIndicator` was always pulse+italic regardless of state.
2. `useConversation.flushPersist` persisted whatever was in
   `messages` — including assistant turns whose tool parts had
   `state !== 'output-available'` (i.e., the stream was cut off).

**Fix:**
1. `ChatThread` passes `inProgress = isStreaming && idx === entries.length - 1` to ToolCallIndicator. Only the trailing entry of an active stream pulses; everything else (earlier tool calls in the same turn, hydrated threads, post-stream state) renders static.
2. `normalizeForPersist` drops the trailing assistant message if any of its tool parts are still in a pre-terminal state. The user's question survives; the half-finished assistant turn doesn't.

### P0-D — Dataset pages auto-redirect to /ask
**Status:** mitigated, root-cause not 100% confirmed. The only
programmatic SPA route to /ask in the codebase is the experimental
nav `<Link>` in Header (gated by `NEXT_PUBLIC_ASK_ENABLED=1` on
preview only). Trace-agent hypothesis: React event-replay during
hydration of the dataset chrome gate fires a synthetic click on
the Link.

**Mitigation:** Header `<Link href="/ask">` gains an `onClick`
handler that rejects events with `isTrusted=false` (synthetic
events). Real user clicks (`isTrusted=true`) pass through.

**Note:** the 942257f commit shipped `prefetch={false}` on this
Link, which may have already mitigated the root cause by removing
the path that caused the /ask chunk to evaluate. The audit
reproduction was before that commit; the bug may already be gone.
Smoke test pending verification.

---

## Test/lint/build state at end of session

```
$ cd apps/web
$ pnpm typecheck   ✓ clean
$ pnpm lint        ✓ clean
$ pnpm test --run  ✓ 1468 passed (was 1430 at session start)

$ cd ../../ndi-data-browser-v2
$ pytest backend/tests/unit/   ✓ 612 passed, 1 skipped (was 611 at session start)
```

Bundle ratchet unchanged (no new top-level chunks added; aria-labels
+ inline onClick are sub-byte additions per file).

---

## Open issues for next session

### High priority

1. **P0-D smoke verification** — confirm dataset pages don't
   auto-redirect to /ask on the preview after the prefetch=false +
   Header onClick guard combo. Smoke-test agent dispatched at end
   of this session; check its output if it's done by next session.
2. **WBStrain provider scrape** — NDI-python returns the URL but
   not the strain name. Either fix in NDI-python upstream or add a
   WBStrain-specific scraper in `ontology_service._fetch_wormbase`
   that reads the strain page.
3. **`ndi_dataset_overview` "binding unavailable"** on the
   experimental Railway — NDI-python dataset materialization not
   configured (Sprint 1.5 caveat). Re-evaluate whether to
   prioritize the auth posture or defer entirely.

### Medium priority

4. **`probe` className projection returns 0 rows on Dabrowska**
   even though `summary.probeTypes` has the data. Class-name
   mismatch between projection and summary. Investigate which side
   has the wrong name.
5. **Enable Anthropic prompt caching** (cost win + reliability
   win) — cuts per-turn cost ~6× and eliminates the 55s retry
   stall on rate-limit hits.
6. **Tool description verbosity** — moving disambiguation from
   tool descriptions into tool result text cuts per-request input
   by ~30%.
7. **Streaming 429 on first upstream rejection, not third** —
   `/api/ask` retries 3× internally before surfacing the rate-
   limit error.

### Low priority

8. **Process.env audit** — 5 places read `process.env` directly,
   bypassing `lib/env.ts`. CLAUDE.md mandates the zod-validated
   parser. Consolidate.
9. **LLM hallucinations on unknown CURIEs** — when
   `lookup_ontology` returns `found:false`, the model sometimes
   answers from general knowledge instead of saying "I don't
   know." Minor.
10. **Hardcoded branch name** in `baseUrl()` — flagged at session
    start as not-yet-blocking because the branch is non-mergeable,
    but worth fixing before any merge attempt.

---

## Critical file pointers (for next-session grep)

### Frontend (cloud-app)
- `apps/web/components/ai/CitationChip.tsx` — plain `<a>` not `<Link>` (P0-A fix)
- `apps/web/components/ai/SourcesPanel.tsx` — plain `<a>` not `<Link>` (P0-A fix)
- `apps/web/components/ai/ToolCallIndicator.tsx` — has `inProgress` prop + dynamic-tool-prefix stripping
- `apps/web/components/ai/ChatThread.tsx` — passes inProgress based on idx
- `apps/web/app/(marketing)/ask/ask-shell.tsx` — has watchdog timer + Stop button
- `apps/web/lib/ai/use-conversation.ts` — has normalizeForPersist
- `apps/web/components/marketing/Header.tsx` — `/ask` Link has defensive onClick
- `apps/web/app/(marketing)/reset-password/reset-password-form.tsx` — has useSession auth gate
- `apps/web/components/app/DocumentDetailView.tsx` — JsonTree resolves CURIEs through OntologyPopover

### Backend (ndb-v2)
- `backend/middleware/csrf.py` — EXEMPT_PATHS includes /api/ontology/batch-lookup

---

## Reading order for next session

1. Read this doc.
2. Read the smoke-test agent's output (if dispatched and complete).
3. Check the previous handoff `2026-05-14-pre-compact-handoff.md`
   for items still open beyond the ones tackled here.
4. The audit report `2026-05-14-audit-report.md` enumerates the
   full P0/P1/P2/P3 table.
