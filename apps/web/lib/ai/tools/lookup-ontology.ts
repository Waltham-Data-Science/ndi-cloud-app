/**
 * `lookup_ontology` — resolve an ontology CURIE (e.g. "CL:0000540") to
 * its name + definition + synonyms.
 *
 * Wraps ndb-v2's `GET /api/ontology/lookup?term=<curie>`, which itself
 * chains public providers (UBERON / NCBITaxon / CL via OLS4 / EBI) and
 * falls back to NDI-python's `ndi.ontology.lookup` for lab-specific
 * terms (WBStrain, NDIC, Cre lines) that public providers don't cover.
 *
 * Why a chat tool: the LLM often encounters bare CURIEs in
 * tabular_query / query_documents output (e.g. an ontologyTableRow
 * row has `subject_species: NCBITaxon:10116`) and can't usefully tell
 * the user what those mean without a lookup. This tool turns
 * "NCBITaxon:10116" into "Rattus norvegicus (Norwegian rat)" with one
 * call.
 */
import { z } from 'zod';

import { type Reference } from '../references';
import { baseUrl, fetchJson, isErrorResult, type ToolResult } from './shared';

// Upstream provider URLs for the common CURIE prefixes. The chat-UI's
// CitationChip opens these in a new tab — clicking a UBERON term takes
// you to the EBI OLS page, etc. NDI-specific prefixes (WBStrain, NDIC)
// have no public web page, so they get a "#" sentinel that still renders
// the chip + hover snippet but doesn't navigate (matches the "ontology
// lookup result" semantic — there's no shared canonical page yet).
const ONTOLOGY_PROVIDER_URLS: Record<string, (localId: string) => string> = {
  UBERON: (id) => `https://www.ebi.ac.uk/ols/ontologies/uberon/terms?iri=http://purl.obolibrary.org/obo/UBERON_${id}`,
  CL: (id) => `https://www.ebi.ac.uk/ols/ontologies/cl/terms?iri=http://purl.obolibrary.org/obo/CL_${id}`,
  NCBITaxon: (id) => `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${id}`,
  GO: (id) => `https://www.ebi.ac.uk/ols/ontologies/go/terms?iri=http://purl.obolibrary.org/obo/GO_${id}`,
  CHEBI: (id) => `https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:${id}`,
};

function ontologyTermUrl(term: string): string {
  const idx = term.indexOf(':');
  if (idx <= 0) return '#';
  const prefix = term.slice(0, idx);
  const localId = term.slice(idx + 1);
  const builder = ONTOLOGY_PROVIDER_URLS[prefix];
  return builder ? builder(localId) : '#';
}

export const lookupOntologyInput = z.object({
  /**
   * CURIE in the form `PREFIX:LOCAL_ID`. Examples:
   *   - "UBERON:0001870"       — frontal cortex
   *   - "NCBITaxon:10090"      — Mus musculus
   *   - "CL:0000540"           — neuron
   *   - "WBStrain:00000001"    — N2 wild-type (NDI-python-only)
   *   - "NDIC:0000123"         — NDI-specific identifier
   */
  term: z
    .string()
    .min(3, 'term must be a CURIE like "UBERON:0001870"')
    .max(128)
    .refine((v) => v.includes(':'), {
      message: 'term must be a CURIE (e.g. "UBERON:0001870" — prefix + local ID separated by ":")',
    }),
});

export type LookupOntologyInput = z.infer<typeof lookupOntologyInput>;

/**
 * Backend response shape — matches `OntologyTerm.to_dict()` in
 * ndb-v2's `backend/services/ontology_cache.py`. PRE-FIX an earlier
 * draft of this file used the wrong field names (`id`, `name`,
 * `short_name`, `prefix`, `synonyms`, `source`, `found`) that the
 * backend NEVER emits — meaning every chat `lookup_ontology` call
 * silently reported `found: false` to the LLM, even for terms that
 * resolved cleanly. The ontology-sweep audit caught the mismatch.
 */
interface BackendOntologyResult {
  provider?: string;
  termId?: string;
  label?: string | null;
  definition?: string | null;
  url?: string | null;
}

export interface LookupOntologyToolResult {
  term: string;
  found: boolean;
  name: string | null;
  definition: string | null;
  prefix: string | null;
  /** URL provided by the backend resolver (provider page, OLS, etc.). */
  source_url: string | null;
  references: Reference[];
}

export async function lookupOntologyHandler(
  input: LookupOntologyInput,
): Promise<ToolResult<LookupOntologyToolResult>> {
  const parsed = lookupOntologyInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const term = parsed.data.term;
  const url = `${base}/api/ontology/lookup?term=${encodeURIComponent(term)}`;
  const res = await fetchJson<BackendOntologyResult>(url);
  if (isErrorResult(res)) return res;

  // The OntologyService returns OntologyTerm.to_dict():
  //   { provider, termId, label, definition, url }
  // `label` is null on miss; truthy on hit.
  const label = typeof res.label === 'string' && res.label.length > 0
    ? res.label
    : null;
  const definition = typeof res.definition === 'string' && res.definition.length > 0
    ? res.definition
    : null;
  const found = label !== null || definition !== null;
  // Prefer the backend's URL (NCBI Taxonomy page, OLS PURL, etc.)
  // for the citation chip; fall back to our own provider-routing
  // helper otherwise. NDI-specific prefixes (WBStrain, NDIC) usually
  // have no public landing page — `ontologyTermUrl` returns `#` for
  // those, which renders the chip without navigation but preserves
  // the hover preview.
  const chipUrl = typeof res.url === 'string' && res.url.length > 0
    ? res.url
    : ontologyTermUrl(term);
  const references: Reference[] = found
    ? [
        {
          doc_id: term,
          url: chipUrl,
          class: 'ontology',
          title: label ? `${label} (${term})` : term,
          snippet: definition
            ? definition.slice(0, 140)
            : `Ontology term (${res.provider ?? term.split(':')[0]})`,
        },
      ]
    : [];

  return {
    term,
    found,
    name: label,
    definition,
    prefix: res.provider ?? term.split(':')[0] ?? null,
    source_url: typeof res.url === 'string' && res.url.length > 0 ? res.url : null,
    references,
  };
}
