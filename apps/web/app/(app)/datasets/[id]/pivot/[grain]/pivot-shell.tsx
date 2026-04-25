'use client';

/**
 * Pivot tab content shell — `/datasets/[id]/pivot/[grain]`.
 *
 * Phase 6.5b (cross-repo unification): the structural shell that landed
 * with Phase 3b is now backed by the real ported `PivotView` component
 * (Plan B B6e grain-selectable pivot — virtualized table + auto-populated
 * grain selector + feature-flag-aware disabled state).
 *
 * Two responsibilities:
 *
 *   1. Render the per-grain sub-nav (Per subject / Per session / Per
 *      element). Active grain reflected via `aria-current="page"` +
 *      styling. The data-browser source kept the selector inside the
 *      pivot card; here we expose it as a URL-routed sub-nav too so
 *      the tab interactions match `/datasets/[id]/tables/[className]`.
 *      Both work — clicking a sub-nav link or selecting from the inline
 *      `<select>` route to the same destination.
 *   2. Mount `<PivotView datasetId grain>` for the active grain.
 *
 * Grain coercion: the URL segment is `string`; PivotView expects the
 * narrower `PivotGrain` enum. Anything not in the supported set
 * (subject / session / element) coerces to `subject` — same fallback
 * as the data-browser source's `coerceGrain()`.
 */
import Link from 'next/link';

import { cn } from '@/lib/cn';
import { PivotView } from '@/components/app/PivotView';
import type { PivotGrain } from '@/lib/api/datasets';

const GRAINS = [
  { id: 'subject' as const, label: 'Per subject' },
  { id: 'session' as const, label: 'Per session' },
  { id: 'element' as const, label: 'Per element' },
] as const;

function coerceGrain(raw: string): PivotGrain {
  if (raw === 'session' || raw === 'element' || raw === 'subject') return raw;
  return 'subject';
}

export function PivotShell({
  datasetId,
  grain: rawGrain,
}: {
  datasetId: string;
  grain: string;
}) {
  const activeGrain = coerceGrain(rawGrain);
  return (
    <div className="space-y-4">
      <nav
        aria-label="Pivot grain"
        className="flex flex-wrap gap-1.5 border-b border-border-subtle pb-3"
      >
        {GRAINS.map((g) => {
          const isActive = g.id === activeGrain;
          return (
            <Link
              key={g.id}
              href={`/datasets/${datasetId}/pivot/${g.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ndi-teal',
                isActive
                  ? 'bg-ndi-teal-light text-ndi-teal ring-1 ring-inset ring-ndi-teal-border'
                  : 'text-fg-secondary hover:bg-bg-muted hover:text-brand-navy',
              )}
            >
              {g.label}
            </Link>
          );
        })}
      </nav>

      <PivotView datasetId={datasetId} grain={activeGrain} />
    </div>
  );
}
