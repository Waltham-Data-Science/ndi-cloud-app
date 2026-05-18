/**
 * Document-explorer loading skeleton.
 *
 * Fires on tab-switch INTO `/datasets/[id]/documents`. Lives at the
 * leaf so the layout chrome (hero + tab bar) stays mounted and only
 * the body slot swaps.
 *
 * Shape mirrors `<DocumentExplorer>`'s post-load layout: the lg-and-
 * up two-column grid (sidebar 260px + table 1fr). Below `lg:` the
 * sidebar collapses (matches the live layout's behavior so there's
 * no layout shift on either viewport).
 */
import { Skeleton } from '@/components/ui/Skeleton';

export default function DocumentsLoading() {
  return (
    // Breakpoint sync: live `<DocumentExplorer>` (DocumentExplorer.tsx
    // ~198) switches to side-by-side at `md:` (768px), not `lg:`
    // (1024px) — the skeleton must match so the layout doesn't reflow
    // when the data lands on tablet widths.
    <div
      className="grid gap-4 md:grid-cols-[260px_1fr]"
      aria-busy="true"
      aria-label="Loading document explorer"
    >
      {/* Sidebar: class filter list. */}
      <aside className="space-y-2 hidden md:block">
        <Skeleton className="h-5 w-32" />
        <div className="space-y-1.5 pt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))}
        </div>
      </aside>

      {/* Right column: search/filter + table. */}
      <div className="space-y-3 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="rounded-md border border-border-subtle overflow-hidden">
          <Skeleton className="h-9 w-full rounded-none" />
          <div className="divide-y divide-border-subtle">
            {Array.from({ length: 14 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-none" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
