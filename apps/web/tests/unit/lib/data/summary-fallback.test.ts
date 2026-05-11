/**
 * summary-fallback — pin the degraded-record splice path.
 *
 * This module had ZERO coverage before the 2026-04-29 test-suite
 * audit. It's load-bearing: every dataset detail page checks
 * `isDegraded(summary)` and, when true, splices in raw DatasetRecord
 * fields via `enrichDegradedSummary(...)`. A regression in this path
 * surfaces as the "78,687 docs in hero + 0 in summary" contradiction
 * that prompted the helper's existence (see file docstring).
 *
 * Tests organized in three blocks:
 *
 *   1. `isDegraded` — the gate. Pins the structural fingerprint of
 *      a stage-1 timeout (zero counts + warnings) vs an empty-but-
 *      valid dataset (zero counts + no warnings) vs a populated one.
 *   2. `enrichDegradedSummary` — the splice. Per-field rules under
 *      varied DatasetRecord shapes from production (Bhar, Francesconi,
 *      Reikersdorfer, Griswold).
 *   3. `recordPublicationYear` edge cases — exposed via the
 *      enrichCitation path; bad / missing createdAt → null year.
 */
import { describe, expect, it } from 'vitest';

import {
  enrichDegradedSummary,
  isDegraded,
} from '@/lib/data/summary-fallback';
import type {
  DatasetSummary,
  DatasetSummaryCitation,
} from '@/lib/types/dataset-summary';
import {
  BHAR_RECORD,
  FRANCESCONI_RECORD,
  GRISWOLD_RECORD,
  REIKERSDORFER_RECORD,
  withOverrides,
} from '@/tests/fixtures/datasets';

/**
 * Build a degraded :class:`DatasetSummary` for testing. Defaults
 * reproduce the production-observed shape: stage-1 counts call timed
 * out, no facts extracted, one warning recorded. Override via the
 * argument to model different degraded states.
 */
function degradedSummary(
  overrides: Partial<DatasetSummary> = {},
): DatasetSummary {
  const base: DatasetSummary = {
    datasetId: 'ds1',
    counts: {
      sessions: 0,
      subjects: 0,
      probes: 0,
      elements: 0,
      epochs: 0,
      totalDocuments: 0,
    },
    species: null,
    strains: null,
    sexes: null,
    brainRegions: null,
    probeTypes: null,
    dateRange: { earliest: null, latest: null },
    totalSizeBytes: null,
    citation: {
      title: '',
      license: null,
      datasetDoi: null,
      paperDois: [],
      contributors: [],
      year: null,
    } satisfies DatasetSummaryCitation,
    computedAt: '2026-04-15T10:00:00Z',
    schemaVersion: 'summary:v1',
    extractionWarnings: ['document_class_counts timed out after 20s'],
  };
  return { ...base, ...overrides };
}

// ─── isDegraded ────────────────────────────────────────────────────

describe('isDegraded', () => {
  it('returns true for the stage-1-timeout fingerprint (zero counts + warnings)', () => {
    expect(isDegraded(degradedSummary())).toBe(true);
  });

  it('returns false for an empty-but-valid dataset (zero counts + NO warnings)', () => {
    // Empty published datasets DO exist; they have zero counts but
    // produce no extraction warnings because the synthesizer ran
    // successfully — just had nothing to count. These render via the
    // existing `[] vs null` UX, NOT through the fallback splice.
    expect(
      isDegraded(degradedSummary({ extractionWarnings: [] })),
    ).toBe(false);
  });

  it('returns false for a populated dataset (totalDocuments > 0)', () => {
    expect(
      isDegraded(
        degradedSummary({
          counts: {
            sessions: 10,
            subjects: 5,
            probes: 0,
            elements: 0,
            epochs: 100,
            totalDocuments: 1234,
          },
        }),
      ),
    ).toBe(false);
  });

  it('returns false when totalDocuments > 0 even WITH warnings (partial-success)', () => {
    // Stage-1 succeeded but a stage-2 sub-query failed. The summary
    // has real counts; render those. The warnings tooltip still
    // surfaces the partial failure to operators.
    expect(
      isDegraded(
        degradedSummary({
          counts: {
            sessions: 0,
            subjects: 0,
            probes: 0,
            elements: 0,
            epochs: 0,
            totalDocuments: 100,
          },
          extractionWarnings: ['strain_lookup partial'],
        }),
      ),
    ).toBe(false);
  });
});

