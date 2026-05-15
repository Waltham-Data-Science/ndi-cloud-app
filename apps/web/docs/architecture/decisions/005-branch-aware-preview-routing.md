# ADR-005 — Branch-aware preview routing (preview frontend → experimental backend)

**Status:** Accepted
**Date:** 2026-05-15

## Context

The `feat/experimental-ask-chat` branch is paired with a separate
Railway environment (`ndb-v2-experimental`) running the experimental
NDI-python Phase A backend. We want:

1. **Production** (`ndi-cloud.com` ← `main`) → production Railway
   (`ndb-v2-production.up.railway.app`). Untouched.

2. **Preview** for `feat/experimental-ask-chat` → experimental Railway
   (`ndb-v2-experimental.up.railway.app`). Tests the new backend.

3. **Preview** for any OTHER branch → production Railway. (Most preview
   branches are frontend-only changes that don't need the experimental
   backend.)

Vercel sets `UPSTREAM_API_URL` on the `Preview` scope env, which
defaults preview-builds to whatever that variable points at. If we
left it pointing at production Railway, the experimental branch
preview would also hit production — defeating the point of the
experimental env.

## Decision

`apps/web/next.config.ts` reads `VERCEL_GIT_COMMIT_REF` and conditionally
overrides the rewrite target:

```typescript
async rewrites() {
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  const branchOverride =
    branch === 'feat/experimental-ask-chat'
      ? 'https://ndb-v2-experimental.up.railway.app'
      : undefined;
  const upstream = branchOverride ?? process.env.UPSTREAM_API_URL;
  if (!upstream) return [];
  return [
    { source: '/api/:path*', destination: `${upstream.replace(/\/$/, '')}/api/:path*` },
  ];
},
```

The server-side tool call layer (`lib/ai/chat-tools.ts:baseUrl()` and
`lib/ndi/tools/shared.ts:baseUrl()`) reads the same `VERCEL_GIT_COMMIT_REF`
and routes its FastAPI calls to the same experimental Railway when on
the right branch.

## Rationale

1. **Single branch-aware switch covers both the edge rewrite and the
   server-side fetches.** Without this, RSC-server-side fetches in
   `getDataset()` would hit production Railway while the browser's
   `/api/*` rewrite hits experimental — a fingerprint mismatch.

2. **Reads from Vercel-injected env.** `VERCEL_GIT_COMMIT_REF` is
   automatic; no manual env-var management per branch.

3. **Production stays untouched.** Main always uses
   `UPSTREAM_API_URL`. The branch override is additive.

4. **Easy to extend.** A second experimental branch (say, `feat/another-test`)
   would add one more condition to the override.

## Consequences

**Positive:**
- Preview deploys for the experimental branch hit the experimental
  backend transparently. No env-var-per-branch sprawl.
- Production routing is unchanged for every other deploy.

**Negative:**
- The branch name is hardcoded in `next.config.ts`. Renaming the
  experimental branch breaks routing silently — the preview deploy
  starts hitting production instead.
- A test for `next.config.ts` is needed to pin the override mapping
  (Stream 6.3 deliverable).

## Verification

Plan reference: Stream 6.3 — `next.config.ts` branch-aware rewrite test.

## Related

- `apps/web/docs/specs/2026-05-15-master-execution-plan.md` §"How the
  cross-repo flow works" — explains the env routing for ops.
