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
