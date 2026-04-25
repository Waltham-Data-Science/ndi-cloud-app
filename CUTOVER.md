# Cutover checklist — Phase 7

Manual smoke + pre-swap verification before the atomic Vercel domain
swap. The agent that ran Phases 1-6 stops here. **You** drive Phase 7.

> **HSTS-preload callout (read first).** Production traffic served with
> `Strict-Transport-Security: max-age=63072000; includeSubDomains;
> preload` for 1+ day means browsers cache the preload directive.
> **Rolling back to HTTP is not a path** — only HTTPS old-project.
> Removal from the preload list requires submitting to
> [hstspreload.org](https://hstspreload.org) for delisting plus 6+
> months for browser updates to propagate. If the swap fails and you
> need to roll back, the rollback is HTTPS-old-project, NOT
> HTTP-anything.

## Pre-swap checklist (everything must be ✅)

- [ ] **Phase 6 CI fully green on `main`** — last 5 commits' CI all
      passed
- [ ] **Phase 4 backend PR shipped** — `ndi-data-browser-v2` cookie
      domain change merged, Railway redeployed (cookie now sets
      `Domain=.ndi-cloud.com` in production). Verify with:

      ```bash
      curl -sSI https://app.ndi-cloud.com/api/auth/csrf | grep -i set-cookie
      # Expect: Domain=.ndi-cloud.com; Secure; ...
      ```

- [ ] **`UPSTREAM_API_URL` env var set on Vercel project**
      (production + preview env scopes). Value:
      `https://ndb-v2-production.up.railway.app`.
- [ ] **`INTERNAL_API_URL` env var set** (same value, used by RSC
      catalog prefetch to bypass the rewrite double-hop).
- [ ] **`EDGE_CONFIG` connection string set** (Phase 5 follow-up).
      `ndi-flags` Edge Config store created with `FEATURE_PIVOT_V1: false`.
- [ ] **Skew Protection enabled** (Vercel UI: project → Settings →
      Functions → Skew Protection). Verify with:

      ```bash
      PLAYWRIGHT_PREVIEW_URL=https://<preview>.vercel.app \
        pnpm -C apps/web test:e2e tests/e2e/skew-protection.spec.ts
      ```

- [ ] **CSP flipped from Report-Only to enforced** (`middleware.ts`
      line currently emitting `Content-Security-Policy-Report-Only`
      → flip to `Content-Security-Policy`). Run after a clean 24h
      Report-Only soak with no legitimate-script violations in
      Vercel logs. Verify with:

      ```bash
      PLAYWRIGHT_PREVIEW_URL=https://<preview>.vercel.app \
        pnpm -C apps/web test:e2e tests/e2e/csp-headers.spec.ts
      ```

- [ ] **`FastAPI` `ALLOWED_ORIGINS` includes both
      `https://ndi-cloud.com` AND `https://app.ndi-cloud.com`**
      (Phase 4 backend keeps the legacy origin for the burn-in
      window).
- [ ] **Preview deploy passes Phase 6 manual smoke** (this checklist
      run against a preview URL):

      ```bash
      PLAYWRIGHT_PREVIEW_URL=https://<preview>.vercel.app \
        pnpm -C apps/web test:e2e
      ```

- [ ] **Lighthouse ≥95 on Performance, A11y, SEO** for the 5 primary
      routes:

      ```bash
      pnpm -C apps/web exec lhci autorun
      ```

- [ ] **Announcement email drafted**: "you may need to sign in
      again" — Phase 7 step 5 rotates SESSION_SECRET, forcing
      re-login for everyone with a pre-rotation cookie.
- [ ] **New `SESSION_SECRET` generated and stored in 1Password / vault**:

      ```bash
      python -c "import secrets; print(secrets.token_urlsafe(64))"
      ```

      Keep the OLD secret too — rollback restores it.
- [ ] **Migration window confirmed** with stakeholders.

## Swap sequence (~30 seconds wall-clock)

1. Old `ndi-web-app` project → Settings → Domains → detach
   `ndi-cloud.com` and `www.ndi-cloud.com`.
2. New `ndi-cloud-app` project → Settings → Domains → attach
   `ndi-cloud.com` + `www.ndi-cloud.com` (Vercel issues fresh certs
   in ~30s).
3. Old `ndi-data-browser-v2` project → Settings → Domains → detach
   `app.ndi-cloud.com`.
4. New `ndi-cloud-app` project → Settings → Domains → attach
   `app.ndi-cloud.com` as redirect-to-apex
   (`301 https://ndi-cloud.com${path}`) — preserves bookmarks like
   `app.ndi-cloud.com/datasets/d1/overview`.
5. **Rotate `SESSION_SECRET` on Railway** (`ENV=production` →
   redeploy). Forced re-login becomes a property of the deploy, not
   a hope. **Critical**: this step happens AFTER the domain swap, not
   before — rotating mid-swap could log out users on the still-live
   `app.ndi-cloud.com` before the new monorepo owns the apex.

## Watch window (60 minutes)

- **Vercel Analytics error rate**. Threshold for rollback: >2% 5xx
  sustained for 5 minutes.
- **Railway FastAPI logs** for Origin rejections (would surface as 403).
- **Smoke suite once against production**:

  ```bash
  PLAYWRIGHT_PREVIEW_URL=https://ndi-cloud.com \
    pnpm -C apps/web test:e2e
  ```

- **Login success rate**: temporary spike in re-login traffic is
  expected (proves SESSION_SECRET rotation worked). Real failure
  signal: 4xx on /api/auth/login over the baseline pre-rotation rate.

## Rollback (30-second hatch)

1. Vercel UI: detach `ndi-cloud.com` from new project, re-attach to
   old `ndi-web-app`.
2. Detach `app.ndi-cloud.com` redirect, re-attach to old
   `ndi-data-browser-v2`.
3. **Revert `SESSION_SECRET`** to the pre-rotation value (from
   1Password). Without this, the legacy project can't issue valid
   sessions anymore.
4. Revert FastAPI `Domain=.ndi-cloud.com` change if cookie breakage
   was the trigger (redeploy previous Railway image tag).

## Post-cutover (next 30 days)

- Old projects stay deployed but un-domained. **No code changes.**
- After 30 days, Phase 8: archive `Waltham-Data-Science/ndi-web-app-wds`
  and `Waltham-Data-Science/ndi-data-browser-v2` (NOT delete —
  archive preserves history forever and is reversible).
- Drop FastAPI static-files mount (`backend/app.py` line that mounts
  `frontend/dist`). Drop the Dockerfile copying `frontend/dist`.
  Railway becomes API-only.

## Audit follow-ups status (entering Phase 7)

- ✅ #65 (dataset tab a11y) — closed in Phase 3b
- ✅ #64 (MyDatasets virtualization) — closed in Phase 3c
- ✅ #66 (OntologyPopover → FloatingPanel) — closed in Phase 3d
- All three migration-absorbed audits closed.
- #72 (Grafana dashboards) — independent track (parallel agent),
  plan parked at `ndi-data-browser-v2/docs/superpowers/plans/
  2026-04-25-grafana-dashboards-72.md`. Critical finding: no
  Grafana instance exists yet — this is a Phase 0 provisioning task.

## Files of record

- Migration plan: `/Users/audribhowmick/.claude/plans/sharded-puzzling-dragonfly.md`
- Persistent plan doc: `ndi-data-browser-v2/docs/plans/cross-repo-unification-2026-04-24.md`
  (POST-PHASE-2 STATE, POST-PHASE-3a STATE sections)
- Monorepo: `Waltham-Data-Science/ndi-cloud-app` (this repo)
- Old marketing repo: `Waltham-Data-Science/ndi-web-app-wds` (archived in Phase 8)
- Old data-browser repo: `Waltham-Data-Science/ndi-data-browser-v2`
  (archived in Phase 8 after the static-mount drop)
