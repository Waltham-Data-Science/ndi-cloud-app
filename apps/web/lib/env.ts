/**
 * Zod-validated environment.
 *
 * Imported from next.config.ts so missing/malformed env fails the BUILD,
 * not the first request. Aligns with the data-browser pattern of failing
 * loud at boot rather than mysterious 500s in production.
 */
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Phase 4: production rewrite target. Optional in Phase 1 because no
  // /api/* rewrite is wired yet.
  UPSTREAM_API_URL: z.string().url().optional(),

  // Phase 3a: RSC server-side fetch target (bypasses the Vercel rewrite to
  // avoid double-hop). Optional until catalog RSC ships.
  INTERNAL_API_URL: z.string().url().optional(),

  // Phase 5: Edge Config connection string. Optional until middleware ships.
  EDGE_CONFIG: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Format the issues human-readably so a build failure is actionable.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment:\n${issues}`);
}

export const env: Env = parsed.data;
