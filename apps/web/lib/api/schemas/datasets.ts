/**
 * Dataset response schemas (CQ1).
 *
 * Runtime-validates the catalog list and dataset-detail responses so
 * a backend rename or required-field drop surfaces as a typed
 * `ApiError` with code `RESPONSE_SHAPE_INVALID` instead of a
 * downstream null-deref or silent wrong data on the catalog cards.
 *
 * The cloud-side `DatasetRecord` shape is rich and evolves — the
 * backend's enricher (see `backend/services/dataset_summary_service.py`)
 * may add new fields. We use `.passthrough()` so unknown fields don't
 * trigger a validation failure — the goal here is "did the required
 * core stay valid?", not "is the response 100% closed-shape?".
 *
 * Strict-shape validation lives at the boundary the client cares about
 * (id, name, presence of the listing envelope). Anything richer goes
 * through the existing TypeScript type system as before.
 */
import { z } from 'zod';

/**
 * Minimal hard contract for a `DatasetRecord` row in the catalog.
 * - `id` and `name` are non-negotiable; everything else is optional or
 *   nullable in the upstream. Schema kept loose to avoid blocking the
 *   client when the backend ships a new optional field.
 * - `.passthrough()` preserves unknown fields so existing TypeScript
 *   consumers that read `DatasetRecord` (the rich type from
 *   `lib/api/datasets.ts`) keep seeing them — the schema is a
 *   shape-validator, not a type-replacer.
 */
export const DatasetRecordCoreSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .passthrough();

/**
 * `GET /api/datasets/published?page=N&pageSize=M` — anonymous-public
 * catalog. Same shape used by `/api/datasets/my` (authenticated).
 */
export const DatasetListResponseSchema = z.object({
  totalNumber: z.number(),
  datasets: z.array(DatasetRecordCoreSchema),
});

/**
 * `GET /api/datasets/:id` — single dataset detail. Same loose-shape
 * approach as the list — the cloud ships a rich record and we only
 * pin the fields the UI relies on for the "this is a real dataset"
 * decision.
 */
export const DatasetRecordSchema = DatasetRecordCoreSchema;
