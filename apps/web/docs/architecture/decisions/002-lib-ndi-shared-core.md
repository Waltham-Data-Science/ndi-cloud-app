# ADR-002 — `lib/ndi/` shared core for AI tools

**Status:** Accepted
**Date:** 2026-05-15

## Context

The `/ask` chat (`apps/web/lib/ai/chat-tools.ts`) registers AI SDK tools
that wrap FastAPI handlers. Some of those handlers are ALSO used outside
the chat — by the workspace panels at `/my/workspace/[id]/...`, by
internal admin pages, and (future) by the AI Gateway-driven evaluation
harness. Three callers, all needing the same shape but with different
auth contexts:

1. **Chat** — anonymous (no cookie), zero auth headers.
2. **Workspace panel** — authenticated, forwards Cognito JWT via cookie.
3. **Eval harness** — service-account auth (not yet implemented).

If each caller built its own HTTP fetch wrapper, the surface would
duplicate three ways: three fetch implementations, three error-mapping
layouts, three timeout configs. Drift between them is guaranteed.

## Decision

Establish a shared core at `apps/web/lib/ndi/` containing:

- `tools/*.ts` — per-tool handler implementations: `query-documents.ts`,
  `walk-provenance.ts`, `fetch-signal.ts`, `fetch-spike-summary.ts`,
  `treatment-timeline.ts`, `psth.ts`, `tabular-query.ts`,
  `aggregate-documents.ts`, `lookup-ontology.ts`, `fetch-image.ts`,
  `ndi-query.ts`, `get-document.ts`, `ndi-dataset-overview.ts`.
- `tools/shared.ts` — common primitives: `baseUrl()`, `fetchJson()`,
  `postJson()`, `isErrorResult()`, `logToolInvocation()`, the
  `ToolContext` interface (ADR-003).
- `references.ts` — citation helpers (`makeReference`,
  `makeDatasetReference`).
- `code-export/` — MATLAB + Python codegen for each tool (so the chat
  can show "how to reproduce this in code").

Every chat tool entry in `chat-tools.ts` is a 3-line `tool({...})` block
whose `execute` calls a handler in `lib/ndi/tools/*`. Workspace panels
import the same handlers via their own wrapper API routes at
`/api/datasets/[id]/<tool>/route.ts`. The wrapper routes forward auth
(via `ToolContext`) and call the same handler.

## Rationale

1. **One implementation, three callers.** Chat + workspace + eval all
   exercise the same code path. Bug fixes land once.
2. **Auth differences are explicit.** `ToolContext` is the optional
   parameter — chat callers omit it; workspace routes inject it from
   the request cookie; eval injects a service token.
3. **Future-proofing for the AI Gateway.** When we eventually route
   chat traffic through Vercel's AI Gateway, the gateway-side tool
   definitions can import the same handlers — no re-implementation
   needed.
4. **Codegen lives next to the tool it generates code for.** The
   `code-export/` MATLAB + Python files are unit-tested against the
   same fixtures as the tool itself.

## Consequences

**Positive:**
- One bug-fix locus.
- Workspace panels and chat answer the same question identically.
- Test coverage benefits one consumer benefits all.

**Negative:**
- Adding a new tool requires touching `lib/ndi/tools/` + `chat-tools.ts`
  + a wrapper route (if needed by workspace). The doc at
  `apps/web/docs/operations/three-surfaces.md` (Stream 4.6 deliverable)
  formalizes this checklist.
- The chat surface intentionally wraps the `ToolContext`-accepting
  handlers as `(input) => handler(input)` to drop the optional context
  parameter (per AI SDK's stricter callback shape).

## Alternatives considered

**(a) Inline each tool in `chat-tools.ts`**: rejected. Hard to test,
hard to swap auth contexts, duplicates the network plumbing.

**(b) Generate tool handlers from a single schema file**: rejected.
Each tool has slightly different error shapes (some have `error_kind`,
some have `empty_hint`, signal has `chart_payload`); a single generator
would either over-abstract or under-deliver.

## Related

- ADR-001 (heart on Railway) — why these handlers exist at all
- ADR-003 (ToolContext) — how auth crosses the boundary
- Stream 4.3 in the master plan — folding the last 5 chat-tools-only
  handlers into `lib/ndi/` for full consistency
