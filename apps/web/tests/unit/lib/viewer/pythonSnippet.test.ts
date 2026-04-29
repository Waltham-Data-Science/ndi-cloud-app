import { describe, expect, it } from 'vitest';

import { formatPythonSnippet } from '@/lib/viewer/pythonSnippet';

const baseArgs = {
  datasetId: 'abc123',
  className: 'subject',
  yField: 'latency',
  xField: '',
};

describe('formatPythonSnippet', () => {
  it('emits a histogram snippet with the right matplotlib call and labels', () => {
    const code = formatPythonSnippet({ ...baseArgs, plotType: 'histogram' });
    expect(code).toContain('import matplotlib.pyplot as plt');
    expect(code).toContain('plt.hist');
    expect(code).toContain('"latency"');
    expect(code).toContain('https://ndi-cloud.com/datasets/abc123');
    expect(code).toContain('class=subject');
  });

  it('emits a violin snippet with grouping, jittered points, and IQR box overlay', () => {
    const code = formatPythonSnippet({
      ...baseArgs,
      plotType: 'violin',
      xField: 'strain',
    });
    expect(code).toContain('ax.violinplot');
    expect(code).toContain('"latency"');
    expect(code).toContain('"strain"');
    // Jittered overlay + IQR box are the canonical scientific look
    expect(code).toContain('jitter');
    expect(code).toContain('percentile');
  });

  it('emits a box snippet with a boxplot call and jittered points', () => {
    const code = formatPythonSnippet({
      ...baseArgs,
      plotType: 'box',
      xField: 'strain',
    });
    expect(code).toContain('boxplot');
    expect(code).toContain('"strain"');
    expect(code).toContain('jitter');
  });

  it('emits a scatter snippet with plt.scatter and both axis labels', () => {
    const code = formatPythonSnippet({
      ...baseArgs,
      plotType: 'scatter',
      xField: 'age',
    });
    expect(code).toContain('plt.scatter');
    expect(code).toContain('"latency"');
    expect(code).toContain('"age"');
  });

  it('emits a line snippet with plt.plot sorted by x', () => {
    const code = formatPythonSnippet({
      ...baseArgs,
      plotType: 'line',
      xField: 'time',
    });
    expect(code).toContain('plt.plot');
    expect(code).toContain('"time"');
    expect(code).toContain('"latency"');
    // Sorted by x — line plots want monotonic x for clean rendering
    expect(code).toMatch(/sort/i);
  });

  it('emits a bar-count snippet with a Counter and plt.bar', () => {
    const code = formatPythonSnippet({
      datasetId: 'abc123',
      className: 'subject',
      yField: '',
      xField: 'strain',
      plotType: 'bar-count',
    });
    expect(code).toContain('Counter');
    expect(code).toContain('plt.bar');
    expect(code).toContain('"strain"');
  });

  it('escapes column names that contain double quotes', () => {
    const code = formatPythonSnippet({
      datasetId: 'abc123',
      className: 'subject',
      yField: 'weird"col',
      xField: '',
      plotType: 'histogram',
    });
    expect(code).toContain('"weird\\"col"');
  });

  it('escapes column names that contain backslashes', () => {
    const code = formatPythonSnippet({
      datasetId: 'abc123',
      className: 'subject',
      yField: 'weird\\col',
      xField: '',
      plotType: 'histogram',
    });
    expect(code).toContain('"weird\\\\col"');
  });

  it('includes a permalink comment with the dataset URL and class', () => {
    const code = formatPythonSnippet({
      ...baseArgs,
      plotType: 'histogram',
    });
    expect(code).toContain('https://ndi-cloud.com/datasets/abc123');
    expect(code).toContain('class=subject');
  });

  it('imports requests, matplotlib, and numpy in the preamble', () => {
    const code = formatPythonSnippet({ ...baseArgs, plotType: 'histogram' });
    expect(code).toContain('import requests');
    expect(code).toContain('import matplotlib.pyplot as plt');
    expect(code).toContain('import numpy as np');
  });
});
