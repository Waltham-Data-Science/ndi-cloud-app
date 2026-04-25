/**
 * `next.config.ts` rewrite contract — Phase 4.
 *
 * Asserts the `/api/:path*` rewrite shape so a future refactor can't
 * silently strip the proxy. The rewrite is gated on
 * `UPSTREAM_API_URL` — these tests exercise both branches:
 *   - Unset (dev / test) → no rewrite, empty array
 *   - Set → exactly one rewrite mapping `/api/*` to upstream
 *
 * Note: dynamic-importing `next.config.ts` via `await import()` runs
 * the side-effect env validation at the top (`import './lib/env'`).
 * That's already covered by the env tests; here we just unwrap the
 * default-exported config and call `.rewrites()`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ORIGINAL_UPSTREAM = process.env.UPSTREAM_API_URL;

beforeEach(() => {
  delete process.env.UPSTREAM_API_URL;
});

afterEach(() => {
  if (ORIGINAL_UPSTREAM === undefined) {
    delete process.env.UPSTREAM_API_URL;
  } else {
    process.env.UPSTREAM_API_URL = ORIGINAL_UPSTREAM;
  }
});

// Static import — vitest can't handle dynamic-template imports. The
// rewrite function reads `process.env.UPSTREAM_API_URL` at CALL time,
// not import time, so per-test env mutation is fine: just set/unset
// the env var before each call.
import config from '../../next.config';

async function loadRewrites(): Promise<
  Array<{ source: string; destination: string }>
> {
  if (typeof config.rewrites !== 'function') return [];
  const result = await config.rewrites();
  if (Array.isArray(result)) return result;
  return [
    ...(result.beforeFiles ?? []),
    ...(result.afterFiles ?? []),
    ...(result.fallback ?? []),
  ];
}

describe('next.config rewrites', () => {
  it('returns no rewrites when UPSTREAM_API_URL is unset (dev/test)', async () => {
    const rewrites = await loadRewrites();
    expect(rewrites).toHaveLength(0);
  });

  it('proxies /api/:path* to UPSTREAM_API_URL when set', async () => {
    process.env.UPSTREAM_API_URL = 'https://ndb-v2-production.up.railway.app';
    const rewrites = await loadRewrites();
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0]).toEqual({
      source: '/api/:path*',
      destination: 'https://ndb-v2-production.up.railway.app/api/:path*',
    });
  });

  it('strips a trailing slash from UPSTREAM_API_URL before composing the target', async () => {
    process.env.UPSTREAM_API_URL = 'https://api.example.com/';
    const rewrites = await loadRewrites();
    expect(rewrites[0]?.destination).toBe('https://api.example.com/api/:path*');
  });
});
