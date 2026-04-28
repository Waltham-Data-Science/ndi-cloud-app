/**
 * Overview tab loading skeleton.
 *
 * Fires on tab-switch INTO `/datasets/[id]/overview`. Lives at the leaf
 * so the layout chrome (hero + tab bar) stays mounted and only the
 * body slot swaps. Shape mirrors `<OverviewContent>`'s lg-and-up
 * two-column grid (1fr main + 360px aside).
 */
import { Skeleton } from '@/components/ui/Skeleton';

export default function OverviewLoading() {
  return (
    <div
      className="grid gap-5 lg:grid-cols-[1fr_360px]"
      aria-busy="true"
      aria-label="Loading dataset overview"
    >
      {/* Main column — abstract / summary card. */}
      <div className="space-y-4 min-w-0">
        <div className="space-y-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-40 w-full rounded-md" />
        <div className="space-y-2 pt-2">
          <Skeleton className="h-5 w-1/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>

      {/* Aside — counts cards. */}
      <aside className="space-y-3">
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
      </aside>
    </div>
  );
}
