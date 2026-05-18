'use client';

/**
 * /my — workspace landing. Originally Phase 6.6 REBUILD-6.
 *
 * # 2026-05-14 — Task-2 viewer GUI pivot
 *
 * Repositioned from "my org's dataset list" → "unified workspace
 * entry point" so logged-in users have ONE place to pick a dataset
 * — their own or one from the public NDI catalog — and click into
 * the rich plotting/computing surface at `/my/workspace/[id]`.
 *
 * Surface changes from the original REBUILD-6:
 *
 *   - Top-of-page tab strip: "Your datasets" (existing) ↔ "Public
 *     NDI catalog" (new, sources `usePublishedDatasets`). Status
 *     filter chips + admin scope toggle are scoped to the "Your
 *     datasets" tab — they don't apply to the public catalog.
 *   - Card click destination flipped from `/datasets/[id]/overview`
 *     (read-only metadata) to `/my/workspace/[id]` (the rich Task-2
 *     viewer). The Document Explorer is still one click away from
 *     the workspace itself for users who want the raw record view.
 *
 * Original REBUILD-6 content preserved below:
 *
 * Ports the full source design from
 * `ndi-data-browser-v2/frontend/src/pages/MyDatasetsPage.tsx`:
 *   1. Depth-gradient hero with brandmark pattern overlay, eyebrow +
 *      admin badge (when `isAdmin`), workspace h1 + sub, scope
 *      toggle (admin-only), and a 4-column glassmorphic HeroStat row.
 *   2. Status filter chip row (All / Published / Draft) + view toggle.
 *   3. Grid view (DatasetCard fan, sm:2 / xl:3) — primary view.
 *   4. Table view (audit-#64 virtualized `MyDatasetsTable`) —
 *      power-user dense alternative.
 *
 * Scope toggle: shipped behind `useSession().user.isAdmin` per the
 * REBUILD-6 dependency-check verification — `MeResponse.is_admin` is
 * already on the FastAPI payload (`backend/routers/auth.py:97-109`),
 * we just had to extend `AuthUser` to surface it. No backend
 * coordination required. The toggle changes the `useMyDatasets(scope)`
 * fetch key; scope=`all` is the legacy `/datasets/unpublished` admin
 * firehose. Backend silently downgrades non-admin scope=all → mine, so
 * this is correct UX (only admins see the toggle, only admins benefit).
 *
 * View toggle persists to local component state, not URL.
 *
 * Audit #64 (full virtualization for MyDatasets): preserved in the
 * table view via `<MyDatasetsTable>`.
 */
import {
  HardDrive,
  FileCheck,
  Layers,
  Quote,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { DatasetCard } from '@/components/app/DatasetCard';
import { MyDatasetsTable } from '@/components/app/MyDatasetsTable';
import { Badge } from '@/components/ui/Badge';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useMyDatasets, usePublishedDatasets, type MyScope } from '@/lib/api/datasets';
import { useSession } from '@/lib/auth/use-session';
import { cn } from '@/lib/cn';
import { formatBytes, formatNumber } from '@/lib/format';

type StatusFilter = 'all' | 'published' | 'draft';
type ViewMode = 'grid' | 'table';
type WorkspaceTab = 'mine' | 'public';

// When the user clicks a dataset card from /my, we route them into
// the rich Task-2 workspace surface instead of the read-only public
// detail page. The Document Explorer and full record view are still
// one click away from inside the workspace.
const workspaceHrefBuilder = (id: string) => `/my/workspace/${id}`;

