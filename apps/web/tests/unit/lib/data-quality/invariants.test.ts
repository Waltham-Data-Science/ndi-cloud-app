/**
 * Stream 6.7 — Dataset Health invariants test suite.
 *
 * Verifies each canonical invariant fires on the right facts shape and
 * stays silent on healthy datasets. New invariants land here with a
 * matching test before they ship.
 */
import { describe, expect, it } from 'vitest';

import {
  INVARIANTS,
  checkDatasetHealth,
  worstSeverity,
  type DatasetSummaryFacts,
} from '@/lib/data-quality/invariants';

function makeFacts(overrides: Partial<DatasetSummaryFacts> = {}): DatasetSummaryFacts {
  const base: DatasetSummaryFacts = {
    datasetId: 'ds-test',
    datasetName: 'Test dataset',
    species: ['Caenorhabditis elegans'],
    brainRegions: [],
    strains: ['N2'],
    totalDocuments: 100,
    classCounts: { subject: 50, element: 30, element_epoch: 20 },
    derivedCounts: {
      sessions: 1,
      subjects: 50,
      elements: 30,
      epochs: 20,
      probes: 0,
    },
  };
  return { ...base, ...overrides };
}

describe('Dataset health invariants', () => {
  it('healthy dataset produces no violations', () => {
    expect(checkDatasetHealth(makeFacts())).toEqual([]);
  });

  it('flags totalDocuments>0 with subjects=0 as critical', () => {
    const facts = makeFacts({
      derivedCounts: {
        sessions: 0,
        subjects: 0,
        elements: 0,
        epochs: 0,
        probes: 0,
      },
      classCounts: { ontologyTableRow: 100 },
    });
    const violations = checkDatasetHealth(facts);
    const v = violations.find(
      (x) => x.key === 'totalDocuments_implies_subjects',
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('100 documents');
  });

  it('flags elements>0 with sessions=0 as warning', () => {
    const facts = makeFacts({
      derivedCounts: {
        sessions: 0,
        subjects: 1,
        elements: 7,
        epochs: 0,
        probes: 0,
      },
      classCounts: { subject: 1, element: 7 },
      totalDocuments: 8,
    });
    const violations = checkDatasetHealth(facts);
    const v = violations.find((x) => x.key === 'elements_imply_sessions');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    // Matches the Mukherjee anomaly captured by Stream 5.5.
    expect(v?.observation).toMatchObject({ elements: 7, sessions: 0 });
  });

  it('flags empty species when subjects exist as warning', () => {
    const facts = makeFacts({
      species: [],
      derivedCounts: {
        sessions: 1,
        subjects: 215,
        elements: 606,
        epochs: 4887,
        probes: 0,
      },
      classCounts: { subject: 215, element: 606 },
      totalDocuments: 5708,
    });
    const violations = checkDatasetHealth(facts);
    const v = violations.find(
      (x) => x.key === 'species_not_empty_when_subjects_present',
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
  });

  it('does NOT flag empty species when subjects=0', () => {
    const facts = makeFacts({
      species: [],
      derivedCounts: {
        sessions: 0,
        subjects: 0,
        elements: 0,
        epochs: 0,
        probes: 0,
      },
      classCounts: {},
      totalDocuments: 0,
    });
    const violations = checkDatasetHealth(facts);
    expect(
      violations.find(
        (x) => x.key === 'species_not_empty_when_subjects_present',
      ),
    ).toBeUndefined();
  });

  it('flags elements>0 with epochs=0 as info (not warning)', () => {
    // Mirrors Bhar's legitimate state: C. elegans datasets without
    // electrophysiology.
    const facts = makeFacts({
      derivedCounts: {
        sessions: 1,
        subjects: 5314,
        elements: 50,
        epochs: 0,
        probes: 0,
      },
    });
    const violations = checkDatasetHealth(facts);
    const v = violations.find(
      (x) => x.key === 'epochs_positive_when_elements_positive',
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe('info');
  });

  it('flags derived/class-count subject drift as critical', () => {
    const facts = makeFacts({
      derivedCounts: {
        sessions: 1,
        subjects: 100, // derived says 100
        elements: 30,
        epochs: 20,
        probes: 0,
      },
      classCounts: { subject: 50, element: 30, element_epoch: 20 }, // class says 50
    });
    const violations = checkDatasetHealth(facts);
    const v = violations.find(
      (x) => x.key === 'derived_subjects_match_class_count',
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
  });

  it('flags totalDocuments != sum of classCounts as info', () => {
    const facts = makeFacts({
      totalDocuments: 200, // way off from sum=100
    });
    const violations = checkDatasetHealth(facts);
    const v = violations.find(
      (x) => x.key === 'documents_match_class_counts_sum',
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe('info');
  });

  it('allows totalDocuments ±1 tolerance vs classCounts sum', () => {
    const facts = makeFacts({
      totalDocuments: 101, // sum=100, diff=1, OK
    });
    const violations = checkDatasetHealth(facts);
    expect(
      violations.find((x) => x.key === 'documents_match_class_counts_sum'),
    ).toBeUndefined();
  });

  it('worstSeverity returns highest tier across violations', () => {
    const facts = makeFacts({
      derivedCounts: {
        sessions: 0,
        subjects: 0, // critical
        elements: 0,
        epochs: 0,
        probes: 0,
      },
      classCounts: { ontologyTableRow: 100 },
    });
    const violations = checkDatasetHealth(facts);
    expect(worstSeverity(violations)).toBe('critical');
  });

  it('worstSeverity returns null on healthy dataset', () => {
    expect(worstSeverity(checkDatasetHealth(makeFacts()))).toBe(null);
  });

  it('INVARIANTS list is non-empty and stable', () => {
    // Belt-and-suspenders: a refactor that accidentally clears the
    // INVARIANTS array would silently pass every dataset. Pin the
    // current count + that keys are unique.
    expect(INVARIANTS.length).toBeGreaterThanOrEqual(6);
    const keys = INVARIANTS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
