/**
 * apiFetch — typed fetch wrapper for the FastAPI proxy.
 *
 * Phase 2b minimum-viable port — covers what the auth flows need:
 * cookie-based session via `credentials: 'include'`, CSRF double-submit
 * on mutations (read XSRF-TOKEN cookie, echo into X-XSRF-TOKEN header),
 * typed error mapping, JSON request/response. Phase 3a replaces this
 * with the full data-browser implementation (retry-with-jitter,
 * error-code catalog, abort signals, query-string serialization,
 * stream support for binary endpoints) — but the public signature
 * stays the same so callsites here don't need to change.
 *
 * Lives outside the `'use client'` boundary because it's framework-
 * agnostic. Hooks that consume it (lib/api/auth.ts) carry the
 * `'use client'` directive themselves.
 */

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Typed error thrown for non-2xx responses.
 *
 * `code` mirrors the server's typed error catalog from
 * `ndi-data-browser-v2/backend/errors.py` — Phase 3a will narrow this
 * to a discriminated union of the 23 known codes; today it's a free
 * string defaulting to 'unknown'.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const code =
      body !== null &&
      typeof body === 'object' &&
      'code' in body &&
      typeof (body as { code: unknown }).code === 'string'
        ? (body as { code: string }).code
        : 'unknown';
    super(`API error ${status} (${code})`);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const re = new RegExp(`(?:^|; )${name}=([^;]+)`);
  const match = document.cookie.match(re);
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export type ApiFetchInit = Omit<RequestInit, 'body'> & {
  /**
   * Request body. Pass a plain object; we JSON.stringify it. Pass a
   * pre-stringified string / FormData / Blob and we forward it as-is.
   */
  body?: unknown;
};

export async function apiFetch<T = unknown>(
  path: string,
  init: ApiFetchInit = {},
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  // CSRF double-submit on mutations: read non-HttpOnly XSRF-TOKEN cookie,
  // echo into X-XSRF-TOKEN header. Server validates header matches cookie.
  if (MUTATING_METHODS.has(method)) {
    const token = readCookie(CSRF_COOKIE);
    if (token) {
      headers.set(CSRF_HEADER, token);
    }
  }

  // JSON-encode plain-object bodies; let strings / FormData / Blob through.
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

  const response = await fetch(path, {
    ...init,
    method,
    body,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errBody: unknown = null;
    try {
      errBody = await response.json();
    } catch {
      // Non-JSON error body — fine, leave as null.
    }
    throw new ApiError(response.status, errBody);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  // Non-JSON 2xx — return text. Caller knows what to do.
  return (await response.text()) as unknown as T;
}
