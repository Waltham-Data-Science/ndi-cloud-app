/**
 * Derived columns — formula parser + evaluator for workspace tables.
 *
 * Lets a user add a "derived column" to any tabular_query result view:
 * a small formula referencing existing columns (e.g. `std / mean`,
 * `100 * (max - min)`, `round(mean / count, 2)`) that gets evaluated
 * per row and rendered alongside the source columns.
 *
 * Why hand-rolled (no `mathjs`, no `eval`)
 * ---------------------------------------
 *
 * - Safety: `eval()` and `new Function()` are XSS vectors when the
 *   formula text comes from user input. A small recursive-descent
 *   parser closes that surface entirely.
 * - Bundle: `mathjs` is ~700 KB minified — the parser here is < 5 KB.
 * - Scope: workspace formulas only need basic arithmetic + a tiny
 *   function set (min/max/abs/round/sqrt). The parser stays focused.
 *
 * Grammar (recursive descent)
 * ---------------------------
 *
 *     expr    := term (('+' | '-') term)*
 *     term    := factor (('*' | '/') factor)*
 *     factor  := '-'? primary
 *     primary := NUMBER | IDENT | IDENT '(' arglist? ')' | '(' expr ')'
 *     arglist := expr (',' expr)*
 *
 * `IDENT` matches a JS-like identifier (alpha/underscore first char,
 * then alphanumerics/underscores; equivalent regex pattern is
 * `[A-Za-z_][A-Za-z0-9_]*`).
 * Explicit `${name}` syntax is also accepted so column names with
 * unusual characters can be referenced unambiguously (the brace form
 * permits hyphens / dots inside).
 *
 * Numeric values follow JS numeric literal rules (decimal only — no
 * 0x/0b/scientific so a typo can't accidentally produce a giant value
 * via `1e9`).
 *
 * Functions
 * ---------
 *
 *   min(a, b, ...)   — minimum
 *   max(a, b, ...)   — maximum
 *   abs(x)
 *   round(x, n?)     — n defaults to 0
 *   sqrt(x)
 *
 * Evaluation semantics
 * --------------------
 *
 * The evaluator returns `null` whenever any referenced column resolves
 * to a non-number or NaN — propagation prevents one bad cell from
 * corrupting the whole derived column. Division by zero returns `null`
 * (rather than Infinity) so the cell displays as "—" instead of "∞".
 */

export type FormulaErrorKind = 'parse' | 'unknown_function' | 'arity';

export class FormulaError extends Error {
  readonly kind: FormulaErrorKind;
  constructor(kind: FormulaErrorKind, message: string) {
    super(message);
    this.name = 'FormulaError';
    this.kind = kind;
  }
}

export interface DerivedColumn {
  /** Stable, opaque id for React keys + identity. */
  id: string;
  /** Display name shown as the column header. */
  label: string;
  /** Source formula text — round-tripped to the user in tooltips. */
  formula: string;
  /** Compiled evaluator — `null` on any missing/NaN reference. */
  evaluator: (row: Record<string, unknown>) => number | null;
}

/**
 * Compile a formula string into an evaluator. Throws `FormulaError`
 * on parse / unknown-function failures so callers can show inline
 * validation. Successful compilation does NOT guarantee runtime
 * success — the evaluator returns `null` for rows where references
 * resolve to non-numbers.
 */
export function compileFormula(
  formula: string,
): (row: Record<string, unknown>) => number | null {
  const tokens = tokenize(formula);
  const parser = new Parser(tokens);
  const ast = parser.parseExpr();
  parser.expectEnd();
  return (row: Record<string, unknown>) => evaluate(ast, row);
}

/**
 * Format a derived-cell numeric (or `null`) for display in a tabular
 * grid. Mirrors `BehavioralComparePanel`'s `fmt` helper for parity
 * with the source columns: numbers render at 3 significant digits,
 * with `'—'` for `null` / non-finite.
 */
