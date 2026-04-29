/**
 * `parseDimensions(order, size)` — single source of truth for
 * mapping the schema's variable-shape `(order, size)` tuple to a
 * canonical `{H, W, C, Z, T}` record.
 *
 * Pre-fix the canvas viewer hard-coded `[H, W, C, Z, T] = size`,
 * which silently produced garbage on YX (length-2) and YXT
 * (length-3) data observed in production. These cases are pinned
 * here so that contract doesn't quietly regress.
 */
import { describe, expect, it } from 'vitest';

import { parseDimensions } from '@/lib/imageStack/dimensions';

describe('parseDimensions', () => {
  it('parses YXCZT (5D, schema default — Bhar / Haley shipped this in earlier specs)', () => {
    expect(parseDimensions('YXCZT', [10, 20, 3, 4, 5])).toEqual({
      H: 10,
      W: 20,
      C: 3,
      Z: 4,
      T: 5,
    });
  });

  it('parses YX (2D — Haley dataset PNG masks)', () => {
    // Single grayscale frame, no time, no z, single channel.
    expect(parseDimensions('YX', [256, 256])).toEqual({
      H: 256,
      W: 256,
      // Defaults — no C / Z / T axis present.
      C: 1,
      Z: 1,
      T: 1,
    });
  });

  it('parses YXT (3D — Bhar dataset MP4 frame stacks)', () => {
    // 100 frames of 480x640 grayscale.
    expect(parseDimensions('YXT', [480, 640, 100])).toEqual({
      H: 480,
      W: 640,
      C: 1,
      Z: 1,
      T: 100,
    });
  });

  it('parses YXC (3D — single multi-channel frame)', () => {
    expect(parseDimensions('YXC', [128, 128, 3])).toEqual({
      H: 128,
      W: 128,
      C: 3,
      Z: 1,
      T: 1,
    });
  });

  it('returns null when order length does not match size length', () => {
    // Mismatched: 3-letter order with 2 numbers, or 2-letter with 5.
    expect(parseDimensions('YXT', [10, 20])).toBeNull();
    expect(parseDimensions('YX', [10, 20, 30, 40, 50])).toBeNull();
  });

  it('treats missing axes as 1 (single-channel / single-volume / single-frame)', () => {
    // Only Y and X present — every other axis defaults to 1.
    const r = parseDimensions('YX', [16, 16]);
    expect(r).not.toBeNull();
    expect(r?.C).toBe(1);
    expect(r?.Z).toBe(1);
    expect(r?.T).toBe(1);
  });

  it('returns null when H (Y) is zero or missing-positive', () => {
    expect(parseDimensions('YX', [0, 16])).toBeNull();
  });

  it('returns null when W (X) is zero or missing-positive', () => {
    expect(parseDimensions('YX', [16, 0])).toBeNull();
  });

  it('returns null when both H and W are zero', () => {
    expect(parseDimensions('YX', [0, 0])).toBeNull();
  });

  it('coerces non-numeric axis values to the default for non-Y/X axes', () => {
    // The schema sometimes ships strings for "missing" axes; these
    // collapse to the axis's default (1) rather than poisoning the
    // result with NaN.
    const r = parseDimensions(
      'YXC',
      // @ts-expect-error -- intentional: simulate sidecar shipping
      // a non-numeric value for the C axis
      [10, 20, 'x'],
    );
    expect(r).not.toBeNull();
    // C falls through to the default (1) instead of NaN.
    expect(r?.C).toBe(1);
  });

  it('returns null for non-numeric H or W (cannot recover, no positive default)', () => {
    // The default for Y/X is 0, which fails the H>0/W>0 sanity
    // check — so non-numeric H or W tips us into the null-return
    // branch by design.
    expect(
      parseDimensions(
        'YX',
        // @ts-expect-error -- intentional: simulate a malformed
        // sidecar with a non-numeric Y axis
        ['x', 16],
      ),
    ).toBeNull();
  });

  it('parses orders with a different axis ordering (e.g. CYX)', () => {
    // Even if axes appear in a different position, `parseDimensions`
    // resolves by letter — not by index.
    const r = parseDimensions('CYX', [3, 100, 200]);
    expect(r).toEqual({ H: 100, W: 200, C: 3, Z: 1, T: 1 });
  });

  it('handles empty inputs', () => {
    expect(parseDimensions('', [])).toBeNull();
  });
});
