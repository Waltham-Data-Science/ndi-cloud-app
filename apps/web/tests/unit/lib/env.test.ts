/**
 * Tests for lib/env.ts (zod-validated process.env).
 *
 * We exercise the schema directly via the `schema` export rather than
 * mutating global `process.env` — that keeps these tests pure (no shared
 * state between tests) and sidesteps TypeScript's strict NodeJS.ProcessEnv
 * typing (which doesn't allow assigning {} or arbitrary string literals).
 *
 * Phase 4 will tighten UPSTREAM_API_URL semantics (currently optional;
 * required once the rewrite is wired).
 */
import { describe, expect, it } from 'vitest';
import { parseEnv, schema } from '@/lib/env';

describe('lib/env schema', () => {
  it('parses an empty input and defaults NODE_ENV to "development"', () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.UPSTREAM_API_URL).toBeUndefined();
      expect(result.data.INTERNAL_API_URL).toBeUndefined();
    }
  });

  it('accepts a valid production environment with all URLs set', () => {
    const result = schema.safeParse({
      NODE_ENV: 'production',
      UPSTREAM_API_URL: 'https://ndb-v2-production.up.railway.app',
      INTERNAL_API_URL: 'https://ndb-v2-production.up.railway.app',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('production');
      expect(result.data.UPSTREAM_API_URL).toBe('https://ndb-v2-production.up.railway.app');
    }
  });

  it('rejects NODE_ENV values outside the allowed enum', () => {
    const result = schema.safeParse({ NODE_ENV: 'staging' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['NODE_ENV']);
    }
  });

  it('rejects malformed UPSTREAM_API_URL', () => {
    const result = schema.safeParse({
      NODE_ENV: 'production',
      UPSTREAM_API_URL: 'not-a-url',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const upstreamIssue = result.error.issues.find((i) =>
        i.path.includes('UPSTREAM_API_URL'),
      );
      expect(upstreamIssue).toBeDefined();
    }
  });

  it('rejects malformed INTERNAL_API_URL', () => {
    const result = schema.safeParse({ INTERNAL_API_URL: 'http: //bad' });
    expect(result.success).toBe(false);
  });

  it('accepts test NODE_ENV (used by vitest)', () => {
    const result = schema.safeParse({ NODE_ENV: 'test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('test');
    }
  });
});

describe('parseEnv', () => {
  it('returns parsed Env when input is valid', () => {
    const result = parseEnv({
      NODE_ENV: 'production',
      UPSTREAM_API_URL: 'https://api.example.com',
    });
    expect(result.NODE_ENV).toBe('production');
    expect(result.UPSTREAM_API_URL).toBe('https://api.example.com');
  });

  it('defaults NODE_ENV when input omits it', () => {
    const result = parseEnv({});
    expect(result.NODE_ENV).toBe('development');
  });

  it('throws a human-readable error listing every issue when input is invalid', () => {
    let caught: Error | undefined;
    try {
      parseEnv({
        NODE_ENV: 'staging',
        UPSTREAM_API_URL: 'not-a-url',
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain('Invalid environment:');
    expect(caught!.message).toContain('NODE_ENV');
    expect(caught!.message).toContain('UPSTREAM_API_URL');
  });
});
