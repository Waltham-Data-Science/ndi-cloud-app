/**
 * License normalizer — direct tests.
 *
 * The 2026-04-29 audit found this module had zero direct tests; it
 * was exercised only indirectly through `dataset-filters.test.ts`'s
 * `matchesFilters` check. That's insufficient — a regression in the
 * normalizer would scatter through the catalog (cards), the dataset
 * hero (badge), the facet filter sidebar, and the citation modal.
 *
 * Tests pin the canonical-SPDX outputs the renderer expects.
 */
import { describe, expect, it } from 'vitest';

import {
  normalizeLicense,
  normalizeLicenseList,
} from '@/lib/license-normalize';

describe('normalizeLicense — CC-BY family', () => {
  it.each([
    ['CC-BY-4.0', 'CC-BY-4.0'],
    ['CC-BY 4.0', 'CC-BY-4.0'], // space separator
    ['CC BY 4.0', 'CC-BY-4.0'],
    ['cc-by-4.0', 'CC-BY-4.0'], // lowercase
    ['Creative Commons Attribution 4.0', 'CC-BY-4.0'], // verbose
    ['Attribution 4.0', 'CC-BY-4.0'], // verbose w/o "Creative Commons"
    ['BY-4.0', 'CC-BY-4.0'], // bare BY
  ])('normalizes %s → %s', (raw, expected) => {
    expect(normalizeLicense(raw)).toBe(expected);
  });

  it.each([
    ['CC-BY-NC-4.0', 'CC-BY-NC-4.0'],
    ['CC-BY-SA-4.0', 'CC-BY-SA-4.0'],
    ['CC-BY-ND-4.0', 'CC-BY-ND-4.0'],
    ['CC-BY-NC-SA-4.0', 'CC-BY-NC-SA-4.0'],
    ['CC-BY-NC-ND-4.0', 'CC-BY-NC-ND-4.0'],
    // Canonical SPDX ordering: BY-NC-SA, not BY-SA-NC
    ['CC-BY-SA-NC-4.0', 'CC-BY-NC-SA-4.0'],
  ])('handles flag combinations: %s → %s', (raw, expected) => {
    expect(normalizeLicense(raw)).toBe(expected);
  });

  it('defaults version to 4.0 when not specified', () => {
    expect(normalizeLicense('CC-BY')).toBe('CC-BY-4.0');
  });

  it('upgrades single-digit version to N.0', () => {
    // `CC-BY 4` → `CC-BY-4.0` (input is missing the .0 minor)
    expect(normalizeLicense('CC-BY 4')).toBe('CC-BY-4.0');
  });
});

describe('normalizeLicense — CC0', () => {
  it.each([
    ['CC0', 'CC0-1.0'],
    ['CC-0', 'CC0-1.0'],
    ['CC0-1.0', 'CC0-1.0'],
    ['CC0 1.0', 'CC0-1.0'],
    ['cc0', 'CC0-1.0'], // case-insensitive
    ['Public Domain', 'CC0-1.0'],
    ['PDDC', 'CC0-1.0'],
  ])('normalizes %s → %s', (raw, expected) => {
    expect(normalizeLicense(raw)).toBe(expected);
  });
});

describe('normalizeLicense — code licenses (pass-through)', () => {
  it.each([
    ['Apache-2.0', 'Apache-2.0'],
    ['Apache 2.0', 'Apache-2.0'],
    ['MIT', 'MIT'],
    ['BSD-3-Clause', 'BSD-3-Clause'],
    ['BSD 3', 'BSD-3-Clause'],
    ['BSD-2-Clause', 'BSD-2-Clause'],
    ['GPL-3.0', 'GPL-3.0'],
    ['GPL 2', 'GPL-2.0'],
  ])('normalizes %s → %s', (raw, expected) => {
    expect(normalizeLicense(raw)).toBe(expected);
  });
});

describe('normalizeLicense — edge cases', () => {
  it('returns null for null / undefined / empty / whitespace-only', () => {
    expect(normalizeLicense(null)).toBeNull();
    expect(normalizeLicense(undefined)).toBeNull();
    expect(normalizeLicense('')).toBeNull();
    expect(normalizeLicense('   ')).toBeNull();
  });

  it('passes through unrecognized licenses (Reikersdorfer-style "Custom" field)', () => {
    // Better to show the raw user-typed value than to drop it
    // silently — the user typed something meaningful.
    expect(normalizeLicense('Custom Internal')).toBe('Custom Internal');
    expect(normalizeLicense('All Rights Reserved')).toBe('All Rights Reserved');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(normalizeLicense('  CC-BY-4.0  ')).toBe('CC-BY-4.0');
  });
});

describe('normalizeLicenseList', () => {
  it('dedupes after normalization (three variants → one CC-BY-4.0 chip)', () => {
    const result = normalizeLicenseList([
      'CC-BY-4.0',
      'CC BY 4.0',
      'Creative Commons Attribution 4.0',
    ]);
    expect(result).toEqual(['CC-BY-4.0']);
  });

  it('preserves first-seen order across distinct licenses', () => {
    expect(
      normalizeLicenseList(['CC-BY-4.0', 'CC0-1.0', 'MIT']),
    ).toEqual(['CC-BY-4.0', 'CC0-1.0', 'MIT']);
  });

  it('skips null / undefined / empty entries', () => {
    expect(
      normalizeLicenseList([null, undefined, '', 'CC-BY-4.0', '   ']),
    ).toEqual(['CC-BY-4.0']);
  });

  it('returns [] for an empty or all-null input array', () => {
    expect(normalizeLicenseList([])).toEqual([]);
    expect(normalizeLicenseList([null, undefined, ''])).toEqual([]);
  });
});
