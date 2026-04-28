/**
 * dataset-filters — REBUILD-5 catalog filter pure-function helpers.
 *
 * Ported from the inline closures in `ndi-data-browser-v2/frontend/src/
 * pages/DatasetsPage.tsx:593-675` (matchesFilters, compareBy,
 * datasetSpeciesValues, datasetRegionValues, parseCsv, anyMatch,
 * dateOf). Extracting them into `lib/dataset-filters.ts` lets us unit
 * test the contract directly — the source kept them as private
 * closures so they were only exercised through the page render.
 */
import { describe, expect, it } from 'vitest';

import type { DatasetRecord } from '@/lib/api/datasets';
import {
  parseCsv,
  matchesFilters,
  compareBy,
  licenseOptionsFor,
  isDefaultBranch,
} from '@/lib/dataset-filters';

function record(overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: 'd1',
    name: 'Default name',
    ...overrides,
  };
}

describe('parseCsv', () => {
  it('returns empty array for null/empty', () => {
    expect(parseCsv(null)).toEqual([]);
    expect(parseCsv('')).toEqual([]);
  });
  it('splits on commas and trims', () => {
    expect(parseCsv('foo, bar, baz ')).toEqual(['foo', 'bar', 'baz']);
  });
  it('drops empty entries from trailing commas', () => {
    expect(parseCsv('foo,,bar,')).toEqual(['foo', 'bar']);
  });
});

describe('matchesFilters — text query', () => {
  it('passes when q is empty', () => {
    expect(
      matchesFilters(record({ name: 'Cortical recordings' }), {
        q: '',
        species: [],
        regions: [],
        license: [],
      }),
    ).toBe(true);
  });
  it('matches against name (case-insensitive)', () => {
    expect(
      matchesFilters(record({ name: 'Cortical recordings' }), {
        q: 'cortical',
        species: [],
        regions: [],
        license: [],
      }),
    ).toBe(true);
  });
  it('matches against abstract', () => {
    expect(
      matchesFilters(
        record({ name: 'X', abstract: 'About orientation tuning in V1' }),
        { q: 'orientation', species: [], regions: [], license: [] },
      ),
    ).toBe(true);
  });
  it('matches against contributor names', () => {
    const r = record({
      contributors: [{ firstName: 'Stephen', lastName: 'Van Hooser' }],
    });
    expect(
      matchesFilters(r, { q: 'van hooser', species: [], regions: [], license: [] }),
    ).toBe(true);
  });
  it('rejects when q has no hit', () => {
    expect(
      matchesFilters(record({ name: 'Foo' }), {
        q: 'bar',
        species: [],
        regions: [],
        license: [],
      }),
    ).toBe(false);
  });

  // 2026-04-28 — token-AND match for abbreviated species searches
  // (team review feedback). Pre-fix this used `hay.includes(needle)`
  // so `"C elegans"` (with space) didn't match a record whose
  // species field reads `"Caenorhabditis elegans"`. Post-fix the
  // needle is split into tokens and ALL must appear somewhere in
  // the hay, so the user's "find rows containing both 'c' AND
  // 'elegans'" intent works.
  it('matches "C elegans" against a Caenorhabditis elegans dataset', () => {
    const r = record({ name: 'Behavioral arena', species: 'Caenorhabditis elegans' });
    expect(
      matchesFilters(r, { q: 'C elegans', species: [], regions: [], license: [] }),
    ).toBe(true);
  });
  it('matches "M musc" against a Mus musculus dataset (partial token)', () => {
    const r = record({ name: 'V1 recordings', species: 'Mus musculus' });
    expect(
      matchesFilters(r, { q: 'M musc', species: [], regions: [], license: [] }),
    ).toBe(true);
  });
  it('strips token punctuation so "C." matches "Caenorhabditis"', () => {
    const r = record({ name: 'X', species: 'Caenorhabditis elegans' });
    expect(
      matchesFilters(r, { q: 'C. elegans', species: [], regions: [], license: [] }),
    ).toBe(true);
  });
  it('rejects when one of multiple tokens does not match', () => {
    const r = record({ name: 'Cortical V1', species: 'Mus musculus' });
    expect(
      matchesFilters(r, {
        q: 'cortical zebrafish',
        species: [],
        regions: [],
        license: [],
      }),
    ).toBe(false);
  });
});

describe('matchesFilters — license normalization', () => {
  // 2026-04-28 — the catalog facet sidebar shows normalized license
  // tags (`CC-BY-4.0` etc.); without per-record normalization in
  // matchesFilters, datasets with the variant raw form (`CC-BY 4.0`,
  // `Creative Commons Attribution 4.0`) wouldn't match the chip the
  // user picked. These tests pin that behavior.
  it('matches a CC-BY 4.0 (with space) dataset when the filter picks CC-BY-4.0', () => {
    expect(
      matchesFilters(record({ license: 'CC-BY 4.0' }), {
        q: '',
        species: [],
        regions: [],
        license: ['CC-BY-4.0'],
      }),
    ).toBe(true);
  });
  it('matches a "Creative Commons Attribution 4.0" dataset when the filter picks CC-BY-4.0', () => {
    expect(
      matchesFilters(record({ license: 'Creative Commons Attribution 4.0' }), {
        q: '',
        species: [],
        regions: [],
        license: ['CC-BY-4.0'],
      }),
    ).toBe(true);
  });
});

