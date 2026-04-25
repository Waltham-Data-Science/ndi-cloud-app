/**
 * FacetsResponse — distinct structured facts aggregated across every
 * published dataset.
 *
 * Ported verbatim from `ndi-data-browser-v2/frontend/src/types/facets.ts`.
 * One-to-one mirror of
 * `backend/services/facet_service.py::FacetsResponse`. Returned verbatim
 * from `GET /api/facets`.
 *
 * Freshness budget (amendment §4.B3): cached under `facets:v1` for 5
 * minutes. A dataset published at T=0 surfaces in these facets within
 * T+5m. Short TTL is the CURRENT strategy; eventual strategy is
 * "invalidate on dataset publish" — see ADR-013.
 */

import type { OntologyTerm } from './dataset-summary';

export type { OntologyTerm };

export interface FacetsResponse {
  /** Distinct species terms across all published datasets. */
  species: OntologyTerm[];
  /** Distinct brain-region terms. */
  brainRegions: OntologyTerm[];
  /** Distinct strain terms. */
  strains: OntologyTerm[];
  /** Distinct biological-sex terms. */
  sexes: OntologyTerm[];
  /** Distinct probe-type labels — free-text bucket. */
  probeTypes: string[];
  /** How many datasets contributed at least one non-null fact. */
  datasetCount: number;
  /** ISO-8601 timestamp the aggregation computed at. */
  computedAt: string;
  schemaVersion: 'facets:v1';
}

/** Runtime marker so `import type` cannot erase the schema version. */
export const FacetsContract = { schemaVersion: 'facets:v1' } as const;
