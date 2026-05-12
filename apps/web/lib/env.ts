/**
 * Zod-validated environment.
 *
 * The `schema` is exported so unit tests can exercise validation against
 * synthetic input without mutating `process.env` (which fights TypeScript's
 * strict `NodeJS.ProcessEnv` typing). The default `env` export validates
 * the live `process.env` at module load — a malformed environment fails
 * the BUILD, not the first request. Aligns with the data-browser pattern
 * of failing loud at boot rather than mysterious 500s in production.
 */
import { z } from 'zod';

export const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Production rewrite target — Vercel proxies `/api/*` here (FastAPI on
  // Railway). Optional because preview/dev builds without a configured
  // upstream still build and run; `/api/*` simply 404s until set.
  UPSTREAM_API_URL: z.string().url().optional(),

  // RSC server-side fetch target (bypasses the Vercel rewrite to avoid a
  // server→edge→server double-hop). Optional because RSC prefetch and
  // dataset-detail metadata generation degrade gracefully without it.
  INTERNAL_API_URL: z.string().url().optional(),

  // Shared secret used to authenticate cron invocations of the
  // `/api/cron/warm-cache` route. When set, requests must carry
  // `Authorization: Bearer ${CRON_SECRET}` OR the Vercel-injected
  // `x-vercel-cron: 1` header. When unset, the route still works for
  // Vercel's own cron (it sets the `x-vercel-cron` header at the edge)
  // but external callers are rejected. Optional so dev/test builds
  // and Vercel's own cron continue to function out-of-the-box.
  CRON_SECRET: z.string().min(16).optional(),

  // Vercel system env vars — injected automatically on Vercel builds.
  // Optional + free-form because they're absent in local dev / bare
  // CI runs, and Vercel's contract for these is "either-or-nothing"
  // rather than a stable format we'd want to validate.
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  VERCEL_URL: z.string().optional(),

  // Anthropic API key for the experimental /ask chat. Optional —
  // when unset, the /api/ask route returns 503 and the /ask page
  // shows a "coming soon" notice. Setting this enables the route;
  // nav visibility is controlled separately by NEXT_PUBLIC_ASK_ENABLED.
  ANTHROPIC_API_KEY: z.string().min(20).optional(),

  // Public flag toggling the "Ask" link in the marketing nav. Set
  // to '1' to show. Public-prefixed because it's read in the browser
  // bundle (the Header is 'use client'). Decoupled from
  // ANTHROPIC_API_KEY so we can deploy the key without surfacing
  // the tab to general visitors.
  NEXT_PUBLIC_ASK_ENABLED: z.enum(['0', '1']).optional(),
});

export type Env = z.infer<typeof schema>;

/**
 * Parse + validate an env-like record. Exported so tests can exercise the
 * error-formatting path with synthetic input — directly calling this with
 * `process.env` is the production code path.
 */
export function parseEnv(input: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }
  // Format the issues human-readably so a build failure is actionable.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment:\n${issues}`);
}

export const env: Env = parseEnv();
