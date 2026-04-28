/**
 * Dataset detail loading placeholder.
 *
 * Audit 2026-04-27 finding #1: clicking a catalog card looked frozen
 * for ~5 s before the URL changed and the page painted. Cause: the
 * sibling `layout.tsx` previously did an `await Promise.race(...)`
 * against a 3 s deadline, and on cold-cache visits the RSC stream
 * itself adds another second or two on top — so the user got no
 * visual change at all between click and h1 paint.
 *
 * The fix is structural, not algorithmic: Next.js renders the closest
 * `loading.tsx` IMMEDIATELY when navigation begins, then swaps in the
 * real layout/page once the suspended segment finishes.
 *
 * # Scope: BODY-ONLY
 *
 * Pre-fix this file rendered its own hero + tab bar + constrained
 * `<section>` wrapper, which on tab switches DUPLICATED the chrome
 * the layout was already painting (visible in the user-reported tab-
 * switch screenshot: real hero + tabs at top, then a nested skeleton
 * hero + skeleton tabs + skeleton body underneath). Architectural
 * cause: `[id]/layout.tsx` wraps `children` in
 * `<DatasetDetailChromeGate>`, which renders the hero + `<DatasetTabs>`
 * + a `mx-auto max-w-[1200px] px-7 py-7` section AROUND the page
 * children. The Suspense boundary lives INSIDE that section, so
 * `loading.tsx` only ever fills the body slot — repeating the chrome
 * here painted it twice.
 *
 * This loading state therefore renders ONLY a body skeleton; the
 * hero + tabs come from the (already-mounted) layout and stay put
 * across tab switches.
 *
 * Per-leaf `loading.tsx` files (e.g. `tables/[className]/loading.tsx`,
 * `documents/loading.tsx`) take precedence and render shape-matching
 * skeletons for each tab; this top-level fallback is the catalog →
 * dataset-detail landing skeleton + a safety net for any leaf that
 * didn't ship its own.
 */
import { Skeleton } from '@/components/ui/Skeleton';

export default function DatasetDetailLoading() {
  return (
    <div className="grid gap-6 md:grid-cols-3" aria-busy="true" aria-label="Loading dataset overview">
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
  );
}
