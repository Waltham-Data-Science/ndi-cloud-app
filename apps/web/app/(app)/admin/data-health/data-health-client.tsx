'use client';

/**
 * /admin/data-health client — table view over the
 * `dataset_health_violations` snapshot. Grouped by severity:
 *   - critical (red)  — must-fix data integrity issues
 *   - warning (amber) — likely ingest gaps; investigate
 *   - info (blue)     — known-good asymmetries (e.g. C. elegans
 *                       datasets with elements but no epochs)
 *
 * Fetches via TanStack Query (cookies forwarded automatically by
 * apiFetch); the admin gate is server-side at
 * `/api/admin/data-health/route.ts` which returns 403 for non-
 * admin users. We surface that as an inline error rather than
 * router-pushing to /login so an admin clicking around without an
 * org switch sees the message and acts on it.
 */
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

interface ViolationRow {
  datasetId: string;
  datasetName: string | null;
  invariantKey: string;
  invariantLabel: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  observation: Record<string, unknown>;
  snapshotAt: string;
}

interface AdminResponse {
  violations: ViolationRow[];
}

const SEVERITY_ORDER = ['critical', 'warning', 'info'] as const;

export function DataHealthClient() {
  const { data, isLoading, isError, error } = useQuery<AdminResponse>({
    queryKey: ['admin', 'data-health'],
    queryFn: () => apiFetch<AdminResponse>('/api/admin/data-health'),
    retry: false,
    staleTime: 60_000,
  });

  const groups = useMemo(() => {
    const out: Record<string, ViolationRow[]> = {
      critical: [],
      warning: [],
      info: [],
    };
    for (const v of data?.violations ?? []) {
      const bucket = out[v.severity];
      if (bucket) bucket.push(v);
    }
    return out;
  }, [data]);

  return (
    <main className="mx-auto max-w-[1200px] px-7 py-10 bg-bg-canvas">
      <header className="mb-6">
        <h1 className="text-[1.5rem] font-bold tracking-tight text-fg-primary">
          Data health
        </h1>
        <p className="mt-1 text-[13.5px] text-fg-secondary leading-relaxed max-w-[640px]">
          Latest Dataset Health invariant snapshot. The nightly cron at{' '}
          <span className="font-mono">/api/cron/dataset-health</span> scans
          every published dataset and writes violations here. Datasets
          with no current violations don&rsquo;t appear — the table
          always reflects the latest per-dataset state.
        </p>
      </header>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {isError && (
        <ErrorBanner err={error} />
      )}

      {!isLoading && !isError && data && (
        <>
          <SummaryStrip
            critical={groups.critical?.length ?? 0}
            warning={groups.warning?.length ?? 0}
            info={groups.info?.length ?? 0}
            totalAffected={
              new Set((data.violations ?? []).map((v) => v.datasetId)).size
            }
          />
          {SEVERITY_ORDER.map((severity) => {
            const rows = groups[severity] ?? [];
            if (rows.length === 0) return null;
            return (
              <SeverityGroup
                key={severity}
                severity={severity}
                rows={rows}
              />
            );
          })}
          {(data.violations ?? []).length === 0 && (
            <Card>
              <CardBody className="p-8 text-center">
                <p className="text-[15px] font-semibold text-fg-primary">
                  All datasets healthy 🎉
                </p>
                <p className="mt-1 text-[13px] text-fg-secondary">
                  The last cron run found no invariant violations across
                  the published catalog.
                </p>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </main>
  );
}

function ErrorBanner({ err }: { err: unknown }) {
  let title = 'Something went wrong loading data health.';
  let detail: string | null = null;
  if (err instanceof ApiError) {
    if (err.status === 403) {
      title = 'Admin access required.';
      detail =
        'Sign in with an admin account or ask an admin to grant you the role.';
    } else {
      title = err.message || title;
    }
  } else if (err instanceof Error) {
    detail = err.message;
  }
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-200 bg-amber-50 p-4 text-[13.5px] text-amber-900"
    >
      <p className="font-semibold">{title}</p>
      {detail && <p className="mt-1">{detail}</p>}
    </div>
  );
}

interface SummaryStripProps {
  critical: number;
  warning: number;
  info: number;
  totalAffected: number;
}

function SummaryStrip({ critical, warning, info, totalAffected }: SummaryStripProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <StatChip
        label="Critical"
        value={critical}
        tint="bg-red-50 text-red-900 ring-red-200"
        Icon={ShieldAlert}
      />
      <StatChip
        label="Warning"
        value={warning}
        tint="bg-amber-50 text-amber-900 ring-amber-200"
        Icon={AlertTriangle}
      />
      <StatChip
        label="Info"
        value={info}
        tint="bg-blue-50 text-blue-900 ring-blue-200"
        Icon={Info}
      />
      <StatChip
        label="Datasets affected"
        value={totalAffected}
        tint="bg-bg-surface text-fg-primary ring-border-subtle"
        Icon={ShieldAlert}
      />
    </div>
  );
}

function StatChip({
  label,
  value,
  tint,
  Icon,
}: {
  label: string;
  value: number;
  tint: string;
  Icon: typeof ShieldAlert;
}) {
  return (
    <div
      className={`rounded-md px-3 py-2 ring-1 ring-inset ${tint}`}
      data-testid={`stat-${label.toLowerCase().replace(/\s/g, '-')}`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase opacity-80">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <div className="mt-0.5 text-[20px] font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

interface SeverityGroupProps {
  severity: 'critical' | 'warning' | 'info';
  rows: ViolationRow[];
}

function SeverityGroup({ severity, rows }: SeverityGroupProps) {
  const label =
    severity === 'critical'
      ? 'Critical'
      : severity === 'warning'
        ? 'Warning'
        : 'Info';
  return (
    <Card className="mb-5">
      <CardHeader className="px-5 py-3 border-b border-border-subtle bg-bg-surface-subtle">
        <CardTitle className="text-[14px] font-semibold">
          {label} · {rows.length} violation{rows.length === 1 ? '' : 's'}
        </CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        <table className="w-full text-[12.5px]">
          <thead className="text-fg-secondary text-left">
            <tr className="border-b border-border-subtle">
              <th className="py-2.5 px-4 font-medium">Dataset</th>
              <th className="py-2.5 px-4 font-medium">Invariant</th>
              <th className="py-2.5 px-4 font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.datasetId}:${r.invariantKey}`}
                className="border-b border-border-subtle/60 last:border-b-0"
                data-testid="data-health-violation-row"
              >
                <td className="py-2 px-4 align-top">
                  <Link
                    href={`/datasets/${r.datasetId}`}
                    className="text-brand-blue hover:underline"
                  >
                    {r.datasetName ?? r.datasetId}
                  </Link>
                  <div className="mt-0.5 text-[10.5px] font-mono text-fg-muted">
                    {r.datasetId}
                  </div>
                </td>
                <td className="py-2 px-4 align-top">
                  <div className="font-medium text-fg-primary">
                    {r.invariantLabel}
                  </div>
                  <div className="mt-0.5 text-[10.5px] font-mono text-fg-muted">
                    {r.invariantKey}
                  </div>
                </td>
                <td className="py-2 px-4 align-top text-fg-primary">
                  {r.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