describe('isDefaultBranch', () => {
  it('returns true for falsy input', () => {
    expect(isDefaultBranch(undefined)).toBe(true);
    expect(isDefaultBranch(null)).toBe(true);
    expect(isDefaultBranch('')).toBe(true);
  });
  it('returns true for "main" / "original" / "original submission"', () => {
    expect(isDefaultBranch('main')).toBe(true);
    expect(isDefaultBranch('original')).toBe(true);
    expect(isDefaultBranch('original submission')).toBe(true);
  });
  it('is case-insensitive and trims whitespace', () => {
    expect(isDefaultBranch('  Main  ')).toBe(true);
    expect(isDefaultBranch('ORIGINAL SUBMISSION')).toBe(true);
  });
  it('returns false for actual non-default branch names', () => {
    expect(isDefaultBranch('v2-revision')).toBe(false);
    expect(isDefaultBranch('feature/foo')).toBe(false);
  });
});

describe('matchesFilters — facet checkboxes', () => {
  it('matches species against raw species field', () => {
    const r = record({ species: 'Mus musculus, Rattus norvegicus' });
    expect(
      matchesFilters(r, {
        q: '',
        species: ['Mus musculus'],
        regions: [],
        license: [],
      }),
    ).toBe(true);
  });
  it('matches species via summary fallback when raw is missing', () => {
    const r = record({
      summary: {
        datasetId: 'd1',
        counts: { subjects: 0, totalDocuments: 0 },
        species: [
          { label: 'Caenorhabditis elegans', ontologyId: 'NCBITaxon:6239' },
        ],
        brainRegions: [],
        citation: {
          title: 'X',
          license: null,
          datasetDoi: null,
          year: null,
        },
        schemaVersion: 'summary:v1',
      },
    });
    expect(
      matchesFilters(r, {
        q: '',
        species: ['Caenorhabditis elegans'],
        regions: [],
        license: [],
      }),
    ).toBe(true);
  });
  it('rejects when species filter does not match any record value', () => {
    const r = record({ species: 'Mus musculus' });
    expect(
      matchesFilters(r, {
        q: '',
        species: ['Drosophila'],
        regions: [],
        license: [],
      }),
    ).toBe(false);
  });
  it('matches license exactly', () => {
    expect(
      matchesFilters(record({ license: 'CC-BY-4.0' }), {
        q: '',
        species: [],
        regions: [],
        license: ['CC-BY-4.0'],
      }),
    ).toBe(true);
  });
  it('rejects when license filter active but record has none', () => {
    expect(
      matchesFilters(record({ license: undefined }), {
        q: '',
        species: [],
        regions: [],
        license: ['CC-BY-4.0'],
      }),
    ).toBe(false);
  });
});

describe('compareBy', () => {
  it('newest sorts most recent first', () => {
    const a = record({ id: 'a', uploadedAt: '2024-01-01T00:00:00Z' });
    const b = record({ id: 'b', uploadedAt: '2025-01-01T00:00:00Z' });
    expect([a, b].sort(compareBy('newest')).map((r) => r.id)).toEqual([
      'b',
      'a',
    ]);
  });
  it('oldest sorts least recent first', () => {
    const a = record({ id: 'a', uploadedAt: '2024-01-01T00:00:00Z' });
    const b = record({ id: 'b', uploadedAt: '2025-01-01T00:00:00Z' });
    expect([a, b].sort(compareBy('oldest')).map((r) => r.id)).toEqual([
      'a',
      'b',
    ]);
  });
  it('name sorts alphabetically', () => {
    const a = record({ id: 'a', name: 'Zebra dataset' });
    const b = record({ id: 'b', name: 'Alpha dataset' });
    expect([a, b].sort(compareBy('name')).map((r) => r.id)).toEqual(['b', 'a']);
  });
  it('relevance is a stable no-op', () => {
    const a = record({ id: 'a' });
    const b = record({ id: 'b' });
    expect([a, b].sort(compareBy('relevance')).map((r) => r.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('licenseOptionsFor', () => {
  it('floats CC-BY-4.0 and CC0-1.0 to top, sorts the rest alphabetically', () => {
    const datasets = [
      record({ id: '1', license: 'MIT' }),
      record({ id: '2', license: 'CC-BY-4.0' }),
      record({ id: '3', license: 'Apache-2.0' }),
      record({ id: '4', license: 'CC0-1.0' }),
    ];
    expect(licenseOptionsFor(datasets)).toEqual([
      'CC-BY-4.0',
      'CC0-1.0',
      'Apache-2.0',
      'MIT',
    ]);
  });
  it('skips records with no license', () => {
    const datasets = [
      record({ id: '1', license: 'MIT' }),
      record({ id: '2' }),
    ];
    expect(licenseOptionsFor(datasets)).toEqual(['MIT']);
  });
  // 2026-04-28 — variants (CC-BY 4.0 with space, "Creative Commons
  // Attribution 4.0", CC0 bare) collapse to a single canonical chip
  // each. Pre-fix the sidebar showed three separate chips for what
  // is conceptually one license — reviewer flagged the inconsistency.
  it('collapses CC-BY variants to a single canonical chip', () => {
    const datasets = [
      record({ id: '1', license: 'CC-BY-4.0' }),
      record({ id: '2', license: 'CC-BY 4.0' }),
      record({ id: '3', license: 'Creative Commons Attribution 4.0' }),
    ];
    expect(licenseOptionsFor(datasets)).toEqual(['CC-BY-4.0']);
  });
  it('collapses bare CC0 to CC0-1.0', () => {
    const datasets = [
      record({ id: '1', license: 'CC0' }),
      record({ id: '2', license: 'CC0-1.0' }),
    ];
    expect(licenseOptionsFor(datasets)).toEqual(['CC0-1.0']);
  });
});
