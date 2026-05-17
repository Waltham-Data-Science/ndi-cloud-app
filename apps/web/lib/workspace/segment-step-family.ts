/**
 * Step-family signal segmentation — pure helpers used by the
 * patch-clamp step-family panel (Francesconi D8).
 *
 * Background
 * ----------
 *
 * Patch-clamp step protocols record a series of sweeps (one per
 * current-step amplitude) and concatenate them into a single
 * timeseries with NaN gaps between sweeps. The visualization the
 * MATLAB tutorial produces overlays each sweep on a common time
 * axis, color-coded by sweep index (and ideally by injected current).
 *
 * The helpers below take the raw `time[]` and `values[]` arrays from
 * the backend signal endpoint and:
 *
 *   1. Walk the values, collecting contiguous non-NaN runs as sweeps.
 *   2. Subtract each sweep's first timestamp from its time array so
 *      every sweep starts at t=0 for the overlay plot.
 *   3. Track the source sample indices so callers can correlate a
 *      sweep back to its position in the original recording.
 *
 * Edge cases honored
 * ------------------
 *
 *   - Empty input → no sweeps
 *   - All-NaN input → no sweeps
 *   - No NaNs anywhere → exactly one sweep spanning the whole signal
 *   - Leading / trailing NaN runs → skipped (sweeps don't start or
 *     end with NaN)
 *   - Single-sample sweeps → preserved (length-1 sweeps are valid)
 *   - Time array shorter than values → sweep ends are clamped to the
 *     time array's length (defensive — backend should send equal
 *     lengths, but a short time array shouldn't crash)
 *
 * Future: a separate helper could read the sweep's "injected step
 * amplitude" from a sibling probe document and rank sweeps by current
 * step instead of recording order. Step-amplitude ranking is the
 * second-most-common ordering after recording-order — punted to a
 * second iteration so the panel's first version stays narrow.
 */

export interface Sweep {
  /** Sweep index in recording order, 0-based. */
  index: number;
  /** Inclusive index into the original `values` array where this sweep starts. */
  startSample: number;
  /** Exclusive end index — `values.slice(startSample, endSample)` recovers the raw range. */
  endSample: number;
  /** Time array, rebased to t=0 at the sweep's first sample. */
  time: number[];
  /** Signal values for this sweep (no NaNs — those are gap markers). */
  values: number[];
}

/**
 * Test whether `v` is a finite number. `NaN`, `Infinity`, `null`,
 * `undefined`, and non-number types all return `false`.
 *
 * The backend's signal endpoint returns `Array<number | null>` per
 * channel, where `null` marks "no sample" (e.g., a gap in a sparse
 * recording). For step-family detection we treat both `null` and
 * `NaN` as gap markers — they're semantically equivalent here.
 */
function isFiniteSample(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Segment a signal into sweeps separated by NaN/null gaps.
 *
 * @param time - The signal's time axis (seconds, or whatever unit
 *   the backend ships). Must be the same length as `values`.
 * @param values - The signal samples. Gaps marked as `NaN` or `null`.
 * @returns Zero or more sweeps in recording order. Empty array if
 *   the input contains no contiguous non-NaN run of length ≥ 1.
 */
export function segmentByNanGaps(
  time: ReadonlyArray<number>,
  values: ReadonlyArray<number | null>,
): Sweep[] {
  const sweeps: Sweep[] = [];
  const len = Math.min(time.length, values.length);
  if (len === 0) return sweeps;

  let runStart: number | null = null;

  for (let i = 0; i < len; i++) {
    const sample = values[i];
    const inRun = isFiniteSample(sample);
    if (inRun && runStart === null) {
      runStart = i;
    } else if (!inRun && runStart !== null) {
      // Close out the current sweep.
      sweeps.push(buildSweep(sweeps.length, runStart, i, time, values));
      runStart = null;
    }
  }
  // Trailing non-NaN run extends to the end.
  if (runStart !== null) {
    sweeps.push(buildSweep(sweeps.length, runStart, len, time, values));
  }

  return sweeps;
}

function buildSweep(
  index: number,
  start: number,
  end: number,
  time: ReadonlyArray<number>,
  values: ReadonlyArray<number | null>,
): Sweep {
  const t0 = time[start] ?? 0;
  const sweepTime: number[] = [];
  const sweepValues: number[] = [];
  for (let i = start; i < end; i++) {
    const v = values[i];
    if (!isFiniteSample(v)) continue; // defensive — shouldn't happen
    sweepTime.push((time[i] ?? 0) - t0);
    sweepValues.push(v);
  }
  return { index, startSample: start, endSample: end, time: sweepTime, values: sweepValues };
}

/**
 * Find the longest sweep (by sample count). Used to pick a reference
 * x-axis grid when the panel renders overlaid sweeps.
 *
 * Returns `null` for an empty input. Ties go to the first occurrence.
 */
export function longestSweep(sweeps: ReadonlyArray<Sweep>): Sweep | null {
  if (sweeps.length === 0) return null;
  let best = sweeps[0]!;
  for (let i = 1; i < sweeps.length; i++) {
    const s = sweeps[i]!;
    if (s.values.length > best.values.length) {
      best = s;
    }
  }
  return best;
}

/**
 * Summarize a sweep-family for a debug/header line — e.g. the panel's
 * subtitle shows "12 sweeps · 350-400 samples each · 0.6 s span". This
 * is purely cosmetic; the chart itself doesn't depend on it.
 */
export interface SweepFamilySummary {
  count: number;
  minSamples: number;
  maxSamples: number;
  maxSpanSeconds: number;
}

export function summarize(
  sweeps: ReadonlyArray<Sweep>,
): SweepFamilySummary {
  if (sweeps.length === 0) {
    return { count: 0, minSamples: 0, maxSamples: 0, maxSpanSeconds: 0 };
  }
  let minSamples = sweeps[0]!.values.length;
  let maxSamples = sweeps[0]!.values.length;
  let maxSpanSeconds = 0;
  for (const s of sweeps) {
    if (s.values.length < minSamples) minSamples = s.values.length;
    if (s.values.length > maxSamples) maxSamples = s.values.length;
    const span = s.time.length > 0 ? s.time[s.time.length - 1]! - s.time[0]! : 0;
    if (span > maxSpanSeconds) maxSpanSeconds = span;
  }
  return { count: sweeps.length, minSamples, maxSamples, maxSpanSeconds };
}
