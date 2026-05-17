import { describe, expect, it } from 'vitest';

import {
  compileFormula,
  formatDerivedCell,
  FormulaError,
} from '@/lib/workspace/derived-columns';

describe('compileFormula', () => {
  it('evaluates a constant', () => {
    const f = compileFormula('42');
    expect(f({})).toBe(42);
  });

  it('evaluates a single column reference', () => {
    const f = compileFormula('mean');
    expect(f({ mean: 3.14 })).toBeCloseTo(3.14);
  });

  it('evaluates basic + - * / with left-to-right associativity for same precedence', () => {
    const f = compileFormula('a + b - c');
    expect(f({ a: 5, b: 3, c: 2 })).toBe(6);
  });

  it('respects multiplicative precedence over additive', () => {
    const f = compileFormula('a + b * c');
    expect(f({ a: 1, b: 2, c: 3 })).toBe(7);
  });

  it('honors parentheses', () => {
    const f = compileFormula('(a + b) * c');
    expect(f({ a: 1, b: 2, c: 3 })).toBe(9);
  });

  it('supports unary minus', () => {
    const f = compileFormula('-x + 5');
    expect(f({ x: 3 })).toBe(2);
  });

  it('returns null on division by zero', () => {
    const f = compileFormula('a / b');
    expect(f({ a: 10, b: 0 })).toBeNull();
  });

  it('returns null when a referenced column is missing', () => {
    const f = compileFormula('std / mean');
    expect(f({ mean: 5 })).toBeNull();
    expect(f({ std: 1 })).toBeNull();
  });

  it('returns null when a referenced column is NaN', () => {
    const f = compileFormula('a + b');
    expect(f({ a: NaN, b: 5 })).toBeNull();
  });

  it('returns null when a referenced column is a non-numeric string', () => {
    const f = compileFormula('a');
    expect(f({ a: 'hello' })).toBeNull();
  });

  it('coerces numeric strings', () => {
    const f = compileFormula('a');
    expect(f({ a: '3.14' })).toBeCloseTo(3.14);
  });

  it('supports decimal numbers with leading dot', () => {
    const f = compileFormula('.5 + x');
    expect(f({ x: 1.5 })).toBe(2);
  });

  it('supports min/max with variadic arity', () => {
    expect(compileFormula('min(a, b, c)')({ a: 5, b: 3, c: 7 })).toBe(3);
    expect(compileFormula('max(a, b, c)')({ a: 5, b: 3, c: 7 })).toBe(7);
  });

  it('supports abs', () => {
    expect(compileFormula('abs(x)')({ x: -7 })).toBe(7);
  });

  it('supports sqrt', () => {
    expect(compileFormula('sqrt(x)')({ x: 9 })).toBe(3);
  });

  it('returns null from sqrt of negative', () => {
    expect(compileFormula('sqrt(x)')({ x: -1 })).toBeNull();
  });

  it('supports round with optional precision', () => {
    expect(compileFormula('round(x)')({ x: 3.7 })).toBe(4);
    expect(compileFormula('round(x, 2)')({ x: 3.14159 })).toBe(3.14);
  });

  it('supports ${name} syntax for column refs with unusual chars', () => {
    const f = compileFormula('${col.A} + ${col.B}');
    expect(f({ 'col.A': 2, 'col.B': 3 })).toBe(5);
  });

  it('throws ParseError on unbalanced parens', () => {
    expect(() => compileFormula('(a + b')).toThrow(FormulaError);
  });

  it('throws ParseError on unknown function', () => {
    let err: FormulaError | null = null;
    try {
      compileFormula('frobnicate(x)');
    } catch (e) {
      err = e as FormulaError;
    }
    expect(err).not.toBeNull();
    expect(err!.kind).toBe('unknown_function');
  });

  it('throws ArityError on wrong function arity', () => {
    let err: FormulaError | null = null;
    try {
      compileFormula('abs(x, y)');
    } catch (e) {
      err = e as FormulaError;
    }
    expect(err).not.toBeNull();
    expect(err!.kind).toBe('arity');
  });

  it('throws ParseError on lone operator', () => {
    expect(() => compileFormula('+ +')).toThrow(FormulaError);
  });

  it('rejects junk after an otherwise valid expression', () => {
    expect(() => compileFormula('a + b garbage')).toThrow(FormulaError);
  });
});

describe('formatDerivedCell', () => {
  it('renders em-dash for null', () => {
    expect(formatDerivedCell(null)).toBe('—');
  });
  it('renders em-dash for undefined', () => {
    expect(formatDerivedCell(undefined)).toBe('—');
  });
  it('renders em-dash for NaN', () => {
    expect(formatDerivedCell(NaN)).toBe('—');
  });
  it('renders em-dash for Infinity', () => {
    expect(formatDerivedCell(Infinity)).toBe('—');
  });
  it('renders integers as integers', () => {
    expect(formatDerivedCell(42)).toBe('42');
    expect(formatDerivedCell(0)).toBe('0');
    expect(formatDerivedCell(-7)).toBe('-7');
  });
  it('renders floats at 3-sig precision', () => {
    expect(formatDerivedCell(0.21153)).toBe('0.212');
    expect(formatDerivedCell(3.14159)).toBe('3.14');
  });
});
