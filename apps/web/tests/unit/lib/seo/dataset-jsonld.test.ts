/**
 * Dataset JSON-LD builder — pin the schema.org/Dataset shape that
 * Google Dataset Search ingests.
 *
 * # What we test
 *
 * Each test fixture corresponds to a real-world cloud-record shape:
 *
 *   - **Bhar** — fully-populated record (DOI, contributors, dates,
 *     license, keywords, associated publications). The "happy path"
 *     fixture: every field of the JSON-LD should land.
 *   - **Minimal** — name + abstract only. Tests fall-through behavior:
 *     no DOI → no `identifier`, no contributors → no `creator`, no
 *     license → no `license`. The output must still be valid JSON-LD
 *     (Dataset, name, url, publisher all present).
 *   - **Pre-existing-publication malformed PMCID** — `'12294564'`
 *     without the `PMC` prefix; the builder must force-prefix to match
 *     the link-rendering behavior in `DatasetOverviewCard`.
 *   - **Bare DOI vs full URL** — the cloud emits both; both must
 *     normalize to `https://doi.org/...`.
 *   - **Empty / null fields** — never emit broken structured data
 *     (Google's validator rejects empty Person records, empty arrays,
 *     etc.).
 */
import { describe, expect, it } from 'vitest';

import type { DatasetRecord } from '@/lib/api/datasets';
import { datasetJsonLd } from '@/lib/seo/dataset-jsonld';

const BHAR: DatasetRecord = {
  id: '69bc5ca11d547b1f6d083761',
  name: 'Transfer of long-term associative memory between Caenorhabditis elegans through IL2 neuron dependent extracellular vesicles',
  abstract:
    'Synthetic abstract describing memory transfer in C. elegans via IL2 neurons.',
  isPublished: true,
  doi: '10.63884/ndic.2026.0oxgzbjb',
  license: 'CC-BY-4.0',
  species: 'Caenorhabditis elegans',
  brainRegions: '',
  contributors: [
    {
      firstName: 'Monmita',
      lastName: 'Bhar',
      orcid: 'https://orcid.org/0000-0001-1234-5678',
      contact: 'monmita@example.org',
    },
    { firstName: 'Tanumoy', lastName: 'Nandi' },
  ],
  associatedPublications: [
    {
      title: 'Memory transfer in C. elegans',
      DOI: '10.1016/j.celrep.2025.115768',
      PMID: '40471787',
      PMCID: '12294564', // bare numeric — should force-prefix to PMC
    },
  ],
  uploadedAt: '2026-04-03T00:00:00Z',
  createdAt: '2026-03-20T00:00:00Z',
  updatedAt: '2026-04-15T00:00:00Z',
  totalSize: 1099511627776,
  documentCount: 66533,
};

const MINIMAL: DatasetRecord = {
  id: 'minds1',
  name: 'Minimal dataset',
  isPublished: true,
};

