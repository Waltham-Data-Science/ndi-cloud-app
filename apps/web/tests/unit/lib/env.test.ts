/**
 * Tests for lib/env.ts (zod-validated process.env).
 *
 * The validation runs at module load — a malformed environment fails the
 * BUILD, not the first request. These tests exercise the schema directly
 * by re-importing the module under different process.env states using
 * vitest's `vi.resetModules()`.
 *
 * Phase 4 will add tightened tests around UPSTREAM_API_URL once the rewrite
 * is wired (it's optional in Phase 1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('lib/env', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('parses a clean development environment', async () => {
    process.env = { NODE_ENV: 'development' };
    const { env } = await import('@/lib/env');
    expect(env.NODE_ENV).toBe('development');
    expect(env.UPSTREAM_API_URL).toBeUndefined();
    expect(env.INTERNAL_API_URL).toBeUndefined();
    expect(env.EDGE_CONFIG).toBeUndefined();
  });

  it('defaults NODE_ENV to "development" if unset', async () => {
    process.env = {};
    const { env } = await import('@/lib/env');
    expect(env.NODE_ENV).toBe('development');
  });

  it('accepts UPSTREAM_API_URL when set to a valid URL', async () => {
    process.env = {
      NODE_ENV: 'production',
      UPSTREAM_API_URL: 'https://ndb-v2-production.up.railway.app',
    };
    const { env } = await import('@/lib/env');
    expect(env.UPSTREAM_API_URL).toBe('https://ndb-v2-production.up.railway.app');
  });

  it('throws when UPSTREAM_API_URL is set but malformed', async () => {
    process.env = {
      NODE_ENV: 'production',
      UPSTREAM_API_URL: 'not-a-url',
    };
    await expect(import('@/lib/env')).rejects.toThrow(/UPSTREAM_API_URL/);
  });

  it('throws on invalid NODE_ENV', async () => {
    process.env = { NODE_ENV: 'staging' };
    await expect(import('@/lib/env')).rejects.toThrow(/NODE_ENV/);
  });
});
