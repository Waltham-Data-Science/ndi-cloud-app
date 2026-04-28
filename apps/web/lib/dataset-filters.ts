/**
 * Catalog filter helpers — Phase 6.6 REBUILD-5.
 *
 * Pure functions that drive `/datasets` filtering, sorting, and the
 * applied-filter chip row. Ported from the inline closures in
 * `ndi-data-browser-v2/frontend/src/pages/DatasetsPage.tsx:593-675`
 * and lifted out so we can unit-test them directly (the source kept
 * them as private closures).
 *
 * Anonymous-public guarantee preserved: every helper is a pure
 * function over `DatasetRecord`. No URL reads, no per-user state, no
 * API calls. The catalog client islands (`datasets-client.tsx`) own
 * the URL ↔ filter-state translation; these helpers only consume the
 * already-parsed filter struct.
 */
import type { DatasetRecord } from '@/lib/api/datasets';
import { normalizeLicense } from '@/lib/license-normalize';

export type SortMode = 'relevance' | 'newest' | 'oldest' | 'name';

/**
 * Branch-name values that mean "this is the dataset's default/canonical
 * branch and shouldn't render as a distinct version badge." The cloud
 * has used at least three forms over time:
 *
 *   - `'main'` — current convention (some catalog cards filter this out)
 *   - `'original'` — earlier convention (other surfaces filter this out)
 *   - `'original submission'` — alternate label seen in the wild
 *
 * Pre-fix, `DatasetCard` filtered `'original'` only and `DatasetOverviewCard`
 * filtered `'main'` only — so whichever default value a given dataset
 * carried, it leaked through as a noisy badge on at least one surface.
 * Reviewer flagged "What does 'main' / 'original submission' signify?"
 *
 * This set is the single source of truth: surfaces using
 * `isDefaultBranch(name)` will skip the badge for every default value.
 */
export const DEFAULT_BRANCH_NAMES: ReadonlySet<string> = new Set([
  'main',
  'original',
  'original submission',
]);

/**
 * `true` when the branch name is missing or matches one of the default
 * values. Surfaces should hide the branch badge in this case (the
 * dataset is on its canonical line; no need to call out a non-event).
 */
export function isDefaultBranch(name: string | null | undefined): boolean {
  if (!name) return true;
  return DEFAULT_BRANCH_NAMES.has(name.trim().toLowerCase());
}

export interface MatchCriteria {
  q: string;
  species: string[];
  regions: string[];
  license: string[];
}

/** Parse a comma-separated URL param into a clean string array.
 * Empty / null input returns `[]`. Trims and drops falsy entries — so
 * `"foo,,bar,"` collapses to `["foo", "bar"]` (matches source behavior).
 */