export function MyDatasetsClient() {
  const router = useRouter();
  const session = useSession();
  const isAdmin = session.user?.isAdmin === true;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('mine');
  const [scope, setScope] = useState<MyScope>('mine');
  const activeScope: MyScope = isAdmin ? scope : 'mine';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Client-side redirect to login when session resolves to null. Phase
  // 5 replaces this with edge middleware enforcement.
  useEffect(() => {
    if (!session.isLoading && session.user === null) {
      router.replace('/login?returnTo=/my');
    }
  }, [session.isLoading, session.user, router]);

  // Per-tab data sources. Both return the same DatasetListResponse
  // shape, so the rest of the component is tab-agnostic from the
  // dataset-render perspective. We always run BOTH queries (cheap —
  // TanStack caches per-key) so switching tabs is instant and the
  // hero stats are accurate even on the first paint of the inactive
  // tab. usePublishedDatasets paginates; a single page of 100 is
  // plenty for the current 8-dataset public catalog and gives us
  // headroom as more datasets land.
  const myDatasetsQuery = useMyDatasets(session.user !== null, activeScope);
  const publicDatasetsQuery = usePublishedDatasets(1, 100);
  const datasetsQuery = activeTab === 'mine' ? myDatasetsQuery : publicDatasetsQuery;

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

  const orgCount = session.user.organizationIds.length;
  const isAllScope = activeScope === 'all';

  return (
    <>
      {/* ── Hero band ───────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden text-white"
        style={{ background: 'var(--grad-depth)' }}
        aria-labelledby="my-hero"
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "url('/brand/ndicloud-emblem.svg')",
            backgroundSize: '120px',
            backgroundRepeat: 'repeat',
            opacity: 0.05,
          }}
        />
        {/* `px-7` is the desktop chrome value; `px-4` below sm: gives
            the hero stat strip enough horizontal room at narrow phone
            viewports (the 2-col stat grid was tight at 320px because
            the page padding alone consumed ~17%). */}
        <div className="relative mx-auto max-w-[1200px] px-4 sm:px-7 py-12 md:py-14">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-bold tracking-eyebrow uppercase text-brand-blue-3 mb-3 flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-brand-blue-3"
                />
                Your workspace
                {isAdmin && (
                  <Badge
                    variant="secondary"
                    className="ml-2 text-[10px] bg-white/15 text-white border-white/20"
                  >
                    admin
                  </Badge>
                )}
              </div>
              <h1
                id="my-hero"
                className="text-white font-display font-extrabold tracking-tight leading-tight text-[2rem] md:text-[2.25rem] mb-2"
              >
                {isAllScope
                  ? 'All in-review datasets, cloud-wide'
                  : 'My organization’s datasets.'}
              </h1>
              <p className="text-white/70 text-[14.5px] leading-relaxed max-w-[620px]">
                {isAllScope
                  ? 'Admin debug view — every in-review dataset across every org in the cloud (legacy /datasets/unpublished firehose).'
                  : 'Every dataset owned by your organization — published, in-review, and drafts. Click a card to inspect subjects, probes, epochs, and raw documents.'}
              </p>
            </div>

            {isAdmin && <ScopeToggle value={scope} onChange={setScope} />}
          </div>

          {/* Stat strip — glassmorphic 4-column grid. */}
          {datasetsQuery.data && (
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
              <HeroStat
                icon={<Layers className="h-3.5 w-3.5" />}
                label="Total datasets"
                value={formatNumber(
                  datasetsQuery.data.totalNumber ??
                    datasetsQuery.data.datasets.length,
                )}
              />
              <HeroStat
                icon={<FileCheck className="h-3.5 w-3.5" />}
                label="Published"
                value={formatNumber(counts.published)}
                hint={`${formatNumber(counts.draft)} draft / in-review`}
              />
              <HeroStat
                icon={<HardDrive className="h-3.5 w-3.5" />}
                label="Storage used"
                value={formatBytes(totalSize)}
                hint="across all datasets"
              />
              <HeroStat
                icon={<Quote className="h-3.5 w-3.5" />}
                label="Organizations"
                value={formatNumber(orgCount)}
                hint={orgCount === 1 ? 'one workspace' : 'total'}
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      {/* `px-7` is the desktop chrome value; `px-4` below sm: matches
          the hero band's mobile padding ramp so the list flush-aligns
          with the stat strip above on narrow viewports. */}
      <section className="mx-auto max-w-[1200px] px-4 sm:px-7 py-7 bg-bg-canvas min-h-[40vh]">
        {/* Top-of-section tab strip — switches the dataset source
            between the user's own datasets and the public NDI catalog.
            Both feed the same card/table render below; the only thing
            that changes is the data query the chips/cards bind to. */}
        <div
          role="tablist"
          aria-label="Dataset source"
          className="mb-5 flex flex-wrap items-center gap-1 border-b border-border-subtle"
        >
          <TabButton
            active={activeTab === 'mine'}
            onClick={() => setActiveTab('mine')}
          >
            Your datasets
            {myDatasetsQuery.data && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-fg-secondary/10 px-1.5 py-0.5 text-[10px] font-semibold text-fg-secondary">
                {formatNumber(myDatasetsQuery.data.datasets.length)}
              </span>
            )}
          </TabButton>
          <TabButton
            active={activeTab === 'public'}
            onClick={() => setActiveTab('public')}
          >
            Public NDI catalog
            {publicDatasetsQuery.data && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-fg-secondary/10 px-1.5 py-0.5 text-[10px] font-semibold text-fg-secondary">
                {formatNumber(
                  publicDatasetsQuery.data.totalNumber ??
                    publicDatasetsQuery.data.datasets.length,
                )}
              </span>
            )}
          </TabButton>
          <div className="ml-auto">
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {/* Status filter chips only meaningful for "Your datasets" —
            public catalog entries are all published by definition, so
            the All/Published/Draft toggle would be a no-op there. */}
        {activeTab === 'mine' && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
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
              Draft / in-review
            </FilterChip>
          </div>
        )}

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

        {/* Empty all-datasets state */}
        {!datasetsQuery.isLoading &&
          !datasetsQuery.isError &&
          datasetsQuery.data &&
          datasetsQuery.data.datasets.length === 0 && (
            <div className="rounded-lg border border-dashed border-border-subtle bg-white p-12 text-center">
              <h3 className="text-[16px] font-bold text-brand-navy mb-1">
                {isAllScope
                  ? 'No in-review datasets cloud-wide'
                  : 'No datasets yet in your workspace'}
              </h3>
              <p className="text-[13.5px] text-fg-secondary max-w-md mx-auto">
                {isAllScope
                  ? 'Switch back to “My org only” for your scoped view.'
                  : 'Datasets uploaded via NDI Cloud (ndi-matlab, ndi-python, or the Data Browser) will appear here — published work, in-review submissions, and drafts.'}
              </p>
            </div>
          )}

        {/* Filtered-empty state — has datasets but the active chip filters them all out */}
        {!datasetsQuery.isLoading &&
          !datasetsQuery.isError &&
          datasetsQuery.data &&
          datasetsQuery.data.datasets.length > 0 &&
          visible.length === 0 && (
            <div className="rounded-lg border border-dashed border-border-subtle bg-white p-10 text-center">
              <p className="text-[13.5px] text-fg-secondary">
                No datasets match the&nbsp;
                <strong className="text-brand-navy font-semibold">
                  {statusFilter}
                </strong>
                &nbsp;filter.
              </p>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="mt-2 text-[12.5px] text-fg-link hover:underline underline-offset-2"
              >
                Show all
              </button>
            </div>
          )}

        {/* Cards or table */}
        {!datasetsQuery.isLoading &&
          !datasetsQuery.isError &&
          visible.length > 0 &&
          (viewMode === 'grid' ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((d) => (
                <DatasetCard
                  key={d.id}
                  dataset={d}
                  hrefBuilder={workspaceHrefBuilder}
                />
              ))}
            </div>
          ) : (
            <MyDatasetsTable
              datasets={visible}
              hrefBuilder={workspaceHrefBuilder}
            />
          ))}
      </section>
    </>
  );
}

