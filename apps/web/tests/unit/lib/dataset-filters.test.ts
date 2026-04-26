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
});
