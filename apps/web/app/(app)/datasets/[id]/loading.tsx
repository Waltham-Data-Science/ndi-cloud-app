/**
 * Dataset detail loading placeholder.
 *
 * Audit 2026-04-27 finding #1: clicking a catalog card looked frozen
 * for ~5 s before the URL changed and the page painted. Cause: the
 * sibling `layout.tsx` does an `await Promise.race([prefetchAll,
 * deadline])` against a 3 s deadline, and on cold-cache visits the
 * RSC stream itself adds another second or two on top — so the user
 * gets no visual change at all between click and h1 paint.
 *
 * The fix is structural, not algorithmic: Next.js renders the closest
 * `loading.tsx` IMMEDIATELY when navigation begins, then swaps in the
 * real layout/page once the suspended segment finishes. Adding this
 * file at the same level as the suspending layout means the hero +
 * tab-bar shell paints within one frame of the click, and the tab
 * body fills in as the prefetch resolves.
 *
 * Server-rendered (no `'use client'`). The skeleton primitives below
 * are presentational client islands but the surrounding layout + the
 * gradient hero + the tab labels render from the server, so the
 * paint is as cheap as it can be.
 *
 * Design choices:
 *
 *   - **Mirror the real chrome verbatim** — same gradient, same max-
 *     width, same px-7 py-10 padding, same back-link slot — so the
 *     visual transition from loading → loaded is a swap of placeholder
 *     atoms for real atoms inside an unchanged frame. No layout shift.
 *   - **Tab labels are real strings, not skeletons** — the tab bar is
 *     URL-routed and the labels never depend on data. Showing real
 *     labels (vs grey bars) tells the user "the page is here, the
 *     content is loading" rather than "everything is loading."
 *   - **Body skeleton is overview-shaped** (the most-common landing
 *     route for catalog clicks). Tables/Documents/Pivot pages are
 *     reached via tab clicks WITHIN the dataset chrome, where the
 *     layout is already mounted — they don't trip this loading.tsx.
 */
import { LayoutDashboard, Table2, FolderOpen } from 'lucide-react';

import { Skeleton } from '@/components/ui/Skeleton';

export default function DatasetDetailLoading() {
  return (
    <>
      {/* Hero shell — gradient, max-width, padding all mirror
          DatasetDetailHero exactly so the transition is invisible. */}
      <section
        className="relative overflow-hidden text-white"
        style={{ background: 'var(--grad-depth)' }}
        aria-busy="true"
        aria-label="Loading dataset"
      >
        <div className="relative mx-auto max-w-[1200px] px-7 py-10">
          {/* Back link slot — fixed string, not a skeleton. */}
          <span className="inline-flex items-center gap-1 text-[12.5px] text-white/70 mb-3">
            ‹ Back to Data Commons
          </span>
          <div className="space-y-3">
            <Skeleton className="h-7 w-2/3 bg-white/15" />
            <Skeleton className="h-4 w-1/3 bg-white/10" />
            <div className="flex gap-3 pt-2">
              <Skeleton className="h-6 w-20 bg-white/15" />
              <Skeleton className="h-6 w-24 bg-white/10" />
              <Skeleton className="h-6 w-20 bg-white/10" />
            </div>
          </div>
        </div>
      </section>

      {/* Tab-bar shell — show the real labels (URL-routed, data-
          independent) so the user can see they're on dataset detail
          while the body fetches. Visually inert (no link semantics)
          since this is the loading state. */}
      <div
        className="border-b border-border-subtle bg-bg-surface"
        aria-hidden="true"
      >
        <div className="mx-auto max-w-[1200px] px-7">
          <div className="flex gap-6 text-[14px] font-medium text-fg-muted">
            <span className="inline-flex items-center gap-2 py-3 border-b-2 border-transparent">
              <LayoutDashboard className="h-4 w-4" /> Overview
            </span>
            <span className="inline-flex items-center gap-2 py-3 border-b-2 border-transparent">
              <Table2 className="h-4 w-4" /> Summary tables
            </span>
            <span className="inline-flex items-center gap-2 py-3 border-b-2 border-transparent">
              <FolderOpen className="h-4 w-4" /> Documents
            </span>
          </div>
        </div>
      </div>

      {/* Body skeleton — overview-shaped (the default tab) since
          catalog clicks land here. */}
      <section className="mx-auto max-w-[1200px] px-7 py-7 min-w-0">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-3">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="pt-4">
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </section>
    </>
  );
}
