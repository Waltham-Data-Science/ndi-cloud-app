/**
 * Ontology term ID → external lookup URL mapping.
 *
 * Team review round-2 feedback (2026-04-28): "currently displaying as
 * 00000001 should be displaying as N2 and link to wormbase.org". Strain
 * IDs (and ontology IDs in general) shown in the summary tables were
 * inert text; the user expects to click an `WBStrain:00000001` chip and
 * land on the canonical Wormbase page. This module is the single source
 * of truth for "given a `PROVIDER:ID`, what's the human-facing URL?".
 *
 * Returns `null` for any prefix we don't have a mapped resolver for —
 * caller is responsible for falling back to the popover-only chip
 * (which is what the current behavior is when no link is available).
 *
 * The set of prefixes covers what the cloud actually emits today:
 *
 *   - `WBStrain`   → Wormbase strain page (e.g. C. elegans N2)
 *   - `NCBITaxon`  → NCBI Taxonomy Browser
 *   - `UBERON`     → EBI OLS4 (anatomical structures)
 *   - `PATO`       → EBI OLS4 (phenotypic qualities; biological sex etc.)
 *   - `CHEBI`      → EBI OLS4 (chemicals)
 *   - `NCIT`       → EBI OLS4 (NCI Thesaurus)
 *   - `RRID`       → SciCrunch resolver (research resource IDs)
 *   - `EFO`        → EBI OLS4 (Experimental Factor Ontology)
 *
 * Future prefixes can be added by extending the switch — same shape.
 * The function is pure (no I/O); the caller decides how/where to render.
 */

/**
 * Build an external lookup URL for an ontology term ID.
 *
 * @param termId  A term ID like `"WBStrain:00000001"` or
 *                `"NCBITaxon:6239"`. Must be exactly `PREFIX:SUFFIX` —
 *                empty / malformed inputs return `null`.
 * @returns       Absolute https URL string for the term's canonical
 *                provider page, or `null` when the prefix is unknown
 *                or the input shape is malformed.
 */
export function ontologyUrl(termId: string): string | null {
  if (!termId || typeof termId !== 'string') return null;
  const trimmed = termId.trim();
  if (!trimmed) return null;
  // Single split — multi-colon IDs (e.g. `RRID:RGD_70508`) keep the
  // `:` inside the suffix. We only need the leading prefix; everything
  // after the FIRST `:` is the resolver-side identifier.
  const idx = trimmed.indexOf(':');
  if (idx <= 0 || idx === trimmed.length - 1) return null;
  const prefix = trimmed.slice(0, idx);
  const suffix = trimmed.slice(idx + 1);
  switch (prefix) {
    case 'WBStrain':
      // Wormbase strain pages. The URL slug is `WBStrain` + the suffix
      // joined together (no colon in the URL path), e.g.
      // `WBStrain:00000001` → `.../strain/WBStrain00000001`.
      return `https://wormbase.org/species/c_elegans/strain/WBStrain${suffix}`;
    case 'NCBITaxon':
      // NCBI Taxonomy Browser. The numeric suffix IS the taxon ID
      // (e.g. 6239 = C. elegans, 10090 = Mus musculus).
      return `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${suffix}`;
    case 'UBERON':
      return `https://www.ebi.ac.uk/ols4/ontologies/uberon/classes?obo_id=UBERON%3A${suffix}`;
    case 'PATO':
      return `https://www.ebi.ac.uk/ols4/ontologies/pato/classes?obo_id=PATO%3A${suffix}`;
    case 'CHEBI':
      return `https://www.ebi.ac.uk/ols4/ontologies/chebi/classes?obo_id=CHEBI%3A${suffix}`;
    case 'NCIT':
      return `https://www.ebi.ac.uk/ols4/ontologies/ncit/classes?obo_id=NCIT%3A${suffix}`;
    case 'RRID':
      // SciCrunch resolves the FULL `RRID:...` token.
      return `https://scicrunch.org/resolver/${trimmed}`;
    case 'EFO':
      return `https://www.ebi.ac.uk/ols4/ontologies/efo/classes?obo_id=EFO%3A${suffix}`;
    default:
      return null;
  }
}
