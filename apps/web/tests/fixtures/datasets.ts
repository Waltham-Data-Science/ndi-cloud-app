/**
 * Shared dataset fixtures.
 *
 * Test-suite audit 2026-04-29 introduced this module as the single
 * canonical source of "what a real dataset record looks like." Five
 * fixtures, each anchored to a specific production dataset whose
 * shape exercises a different edge of the synthesis + rendering
 * pipeline:
 *
 *   BHAR              — fully-populated C. elegans (WBStrain).
 *                       Happy-path fixture: every field present.
 *   FRANCESCONI       — rat BNST. Multi-valued strain (`strainName`
 *                       array). RRID-style ontology IDs.
 *   GRISWOLD          — ferret retina. Oversized record on
 *                       production (2.9MB / 2.08s fetch — the round-5
 *                       reproduction case). Single-species, single-region.
 *   REIKERSDORFER     — carbon-fiber array dataset. NO license field
 *                       set. No associated publications. Tests the
 *                       "license unspecified" + "no citation" branches.
 *   PREMATURE_VISION  — Van Hooser, ferret retina. Bare-prefix
 *                       ontology IDs (`9669` instead of `NCBITaxon:9669`).
 *                       Tests the defensive "render label-only when
 *                       ontologyUrl returns null" path.
 *
 * # Why we want this
 *
 * As the catalog grows from 8 → 80 datasets, every new shape adds
 * potential synthesis + rendering failure modes. Today the tests
 * inline ad-hoc DatasetRecord literals — a new test file has no
 * obvious "what does a Bhar record look like?" reference. This
 * module exports a small canonical set + a helper to override
 * individual fields, so each new test can pick the fixture that
 * matches the shape it's exercising.
 *
 * Add a fixture here when a new dataset shape lands in production
 * that breaks (or would break) something the existing fixtures
 * don't cover. Keep them realistic: copy field values from
 * production, don't invent.
 */
import type { DatasetRecord } from '@/lib/api/datasets';

/**
 * Bhar — `69bc5ca11d547b1f6d083761` on production. C. elegans
 * associative memory dataset; fully-populated record. Use as the
 * happy-path fixture in any test that just needs a "real dataset."
 */
export const BHAR_RECORD: DatasetRecord = {
  id: '69bc5ca11d547b1f6d083761',
  name: 'Transfer of long-term associative memory between Caenorhabditis elegans through IL2 neuron dependent extracellular vesicles',
  abstract:
    'Synthetic abstract describing memory transfer in C. elegans via IL2 neurons.',
  isPublished: true,
  doi: '10.63884/ndic.2026.0oxgzbjb',
  license: 'CC-BY-4.0',
  species: 'Caenorhabditis elegans',
  brainRegions: '',
  numberOfSubjects: 1656,
  documentCount: 66533,
  totalSize: 1099511627776,
  contributors: [
    {
      firstName: 'Monmita',
      lastName: 'Bhar',
      orcid: 'https://orcid.org/0000-0001-1234-5678',
      contact: 'monmita@example.org',
    },
    { firstName: 'Tanumoy', lastName: 'Nandi' },
    { firstName: 'Hari', lastName: 'Narayanan' },
  ],
  associatedPublications: [
    {
      title: 'Memory transfer in C. elegans',
      DOI: '10.1016/j.celrep.2025.115768',
      PMID: '40471787',
      PMCID: '12294564',
    },
  ],
  uploadedAt: '2026-04-03T00:00:00Z',
  createdAt: '2026-03-20T00:00:00Z',
  updatedAt: '2026-04-15T00:00:00Z',
  organizationId: 'walthamdatascience',
};

/**
 * Francesconi — `67f723d574f5f79c6062389d` on production. Vasopressin
 * + oxytocin in rat BNST. **Multi-valued strain** (`strainName` was
 * an array of 2-3 transgenic lines pre-synthesizer). RRID-style
 * background-strain ontology ID.
 *
 * Use this fixture to test array-handling + RRID resolver paths.
 */
export const FRANCESCONI_RECORD: DatasetRecord = {
  id: '67f723d574f5f79c6062389d',
  name: 'vasopressin and oxytocin excite BNST neurons through cell type-specific expression of oxytocin receptors, which reduce anxious arousal',
  abstract:
    'Interoceptive signals dynamically interact with the environment to shape appropriate defensive behaviors.',
  isPublished: true,
  doi: '10.63884/ndic.2025.jyxfer8m',
  license: 'CC-BY-4.0',
  species: 'Rattus norvegicus',
  brainRegions: 'BNST',
  numberOfSubjects: 215,
  documentCount: 14644,
  totalSize: 4_000_000_000,
  contributors: [
    { firstName: 'Walter', lastName: 'Francesconi' },
    { firstName: 'Valentina', lastName: 'Olivera-Pasilio' },
    { firstName: 'Fulvia', lastName: 'Berton' },
  ],
  associatedPublications: [
    {
      title: 'Vasopressin and oxytocin in BNST',
      DOI: '10.7554/eLife.103191',
    },
  ],
  uploadedAt: '2025-06-17T12:00:00Z',
  createdAt: '2025-04-09T00:00:00Z',
  updatedAt: '2025-09-27T00:00:00Z',
};

