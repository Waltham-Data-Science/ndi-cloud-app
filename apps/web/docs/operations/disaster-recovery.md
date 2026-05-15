# Disaster recovery runbook

**Audience:** on-call operator (currently Audri), prospective deputy
operator, IRB / CISO auditors verifying continuity posture.

**Last reviewed:** 2026-05-15

This runbook documents recovery procedures for every named failure mode.
Each scenario has a stated Recovery Time Objective (RTO — how long until
service restored) and Recovery Point Objective (RPO — how much data we
might lose). Tested cadence is captured in §6.

The complementary doc `apps/web/docs/operations/vendor-dependencies.md`
covers what each external service does and the migration paths if the
vendor itself becomes unviable. This doc is operational — what to do
when something breaks at 3 AM.

---

## 1. Overview — RTO / RPO summary

| Scenario | RTO | RPO | First responder action |
|---|---|---|---|
| Vercel deploy regression | < 5 min | 0 | "Promote previous" in Vercel dashboard |
| Railway redeploy regression | < 10 min | 0 | "Rollback to previous" in Railway |
| FastAPI Postgres data corruption | < 1 hour | < 24h | Restore from Railway-managed nightly backup |
| Railway-hosted Redis loss | < 5 min | All active sessions (forced re-login) | Provision new Redis; force re-login |
| `SESSION_ENCRYPTION_KEY` leaked / rotated | < 1 hour | 0 (forced re-login) | Rotate key + redeploy; users see "session expired" once |
| `CSRF_SIGNING_KEY` leaked / rotated | < 1 hour | 0 | Same shape as above; one stale-token CSRF retry per user |
| `VOYAGE_API_KEY` leaked / rotated | < 30 min | 0 | Rotate Voyage dashboard + update Vercel `Preview` env + redeploy |
| `ANTHROPIC_API_KEY` leaked / rotated | < 30 min | 0 | Rotate Anthropic dashboard + update Vercel env + redeploy |
| `DATABASE_URL` (RAG store) rotated | < 30 min | 0 | Rotate Railway Postgres password + update Vercel env + redeploy |
| `ndi-cloud-node` (AWS) outage | Dependent on AWS recovery | <1 hour | Out of scope — wait for AWS restoration; cloud-side status page |
| AWS Cognito User Pool corruption | Dependent on AWS recovery | Backup-restore time | Use Cognito admin backup; account-recovery flow |
| AWS DocumentDB regional outage | Hours | < 5 min (continuous backup) | Out of scope today — would require multi-region failover not configured |
| S3 binary loss | Cannot recover without backup | Cannot recover | Versioning recommended (not currently required at research scope) |
| Single-operator unavailable | Days | 0 | **Documented gap.** Add deputy operator before covered-entity onboarding. |

---

## 2. Application-level rollbacks (RTO < 5-10 min)

### 2.1 Vercel frontend regression

**Detection:** Synthetic check failing on `https://ndi-cloud.com/`, or user
report. Vercel sends deploy-status email on failed deploys.

**Procedure:**

1. Open Vercel dashboard → Deployments tab.
2. Find the previous green deployment (the one before the broken one).
3. Click "Promote to Production" on that deployment.
4. Wait ~30s for the alias to update.
5. Verify by hitting `https://ndi-cloud.com/?cache-bust=$(date +%s)` and
   inspecting the response.

**RTO:** < 5 minutes from detection.

**No code change required** — Vercel keeps every successful build's
artifacts addressable by deployment ID.

**Postmortem:** mandatory if the regression touched production-affecting
code. File at `apps/web/docs/security/` if security-related, else at
`apps/web/docs/operations/` with a `postmortem-` prefix.

### 2.2 Railway backend regression

**Detection:** `/api/health` returning 5xx, or 502s from Vercel
`rewrites()`. Railway sends crash-loop alerts.

**Procedure:**

1. Open Railway dashboard → `ndi-data-browser-v2` service → Deployments.
2. Find the previous Active deployment.
3. Click "Rollback to this deployment".
4. Wait ~60s for the container to redeploy.
5. Verify by curling `https://ndb-v2-production.up.railway.app/api/health`.

