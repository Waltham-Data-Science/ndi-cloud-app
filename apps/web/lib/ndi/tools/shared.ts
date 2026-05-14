/**
 * Shared infrastructure for tool handlers — anything that isn't
 * specific to a single tool but needs to live outside `lib/ai/chat-tools.ts`
 * to keep that file legible.
 */
import { env } from '@/lib/env';

const TOOL_TIMEOUT_MS = 8_000;

export type ToolError = { error: string };
export type ToolResult<T> = T | ToolError;

/**
 * Per-call execution context threaded through every tool handler.
 *
 * The chat runs handlers anonymously by design (the /ask preview is
 * public-data-only). The workspace, by contrast, is auth-gated and
 * needs the user's session cookie to reach private datasets. This
 * context is how we make the same handler work in BOTH modes without
 * branching per surface.
 *
 *   - From chat `/api/ask`: passed as `undefined`. Handler's fetch
 *     calls go out anonymous. Behavior unchanged.
 *
 *   - From workspace wrapper routes (`app/api/datasets/[id]/.../route.ts`):
 *     extract `Cookie` and `X-XSRF-TOKEN` headers from the incoming
 *     `NextRequest` and pass them through here. Handler's fetch
 *     calls forward both, so the FastAPI backend authenticates the
 *     caller and returns private records the user has access to.
 *
 * Adding more fields here is fine (request id, abort signal,
 * rate-limit subject, etc.) as long as `undefined` remains a valid
 * shape for anonymous chat callers.
 */
export interface ToolContext {
  /**
   * Forwarded auth headers (Cookie + optional X-XSRF-TOKEN). When
   * present, every `fetch` inside the handler MUST merge these into
   * its `headers` object. `undefined` = anonymous.
   */
  authHeaders?: Record<string, string>;
}

/**
 * Extract auth headers from a Next.js Request for forwarding to
 * FastAPI. Server-side helper used by workspace wrapper routes.
 *
 * Reads the inbound `Cookie` and `X-XSRF-TOKEN` headers — both are
 * what FastAPI's auth middleware + CsrfMiddleware look at — and
 * returns them in the shape `ToolContext.authHeaders` expects. The
 * tool handler then merges them into its own outbound `fetch` calls.
 *
 * Returns `undefined` (the anonymous case) when neither header is
 * present. Returns a `{ Cookie?, 'X-XSRF-TOKEN'? }` partial when at
 * least one is present.
 */
export function authHeadersFromRequest(
  req: Request,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  const cookie = req.headers.get('cookie');
  if (cookie) out.Cookie = cookie;
  const csrf = req.headers.get('x-xsrf-token');
  if (csrf) out['X-XSRF-TOKEN'] = csrf;
  return Object.keys(out).length > 0 ? out : undefined;
}

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
 * Structured-log emitter for /api/ask + tool handlers. Writes
 * single-line JSON to stdout via console.log so Vercel's function-logs
 * surface aggregates one event per row. Centralized here so the event
 * shape stays consistent across the request lifecycle and the 14 tool
 * handlers.
 *
 * Intentionally NEVER logs message bodies / PII — props should be
 * sizes, ids, counts, error kinds. Compaction follow-up if log volume
 * becomes a cost concern; the prototype budget is generous.
 */
export function logEvent(event: string, props: Record<string, unknown> = {}): void {
  // Structured prod logs go to console.log so Vercel's function-logs
  // surface aggregates them per-request.
  console.log(JSON.stringify({ event, ts: Date.now(), ...props }));
}

/**
 * One-liner for tool-handler entry — records the tool name + a small,
 * non-sensitive subset of input args. Callers pass a sanitized props
 * object (ids + sizes only) — DO NOT pass raw input objects that may
 * contain free-form natural-language queries.
 */
export function logToolInvocation(
  name: string,
  props: Record<string, unknown> = {},
): void {
  logEvent(`chat.tool.${name}.invoked`, props);
}

/**
 * Typed GET against the FastAPI proxy. Same contract as the helper in
 * the main `chat-tools.ts` — duplicated here so per-tool files don't
 * reach across into another module. Resolves to either the parsed JSON
 * body or a `{ error }` object the LLM can handle gracefully.
 *
 * Accepts an optional ToolContext — when provided, auth headers (Cookie
 * + X-XSRF-TOKEN) are merged into the outbound request so private-
 * dataset reads work in the workspace surface. When omitted (the chat
 * path), the request goes out anonymous as before.
 */
export async function fetchJson<T>(
  url: string,
  ctx?: ToolContext,
): Promise<ToolResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(ctx?.authHeaders ?? {}),
      },
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

/**
 * Typed POST against the FastAPI proxy. Same auth + timeout posture
 * as `fetchJson`, plus a JSON-encoded body and an explicit
 * `Origin: https://ndi-cloud.com` header so the backend's
 * OriginEnforcementMiddleware admits the request. (FastAPI rejects
 * POST without an allowlisted Origin by design — see proxy.ts in
 * apps/web for the matching frontend enforcement.)
 *
 * Same `ctx?` parameter as `fetchJson`: anonymous when omitted,
 * auth-forwarding when present.
 */
export async function postJson<T>(
  url: string,
  body: unknown,
  ctx?: ToolContext,
): Promise<ToolResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: 'https://ndi-cloud.com',
        ...(ctx?.authHeaders ?? {}),
      },
      body: JSON.stringify(body),
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
