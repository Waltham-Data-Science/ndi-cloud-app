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
 * Minimal hard contract for a `DatasetRecord` row.
 *
 * - `name` is non-negotiable.
 * - The cloud is INCONSISTENT about the identifier: the catalog
 *   endpoint (`/api/datasets/published`) returns `id`; the detail
 *   endpoint (`/api/datasets/{id}`) returns `_id` (the raw Mongo
 *   key). Production smoke-tested 2026-04-26: catalog rows had
 *   `id` only, detail rows had `_id` only. The schema accepts
 *   either and aliases `_id` → `id` so consumer code (and the
 *   `DatasetRecord` TypeScript interface) keeps reading `.id`
 *   uniformly.
 * - Everything else is optional in the upstream; `.passthrough()`
 *   preserves unknown fields so existing TypeScript consumers that
 *   read `DatasetRecord` (the rich type from `lib/api/datasets.ts`)
 *   keep seeing them — the schema is a shape-validator, not a
 *   type-replacer.
 *
 * If a future cloud cleanup unifies on `id` everywhere, this alias
 * becomes a no-op (the input already has `id`, no transform needed).
 */
export const DatasetRecordCoreSchema = z
  .object({
    id: z.string().optional(),
    _id: z.string().optional(),
    name: z.string(),
  })
  .passthrough()
  .transform((d) => {
    // Alias `_id` → `id` when only `_id` is present (detail endpoint).
    // If both are present (defensive: future-proof), trust `id`.
    if (typeof d.id !== 'string' && typeof d._id === 'string') {
      return { ...d, id: d._id };
    }
    return d;
  })
  .refine((d) => typeof d.id === 'string' && d.id.length > 0, {
    message: 'DatasetRecord requires either `id` or `_id` (received neither)',
  });

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
 * pin the fields the UI relies on. Note the `_id` aliasing in the
 * core schema header above — the detail endpoint specifically
 * needs that path.
 */
export const DatasetRecordSchema = DatasetRecordCoreSchema;
