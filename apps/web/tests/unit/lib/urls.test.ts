/**
 * Tests for lib/urls.ts (same-origin link helpers).
 *
 * The behavior is small but the helpers are called from Header/Footer/
 * sidebar/CTAs/JSON-LD search action across the entire site. A regression
 * here ripples everywhere — exhaustive coverage on a 10-line file is
 * cheap insurance.
 */
import { describe, expect, it } from 'vitest';
import { commonsSearchUrl, myWorkspaceUrl } from '@/lib/urls';

describe('commonsSearchUrl', () => {
  it('returns the bare catalog path when called without an argument', () => {
    expect(commonsSearchUrl()).toBe('/datasets');
  });

  it('returns the bare catalog path when called with empty string', () => {
    expect(commonsSearchUrl('')).toBe('/datasets');
  });

  it('returns the bare catalog path when called with undefined explicitly', () => {
    expect(commonsSearchUrl(undefined)).toBe('/datasets');
  });

  it('appends a percent-encoded q= query when given a search term', () => {
    expect(commonsSearchUrl('cortex')).toBe('/datasets?q=cortex');
  });

  it('encodes spaces and special characters in the search term', () => {
    expect(commonsSearchUrl('mouse cortex 2P')).toBe(
      '/datasets?q=mouse%20cortex%202P',
    );
    expect(commonsSearchUrl('a&b=c')).toBe('/datasets?q=a%26b%3Dc');
    expect(commonsSearchUrl('Δ ψ')).toBe('/datasets?q=%CE%94%20%CF%88');
  });
});

describe('myWorkspaceUrl', () => {
  it('returns the workspace root path', () => {
    expect(myWorkspaceUrl()).toBe('/my');
  });

  it('always returns the same path (no env / state dependency)', () => {
    expect(myWorkspaceUrl()).toBe(myWorkspaceUrl());
  });
});
