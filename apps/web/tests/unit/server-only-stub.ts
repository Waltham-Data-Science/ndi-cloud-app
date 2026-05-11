/**
 * Stub for Next.js's `'server-only'` sentinel module under vitest.
 *
 * The real `server-only` package exports nothing — its purpose is to
 * throw at build time when Next's compiler sees it imported from a
 * `'use client'` boundary. In vitest there's no Next compiler; the
 * static `import 'server-only'` statement still needs to resolve so
 * vite's transform pass doesn't reject the module before vi.mock can
 * intercept.
 *
 * Mapped via vitest.config.ts's `resolve.alias['server-only']`.
 * Empty exports — server-only modules are still tested via the
 * real source.
 */
export {};
