/**
 * Parser for the imageStack `dimension_order` + `dimension_size` pair.
 *
 * Production data ships these axis orders in the wild:
 *   - `YX`    (2D, single greyscale frame — Haley dataset PNG masks)
 *   - `YXT`   (3D, time series of greyscale frames — Bhar dataset MP4)
 *   - `YXC`   (3D, single multi-channel frame)
 *   - `YXCZT` (5D, hyperspectral z-stacks over time — schema default)
 *
 * The previous implementation hard-coded a 5-tuple destructure
 * (`[H, W, C, Z, T] = dimension_size`) on the assumption that
 * everything was YXCZT. That silently produced garbage on YXT (where
 * `T` lands in `C`'s slot) and on YX (where `C`/`Z`/`T` were
 * `undefined`, defaulting to 1 by accident — usually correct, but
 * masking real shape mismatches).
 *
 * `parseDimensions` is the single source of truth for going from
 * `(order, size)` → `{H, W, C, Z, T}`. Missing axes default to 1
 * (single-channel / single-volume / single-frame); H and W must be
 * present and positive or the function returns `null` so callers
 * can fall through to a non-canvas codepath.
 */

export interface ParsedDimensions {
  /** Rows. Backed by the `Y` axis. */
  H: number;
  /** Columns. Backed by the `X` axis. */
  W: number;
  /** Interleaved channel count. Defaults to 1 if no `C` axis. */
  C: number;
  /** Z-slice count. Defaults to 1 if no `Z` axis. */
  Z: number;
  /** Time-frame count. Defaults to 1 if no `T` axis. */
  T: number;
}

type Axis = 'Y' | 'X' | 'C' | 'Z' | 'T';

/**
 * Resolve `(order, size)` to a `{H, W, C, Z, T}` record.
 *
 * Returns `null` when:
 *   - `order` length doesn't match `size` length (bad sidecar data)
 *   - the resolved `H` (Y) or `W` (X) is non-positive
 *
 * Otherwise: each missing axis falls through to its default (1).
 *
 * Behaviorally identical to the inline 5-tuple destructure for
 * canonical YXCZT input (the schema default), so existing partner
 * docs continue to work unchanged.
 */
export function parseDimensions(
  order: string,
  size: readonly number[],
): ParsedDimensions | null {
  if (order.length !== size.length) return null;
  const axis = (k: Axis, dflt: number): number => {
    const i = order.indexOf(k);
    if (i === -1) return dflt;
    const v = Number(size[i]);
    // NaN / 0 / negative → fall through to default. Catches the case
    // where a sidecar ships `size: ['x']` (string) for a missing axis.
    return Number.isFinite(v) && v > 0 ? v : dflt;
  };
  const H = axis('Y', 0);
  const W = axis('X', 0);
  if (H <= 0 || W <= 0) return null;
  return {
    H,
    W,
    C: axis('C', 1),
    Z: axis('Z', 1),
    T: axis('T', 1),
  };
}
