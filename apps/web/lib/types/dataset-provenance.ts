/**
 * DatasetProvenance — aggregated dataset-level derivation facts.
 *
 * Ported verbatim from `ndi-data-browser-v2/frontend/src/types/dataset-provenance.ts`.
 * One-to-one mirror of
 * `backend/services/dataset_provenance_service.py::DatasetProvenance`.
 * Produced by the B5 aggregator and returned verbatim from
 * `GET /api/datasets/:id/provenance`.
 *
 * Vocabulary lock (amendment §4.B5): "dataset provenance" / "derivation
 * graph" — NEVER "lineage". The cloud's `classLineage` is *class-ISA*
 * lineage (a `spikesorting` doc's superclass chain), which is a completely
 * different concept. Using "lineage" unqualified would be a naming clash.
 */

export interface DatasetDependencyEdge {
  /** The dataset being described (always this dataset). */
  sourceDatasetId: string;
  /** The other dataset some of this dataset's documents depend on. */
  targetDatasetId: string;
  /** The document class of the source docs carrying the `depends_on` refs. */
  viaDocumentClass: string;
  /** Count of DISTINCT target ndiIds in `targetDatasetId` referenced
   *  by `depends_on` fields on documents of class `viaDocumentClass`
   *  in `sourceDatasetId`. Two source docs pointing at the same target
   *  ndiId contribute 1, not 2. Dedup is intentional. */
  edgeCount: number;
}

export interface DatasetProvenance {
  datasetId: string;
  /** Parent dataset this one was branched from, or `null`. */
  branchOf: string | null;
  /** Child datasets forked off this one. */
  branches: string[];
  /** Cross-dataset `depends_on` edges, one per
   *  `(targetDatasetId, viaDocumentClass)` tuple. */
  documentDependencies: DatasetDependencyEdge[];
  /** ISO-8601 build timestamp. */
  computedAt: string;
  schemaVersion: 'provenance:v1';
}

/** Runtime marker so `import type` cannot erase the schema version. */
export const DatasetProvenanceContract = {
  schemaVersion: 'provenance:v1',
} as const;
