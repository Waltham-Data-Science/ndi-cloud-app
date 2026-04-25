/**
 * format helpers — quick coverage on the pure functions.
 * format.ts is consumed by every catalog card; tiny tests, big leverage.
 */
import { describe, expect, it } from 'vitest';

import {
  formatBytes,
  formatDate,
  formatNumber,
  truncate,
} from '@/lib/format';

describe('formatNumber', () => {
  it('inserts thousand separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('handles negatives', () => {
    expect(formatNumber(-42)).toBe('-42');
  });
});

describe('formatDate', () => {
  it('formats ISO into a readable Mon-DD-YYYY shape', () => {
    const result = formatDate('2026-04-25T12:00:00.000Z');
    // Locale-dependent; assert on the year + month abbreviation.
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/Apr/);
  });

  it('returns the em-dash for null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('returns the em-dash for undefined', () => {
    expect(formatDate(undefined)).toBe('—');
  });

  it('returns the raw input for unparseable strings', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('truncate', () => {
  it('returns the input unchanged when shorter than the limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('clips and appends an ellipsis when longer', () => {
    expect(truncate('hello world', 6)).toBe('hello…');
  });

  it('returns empty string for null', () => {
    expect(truncate(null)).toBe('');
  });
});

describe('formatBytes', () => {
  it('returns em-dash for null/undefined/NaN', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });

  it('renders bytes for sub-1KB values', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('renders KB for 1024–1MB', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('renders MB for 1MB–1GB', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('renders integer-precision for large units (≥10)', () => {
    // 25 MB → "25 MB" (no decimal because value >= 10).
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
  });

  it('handles negatives by absolute value', () => {
    expect(formatBytes(-1024)).toBe('1.0 KB');
  });
});
