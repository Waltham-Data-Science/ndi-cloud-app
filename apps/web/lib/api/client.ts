/**
 * apiFetch — typed fetch wrapper for the FastAPI proxy.
 *
 * Phase 3a extension of the Phase 2b minimum-viable port. Adds:
 *   - ensureCsrfToken bootstrap when XSRF-TOKEN cookie is missing
 *     (cold-load mutations would otherwise fail FastAPI's CSRF gate;
 *     this matches data-browser PR #76 behavior — a single bootstrap
 *     GET to /api/auth/csrf populates the non-HttpOnly cookie which
 *     the rest of the session reads via document.cookie)
 *   - typed error catalog (ErrorCode + Recovery + requestId surfaced
 *     on ApiError; FastAPI envelope `{ error: { ... } }` unwrapped
 *     before construction so consumers match on err.code without
 *     dotted paths)
 *   - idempotencyKey option, propagated as X-Idempotency-Key
 *   - explicit AbortSignal forwarding (already worked via spread
 *     in Phase 2b; documented here for the cancel-on-disconnect
 *     contract that flows from TanStack Query into apiFetch)
 *
 * The CSRF flow is **double-submit**, NOT per-request token fetch:
 *   1. Server sets non-HttpOnly XSRF-TOKEN cookie at session establish
 *      (login response, /me, or this module's bootstrap).
 *   2. JS reads it via document.cookie.
 *   3. Client echoes it in X-XSRF-TOKEN on every mutation.
 *   4. Server validates header matches cookie.
 *
 * Lives outside `'use client'` — framework-agnostic. Hooks that consume
 * it carry their own `'use client'` directive.
 */
import { ApiError } from './errors';

export { ApiError };
export type { ApiErrorBody, ErrorCode, Recovery } from './errors';

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';
const CSRF_BOOTSTRAP_PATH = '/api/auth/csrf';
const IDEMPOTENCY_HEADER = 'X-Idempotency-Key';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const re = new RegExp(`(?:^|; )${name}=([^;]+)`);
  const match = document.cookie.match(re);
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Reads the XSRF-TOKEN cookie; if missing, bootstraps via a GET to
 * /api/auth/csrf which causes the server to issue Set-Cookie. Returns
 * the token or null if the bootstrap also failed (offline / 5xx). The
 * caller decides whether to proceed without CSRF — for FastAPI the
 * mutation will fail server-side, which is the intended fail-closed
 * behavior.
 */
