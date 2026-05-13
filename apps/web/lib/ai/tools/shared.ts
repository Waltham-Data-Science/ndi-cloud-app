/**
 * Shared infrastructure for Day 2+ tool handlers — anything that isn't
 * specific to a single tool but needs to live outside `lib/ai/tools.ts`
 * to keep that file legible.
 */

const TOOL_TIMEOUT_MS = 8_000;

export type ToolError = { error: string };
export type ToolResult<T> = T | ToolError;

export function baseUrl(): string | null {
  const u = process.env.INTERNAL_API_URL;
  return typeof u === 'string' && u.length > 0 ? u : null;
}

export function isErrorResult<T>(r: ToolResult<T>): r is ToolError {
  return typeof r === 'object' && r !== null && 'error' in r;
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
