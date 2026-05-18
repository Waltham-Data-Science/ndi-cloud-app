# ADR-009 — Railway list endpoints return per-document `data` payloads

**Status:** Accepted (codifies existing contract)
**Date:** 2026-05-19
**Author:** F-5 follow-up — Audri Bhowmick
**Companion:** F-1 through F-1e + F-2 from `apps/web/docs/specs/2026-05-18-backend-followups.md`

## Context

Several cloud-app surfaces (the workspace pickers, the chat
`query_documents` tool, the document explorer, the existing
`useDocuments` hook chain) depend on the response shape returned by
the Railway FastAPI's list endpoints:

- `GET /api/datasets/:id/documents` (with `?class=`, `?page=`,
  `?pageSize=`)
- `GET /api/datasets/:id/tables/:class` (the projection family)
- `GET /api/datasets/:id/documents/:docId/dependencies` (the graph
  node hydration)

Each of these endpoints internally calls `list_by_class` against the
upstream NDI cloud, then performs a `bulk_fetch` pass to hydrate the
full document bodies. The contract the cloud-app relies on is that
every document object returned in the response array carries the
full hydrated payload under `data` — not just the upstream's
slim `DocumentListItemResponse` shape (which omits `data`).

A future Railway-side optimization (e.g., skipping `bulk_fetch` when
the upstream query already returned bodies inline, or returning
projection-only fields to cut egress on large lists) would silently
break every panel that reads `doc.data.<field>`.

This ADR pins that contract.

## Decision

**All Railway list endpoints emitting per-document objects MUST
include the full hydrated `data` block on each document.** The
fields surfaced cloud-app-side (e.g., `data.document_class.class_name`,
`data.imageStack.formatOntology`, `data.depends_on[]`) depend on the
nested shape being present.

The cloud-app's `DocumentSummary` TypeScript type declares
`className?: string` at the top level for convenience, but the
canonical source of class identity remains
`data.document_class.class_name` — the top-level `className` is
hoisted client-side via `useDocument`'s TanStack Query `select`
(see `apps/web/lib/api/documents.ts`).

Endpoints in scope:

| Endpoint | Class field source |
|---|---|
| `/api/datasets/:id/documents` | `data.document_class.class_name` per doc |
| `/api/datasets/:id/documents/:docId` | `data.document_class.class_name` |
| `/api/datasets/:id/tables/:class` | rows are projection-shaped (camelCase keys); `data` not present, by design |
| `/api/datasets/:id/documents/:docId/dependencies` | `nodes[].class` (already projected) |

## Consequences

### Positive

- **Stable cloud-app code.** Workspace pickers + chat tools + the
  Document Explorer don't have to dig through optional fields or
  fall back to per-document re-fetches when `data` is absent.
- **Single-fetch round-trip.** Every panel render needs exactly one
  list call to populate; no follow-up per-doc hydration.

### Negative

- **Larger response bodies.** A 5,000-row `ontologyTableRow` list
  with full `data` payloads is ~6 MB unpaged. Mitigated by Stream
  5.8 pagination (default `pageSize=200`, max `1000`).
- **Future projection-only routes need a different endpoint name.**
  If a use case wants slim list-without-bodies output, it MUST land
  on a new route (e.g., `/documents/lite`) — modifying the existing
  endpoint to drop `data` would silently break consumers.

## Verification

Each Railway endpoint listed above has unit + integration tests in
`backend/tests/` that assert the response includes `data` per
document. The cloud-app side has `useDocument` normalization tests
in `apps/web/tests/unit/lib/api/use-document.test.tsx` that pin the
`data.document_class.class_name → className` hoist (added 2026-05-19
post the VideoPlaybackPanel className mis-routing bug).

## Related

- F-1 through F-1e in `apps/web/docs/specs/2026-05-18-backend-followups.md`
- 2026-05-19b post-handoff doc (VideoPlaybackPanel bug fix
  `66667ef`)
- ADR-001 (Heart-on-Railway) — projections belong on the backend
- ADR-002 (lib/ndi shared core) — TypeScript layer is a thin
  adapter, not a normalization shim
