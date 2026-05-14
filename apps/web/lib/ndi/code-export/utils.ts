/**
 * Shared helpers for generating Python + MATLAB code from a recorded
 * sequence of tool calls.
 *
 * Two main concerns:
 *
 *   1. Literal serialization — turn an `unknown` JSON-ish value into a
 *      source-level literal in the target language. Strings get
 *      escaped, numbers pass through, arrays + objects render
 *      structurally (Python dict / MATLAB struct).
 *
 *   2. NDI Query search-structure rendering — the shape passed to
 *      `ndi_query` / `aggregate_documents` is a flat array of clauses
 *      like `[{operation: "isa", param1: "subject"}, …]`. Python
 *      builds these via `ndi.query.ndi_query.from_search(field, op,
 *      param1, param2)` and combines them with `&`; MATLAB uses
 *      `ndi.query(field, op, param1, param2)` and the `&` operator.
 *      Both languages need careful per-op handling because the
 *      `field` parameter is optional (operations like `isa` and `or`
 *      don't take a field).
 */

export type Lang = 'python' | 'matlab';

/**
 * Type guard: detect a plain object (not a function, not an array).
 * Used by the formatters when deciding how to walk a value.
 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  // Reject arrays explicitly — we handle them in a separate branch.
  if (Array.isArray(v)) return false;
  return true;
}

/**
 * Escape a string for use inside a Python triple-double-quote literal.
 * Backslashes first, then double-quotes, then control characters.
 * We deliberately use double-quoted strings (single-line "..." or
 * triple-quoted """...""") to match black's default.
 */
function escapePythonString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Format a JSON-ish value as a Python literal. Recurses into arrays
 * (→ Python list) and plain objects (→ Python dict with string keys).
 * Strings are double-quoted; booleans become `True`/`False`; null
 * becomes `None`. Unknown / function values fall back to `None`
 * rather than `undefined` (which has no Python equivalent).
 */
export function formatPythonValue(v: unknown): string {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 'None';
    return String(v);
  }
  if (typeof v === 'string') return `"${escapePythonString(v)}"`;
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const parts = v.map((x) => formatPythonValue(x));
    return `[${parts.join(', ')}]`;
  }
  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    if (keys.length === 0) return '{}';
    const parts = keys.map(
      (k) => `"${escapePythonString(k)}": ${formatPythonValue(v[k])}`,
    );
    return `{${parts.join(', ')}}`;
  }
  return 'None';
}

/**
 * Escape a string for use inside a MATLAB single-quoted char vector.
 * MATLAB escapes single-quotes by doubling them (`'' inside ''`).
 * Newlines are concatenated via `[..., newline, ...]` style — for
 * generated code we prefer to keep strings on a single line; if a
 * caller passes a newline we replace it with a space rather than
 * trying to emit a multi-line literal.
 */
function escapeMatlabString(s: string): string {
  return s.replace(/'/g, "''").replace(/[\r\n\t]+/g, ' ');
}

/**
 * Format a JSON-ish value as a MATLAB literal.
 *
 *   - strings    → 'single-quoted char vector'
 *   - numbers    → bare numeric literal (NaN/Inf → NaN/Inf, undefined → NaN)
 *   - booleans   → true / false
 *   - null       → []  (closest MATLAB equivalent for "no value")
 *   - arrays     → {a, b, c}  (cell array — heterogeneous)
 *   - objects    → struct('a', valA, 'b', valB)
 *
 * Why cell arrays for JSON arrays: MATLAB's numeric vector literal
 * `[a, b, c]` requires homogeneous types. JSON arrays from tool args
 * are heterogeneous (e.g. a searchstructure clause's `param1` can be
 * a string for `isa` and a number for `greaterthan`). Cell arrays
 * handle that without trying to detect type homogeneity at codegen
 * time.
 */
export function formatMatlabValue(v: unknown): string {
  if (v === null || v === undefined) return '[]';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? 'Inf' : '-Inf';
    return String(v);
  }
  if (typeof v === 'string') return `'${escapeMatlabString(v)}'`;
  if (Array.isArray(v)) {
    if (v.length === 0) return '{}';
    const parts = v.map((x) => formatMatlabValue(x));
    return `{${parts.join(', ')}}`;
  }
  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    if (keys.length === 0) return 'struct()';
    const parts = keys.map(
      (k) => `'${escapeMatlabString(k)}', ${formatMatlabValue(v[k])}`,
    );
    return `struct(${parts.join(', ')})`;
  }
  return '[]';
}

