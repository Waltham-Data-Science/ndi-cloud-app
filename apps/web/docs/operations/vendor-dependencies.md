# Vendor dependencies — inventory and posture

**Audience:** operators, contributors evaluating a vendor swap, IRB / CISO
reviewers tracing data flow.

**Last reviewed:** 2026-05-15

This document inventories every external service NDI Cloud depends on. For
each: what we use it for, data sensitivity (does it touch PHI?), whether a
BAA is in place, what happens when it's down, the migration path if we
needed to swap, and notable contract / renewal dates.

The complementary doc `apps/web/docs/operations/disaster-recovery.md` covers
the runbook side: how each outage is detected, what the on-call response
looks like, and the RTO / RPO commitments.

---

## At-a-glance dependency map

```
Browser
   │
   ▼
 Vercel (edge + Next.js runtime)
   │
   ├── Vercel Analytics (telemetry, no PHI)
   ├── Vercel Speed Insights (telemetry)
   │
   ▼
 Railway (FastAPI proxy)
   │
   ├── Railway Postgres (rate-limit counters, /ask RAG index, future chat_usage_events)
   ├── Railway Redis (sessions, response cache)
   │
   ├── Anthropic API (only the /ask chat)
   ├── Voyage AI (embedding + rerank for /ask RAG)
   │
   ▼
 ndi-cloud-node (AWS Lambda — owned in a separate repo)
   │
   ├── AWS Cognito User Pool   (identity)
   ├── AWS DocumentDB           (dataset metadata)
   ├── AWS S3                   (binary recordings)
   │
   ├── Crossref DOI API         (DOI minting on dataset publish)
   ├── S3 tutorials bucket      (read-only — .mlx tutorial files)
```

Every box below is sized by criticality: top-tier vendors (Cognito, Vercel,
Railway, AWS S3, AWS DocumentDB) are platform-critical — losing any of
them takes the platform offline. Second-tier (Anthropic, Voyage) only
affect the experimental `/ask` chat. Third-tier (Crossref, Vercel
Analytics) are nice-to-have features.

---

## Tier 1 — platform-critical

### Vercel

| Field | Value |
|---|---|
| **Used for** | Hosting the Next.js 16 frontend (`ndi-cloud-app`). Edge CDN, ISR, RSC streaming, image optimization. |
| **Touches PHI?** | No. Vercel serves rendered HTML and proxies `/api/*` to Railway via `rewrites()`. Request bodies pass through but are not stored or logged by Vercel at any layer beyond standard edge-access logs. |
| **BAA?** | Available on Enterprise plan only. Current plan is Pro. Upgrade required for covered-entity onboarding. |
| **Outage impact** | Frontend unreachable. `ndi-cloud.com` returns 5xx. No data loss because Vercel holds only ephemeral / derived state (built artifacts, edge cache). |
| **Migration path** | Next.js App Router is platform-portable. Could relocate to Cloudflare Pages, AWS Amplify, or self-host on AWS ECS / Fly.io. Bundle gates + ISR config would need re-validation. Estimated ~3-5 days of work. |
| **SLO** | Vercel publishes 99.99% uptime for Pro plan. Historical reality: tracks closely. |
| **Notable details** | Single-operator dashboard access (Audri). Deploy promotion + env-var management lives here. Skew protection enabled (`deploymentId` in `next.config.ts`). |
| **Contract** | Pro plan, monthly billing. No long-term contract. |

### Railway

| Field | Value |
|---|---|
| **Used for** | Hosting the FastAPI backend (`ndi-data-browser-v2`) + Postgres (rate-limit counters, `/ask` RAG index, future `chat_usage_events`) + Redis (sessions, response cache). |
| **Touches PHI?** | Sessions hold the Fernet-encrypted Cognito access token (decryptable only with `SESSION_ENCRYPTION_KEY`). No raw PHI. Postgres holds dataset chunk embeddings + curated metadata — no PHI at current scope. |
| **BAA?** | **Not offered at any tier as of 2026-Q2.** This is the binding constraint for covered-entity onboarding. |
| **Outage impact** | All authenticated routes fail. Vercel still serves the marketing site + static catalog pages, but anything that proxies through `/api/*` returns 502. |
| **Migration path** | FastAPI is stateless; the proxy code itself relocates trivially. The migration surface is Postgres + Redis: would lift to AWS RDS + ElastiCache (HIPAA-eligible, BAA-available) or Fly.io HIPAA tier. ADR-004 in this repo (and the sibling `ndi-data-browser-v2/docs/adr/004-drop-sqlite-dataset-storage.md`) was written specifically to preserve this option. Estimated ~5-7 days of work. |
| **SLO** | Railway publishes 99.9% for Pro tier (Hobby tier no SLO). |
| **Notable details** | Two environments: `production` (env id `e0c00fb7-...`) and `experimental` (env id `90101f6e-...`). The experimental env is the only target for `feat/experimental-ask-chat` branch deploys — never touch `production` env from the cloud-app draft branch. |
| **Contract** | Pro plan, monthly billing. |

