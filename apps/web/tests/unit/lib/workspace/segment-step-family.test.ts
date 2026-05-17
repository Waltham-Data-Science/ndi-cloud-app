import { describe, expect, it } from 'vitest';

import {
  longestSweep,
  segmentByNanGaps,
  summarize,
} from '@/lib/workspace/segment-step-family';

describe('segmentByNanGaps', () => {
  it('returns no sweeps for empty input', () => {
    expect(segmentByNanGaps([], [])).toEqual([]);
  });

  it('returns no sweeps when every sample is NaN', () => {
    expect(segmentByNanGaps([0, 1, 2, 3], [NaN, NaN, NaN, NaN])).toEqual([]);
  });

  it('returns no sweeps when every sample is null', () => {
    expect(segmentByNanGaps([0, 1, 2], [null, null, null])).toEqual([]);
  });

  it('treats a fully-defined signal as exactly one sweep', () => {
    const sweeps = segmentByNanGaps([0, 1, 2, 3], [10, 20, 30, 40]);
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0]!.index).toBe(0);
    expect(sweeps[0]!.startSample).toBe(0);
    expect(sweeps[0]!.endSample).toBe(4);
    expect(sweeps[0]!.values).toEqual([10, 20, 30, 40]);
    expect(sweeps[0]!.time).toEqual([0, 1, 2, 3]);
  });

  it('rebases each sweep so time[0] = 0', () => {
    // Two sweeps at t=10-11 and t=20-21
    const time = [10, 11, 15, 20, 21];
    const values = [1, 2, NaN, 3, 4];
    const sweeps = segmentByNanGaps(time, values);
    expect(sweeps).toHaveLength(2);
    expect(sweeps[0]!.time).toEqual([0, 1]);
    expect(sweeps[0]!.values).toEqual([1, 2]);
    expect(sweeps[1]!.time).toEqual([0, 1]);
    expect(sweeps[1]!.values).toEqual([3, 4]);
  });

  it('skips leading NaN runs', () => {
    const sweeps = segmentByNanGaps([0, 1, 2, 3], [NaN, NaN, 5, 6]);
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0]!.startSample).toBe(2);
    expect(sweeps[0]!.endSample).toBe(4);
    expect(sweeps[0]!.values).toEqual([5, 6]);
  });

  it('skips trailing NaN runs', () => {
    const sweeps = segmentByNanGaps([0, 1, 2, 3], [5, 6, NaN, NaN]);
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0]!.startSample).toBe(0);
    expect(sweeps[0]!.endSample).toBe(2);
    expect(sweeps[0]!.values).toEqual([5, 6]);
  });

  it('produces sequential index values for multiple sweeps', () => {
    // 4 sweeps: [0-1], [3-4], [6-7], [9-10]
    const time = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const values = [1, 2, NaN, 3, 4, NaN, 5, 6, NaN, 7, 8];
    const sweeps = segmentByNanGaps(time, values);
    expect(sweeps).toHaveLength(4);
    expect(sweeps.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it('preserves single-sample sweeps', () => {
    const time = [0, 1, 2, 3];
    const values = [1, NaN, 3, NaN];
    const sweeps = segmentByNanGaps(time, values);
    expect(sweeps).toHaveLength(2);
    expect(sweeps[0]!.values).toEqual([1]);
    expect(sweeps[1]!.values).toEqual([3]);
  });

  it('clamps to the shorter of (time, values) when lengths mismatch', () => {
    // Defensive: values is shorter than time
    const time = [0, 1, 2, 3, 4];
    const values = [1, 2, 3];
    const sweeps = segmentByNanGaps(time, values);
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0]!.values).toHaveLength(3);
  });

  it('treats Infinity as a gap (only finite numbers are samples)', () => {
    const sweeps = segmentByNanGaps([0, 1, 2, 3], [1, Infinity, 3, 4]);
    expect(sweeps).toHaveLength(2);
    expect(sweeps[0]!.values).toEqual([1]);
    expect(sweeps[1]!.values).toEqual([3, 4]);
  });
});

describe('longestSweep', () => {
  it('returns null for empty input', () => {
    expect(longestSweep([])).toBeNull();
  });

  it('picks the longest sweep by sample count', () => {
    const sweeps = segmentByNanGaps(
      [0, 1, 2, 3, 4, 5, 6, 7],
      [1, NaN, 3, 4, 5, NaN, 7, 8],
    );
    const longest = longestSweep(sweeps);
    expect(longest).not.toBeNull();
    expect(longest!.values).toEqual([3, 4, 5]);
  });

  it('breaks ties by first occurrence', () => {
    const sweeps = segmentByNanGaps([0, 1, 2, 3], [1, NaN, 3, NaN]);
    // Both length 1, the first one wins.
    expect(longestSweep(sweeps)!.index).toBe(0);
  });
});

describe('summarize', () => {
  it('reports zeros for no sweeps', () => {
    expect(summarize([])).toEqual({
      count: 0,
      minSamples: 0,
      maxSamples: 0,
      maxSpanSeconds: 0,
    });
  });

  it('reports min/max sample counts + max span', () => {
    // Sweep 0: time [0, 0.1, 0.2] -> rebased [0, 0.1, 0.2], span 0.2
    // Sweep 1: time [0.6, 0.7, 0.8] -> rebased [0, 0.1, 0.2], span 0.2
    const sweeps = segmentByNanGaps(
      [0, 0.1, 0.2, 0.5, 0.6, 0.7, 0.8],
      [1, 2, 3, NaN, 4, 5, 6],
    );
    const summary = summarize(sweeps);
    expect(summary.count).toBe(2);
    expect(summary.minSamples).toBe(3);
    expect(summary.maxSamples).toBe(3);
    expect(summary.maxSpanSeconds).toBeCloseTo(0.2, 5);
  });
});
