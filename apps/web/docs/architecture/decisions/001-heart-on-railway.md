# ADR-001 — Orchestration "heart" lives on Railway (Python), not Vercel (Node)

**Status:** Accepted (codifies existing decisions)
**Date:** 2026-05-15
**Author:** Stream 2.5 — Audri Bhowmick

## Context

When the unified `ndi-cloud-app` monorepo was bootstrapped, we faced an
architectural choice: implement chat orchestration, RAG pipelines, NDI
Query DSL, and AI-tool dispatch in either:

1. **Vercel-side TypeScript** — Next.js API routes that call third-party
   APIs (Anthropic, Voyage) and a thin FastAPI proxy for catalog reads.
   Tool definitions in TypeScript via the AI SDK.

2. **Railway-side Python (the "heart")** — keep the heavy orchestration
   in the existing FastAPI proxy. The Next.js side becomes the thin
   shell: rendering, navigation, edge caching, edge Origin enforcement.
   AI tools are registered in TypeScript but their implementations
   delegate to FastAPI handlers.

We chose **option 2**: heart on Railway, thin Vercel.

## Decision

Heavy orchestration — multi-step NDI Query traversal, NDI-python SDK
calls, pgvector hybrid retrieval, voyage embedding + rerank — lives in
the FastAPI backend. The Next.js side is a routing + rendering + edge
layer. AI tool registrations in `apps/web/lib/ai/chat-tools.ts` are thin
wrappers around handlers in `apps/web/lib/ndi/tools/*.ts` which themselves
delegate to FastAPI endpoints via `fetchJson` / `postJson`.

## Rationale

1. **NDI-python integration is naturally Python.** The NDI-python SDK
   (and its kin: `vlt`, `ndr`, `ndi-compress`) are mature Python libraries
   with direct read paths into NDI's storage formats. Re-implementing them
   in TypeScript would be a multi-month yak shave with no payoff.

2. **Existing FastAPI proxy is the obvious extension point.** The
   `ndi-data-browser-v2` backend already proxies all catalog reads,
   handles auth via Cognito JWT forwarding, runs structured logging, and
   manages Redis sessions. Adding `/api/datasets/:id/psth`,
   `/api/datasets/:id/treatment-timeline`, etc. fits naturally without
   adding a new runtime.

3. **Vercel cold-start budget is precious.** Heavy synchronous
   computations (NDI-python traversals, pgvector queries with 20+ candidate
   reranks, multi-step Query DSL chains) on Vercel Functions would burn
   our active-CPU budget and risk timeouts. Vercel's 60s/180s default
   timeouts (per Fluid Compute) are tight; long NDI-python calls (10-30s
   cold starts on a fresh dataset) eat half the budget.

4. **Railway accommodates the heavy stuff.** The FastAPI container has
   no execution-time ceiling (timeouts are application-level), runs with
   `WEB_CONCURRENCY=4` for parallelism, and can stream long responses
   if needed. The Postgres + Redis are colocated.

5. **Tool dispatch is the right abstraction boundary.** Each AI tool in
   `chat-tools.ts` registers an input schema (zod) and an `execute`
   function. The `execute` calls a thin handler in `lib/ndi/tools/*` that
   forwards to FastAPI. This keeps the LLM-facing tool definitions
   self-documenting AND makes auth-forwarding (via `ToolContext`)
   transparent — the wrapper routes at `/api/datasets/[id]/*` exist
   precisely to forward Cognito JWTs through to FastAPI.

## Consequences

**Positive:**
- NDI-python evolves in its native Python; we get every new SDK feature.
- Heavy compute doesn't burn Vercel's per-invocation budget.
- One place to instrument logging, rate limiting, error mapping
  (the FastAPI proxy), rather than two.

**Negative:**
- Every chat tool call crosses the Vercel → Railway boundary, adding
  ~50-100ms of latency per call. For 5-10-tool conversations, this is
  measurable. Mitigated by HTTP/2 keep-alive on the FastAPI client and
  branch-aware preview routing (ADR-005).
- Cross-boundary tracing requires propagating `X-Request-Id` (Stream 4.5
  is the planned work to make this complete).

**What this rules out:**
- Building a "pure-Vercel" chat that talks directly to Anthropic from
  Edge Functions. Tools that need NDI-python can't live there.
- Implementing pgvector queries in TypeScript. They stay in
  `apps/web/lib/ai/hybrid-retrieval.ts` BUT the actual SQL execution is
  via `@vercel/postgres` which still goes to the Railway-hosted Postgres
  — so technically the Vercel side carries the SQL. This is a
  pragmatic exception (the pgvector path is purely query-side, no NDI
  SDK needed).

## Alternatives considered

**(a) Pure-Vercel (Node + AI SDK)**: rejected. NDI-python is the moat;
re-implementing it would be a year-long port. Even the partial port
(catalog reads) was already in TypeScript via the cloud's Lambda — we
gained nothing.

**(b) Split — chat on Vercel, NDI tools on Railway**: rejected. Adds a
second network hop per tool call (Vercel → Railway → Vercel → user), no
gain over "everything routes through Vercel as the thin shell".

**(c) Migrate FastAPI to Vercel Python (via Fluid Compute)**: tabled.
Vercel Python via Fluid Compute is real and HIPAA-eligible, but Railway
has been operationally smooth and we'd lose the always-on container
property (FastAPI's startup time benefits from being a long-running
process — NDI-python imports take ~5s once, then they're warm). Will
revisit if Railway's BAA stance changes (currently no BAA).

## Related

- `apps/web/docs/architecture/decisions/002-lib-ndi-shared-core.md` —
  how shared NDI tool code is structured
- `apps/web/docs/architecture/decisions/003-tool-context-auth-forwarding.md` —
  how auth crosses the Vercel → Railway boundary
- `Waltham-Data-Science/ndi-data-browser-v2/docs/adr/004-drop-sqlite-dataset-storage.md` —
  keeps the FastAPI stateless so this heart can move
