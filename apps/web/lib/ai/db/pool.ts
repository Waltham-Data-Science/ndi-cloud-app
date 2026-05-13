/**
 * Postgres connection pool for the /ask chat's RAG layer.
 *
 * Single module-level pg.Pool reused across serverless invocations
 * within the same Node container. Pool is created lazily on first
 * use so `import` is side-effect-free.
 *
 * The pool size is intentionally tiny (max 3) because:
 *   - Vercel serverless functions scale horizontally — each container
 *     gets its own pool. A high per-container max multiplies across
 *     all warm containers and risks exhausting Railway Postgres's
 *     connection limit.
 *   - Each request typically issues 1-2 queries (vector + BM25 in
 *     parallel), so 3 connections handle bursts gracefully.
 *
 * Production-style pooling (PgBouncer / Vercel's serverless pooling
 * proxy) is a follow-up if this ever scales past prototype.
 */
import { Pool } from 'pg';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    throw new Error('DATABASE_URL not configured');
  }
  _pool = new Pool({
    connectionString: connStr,
    max: 3,
    idleTimeoutMillis: 30_000,
    // Railway Postgres requires sslmode=require. The connection
    // string from Railway's dashboard already includes it, but
    // we belt-and-suspenders here.
    ssl: { rejectUnauthorized: false },
  });
  return _pool;
}

/** Test-only escape hatch — closes + clears the cached pool. */
export async function _resetPoolForTest(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
