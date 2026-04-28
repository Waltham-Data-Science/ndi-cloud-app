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
- [ ] **Skew Protection enabled** (Vercel UI: project → Settings →
      Functions → Skew Protection). Verify with a one-line curl —
      a bogus `?dpl=` parameter must return 404, not 200. If 200
      comes back, Skew Protection is not actually pinning requests
      (the toggle reports as on but isn't enforcing):

      ```bash
      curl -sS -o /dev/null -w "%{http_code}\n" \
        https://<preview>.vercel.app/?dpl=bogusdeploymentid
      # Expect: 404
      ```

- [ ] **CSP flipped from Report-Only to enforced** (`proxy.ts`
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
      again" — Phase 7 step 5 rotates `SESSION_ENCRYPTION_KEY`, which
      makes every existing Redis-stored session undecryptable. The
      session store catches the resulting `InvalidToken` and deletes
      the bad blob, surfacing as a soft re-auth (the user is bounced
      to `/login`). Forced re-login is a property of the deploy.
- [ ] **New `SESSION_ENCRYPTION_KEY` generated and stored in 1Password / vault**:

      ```bash
      python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
      ```

      Produces a 44-char base64-urlsafe Fernet key. The
      `_derive_fernet_key` helper at
      `ndi-data-browser-v2/backend/auth/session.py:52` accepts either
      a real Fernet key (preferred) or any string ≥32 chars (SHA-256
      derived). Keep the OLD key too — rollback restores it.
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
5. **Rotate `SESSION_ENCRYPTION_KEY` on Railway** (`ENV=production`
   → redeploy). Forced re-login becomes a property of the deploy,
   not a hope (the new key can't decrypt blobs encrypted under the
   old key; `SessionStore._read` catches `InvalidToken` and deletes
   the corrupt entry, then `useSession` resolves to null and the
   user is bounced to `/login`). **Critical**: this step happens
   AFTER the domain swap, not before — rotating mid-swap could log
   out users on the still-live `app.ndi-cloud.com` before the new
   monorepo owns the apex.

6. **🔒 LOGIN GATE — verify before proceeding to watch window.**

   This is the single most important post-swap gate. Pre-cutover, the
   new app's auth flow could only be partially verified because the
   `Domain=.ndi-cloud.com` cookie is rejected on `*.vercel.app` URLs
   (browser-level cookie-domain rule, well-defined per RFC 6265). At
   step 2 above, the apex is finally pointed at this project, so the
   page origin matches the cookie domain — auth on the new code
   becomes testable for the first time.

   **Procedure** (≤ 60 seconds):

   - Open `https://ndi-cloud.com/login` in a private/incognito window
     (no stale cookies from any prior context).
   - Sign in with a known-valid test account.
   - Confirm: redirect to `/my` succeeds, the workspace renders with
     dataset rows, no red error banners. Header shows the signed-in
     state (avatar/menu, not "Log in").
   - Open DevTools → Network → click any catalog row to navigate to
     a dataset detail. Confirm the auth cookie is sent on requests
     (Cookie header carries `session=...`).
   - Sign out via the header menu. Confirm `/my` redirects back to
     `/login` and the cookie is cleared.

   **PASS** → continue to step 7 (watch window).

   **FAIL** → execute rollback (next section) immediately. DO NOT
   spend more than 5 minutes diagnosing a login regression on the
   live apex; rolling back to the legacy project takes ~30 s and is
   strictly safer than the unknown-cause failure mode. After rollback
   investigate the failure offline, file a fix PR, redeploy, and
   re-attempt cutover later.

7. **Cutover-day code cleanup (PR after step 6 passes)** — the
   pre-cutover Origin allowlist hardcode is now obsolete and the
   new apex is the strict allowlist target. Ship the cleanup:

   - Delete the `'https://ndi-cloud-app-web.vercel.app'` line +
     `PRE-PHASE-7-CUTOVER` warning block from
     `apps/web/proxy.ts`'s allowlist Set.
   - Delete the env-var defense-in-depth path in
     `getAllowedOrigins()` (the
     `if (readEnv('VERCEL_ENV') === 'production' &&
     envFlagOn('ALLOW_PROJECT_PRODUCTION_URL_ORIGIN'))` block).
   - Update `apps/web/tests/unit/proxy.test.ts`: drop the three
     pre-cutover test cases (production-admits-hardcoded-alias,
     production+flag-admits-PROD_URL, production+flag-still-rejects-
     unrelated). Add a regression test pinning that the alias now
     403s.
   - Vercel dashboard: delete `ALLOW_PROJECT_PRODUCTION_URL_ORIGIN`
     from the Production environment vars.

   Search `PRE-PHASE-7-CUTOVER` across the repo to confirm no other
   references remain. Single-PR title:
   `chore(cutover): restore strict apex-only Origin allowlist`.

   Order matters: ship this AFTER step 6 passes, BEFORE the watch
   window expires. The hardcode is harmless to keep for an extra
   hour but should not survive into the post-cutover steady state.

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
  expected (proves `SESSION_ENCRYPTION_KEY` rotation worked — every
  pre-rotation session decrypts as `InvalidToken` and resolves to
  null on the next `/api/auth/me`). Real failure signal: 4xx on
  `/api/auth/login` over the baseline pre-rotation rate.

## Rollback (30-second hatch)

1. Vercel UI: detach `ndi-cloud.com` from new project, re-attach to
   old `ndi-web-app`.
2. Detach `app.ndi-cloud.com` redirect, re-attach to old
   `ndi-data-browser-v2`.
3. **Revert `SESSION_ENCRYPTION_KEY`** to the pre-rotation value
   (from 1Password). Without this, sessions issued under the old
   key remain undecryptable and the legacy project can't restore
   user sessions for the burn-in window.
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
