# ADR-003 — `ToolContext` pattern for auth-forwarded tool calls

**Status:** Accepted
**Date:** 2026-05-15

## Context

Tool handlers in `apps/web/lib/ndi/tools/*.ts` are called from two
contexts:

1. **Anonymous chat** at `/ask` — no auth cookie, no CSRF token. The
   tool's underlying FastAPI endpoint is the anonymous-public catalog
   API.

2. **Authenticated workspace** at `/my/workspace/[id]/*` — the user is
   logged in, has a session cookie, and the wrapper route forwards a
   CSRF + the session cookie to the FastAPI endpoint.

Both contexts want to call the SAME handler. The handler shouldn't care
which context invoked it — it just needs to know "do I have auth headers
to forward, and if so what are they?"

## Decision

Every handler accepts an optional `ctx?: ToolContext` parameter:

```typescript
export interface ToolContext {
  authHeaders?: Record<string, string>;
}

export async function queryDocumentsHandler(
  input: QueryDocumentsInput,
  ctx?: ToolContext,
): Promise<ToolResult<QueryDocumentsResult>> {
  // ...
  const response = await postJson<...>(url, body, ctx);
  // ...
}
```

`postJson()` / `fetchJson()` in `lib/ndi/tools/shared.ts` reads
`ctx?.authHeaders` and merges them into the outbound `fetch()` headers.
When `ctx` is omitted (chat path), no auth is forwarded.

Chat-tool registration in `chat-tools.ts` wraps `(input) =>
handler(input)` to drop the optional second arg (the AI SDK's `execute`
shape is `(input) => Promise<R>` — no second arg allowed).

Workspace wrapper routes at `/api/datasets/[id]/<tool>/route.ts` build
the `ToolContext` from the incoming request:

```typescript
const authHeaders = await buildAuthHeaders(request);
const result = await queryDocumentsHandler(input, { authHeaders });
```

## Rationale

1. **Zero-boilerplate when auth isn't needed.** The chat path doesn't
   know about `ToolContext` at all — `tool({ execute: input =>
   handler(input) })` looks like any other AI SDK registration.

2. **Workspace integration is one parameter.** The wrapper route reads
   the cookie, builds the headers map, passes it in. No new abstraction
   layer, no DI container.

3. **Handler-level testability.** Unit tests can pass any
   `authHeaders` mock or omit it entirely; no need to mock framework
   primitives.

4. **Extensibility without breaking changes.** Future fields on
   `ToolContext` (e.g. `requestId`, `userOrgIds`, `evalSeed`) add to
   the interface without breaking existing call sites.

## Consequences

**Positive:**
- Same handler powers anonymous chat AND authenticated workspace.
- Auth header set is explicit in the calling code (no magic global).
- Easy to mock in tests.

**Negative:**
- Every handler signature is `(input, ctx?)` even though most chat
  callers don't pass `ctx`. The `?` is critical — if a handler ever
  starts REQUIRING ctx (e.g. `ctx: ToolContext` not `ctx?:`), the chat
  callers silently fail typecheck. We rely on the `?` discipline.
- The AI SDK's stricter `(input) => Promise<R>` callback shape requires
  the `(input) => handler(input)` wrapper for ToolContext-accepting
  handlers. Adds a tiny indirection at the registration site.

## Alternatives considered

**(a) Two separate handlers per tool: `handlerAnon()` + `handlerAuthed()`.**
Rejected — DRY violation; bug fixes would land twice.

**(b) Request-scoped DI container (AsyncLocalStorage).** Rejected — adds
runtime complexity for marginal ergonomic gain; explicit parameter is
clearer.

**(c) Always require `ctx`, default to `{}`.** Rejected — anonymous
chat callers shouldn't have to know about a concept they don't use.

## Verification

`apps/web/tests/unit/ai/tool-descriptions.test.ts` enforces that every
tool registration emits the right shape. Per-tool handler tests in
`apps/web/tests/unit/ai/tools/*.test.ts` exercise both ctx-present and
ctx-absent invocation paths.

## Related

- ADR-002 (shared core)
- ADR-004 (cookie auth model)