**RTO:** < 10 minutes.

**Gotcha:** if the regression introduced a Postgres schema migration that
also ran, the rollback alone won't undo the schema change. Most schema
changes are additive (new columns / tables) and don't break old code, but
verify by reading the rollback target's `app.py` startup logs.

---

## 3. Data-store recovery

### 3.1 Postgres data corruption / accidental deletion

**Detection:** Application-level errors on queries that previously worked,
user reports of missing data, or operator notices `pgvector` query
returns empty results.

**Procedure:**

1. Open Railway dashboard → Postgres service → Backups tab.
2. Railway runs nightly backups automatically (default — verify settings).
   Pick the most recent pre-incident backup.
3. Provision a new Postgres database from the backup.
4. Update `DATABASE_URL` (and any related env vars like
   `INTERNAL_DATABASE_URL`) on the FastAPI service + cloud-app Vercel
   `Preview` env.
5. Redeploy both services.
6. Verify with a smoke query.

**RTO:** < 1 hour. **RPO:** < 24 hours (whatever's between the last nightly
backup and the incident).

**Postmortem trigger:** any data loss event.

### 3.2 Redis session loss

**Detection:** All authenticated requests start returning 401. The Redis
URL is unchanged but the data is gone.

**Procedure:**

1. Verify Redis is responding: `redis-cli -u $REDIS_URL ping` should
   return `PONG`. If not, restart the Redis instance via Railway dashboard.
2. If Redis is up but empty, that's expected behavior — every session
   key naturally expired, or someone ran `FLUSHALL`. Recovery is
   automatic: users re-login.
3. No code change or env-var change required.

**RTO:** < 5 minutes (Redis restart) or 0 (organic — users just see
"session expired" once).

**RPO:** All active sessions (forced re-login). Acceptable — session data
is ephemeral by ADR-003 (sibling repo).

---

## 4. Secret rotation runbooks

### 4.1 `SESSION_ENCRYPTION_KEY` (Fernet)

**Trigger:** Key suspected of leak (e.g. found in git history), or
scheduled rotation per security policy.

**Procedure:**

