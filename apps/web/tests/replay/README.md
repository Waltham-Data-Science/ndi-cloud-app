# /ask replay harness

End-to-end harness that drives a curated set of scientific prompts through the
live `/api/ask` endpoint and asserts the LLM picked the right tools, emitted the
right chart fence, and cited the right number of sources.

This is **not** a unit test of individual tool handlers — those already exist in
`tests/unit/ai/tools/*.test.ts` (126 of them as of Day 4). What this catches is
the **tool-selection regression**: the LLM picked the wrong tool. For example,
the `treatment_group` bug shipped on Day 4 was a pure routing miss — every tool
worked correctly in isolation, but the model would pivot from `tabular_query` to
`query_documents` after the first miss instead of using the `empty_hint.retry_with`
suggestion. No unit test could have caught it; this harness would have.

## When this fails: what to investigate

| Symptom | Likely cause |
|---|---|
| Expected tool `X` not fired | The system prompt no longer steers to X for this question pattern — re-read `lib/ai/system-prompt.ts` and the tool description for X. |
| Forbidden tool `Y` was fired | Model fell back to Y after some other tool failed (check `tool-output-error` in `tool-calls.json`) OR the forbidden-tool selection is now the LLM's preferred path (system-prompt regression). |
| Chart fence missing | Either `tabular_query` returned `groups_summary=[]` (data shape regression, not a routing regression) OR the system-prompt clause requiring the fence got accidentally edited out. |
| Reference count too low | The model is summarizing instead of citing — verify the system prompt's CITATION clause still says "NON-NEGOTIABLE". |
| Text missing expected substring | Either the upstream data changed (e.g. catalog count went from 8 to 9), or the LLM is paraphrasing — relax the `expected_text_contains` substring to something less brittle. |

Each failed test attaches `assistant-text.md` and `tool-calls.json` to the
Playwright HTML report. Pop those open first.

## How to run

The harness is **opt-in**: when `REPLAY_TARGET_URL` is unset, every test
`test.skip()`s cleanly. No accidental cost burn in CI.

```bash
# Against a Vercel preview deploy of the experimental branch
cd apps/web
REPLAY_TARGET_URL=https://ndi-cloud-app-git-feat-experimental-ask-chat-walthamds.vercel.app \
  pnpm test:replay

# Against local dev (separate terminal: `pnpm dev`)
REPLAY_TARGET_URL=http://localhost:3000 pnpm test:replay

# List the planned tests without running anything (no API calls, no auth)
pnpm exec playwright test --config=playwright.replay.config.ts --list
```

The HTML report lands in `playwright-replay-report/` — open with
`pnpm exec playwright show-report playwright-replay-report`.

## Cost

Each replay run hits Anthropic roughly:

- 10 prompts × ~3-12 tool-call steps × ~1500 input tokens (system prompt is large)
- Cached system prompt brings effective cost down ~5x
- Roughly **$0.50 - $1.50 per full replay** on Sonnet-tier

Don't wire this into the per-commit CI gate. Run it on PR review and on demand.

## How to add prompts

Edit `prompts.json` and add an object to the `prompts` array. The schema is
documented at the top of `prompts.json`. Rules of thumb:

- **One tool path per prompt.** If you want to test "behavioral comparison
  routes to tabular_query AND emits a violin chart", that's one prompt; if you
  also want to test "single-channel signal plot routes to fetch_signal AND emits
  a signal chart", that's a second prompt. Don't compound.
- **`expected_tools` is order-sensitive but subsequence-tolerant.** Listing
  `["semantic_search_datasets", "fetch_signal"]` means semantic_search must be
  called before fetch_signal in the trace, but the model can also call other
  tools in between (e.g. `query_documents` for fallback discovery). That's a
  feature: it lets us assert the headline path without forbidding exploration.
- **`forbidden_tools` is exclusion.** Use this for routing misses. For
  `tabular_query` prompts, forbid `query_documents` and `aggregate_documents`
  because the system prompt explicitly says NOT to pivot to those for
  group-by-treatment questions.
- **Smoke-test by hand first.** Before adding to `prompts.json`, run the prompt
  through the live `/ask` UI against the same preview URL. Note the tool
  sequence in DevTools or via the chat's tool-call indicators. Encode that
  ground truth into the fixture.
- **Public datasets only.** The chat is anonymous; `/api/ask` never sees a
  cookie. Don't reference dataset IDs that aren't in the public catalog.
- **Avoid over-specific text assertions.** `expected_text_contains` should be
  small canonical substrings (e.g. `"Saline"`, `"CNO"`, `"Sprague"`) that won't
  drift if the LLM rewords. Don't assert on full sentences.

## Files

- `prompts.json` — fixture set, schema documented in-file
- `parse-stream.ts` — AI SDK v5 UI message stream parser (used here + in
  `tests/unit/replay/parse-stream.test.ts`)
- `replay.spec.ts` — the Playwright spec; one test per prompt
- `../../playwright.replay.config.ts` — Playwright config for this suite (no
  browser, no webServer, 1 worker, 60s timeout)

## CI integration (future)

This harness is intentionally not part of the merge gate. Once we trust it,
options:

1. **Nightly cron** against `main` preview — alerts when LLM routing drifts.
2. **Comment-triggered** on PRs (`/replay` comment in a PR triggers a workflow
   that comments back with the verdict table).
3. **Manual workflow_dispatch** with REPLAY_TARGET_URL as an input.

All three avoid blocking landings on a non-deterministic LLM call. Pick the
shape that matches the team's preferred review cadence.
