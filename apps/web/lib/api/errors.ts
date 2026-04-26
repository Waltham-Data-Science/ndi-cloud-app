/**
 * Typed error catalog ported from `ndi-data-browser-v2/frontend/src/api/errors.ts`.
 *
 * `ErrorCode` is the closed set the FastAPI proxy emits today; we widen
 * it with `string` at the consumer layer so a server-side rename of an
 * unfamiliar code doesn't crash the client — UI matchers should only
 * key off codes they know about and fall back to a generic recovery
 * message otherwise.
 *
 * `Recovery` drives UI affordances:
 *   - `retry` → show a "try again" button (transient failure)
 *   - `login` → bounce to /login?returnTo= (auth invalidated mid-flow)
 *   - `contact_support` → terminal; show requestId for support
 *   - `none` → caller has a domain-specific handler
 */
export type Recovery = 'retry' | 'login' | 'contact_support' | 'none';

export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_RATE_LIMITED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'CLOUD_UNREACHABLE'
  | 'CLOUD_TIMEOUT'
  | 'CLOUD_INTERNAL_ERROR'
  | 'BINARY_DECODE_FAILED'
  | 'BINARY_NOT_FOUND'
  | 'QUERY_TIMEOUT'
  | 'QUERY_TOO_LARGE'
  | 'QUERY_INVALID_NEGATION'
  | 'BULK_FETCH_TOO_LARGE'
  | 'ONTOLOGY_LOOKUP_FAILED'
  | 'CSRF_INVALID'
  | 'INTERNAL'
  // Client-side: thrown by `apiFetch` when an optional response schema
  // is provided and the 2xx body doesn't match. Status is the original
  // 2xx (typically 200) — the wire was fine, the body shape wasn't.
  // recovery=`contact_support` because retries won't fix a backend
  // shape drift; UI surfaces requestId so support can correlate.
  // See `apps/web/lib/api/client.ts` (CQ1) and the schemas under
  // `apps/web/lib/api/schemas/*.ts`.
  | 'RESPONSE_SHAPE_INVALID';

/**
 * FastAPI error wire shape (the wrapping envelope). `apiFetch` unwraps
 * `error: { ... }` before constructing `ApiError`, so consumers see the
 * inner shape directly via `err.code` / `err.recovery` / `err.requestId`.
 */
export interface ApiErrorBody {
  error: {
    code: ErrorCode | string;
    message: string;
    recovery: Recovery;
    requestId: string | null;
    details?: unknown;
  };
}

const RECOVERIES = new Set<Recovery>(['retry', 'login', 'contact_support', 'none']);

function isRecovery(value: unknown): value is Recovery {
  return typeof value === 'string' && RECOVERIES.has(value as Recovery);
}

/**
 * Typed error thrown by `apiFetch` for non-2xx responses.
 *
 * Backward-compatible with Phase 2b's `new ApiError(status, body)`
 * signature: tests that mock with `{ code: 'invalid_credentials' }` keep
 * working because the constructor accepts a flat object that already
 * looks like the unwrapped inner shape. Phase 3a's apiFetch unwraps the
 * FastAPI envelope `{ error: { ... } }` before it reaches here.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | string;
  readonly recovery: Recovery;
  readonly requestId: string | null;
  readonly details: unknown;
  /** Original (unwrapped) body for debugging — UI should match on `.code`, not `.body`. */
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const inner =
      body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    const code: ErrorCode | string =
      typeof inner?.code === 'string' ? (inner.code as ErrorCode | string) : 'unknown';
    const message =
      typeof inner?.message === 'string' && inner.message
        ? inner.message
        : `API error ${status} (${code})`;
    const recovery: Recovery = isRecovery(inner?.recovery) ? (inner.recovery as Recovery) : 'none';
    const requestId =
      typeof inner?.requestId === 'string' && inner.requestId ? inner.requestId : null;

    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.recovery = recovery;
    this.requestId = requestId;
    this.details = inner?.details;
    this.body = body;
  }
}