/* ─── Tab buttons (top of body) ──────────────────────────────────── */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ndi-teal',
        active
          ? 'border-ndi-teal text-ndi-teal'
          : 'border-transparent text-fg-secondary hover:text-brand-navy',
      )}
    >
      {children}
    </button>
  );
}

/* ─── HeroStat (glassmorphic stat card) ──────────────────────────── */

function HeroStat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div
      className="rounded-lg border border-white/10 p-4"
      style={{ background: 'rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.1em] uppercase text-white/55 mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-display font-bold text-[24px] tracking-tight leading-none text-white mb-1">
        {value}
      </div>
      {hint && (
        <div className="text-[11.5px] text-white/65 font-mono">{hint}</div>
      )}
    </div>
  );
}

/* ─── Status filter chips ────────────────────────────────────────── */

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
        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-all',
        active
          ? 'bg-ndi-teal-light border-ndi-teal-border text-ndi-teal font-semibold'
          : 'bg-white border-border-subtle text-fg-secondary hover:border-border-strong',
      )}
    >
      <span>{children}</span>
      <span
        className={cn(
          'font-mono text-[11px] px-1.5 py-0 rounded-full',
          active ? 'bg-white/70' : 'bg-bg-muted',
        )}
      >
        {count}
      </span>
    </button>
  );
}

/* ─── Admin scope toggle ─────────────────────────────────────────── */

function ScopeToggle({
  value,
  onChange,
}: {
  value: MyScope;
  onChange: (next: MyScope) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Dataset scope"
      className="inline-flex items-center rounded-full border border-white/15 overflow-hidden text-[12.5px] shrink-0"
      data-testid="my-scope-toggle"
      style={{ background: 'rgba(255,255,255,0.06)' }}
    >
      <ScopeToggleButton
        active={value === 'mine'}
        onClick={() => onChange('mine')}
      >
        My org only
      </ScopeToggleButton>
      <ScopeToggleButton
        active={value === 'all'}
        onClick={() => onChange('all')}
      >
        All orgs
      </ScopeToggleButton>
    </div>
  );
}

function ScopeToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'px-3.5 py-1.5 font-medium transition-colors',
        active ? 'bg-white text-brand-navy' : 'text-white/75 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

/* ─── View mode toggle (grid / table) ───────────────────────────── */

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex items-center gap-0 rounded-md border border-border-subtle overflow-hidden bg-white"
      data-testid="view-toggle"
    >
      <ViewToggleButton
        active={value === 'grid'}
        onClick={() => onChange('grid')}
        label="Grid view"
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
      </ViewToggleButton>
      <ViewToggleButton
        active={value === 'table'}
        onClick={() => onChange('table')}
        label="Table view"
      >
        <List className="h-3.5 w-3.5" aria-hidden />
      </ViewToggleButton>
    </div>
  );
}

function ViewToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center px-2.5 py-1.5 transition-colors',
        active
          ? 'bg-bg-muted text-brand-navy'
          : 'text-fg-muted hover:text-brand-navy hover:bg-bg-muted/60',
      )}
    >
      {children}
    </button>
  );
}