export function formatDerivedCell(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (!Number.isFinite(v)) return '—';
  // Match BehavioralComparePanel's fmt: 3-sig precision but drop
  // trailing zeros for integer-shaped results.
  if (Number.isInteger(v)) return v.toString();
  return v.toPrecision(3);
}

/* ─── Tokenizer ─── */

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; name: string }
  | { type: 'op'; op: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

function isAlpha(c: string): boolean {
  return (
    (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'
  );
}
function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}
function isIdent(c: string): boolean {
  return isAlpha(c) || isDigit(c);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/') {
      tokens.push({ type: 'op', op: c });
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(input[i + 1] ?? ''))) {
      let j = i;
      while (j < input.length && (isDigit(input[j]!) || input[j] === '.')) {
        j++;
      }
      const text = input.slice(i, j);
      const num = Number(text);
      if (!Number.isFinite(num)) {
        throw new FormulaError('parse', `Invalid number "${text}"`);
      }
      tokens.push({ type: 'num', value: num });
      i = j;
      continue;
    }
    if (c === '$' && input[i + 1] === '{') {
      const closeBrace = input.indexOf('}', i + 2);
      if (closeBrace === -1) {
        throw new FormulaError('parse', 'Unclosed dollar-brace reference at position ' + String(i));
      }
      const refName = input.slice(i + 2, closeBrace);
      if (refName.length === 0) {
        throw new FormulaError('parse', 'Empty column reference at position ' + String(i));
      }
      tokens.push({ type: 'ident', name: refName });
      i = closeBrace + 1;
      continue;
    }
    if (isAlpha(c)) {
      let j = i;
      while (j < input.length && isIdent(input[j]!)) {
        j++;
      }
      tokens.push({ type: 'ident', name: input.slice(i, j) });
      i = j;
      continue;
    }
    throw new FormulaError('parse', `Unexpected character "${c}" at position ${i}`);
  }
  return tokens;
}

/* ─── Parser (recursive descent) ─── */

type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'col'; name: string }
  | { kind: 'binop'; op: '+' | '-' | '*' | '/'; left: Expr; right: Expr }
  | { kind: 'unary'; op: '-'; operand: Expr }
  | { kind: 'fn'; name: FnName; args: Expr[] };

type FnName = 'min' | 'max' | 'abs' | 'round' | 'sqrt';

const KNOWN_FNS: Readonly<Record<FnName, { minArity: number; maxArity: number }>> = {
  min: { minArity: 1, maxArity: Infinity },
  max: { minArity: 1, maxArity: Infinity },
  abs: { minArity: 1, maxArity: 1 },
  round: { minArity: 1, maxArity: 2 },
  sqrt: { minArity: 1, maxArity: 1 },
};

