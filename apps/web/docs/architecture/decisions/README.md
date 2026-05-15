# Architecture Decision Records

This directory holds ADRs covering choices that span the cloud-app frontend +
cross-repo orchestration. The sibling FastAPI proxy has its own ADR registry
at `Waltham-Data-Science/ndi-data-browser-v2/docs/adr/` (001-014 today; not
renumbered here).

## How to read these

Each ADR is a self-contained record of a single architectural decision:
context, decision, rationale, consequences, alternatives considered. Numbers
are sequential within this registry and never reused.

| ADR | Title | Status |
|---|---|---|
| 001 | Heart on Railway (Python), not Vercel (Node) | Accepted |
| 002 | `lib/ndi/` shared core for AI tools | Accepted |
| 003 | `ToolContext` pattern for auth-forwarded tool calls | Accepted |
| 004 | HttpOnly cookie + CSRF double-submit (not Bearer tokens) | Accepted |
| 005 | Branch-aware preview routing | Accepted |
| 006 | pgvector on Railway Postgres for RAG | Accepted |
| 007 | Vercel KV for rate limiting + per-user cost ceilings | Proposed (Stream 3) |

## When to write a new ADR

Add an ADR when:
- You're considering a choice with multiple reasonable options and want to
  record WHY one won.
- You're documenting a pattern that future contributors might be tempted to
  break without realizing the cost.
- You're recording a constraint imposed by an external factor (vendor BAA,
  compliance requirement, etc.) so a future reviewer doesn't undo it.

Don't add an ADR for:
- Trivial implementation choices that are obvious from the code.
- One-off bug fixes (those belong in a postmortem under `docs/security/` or
  `docs/operations/`).
- Forward-looking proposals — write a spec under `docs/specs/` instead. An
  ADR is for decisions already made (or imminently being made).

## Format

The shared structure each ADR follows:

```
# ADR-NNN — Short title

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXX
**Date:** YYYY-MM-DD

## Context
What problem are we solving? What forces are at play?

## Decision
What did we decide?

## Rationale
Why this choice, in numbered points.

## Consequences
What follows from the decision — both positive and negative.

## Alternatives considered
What we rejected, briefly.

## Related
Cross-references to other ADRs, plans, specs.
```
