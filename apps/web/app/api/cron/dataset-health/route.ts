/**
 * GET /api/cron/dataset-health — nightly Dataset Health snapshot.
 *
 * Stream 6.8 (2026-05-15). Iterates every published dataset, fetches
 * the rich summary + class-counts, runs the full invariant set
 * (`apps/web/lib/data-quality/invariants.ts`), and persists violations
 * to the `dataset_health_violations` table. The admin page at
 * `/admin/data-health` (Stream 6.9) reads from that table; the catalog
 * badge (Stream 6.10) shows compact-safe checks today and will gain
 * the full set once we wire it to read from the table.
 *
 * Vercel Cron schedule: configured in vercel.json. Trigger guards:
 *
 *   - `Authorization: Bearer ${CRON_SECRET}` for external callers
 *   - `x-vercel-cron: 1` for Vercel-managed cron (set at the edge)
 *
 * Returns a JSON summary of the scan so the cron-run logs surface
 * the per-dataset outcome at a glance.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/lib/env';
import { logEvent } from '@/lib/ndi/tools/shared';
import {
  checkDatasetHealth,
  type DatasetSummaryFacts,
} from '@/lib/data-quality/invariants';
import { replaceViolationsForDataset } from '@/lib/data-quality/persistence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The scan iterates all published datasets sequentially (~8 today,
// ~50 within a year). Single dataset summary fetch takes ~1-3s on a
// cold cache. 60s is the sweet spot — long enough to scan ~20 cold
// datasets, short enough to fail fast on a wedged backend.
export const maxDuration = 60;

interface CronSummary {
  datasets_scanned: number;
  datasets_with_violations: number;
  total_violations: number;
  failures: Array<{ dataset_id: string; reason: string }>;
}

function authorize(req: NextRequest): boolean {
  // Vercel cron sets x-vercel-cron: 1 at the edge.
  if (req.headers.get('x-vercel-cron') === '1') return true;
  // External callers (manual trigger from CI / a script) must echo
  // the CRON_SECRET as a Bearer.
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  return auth.slice('Bearer '.length).trim() === secret;
}

function baseUrl(): string | null {
  if (env.VERCEL_GIT_COMMIT_REF === 'feat/experimental-ask-chat') {
    return 'https://ndb-v2-experimental.up.railway.app';
  }
  const u = env.INTERNAL_API_URL;
  return typeof u === 'string' && u.length > 0 ? u : null;
}

interface PublishedDatasetLite {
  id?: string;
  _id?: string;
  name?: string;
}

interface BackendCounts {
  totalDocuments?: number;
  counts?: {
    sessions?: number;
    subjects?: number;
    probes?: number;
    elements?: number;
    epochs?: number;
    totalDocuments?: number;
  };
  classCounts?: Record<string, number>;
  species?: Array<{ label?: string }> | null;
  brainRegions?: Array<{ label?: string }> | null;
  strains?: Array<{ label?: string }> | null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const base = baseUrl();
  if (!base) {
    return NextResponse.json(
      { error: 'catalog_service_not_configured' },
      { status: 503 },
    );
  }

  const summary: CronSummary = {
    datasets_scanned: 0,
    datasets_with_violations: 0,
    total_violations: 0,
    failures: [],
  };

  // 1. Fetch every published dataset's id+name.
  // pageSize=100 covers our catalog comfortably; a follow-up adds
  // pagination if we ever exceed it.
  const published = await fetchJson<{
    datasets?: PublishedDatasetLite[];
  }>(`${base}/api/datasets/published?page=1&pageSize=100`);
  const datasets = published?.datasets ?? [];
  if (datasets.length === 0) {
    logEvent('dataset_health.cron.no_datasets', {});
    return NextResponse.json(summary);
  }

  // 2. Per-dataset: fetch summary + class-counts, build facts, check
  // invariants, persist. Sequential to keep upstream load light;
  // can parallel-batch later if the scan exceeds maxDuration.
  for (const ds of datasets) {
    const id = ds.id ?? ds._id;
    if (typeof id !== 'string' || id.length === 0) continue;

    const [datasetSummary, classCounts] = await Promise.all([
      fetchJson<BackendCounts>(`${base}/api/datasets/${id}/summary`),
      fetchJson<BackendCounts>(`${base}/api/datasets/${id}/class-counts`),
    ]);
    if (!datasetSummary && !classCounts) {
      summary.failures.push({ dataset_id: id, reason: 'upstream_unreachable' });
      continue;
    }
    const facts: DatasetSummaryFacts = {
      datasetId: id,
      datasetName: ds.name ?? id,
      species: (datasetSummary?.species ?? []).map((s) => s.label ?? ''),
      brainRegions: (datasetSummary?.brainRegions ?? []).map(
        (r) => r.label ?? '',
      ),
      strains: (datasetSummary?.strains ?? []).map((s) => s.label ?? ''),
      totalDocuments:
        datasetSummary?.counts?.totalDocuments ??
        classCounts?.totalDocuments ??
        0,
      classCounts: classCounts?.classCounts ?? {},
      derivedCounts: {
        sessions: datasetSummary?.counts?.sessions ?? 0,
        subjects: datasetSummary?.counts?.subjects ?? 0,
        elements: datasetSummary?.counts?.elements ?? 0,
        epochs: datasetSummary?.counts?.epochs ?? 0,
        probes: datasetSummary?.counts?.probes ?? 0,
      },
    };
    const violations = checkDatasetHealth(facts);
    try {
      await replaceViolationsForDataset(id, ds.name ?? null, violations);
    } catch (err) {
      summary.failures.push({
        dataset_id: id,
        reason:
          err instanceof Error ? err.message : 'persistence_failure',
      });
      continue;
    }
    summary.datasets_scanned += 1;
    summary.total_violations += violations.length;
    if (violations.length > 0) summary.datasets_with_violations += 1;
  }

  logEvent('dataset_health.cron.complete', {
    datasets_scanned: summary.datasets_scanned,
    datasets_with_violations: summary.datasets_with_violations,
    total_violations: summary.total_violations,
    failure_count: summary.failures.length,
  });
  return NextResponse.json(summary);
}
