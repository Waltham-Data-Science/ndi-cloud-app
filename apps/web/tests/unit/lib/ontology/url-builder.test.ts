/**
 * Unit tests for the ontology URL builder. Pin the per-prefix mapping
 * table so a future refactor doesn't silently drop a resolver. Adding
 * a new prefix should mean adding a new row here too.
 *
 * Round-3 strain feedback: the WBStrain case is what kicked this off
 * — clicking `WBStrain:00000001` should land on the canonical Wormbase
 * page for the strain. Test that case verbatim against the team's
 * expected URL.
 */
import { describe, expect, it } from 'vitest';

import { ontologyUrl } from '@/lib/ontology/url-builder';

describe('ontologyUrl', () => {
  it('maps WBStrain to the Wormbase strain page (round-3 strain fix)', () => {
    expect(ontologyUrl('WBStrain:00000001')).toBe(
      'https://wormbase.org/species/c_elegans/strain/WBStrain00000001',
    );
  });

  it('maps NCBITaxon to the NCBI Taxonomy Browser', () => {
    // 6239 = C. elegans, 10090 = Mus musculus
    expect(ontologyUrl('NCBITaxon:6239')).toBe(
      'https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=6239',
    );
    expect(ontologyUrl('NCBITaxon:10090')).toBe(
      'https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=10090',
    );
  });

  it('maps UBERON to EBI OLS4 (anatomy)', () => {
    expect(ontologyUrl('UBERON:0001870')).toBe(
      'https://www.ebi.ac.uk/ols4/ontologies/uberon/classes?obo_id=UBERON%3A0001870',
    );
  });

  it('maps PATO to EBI OLS4 (phenotypic qualities)', () => {
    expect(ontologyUrl('PATO:0000383')).toBe(
      'https://www.ebi.ac.uk/ols4/ontologies/pato/classes?obo_id=PATO%3A0000383',
    );
  });

  it('maps CHEBI to EBI OLS4 (chemicals)', () => {
    expect(ontologyUrl('CHEBI:73328')).toBe(
      'https://www.ebi.ac.uk/ols4/ontologies/chebi/classes?obo_id=CHEBI%3A73328',
    );
  });

  it('maps NCIT to EBI OLS4 (NCI Thesaurus)', () => {
    expect(ontologyUrl('NCIT:C12345')).toBe(
      'https://www.ebi.ac.uk/ols4/ontologies/ncit/classes?obo_id=NCIT%3AC12345',
    );
  });

  it('maps RRID to the SciCrunch resolver (full PROVIDER:ID kept)', () => {
    expect(ontologyUrl('RRID:RGD_70508')).toBe(
      'https://scicrunch.org/resolver/RRID:RGD_70508',
    );
  });

  it('maps EFO to EBI OLS4 (Experimental Factor Ontology)', () => {
    expect(ontologyUrl('EFO:0000400')).toBe(
      'https://www.ebi.ac.uk/ols4/ontologies/efo/classes?obo_id=EFO%3A0000400',
    );
  });

  it('returns null for unknown prefixes (NDI-internal EMPTY: not externally resolvable)', () => {
    expect(ontologyUrl('EMPTY:0000001')).toBeNull();
    expect(ontologyUrl('CL:0000540')).toBeNull(); // CL not in the mapping yet
    expect(ontologyUrl('UNKNOWN:12345')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(ontologyUrl('')).toBeNull();
    expect(ontologyUrl('   ')).toBeNull();
    // No colon
    expect(ontologyUrl('WBStrain00000001')).toBeNull();
    // Trailing colon, no suffix
    expect(ontologyUrl('WBStrain:')).toBeNull();
    // Leading colon, no prefix
    expect(ontologyUrl(':0000001')).toBeNull();
  });

  it('handles non-string input defensively', () => {
    // Cast through `unknown` since the public type is `string`, but JS
    // call sites might pass non-strings via runtime data.
    expect(ontologyUrl(null as unknown as string)).toBeNull();
    expect(ontologyUrl(undefined as unknown as string)).toBeNull();
    expect(ontologyUrl(42 as unknown as string)).toBeNull();
  });

  it('trims whitespace before splitting', () => {
    expect(ontologyUrl('  WBStrain:00000001  ')).toBe(
      'https://wormbase.org/species/c_elegans/strain/WBStrain00000001',
    );
  });
});
