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

  // Phase 4: production rewrite target. Optional in Phase 1 because no
  // /api/* rewrite is wired yet.
  UPSTREAM_API_URL: z.string().url().optional(),

  // Phase 3a: RSC server-side fetch target (bypasses the Vercel rewrite to
  // avoid double-hop). Optional until catalog RSC ships.
  INTERNAL_API_URL: z.string().url().optional(),

  // Phase 6.7 A8: Sentry DSN. NEXT_PUBLIC_ prefix because the SDK reads it
  // both server-side (instrumentation.ts) and client-side (instrumentation-
  // client.ts); a Sentry DSN is by design publicly embeddable in client
  // bundles (Sentry's threat model relies on per-project rate limits, not
  // DSN secrecy). When unset, `Sentry.init({ dsn: undefined })` is a no-op
  // so dev / un-provisioned builds work without error capture.
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),

  // Phase 5: Edge Config connection string. Optional until middleware ships.
  EDGE_CONFIG: z.string().url().optional(),
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