/**
 * Griswold — `68839b1fbf243809c0800a01` on production. Premature
 * vision in ferret. **2.9MB record / 2.08s fetch** — the round-5
 * reproduction case where `safeFetchDataset` was timing out at 1.5s
 * and the hero rendered the bare NDI id. Single-author + single-
 * region shape.
 *
 * The bare-prefix ontology IDs (`9669`) live elsewhere in this
 * dataset (treatment columns); they're modeled by the
 * `PREMATURE_VISION_DEGRADED` fixture below since the
 * `DatasetRecord` shape here doesn't expose them directly.
 */
export const GRISWOLD_RECORD: DatasetRecord = {
  id: '68839b1fbf243809c0800a01',
  name: 'Premature vision drives aberrant development of response properties in primary visual cortex',
  abstract: 'Premature eye opening alters visual cortex development.',
  isPublished: true,
  doi: '10.63884/ndic.2025.griswold',
  license: 'CC-BY-4.0',
  species: 'Mustela putorius furo',
  brainRegions: 'V1',
  numberOfSubjects: 12,
  documentCount: 743,
  totalSize: 9_000_000_000,
  contributors: [
    { firstName: 'Sophie', lastName: 'V Griswold' },
    { firstName: 'Stephen', lastName: 'D Van Hooser' },
  ],
  uploadedAt: '2025-07-26T00:00:00Z',
  createdAt: '2025-07-25T00:00:00Z',
  updatedAt: '2025-07-26T00:00:00Z',
};

/**
 * Reikersdorfer — `668b0539f13096e04f1feccd` on production.
 * Carbon-fiber array dataset. **NO license** field set — exercises
 * the "License unspecified" branch on the hero badge row + the
 * "license: null" path in the citation builder.
 *
 * Also: no associated publications, no DOI on the dataset record.
 */
export const REIKERSDORFER_RECORD: DatasetRecord = {
  id: '668b0539f13096e04f1feccd',
  name: 'Construction and Implementation of Carbon Fiber Microelectrode Arrays for Chronic and Acute In Vivo Recordings',
  abstract: 'Carbon fiber microelectrode array construction.',
  isPublished: true,
  // license: undefined — the whole point of this fixture
  // doi: undefined — same
  species: 'Mus musculus',
  brainRegions: '',
  documentCount: 743,
  totalSize: 9_000_000_000,
  contributors: [
    { firstName: 'Kristen', lastName: 'Reikersdorfer' },
    { firstName: 'Andrea', lastName: 'Stacy' },
    { firstName: 'David', lastName: 'Bressler' },
  ],
  uploadedAt: '2024-07-07T00:00:00Z',
  createdAt: '2024-07-01T00:00:00Z',
  updatedAt: '2024-07-07T00:00:00Z',
};

/**
 * Premature Vision (Van Hooser) — same dataset as Griswold but
 * isolated as the "bare-prefix ontology IDs" fixture. On production,
 * the cloud's compact summary for this dataset emits
 * `species: [{ label: 'Mustela putorius furo', ontologyId: '9669' }]`
 * — the suffix-only form without the canonical `NCBITaxon:` prefix.
 *
 * Used by OntologyTermPill tests to verify the defensive "render
 * label-only when ontologyUrl returns null" path.
 *
 * Backed by `ontology-utils.ts:isOntologyTerm('9669') === true` (the
 * predicate accepts the bare form) and `url-builder.ts:ontologyUrl('9669')
 * === null` (the resolver correctly refuses to fabricate a URL when
 * the provider prefix is missing).
 */
export const PREMATURE_VISION_BARE_PREFIX_ONTOLOGY = {
  label: 'house mouse',
  ontologyId: '9669', // intentionally bare — no NCBITaxon: prefix
} as const;

/**
 * Helper for table-driven fixture tests: take a base fixture and
 * shallow-override specific fields. Returns a new DatasetRecord with
 * the merge applied (no mutation of the base).
 *
 * Use when a test needs a "Bhar but with X cleared" or "Griswold but
 * with an extra contributor" — keeps the bulk of the fixture
 * realistic without copy-pasting the entire record.
 */
export function withOverrides<T extends Partial<DatasetRecord>>(
  base: DatasetRecord,
  overrides: T,
): DatasetRecord {
  return { ...base, ...overrides };
}
