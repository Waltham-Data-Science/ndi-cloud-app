/**
 * Dataset zod schema contract tests.
 *
 * Production smoke (2026-04-26) revealed the cloud is inconsistent:
 *   - `/api/datasets/published` rows return `id` (not `_id`).
 *   - `/api/datasets/{id}` detail returns `_id` (not `id`).
 *
 * The schema's `_id`-aliasing keeps the consumer-facing
 * `DatasetRecord.id` field stable. These tests pin that contract so
 * the alias can't silently regress, and so a future cloud cleanup
 * unifying on `id` doesn't accidentally break the alias path.
 */
import { describe, expect, it } from 'vitest';

import {
  DatasetListResponseSchema,
  DatasetRecordSchema,
} from '@/lib/api/schemas/datasets';

describe('DatasetRecordSchema (CQ1 + 2026-04-26 _id alias hotfix)', () => {
  it('accepts a record with `id` (catalog shape)', () => {
    const result = DatasetRecordSchema.parse({
      id: 'abc123',
      name: 'Test dataset',
    });
    expect(result.id).toBe('abc123');
  });

  it('accepts a record with `_id` only (detail shape) — aliases to `id`', () => {
    const result = DatasetRecordSchema.parse({
      _id: 'abc123',
      name: 'Test dataset',
    });
    expect(result.id).toBe('abc123');
    // `_id` preserved for consumers that read it explicitly.
    expect(result._id).toBe('abc123');
  });

  it('prefers `id` over `_id` when both are present', () => {
    const result = DatasetRecordSchema.parse({
      id: 'preferred',
      _id: 'fallback',
      name: 'Test dataset',
    });
    expect(result.id).toBe('preferred');
  });

  it('rejects when both `id` and `_id` are missing', () => {
    expect(() =>
      DatasetRecordSchema.parse({ name: 'Test dataset' }),
    ).toThrow(/either `id` or `_id`/);
  });

  it('rejects when `name` is missing (existing CQ1 contract)', () => {
    expect(() =>
      DatasetRecordSchema.parse({ id: 'abc123' }),
    ).toThrow();
  });

  it('preserves passthrough fields (rich cloud record)', () => {
    const result = DatasetRecordSchema.parse({
      id: 'abc123',
      name: 'Test dataset',
      species: 'Mus musculus',
      brainRegions: 'V1',
      documentCount: 42,
    }) as unknown as Record<string, unknown>;
    expect(result.species).toBe('Mus musculus');
    expect(result.brainRegions).toBe('V1');
    expect(result.documentCount).toBe(42);
  });
});

describe('DatasetListResponseSchema', () => {
  it('accepts a catalog page with `id` rows', () => {
    const result = DatasetListResponseSchema.parse({
      totalNumber: 2,
      datasets: [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ],
    });
    expect(result.datasets).toHaveLength(2);
    // Tuple-narrow via destructure so noUncheckedIndexedAccess
    // doesn't flag possibly-undefined access.
    const [first] = result.datasets;
    expect(first?.id).toBe('a');
  });

  it('also accepts catalog pages whose rows happen to use `_id`', () => {
    // Defensive: cloud could change the catalog shape too. The detail
    // endpoint already does this; the schema should be tolerant either
    // way without a code change.
    const result = DatasetListResponseSchema.parse({
      totalNumber: 1,
      datasets: [{ _id: 'x', name: 'Xenon' }],
    });
    const [first] = result.datasets;
    expect(first?.id).toBe('x');
  });
});
