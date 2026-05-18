/**
 * GET /api/admin/data-health — read the latest Dataset Health snapshot.
 *
 * Stream 6.9 (2026-05-15). Returns every violation from the latest
 * cron snapshot, ordered critical → warning → info. The
 * `/admin/data-health` page consumes this.
 *
 * Authz: requires an authenticated admin session (the FastAPI proxy's
 * existing session-cookie check + `is_admin` flag). The wrapper
 * forwards the user's `Cookie` to FastAPI's `/api/auth/me` for the
 * admin verification — same shape as other admin-only routes in this
 * codebase.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { logEvent } from '@/lib/ndi/tools/shared';
import { readAllLatestViolations } from '@/lib/data-quality/persistence';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function baseUrl(): string | null {
  if (env.VERCEL_GIT_COMMIT_REF === 'feat/experimental-ask-chat') {
    return 'https://ndb-v2-experimental.up.railway.app';
  }
  const u = env.INTERNAL_API_URL;
  return typeof u === 'string' && u.length > 0 ? u : null;
}

interface AuthMe {
  user?: { isAdmin?: boolean };
  isAdmin?: boolean;
}

async function isAdmin(req: NextRequest): Promise<boolean> {
  const base = baseUrl();
  if (!base) return false;
  const cookie = req.headers.get('cookie');
  if (!cookie) return false;
  try {
    const res = await fetch(`${base}/api/auth/me`, {
      headers: { Cookie: cookie, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const body = (await res.json()) as AuthMe;
    return Boolean(body.user?.isAdmin ?? body.isAdmin);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const rows = await readAllLatestViolations();
    logEvent('dataset_health.admin.read', { row_count: rows.length });
    return NextResponse.json({ violations: rows });
  } catch (err) {
    logEvent('dataset_health.admin.read_error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'persistence_error' },
      { status: 503 },
    );
  }
}