function isFnName(name: string): name is FnName {
  return name in KNOWN_FNS;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  peek(): Token | null {
    return this.tokens[this.pos] ?? null;
  }
  consume(): Token | null {
    const t = this.tokens[this.pos];
    if (t === undefined) return null;
    this.pos++;
    return t;
  }

  expectEnd(): void {
    if (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos]!;
      throw new FormulaError(
        'parse',
        `Unexpected token after expression: ${describeToken(t)}`,
      );
    }
  }

  parseExpr(): Expr {
    let left = this.parseTerm();
    while (true) {
      const t = this.peek();
      if (!t || t.type !== 'op' || (t.op !== '+' && t.op !== '-')) break;
      this.consume();
      const right = this.parseTerm();
      left = { kind: 'binop', op: t.op, left, right };
    }
    return left;
  }

  parseTerm(): Expr {
    let left = this.parseFactor();
    while (true) {
      const t = this.peek();
      if (!t || t.type !== 'op' || (t.op !== '*' && t.op !== '/')) break;
      this.consume();
      const right = this.parseFactor();
      left = { kind: 'binop', op: t.op, left, right };
    }
    return left;
  }

  parseFactor(): Expr {
    const t = this.peek();
    if (t && t.type === 'op' && t.op === '-') {
      this.consume();
      const operand = this.parseFactor();
      return { kind: 'unary', op: '-', operand };
    }
    return this.parsePrimary();
  }

  parsePrimary(): Expr {
    const t = this.consume();
    if (!t) {
      throw new FormulaError('parse', 'Unexpected end of formula');
    }
    if (t.type === 'num') {
      return { kind: 'num', value: t.value };
    }
    if (t.type === 'lparen') {
      const inner = this.parseExpr();
      const close = this.consume();
      if (!close || close.type !== 'rparen') {
        throw new FormulaError('parse', "Expected ')'");
      }
      return inner;
    }
    if (t.type === 'ident') {
      // Function call?
      const next = this.peek();
      if (next && next.type === 'lparen') {
        this.consume(); // '('
        const args: Expr[] = [];
        // Empty args allowed: f()
        if (this.peek()?.type !== 'rparen') {
          args.push(this.parseExpr());
          while (this.peek()?.type === 'comma') {
            this.consume();
            args.push(this.parseExpr());
          }
        }
        const close = this.consume();
        if (!close || close.type !== 'rparen') {
          throw new FormulaError('parse', "Expected ')' after function arguments");
        }
        if (!isFnName(t.name)) {
          throw new FormulaError(
            'unknown_function',
            `Unknown function "${t.name}". Available: ${Object.keys(KNOWN_FNS).join(', ')}`,
          );
        }
        const arity = KNOWN_FNS[t.name];
        if (args.length < arity.minArity || args.length > arity.maxArity) {
          const arityDesc =
            arity.minArity === arity.maxArity
              ? String(arity.minArity)
              : `${arity.minArity}-${arity.maxArity}`;
          throw new FormulaError(
            'arity',
            `${t.name}() expects ${arityDesc} args, got ${args.length}`,
          );
        }
        return { kind: 'fn', name: t.name, args };
      }
      return { kind: 'col', name: t.name };
    }
    throw new FormulaError('parse', `Unexpected token: ${describeToken(t)}`);
  }
}

function describeToken(t: Token): string {
  switch (t.type) {
    case 'num':
      return `number ${t.value}`;
    case 'ident':
      return `identifier "${t.name}"`;
    case 'op':
      return `operator "${t.op}"`;
    case 'lparen':
      return "'('";
    case 'rparen':
      return "')'";
    case 'comma':
      return "','";
  }
}

/* ─── Evaluator ─── */

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function evaluate(expr: Expr, row: Record<string, unknown>): number | null {
  switch (expr.kind) {
    case 'num':
      return expr.value;
    case 'col': {
      const raw = row[expr.name];
      return toNumber(raw);
    }
    case 'unary': {
      const inner = evaluate(expr.operand, row);
      return inner === null ? null : -inner;
    }
    case 'binop': {
      const l = evaluate(expr.left, row);
      if (l === null) return null;
      const r = evaluate(expr.right, row);
      if (r === null) return null;
      switch (expr.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          // Division by zero → null (rendered as "—") rather than Infinity.
          if (r === 0) return null;
          return l / r;
      }
      return null;
    }
    case 'fn': {
      const args: number[] = [];
      for (const a of expr.args) {
        const v = evaluate(a, row);
        if (v === null) return null;
        args.push(v);
      }
      switch (expr.name) {
        case 'min':
          return Math.min(...args);
        case 'max':
          return Math.max(...args);
        case 'abs':
          return Math.abs(args[0]!);
        case 'sqrt': {
          const x = args[0]!;
          return x < 0 ? null : Math.sqrt(x);
        }
        case 'round': {
          const x = args[0]!;
          const n = args[1] ?? 0;
          const m = Math.pow(10, Math.round(n));
          return Math.round(x * m) / m;
        }
      }
      return null;
    }
  }
}
