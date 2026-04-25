# ndi-cloud-app

Unified NDI Cloud monorepo. Marketing site (`ndi-cloud.com`) + data browser (formerly `app.ndi-cloud.com`) on a single Next.js 15 App Router stack.

Replaces:
- `Waltham-Data-Science/ndi-web-app-wds` (Next.js Pages Router marketing site)
- `Waltham-Data-Science/ndi-data-browser-v2` frontend (Vite SPA + React Router)

The FastAPI proxy in `ndi-data-browser-v2/backend/` continues to serve `/api/*` from Railway during this migration.

## Quickstart

```bash
corepack enable
pnpm install
pnpm dev
```

## Status

Phase 1 (bootstrap) in flight. See PR #1.

The full migration plan lives at:
- [`ndi-data-browser-v2/docs/plans/cross-repo-unification-2026-04-24.md`](https://github.com/Waltham-Data-Science/ndi-data-browser-v2/blob/main/docs/plans/cross-repo-unification-2026-04-24.md) (architectural rationale, build-alongside model, decision matrix)
