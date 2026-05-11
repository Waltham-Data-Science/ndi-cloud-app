# CLAUDE.md — ndi-cloud-app

Agent context for the unified NDI Cloud monorepo at `ndi-cloud.com`.

## What this repo is

Next.js 15 App Router monorepo. Replaces:
- `Waltham-Data-Science/ndi-web-app-wds` (Pages Router marketing site)
- `Waltham-Data-Science/ndi-data-browser-v2` frontend (Vite SPA + React Router)

The FastAPI proxy in `Waltham-Data-Science/ndi-data-browser-v2/backend/`
continues to serve `/api/*` from Railway. This repo handles all routing,
rendering, and edge-cached delivery via Vercel.

## Migration status

**Phase 7 atomic domain swap SHIPPED 2026-05-11 at 00:00 EDT.** `https://ndi-cloud.com` now serves the unified monorepo. LOGIN GATE passed in incognito browser test; the 60-minute watch window closed clean. Post-cutover steady state: strict apex-only Origin allowlist at Vercel edge, `SESSION_ENCRYPTION_KEY` rotated on Railway, all 9 legacy camelCase auth-route redirects live, www → apex 308. Phase 8 (archiving legacy repos + dropping FastAPI static-files mount) waits for the 30-day burn-in window to close (~2026-06-10).

Phases that have landed (chronological, by lead PR):

