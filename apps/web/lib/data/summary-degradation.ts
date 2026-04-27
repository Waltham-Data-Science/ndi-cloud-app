/**
 * Summary-degradation helpers — derive per-field "this data is
 * unreliable" markers from the backend's `extractionWarnings` list.
 *
 * # Why this exists
 *
 * Audit 2026-04-27 findings #2, #3, #4 share a root cause: the
 * `DatasetSummary` envelope can carry numeric / list values that LOOK
 * trustworthy (e.g. `counts.sessions = 0`, `strains = null`) but
 * actually represent "we tried to compute this and the cloud timed
 * out" — not "this dataset legitimately has zero sessions" or "this
 * dataset doesn't apply to strains."
 *
 * The backend signals the failure through `extractionWarnings` raw
 * strings. The schema's intended `[]` vs `null` distinction breaks
 * down on stage-2 errors because `_result_or_warn` collapses them
 * both into `[]` after appending a warning. So the renderer has to
 * cross-reference warnings with values to disambiguate.
 *
 * This module is a thin parser over the warning vocabulary the
 * backend emits today. The vocabulary is tested against the canonical
 * list from
 * `ndi-data-browser-v2/backend/services/dataset_summary_service.py`
 * — see `summary-degradation.test.ts` for the matrix.
 *
 * # When the backend rev's its warning copy
 *
 * The matchers are substring/prefix tolerant on purpose so a copy
 * tweak ("class counts query failed: counts fetch exceeded 20s" →
 * "class counts query failed: timeout after 20s") doesn't silently
 * lose its detection. Adding a new failure-mode warning DOES require
 * a new matcher here; the test matrix flags an unmatched warning as
 * a regression.
 */
import type { DatasetSummary } from '@/lib/types/dataset-summary';

/**
 * Per-section degradation flags. Each flag means "the cloud upstream
 * for this section's data didn't fully succeed; the rendered values
 * are NOT trustworthy as a final answer." The renderer uses these to
 * swap out misleading representations:
 *
 *   - `counts.{sessions,probes,elements,epochs}` rendering `0` →
 *     render `—` with a degraded marker (the dataset record can't
 *     supply these; they're stuck at 0 because the upstream timed
 *     out, NOT because the dataset has zero of them).
 *   - Per-section ontology lists rendering "Not applicable" or "—"
 *     → render `—` with a degraded marker so users don't read it
 *     as "this dataset doesn't apply" or "this dataset has none."
 *
 * `subjects` and `totalDocuments` are deliberately NOT in this set:
 * the backend's record-fallback path populates them from the
 * `DatasetRecord` (PR #91 / b39c422) and they're trustworthy even
 * when class-counts times out.
 */
export interface DegradedFields {
  /** /document-class-counts timed out — sessions/probes/elements/epochs unreliable. */
  counts: boolean;
  /** openminds_subject ndiquery failed — species/strains/sexes unreliable. */
  biology: boolean;
  /** probe_location ndiquery failed — brainRegions unreliable. */
  brainRegions: boolean;
  /** element ndiquery failed — probeTypes unreliable. */
  probeTypes: boolean;
  /** dataset metadata fetch failed — totalSize/dateRange unreliable. */
  scale: boolean;
}

const EMPTY: DegradedFields = {
  counts: false,
  biology: false,
  brainRegions: false,
  probeTypes: false,
  scale: false,
};

/**
 * Walk the warnings list and flip flags for every section whose
 * upstream failed.
 *
 * Soft warnings — the ones that DON'T compromise the data, only its
 * canonical-ID coverage — are deliberately NOT flagged. Examples:
 *
 *   - `"species extraction: ... fell back to label-only."` → species
 *     ARE present, just without ontology IDs. Don't mark biology
 *     degraded; the pills still mean what they say.
 *   - `"brainRegions extraction: ... included as label-only."` →
 *     same shape.
 *
 * The matcher distinguishes these from hard failures by looking for
 * the `"query failed"` / `"fetch exceeded"` substrings, which only
 * appear on actual upstream errors.
 */
