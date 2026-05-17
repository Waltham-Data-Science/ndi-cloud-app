/**
 * Branch-aware `/api/*` rewrite for next.config.ts.
 *
 * Extracted from `next.config.ts:rewrites()` (Stream 6.3, 2026-05-15)
 * so the routing decision can be unit-tested in isolation — the parent
 * `next.config.ts` side-effect-imports `./lib/env` (zod-validated)
 * which makes importing it from a vitest run brittle.
 *
 * Decision tree (priority order):
 *   1. Branch === `feat/experimental-ask-chat` → experimental Railway
 *      env (`ndb-v2-experimental.up.railway.app`). This pairs the
 *      cloud-app draft branch with the matching backend draft so the
 *      preview reaches the experimental NDI-python integration.
 *   2. `UPSTREAM_API_URL` set → use that (production-shaped).
 *   3. Neither → return `{}` (no rewrite; `/api/*` resolves to a
 *      Next.js 404 unless a local route handler matches).
 *
 * # Placement: `fallback`, not the default
 *
 * Audit 2026-05-18 localized a 405 on the BehavioralCompare panel:
 * the workspace wrapper routes (`/api/datasets/[id]/tabular-query`,
 * `/api/datasets/[id]/psth`, etc. — local Next.js route handlers)
 * were being bypassed in favor of this rewrite, with Railway
 * responding directly. Cause: Vercel's external-URL rewrites at the
 * default placement run BEFORE local functions, not after. The
 * default `Rewrite[]` return shape in Next.js maps to the
 * "afterFiles" bucket which runs after STATIC pages but before
 * DYNAMIC routes — and our route handlers are dynamic (`[id]`
 * segment). So Railway won every dynamic `/api/...` request.
 *
 * Returning `{ fallback: [...] }` puts the rewrite in the bucket
 * that runs LAST — after every file-system route check, including
 * dynamic ones. Local handlers now have unconditional priority;
 * the rewrite only fires for paths the cloud-app explicitly
 * doesn't handle (which is most of `/api/*` since this monorepo
 * delegates the bulk of API work to Railway).
 *
 * See ADR-005 in `apps/web/docs/architecture/decisions/` for the
 * full rationale.
 */

export interface Rewrite {
  source: string;
  destination: string;
}

/**
 * Next.js `rewrites()` return shape using the priority buckets.
 * `fallback` runs after every file-system + dynamic route match —
 * which is exactly what we want for the Railway proxy so local
 * route handlers win unconditionally.
 */
export interface RewriteBuckets {
  beforeFiles?: Rewrite[];
  afterFiles?: Rewrite[];
  fallback?: Rewrite[];
}

export interface ApiRewriteEnv {
  /** Vercel-injected branch ref (e.g. `feat/experimental-ask-chat`). */
  VERCEL_GIT_COMMIT_REF?: string;
  /** Production rewrite target. Empty / undefined = no rewrite. */
  UPSTREAM_API_URL?: string;
}

const EXPERIMENTAL_BRANCH = 'feat/experimental-ask-chat';
const EXPERIMENTAL_BACKEND = 'https://ndb-v2-experimental.up.railway.app';

export function apiRewriteFor(env: ApiRewriteEnv): RewriteBuckets {
  const branchOverride =
    env.VERCEL_GIT_COMMIT_REF === EXPERIMENTAL_BRANCH
      ? EXPERIMENTAL_BACKEND
      : undefined;
  const upstream = branchOverride ?? env.UPSTREAM_API_URL;
  if (!upstream) return {};
  return {
    // `fallback` runs only when nothing in the local file-system
    // route tree matched. This is what makes local handlers win
    // over the Railway proxy — see file header for the audit
    // story that drove this placement change.
    fallback: [
      {
        source: '/api/:path*',
        destination: `${upstream.replace(/\/$/, '')}/api/:path*`,
      },
    ],
  };
}
