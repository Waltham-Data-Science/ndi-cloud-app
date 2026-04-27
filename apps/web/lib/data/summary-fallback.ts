/**
 * Summary fallback — synthesize a near-full :class:`DatasetSummary` from
 * the raw :class:`DatasetRecord` fields when the backend's
 * ``/api/datasets/:id/summary`` synthesizer returns degraded data.
 *
 * # Why this exists
 *
 * Smoke-test pass after PR #102 (stage-1 backend timeouts) found that
 * for the largest published datasets the synthesizer's
 * ``/document-class-counts`` upstream call STILL exceeds its 20s
 * deadline — even though the dataset metadata fetch succeeds. The
 * cascade is:
 *
 *   stage 1: counts times out → ``counts.* = 0``
 *          → ``subjects_present = False``
 *          → stage 2 short-circuits (no per-class fanout)
 *          → ``species/strains/sexes/brainRegions/probeTypes = null``
 *
 * Net response: a structurally-valid summary with all-zero counts,
 * null per-class facts, and ``extractionWarnings`` documenting the
 * timeout. Strictly better than a 504, but the Summary card on the
 * Overview tab renders zeros + "Not applicable" everywhere — even
 * though the **dataset record itself** carries the basics:
 * ``numberOfSubjects``, ``documentCount``, ``species`` (string),
 * ``brainRegions`` (string), ``totalSize``, ``createdAt``,
 * ``updatedAt``, ``license``, ``doi``, ``contributors``,
 * ``associatedPublications``.
 *
 * The dataset detail hero already reads from these raw fields, so
 * users see "78,687 documents · 1,656 subjects · Caenorhabditis
 * elegans" in the hero band and then "0 documents · 0 subjects · Not
 * applicable" in the sidecar Summary card directly below it. That
 * contradiction is the worst possible UX.
 *
 * # What this module does
 *
 * Detect degraded summaries (zero counts + extraction warnings) and
 * splice in the raw record fields field-by-field. The result is a
 * :class:`DatasetSummary`-shaped object that the existing
 * :class:`DatasetSummaryCard` renders without modification — so the
 * fix is non-invasive at the component layer.
 *
 * Each merged field carries forward the original
 * ``extractionWarnings`` so the UI's "X warnings" tooltip still
 * surfaces the underlying backend timeout for operators.
 *
 * # Splitting logic
 *
 * The raw ``species`` and ``brainRegions`` fields are
 * comma-separated strings — they're the verbatim free-text the
 * cloud's ``IDataset`` document carries pre-synthesizer. We split on
 * comma + trim, build :class:`OntologyTerm` objects with no
 * ``ontologyId`` (we don't have ontology IDs at this layer; they're
 * what the synthesizer normally adds). The Summary card renders
 * unresolved-ontology terms as plain pills — fine as a fallback.
 */

import type {
  DatasetSummary,
  DatasetSummaryCitation,
  DatasetSummaryContributor,
  OntologyTerm,
} from '@/lib/types/dataset-summary';
import type { DatasetRecord } from '@/lib/api/datasets';

/**
 * A summary is "degraded" when the synthesizer ran successfully but
 * the response carries the structural fingerprint of a stage-1
 * timeout: all counts are zero AND at least one extraction warning
 * is present (typically "class counts query failed" or
 * "dataset metadata query failed").
 *
 * Empty datasets ALSO have zero counts but produce no warnings —
 * those are handled by the existing ``[] vs null`` distinction in
 * the renderer and don't need fallback enrichment.
 */
export function isDegraded(s: DatasetSummary): boolean {
  return s.counts.totalDocuments === 0 && s.extractionWarnings.length > 0;
}

/**
 * Splice raw :class:`DatasetRecord` fields into a degraded
 * :class:`DatasetSummary` so the Summary card can render the basics
 * (counts, species, brain regions, scale, citation) even when the
 * backend synthesizer couldn't compute them.
 *
 * Field-by-field rules:
 *
 *   - ``counts.subjects``    ← ``ds.numberOfSubjects`` (clamped ≥ 0)
 *   - ``counts.totalDocuments`` ← ``ds.documentCount`` (clamped ≥ 0)
 *   - ``counts.{sessions, probes, elements, epochs}`` stay 0 — the
 *     dataset record doesn't expose these. The card renders them as
 *     "0" which is honest given we don't know.
 *   - ``species``       ← split ``ds.species`` on comma → unresolved terms
 *   - ``brainRegions``  ← split ``ds.brainRegions`` on comma → unresolved terms
 *   - ``strains/sexes/probeTypes`` stay null — the dataset record
 *     doesn't carry them.
 *   - ``totalSizeBytes`` ← ``ds.totalSize``
 *   - ``dateRange`` ← createdAt/updatedAt from the record
 *   - ``citation`` ← already populated from the dataset metadata
 *     fetch (it succeeds even when counts times out), but the
 *     fallback re-derives from raw fields when summary.citation is
 *     also empty (which happens when BOTH stage-1 calls timed out).
 *   - ``extractionWarnings`` carries through unchanged so the
 *     warnings tooltip still surfaces the underlying backend issue.
 *
 * The `synthesizedAt` value preserves the original ``computedAt``
 * timestamp (NOT now) — so a viewer who reloads sees the same "X
 * minutes ago" footer and isn't misled into thinking the synthesis
 * just succeeded.
 */
