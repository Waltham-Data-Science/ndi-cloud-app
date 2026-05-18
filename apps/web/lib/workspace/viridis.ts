/**
 * Viridis colormap — perceptually-uniform sequential ramp.
 *
 * Used wherever a workspace surface needs to map a 1D scalar
 * (sample index, time progression, parameter value) to a color
 * suitable for both screen and print, and accessible to color-vision
 * deficiencies. Viridis is the matplotlib default since 2.0 and is
 * the de-facto standard for sequential scientific colormaps for
 * exactly these reasons.
 *
 * The trajectory panel (BehavioralTrackPanel) uses this to color
 * an XY position track by sample index — start of recording is dark
 * blue, end is bright yellow, with smooth perceptually-even steps
 * in between. SignalViewer / MultiTraceChart also use a Viridis
 * approximation (polynomial fit, ~2 RGB error). This file ships a
 * 32-stop interpolated lookup table that's more faithful to the
 * canonical Matplotlib LUT than the polynomial — the trajectory
 * chart needs the visual ordering to be smooth across hundreds of
 * sample points, which the polynomial wobbles slightly on.
 *
 * The 32-stop table is sampled at evenly-spaced points from the
 * canonical 256-stop Matplotlib Viridis LUT (v3.7). For 32 stops the
 * linear interpolation between them produces visually-indistinguishable
 * results from the full 256-stop table at chart resolutions.
 *
 * Module size: 32 entries × 3 numbers each + small interpolator code,
 * ≈700 bytes minified — well under the bundle budget. No external
 * deps; pure ES.
 */

/**
 * 32 evenly-spaced samples of the Matplotlib Viridis colormap (v3.7).
 * Each entry is `[r, g, b]` in 0-255 integers.
 *
 * Sampling indices into the 256-stop canonical LUT: 0, 8, 16, …, 248,
 * 255. We snap the last index to 255 so `t = 1` lands exactly on the
 * brightest yellow without an extrapolation step.
 */
const VIRIDIS_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [68, 1, 84],
  [71, 13, 96],
  [72, 24, 106],
  [72, 35, 116],
  [71, 46, 124],
  [69, 56, 130],
  [66, 65, 134],
  [62, 74, 137],
  [59, 82, 139],
  [56, 89, 140],
  [53, 95, 141],
  [49, 102, 142],
  [46, 109, 142],
  [43, 116, 142],
  [40, 122, 142],
  [37, 129, 141],
  [35, 136, 141],
  [33, 142, 140],
  [31, 149, 139],
  [31, 155, 137],
  [36, 162, 135],
  [46, 169, 130],
  [62, 175, 124],
  [82, 182, 115],
  [105, 188, 105],
  [131, 193, 92],
  [159, 198, 76],
  [188, 203, 58],
  [216, 207, 41],
  [240, 213, 30],
  [253, 220, 36],
  [253, 231, 37],
] as const;

const N_STOPS = VIRIDIS_STOPS.length;

/**
 * Sample the Viridis colormap at fractional position `t ∈ [0, 1]`.
 *
 *   t = 0 → dark purple (`rgb(68, 1, 84)`)
 *   t = 1 → bright yellow (`rgb(253, 231, 37)`)
 *
 * Out-of-range inputs are clamped (rather than wrapping or throwing) —
 * callers feeding it `i / (n - 1)` for a length-1 array would
 * otherwise hit a `NaN` → invalid color path.
 *
 * Returns a CSS `rgb(r, g, b)` string. Same shape as
 * `MultiTraceChart`'s `viridisColor` so the two are drop-in compatible
 * if a future panel wants to share code.
 */
export function viridis(t: number): string {
  if (!Number.isFinite(t)) return 'rgb(68, 1, 84)';
  const clamped = Math.max(0, Math.min(1, t));
  // Map t into the [0, N_STOPS - 1] index range, then bilinear-interpolate
  // between the two flanking stops. This is the "linear interp between
  // 32 keypoints" path — visually-indistinguishable from the full
  // 256-entry canonical table at the resolutions we render.
  const scaled = clamped * (N_STOPS - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(N_STOPS - 1, lo + 1);
  const frac = scaled - lo;
  const a = VIRIDIS_STOPS[lo]!;
  const b = VIRIDIS_STOPS[hi]!;
  const r = Math.round(a[0] + (b[0] - a[0]) * frac);
  const g = Math.round(a[1] + (b[1] - a[1]) * frac);
  const bl = Math.round(a[2] + (b[2] - a[2]) * frac);
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * Convenience: build N evenly-spaced colors across the ramp. Useful
 * for legend swatches, per-segment colors on a polyline, or any
 * caller that wants to pre-compute the palette once instead of
 * re-sampling on each render.
 *
 * `n = 0` returns `[]`; `n = 1` returns the midpoint color (`viridis(0.5)`)
 * so a single-element render gets a deterministic, non-edge color
 * instead of "all dark purple" or "all bright yellow."
 */
export function viridisPalette(n: number): string[] {
  if (n <= 0) return [];
  if (n === 1) return [viridis(0.5)];
  const out = new Array<string>(n);
  for (let i = 0; i < n; i++) {
    out[i] = viridis(i / (n - 1));
  }
  return out;
}
