/**
 * Per-class table loading skeleton.
 *
 * Fires on tab-switch INTO a Summary-tables sub-tab (subject, element,
 * element_epoch, treatment, probe_location, openminds_subject, combined,
 * ontology). Lives at the leaf so the layout chrome (hero + tab bar)
 * stays mounted and only the body slot swaps.
 *
 * Shape mirrors `<TableShell>`'s post-load layout:
 *
 *   - per-class sub-nav row at the top (chip-strip)
 *   - filter / search row
 *   - table header row
 *   - ~12 body rows
 *
 * The placeholder atoms are intentionally close to the eventual
 * geometry so the swap from skeleton → real table is a near-zero
 * layout shift.
 */
import { Skeleton } from '@/components/ui/Skeleton';

// Mixed widths approximate the real chip nav (Subjects / Elements /
// Epochs / Treatments / Probe locations / OpenMINDS subjects /
// Combined / Ontology) so the swap to the rendered nav is a near-zero
// layout shift. Tailwind arbitrary widths so the JIT picks them up.
const CHIP_WIDTH_CLASSES = [
  'w-[70px]',
  'w-[76px]',
  'w-[64px]',
  'w-[92px]',
  'w-[110px]',
  'w-[130px]',
  'w-[80px]',
  'w-[76px]',
];

export default function TablesLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading summary table">
      {/* Sub-nav chip strip — same layout as the rendered nav. */}
      <div className="flex flex-wrap gap-1.5 border-b border-border-subtle pb-3">
        {CHIP_WIDTH_CLASSES.map((wClass, i) => (
          <Skeleton key={i} className={`h-6 rounded-md ${wClass}`} />
        ))}
      </div>

      {/* Filter + view-controls row. */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-72" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Table header + 12 rows. Heights match SummaryTableView atoms. */}
      <div className="rounded-md border border-border-subtle overflow-hidden">
        <Skeleton className="h-9 w-full rounded-none" />
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}