// ─── enrichDegradedSummary — count splice ──────────────────────────

describe('enrichDegradedSummary — counts splice', () => {
  it('Bhar — splices numberOfSubjects + documentCount from the record', () => {
    const out = enrichDegradedSummary(degradedSummary(), BHAR_RECORD);
    // Bhar fixture: numberOfSubjects=1656, documentCount=66533
    expect(out.counts.subjects).toBe(1656);
    expect(out.counts.totalDocuments).toBe(66533);
    // Record doesn't expose sessions/probes/elements/epochs — those
    // stay at the degraded zero. The card renders them as "0" which
    // is honest given we don't have the data.
    expect(out.counts.sessions).toBe(0);
    expect(out.counts.probes).toBe(0);
    expect(out.counts.elements).toBe(0);
    expect(out.counts.epochs).toBe(0);
  });

  it('preserves degraded counts when record fields are missing or zero', () => {
    // Reikersdorfer has no numberOfSubjects on its record (only
    // documentCount). The splice should keep subjects=0 from the
    // degraded summary.
    const reikersdorfer = withOverrides(REIKERSDORFER_RECORD, {
      numberOfSubjects: undefined,
    });
    const out = enrichDegradedSummary(degradedSummary(), reikersdorfer);
    expect(out.counts.subjects).toBe(0);
    // documentCount IS present → splice fires
    expect(out.counts.totalDocuments).toBe(743);
  });
});

// ─── enrichDegradedSummary — species + brainRegions splice ────────

describe('enrichDegradedSummary — species / brainRegions splice', () => {
  it('Bhar — single species, no comma → 1-element OntologyTerm array with null ontologyId', () => {
    const out = enrichDegradedSummary(degradedSummary(), BHAR_RECORD);
    expect(out.species).toEqual([
      { label: 'Caenorhabditis elegans', ontologyId: null },
    ]);
  });

  it('Bhar — empty brainRegions string → null (NOT [])', () => {
    // `[] vs null` distinction: empty string means "not in the
    // record," not "explicitly empty." Renderer shows "Not
    // applicable" for null, "—" for [].
    const out = enrichDegradedSummary(degradedSummary(), BHAR_RECORD);
    expect(out.brainRegions).toBeNull();
  });

  it('multi-species CSV — splits on comma + trims whitespace', () => {
    const ds = withOverrides(GRISWOLD_RECORD, {
      species: 'Mus musculus, Caenorhabditis elegans, Rattus norvegicus',
    });
    const out = enrichDegradedSummary(degradedSummary(), ds);
    expect(out.species).toEqual([
      { label: 'Mus musculus', ontologyId: null },
      { label: 'Caenorhabditis elegans', ontologyId: null },
      { label: 'Rattus norvegicus', ontologyId: null },
    ]);
  });

  it('filters out empty fragments from a malformed CSV', () => {
    // Trailing comma or double-comma — record shape from a quirky
    // upload. Should NOT yield `{ label: '', ontologyId: null }`.
    const ds = withOverrides(BHAR_RECORD, { species: 'Mus, , Rat,' });
    const out = enrichDegradedSummary(degradedSummary(), ds);
    expect(out.species).toEqual([
      { label: 'Mus', ontologyId: null },
      { label: 'Rat', ontologyId: null },
    ]);
  });

  it('Reikersdorfer — empty species → null', () => {
    const ds = withOverrides(REIKERSDORFER_RECORD, { species: '' });
    const out = enrichDegradedSummary(degradedSummary(), ds);
    expect(out.species).toBeNull();
  });

  it('preserves degraded species when it already has partial values (does NOT clobber)', () => {
    // Stage-1 partial success: counts timed out but stage 2's
    // species lookup landed on a single resolved term. The fallback
    // must NOT overwrite — the resolved ontologyId is more precise
    // than the comma-split record string.
    const degradedWithSpecies = degradedSummary({
      species: [
        { label: 'Rat', ontologyId: 'NCBITaxon:10116' },
      ],
    });
    const out = enrichDegradedSummary(degradedWithSpecies, BHAR_RECORD);
    expect(out.species).toEqual([
      { label: 'Rat', ontologyId: 'NCBITaxon:10116' },
    ]);
  });
});

