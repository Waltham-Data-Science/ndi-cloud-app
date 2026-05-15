# AI SDK v5 → v6 upgrade inventory

**Status:** Survey / risk register — NOT a migration. Implementation
deferred to Stream 6.12 + 6.13 + 6.14.
**Date:** 2026-05-15
**Reference:** master plan §"D2 — AI SDK v5 → v6 upgrade", audit
Finding #19.

## Current versions (cloud-app `package.json`)

| Package | Pinned | Latest v6 |
|---|---|---|
| `ai` | `^5.0.186` | `6.x` |
| `@ai-sdk/anthropic` | `^2.0.79` | `3.x` |
| `@ai-sdk/react` | `^2.0.188` | `3.x` |

The `^` constraint floats us forward within v5; v6 is a separate
major. No automatic uptake — we promote on a deliberate commit.

## Where v5 APIs live in our code

`grep convertToModelMessages|stepCountIs|streamText|tool|UIMessage` —
the touchpoints we care about:

| File | Surface | v6 impact |
|---|---|---|
| `apps/web/app/api/ask/route.ts:148-200` | `streamText({ messages: [systemMessage, ...convertToModelMessages(messages)], stopWhen: stepCountIs(12), tools })` | **`convertToModelMessages` becomes async** — must `await`. |
| `apps/web/lib/ai/chat-tools.ts:530-1010` | `tool({ description, inputSchema, execute })` × 17 tools | Probably unchanged — we don't use `toModelOutput`, the breaking-change site. |
| `apps/web/lib/ai/anthropic-client.ts` | `anthropic('claude-sonnet-4-x')` model handle | Need to verify `@ai-sdk/anthropic` v3 signature didn't shift; provider identity unchanged. |
| `apps/web/lib/ai/use-conversation.ts` / `conversation-store.ts` | `import type { UIMessage } from 'ai'` | Unchanged — `UIMessage` not renamed. |
| `apps/web/tests/replay/replay.spec.ts:213` | comment-only reference | No code change. |

We do NOT import:
- `CoreMessage` (v6 renames to `ModelMessage`) — no callsites.
- `generateObject` / `streamObject` (deprecated in v6) — no callsites.
- `Experimental_Agent` (renamed to `ToolLoopAgent`) — no callsites.
- `toModelOutput` on any tool — no callsites.
- `ToolCallOptions` (renamed to `ToolExecutionOptions`) — no callsites.

## v6 breaking changes — risk register

Severity rubric:
- **🟢 None:** v5 syntax remains valid in v6, OR we don't use the API.
- **🟡 Codemod-able:** a Vercel-supplied codemod automates the change.
- **🔴 Manual:** requires hand-edits or design re-think.

| # | Change | Affects us? | Severity | Mitigation |
|---|---|---|---|---|
| 1 | `convertToModelMessages()` becomes async | **YES** — single callsite at `/api/ask/route.ts:150` | 🔴 Manual | Add `await`; the spread context is already inside an `async` function. Single-line edit. |
| 2 | `CoreMessage` type removed in favor of `ModelMessage` | No — we don't import `CoreMessage` | 🟢 None | — |
| 3 | `generateObject` / `streamObject` deprecated for `streamText({ output: Output.object(...) })` | No — we don't generate structured output via the SDK; our chart-payload fence pattern is markdown-based | 🟢 None | — |
| 4 | `Experimental_Agent` → `ToolLoopAgent`, default `stopWhen` becomes `stepCountIs(20)` | No — we don't use the Agent class | 🟢 None | — |
| 5 | Tool `toModelOutput` param shape: `output => …` → `({ output }) => …` | No — we don't define `toModelOutput` on any tool | 🟢 None | — |
| 6 | OpenAI provider `strictJsonSchema` defaults to `true` | No — we use Anthropic | 🟢 None | — |
| 7 | Per-tool `strict: true/false` replaces provider-level `strictJsonSchema` | No — we don't set strict on any tool today | 🟢 None | — |
| 8 | Azure `azure()` switches to Responses API; use `azure.chat()` for Chat Completions | No — we don't use Azure | 🟢 None | — |
| 9 | Google Vertex `providerMetadata`/`providerOptions` key: `google` → `vertex` | No — Voyage handles embeddings; no Vertex usage | 🟢 None | — |
| 10 | `textEmbeddingModel()` → `embeddingModel()`, `textEmbedding()` → `embedding()` | No — we call Voyage directly (`apps/web/lib/ai/voyage-client.ts`), not through `@ai-sdk/*` embedding helpers | 🟢 None | — |
| 11 | `ToolCallOptions` → `ToolExecutionOptions` | No — no usages | 🟢 None | — |
| 12 | Warning types consolidated to a single `Warning` type | No — we don't surface SDK warnings to the user | 🟢 None | — |
| 13 | `@ai-sdk/anthropic` major bump v2 → v3 | Yes — TYPE-only break risk | 🟡 Codemod-able? | Verify provider package's own changelog before flipping. We use only the `anthropic()` model handle in `lib/ai/anthropic-client.ts` — minimal blast radius. |
| 14 | `@ai-sdk/react` major bump v2 → v3 (`useChat` etc.) | Yes — chat UI uses `useChat` from this package | 🟡 Codemod-able? | Migration guide didn't surface a `useChat` breaking-change list; in-the-wild reports flag minor option-rename churn. Run the typecheck on the upgrade and fix call-by-call. |

## Required edits if we upgrade today

1. **`apps/web/app/api/ask/route.ts:148-152`** — single change:
   ```ts
   // v5
   const result = streamText({
     model: chatModel,
     messages: [systemMessage, ...convertToModelMessages(messages)],
     // ...
   });

   // v6
   const modelMessages = await convertToModelMessages(messages);
   const result = streamText({
     model: chatModel,
     messages: [systemMessage, ...modelMessages],
     // ...
   });
   ```
   Trivial — POST handler is already `async`.

2. **`pnpm add ai@6 @ai-sdk/anthropic@3 @ai-sdk/react@3`** — version bump.

3. **`pnpm typecheck`** — let TypeScript surface every other affected callsite. Likely nothing else fires, but the typecheck is the safety belt.

4. **Replay harness pass** — re-run `apps/web/tests/replay/` so any subtle behavioral drift in `streamText` (e.g. step counter accounting) gets caught against canonical traces.

Estimated effort: **~30 min for the diff + 1 hr for replay-harness validation** — far less than the master plan's 1-day estimate, because we don't use any of the heavily-rewritten v6 surfaces (Agent class, structured output, embedding rename).

## Why not upgrade in this PR

The user explicitly said `/ask` is experimental + may move to auth-gated `/my/ask` in Stream 3. The cleanest sequence is:

1. Land Stream 3 (route migration, per-user cost tracking, Vercel KV). The route + state plumbing changes around `useChat` are easier to reason about against a stable SDK version.
2. Then bump to v6 on a clean branch with the replay harness as the gate.

If Stream 3 grows, we can promote v6 in parallel — the changes are orthogonal enough that the merge wouldn't be painful. But there's no rush; the v5 line is still patch-versioned (latest `5.0.186` on 2026-05-15).

## When the v6 patch line goes stale

v5 will stop receiving non-security patches eventually. Set a calendar
reminder for **2026-09-01** to either upgrade or ratify staying on v5
through end of year.

## Update history

| Date | Change |
|---|---|
| 2026-05-15 | Initial inventory (Stream 6.11 deliverable; implementation is Stream 6.12-6.14). |
