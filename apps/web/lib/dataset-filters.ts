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

export type SortMode = 'relevance' | 'newest' | 'oldest' | 'name';

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
  if (c.q.trim()) {
    const needle = c.q.toLowerCase();
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
    if (!hay.includes(needle)) return false;
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
    if (!d.license || !c.license.includes(d.license)) return false;
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
  const seen = new Set<string>();
  for (const d of datasets) {
    if (d.license) seen.add(d.license);
  }
  const all = Array.from(seen);
  const preferred = ['CC-BY-4.0', 'CC0-1.0', 'CC0'].filter((l) =>
    all.includes(l),
  );
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
