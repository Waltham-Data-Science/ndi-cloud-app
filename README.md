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

**Phase 6.7 complete; ready for Phase 7 (atomic domain swap to `ndi-cloud.com`).**

### What's shipped on `main`

- Marketing site (home, about, platform, security, products/labchat, products/private-cloud, all auth pages)
- Data browser catalog (`/datasets`) — RSC + ISR, faceted search, sort, paginated card grid
- Dataset detail (`/datasets/[id]`) with Overview, Summary tables, Pivot, Document Explorer, Document Detail (chrome-hidden drilldown)
- Document detail dependency graph (CSS-flexbox visual + text view), JSON properties tree, AppearsElsewhere panel
- `/my` workspace (auth-gated, scope toggle for admins, status filter chips, grid/table view, unpublished-dataset visibility)
- `/my-account` (read-only profile + nav + logout)
- `/query` cross-dataset query builder with FacetPanel
- HttpOnly cookie auth (`Domain=.ndi-cloud.com`) + CSRF double-submit
- 7 frontend audit batches (A–G), shipped via PRs #94–#100
- Architectural fix for `loading.tsx` Suspense + dataset-scoped `not-found.tsx` (PR #104)
- Cache-poisoning hotfix for slow-cloud-record datasets (PR #105)

### Cutover gates (Phase 7)

Documented in `CUTOVER.md`. Pre-swap items include:
- FastAPI cookie domain `.ndi-cloud.com` deployed (Phase 4 backend) ✓
- `INTERNAL_API_URL`, `UPSTREAM_API_URL`, `CRON_SECRET` set on Vercel
- Vercel Skew Protection enabled and verified via bogus `?dpl=` curl
- CSP Report-Only soak (24h with no legitimate violations) → flip to enforced
- Orphan Vercel project (`ndi-cloud-app` without `apps/web` rootDir) deprovisioned
- New `SESSION_ENCRYPTION_KEY` generated; old key kept for rollback

The atomic domain swap (Phase 7 step 2) requires explicit user authorization at execution time.

### Reference docs

- [`CUTOVER.md`](./CUTOVER.md) — Phase 7 manual checklist
- [`CLAUDE.md`](./CLAUDE.md) — agent context (stack, rules, hard limits)
- [`apps/web/AUTH_CONTRACT_AUDIT.md`](./apps/web/AUTH_CONTRACT_AUDIT.md) — auth wire contract
- [`apps/web/COMPLIANCE.md`](./apps/web/COMPLIANCE.md) — data residency, encryption, audit trail
- [`apps/web/docs/reviews/`](./apps/web/docs/reviews/) — frontend polish audits

### Architectural rationale

- High-level migration plan: `ndi-data-browser-v2/docs/plans/cross-repo-unification-2026-04-24.md`
- v2 audit work this preserves: `ndi-data-browser-v2/docs/reviews/Audit_2026-04-23.md`
