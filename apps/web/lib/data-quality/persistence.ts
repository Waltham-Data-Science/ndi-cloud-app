/**
 * Dataset Health — Postgres persistence layer.
 *
 * Stream 6.8 (2026-05-15) deliverable. Wraps the
 * `dataset_health_violations` table behind two operations the cron
 * and the admin route share:
 *
 *   - `replaceViolationsForDataset(datasetId, violations)` — atomic
 *     swap: DELETE old rows for this dataset, INSERT the new set,
 *     same transaction. Called by the nightly Vercel cron after each
 *     dataset's invariants run.
 *   - `readAllLatestViolations()` — every violation from the LATEST
 *     snapshot per dataset (per-dataset MAX(snapshot_at) join).
 *     Powers the admin UI's table view.
 *
 * Both reuse `getPool()` from `apps/web/lib/ai/db/pool.ts` (the
 * Railway Postgres instance owns this table alongside the /ask
 * RAG chunks).
 */
import type { Pool, PoolClient } from 'pg';

import type { Severity, Violation } from './invariants';
import { getPool } from '@/lib/ai/db/pool';

/**
 * A row as the admin UI sees it — joins the per-dataset
 * MAX(snapshot_at) so stale snapshots from previous cron runs don't
 * leak in.
 */
export interface DatasetHealthRow {
  datasetId: string;
  datasetName: string | null;
  invariantKey: string;
  invariantLabel: string;
  severity: Severity;
  message: string;
  observation: Record<string, unknown>;
  snapshotAt: Date;
}

/**
 * Atomically swap the violations for one dataset. The DELETE +
 * INSERT pair lives in one transaction so the admin UI never sees a
 * partial state (no rows, or mixed-snapshot rows).
 *
 * `violations` may be empty — in which case this becomes a "clear
 * stale violations for this dataset" call. The cron uses that when
 * a previously-failing dataset becomes healthy.
 */
export async function replaceViolationsForDataset(
  datasetId: string,
  datasetName: string | null,
  violations: readonly Violation[],
  poolOverride?: Pool,
): Promise<void> {
  const pool = poolOverride ?? getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM dataset_health_violations WHERE dataset_id = $1`,
      [datasetId],
    );
    if (violations.length > 0) {
      await insertViolations(client, datasetId, datasetName, violations);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function insertViolations(
  client: PoolClient,
  datasetId: string,
  datasetName: string | null,
  violations: readonly Violation[],
): Promise<void> {
  // Batched INSERT — single round trip even at the largest
  // per-dataset violation count we expect (~6 invariants today).
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let p = 1;
  for (const v of violations) {
    placeholders.push(
      `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`,
    );
    values.push(
      datasetId,
      datasetName,
      v.key,
      v.label,
      v.severity,
      v.message,
      JSON.stringify(v.observation),
    );
  }
  await client.query(
    `INSERT INTO dataset_health_violations
       (dataset_id, dataset_name, invariant_key, invariant_label,
        severity, message, observation)
     VALUES ${placeholders.join(', ')}`,
    values,
  );
}

/**
 * Every violation from the latest snapshot per dataset. Datasets
 * with NO current violations don't appear (the cron deletes their
 * rows on the snapshot pass).
 *
 * Ordered by severity (critical → warning → info) and then by
 * dataset name for stable admin-UI scrolling.
 */
export async function readAllLatestViolations(
  poolOverride?: Pool,
): Promise<DatasetHealthRow[]> {
  const pool = poolOverride ?? getPool();
  // No need for the MAX(snapshot_at) join here because
  // `replaceViolationsForDataset` always replaces the per-dataset
  // row set in one transaction. The table always reflects the
  // latest snapshot per dataset.
  const { rows } = await pool.query(
    `SELECT dataset_id, dataset_name, invariant_key, invariant_label,
            severity, message, observation, snapshot_at
       FROM dataset_health_violations
       ORDER BY
         CASE severity
           WHEN 'critical' THEN 0
           WHEN 'warning' THEN 1
           ELSE 2
         END,
         dataset_name NULLS LAST,
         invariant_key`,
  );
  return rows.map(toRow);
}

function toRow(r: Record<string, unknown>): DatasetHealthRow {
  return {
    datasetId: String(r.dataset_id),
    datasetName:
      typeof r.dataset_name === 'string' ? r.dataset_name : null,
    invariantKey: String(r.invariant_key),
    invariantLabel: String(r.invariant_label),
    severity: r.severity as Severity,
    message: String(r.message),
    observation:
      typeof r.observation === 'object' && r.observation !== null
        ? (r.observation as Record<string, unknown>)
        : {},
    snapshotAt: r.snapshot_at instanceof Date ? r.snapshot_at : new Date(),
  };
}