// ─── enrichDegradedSummary — date range + size ─────────────────────

describe('enrichDegradedSummary — dateRange + totalSizeBytes', () => {
  it('Francesconi — splices createdAt + updatedAt into earliest / latest', () => {
    const out = enrichDegradedSummary(degradedSummary(), FRANCESCONI_RECORD);
    expect(out.dateRange.earliest).toBe('2025-04-09T00:00:00Z');
    expect(out.dateRange.latest).toBe('2025-09-27T00:00:00Z');
  });

  it('preserves degraded earliest / latest when already populated', () => {
    // Stage-1 partial success: dateRange was extracted, only counts
    // timed out. The splice should NOT overwrite real dates with the
    // record's createdAt.
    const degradedWithDates = degradedSummary({
      dateRange: {
        earliest: '2025-01-01T00:00:00Z',
        latest: '2025-01-31T00:00:00Z',
      },
    });
    const out = enrichDegradedSummary(degradedWithDates, FRANCESCONI_RECORD);
    expect(out.dateRange.earliest).toBe('2025-01-01T00:00:00Z');
    expect(out.dateRange.latest).toBe('2025-01-31T00:00:00Z');
  });

  it('Bhar — totalSize from the record', () => {
    const out = enrichDegradedSummary(degradedSummary(), BHAR_RECORD);
    expect(out.totalSizeBytes).toBe(1099511627776);
  });

  it('preserves degraded totalSizeBytes when already populated (does NOT clobber)', () => {
    const out = enrichDegradedSummary(
      degradedSummary({ totalSizeBytes: 12345 }),
      BHAR_RECORD,
    );
    expect(out.totalSizeBytes).toBe(12345);
  });
});

// ─── enrichDegradedSummary — citation re-derivation ───────────────

describe('enrichDegradedSummary — citation re-derivation', () => {
  it('Bhar — derives full citation from the record when degraded.citation is empty', () => {
    const out = enrichDegradedSummary(degradedSummary(), BHAR_RECORD);
    expect(out.citation.title).toBe(BHAR_RECORD.name);
    expect(out.citation.license).toBe('CC-BY-4.0');
    expect(out.citation.datasetDoi).toBe('10.63884/ndic.2026.0oxgzbjb');
    // Paper DOI from the associated publication
    expect(out.citation.paperDois).toEqual(['10.1016/j.celrep.2025.115768']);
    // Contributors trimmed + ORCID preserved
    expect(out.citation.contributors).toHaveLength(3);
    expect(out.citation.contributors[0]!.lastName).toBe('Bhar');
    expect(out.citation.contributors[0]!.orcid).toBe(
      'https://orcid.org/0000-0001-1234-5678',
    );
    // Year derived from createdAt (2026 record, paper might be older)
    expect(out.citation.year).toBe(2026);
  });

  it('Reikersdorfer — no license, no DOI, no publications → all null/empty', () => {
    const out = enrichDegradedSummary(degradedSummary(), REIKERSDORFER_RECORD);
    expect(out.citation.title).toBe(REIKERSDORFER_RECORD.name);
    expect(out.citation.license).toBeNull();
    expect(out.citation.datasetDoi).toBeNull();
    expect(out.citation.paperDois).toEqual([]);
    expect(out.citation.contributors).toHaveLength(3);
  });

  it('preserves an already-populated synthesizer citation (does NOT clobber)', () => {
    // Stage-1 partial success: dataset metadata fetch succeeded
    // (citation populated) but counts timed out. The fallback path
    // should preserve the citation since the synthesizer's value is
    // canonical when present.
    const populated = degradedSummary({
      citation: {
        title: 'Synthesizer title',
        license: 'CC0-1.0',
        datasetDoi: '10.63884/already.set',
        paperDois: ['10.1234/preserved'],
        contributors: [
          { firstName: 'Pre', lastName: 'Existing', orcid: null },
        ],
        year: 2020,
      },
    });
    const out = enrichDegradedSummary(populated, BHAR_RECORD);
    expect(out.citation.title).toBe('Synthesizer title');
    expect(out.citation.license).toBe('CC0-1.0');
    expect(out.citation.datasetDoi).toBe('10.63884/already.set');
    expect(out.citation.contributors[0]!.firstName).toBe('Pre');
  });

  it('skips contributors with neither first nor last name (ghost record guard)', () => {
    // Cloud occasionally ships a contributor entry with only a
    // `contact` field (no name). Including them in the citation
    // would corrupt the author list — they should be dropped.
    const ds = withOverrides(BHAR_RECORD, {
      contributors: [
        { firstName: '', lastName: '', contact: 'ghost@example.org' },
        { firstName: 'Real', lastName: 'Person' },
      ],
    });
    const out = enrichDegradedSummary(degradedSummary(), ds);
    expect(out.citation.contributors).toHaveLength(1);
    expect(out.citation.contributors[0]!.lastName).toBe('Person');
  });
});