describe('datasetJsonLd', () => {
  it('emits the Dataset @type and canonical URL anchored on the datasetId param', () => {
    const ld = datasetJsonLd(BHAR, '69bc5ca11d547b1f6d083761');
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('Dataset');
    expect(ld.url).toBe(
      'https://ndi-cloud.com/datasets/69bc5ca11d547b1f6d083761/overview',
    );
    expect(ld['@id']).toBe(ld.url);
  });

  it('uses the DOI as both identifier and sameAs', () => {
    const ld = datasetJsonLd(BHAR, '69bc5ca11d547b1f6d083761');
    expect(ld.identifier).toBe('https://doi.org/10.63884/ndic.2026.0oxgzbjb');
    expect(ld.sameAs).toBe('https://doi.org/10.63884/ndic.2026.0oxgzbjb');
  });

  it('normalizes a bare DOI (no scheme) into a full https://doi.org URL', () => {
    const ld = datasetJsonLd(
      { ...BHAR, doi: '10.63884/ndic.2026.example' },
      'd1',
    );
    expect(ld.identifier).toBe('https://doi.org/10.63884/ndic.2026.example');
  });

  it('passes a full https://doi.org URL through unchanged', () => {
    const ld = datasetJsonLd(
      { ...BHAR, doi: 'https://doi.org/10.1234/foo' },
      'd1',
    );
    expect(ld.identifier).toBe('https://doi.org/10.1234/foo');
  });

  it('upgrades http → https on a doi.org URL', () => {
    const ld = datasetJsonLd(
      { ...BHAR, doi: 'http://doi.org/10.1234/foo' },
      'd1',
    );
    expect(ld.identifier).toBe('https://doi.org/10.1234/foo');
  });

  it('omits identifier when DOI is missing or malformed', () => {
    const ld = datasetJsonLd({ ...BHAR, doi: undefined }, 'd1');
    expect(ld.identifier).toBeUndefined();
    expect(ld.sameAs).toBeUndefined();
    const ld2 = datasetJsonLd({ ...BHAR, doi: 'not-a-doi' }, 'd1');
    expect(ld2.identifier).toBeUndefined();
  });

  it('maps CC-BY-4.0 to the canonical CC license URL', () => {
    const ld = datasetJsonLd(BHAR, 'd1');
    expect(ld.license).toBe('https://creativecommons.org/licenses/by/4.0/');
  });

  it('omits license when the field is unrecognised or absent', () => {
    const ld = datasetJsonLd({ ...BHAR, license: 'UNKNOWN-LICENSE' }, 'd1');
    expect(ld.license).toBeUndefined();
    const ld2 = datasetJsonLd({ ...BHAR, license: undefined }, 'd1');
    expect(ld2.license).toBeUndefined();
  });

  it('emits creator entries with ORCID when available', () => {
    const ld = datasetJsonLd(BHAR, 'd1');
    const creators = ld.creator as Array<Record<string, unknown>>;
    expect(creators).toHaveLength(2);
    expect(creators[0]).toMatchObject({
      '@type': 'Person',
      name: 'Monmita Bhar',
      identifier: 'https://orcid.org/0000-0001-1234-5678',
      sameAs: 'https://orcid.org/0000-0001-1234-5678',
      email: 'monmita@example.org',
    });
    expect(creators[1]).toMatchObject({
      '@type': 'Person',
      name: 'Tanumoy Nandi',
    });
    expect(creators[1]!.identifier).toBeUndefined();
  });

  it('skips creator entries that have neither first nor last name', () => {
    const ld = datasetJsonLd(
      {
        ...BHAR,
        contributors: [
          { firstName: '', lastName: '', contact: 'ghost@example.org' },
          { firstName: 'Real', lastName: 'Person' },
        ],
      },
      'd1',
    );
    const creators = ld.creator as Array<Record<string, unknown>>;
    expect(creators).toHaveLength(1);
    expect(creators[0]!.name).toBe('Real Person');
  });

  it('omits creator entirely when contributors is missing', () => {
    const ld = datasetJsonLd({ ...MINIMAL, contributors: undefined }, 'd1');
    expect(ld.creator).toBeUndefined();
  });

  it('uses uploadedAt for datePublished and updatedAt for dateModified', () => {
    const ld = datasetJsonLd(BHAR, 'd1');
    expect(ld.datePublished).toBe('2026-04-03T00:00:00Z');
    expect(ld.dateModified).toBe('2026-04-15T00:00:00Z');
  });

  it('falls back to createdAt for datePublished when uploadedAt is missing', () => {
    const ld = datasetJsonLd({ ...BHAR, uploadedAt: undefined }, 'd1');
    expect(ld.datePublished).toBe('2026-03-20T00:00:00Z');
  });

  it('joins species + brainRegions into a single keywords string, deduped', () => {
    const ld = datasetJsonLd(
      {
        ...BHAR,
        species: 'Caenorhabditis elegans, Mus musculus',
        brainRegions: 'V1, BNST, V1', // duplicate intentional
      },
      'd1',
    );
    expect(ld.keywords).toBe('Caenorhabditis elegans, Mus musculus, V1, BNST');
  });

  it('omits keywords when both fields are empty', () => {
    const ld = datasetJsonLd({ ...MINIMAL }, 'd1');
    expect(ld.keywords).toBeUndefined();
  });

  it('emits a single distribution DataDownload pointing at the documents tab', () => {
    const ld = datasetJsonLd(BHAR, '69bc5ca11d547b1f6d083761');
    expect(ld.distribution).toMatchObject({
      '@type': 'DataDownload',
      contentUrl:
        'https://ndi-cloud.com/datasets/69bc5ca11d547b1f6d083761/documents',
    });
  });

  it('emits the includedInDataCatalog reference', () => {
    const ld = datasetJsonLd(MINIMAL, 'd1');
    expect(ld.includedInDataCatalog).toMatchObject({
      '@type': 'DataCatalog',
      name: 'NDI Cloud Data Commons',
      url: 'https://ndi-cloud.com/datasets',
    });
  });

  it('marks isAccessibleForFree=true when dataset is published', () => {
    const ld = datasetJsonLd(BHAR, 'd1');
    expect(ld.isAccessibleForFree).toBe(true);
  });

  it('marks isAccessibleForFree=false when dataset is explicitly unpublished', () => {
    const ld = datasetJsonLd({ ...BHAR, isPublished: false }, 'd1');
    expect(ld.isAccessibleForFree).toBe(false);
  });

  it('emits citation entries for associatedPublications', () => {
    const ld = datasetJsonLd(BHAR, 'd1');
    const citations = ld.citation as Array<Record<string, unknown>>;
    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({
      '@type': 'ScholarlyArticle',
      name: 'Memory transfer in C. elegans',
      url: 'https://doi.org/10.1016/j.celrep.2025.115768',
      '@id': 'https://doi.org/10.1016/j.celrep.2025.115768',
    });
  });

  it('force-prefixes PMC on bare-numeric PMCID in citation identifiers', () => {
    const ld = datasetJsonLd(BHAR, 'd1');
    const citations = ld.citation as Array<Record<string, unknown>>;
    const ids = citations[0]!.identifier as Array<Record<string, unknown>>;
    const pmcEntry = ids.find((i) => i.propertyID === 'PMCID');
    expect(pmcEntry?.value).toBe('PMC12294564');
    const pmidEntry = ids.find((i) => i.propertyID === 'PMID');
    expect(pmidEntry?.value).toBe('40471787');
  });

  it('does not double-prefix PMC when input already starts with PMC', () => {
    const ld = datasetJsonLd(
      {
        ...BHAR,
        associatedPublications: [
          { title: 'p', PMCID: 'PMC12294564' },
        ],
      },
      'd1',
    );
    const citations = ld.citation as Array<Record<string, unknown>>;
    const ids = citations[0]!.identifier as Array<Record<string, unknown>>;
    expect((ids[0] as Record<string, unknown>).value).toBe('PMC12294564');
  });

  it('skips citations that have no usable title or identifier', () => {
    const ld = datasetJsonLd(
      {
        ...BHAR,
        associatedPublications: [
          { title: '', DOI: '', PMID: '', PMCID: '' },
          { title: 'real', DOI: '10.1/x' },
        ],
      },
      'd1',
    );
    const citations = ld.citation as Array<Record<string, unknown>>;
    expect(citations).toHaveLength(1);
    expect(citations[0]!.name).toBe('real');
  });

  it('produces minimal-but-valid JSON-LD for a record with only name + isPublished', () => {
    const ld = datasetJsonLd(MINIMAL, 'minds1');
    // Required fields always present
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('Dataset');
    expect(ld.name).toBe('Minimal dataset');
    expect(ld.url).toBe('https://ndi-cloud.com/datasets/minds1/overview');
    expect(ld.publisher).toBeDefined();
    expect(ld.includedInDataCatalog).toBeDefined();
    expect(ld.distribution).toBeDefined();
    // Optional fields cleanly absent
    expect(ld.description).toBeUndefined();
    expect(ld.identifier).toBeUndefined();
    expect(ld.creator).toBeUndefined();
    expect(ld.license).toBeUndefined();
    expect(ld.keywords).toBeUndefined();
    expect(ld.citation).toBeUndefined();
  });

  it('caps very long descriptions at 5000 chars', () => {
    const longAbstract = 'a'.repeat(7000);
    const ld = datasetJsonLd({ ...BHAR, abstract: longAbstract }, 'd1');
    expect((ld.description as string).length).toBe(5000);
  });

  it('falls back to description field when abstract is missing', () => {
    const ld = datasetJsonLd(
      { ...MINIMAL, abstract: undefined, description: 'Fallback desc' },
      'd1',
    );
    expect(ld.description).toBe('Fallback desc');
  });

  it('the entire output is JSON-serializable (no circular refs, no functions)', () => {
    const ld = datasetJsonLd(BHAR, 'd1');
    expect(() => JSON.stringify(ld)).not.toThrow();
    const json = JSON.stringify(ld);
    // Sanity-check: round-trip preserves shape.
    const parsed = JSON.parse(json);
    expect(parsed['@type']).toBe('Dataset');
  });
});