/**
 * Render an NDI Query search-structure clause as a single-clause
 * `ndi_query.from_search` (Python) or `ndi.query` (MATLAB) constructor
 * call.
 *
 * Each clause has the shape { operation, field?, param1?, param2? }.
 * The function defensively coerces missing optional fields to empty
 * strings, matching the underlying APIs (which both default `field`,
 * `param1`, and `param2` to `""` when omitted).
 */
function renderQueryClause(
  clause: unknown,
  lang: Lang,
): string {
  if (!isPlainObject(clause)) {
    // Bail out gracefully — emit a comment placeholder rather than
    // crashing the snippet. The user can fix it manually.
    return lang === 'python'
      ? `ndi.query.ndi_query.from_search("", "isa", "")  # malformed clause`
      : `ndi.query('', 'isa', '')  % malformed clause`;
  }
  const operation = typeof clause.operation === 'string' ? clause.operation : '';
  const field = typeof clause.field === 'string' ? clause.field : '';
  const param1 = clause.param1 ?? '';
  const param2 = clause.param2 ?? '';

  if (lang === 'python') {
    // ndi.query.ndi_query.from_search(field, operation, param1, param2)
    const args = [
      formatPythonValue(field),
      formatPythonValue(operation),
      formatPythonValue(param1),
      formatPythonValue(param2),
    ].join(', ');
    return `ndi.query.ndi_query.from_search(${args})`;
  }
  // MATLAB: ndi.query(field, operation, param1, param2)
  const args = [
    formatMatlabValue(field),
    formatMatlabValue(operation),
    formatMatlabValue(param1),
    formatMatlabValue(param2),
  ].join(', ');
  return `ndi.query(${args})`;
}

/**
 * Render an entire `searchstructure` (flat array of clauses) as a
 * single chained Query expression in the target language. Clauses
 * combine with `&` in both Python (operator-overloaded on ndi_query)
 * and MATLAB (overloaded `&` on the ndi.query class).
 *
 * Empty arrays render as a single match-all clause (`from_search('', 'isa', 'base')`)
 * — closest no-op semantic for both languages. The caller's snippet
 * comment notes the empty input.
 */
export function serializeQueryStruct(
  searchstructure: unknown,
  lang: Lang,
): string {
  if (!Array.isArray(searchstructure) || searchstructure.length === 0) {
    return lang === 'python'
      ? `ndi.query.ndi_query.from_search("", "isa", "base")  # empty searchstructure — adjust as needed`
      : `ndi.query('', 'isa', 'base')  % empty searchstructure — adjust as needed`;
  }
  const parts = searchstructure.map((c) => renderQueryClause(c, lang));
  if (parts.length === 1) return parts[0]!;
  return parts.join(' & ');
}

/**
 * Read an unknown args/result blob defensively and return a string
 * (if the lookup matched a string field) or null. Tool args/results
 * arrive from the AI SDK as `unknown` — narrowing here keeps the
 * generator files free of `as` casts.
 */
export function pickString(blob: unknown, key: string): string | null {
  if (!isPlainObject(blob)) return null;
  const v = blob[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Same as pickString but for numbers.
 */
export function pickNumber(blob: unknown, key: string): number | null {
  if (!isPlainObject(blob)) return null;
  const v = blob[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Same as pickString but for arbitrary JSON values (passthrough).
 * Returns `undefined` when the key is absent — lets the caller decide
 * whether to skip emission or substitute a default.
 */
export function pickValue(blob: unknown, key: string): unknown {
  if (!isPlainObject(blob)) return undefined;
  return blob[key];
}
