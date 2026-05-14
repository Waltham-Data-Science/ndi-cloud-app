/**
 * Shared infrastructure for Day 2+ tool handlers — anything that isn't
 * specific to a single tool but needs to live outside `lib/ai/tools.ts`
 * to keep that file legible.
 */
import { env } from '@/lib/env';

const TOOL_TIMEOUT_MS = 8_000;

export type ToolError = { error: string };
export type ToolResult<T> = T | ToolError;

export function baseUrl(): string | null {
  // Branch-aware override (parallels next.config.ts rewrites()): when the
  // Vercel preview is the experimental Ask chat branch, route SERVER-side
  // tool calls to the experimental Railway env instead of production.
  // Without this, the chat would hit production ndb-v2 which doesn't have
  // the new Phase A/B endpoints (tabular_query, etc.) — every new-tool
  // call returns "Upstream returned 404" or a network error.
  //
  // Production / main / other-branch previews keep using INTERNAL_API_URL
  // exactly as before.
  if (env.VERCEL_GIT_COMMIT_REF === 'feat/experimental-ask-chat') {
    return 'https://ndb-v2-experimental.up.railway.app';
  }
  const u = env.INTERNAL_API_URL;
  return typeof u === 'string' && u.length > 0 ? u : null;
}

/**
 * Discriminate a tool-error envelope (`{ error: string }` — single
 * key) from a successful payload that happens to *contain* a nested
 * `error` field (e.g. the FastAPI signal endpoint's `BackendSignalResponse`
 * has `error: string | null` as part of its shape — `null` on success).
 *
 * We can't just check `'error' in r` because that would mis-classify
 * the backend's success-with-error-field-null shape. Instead require
 * the result to have ONLY an `error` key, and that key's value to be
 * a string.
 */
export function isErrorResult<T>(r: ToolResult<T>): r is ToolError {
  if (typeof r !== 'object' || r === null) return false;
  const keys = Object.keys(r);
  return (
    keys.length === 1 &&
    keys[0] === 'error' &&
    typeof (r as Record<string, unknown>).error === 'string'
  );
}

/**
 * Typed GET against the FastAPI proxy. Same contract as the helper in
 * the main `tools.ts` — duplicated here so per-tool files don't reach
 * across into another module. Resolves to either the parsed JSON body
 * or a `{ error }` object the LLM can handle gracefully.
 */
export async function fetchJson<T>(url: string): Promise<ToolResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      return { error: `Upstream returned ${res.status}` };
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { error: 'Network timeout (8s exceeded)' };
    }
    return { error: 'Network error contacting catalog service' };
  } finally {
    clearTimeout(timer);
  }
}