// ─── recordPublicationYear edge cases ──────────────────────────────

describe('enrichDegradedSummary — publication year derivation', () => {
  it('parses a valid 4-digit year from createdAt', () => {
    const out = enrichDegradedSummary(degradedSummary(), BHAR_RECORD);
    expect(out.citation.year).toBe(2026);
  });

  it('returns null for createdAt that does not start with a 4-digit year', () => {
    const ds = withOverrides(BHAR_RECORD, { createdAt: 'not-a-date' });
    const out = enrichDegradedSummary(degradedSummary(), ds);
    expect(out.citation.year).toBeNull();
  });

  it('returns null for missing createdAt', () => {
    const ds = withOverrides(BHAR_RECORD, { createdAt: undefined });
    const out = enrichDegradedSummary(degradedSummary(), ds);
    expect(out.citation.year).toBeNull();
  });

  it('returns null for an out-of-range year (1850)', () => {
    const ds = withOverrides(BHAR_RECORD, {
      createdAt: '1850-01-01T00:00:00Z',
    });
    const out = enrichDegradedSummary(degradedSummary(), ds);
    expect(out.citation.year).toBeNull();
  });

  it('returns null for an out-of-range year (2200)', () => {
    const ds = withOverrides(BHAR_RECORD, {
      createdAt: '2200-01-01T00:00:00Z',
    });
    const out = enrichDegradedSummary(degradedSummary(), ds);
    expect(out.citation.year).toBeNull();
  });
});

// ─── invariants ────────────────────────────────────────────────────

describe('enrichDegradedSummary — invariants', () => {
  it('preserves the original computedAt timestamp (NOT now)', () => {
    // The footer's "Last computed X ago" reflects when the
    // synthesizer ran — the splice doesn't refresh that timestamp.
    const out = enrichDegradedSummary(degradedSummary(), BHAR_RECORD);
    expect(out.computedAt).toBe('2026-04-15T10:00:00Z');
  });

  it('preserves extractionWarnings (operators still need to see the timeout)', () => {
    const out = enrichDegradedSummary(degradedSummary(), BHAR_RECORD);
    expect(out.extractionWarnings).toEqual([
      'document_class_counts timed out after 20s',
    ]);
  });

  it('preserves the schemaVersion contract marker', () => {
    const out = enrichDegradedSummary(degradedSummary(), BHAR_RECORD);
    expect(out.schemaVersion).toBe('summary:v1');
  });

  it('does not mutate the input degraded summary', () => {
    const input = degradedSummary();
    const inputSnap = JSON.parse(JSON.stringify(input));
    enrichDegradedSummary(input, BHAR_RECORD);
    expect(input).toEqual(inputSnap);
  });

  it('does not mutate the input DatasetRecord', () => {
    const record = { ...BHAR_RECORD };
    const recordSnap = JSON.parse(JSON.stringify(record));
    enrichDegradedSummary(degradedSummary(), record);
    expect(record).toEqual(recordSnap);
  });
});