### AWS — Cognito, DocumentDB, S3

| Field | Value |
|---|---|
| **Used for** | Identity (Cognito User Pool), dataset metadata (DocumentDB), binary recordings (S3). Owned by the sibling repo `ndi-cloud-node`. |
| **Touches PHI?** | Today: no — research subject identifiers are codes (`mouse-A12-2024`), not patient identifiers. For covered-entity onboarding: yes, but Cognito + DocumentDB + S3 are all HIPAA-eligible. |
| **BAA?** | AWS BAA is **available but not executed**. Would execute as a covered-entity onboarding prerequisite. |
| **Outage impact** | (a) Cognito down → no login + no session refresh. (b) DocumentDB down → no dataset reads. (c) S3 down → no binary downloads, signal viewer broken. Each is independently catastrophic. |
| **Migration path** | AWS-resident. Migration off AWS would be a major project (~weeks). Within AWS, regional failover not configured at current scope — would require multi-region replication setup before any high-availability claim. |
| **SLO** | AWS publishes individual service SLOs (99.9% Cognito, 99.95% S3 standard). All three currently in `us-east-1` so the region is a shared dependency. |
| **Notable details** | All three are managed in the `ndi-cloud-node` AWS account, not the `ndi-cloud-app` operator. Operator-level access to swap Cognito / DocumentDB / S3 settings requires the `ndi-cloud-node` admin credentials. |
| **Contract** | Pay-as-you-go AWS billing. No reserved capacity. |

---

## Tier 2 — `/ask` chat only

### Anthropic (Claude API)

