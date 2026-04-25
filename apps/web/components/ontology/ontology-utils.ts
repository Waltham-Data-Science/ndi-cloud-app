/**
 * Ontology term utilities.
 *
 * Ported verbatim from `ndi-data-browser-v2/frontend/src/components/ontology/ontology-utils.ts`.
 * Single source of truth for "is this a clickable ontology term" — used
 * by `OntologyPopover` (single-term lookup) and any future batch-prefetch
 * consumer (e.g. `SummaryTableView` when its content port lands).
 *
 * Contract notes (carried from data-browser):
 *   - Lab-prefixed subject identifiers like
 *     `PR811_4144@chalasani-lab.salk.edu` must NOT match — otherwise the
 *     table renders an ontology chip with a guaranteed-404 lookup.
 *   - Bare numeric IDs (Van Hooser's openminds_subject Species
 *     `preferredOntologyIdentifier: "9669"`) get normalized to
 *     `NCBITaxon:9669` so the lookup endpoint sees a `PROVIDER:ID` shape.
 */

const ONTOLOGY_PATTERN = /^[A-Z]+[a-z]*:?\d{4,}$/;
const BARE_NUMERIC_ID = /^\d{3,}$/;
const PREFIXED_TERM = /^[A-Za-z][A-Za-z_]*:[A-Za-z0-9_.:-]+$/;

/** Returns true if `value` looks like an ontology term ID. */
export function isOntologyTerm(value: unknown): value is string {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (BARE_NUMERIC_ID.test(trimmed)) return true;
  if (PREFIXED_TERM.test(trimmed)) return true;
  return ONTOLOGY_PATTERN.test(trimmed);
}

/**
 * Normalize a term ID to `PROVIDER:ID` form. Returns null if the value
 * doesn't look like any known shape.
 */
export function normalizeOntologyTerm(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes(':')) return trimmed;
  // Bare numeric ID — default to NCBITaxon. Matches Van Hooser's
  // openminds_subject Species docs which emit `"9669"` without prefix.
  if (/^\d+$/.test(trimmed)) return `NCBITaxon:${trimmed}`;
  return null;
}

/** Extract the provider prefix from a term, or null. */
export function providerFromTerm(value: string): string | null {
  const normalized = normalizeOntologyTerm(value);
  if (!normalized) return null;
  const idx = normalized.indexOf(':');
  return idx > 0 ? normalized.slice(0, idx) : null;
}
