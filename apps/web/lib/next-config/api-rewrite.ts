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
 *   3. Neither → return [] (no rewrite; `/api/*` resolves to a Next.js
 *      404 since this monorepo has no `app/api/*` for catalog paths).
 *
 * See ADR-005 in `apps/web/docs/architecture/decisions/` for the full
 * rationale.
 */

export interface Rewrite {
  source: string;
  destination: string;
}

export interface ApiRewriteEnv {
  /** Vercel-injected branch ref (e.g. `feat/experimental-ask-chat`). */
  VERCEL_GIT_COMMIT_REF?: string;
  /** Production rewrite target. Empty / undefined = no rewrite. */
  UPSTREAM_API_URL?: string;
}

const EXPERIMENTAL_BRANCH = 'feat/experimental-ask-chat';
const EXPERIMENTAL_BACKEND = 'https://ndb-v2-experimental.up.railway.app';

export function apiRewriteFor(env: ApiRewriteEnv): Rewrite[] {
  const branchOverride =
    env.VERCEL_GIT_COMMIT_REF === EXPERIMENTAL_BRANCH
      ? EXPERIMENTAL_BACKEND
      : undefined;
  const upstream = branchOverride ?? env.UPSTREAM_API_URL;
  if (!upstream) return [];
  return [
    {
      source: '/api/:path*',
      destination: `${upstream.replace(/\/$/, '')}/api/:path*`,
    },
  ];
}
