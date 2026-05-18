import { describe, expect, it } from 'vitest';

import {
  HIDDEN_WRAPPER_CLASSES,
  countDisplayClasses,
  filterWrapperClasses,
  isHiddenWrapperClass,
} from '@/lib/data/class-counts';

describe('isHiddenWrapperClass', () => {
  it('returns true for session_in_a_dataset', () => {
    expect(isHiddenWrapperClass('session_in_a_dataset')).toBe(true);
  });

  it('returns false for real content classes', () => {
    expect(isHiddenWrapperClass('session')).toBe(false);
    expect(isHiddenWrapperClass('subject')).toBe(false);
    expect(isHiddenWrapperClass('treatment_drug')).toBe(false);
    expect(isHiddenWrapperClass('openminds_subject')).toBe(false);
  });

  it('returns false for the empty string', () => {
    expect(isHiddenWrapperClass('')).toBe(false);
  });
});

describe('filterWrapperClasses', () => {
  it('removes wrapper classes', () => {
    const input = {
      subject: 5314,
      session: 2,
      session_in_a_dataset: 1,
      treatment_drug: 24466,
    };
    const out = filterWrapperClasses(input);
    expect(out).toEqual({
      subject: 5314,
      session: 2,
      treatment_drug: 24466,
    });
  });

  it('returns a new object (does not mutate input)', () => {
    const input = { subject: 5, session_in_a_dataset: 1 };
    const out = filterWrapperClasses(input);
    expect(out).not.toBe(input);
    // Mutation guard.
    expect(input.session_in_a_dataset).toBe(1);
  });

  it('returns an empty object when input has only wrappers', () => {
    expect(filterWrapperClasses({ session_in_a_dataset: 1 })).toEqual({});
  });

  it('passes through an already-clean record', () => {
    const input = { subject: 5, treatment: 3 };
    expect(filterWrapperClasses(input)).toEqual(input);
  });
});

describe('countDisplayClasses', () => {
  it('counts only user-facing classes (Bhar 12 → 11)', () => {
    // Bhar's actual class set as of 2026-05-19.
    const bhar = {
      generic_file: 20,
      session: 2,
      imageStack: 564,
      openminds_subject: 28374,
      ontologyTableRow: 5297,
      dataset_remote: 1,
      subject: 5314,
      subject_group: 235,
      treatment_drug: 24466,
      ontologyLabel: 584,
      treatment_transfer: 1675,
      session_in_a_dataset: 1, // wrapper — should NOT be counted
    };
    expect(Object.keys(bhar).length).toBe(12);
    expect(countDisplayClasses(bhar)).toBe(11);
  });

  it('returns 0 for an empty record', () => {
    expect(countDisplayClasses({})).toBe(0);
  });

  it('returns 0 when all classes are wrappers', () => {
    expect(countDisplayClasses({ session_in_a_dataset: 1 })).toBe(0);
  });

  it('equals Object.keys length when no wrappers present', () => {
    const cleanCounts = { subject: 5, treatment: 3, element: 9 };
    expect(countDisplayClasses(cleanCounts)).toBe(3);
    expect(countDisplayClasses(cleanCounts)).toBe(Object.keys(cleanCounts).length);
  });
});

describe('HIDDEN_WRAPPER_CLASSES (exhaustiveness guard)', () => {
  it('contains session_in_a_dataset', () => {
    expect(HIDDEN_WRAPPER_CLASSES.has('session_in_a_dataset')).toBe(true);
  });

  it('does NOT silently include `_dataset`-suffixed content classes', () => {
    // Defensive: the set is a deliberate list, NOT a heuristic.
    // If a future class is named `behavior_in_a_dataset`, it would
    // be a CONTENT class until explicitly added here.
    expect(HIDDEN_WRAPPER_CLASSES.has('behavior_in_a_dataset')).toBe(false);
    expect(HIDDEN_WRAPPER_CLASSES.has('dataset_session_info')).toBe(false);
    expect(HIDDEN_WRAPPER_CLASSES.has('dataset_remote')).toBe(false);
  });
});
