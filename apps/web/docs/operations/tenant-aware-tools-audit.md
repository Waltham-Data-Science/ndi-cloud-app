# Tenant-aware chat tools — audit and retrofit guide

**Stream 3.5 (2026-05-15) deliverable.** Inventory + plan for making
the 14 chat tools at `apps/web/lib/ndi/tools/` honor tenant
boundaries once the `/ask` chat moves under `/my/ask` (Stream 3.1
auth-gated migration).

## Today's state — chat is anonymous-only

The `/ask` route processes anonymous requests. Every tool handler
ultimately calls a FastAPI endpoint via `baseUrl()`. The FastAPI
proxy's auth middleware exempts ANONYMOUS reads on the public
catalog endpoints (`/api/datasets/published`, the per-class table
endpoints, ontology lookup) — anonymous chat works because only
PUBLIC datasets are reachable.

Private datasets (uploaded by labs, not yet published) require an
authenticated session. The chat can't see them today.

## What changes after Stream 3.1 (/ask → /my/ask)

The route gains the session cookie. Every tool call needs to
FORWARD that cookie to FastAPI so private datasets become reachable.
Tool handlers that don't forward auth would hit a 401 (or get an
empty catalog), confusing the LLM.

The pattern is already established for THREE workspace-driven
handlers (psth, fetch_spike_summary, treatment_timeline,
tabular_query) — they accept the optional `ToolContext`
(ADR-003), and `shared.ts:postJson/fetchJson` forward
`ctx.authHeaders` when present. The remaining 8 handlers
need the same retrofit before chat can authenticate.

## Handler inventory + retrofit status

| Handler | Accepts `ctx?: ToolContext` today? | Forwards auth? | Retrofit needed? |
|---|---|---|---|
| `aggregate-documents` | ❌ | ❌ | Yes |
| `fetch-image` | ❌ | ❌ | Yes |
| `fetch-signal` | ❌ | ❌ | Yes |
| `fetch-spike-summary` | ✅ | ✅ | — |
| `get-document` | ❌ | ❌ | Yes |
| `lookup-ontology` | ❌ | ❌ | No (public OLS) |
| `ndi-dataset-overview` | ❌ | ❌ | Yes |
| `ndi-query` | ❌ | ❌ | Yes |
| `psth` | ✅ | ✅ | — |
| `query-documents` | ❌ | ❌ | Yes |
| `treatment-timeline` | ✅ | ✅ | — |
| `tabular-query` | ✅ | ✅ | — |
| `walk-provenance` | ❌ | ❌ | Yes |
| `list_published_datasets` (in `chat-tools.ts`) + 4 catalog handlers (`get_dataset`, `get_dataset_summary`, `get_dataset_class_counts`, `get_facets`) | ✅ | ✅ | — (Stream 4.3 retrofit already shipped) |

**7 handlers need retrofit.** Same pattern each:

```typescript
export async function someToolHandler(
  input: SomeToolInput,
  ctx?: ToolContext,
): Promise<ToolResult<SomeToolResult>> {
  // ... existing logic ...
  const result = await postJson<...>(url, body, ctx);  // pass ctx
  // ... rest unchanged ...
}
```

And in `chat-tools.ts`, switch the AI SDK registration from
`execute: someToolHandler` to `execute: (input) => someToolHandler(input)`
(AI SDK v6 callback shape is the stricter `(input) => Promise<R>`).

## Error-message-doesn't-leak invariant

The audit also called out the "private dataset existence leak":

> Every tool's empty-result branch should NOT leak the existence of
> inaccessible private datasets (e.g. "you have no access to this
> dataset" vs "this dataset doesn't exist" — pick the right message
> based on whether tenant boundary applies).

Today the tool handlers propagate FastAPI's 403 / 404 distinction
verbatim via the `{ error: "Upstream returned 403" }` / `"Upstream
returned 404"` envelope. The LLM sees both as "tool failed" and
explains plainly to the user — no leak.

When auth-gated chat ships, FastAPI returns:

- `403` if the user is authenticated but lacks org membership
- `404` if the dataset truly doesn't exist (or is in another org
  and the user is anonymous)

For an authenticated user the 403 is more informative ("ask your
admin for access"), so the LLM can route the message appropriately.
This is a SAFE distinction post-auth — the LLM already only knows
about datasets in the session's org reach, so a 403 implies a known
dataset in another org. The leak invariant holds.

## Action items (when Stream 3.1 lands)

1. Apply the `ctx?: ToolContext` retrofit to the 7 handlers in §3
   above. Mechanical — ~30 min of work + tests.
2. Update `chat-tools.ts` to wrap each handler with
   `(input) => handler(input)` to satisfy the AI SDK callback shape.
3. Update `/api/ask/route.ts` to extract `authHeaders` from the
   inbound request via `toolContextFromRequest` (already-built
   helper in `shared.ts`) and pass into every tool's execute.

The third step is the auth-forwarding completion: today the chat
tools have no way to receive `ToolContext` from the route handler
because `execute` doesn't carry the request reference. The fix is
to capture the ctx in a closure at route-handler scope and bind
into each tool's `execute` wrapper at request time. Outline:

```typescript
// /api/ask/route.ts (post-Stream-3.1):
const ctx = toolContextFromRequest(req);
const result = streamText({
  // ...
  tools: bindAuthToTools(tools, ctx),  // new helper
});
```

`bindAuthToTools(tools, ctx)` walks the tool registry and replaces
each entry's `execute` with `(input) => originalExecute(input, ctx)`.
That gives every tool the same `ctx` for the lifetime of the chat
turn.

## Update history

| Date | Change |
|---|---|
| 2026-05-15 | Initial audit (Stream 3.5 deliverable). Retrofit deferred to Stream 3.1 follow-up. |
| 2026-05-16 | **Retrofit shipped.** All 8 ctx-needing handlers updated. `makeTools(ctx?)` factory in `chat-tools.ts` builds a ctx-aware registry; `/api/ask` route constructs `ToolContext` from each request (auth headers + requestId + voyage accumulator) and passes `makeTools(ctx)` to streamText. 10 regression tests at `handlers-auth-forwarding.test.ts` lock the contract. Commit cloud-app `a872d4b`. |