async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;

  try {
    const res = await fetch(CSRF_BOOTSTRAP_PATH, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    // Re-read cookie — that's the canonical source. Some test harnesses
    // (jsdom) won't honor Set-Cookie, so fall back to body.csrfToken.
    const fresh = readCookie(CSRF_COOKIE);
    if (fresh) return fresh;

    try {
      const body = (await res.json()) as { csrfToken?: unknown };
      return typeof body.csrfToken === 'string' ? body.csrfToken : null;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Structural type for response-shape validators. Anything with a
 * `parse(data: unknown) => unknown` method works — primarily zod
 * schemas, but also any custom validator that exposes a parse-style
 * API.
 *
 * The parse return type is `unknown` (not `T`) on purpose. Schemas
 * function as a STRUCTURAL gate — they ensure the response matches a
 * minimum shape, which is enough to catch backend drift. The caller's
 * declared `apiFetch<T>` return type is what TypeScript sees; the
 * schema's job is to throw on shape failure, not to narrow types. This
 * lets a loose schema (`DatasetRecordCoreSchema`, with `.passthrough`)
 * front a richer client-side TypeScript interface (`DatasetRecord`,
 * with 30+ optional fields) without forcing every optional field into
 * the schema. See `apps/web/lib/api/schemas/datasets.ts`.
 *
 * Kept structural (not bound to `z.ZodType`) so we don't tie the
 * fetch wrapper to a single library version.
 */
export interface ResponseSchema {
  parse: (data: unknown) => unknown;
}

export type ApiFetchInit = Omit<RequestInit, 'body'> & {
  /**
   * Request body. Plain objects are JSON-stringified and Content-Type
   * is set to application/json. Strings, FormData, Blob, URLSearchParams,
   * and ArrayBuffer pass through unchanged so the caller controls the
   * encoding.
   */
  body?: unknown;
  /**
   * Idempotency key for safe retries on mutating endpoints — propagated
   * as `X-Idempotency-Key`. The FastAPI proxy de-duplicates retries that
   * carry the same key + body within a short window.
   */
  idempotencyKey?: string;
  /**
   * Optional zod-style schema (anything with `parse(unknown) => T`).
   * When set, `apiFetch` runs `schema.parse(json)` after JSON.parse on
   * 2xx JSON responses — the parsed value is what the caller receives.
   * On parse failure, `apiFetch` throws `ApiError(status,
   * { code: 'RESPONSE_SHAPE_INVALID' })`. This is CQ1 — it closes the
   * cast-as-trust gap where a backend rename or missing field would
   * surface as a downstream null-deref.
   *
   * Schema validation is only applied to 2xx responses with a JSON
   * content-type. 204s, error bodies, and non-JSON 2xx responses are
   * unaffected — the schema is silently ignored.
   */
  schema?: ResponseSchema;
};

export async function apiFetch<T = unknown>(
  path: string,
  init: ApiFetchInit = {},
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  // CSRF double-submit on mutations. Bootstrap if cookie missing.
  if (MUTATING_METHODS.has(method)) {
    const token = await ensureCsrfToken();
    if (token) {
      headers.set(CSRF_HEADER, token);
    }
    // If still null we proceed — server fails closed. Better signal
    // than a silent client-side block; matches data-browser semantics.
  }

  if (init.idempotencyKey) {
    headers.set(IDEMPOTENCY_HEADER, init.idempotencyKey);
  }

  // Body encoding. Pass-throughs first (typeof check + instanceof on
  // shapes that fetch() accepts directly); fall back to JSON.stringify.
  let body: BodyInit | undefined;
  if (init.body === undefined || init.body === null) {
    body = undefined;
  } else if (
    typeof init.body === 'string' ||
    init.body instanceof FormData ||
    init.body instanceof Blob ||
    init.body instanceof URLSearchParams ||
    init.body instanceof ArrayBuffer
  ) {
    body = init.body as BodyInit;
  } else {
    body = JSON.stringify(init.body);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  // Strip our extension keys from RequestInit so `fetch` doesn't choke.
  const {
    idempotencyKey: _idempotencyKey,
    body: _body,
    schema: _schema,
    ...rest
  } = init;
  void _idempotencyKey;
  void _body;
  void _schema;

  const response = await fetch(path, {
    ...rest,
    method,
    body,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let raw: unknown = null;
    try {
      raw = await response.json();
    } catch {
      // Non-JSON error body — surface a generic ApiError below.
    }
    // Unwrap FastAPI envelope `{ error: { ... } }` if present. Both
    // shapes (envelope + flat) flow through ApiError uniformly: the
    // constructor reads `code` / `message` / `recovery` / `requestId`
    // off whichever inner shape arrives.
    const inner =
      raw !== null &&
      typeof raw === 'object' &&
      'error' in raw &&
      typeof (raw as { error: unknown }).error === 'object' &&
      (raw as { error: unknown }).error !== null
        ? (raw as { error: unknown }).error
        : raw;
    throw new ApiError(response.status, inner);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = (await response.json()) as unknown;
    // CQ1: optional schema-based runtime validation. Only consulted on
    // 2xx JSON. Failure → ApiError with code RESPONSE_SHAPE_INVALID at
    // the original 2xx status (typically 200) — the wire succeeded, the
    // body shape didn't match. recovery=contact_support because retries
    // don't fix backend shape drift; UI surfaces requestId for support.
    if (init.schema) {
      try {
        return init.schema.parse(json) as T;
      } catch (parseError) {
        throw new ApiError(response.status, {
          code: 'RESPONSE_SHAPE_INVALID',
          message:
            'The server returned an unexpected response shape. Please contact support.',
          recovery: 'contact_support',
          requestId: response.headers.get('x-request-id') ?? null,
          details:
            parseError instanceof Error
              ? { message: parseError.message }
              : { message: String(parseError) },
        });
      }
    }
    return json as T;
  }
  // Non-JSON 2xx — return text. Caller knows what to do.
  return (await response.text()) as unknown as T;
}