1. Generate a new 32-byte Fernet key:
   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```
2. On the Railway dashboard, update the `SESSION_ENCRYPTION_KEY` env var
   on the FastAPI service. **Save the OLD key to the rollback-keys vault
   first** so you can decrypt residual sessions if needed.
3. Redeploy the FastAPI service (Railway redeploys automatically on env
   var change).
4. Verify by attempting a login from a fresh browser tab — fresh session
   should land cleanly.

**Impact:** Every previously-issued session cookie becomes undecryptable
(Fernet `InvalidToken`), and the FastAPI session-fetch path falls through
to "no session → re-login required". Users see a "Session expired, please
log in again" message on their next request.

**RTO:** < 1 hour, dominated by the manual rotation steps.

**Blast radius:** ALL active users see one forced re-login. Documented in
ADR-003 (sibling repo).

### 4.2 `CSRF_SIGNING_KEY` (HMAC)

Same shape as 4.1. The blast radius is smaller — only in-flight CSRF
tokens at the moment of rotation are invalidated; the user just sees
"please retry" on the next POST.

### 4.3 `VOYAGE_API_KEY` (third-party)

The May 2026 leaked-credentials incident
(`apps/web/docs/security/2026-05-14-leaked-credentials-resolved.md`)
walked through the full rotation. Reproduced here for reference:

1. Revoke the old key in the Voyage dashboard.
2. Generate a new key.
3. Update the key in EVERY consumer:
   - Railway `vh-lab-chatbot` env
   - Railway `shrek-lab-chatbot` env
   - Vercel `ndi-cloud-app` `Preview` scope env
   - (Vercel `Production` scope: only when Stream 3 launches auth-gated `/ask`)
4. Redeploy each consumer.
5. Verify `/ask` semantic-search query works.

**RTO:** < 30 minutes.

### 4.4 `ANTHROPIC_API_KEY`

1. Rotate in Anthropic dashboard.
2. Update Vercel `Preview` (and `Production` once Stream 3 ships) env.
3. Redeploy.

**RTO:** < 30 minutes.

### 4.5 `DATABASE_URL` (RAG pgvector store)

1. Rotate Postgres password in Railway dashboard.
2. Update Vercel `Preview` env var.
3. Redeploy.

**RTO:** < 30 minutes.

---

## 5. Vendor outages

### 5.1 Vercel down

**Detection:** Vercel status page red; `ndi-cloud.com` returning 5xx.

**Operator response:**

1. Confirm via https://vercel-status.com/.
2. Post to user-facing status page (currently TBD — see §8 open items).
3. Wait for Vercel recovery.

There is no failover; we accept Vercel's SLO for current scope.

### 5.2 Railway down

**Detection:** Railway dashboard unreachable; backend `/api/health`
returning 5xx.

**Operator response:**

1. Confirm via https://status.railway.app/.
2. Wait for recovery.
3. If Railway is degraded for hours, consider standing up emergency
   FastAPI deployment on Fly.io (documented procedure TBD — adding to
   §8 open items).

### 5.3 ndi-cloud-node (AWS) down

**Detection:** Backend `/api/auth/me` returning `503` with
`error.code = "cloud_unreachable"`.

**Operator response:**

1. Confirm in AWS console (us-east-1 Lambda + DocumentDB status).
2. The FastAPI circuit breaker (`backend/clients/circuit_breaker.py`)
   should already be open and failing fast.
3. Wait for AWS recovery. No application-side action.

---

## 6. Backup verification cadence

| Backup | Verified how often? | Last verified |
|---|---|---|
| Railway Postgres nightly | **TBD — not yet on a cadence.** | n/a |
| Vercel build artifacts (immutable per-deploy) | Continuously (every deploy verifies the previous) | implicit |
| AWS S3 binary versioning | Off (would enable for covered-entity onboarding) | n/a |
| Cognito user-pool backup | AWS-managed; not verified by us | n/a |
| Custom secret-key offline backup (password manager) | **TBD** | n/a |

**§8 open item:** add a quarterly restore-test job to Railway Postgres
backups. Procedure: provision a throwaway DB from the latest backup,
connect, run a smoke query, drop the throwaway DB. Capture the
restore-test result + duration in a `apps/web/docs/operations/backup-verification.md`
log (new doc to create on first run).

---

## 7. Communication protocol during incidents

### Internal (single-operator era)

- Status flagged in this repo by creating a `apps/web/docs/operations/INCIDENTS/incident-YYYY-MM-DD-<short-name>.md` file.
- Track timeline + root cause + remediation in that file.
- Move to `apps/web/docs/security/` if the incident is security-related.

### External

- Currently no public status page. Affected users learn via direct email
  (rare at current scale).
- For Stream 7+ scope: add an `https://status.ndi-cloud.com` page (Statuspage
  / Better Stack / equivalent).

---

## 8. Open items

| # | Item | Severity | Owner |
|---|---|---|---|
| 1 | Quarterly Postgres restore-test | Low | Operator |
| 2 | Deputy operator with Vercel + Railway + AWS admin | Low → Blocker for covered-entity onboarding | Operator |
| 3 | Public status page | Low | Operator (Statuspage / similar) |
| 4 | Emergency Fly.io standby procedure | Low | Operator |
| 5 | S3 binary versioning enablement | Out of scope today | `ndi-cloud-node` operator |
| 6 | Multi-region DocumentDB failover | Out of scope today | `ndi-cloud-node` operator |

These are not blocking for current research-data scope. Each is referenced
in `apps/web/docs/compliance/posture.md` §6-9 as posture items.

---

## 9. Update history

| Date | Change |
|---|---|
| 2026-05-15 | Initial runbook (Stream 2.3 deliverable). Folded in the rotation procedure from the May 2026 credential-leak incident. |
