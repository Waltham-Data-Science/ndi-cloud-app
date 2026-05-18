# ADR-008 — Incremental SYSTEM_PROMPT decomposition (curated data → JSON)

**Status:** Accepted (Stream 4.11 starter; full decomposition deferred)
**Date:** 2026-05-15

## Context

The `/ask` chat's system prompt
(`apps/web/lib/ai/system-prompt.ts`) is a 273-line hand-tuned template
literal that mixes three concerns:

1. **Conversational scaffolding** — scope rules, identity guards,
   citation contract, style notes. Stable; rarely edited.
2. **Tool selection / use prose** — how the LLM decides which tool to
   call, parameter shapes, retry loops. Edited every time a tool is
   added or its semantics shift.
3. **Curated dataset metadata** — per-PI disambiguation (Dabrowska
   default, Chudoba sibling, Fitzpatrick tree-shrew pair) +
   factual examples woven into the prose. Edited every time a new
   dataset is ingested.

Putting all three in one file means:
- Editing dataset metadata requires touching code.
- Reviewing a metadata change is hard — the diff also touches the
  prose.
- Test assertions on the prompt's stable clauses are brittle if a
  metadata edit accidentally drops or rewords a critical phrase.
- Token cost is real (~10K tokens on the first turn, ~$0.03 per
  chat). The whole prompt rides every request.

A full decomposition (compile structured data → render template at
build time → ship multiple smaller prompts per context) is the
right end-state but a meaningful project on its own. The audit at
`apps/web/docs/specs/2026-05-15-comprehensive-audit.md` Finding #11
estimated that a full decomposition could trim ~10K → ~2K tokens for
the first turn, saving $2-3/day at current volume.

## Decision

**Incremental decomposition: start with the lowest-friction layer.**

Move curated dataset metadata out of the prompt's string literal into
a JSON sidecar at `apps/web/lib/ai/dataset-aliases.json`. The prompt
imports the JSON at module load, runs a small render function to
produce the prose, and interpolates the result into the existing
template. Everything else stays in the same `SYSTEM_PROMPT` template
for now.

```ts
import datasetAliases from './dataset-aliases.json';

function renderDisambiguation(aliases: AliasesData): string { … }

const DISAMBIGUATION_PROSE = renderDisambiguation(datasetAliases as AliasesData);

export const SYSTEM_PROMPT = `…
  […tool-selection prose…]
  ${DISAMBIGUATION_PROSE}
  […rest of prompt…]
`;
```

The JSON schema is intentionally small:

```jsonc
{
  "labs": {
    "<labkey>": {
      "lab_label": "…",
      "default": {
        "dataset_id": "…",
        "first_author": "…",
        "short_description": "…",
        "tutorial_truth": "…"
      },
      "siblings": [
        {
          "dataset_id": "…",
          "first_author": "…",
          "short_description": "…",
          "status": "…",
          "route_terms": ["…"]
        }
      ]
    }
  }
}
```

Adding a new dataset = add an entry to the JSON. No prompt code
change.

## Rationale

1. **Lowest friction layer first.** Dataset metadata changes happen
   far more often than prompt-architecture changes. Decoupling them
   means the test surface (the `system-prompt.test.ts` assertions on
   stable clauses) doesn't churn every time a dataset onboards.

2. **Type-safe at the boundary.** The JSON is structurally typed via
   the inline `AliasesData` interface. Adding a new lab key is a JSON
   edit; the render function gracefully handles missing optional
   fields.

3. **Prompt assertions still pass unchanged.** The render function
   produces prose that semantically matches the previous hand-tuned
   text. The `system-prompt.test.ts` assertions on keywords like
   "Dabrowska", "Fitzpatrick", "route based" continue to pass
   without modification.

4. **Doesn't preempt the full decomposition.** If a future stream
   wants to split the prompt into per-tool snippets, this JSON
   sidecar plugs in unchanged — it'd just be referenced by a
   different generator.

## Consequences

**Positive:**
- Dataset metadata edits are JSON edits, not prompt-prose edits.
- Diffs around dataset onboarding are smaller and easier to review.
- Render function is testable in isolation (future Stream 6 add).

**Negative:**
- Adds a small import + render step at module load. Negligible runtime
  cost; not measured against the rest of the prompt's prose budget.
- Two places now hold prompt-related content (the JSON + the
  template). Documented in the file headers cross-referencing each
  other so a future editor finds both.

**What this does NOT do (deferred):**
- Decompose the tool-selection prose into per-tool snippets.
- Move the citation contract into a shared module that the
  workspace error UI also consumes.
- Trim the prompt's token footprint. The render emits prose of
  similar length to the inline version.

## Alternatives considered

**(a) Keep everything inline.** Rejected — the audit's finding #11
documents the cost; rooms for improvement.

**(b) Generate the entire prompt from structured data.** Rejected as
scope. Doable but a multi-day project that competes with Stream 3.
Better to do this incremental step first, prove the pattern works,
then commit to a full pass.

**(c) Move EVERYTHING to JSON / YAML / TOML.** Rejected. The
conversational scaffolding (scope, identity, citation contract) is
genuinely best read as prose. Forcing it into structured data would
sacrifice readability for no real flexibility.

## Verification

- `apps/web/tests/unit/ai/system-prompt.test.ts` — 13 assertions on
  stable clauses still pass after the decomposition.
- Type-check is the schema gate — adding a field that the inline
  `AliasesData` interface doesn't know about surfaces at compile time.

## Related

- ADR-002 — `lib/ndi/` shared core (similar architectural lever:
  isolate per-tool implementations from the tool registration layer).
- `apps/web/docs/specs/2026-05-15-comprehensive-audit.md` Finding #11
  — original audit recommendation.
- `apps/web/docs/specs/2026-05-15-master-execution-plan.md` Stream
  4.11 — the line item this ADR delivers against.