| Field | Value |
|---|---|
| **Used for** | LLM orchestration for the `/ask` chat — currently Sonnet 4.x. ALL chat reasoning + tool calls go through this. |
| **Touches PHI?** | Today: no (chat is anonymous-public, talks only about published catalog data — no user-uploaded data, no private datasets). Future: when Stream 3 ships the auth-gated tab, chat tools will forward auth and could theoretically touch private datasets — but published datasets only contain de-identified research data. |
| **BAA?** | Available on Enterprise plan only. Not currently engaged. Not blocking at current scope; would be required for any user-uploaded-data flow. |
| **Outage impact** | `/ask` returns 503. No other surface affected. The chat is feature-flagged via `NEXT_PUBLIC_ASK_ENABLED` so the marketing nav can hide the feature on degraded responses. |
| **Migration path** | AI SDK v6 (Vercel's abstraction) supports OpenAI, Anthropic, Google Gemini, Cohere, etc. Swapping providers is a one-file change to the model identifier — BUT each provider's tool-calling shape, JSON-mode behavior, and prompt sensitivity is different, so any swap would require re-tuning the SYSTEM_PROMPT + re-running the replay harness. Estimated 1-2 days of validation. |
| **SLO** | Anthropic publishes no formal SLO. Historical reality: occasional regional incidents, generally <1h. |
| **Notable details** | API key in Vercel `Preview`-scope env var only (production scope keeps it unset until Stream 3 launches auth-gated). Per-user spending cap (Stream 3.2 deliverable) reads usage from this provider's response headers. |
| **Contract** | Pay-as-you-go billing. Soft spending cap NOT yet configured on the dashboard — flagged as user-side task T1.10. |

### Voyage AI (embedding + rerank)

| Field | Value |
|---|---|
| **Used for** | `voyage-4-large` for query embedding + `voyage rerank-2.5` for hybrid-retrieval reranking. Used only by `semantic_search_datasets` tool in the `/ask` chat. |
| **Touches PHI?** | No. Embeds search queries (anonymous user input) + dataset chunk text (published catalog metadata only). |
| **BAA?** | Inquire on enterprise contract. Not relevant at current scope. |
| **Outage impact** | `semantic_search_datasets` returns soft-error; chat falls back to structured catalog tools. User experience degrades but chat keeps working. |
| **Migration path** | Could swap to OpenAI's `text-embedding-3-large` or Cohere's `embed-multilingual-v3.0`. Would require re-baking the entire pgvector index (one-time cost). Estimated ~1 day. |
| **SLO** | Voyage publishes no formal SLO. |
| **Notable details** | Same key shared across `ndi-cloud-app`, `vh-lab-chatbot`, and `shrek-lab-chatbot`. The 2026-05-13 incident (see `apps/web/docs/security/2026-05-14-leaked-credentials-resolved.md`) leaked + rotated this key. **Lesson learned:** consider per-project Voyage keys before scaling beyond current 3 chatbots — a leak in one project compromised all three. |
| **Contract** | Pay-as-you-go. |

---

## Tier 3 — feature dependencies

### Crossref (DOI minting)

| Field | Value |
|---|---|
| **Used for** | Mint a Crossref DOI for each published dataset. Owned by `ndi-cloud-node`. |
| **Touches PHI?** | No — metadata only (title, authors, license, landing-page URL). |
| **BAA?** | N/A — public-data service. |
| **Outage impact** | New-dataset publication blocked until Crossref recovers. Existing dataset DOIs continue resolving via doi.org. |
| **Migration path** | Crossref is the de facto DOI provider for research data; DataCite is the alternative (also free for research). Switch would require a one-time re-mint of every existing DOI — practically not worth doing. |
| **SLO** | None published. Historically reliable; outages typically <2h. |
| **Notable details** | We are a Crossref member with annual fees. |

### S3 tutorials bucket

| Field | Value |
|---|---|
| **Used for** | Public read-only S3 bucket hosting `.mlx` tutorial files for the labchat / data-browser tutorials. URL pattern: `https://ndi-cloud-tutorials.s3.us-east-2.amazonaws.com/tutorial_<id>.mlx`. |
| **Touches PHI?** | No. Public research-tutorial content. |
| **BAA?** | N/A. |
| **Outage impact** | Catalog pages render fine; the "Tutorials" section just shows empty state. |
| **Migration path** | Trivial — re-host on any public-read S3 / GCS / Cloudflare R2 bucket. Update the URL pattern in the frontend config. |
| **SLO** | AWS S3 99.95% standard. |

### Vercel Analytics + Speed Insights

| Field | Value |
|---|---|
| **Used for** | Page-view counters + Core Web Vitals + Speed Insights dashboard. |
| **Touches PHI?** | No. Vercel publishes its analytics privacy posture — no PII, no IP storage. |
| **BAA?** | N/A. |
| **Outage impact** | No analytics dashboards. Site keeps serving. |
| **Migration path** | Replace with Plausible / Fathom / self-hosted Umami. ~1 hour. |
| **SLO** | Tied to Vercel platform SLO. |

---

## Custom keys + secrets inventory

| Secret | Owner | Rotation procedure | Blast radius of loss |
|---|---|---|---|
| `SESSION_ENCRYPTION_KEY` | Railway env (FastAPI) | `ndi-data-browser-v2/docs/RUNBOOK.md` §"Key rotation" | All active sessions invalidated → forced global re-login. No data loss. |
| `CSRF_SIGNING_KEY` | Railway env (FastAPI) | Same runbook | All in-flight CSRF tokens invalidated → users see one extra "session expired" message on their next POST. |
| `ANTHROPIC_API_KEY` | Vercel `Preview`-scope env | Rotate in Anthropic dashboard + update Vercel | `/ask` chat returns 503. Once rotated, take effect on next deploy. |
| `VOYAGE_API_KEY` | Vercel `Preview`-scope env + Railway env on the two lab-chatbots | Rotate in Voyage dashboard, update all three places, redeploy each | All semantic-search-using surfaces (`/ask`, vh-lab, shrek-lab) return soft errors until rotated. |
| `DATABASE_URL` (pgvector RAG store) | Vercel `Preview`-scope env | Rotate in Railway Postgres dashboard, update Vercel | `/ask` semantic search returns soft error. |
| `CRON_SECRET` | Vercel env | Regenerate locally + update Vercel | External cron callers blocked; Vercel-managed cron continues unaffected (uses `x-vercel-cron` header instead). |

The 2026-05-14 leaked-credentials incident
(`apps/web/docs/security/2026-05-14-leaked-credentials-resolved.md`) is the
canonical reference for the BFG-rewrite + rotation procedure if credentials
ever land in git history again.

---

## Lessons learned

| Date | Lesson | Concrete action |
|---|---|---|
| 2026-05-13/14 | Pre-compact checkpoint docs are high-risk for secret leaks; example bash blocks with real credentials. | Pre-compact docs now ALWAYS use placeholder values (`<your-postgres-url>`), per the security incident postmortem. |
| 2026-05-13/14 | Shared Voyage key across 3 projects → one leak compromised all three. | Consider per-project Voyage keys as service count grows. Not actioned yet — single-project rotation is still cheap at current scale. |
| 2026-05-13/14 | Pre-commit gitleaks hook isn't always active on contributor machines. | Master plan T1.9 (user-side): `git config core.hooksPath .githooks` locally. CI gate also runs gitleaks as a safety net. |

---

## Update history

| Date | Change |
|---|---|
| 2026-05-15 | Initial inventory (Stream 2.2 deliverable). |
