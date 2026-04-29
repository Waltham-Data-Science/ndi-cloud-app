/**
 * `toDoiUrl` — exhaustive coverage for the inputs the cloud actually
 * ships. Round-2 team review flagged that bare DOIs from
 * `associatedPublications[].DOI` were producing
 * `https://ndi-cloud.com/10.1016/...` links because they fell back to
 * `safeHref`'s relative-resolution branch. This file pins the
 * normalization contract so a future regression surfaces here, not in
 * production.
 */
import { describe, expect, it } from 'vitest';

import { toDoiUrl } from '@/lib/doi-url';

describe('toDoiUrl', () => {
  it('wraps a bare DOI in https://doi.org/', () => {
    expect(toDoiUrl('10.1016/j.celrep.2025.115768')).toBe(
      'https://doi.org/10.1016/j.celrep.2025.115768',
    );
  });

  it('wraps an NDI Cloud Crossref DOI', () => {
    expect(toDoiUrl('10.63884/ndic.2025.jyxfer8m')).toBe(
      'https://doi.org/10.63884/ndic.2025.jyxfer8m',
    );
  });

  it('strips a leading doi: prefix before wrapping', () => {
    expect(toDoiUrl('doi:10.1016/j.celrep.2025.115768')).toBe(
      'https://doi.org/10.1016/j.celrep.2025.115768',
    );
    expect(toDoiUrl('DOI: 10.1016/j.celrep.2025.115768')).toBe(
      'https://doi.org/10.1016/j.celrep.2025.115768',
    );
  });

  it('passes through a fully-qualified https://doi.org URL unchanged', () => {
    expect(toDoiUrl('https://doi.org/10.7554/eLife.103191.4')).toBe(
      'https://doi.org/10.7554/eLife.103191.4',
    );
  });

  it('upgrades http://dx.doi.org to canonical https://doi.org', () => {
    expect(toDoiUrl('http://dx.doi.org/10.7554/eLife.103191.4')).toBe(
      'https://doi.org/10.7554/eLife.103191.4',
    );
  });

  it('does not turn a non-DOI URL into a doi.org URL', () => {
    expect(toDoiUrl('https://example.com/paper')).toBe(
      'https://example.com/paper',
    );
  });

  it('returns undefined for empty / whitespace / null inputs', () => {
    expect(toDoiUrl(undefined)).toBeUndefined();
    expect(toDoiUrl(null)).toBeUndefined();
    expect(toDoiUrl('')).toBeUndefined();
    expect(toDoiUrl('   ')).toBeUndefined();
  });

  it('does not silently treat an attacker-controlled hostname containing doi.org as the resolver', () => {
    // Defensive: the normalizer canonicalizes via hostname check, not
    // a substring match. A url like `https://evil.com/?u=doi.org/...`
    // must NOT be rewritten to `https://doi.org/...`.
    expect(toDoiUrl('https://evil.com/?u=doi.org/10.1/foo')).toBe(
      'https://evil.com/?u=doi.org/10.1/foo',
    );
  });
});
