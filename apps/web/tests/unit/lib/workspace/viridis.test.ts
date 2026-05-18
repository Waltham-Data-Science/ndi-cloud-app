/**
 * Viridis colormap lookup.
 *
 * Pinned behaviors:
 *   - t=0 lands on the canonical dark-purple endpoint
 *   - t=1 lands on the canonical bright-yellow endpoint
 *   - midpoint (t≈0.5) is somewhere in the blue-green band
 *   - intermediate stops interpolate smoothly (no NaN, monotonic per channel
 *     in long ranges)
 *   - out-of-range inputs are clamped, not wrapped/thrown
 *   - non-finite inputs (NaN, Infinity) return a safe default
 *   - palette helper returns the right length + edge colors
 */
import { describe, expect, it } from 'vitest';

import { viridis, viridisPalette } from '@/lib/workspace/viridis';

function parseRgb(s: string): [number, number, number] {
  const m = s.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) throw new Error(`Bad rgb string: ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

describe('viridis', () => {
  it('returns dark purple at t=0', () => {
    const [r, g, b] = parseRgb(viridis(0));
    // Canonical Matplotlib Viridis start is rgb(68, 1, 84).
    expect(r).toBe(68);
    expect(g).toBe(1);
    expect(b).toBe(84);
  });

  it('returns bright yellow at t=1', () => {
    const [r, g, b] = parseRgb(viridis(1));
    // Canonical Matplotlib Viridis end is ~rgb(253, 231, 37).
    expect(r).toBe(253);
    expect(g).toBe(231);
    expect(b).toBe(37);
  });

  it('midpoint reads as teal (g and b both dominate r)', () => {
    const [r, g, b] = parseRgb(viridis(0.5));
    // The Viridis midpoint is a cyan-teal at roughly rgb(33, 142, 140);
    // both green and blue dominate red, with green ≈ blue. We assert
    // the dominance pattern rather than exact values so the test
    // survives the 32-stop interpolation rounding.
    expect(g).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(r);
    // g and b should be reasonably close (teal, not pure green or pure blue).
    expect(Math.abs(g - b)).toBeLessThan(30);
  });

  it('clamps inputs below 0 to the start color', () => {
    expect(viridis(-1)).toBe(viridis(0));
    expect(viridis(-0.5)).toBe(viridis(0));
  });

  it('clamps inputs above 1 to the end color', () => {
    expect(viridis(2)).toBe(viridis(1));
    expect(viridis(1.5)).toBe(viridis(1));
  });

  it('returns the start color for non-finite inputs', () => {
    // NaN / ±Infinity caller bugs shouldn't produce `rgb(NaN, NaN, NaN)`
    // strings — that breaks SVG attribute parsers.
    expect(viridis(NaN)).toBe(viridis(0));
    expect(viridis(Infinity)).toBe(viridis(0));
    expect(viridis(-Infinity)).toBe(viridis(0));
  });

  it('produces 0-255 integer rgb channels for every sample', () => {
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const [r, g, b] = parseRgb(viridis(t));
      expect(Number.isInteger(r)).toBe(true);
      expect(Number.isInteger(g)).toBe(true);
      expect(Number.isInteger(b)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
    }
  });

  it('interpolates smoothly between adjacent samples (no big jumps)', () => {
    // The 32-stop table interpolates linearly between stops; the max
    // per-step delta should be small for fine-grained sampling.
    let prev = parseRgb(viridis(0));
    for (let i = 1; i <= 100; i++) {
      const curr = parseRgb(viridis(i / 100));
      // Largest single-channel delta in canonical Viridis at 1%
      // sampling is ~10 units; well under the 30-unit threshold below.
      const dr = Math.abs(curr[0] - prev[0]);
      const dg = Math.abs(curr[1] - prev[1]);
      const db = Math.abs(curr[2] - prev[2]);
      expect(Math.max(dr, dg, db)).toBeLessThan(30);
      prev = curr;
    }
  });
});

describe('viridisPalette', () => {
  it('returns empty array for n=0', () => {
    expect(viridisPalette(0)).toEqual([]);
  });

  it('returns the midpoint color for n=1 (not an edge color)', () => {
    expect(viridisPalette(1)).toEqual([viridis(0.5)]);
  });

  it('returns n colors anchored at the endpoints for n>=2', () => {
    const p = viridisPalette(5);
    expect(p).toHaveLength(5);
    expect(p[0]).toBe(viridis(0));
    expect(p[4]).toBe(viridis(1));
  });

  it('returns the same color at the same index for repeated calls', () => {
    // Determinism guard — important because chart segments are
    // re-rendered on every selection change.
    const a = viridisPalette(10);
    const b = viridisPalette(10);
    expect(a).toEqual(b);
  });

  it('palette colors are evenly spaced (i / (n-1))', () => {
    const p = viridisPalette(11);
    // The third color should equal viridis(0.2) for n=11 → step=0.1
    expect(p[2]).toBe(viridis(0.2));
    expect(p[5]).toBe(viridis(0.5));
    expect(p[8]).toBe(viridis(0.8));
  });
});