export function parseCsv(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Returns true when `d` passes every active filter criterion. An active
 * criterion is one that has at least one value; `q: ''` and empty arrays
 * are no-ops (the check trivially passes).
 */
export function matchesFilters(d: DatasetRecord, c: MatchCriteria): boolean {
  // Text search across user-visible strings — same hay set as source.
  //
  // 2026-04-28 — token-AND match (team review feedback). Pre-fix this
  // was a single contiguous-substring check (`hay.includes(needle)`),
  // which meant `"C elegans"` (with a space) didn't match a dataset
  // whose species reads `"Caenorhabditis elegans"` — `"c elegans"`
  // isn't a substring of `"caenorhabditis elegans"` because the only
  // `c` precedes `aenorhabditis`, not a space. Same failure mode for
  // any abbreviated genus + species (`M musculus` vs `Mus musculus`).
  //
  // New behaviour: split the needle on whitespace, strip surrounding
  // punctuation per token (so `C.` and `C` both match `caenorhabditis`),
  // and require ALL tokens to appear somewhere in the hay. The user's
  // mental model — "find rows that have both 'c' AND 'elegans' in
  // their text" — is what the contiguous-substring match was failing
  // to deliver. AND-of-tokens matches that intent.
  //
  // Single-character tokens are kept (a user typing `C elegans` does
  // mean to match against the `c` in `caenorhabditis`); the AND with
  // `elegans` keeps the result set narrow enough to not produce
  // false-positive noise.
  if (c.q.trim()) {
    const tokens = c.q
      .toLowerCase()
      // Strip leading/trailing punctuation per token (matches `C.` →
      // `c`, `(elegans)` → `elegans`). Keep internal punctuation in
      // case a user types e.g. an ORCID or a DOI fragment.
      .split(/\s+/)
      .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      .filter(Boolean);
    if (tokens.length) {
      const hay = [
        d.name,
        d.abstract,
        d.description,
        d.doi,
        d.pubMedId,
        d.species,
        d.brainRegions,
        ...(d.contributors?.map(
          (x) => `${x.firstName ?? ''} ${x.lastName ?? ''}`,
        ) ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
  }
  // Facet checkboxes — match against the record's comma-separated raw
  // fields OR the synthesizer-backed summary pills (whichever is
  // populated). At least one value in the active set must appear.
  if (c.species.length) {
    if (!anyMatch(c.species, datasetSpeciesValues(d))) return false;
  }
  if (c.regions.length) {
    if (!anyMatch(c.regions, datasetRegionValues(d))) return false;
  }
  if (c.license.length) {
    // Normalize before comparing so that picking `CC-BY-4.0` from the
    // facet sidebar matches datasets stored as `CC-BY 4.0`,
    // `Creative Commons Attribution 4.0`, etc. Without normalization
    // the variant rows would be excluded even though the user
    // intended to filter them in.
    const dLicenseNorm = normalizeLicense(d.license);
    if (!dLicenseNorm || !c.license.includes(dLicenseNorm)) return false;
  }
  return true;
}

/** Stable comparator factory keyed by `SortMode`. `relevance` is the
 * stable no-op (source/upstream order is preserved). */
export function compareBy(
  sort: SortMode,
): (a: DatasetRecord, b: DatasetRecord) => number {
  return (a, b) => {
    switch (sort) {
      case 'newest':
        return dateOf(b) - dateOf(a);
      case 'oldest':
        return dateOf(a) - dateOf(b);
      case 'name':
        return (a.name ?? '').localeCompare(b.name ?? '');
      case 'relevance':
      default:
        return 0;
    }
  };
}

/**
 * Available license tags derived from the current page's datasets — keeps
 * the sidebar list in sync with what's actually visible. The
 * neuro-friendly `CC-BY-4.0` / `CC0-1.0` / `CC0` floats to the top when
 * present; the rest sort alphabetically. Matches source's inline
 * `licenseOptions` memo (DatasetsPage.tsx:107-118).
 */
export function licenseOptionsFor(datasets: readonly DatasetRecord[]): string[] {
  // Normalize before deduping so CC-BY-4.0 / CC-BY 4.0 / Creative
  // Commons Attribution 4.0 collapse to one chip. Falsy values
  // (`null`, empty string) drop out cleanly. See
  // `lib/license-normalize.ts` for the canonical-form mapping.
  const seen = new Set<string>();
  for (const d of datasets) {
    const norm = normalizeLicense(d.license);
    if (norm) seen.add(norm);
  }
  const all = Array.from(seen);
  // `CC0-1.0` covers both the bare `CC0` and `CC0-1.0` source forms
  // post-normalization, so the legacy `'CC0'` preferred entry is no
  // longer needed.
  const preferred = ['CC-BY-4.0', 'CC0-1.0'].filter((l) => all.includes(l));
  const rest = all.filter((l) => !preferred.includes(l)).sort();
  return [...preferred, ...rest];
}

// ── Internals ────────────────────────────────────────────────────────

/** Combined raw-CSV + summary species values for matching. */
function datasetSpeciesValues(d: DatasetRecord): string[] {
  const raw = (d.species ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const summary = (d.summary?.species ?? []).map((s) => s.label);
  return [...raw, ...summary];
}

/** Combined raw-CSV + summary brain-region values for matching. */
function datasetRegionValues(d: DatasetRecord): string[] {
  const raw = (d.brainRegions ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const summary = (d.summary?.brainRegions ?? []).map((s) => s.label);
  return [...raw, ...summary];
}

/** Case-insensitive contains-match: any needle vs any hay. */
function anyMatch(needles: readonly string[], hay: readonly string[]): boolean {
  const lower = hay.map((h) => h.toLowerCase());
  return needles.some((n) => {
    const needleLower = n.toLowerCase();
    return lower.some(
      (h) => h === needleLower || h.includes(needleLower),
    );
  });
}

/** Best-available date for sort comparisons; 0 when no field is set. */
function dateOf(d: DatasetRecord): number {
  const s = d.uploadedAt || d.updatedAt || d.createdAt;
  return s ? new Date(s).getTime() : 0;
}
