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

import { lookupOntologyHandler } from '@/lib/ndi/tools/lookup-ontology';

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
    // Mock the REAL backend response shape (OntologyTerm.to_dict in
    // ndb-v2): { provider, termId, label, definition, url }. The
    // earlier test used a fictional shape (id, name, short_name,
    // prefix, synonyms, source, found) — that's also what the
    // production tool handler was reading, and it had been silently
    // returning `found: false` for every successful lookup. This is
    // the bug the ontology-sweep audit caught.
    const fetchSpy = mockFetchOnce({
      provider: 'UBERON',
      termId: '0001870',
      label: 'frontal cortex',
      definition: 'A region of the cerebral cortex…',
      url: 'http://purl.obolibrary.org/obo/UBERON_0001870',
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
      prefix: 'UBERON',
    });
    expect(res.references).toHaveLength(1);
    // The backend's `url` field (PURL) is preferred over our own
    // provider-routing helper for the citation chip.
    expect(res.references[0]?.url).toBe(
      'http://purl.obolibrary.org/obo/UBERON_0001870',
    );
    expect(res.references[0]?.title).toMatch(/frontal cortex/);
  });

  it('preserves the backend URL for NCBITaxon (NCBI Taxonomy page)', async () => {
    mockFetchOnce({
      provider: 'NCBITaxon',
      termId: '10116',
      label: 'Rattus norvegicus',
      definition: null,
      url: 'http://purl.obolibrary.org/obo/NCBITaxon_10116',
    });
    const res = await lookupOntologyHandler({ term: 'NCBITaxon:10116' });
    if ('error' in res) throw new Error(res.error);
    expect(res.references[0]?.url).toBe(
      'http://purl.obolibrary.org/obo/NCBITaxon_10116',
    );
    expect(res.source_url).toBe(
      'http://purl.obolibrary.org/obo/NCBITaxon_10116',
    );
  });

  it('falls back to provider-routed URL when backend omits url (NDI-python path)', async () => {
    mockFetchOnce({
      provider: 'NDIC',
      termId: '1',
      label: 'Purpose: Assessing spatial frequency tuning',
      definition: 'States that the purpose of the stimulus is to assess spatial frequency tuning',
      url: null,
    });
    const res = await lookupOntologyHandler({ term: 'NDIC:1' });
    if ('error' in res) throw new Error(res.error);
    expect(res.found).toBe(true);
    expect(res.name).toBe('Purpose: Assessing spatial frequency tuning');
    // No public landing page for NDIC; ontologyTermUrl returns "#".
    expect(res.references[0]?.url).toBe('#');
  });

  it('reports found:false with no references when label is null AND definition is null', async () => {
    mockFetchOnce({
      provider: 'BOGUS',
      termId: '99999',
      label: null,
      definition: null,
      url: null,
    });
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
