# Three surfaces share one set of tool handlers

**Audience:** contributors writing new AI tools, or modifying existing ones.

**Status:** living doc — update when the surface count changes.

NDI Cloud exposes three surfaces that all reach the same tool handlers
in `apps/web/lib/ndi/tools/`. Understanding which surface drives which
auth posture is essential when modifying a handler — a change that
"just works" in chat may silently break the workspace if it assumes the
caller is anonymous.

---

## Surface inventory

| Surface | URL | Auth | Where it lives |
|---|---|---|---|
| **Chat (`/ask`)** | `/ask` (marketing-routes) | Anonymous (no cookie, no CSRF) | `apps/web/app/(marketing)/ask/page.tsx` + `apps/web/app/api/ask/route.ts` |
| **Workspace** | `/my/workspace/[id]/...` | Authenticated (session cookie + CSRF) | `apps/web/app/(app)/my/workspace/[id]/...` + wrapper routes at `apps/web/app/api/datasets/[id]/<tool>/route.ts` |
| **Eval harness (future)** | n/a (CI-driven) | Service-account auth | Stream 6 work; planned to live at `apps/web/tests/replay/` |

All three call into the SAME handler functions in
`apps/web/lib/ndi/tools/*.ts`. The handler doesn't know which surface
called it; it only knows whether `ToolContext.authHeaders` was passed.

---

## The auth-forwarding contract (ADR-003)

Every handler accepts an optional `ctx?: ToolContext`:

```typescript
export async function someToolHandler(
  input: SomeToolInput,
  ctx?: ToolContext,    // ← optional
): Promise<ToolResult<SomeToolResult>> {
  const url = `${baseUrl()}/api/datasets/${input.datasetId}/some-endpoint`;
  return postJson<...>(url, body, ctx);
  // `postJson` reads `ctx?.authHeaders` and merges them into the
  // outbound fetch. When ctx is undefined, the call goes out anonymous.
}
```

`postJson()` (in `apps/web/lib/ndi/tools/shared.ts`) merges
`ctx?.authHeaders` into the outbound headers. The handler itself never
sees the cookie or CSRF token — it just threads the context through.

---

## How each surface invokes the handler

### Chat (`/ask`)

In `apps/web/lib/ai/chat-tools.ts`, the tool registration uses the
AI SDK shape:

```typescript
some_tool: tool({
  description: '...',
  inputSchema: someToolInput,
  execute: (input) => someToolHandler(input),  // no ctx — anonymous
}),
```

The `(input) => handler(input)` wrap is REQUIRED for handlers that
accept the optional `ToolContext` because the AI SDK's `execute` type
is the stricter `(input) => Promise<R>`. Forgetting the wrap is a
TypeScript error.

The chat path doesn't authenticate the user — `/ask` is anonymous-public
during the experimental phase. (Stream 3 will move `/ask` behind auth.)

### Workspace wrapper routes

At `apps/web/app/api/datasets/[id]/<tool>/route.ts`:

```typescript
import { authHeadersFromRequest } from '@/lib/ndi/tools/shared';
import { someToolHandler, someToolInput } from '@/lib/ndi/tools/some-tool';

export async function POST(req: NextRequest, { params }: { params: ... }) {
  const body = await req.json();
  const parsed = someToolInput.safeParse({ ...body, datasetId: params.id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const authHeaders = authHeadersFromRequest(req);
  const result = await someToolHandler(parsed.data, { authHeaders });
  return NextResponse.json(result);
}
```

`authHeadersFromRequest()` extracts the `Cookie` and `X-XSRF-TOKEN`
headers from the incoming request and packages them for the handler.
The handler then forwards them to the FastAPI proxy, which validates
the session and CSRF token via its existing middleware (no auth check
on the Next.js side beyond extracting + forwarding).

### Eval harness (future)

Stream 6 will add `apps/web/tests/replay/` runs that invoke tool
handlers directly with a synthetic `ToolContext` carrying a
service-account auth header. The handler signature is already
compatible — no changes needed when this surface lands.

---

## What the handler MUST NOT do

| Anti-pattern | Why it's wrong |
|---|---|
| Read `cookies()` from `next/headers` inside the handler | The handler doesn't know it's running in a Next.js context. Eval harness has no `cookies()`. |
| Assume auth is always present | Chat path passes no `ctx`. Use `ctx?.authHeaders ?? {}` patterns. |
| Branch on caller surface (`if (isChat) … else …`) | The handler shouldn't know who called it. If two surfaces want different behavior, that's two handlers OR a richer `ToolContext`. |
| Mutate `ToolContext` | It's a per-call object; mutating leaks state across calls. |

## What the SURFACE MUST do

Chat (`/api/ask/route.ts`):
- Read incoming cookie / CSRF NOT for auth — chat is anonymous — but the
  `Origin` header still needs to be valid for the FastAPI proxy's
  Origin-enforcement middleware. The chat route relies on the Vercel
  edge passing the cookie+Origin transparently through `rewrites()`.

Workspace wrapper routes:
- Build the `ToolContext` from the incoming request via
  `authHeadersFromRequest()`.
- Validate the inbound payload via the same `xInput` zod schema the
  chat uses.
- Pass through the handler's result unchanged.

---

## Why this design

The alternative would be to maintain three parallel implementations of
each tool (one per surface), which would drift constantly. The
`ToolContext` parameter lets one handler serve all three surfaces with
the right auth posture for each.

This is documented as a binding architectural decision in
`apps/web/docs/architecture/decisions/002-lib-ndi-shared-core.md` (the
shared core itself) and
`apps/web/docs/architecture/decisions/003-tool-context-auth-forwarding.md`
(the auth-forwarding contract).

---

## Update history

| Date | Change |
|---|---|
| 2026-05-15 | Extracted from `apps/web/docs/specs/2026-05-14-pre-compact-handoff-v2.md` per Stream 4.6. |
