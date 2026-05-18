# Ask chat — archived design + planning docs (2026-05)

Historical record of the design and planning work for the experimental
`/ask` chat (branch `feat/experimental-ask-chat`, PR #160). These docs
were active reference material during the rapid-iteration weeks of
2026-05-11 through 2026-05-13. They have been superseded by the
**Plan C pivot checkpoint** (`apps/web/docs/specs/2026-05-14-ask-checkpoint-plan-c-pivot.md`),
which is still in the active `specs/` directory at archive time.

Kept for git history + future archaeology; should not be used as the
current design source of truth. For that, read the active checkpoint.

## Chronological order

1. **`2026-05-11-experimental-ask-chat-design.md`** — original design
   spec. Defined the Days 1-4 scope: anonymous-only, 5 catalog tools
   over the existing public FastAPI endpoints, ephemeral conversation,
   edge-runtime streaming via the Vercel AI SDK, two feature flags
   (`ANTHROPIC_API_KEY` + `NEXT_PUBLIC_ASK_ENABLED`). Established the
   "production impact zero when both flags are off" gate that still
   holds today.

2. **`2026-05-11-experimental-ask-chat-impl.md`** — implementation
   plan paired with the design above. Day-by-day milestones for the
   initial four-day push. Each milestone shipped; the plan was then
   superseded as scope expanded.

3. **`2026-05-12-ask-rag-addendum.md`** — RAG-layer addendum to the
   design. Specified the embedding model (Voyage `voyage-4-large`,
   1024d), the storage layer (Postgres + pgvector on Railway), and
   the hybrid pipeline (vector + BM25 lanes + RRF + rerank-2.5). All
   shipped in commits `5803816` / `080b66b` / `ae20dd7`. This doc
   also contains the build-time index refresh workflow that
   `scripts/build-ask-index.mjs` implements.

4. **`2026-05-13-ask-checkpoint-pre-compact.md`** — first pre-compact
   checkpoint. Captured state right before the first `/compact` call:
   Phase A wins (Days 1-4 + RAG), the binary-signal sidecar, and the
   initial NDI-python integration strategy note that was later
   appended on the same day.

5. **`2026-05-13-ask-scientific-depth-plan.md`** — scientific-depth
   plan: extended the chat from "catalog Q&A" to "actually reason
   about the science". Surveyed real PI questions across the 3 demo
   datasets (Bhar tree-shrew, Dabrowska BNST, Haley microscopy) and
   tallied the ~25 realistic questions that determined chart-type
   priorities and NDI-python-depth blockers. The 25-question audit
   was captured in the next checkpoint.

## What replaced these docs

- **Active checkpoint** (still in `specs/`): `2026-05-14-ask-checkpoint-plan-c-pivot.md`.
  Captures the Plan C strategic pivot (build violin first; pause new
  chart types until NDI-python depth is real), the post-`/compact`
  action list, and the discovery that cloud-node already exposes
  `POST /ndiquery` which collapsed the original Sprint 1 plan to a
  wiring exercise.

- **PR description** at `apps/web/docs/pr-descriptions/pr-160-rewritten.md`
  — current state of `feat/experimental-ask-chat` summarized for
  GitHub.