- Phase 1 — Bootstrap (Next.js 15 + pnpm + CI hygiene)
- Phase 2 — Marketing site port (home, about, platform, security, products) + auth flows expanded (forgot-password, account-verification, reset-forgotten-password as explicit pages)
- Phase 3 — Catalog + dataset detail (Overview, Summary tables, Pivot stub, Document Explorer, Document Detail with dependency graph + AppearsElsewhere)
- Phase 4 — Auth contract: HttpOnly `Domain=.ndi-cloud.com` cookie + CSRF double-submit (no localStorage tokens)
- Phase 5 — Vercel Analytics + Speed Insights wiring; Edge middleware Origin enforcement on `/api/*` mutations
- Phase 6.5 — Data browser leaf component ports (PivotView, QueryBuilder, FacetPanel, DataPanel for binary blobs, ontology popovers)
- Phase 6.6 — REBUILD-8 chrome gate for document-detail drilldown (chrome hidden via `data-dataset-chrome` selectors + inline `<style>` pre-paint)
- Phase 6.7 A1–A11 — bundle ratchet, `generateMetadata` per-dataset titles, RSC prefetch, edge cache, ISR+SSG for top-20 datasets
- Phase 6.7 audit batches A–G (PRs #94–#100) — 24-finding frontend polish: instant route-shell paint, degraded-data UX, error/empty-state polish, auth-flow polish, nav consistency, narrow-width responsive, hygiene/a11y
- PR #101–#102 — dataset-detail 500 hotfix + bad-id 400 routing + tighter existence-check timeout
- PR #103 — `useLinkStatus` pending pill for catalog-card click feedback
- PR #104 — architectural fix: existence check moved layout→page so `loading.tsx` Suspense fires + `notFound()` resolves dataset-scoped `not-found.tsx`
- PR #105 — cache-poisoning hotfix: don't write `null` to TanStack Query cache when prefetch times out (caught during pre-cutover audit; tree-shrew dataset was rendering bare-id)
- PRs #147–155 — round-4 + round-5 team review polish (Steve's feedback): ontology Name-cell linkification, marketing copy without Crossref branding, dataset-DOI restructure with PMID/PMC pills, QuickPlot column-first redesign, SEO upgrades (Dataset JSON-LD, per-dataset sitemap), Griswold timeout bump, Cite modal copy + Download buttons, test-suite audit (+106 tests)
- PR #156 — Phase 7 cleanup: restore strict apex-only Origin allowlist (drop pre-cutover hardcode + env-var escape hatch), shipped immediately post-swap

Reference plans:
- High-level: see Audri's plan file at `/Users/audribhowmick/.claude/plans/sharded-puzzling-dragonfly.md`
- Pre-cutover audit (this session): `/Users/audribhowmick/.claude/plans/atomic-sniffing-island.md`
- Architectural rationale: `ndi-data-browser-v2/docs/plans/cross-repo-unification-2026-04-24.md`
- v2 audit preserved: `ndi-data-browser-v2/docs/reviews/Audit_2026-04-23.md`
- Frontend polish audit: `apps/web/docs/reviews/Audit_2026-04-27_frontend_polish.md` (23/24 SHIPPED, 1 deferred-by-design as of `main` post-PR-#100)

## Stack

- **Framework:** Next.js 16.2.4 App Router (Turbopack), React 19
- **Styling:** Tailwind v4 with `@theme` design tokens. NO SCSS Modules. NO MUI in `components/app/` (eslint enforced; MUI permitted only in `components/marketing/` for `<Menu>`/`<Modal>` where the a11y lift is real).
- **Data:** TanStack Query 5 (with PersistQueryClient layered on top in Phase 3a). Native `fetch()` via `apiFetch<T>()`. No axios.
- **Tests:** Vitest + Testing Library (jsdom) for unit; Playwright for E2E.
- **Bundle gate:** `scripts/check-bundle-size.mjs` — marketing 80 KB gz, app 200 KB gz. Ratchets DOWN over time, never up.
- **Package manager:** pnpm 10.22 via Corepack.

## Route groups

- `app/(marketing)/*` → `ndi-cloud.com` content (RSC-first, ISR where possible)
- `app/(app)/*` → former `app.ndi-cloud.com` content (mostly client; catalog is RSC + ISR)

`app.ndi-cloud.com` becomes a 301-to-apex redirect at Phase 7 cutover. Until then, both old domains keep serving production traffic from their respective old projects — this repo only deploys to Vercel preview URLs during Phases 1-6.

## Auth

HttpOnly `session` cookie set by FastAPI, scoped to `Domain=.ndi-cloud.com` (Phase 4). CSRF via double-submit `XSRF-TOKEN` cookie + echoed `X-XSRF-TOKEN` header. **No localStorage tokens** — Phase 2b rewrites the marketing-side auth flow that previously used localStorage Bearer tokens.

## Author rule (non-negotiable)

Every commit MUST be authored as `audriB <audri@walthamdatascience.com>`. Use `--author=` explicitly:

```bash
git commit --author="audriB <audri@walthamdatascience.com>" -m "..."
```

Vercel + Railway both gate deploys on this. The `.githooks/pre-push` hook verifies before push. CI also rejects PRs with non-conforming authors.

Activate the hook locally:
```bash
git config core.hooksPath .githooks
```

## CI gates (.github/workflows/ci.yml)

All must be green to merge:
1. **hygiene** — Finder duplicate-file rejection + PR commit author check
2. **lint** — `next lint`
3. **typecheck** — `tsc -b --noEmit`, strict mode
4. **unit** — vitest with coverage thresholds (35/27/34/37 floor; ratchets up)
5. **build** — `next build` + bundle-size budget enforcement
6. **e2e** — Playwright against the production-like `next start`
7. **security** — `pnpm audit --audit-level=moderate`

Skip-hook variants (`--no-verify`, `--no-gpg-sign`) are NOT permitted. If a hook fails, fix the underlying issue.

## What to do / not do

- ✅ Use `apiFetch<T>()` for all backend calls. It handles credentials, CSRF, error mapping.
- ✅ Use `next/dynamic({ ssr: false })` for component-level deferral of heavy below-the-fold widgets.
- ✅ Use `next/image` for any imagery — Vercel Image Optimization handles AVIF/WebP automatically.
- ✅ Read env via `lib/env.ts` (zod-validated). Never `process.env.X` directly outside that module.
- ❌ No `dark:*` Tailwind classes. The app forces `color-scheme: light`.
- ❌ No `@mui/*` imports in `components/app/` (eslint enforced).
- ❌ No `// @ts-ignore`, `eslint-disable`, or `# noqa` without an inline justification comment.
- ❌ No skipped/xfailed tests without an explanation comment.
- ❌ Never push direct to `main`. Every change goes through a feature branch + PR + CI green.
- ❌ Never bypass the author rule.

## Post-cutover operations

Phase 7 shipped 2026-05-11. The remaining post-cutover work is non-traffic-moving (code cleanup, archiving legacy repos, documentation). Specifically:

- The 30-day burn-in window expires ~2026-06-10. After that:
  - Archive `Waltham-Data-Science/ndi-web-app-wds` and `Waltham-Data-Science/ndi-data-browser-v2` (archive preserves history; not delete).
  - Drop the FastAPI static-files mount in `ndi-data-browser-v2/backend/app.py` so Railway becomes API-only.
  - Optionally delete the orphan `ndi-web-app-v2` Vercel project.
- CSP enforce flip (Report-Only → enforced) is deferred indefinitely. A prior attempt (PR #152, closed) broke under `script-src 'self'` because Next.js App Router emits inline streaming scripts (`self.__next_f.push(...)`). Re-attempting requires either `'unsafe-inline'` (security regression) or proper nonce wiring; not urgent — Report-Only logs violations without blocking, which is fine in steady state.
- `app.ndi-cloud.com` redirect-to-apex (CUTOVER.md step 4) was skipped because the subdomain has no DNS. Add a CNAME at Google Cloud DNS if legacy bookmark support is wanted; defer otherwise.

## Rollback (read this before any production-affecting change)

The full rollback procedure lives outside this repo at `~/Documents/ndi-projects/cutover-keys.md` (owner-only `chmod 600`). It contains the pre-rotation `SESSION_ENCRYPTION_KEY` for restoring decryptable sessions if a Vercel domain detach is ever needed. Move both keys to a vault after the 30-day burn-in.
