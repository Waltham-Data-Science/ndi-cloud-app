/**
 * Stream 6.3 — branch-aware `/api/*` rewrite contract.
 *
 * The cloud-app's preview deploys must route to two different
 * backends depending on branch:
 *   - feat/experimental-ask-chat → ndb-v2-experimental
 *   - everything else            → UPSTREAM_API_URL (production)
 *
 * If this priority flips, every preview hits production silently —
 * which would defeat the experimental Railway env. This test pins the
 * priority + the no-config fallback.
 */
import { describe, expect, it } from 'vitest';

import { apiRewriteFor } from '@/lib/next-config/api-rewrite';

describe('apiRewriteFor (branch-aware rewrite)', () => {
  it('routes feat/experimental-ask-chat to ndb-v2-experimental', () => {
    const rewrites = apiRewriteFor({
      VERCEL_GIT_COMMIT_REF: 'feat/experimental-ask-chat',
      UPSTREAM_API_URL: 'https://ndb-v2-production.up.railway.app',
    });
    expect(rewrites).toEqual([
      {
        source: '/api/:path*',
        destination: 'https://ndb-v2-experimental.up.railway.app/api/:path*',
      },
    ]);
  });

  it('branch override wins over UPSTREAM_API_URL (priority order)', () => {
    // Critical: Vercel sets UPSTREAM_API_URL on the Preview scope for
    // EVERY preview branch. Without the branch override winning, the
    // experimental branch would hit production Railway silently. This
    // test fails if someone re-orders the precedence.
    const rewrites = apiRewriteFor({
      VERCEL_GIT_COMMIT_REF: 'feat/experimental-ask-chat',
      UPSTREAM_API_URL: 'https://ndb-v2-production.up.railway.app',
    });
    expect(rewrites[0]?.destination).toContain(
      'ndb-v2-experimental.up.railway.app',
    );
    expect(rewrites[0]?.destination).not.toContain(
      'ndb-v2-production.up.railway.app',
    );
  });

  it('routes main / other branches to UPSTREAM_API_URL', () => {
    const rewrites = apiRewriteFor({
      VERCEL_GIT_COMMIT_REF: 'main',
      UPSTREAM_API_URL: 'https://ndb-v2-production.up.railway.app',
    });
    expect(rewrites).toEqual([
      {
        source: '/api/:path*',
        destination: 'https://ndb-v2-production.up.railway.app/api/:path*',
      },
    ]);
  });

  it('returns no rewrites when both branch override and UPSTREAM are absent', () => {
    expect(apiRewriteFor({})).toEqual([]);
  });

  it('returns no rewrites when UPSTREAM_API_URL is empty string', () => {
    // Vercel/env files can pass an empty value when un-set; we treat
    // that as "no rewrite" (matches the parent next.config.ts guard).
    expect(
      apiRewriteFor({
        VERCEL_GIT_COMMIT_REF: 'main',
        UPSTREAM_API_URL: '',
      }),
    ).toEqual([]);
  });

  it('strips a trailing slash on UPSTREAM_API_URL', () => {
    const rewrites = apiRewriteFor({
      VERCEL_GIT_COMMIT_REF: 'main',
      UPSTREAM_API_URL: 'https://example.up.railway.app/',
    });
    expect(rewrites[0]?.destination).toBe(
      'https://example.up.railway.app/api/:path*',
    );
  });

  it('an unrelated branch with no UPSTREAM returns []', () => {
    expect(
      apiRewriteFor({ VERCEL_GIT_COMMIT_REF: 'feat/some-other-branch' }),
    ).toEqual([]);
  });
});
