import { describe, expect, it } from 'vitest';

import { inferPlotShape } from '@/lib/viewer/inferPlotShape';

const numericCols = ['latency', 'age', 'time', 'frame'];
const categoricalCols = ['strain', 'sex'];

const baseTable = {
  rows: [
    { latency: 10, age: 5, time: 0.0, frame: 0, strain: 'WT', sex: 'F' },
    { latency: 12, age: 6, time: 0.1, frame: 1, strain: 'KO', sex: 'M' },
    { latency: 15, age: 7, time: 0.2, frame: 2, strain: 'WT', sex: 'F' },
  ],
};

const nonMonotonicTimeTable = {
  rows: [
    { latency: 10, time: 0.5 },
    { latency: 12, time: 0.1 },
    { latency: 15, time: 0.3 },
  ],
};

describe('inferPlotShape', () => {
  it('returns null when both Y and X are unset', () => {
    const result = inferPlotShape({
      yField: '',
      xField: '',
      numericCols,
      categoricalCols,
      table: baseTable,
    });
    expect(result).toBeNull();
  });

  it('returns null when Y is unset and X is numeric (no useful default)', () => {
    const result = inferPlotShape({
      yField: '',
      xField: 'age',
      numericCols,
      categoricalCols,
      table: baseTable,
    });
    expect(result).toBeNull();
  });

  it('returns bar-count when Y is unset and X is categorical', () => {
    const result = inferPlotShape({
      yField: '',
      xField: 'strain',
      numericCols,
      categoricalCols,
      table: baseTable,
    });
    expect(result).toEqual({ plotType: 'bar-count', dispatchMode: 'in-memory' });
  });

  it('returns histogram + distribution-ungrouped for solo numeric Y', () => {
    const result = inferPlotShape({
      yField: 'latency',
      xField: '',
      numericCols,
      categoricalCols,
      table: baseTable,
    });
    expect(result).toEqual({
      plotType: 'histogram',
      dispatchMode: 'distribution-ungrouped',
    });
  });

  it('returns violin + distribution-grouped for numeric Y x categorical X', () => {
    const result = inferPlotShape({
      yField: 'latency',
      xField: 'strain',
      numericCols,
      categoricalCols,
      table: baseTable,
    });
    expect(result).toEqual({
      plotType: 'violin',
      dispatchMode: 'distribution-grouped',
    });
  });

  it('returns scatter + in-memory for numeric Y x numeric X (non-time-shaped)', () => {
    const result = inferPlotShape({
      yField: 'latency',
      xField: 'age',
      numericCols,
      categoricalCols,
      table: baseTable,
    });
    expect(result).toEqual({ plotType: 'scatter', dispatchMode: 'in-memory' });
  });

  it('returns line + in-memory for numeric Y x time-named monotonic X', () => {
    const result = inferPlotShape({
      yField: 'latency',
      xField: 'time',
      numericCols,
      categoricalCols,
      table: baseTable,
    });
    expect(result).toEqual({ plotType: 'line', dispatchMode: 'in-memory' });
  });

  it('returns line for "frame" column (a time-like name) when monotonic', () => {
    const result = inferPlotShape({
      yField: 'latency',
      xField: 'frame',
      numericCols,
      categoricalCols,
      table: baseTable,
    });
    expect(result?.plotType).toBe('line');
  });

  it('falls back to scatter when X has a time-like name but is NOT monotonic', () => {
    const result = inferPlotShape({
      yField: 'latency',
      xField: 'time',
      numericCols: ['latency', 'time'],
      categoricalCols: [],
      table: nonMonotonicTimeTable,
    });
    expect(result?.plotType).toBe('scatter');
  });

  it('matches "time" / "TIME" / "Time" case-insensitively', () => {
    for (const name of ['time', 'TIME', 'Time', 'TIMESTAMP']) {
      const t = {
        rows: [{ latency: 1, [name]: 0 }, { latency: 2, [name]: 1 }],
      };
      const result = inferPlotShape({
        yField: 'latency',
        xField: name,
        numericCols: ['latency', name],
        categoricalCols: [],
        table: t,
      });
      expect(result?.plotType).toBe('line');
    }
  });

  it('matches all the canonical time-like names: t, time, epoch, trial, frame, timestamp, sec, seconds, ms', () => {
    for (const name of ['t', 'time', 'epoch', 'trial', 'frame', 'timestamp', 'sec', 'seconds', 'ms']) {
      const t = {
        rows: [{ latency: 1, [name]: 0 }, { latency: 2, [name]: 1 }],
      };
      const result = inferPlotShape({
        yField: 'latency',
        xField: name,
        numericCols: ['latency', name],
        categoricalCols: [],
        table: t,
      });
      expect(result?.plotType, `expected line for ${name}`).toBe('line');
    }
  });

  it('does NOT match arbitrary names that contain time substrings (e.g. duration_ms, time_to_peak)', () => {
    // The regex is anchored — only exact whole-word matches count. A
    // column called "duration_ms" or "time_to_peak" is conceptually
    // numeric data, not an axis-time column, so we default to scatter.
    for (const name of ['duration_ms', 'time_to_peak', 'frame_count', 'subject']) {
      const t = {
        rows: [{ latency: 1, [name]: 0 }, { latency: 2, [name]: 1 }],
      };
      const result = inferPlotShape({
        yField: 'latency',
        xField: name,
        numericCols: ['latency', name],
        categoricalCols: [],
        table: t,
      });
      expect(result?.plotType, `expected scatter for ${name}`).toBe('scatter');
    }
  });

  it('treats X as monotonic when only some rows have numeric values (skips nulls)', () => {
    const t = {
      rows: [
        { latency: 1, time: 0 },
        { latency: 2, time: null },
        { latency: 3, time: 1 },
      ],
    };
    const result = inferPlotShape({
      yField: 'latency',
      xField: 'time',
      numericCols: ['latency', 'time'],
      categoricalCols: [],
      table: t,
    });
    expect(result?.plotType).toBe('line');
  });

  it('handles equal consecutive X values as monotonic non-decreasing (line, not scatter)', () => {
    const t = {
      rows: [
        { latency: 1, time: 0 },
        { latency: 2, time: 0 },
        { latency: 3, time: 1 },
      ],
    };
    const result = inferPlotShape({
      yField: 'latency',
      xField: 'time',
      numericCols: ['latency', 'time'],
      categoricalCols: [],
      table: t,
    });
    expect(result?.plotType).toBe('line');
  });
});
