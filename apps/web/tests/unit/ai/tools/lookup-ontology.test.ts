/**
 * lookup_ontology — resolves a CURIE via ndb-v2's /api/ontology/lookup
 * (which chains public providers + NDI-python fallback).
 *
 * Tests cover:
 *   - happy path on a recognized CURIE (name + definition + ref URL)
 *   - found:false path (no name → empty references)
 *   - upstream provider URL routing (UBERON, NCBITaxon, etc.)
 *   - NDI-only prefix gets "#" sentinel URL (no public provider page)
 *   - validation (must include a colon)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lookupOntologyHandler } from '@/lib/ai/tools/lookup-ontology';

const TEST_BASE = 'https://api.example.com';

function mockFetchOnce(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('lookup_ontology', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('hits /api/ontology/lookup?term=… and returns name + definition', async () => {
    const fetchSpy = mockFetchOnce({
      id: 'UBERON:0001870',
      name: 'frontal cortex',
      short_name: 'frontal cortex',
      prefix: 'UBERON',
      definition: 'A region of the cerebral cortex…',
      synonyms: ['anterior cortex'],
      source: 'ols4',
    });
    const res = await lookupOntologyHandler({ term: 'UBERON:0001870' });
    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_BASE}/api/ontology/lookup?term=UBERON%3A0001870`,
      expect.any(Object),
    );
    if ('error' in res) throw new Error(res.error);
    expect(res).toMatchObject({
      term: 'UBERON:0001870',
      found: true,
      name: 'frontal cortex',
      definition: 'A region of the cerebral cortex…',
      source: 'ols4',
    });
    expect(res.references).toHaveLength(1);
    expect(res.references[0]?.url).toBe(
      'https://www.ebi.ac.uk/ols/ontologies/uberon/terms?iri=http://purl.obolibrary.org/obo/UBERON_0001870',
    );
    expect(res.references[0]?.title).toMatch(/frontal cortex/);
  });

  it('routes NCBITaxon to the NCBI Taxonomy browser', async () => {
    mockFetchOnce({
      id: 'NCBITaxon:10116',
      name: 'Rattus norvegicus',
      prefix: 'NCBITaxon',
      definition: 'Brown rat',
      synonyms: [],
      source: 'ols4',
    });
    const res = await lookupOntologyHandler({ term: 'NCBITaxon:10116' });
    if ('error' in res) throw new Error(res.error);
    expect(res.references[0]?.url).toBe(
      'https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=10116',
    );
  });

  it('gives a "#" URL for NDI-only prefixes (no public provider page)', async () => {
    mockFetchOnce({
      id: 'WBStrain:00000001',
      name: 'N2 wild-type',
      prefix: 'WBStrain',
      definition: 'The standard C. elegans wild-type laboratory strain.',
      synonyms: ['Bristol N2'],
      source: 'ndi_python',
    });
    const res = await lookupOntologyHandler({ term: 'WBStrain:00000001' });
    if ('error' in res) throw new Error(res.error);
    expect(res.references[0]?.url).toBe('#');
    expect(res.source).toBe('ndi_python');
  });

  it('reports found:false with no references when name is null', async () => {
    mockFetchOnce({ id: null, name: null, prefix: 'BOGUS', synonyms: [] });
    const res = await lookupOntologyHandler({ term: 'BOGUS:99999' });
    if ('error' in res) throw new Error(res.error);
    expect(res.found).toBe(false);
    expect(res.name).toBeNull();
    expect(res.references).toEqual([]);
  });

  it('rejects malformed CURIEs at zod validation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await lookupOntologyHandler({ term: 'no-colon-here' });
    expect(res).toEqual({ error: expect.stringMatching(/CURIE/i) });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
