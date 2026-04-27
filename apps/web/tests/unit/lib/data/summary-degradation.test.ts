/**
 * summary-degradation — pin the warning → degraded-field mapping
 * against the canonical backend vocabulary so a backend copy tweak
 * doesn't silently regress UI degradation indicators.
 *
 * The "canonical" warning strings tested here come straight out of
 * `ndi-data-browser-v2/backend/services/dataset_summary_service.py`
 * and the per-class extractors. If the backend changes wording,
 * either the regex here is robust enough to keep matching (preferred)
 * or this test fails and we update both ends together.
 */
import { describe, expect, it } from 'vitest';

import {
  degradedFieldsFromWarnings,
  hasAnyDegradation,
  humanizeWarning,
} from '@/lib/data/summary-degradation';

describe('degradedFieldsFromWarnings', () => {
  it('returns no degradation for an empty warning list', () => {
    expect(degradedFieldsFromWarnings([])).toEqual({
      counts: false,
      biology: false,
      brainRegions: false,
      probeTypes: false,
      scale: false,
    });
  });

  it('flags counts when class-counts query times out', () => {
    const result = degradedFieldsFromWarnings([
      'class counts query failed: counts fetch exceeded 20s',
    ]);
    expect(result.counts).toBe(true);
    // No other section should be flagged from a counts-only timeout
    // — biology/brainRegions/probeTypes still depend on stage-2 calls
    // that may have succeeded (the backend gates stage-2 off the
    // record-recovered counts envelope).
    expect(result.biology).toBe(false);
    expect(result.brainRegions).toBe(false);
    expect(result.probeTypes).toBe(false);
  });

  it('flags counts AND scale when dataset metadata query fails', () => {
    const result = degradedFieldsFromWarnings([
      'dataset metadata query failed: dataset fetch exceeded 20s',
    ]);
    // Without the record we can't recover counts.subjects /
    // totalDocuments either, so counts gets flagged too.
    expect(result.counts).toBe(true);
    expect(result.scale).toBe(true);
  });

  it('flags biology when openminds_subject query fails', () => {
    const result = degradedFieldsFromWarnings([
      'openminds_subject query failed: TimeoutError',
    ]);
    expect(result.biology).toBe(true);
    expect(result.brainRegions).toBe(false);
    expect(result.probeTypes).toBe(false);
    expect(result.counts).toBe(false);
  });

  it('flags brainRegions when probe_location query fails', () => {
    const result = degradedFieldsFromWarnings([
      'probe_location query failed: TimeoutError',
    ]);
    expect(result.brainRegions).toBe(true);
    expect(result.biology).toBe(false);
  });

  it('flags probeTypes when element query fails', () => {
    const result = degradedFieldsFromWarnings([
      'element query failed: TimeoutError',
    ]);
    expect(result.probeTypes).toBe(true);
  });

  it('does NOT flag biology for a soft "fell back to label-only" warning', () => {
    // The `_extract_*_terms` helpers emit this when ontology IDs
    // are missing for some entries — the data is good, just
    // unresolved. UI should NOT mark biology as degraded.
    const result = degradedFieldsFromWarnings([
      'species extraction: at least one subject reported a Species name without an ontology identifier; fell back to label-only.',
    ]);
    expect(result.biology).toBe(false);
    expect(result.counts).toBe(false);
  });

  it('flags multiple sections when warnings cover several upstreams', () => {
    const result = degradedFieldsFromWarnings([
      'class counts query failed: counts fetch exceeded 20s',
      'openminds_subject query failed: TimeoutError',
      'probe_location query failed: TimeoutError',
    ]);
    expect(result.counts).toBe(true);
    expect(result.biology).toBe(true);
    expect(result.brainRegions).toBe(true);
    // Not flagged: probeTypes, scale.
    expect(result.probeTypes).toBe(false);
    expect(result.scale).toBe(false);
  });

  it('is case-insensitive on the leading prefix', () => {
    // Defensive — backend code today emits lowercase, but a refactor
    // shouldn't break detection by capitalizing the first word.
    const result = degradedFieldsFromWarnings([
      'Class Counts Query Failed: timeout',
    ]);
    expect(result.counts).toBe(true);
  });
});

describe('hasAnyDegradation', () => {
  it('is false when all flags are off', () => {
    expect(
      hasAnyDegradation({
        counts: false,
        biology: false,
        brainRegions: false,
        probeTypes: false,
        scale: false,
      }),
    ).toBe(false);
  });

  it('is true when any flag is on', () => {
    expect(
      hasAnyDegradation({
        counts: false,
        biology: false,
        brainRegions: true,
        probeTypes: false,
        scale: false,
      }),
    ).toBe(true);
  });
});

describe('humanizeWarning', () => {
  it.each([
    [
      'class counts query failed: counts fetch exceeded 20s',
      'Cloud query for class counts timed out — partial counts from dataset record.',
    ],
    [
      'dataset metadata query failed: dataset fetch exceeded 20s',
      'Cloud query for dataset metadata timed out — falling back to defaults.',
    ],
    [
      'openminds_subject query failed: TimeoutError',
      'Cloud query for subject biology timed out — species/strains/sex unavailable.',
    ],
    [
      'probe_location query failed: TimeoutError',
      'Cloud query for probe locations timed out — brain regions unavailable.',
    ],
    [
      'element query failed: TimeoutError',
      'Cloud query for elements timed out — probe types unavailable.',
    ],
  ])('rewrites %s', (raw, expected) => {
    expect(humanizeWarning(raw)).toBe(expected);
  });

  it('rewrites the soft label-only warning into a softer note', () => {
    expect(
      humanizeWarning(
        'species extraction: at least one subject reported a Species name without an ontology identifier; fell back to label-only.',
      ),
    ).toBe('Some entries lack canonical ontology IDs; rendered as label-only.');
  });

  it('passes unknown warnings through unchanged so new failure modes stay visible', () => {
    const novel = 'something brand-new failed: details';
    expect(humanizeWarning(novel)).toBe(novel);
  });
});