export function enrichDegradedSummary(
  degraded: DatasetSummary,
  ds: DatasetRecord,
): DatasetSummary {
  return {
    ...degraded,
    counts: {
      sessions: degraded.counts.sessions,
      subjects:
        ds.numberOfSubjects && ds.numberOfSubjects > 0
          ? ds.numberOfSubjects
          : degraded.counts.subjects,
      probes: degraded.counts.probes,
      elements: degraded.counts.elements,
      epochs: degraded.counts.epochs,
      totalDocuments:
        ds.documentCount && ds.documentCount > 0
          ? ds.documentCount
          : degraded.counts.totalDocuments,
    },
    species: degraded.species ?? speciesTermsFromString(ds.species),
    strains: degraded.strains,
    sexes: degraded.sexes,
    brainRegions:
      degraded.brainRegions ?? brainRegionTermsFromString(ds.brainRegions),
    probeTypes: degraded.probeTypes,
    dateRange: {
      earliest: degraded.dateRange.earliest ?? ds.createdAt ?? null,
      latest: degraded.dateRange.latest ?? ds.updatedAt ?? null,
    },
    totalSizeBytes:
      degraded.totalSizeBytes !== null
        ? degraded.totalSizeBytes
        : ds.totalSize ?? null,
    citation: enrichCitation(degraded.citation, ds),
  };
}

/**
 * Split a comma-separated species string into :class:`OntologyTerm`
 * objects with no ``ontologyId``. The Summary card renders these as
 * plain pills (no resolver hover).
 *
 * Returns ``null`` (not ``[]``) for unset fields so the
 * "Not applicable" branch fires — that matches the `[] vs null`
 * contract elsewhere in the schema.
 */
function speciesTermsFromString(
  raw: string | undefined,
): OntologyTerm[] | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((label) => ({ label, ontologyId: null }));
}

/**
 * Same shape as :func:`speciesTermsFromString` but for the
 * ``brainRegions`` raw field. Kept as a separate function so a future
 * change to either parsing rule can stay co-located with the field
 * it parses.
 */
function brainRegionTermsFromString(
  raw: string | undefined,
): OntologyTerm[] | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((label) => ({ label, ontologyId: null }));
}

/**
 * Re-derive the citation block from the dataset record only when the
 * synthesizer's citation is empty (both stage-1 calls timed out).
 * When stage 1 partially succeeds (only counts timed out), the
 * synthesizer's citation is already populated from
 * ``_citation_from_raw(dataset_raw)`` — preserve that.
 *
 * The "is empty" check uses the title field as the canonical
 * indicator: the synthesizer always sets some title (even an empty
 * string fallback). If title is empty AND the record has a name,
 * the synthesizer didn't see the metadata → use the record.
 */
function enrichCitation(
  citation: DatasetSummaryCitation,
  ds: DatasetRecord,
): DatasetSummaryCitation {
  const synthesizerHasCitation =
    citation.title.length > 0 || citation.contributors.length > 0;
  if (synthesizerHasCitation) return citation;

  return {
    title: ds.name ?? citation.title,
    license: citation.license ?? ds.license ?? null,
    datasetDoi: citation.datasetDoi ?? ds.doi ?? null,
    paperDois: citation.paperDois.length > 0
      ? citation.paperDois
      : recordPaperDois(ds),
    contributors:
      citation.contributors.length > 0
        ? citation.contributors
        : recordContributors(ds),
    year: citation.year ?? recordPublicationYear(ds),
  };
}

function recordPaperDois(ds: DatasetRecord): string[] {
  if (!ds.associatedPublications) return [];
  const out: string[] = [];
  for (const p of ds.associatedPublications) {
    if (p.DOI && p.DOI.length > 0) out.push(p.DOI);
  }
  return out;
}

function recordContributors(ds: DatasetRecord): DatasetSummaryContributor[] {
  if (!ds.contributors) return [];
  const out: DatasetSummaryContributor[] = [];
  for (const c of ds.contributors) {
    const first = (c.firstName ?? '').trim();
    const last = (c.lastName ?? '').trim();
    if (first.length === 0 && last.length === 0) continue;
    out.push({
      firstName: first,
      lastName: last,
      orcid: (c.orcid ?? '').trim() || null,
    });
  }
  return out;
}

function recordPublicationYear(ds: DatasetRecord): number | null {
  // Mirror the backend's _publication_year: createdAt → year. Not
  // the paper publication year (the paper might be older than the
  // dataset upload).
  const candidate = ds.createdAt;
  if (!candidate) return null;
  const m = /^(\d{4})/.exec(candidate);
  if (!m) return null;
  const year = Number.parseInt(m[1]!, 10);
  if (Number.isNaN(year) || year < 1900 || year > 2100) return null;
  return year;
}
