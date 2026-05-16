/**
 * StarterViewsSection — auto-selection algorithm + render coverage.
 *
 * Phase B of the workspace redesign. The selection algorithm
 * (`selectStarterViews`) is a pure function that takes class counts +
 * subject/epoch totals and returns up to three starter view
 * candidates. The priority order encoded in the algorithm is the
 * scientific shape we want to surface first when a user lands on a
 * fresh dataset:
 *
 *   1. Behavioral compare (cohort + ontologyTableRow)
 *   2. Treatment timeline (treatment | treatment_drug)
 *   3. Signal trace (any epochs)
 *   4. PSTH (spikes + stimulus)
 *   5. Spike raster (spikes only)
 *   6. Browse subjects (fallback)
 *
 * Tests exercise each branch + the cap at three.
 */
import { describe, expect, it } from 'vitest';

import { selectStarterViews } from '@/components/workspace/StarterViewsSection';

describe('selectStarterViews', () => {
  it('returns the empty array for a dataset with no rows of anything', () => {
    expect(
      selectStarterViews({
        classCounts: {},
        subjects: 0,
        epochs: 0,
      }),
    ).toEqual([]);
  });

  it('picks behavioral-compare when ontologyTableRow + cohort are present', () => {
    const picks = selectStarterViews({
      classCounts: { ontologyTableRow: 45 },
      subjects: 215,
      epochs: 0,
    });
    expect(picks.length).toBeGreaterThan(0);
    expect(picks[0]!.slug).toBe('behavioral-compare');
    expect(picks[0]!.hintCount).toContain('45');
    expect(picks[0]!.viewType).toBe('violin');
  });

  it('skips behavioral-compare when subjects < 2 (no group to compare against)', () => {
    const picks = selectStarterViews({
      classCounts: { ontologyTableRow: 45 },
      subjects: 1,
      epochs: 0,
    });
    expect(picks.some((p) => p.slug === 'behavioral-compare')).toBe(false);
  });

  it('picks treatment-timeline when treatment_drug is present', () => {
    const picks = selectStarterViews({
      classCounts: { treatment_drug: 24466 },
      subjects: 5314,
      epochs: 0,
    });
    expect(picks.some((p) => p.slug === 'treatment-timeline')).toBe(true);
  });

  it('picks treatment-timeline when plain treatment is present', () => {
    const picks = selectStarterViews({
      classCounts: { treatment: 11 },
      subjects: 5,
      epochs: 0,
    });
    expect(picks.some((p) => p.slug === 'treatment-timeline')).toBe(true);
  });

  it('picks signal-viewer when epochs > 0 and the higher-priority picks are absent', () => {
    const picks = selectStarterViews({
      classCounts: {},
      subjects: 76,
      epochs: 4887,
    });
    expect(picks.some((p) => p.slug === 'signal-viewer')).toBe(true);
  });

  it('picks PSTH when vmspikesummary + stimulus_presentation are both present', () => {
    const picks = selectStarterViews({
      classCounts: {
        vmspikesummary: 50,
        stimulus_presentation: 120,
      },
      subjects: 1,
      epochs: 0,
    });
    expect(picks.some((p) => p.slug === 'psth')).toBe(true);
    expect(picks.some((p) => p.slug === 'spike-activity')).toBe(false);
  });

  it('falls back to spike-activity when spikes exist but no stimulus is present', () => {
    const picks = selectStarterViews({
      classCounts: { vmspikesummary: 50 },
      subjects: 1,
      epochs: 0,
    });
    expect(picks.some((p) => p.slug === 'spike-activity')).toBe(true);
    expect(picks.some((p) => p.slug === 'psth')).toBe(false);
  });

  it('falls back to browse-subjects when nothing else matches but subjects exist', () => {
    const picks = selectStarterViews({
      classCounts: {},
      subjects: 5314,
      epochs: 0,
    });
    expect(picks).toHaveLength(1);
    expect(picks[0]!.slug).toBe('browse-subjects');
  });

  it('caps at exactly three picks', () => {
    // Bhar-style class counts: every condition matches, ensuring the
    // algorithm has to drop candidates after the first three.
    const picks = selectStarterViews({
      classCounts: {
        ontologyTableRow: 5297,
        treatment_drug: 24466,
        vmspikesummary: 200,
        stimulus_presentation: 500,
      },
      subjects: 5314,
      epochs: 4887,
    });
    expect(picks).toHaveLength(3);
    // The first three by priority should be behavioral-compare,
    // treatment-timeline, signal-viewer (in that order).
    expect(picks.map((p) => p.slug)).toEqual([
      'behavioral-compare',
      'treatment-timeline',
      'signal-viewer',
    ]);
  });

  it('orders by priority, not by class count magnitude', () => {
    // Behavioral compare wins even when other matches have much
    // bigger row counts.
    const picks = selectStarterViews({
      classCounts: {
        ontologyTableRow: 10,
        treatment_drug: 99999,
        vmspikesummary: 99999,
      },
      subjects: 100,
      epochs: 99999,
    });
    expect(picks[0]!.slug).toBe('behavioral-compare');
  });
});
