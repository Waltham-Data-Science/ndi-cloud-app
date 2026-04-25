'use client';

/**
 * /my client island.
 *
 * Composes the auth gate (`useSession`) + data fetch
 * (`useMyDatasets(enabled, scope)`) + filter chips +
 * `MyDatasetsTable` (virtualized). Audit #64 closes through the
 * `MyDatasetsTable` itself; this island is the page-level wiring.
 *
 * **Scope toggle deferred.** The data-browser exposed an admin-only
 * `mine` ↔ `all` scope toggle by reading `MeResponse.isAdmin` (a
 * field in the legacy `/api/auth/me` shape). Phase 2b's `useSession`
 * exposes `AuthUser` (id / email / emailVerified / orgs) without
 * `isAdmin`. The toggle ships when the auth model carries that field
 * — backend already silently downgrades non-admin scope=all requests
 * (no security gap deferring), and 99% of /my views are scope=mine.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileCheck, FileText, Layers } from 'lucide-react';

import { useMyDatasets } from '@/lib/api/datasets';
import { useSession } from '@/lib/auth/use-session';
import { MyDatasetsTable } from '@/components/app/MyDatasetsTable';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatBytes, formatNumber } from '@/lib/format';

type StatusFilter = 'all' | 'published' | 'draft';

export function MyDatasetsClient() {
  const router = useRouter();
  const session = useSession();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Client-side redirect to login when session resolves to null.
  // Phase 5 replaces this with edge middleware enforcement.
  useEffect(() => {
    if (!session.isLoading && session.user === null) {
      router.replace('/login?returnTo=/my');
    }
  }, [session.isLoading, session.user, router]);

  const datasetsQuery = useMyDatasets(session.user !== null, 'mine');

  const { visible, counts, totalSize } = useMemo(() => {
    const datasets = datasetsQuery.data?.datasets ?? [];
    const byStatus = { all: datasets.length, published: 0, draft: 0 };
    let sizeSum = 0;
    for (const d of datasets) {
      sizeSum += d.totalSize ?? 0;
      const isPublished = d.publishStatus === 'published' || d.isPublished;
      if (isPublished) byStatus.published += 1;
      else byStatus.draft += 1;
    }
    const visibleList = datasets.filter((d) => {
      if (statusFilter === 'all') return true;
      const isPublished = d.publishStatus === 'published' || d.isPublished;
      return statusFilter === 'published' ? isPublished : !isPublished;
    });
    return { visible: visibleList, counts: byStatus, totalSize: sizeSum };
  }, [datasetsQuery.data, statusFilter]);

  // Loading: auth or first dataset fetch in flight.
  if (session.isLoading || (session.user && datasetsQuery.isLoading)) {
    return (
      <div className="px-7 py-12 bg-bg-canvas">
        <div className="mx-auto max-w-[1200px] space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  // Pre-redirect render — useEffect kicks the router.replace next tick.
  if (session.user === null) {
    return (
      <div className="px-7 py-20 bg-bg-canvas flex items-center justify-center">
        <p className="text-sm text-fg-muted">Redirecting to sign in…</p>
      </div>
    );
  }

  return (
    <>
      <section
        className="relative overflow-hidden text-white"
        style={{ background: 'var(--grad-depth)' }}
        aria-labelledby="my-hero-h1"
      >
        <div className="relative mx-auto max-w-[1200px] px-7 py-10">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-white/55 mb-3">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ndi-teal mr-2 align-middle" />
            My workspace
          </div>
          <h1
            id="my-hero-h1"
            className="text-[1.75rem] md:text-[2rem] font-display font-bold tracking-tight leading-tight mb-3"
          >
            {session.user.name ?? session.user.email}&rsquo;s datasets
          </h1>
          <p className="text-white/65 text-[14px] leading-relaxed max-w-[640px] mb-6">
            Every dataset uploaded by your organization
            {session.user.orgs && session.user.orgs.length > 1 ? 's' : ''}.
            Drafts and in-review entries surface alongside published
            ones — only the workspace owner sees this view.
          </p>
          <div className="flex flex-wrap gap-x-10 gap-y-3 text-[11.5px] text-white/55 pt-5 border-t border-white/10">
            <Stat icon={Layers} label="Total" value={formatNumber(counts.all)} />
            <Stat
              icon={FileCheck}
              label="Published"
              value={formatNumber(counts.published)}
            />
            <Stat
              icon={FileText}
              label="Draft / In review"
              value={formatNumber(counts.draft)}
            />
            <Stat label="Storage" value={formatBytes(totalSize)} />
          </div>
        </div>
      </section>

      <div className="px-7 py-7 bg-bg-canvas min-h-[40vh]">
        <div className="mx-auto max-w-[1200px] space-y-4">
          <nav
            aria-label="Status filter"
            className="flex flex-wrap gap-1.5"
          >
            <FilterChip
              active={statusFilter === 'all'}
              onClick={() => setStatusFilter('all')}
              count={counts.all}
            >
              All
            </FilterChip>
            <FilterChip
              active={statusFilter === 'published'}
              onClick={() => setStatusFilter('published')}
              count={counts.published}
            >
              Published
            </FilterChip>
            <FilterChip
              active={statusFilter === 'draft'}
              onClick={() => setStatusFilter('draft')}
              count={counts.draft}
            >
              Draft / In review
            </FilterChip>
          </nav>

          {datasetsQuery.isError && (
            <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface p-6 text-center">
              <p className="text-sm text-fg-secondary">
                Couldn&rsquo;t load your datasets.
              </p>
              <button
                type="button"
                onClick={() => void datasetsQuery.refetch()}
                className="mt-2 text-sm font-semibold text-ndi-teal hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {!datasetsQuery.isError && (
            <MyDatasetsTable datasets={visible} />
          )}
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}) {
  return (
    <div className="flex flex-col">
      <strong className="text-white font-display font-bold text-[17px] tracking-tight leading-none mb-1 inline-flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-white/65" aria-hidden />}
        {value}
      </strong>
      <span className="uppercase tracking-wider">{label}</span>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ndi-teal',
        active
          ? 'bg-ndi-teal text-white'
          : 'bg-bg-surface text-fg-secondary ring-1 ring-border-subtle hover:bg-bg-muted',
      )}
    >
      {children}
      <span className={cn('ml-1.5 font-mono', active ? 'text-white/85' : 'text-fg-muted')}>
        {count}
      </span>
    </button>
  );
}
