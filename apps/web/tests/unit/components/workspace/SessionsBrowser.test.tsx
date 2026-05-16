/**
 * SessionsBrowser — pure filter + format coverage.
 *
 * Phase C of the workspace redesign. Tests the two pure functions
 * the SessionsBrowser delegates to:
 *
 *   - `filterEpochs` — subject/window/probe substring matching with
 *     window matching against both start.globalTime and
 *     start.devTime (the dual-clock t0/t1 normalisation).
 *   - `formatEpochTime` — prefers globalTime over devTime; falls
 *     back to "—" when both are missing or empty.
 */
import { describe, expect, it } from 'vitest';

import {
  filterEpochs,
  formatEpochTime,
} from '@/components/workspace/SessionsBrowser';

const SAMPLE = [
  {
    epochDocumentIdentifier: 'e1',
    epochNumber: '1',
    subjectDocumentIdentifier: 'subj-A',
    probeDocumentIdentifier: 'probe-X',
    epochStart: { devTime: 0, globalTime: '2023-06-14T10:00:00Z' },
    epochStop: { devTime: 60, globalTime: '2023-06-14T10:01:00Z' },
    approachName: 'patch-Vm',
  },
  {
    epochDocumentIdentifier: 'e2',
    epochNumber: '2',
    subjectDocumentIdentifier: 'subj-A',
    probeDocumentIdentifier: 'probe-Y',
    epochStart: { devTime: 0, globalTime: '2024-01-08T14:00:00Z' },
    epochStop: { devTime: 120, globalTime: '2024-01-08T14:02:00Z' },
    approachName: 'patch-I',
  },
  {
    epochDocumentIdentifier: 'e3',
    epochNumber: '3',
    subjectDocumentIdentifier: 'subj-B',
    probeDocumentIdentifier: 'probe-X',
    epochStart: { devTime: 0, globalTime: null }, // dev-only clock
    epochStop: { devTime: 30, globalTime: null },
    approachName: 'stimulator',
  },
];

describe('formatEpochTime', () => {
  it('prefers globalTime when present', () => {
    expect(formatEpochTime(SAMPLE[0]!.epochStart)).toBe(
      '2023-06-14T10:00:00Z',
    );
  });

  it('falls back to devTime when globalTime is null', () => {
    expect(formatEpochTime(SAMPLE[2]!.epochStart)).toBe('0');
  });

  it('returns em-dash when both fields are missing', () => {
    expect(formatEpochTime({ devTime: null, globalTime: null })).toBe('—');
    expect(formatEpochTime({})).toBe('—');
  });

  it('returns em-dash for null input', () => {
    expect(formatEpochTime(null)).toBe('—');
  });
});

describe('filterEpochs', () => {
  it('returns every row when all filters are empty', () => {
    expect(
      filterEpochs(SAMPLE, { subject: '', window: '', probe: '' }),
    ).toHaveLength(SAMPLE.length);
  });

  it('filters by subject id substring (case-insensitive)', () => {
    const rows = filterEpochs(SAMPLE, {
      subject: 'SUBJ-A',
      window: '',
      probe: '',
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.subjectDocumentIdentifier === 'subj-A')).toBe(
      true,
    );
  });

  it('filters by probe id substring', () => {
    const rows = filterEpochs(SAMPLE, {
      subject: '',
      window: '',
      probe: 'probe-X',
    });
    expect(rows).toHaveLength(2);
  });

  it('filters by time-window substring against globalTime', () => {
    // Tutorial pattern: global_t0 contains "Jun-2023" → e1 only.
    // Our SAMPLE uses ISO strings; the test mirrors the tutorial's
    // semantics with the equivalent substring.
    const rows = filterEpochs(SAMPLE, {
      subject: '',
      window: '2023-06',
      probe: '',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.epochDocumentIdentifier).toBe('e1');
  });

  it('matches window filter against devTime when globalTime is null', () => {
    const rows = filterEpochs(SAMPLE, {
      subject: '',
      window: '30', // matches e3's stop.devTime
      probe: '',
    });
    expect(rows.some((r) => r.epochDocumentIdentifier === 'e3')).toBe(true);
  });

  it('combines subject + probe filters with AND semantics', () => {
    const rows = filterEpochs(SAMPLE, {
      subject: 'subj-A',
      window: '',
      probe: 'probe-Y',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.epochDocumentIdentifier).toBe('e2');
  });

  it('returns no rows when filters are mutually exclusive', () => {
    const rows = filterEpochs(SAMPLE, {
      subject: 'subj-A',
      window: '',
      probe: 'probe-Z', // no such probe in SAMPLE
    });
    expect(rows).toEqual([]);
  });
});
