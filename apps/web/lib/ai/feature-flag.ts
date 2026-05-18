/**
 * Feature flags for the experimental /ask chat.
 *
 * Two independent signals:
 *   - `ANTHROPIC_API_KEY` (server-only) gates the route handler.
 *   - `NEXT_PUBLIC_ASK_ENABLED` (browser-visible) gates the nav link.
 *
 * The split lets us deploy the API key for testing without exposing
 * the tab to general visitors, or hide the tab pre-demo while leaving
 * the route live for /ask direct links.
 *
 * Both functions take an input record (typically `process.env`) so they
 * can be unit-tested without mutating live env. Default to `process.env`
 * for production callsites.
 */
export function askEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const key = env.ANTHROPIC_API_KEY;
  return typeof key === 'string' && key.length > 0;
}

export function askNavVisible(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.NEXT_PUBLIC_ASK_ENABLED === '1';
}