export function degradedFieldsFromWarnings(
  warnings: readonly string[],
): DegradedFields {
  if (warnings.length === 0) return EMPTY;
  const out: DegradedFields = { ...EMPTY };
  for (const w of warnings) {
    const lower = w.toLowerCase();
    // Stage-1 counts timeout: emitted as "class counts query failed:
    // counts fetch exceeded 20s" by the backend service. We match on
    // the leading prefix to be robust to deadline-string changes.
    if (lower.startsWith('class counts query failed')) {
      out.counts = true;
    }
    // Stage-1 dataset metadata timeout: "dataset metadata query
    // failed: dataset fetch exceeded 20s". Falls under "scale" —
    // totalSize/createdAt/updatedAt come from the dataset record,
    // and the record-fallback path can't recover those when the
    // record fetch itself failed. (counts.subjects/totalDocuments
    // also rely on the record fetch, but if that fails we have
    // bigger problems and the stage-1 path raises rather than
    // degrades — the warning here is paired with an empty
    // `dataset_raw = {}`.)
    if (lower.startsWith('dataset metadata query failed')) {
      out.scale = true;
      // Without the dataset record, counts.subjects + totalDocuments
      // can't be record-recovered either, so flag counts as
      // unreliable too.
      out.counts = true;
    }
    // Stage-2 per-class fanout failures — emitted by `_result_or_warn`
    // as "{class} query failed: {err!s}". Each class maps to one
    // section flag.
    if (lower.startsWith('openminds_subject query failed')) {
      out.biology = true;
    }
    if (lower.startsWith('probe_location query failed')) {
      out.brainRegions = true;
    }
    if (lower.startsWith('element query failed')) {
      // The element class drives probeTypes. Note that the
      // `element_epoch` class (a separate counts-only bucket) does
      // NOT degrade probeTypes; we match on the exact prefix.
      out.probeTypes = true;
    }
  }
  return out;
}

/**
 * Convenience: any section flagged.
 */
export function hasAnyDegradation(d: DegradedFields): boolean {
  return d.counts || d.biology || d.brainRegions || d.probeTypes || d.scale;
}

/**
 * Convenience: pull degraded flags directly off a summary envelope.
 */
export function degradedFieldsFromSummary(s: DatasetSummary): DegradedFields {
  return degradedFieldsFromWarnings(s.extractionWarnings);
}

/**
 * Humanize a backend warning string for display in the footer
 * tooltip. The raw strings are operator-grade ("counts fetch exceeded
 * 20s") — fine for triage, alarming for end users.
 *
 * The humanizer is a substring → friendly-copy mapping. Unknown
 * warnings pass through unchanged so we never accidentally hide a
 * new failure mode behind a generic message; operators investigating
 * a regression see the raw text and can find it in the backend code.
 */
export function humanizeWarning(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.startsWith('class counts query failed')) {
    return 'Cloud query for class counts timed out — partial counts from dataset record.';
  }
  if (lower.startsWith('dataset metadata query failed')) {
    return 'Cloud query for dataset metadata timed out — falling back to defaults.';
  }
  if (lower.startsWith('openminds_subject query failed')) {
    return 'Cloud query for subject biology timed out — species/strains/sex unavailable.';
  }
  if (lower.startsWith('probe_location query failed')) {
    return 'Cloud query for probe locations timed out — brain regions unavailable.';
  }
  if (lower.startsWith('element query failed')) {
    return 'Cloud query for elements timed out — probe types unavailable.';
  }
  if (lower.startsWith('treatment query failed')) {
    return 'Cloud query for treatments timed out.';
  }
  if (lower.startsWith('ontology batch lookup failed')) {
    return 'Ontology resolver lookup failed — labels may lack canonical IDs.';
  }
  if (lower.includes('fell back to label-only')) {
    // Soft warning — not really a degraded state, just a coverage
    // note. Reword to match.
    return 'Some entries lack canonical ontology IDs; rendered as label-only.';
  }
  if (lower.includes('included as label-only')) {
    return 'Some entries lack canonical ontology IDs; rendered as label-only.';
  }
  return raw;
}
