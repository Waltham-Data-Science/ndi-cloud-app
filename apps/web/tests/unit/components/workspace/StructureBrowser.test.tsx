/**
 * StructureBrowser — sort + filter algorithm coverage.
 *
 * Phase B of the workspace redesign. The component is mostly visual
 * chrome around a pure transformation: `deriveClassList(classCounts,
 * sort, filter)`. Tests exercise the four sort modes + the filter
 * casing + the ties-broken-by-name invariant.
 */
import { describe, expect, it } from 'vitest';

import { deriveClassList } from '@/components/workspace/StructureBrowser';

const SAMPLE = {
  subject: 5314,
  treatment_drug: 24466,
  imageStack: 564,
  ontologyLabel: 584,
  ontologyTableRow: 5297,
  openminds_subject: 28374,
  session: 2,
  session_in_a_dataset: 1,
  subject_group: 235,
  treatment_transfer: 1675,
  generic_file: 20,
};

describe('deriveClassList', () => {
  it('sorts by count descending (default)', () => {
    const items = deriveClassList(SAMPLE, 'count-desc', '');
    expect(items[0]).toEqual({ className: 'openminds_subject', count: 28374 });
    expect(items[1]).toEqual({ className: 'treatment_drug', count: 24466 });
    expect(items[items.length - 1]).toEqual({
      className: 'session_in_a_dataset',
      count: 1,
    });
  });

  it('sorts by count ascending', () => {
    const items = deriveClassList(SAMPLE, 'count-asc', '');
    expect(items[0]).toEqual({ className: 'session_in_a_dataset', count: 1 });
    expect(items[1]).toEqual({ className: 'session', count: 2 });
    expect(items[items.length - 1]).toEqual({
      className: 'openminds_subject',
      count: 28374,
    });
  });

  it('sorts alphabetically (asc)', () => {
    const items = deriveClassList(SAMPLE, 'name-asc', '');
    expect(items[0]!.className).toBe('generic_file');
    expect(items[items.length - 1]!.className).toBe('treatment_transfer');
  });

  it('sorts alphabetically (desc)', () => {
    const items = deriveClassList(SAMPLE, 'name-desc', '');
    expect(items[0]!.className).toBe('treatment_transfer');
    expect(items[items.length - 1]!.className).toBe('generic_file');
  });

  it('filters case-insensitively by substring', () => {
    const items = deriveClassList(SAMPLE, 'count-desc', 'TREATMENT');
    expect(items.map((i) => i.className).sort()).toEqual([
      'treatment_drug',
      'treatment_transfer',
    ]);
  });

  it('returns the empty list when no class names match the filter', () => {
    const items = deriveClassList(SAMPLE, 'count-desc', 'nonexistentXYZ');
    expect(items).toEqual([]);
  });

  it('trims whitespace from the filter', () => {
    const items = deriveClassList(SAMPLE, 'count-desc', '   subject   ');
    expect(items.map((i) => i.className).sort()).toEqual([
      'openminds_subject',
      'subject',
      'subject_group',
    ]);
  });

  it('breaks ties by class name (count-desc)', () => {
    const sample = {
      a_class: 100,
      b_class: 100,
      c_class: 100,
    };
    const items = deriveClassList(sample, 'count-desc', '');
    // Ties broken alphabetically: a_class first.
    expect(items.map((i) => i.className)).toEqual([
      'a_class',
      'b_class',
      'c_class',
    ]);
  });
});
