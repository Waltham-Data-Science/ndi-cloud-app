/**
 * Edge Config flag reader.
 *
 * Phase 5 wires `@vercel/edge-config` so RSC pages can read feature
 * flags without a Railway round-trip. The Edge Config store is
 * `ndi-flags`; first key shipped is `FEATURE_PIVOT_V1` (replacing the
 * FastAPI env var so the catalog RSC at `/datasets/[id]/pivot/[grain]`
 * can server-side check whether to render the tab without a network
 * call).
 *
 * Server-only — relies on `EDGE_CONFIG` connection string in env.
 * Falls back to a sensible default when unset (dev / test) so calls
 * don't need to branch on env presence.
 */
import { get } from '@vercel/edge-config';

export type FlagKey = 'FEATURE_PIVOT_V1';

/**
 * Read a flag from the `ndi-flags` Edge Config store. Returns the
 * provided fallback when:
 *   - `EDGE_CONFIG` env is unset (dev / test)
 *   - The Edge Config call throws (network / store-not-found / etc.)
 *   - The key is not present in the store
 *
 * Always async so callers don't change shape when the store is wired.
 */
export async function getFlag<T = boolean>(
  key: FlagKey,
  fallback: T,
): Promise<T> {
  if (!process.env.EDGE_CONFIG) return fallback;
  try {
    const value = await get(key);
    if (value === undefined) return fallback;
    return value as T;
  } catch {
    return fallback;
  }
}
