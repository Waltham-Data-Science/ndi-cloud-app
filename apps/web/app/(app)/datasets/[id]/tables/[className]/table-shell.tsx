'use client';

/**
 * Summary tables tab content — `/datasets/[id]/tables/[className]`.
 *
 * Phase 6.5a (cross-repo unification): the structural shell that landed
 * with Phase 3b is now backed by the real ported `SummaryTableView`
 * component (fully-featured: filter + sort + column-toggle + virtualized
 * rows + ontology popovers + CSV/XLS/JSON export + B6a canonical-column
 * defaults for subject/probe/epoch grains).
 *
 * Two responsibilities:
 *
 *   1. Render the per-class sub-nav (subject / element / element_epoch /
 *      treatment / probe_location / openminds_subject / combined / ontology)
 *      so the URL contract matches the data-browser. Each tab is a `<Link>`;
 *      the active class is reflected in styling + `aria-current="page"`.
 *   2. Fetch the table for the active class via `useSummaryTable` (which
 *      hits `/api/datasets/:id/tables/:className`). Loading → Skeleton.
 *      Error → ErrorState. Success → `<SummaryTableView>`.
 *
 * **2026-04-28 — empty-class hiding (parity with v2's TableSelector).**
 * Previously every per-class tab was always rendered, including grains
 * the dataset doesn't publish (e.g. Monmita Bhar's C. elegans dataset has
 * no probes/elements/epochs but the tabs still showed up, leading users
 * to dead empty-state cards). The tab list is now driven by the per-class
 * doc counts from `/api/datasets/:id/class-counts`:
 *
 *   - Per-class tabs (subject, element, element_epoch, treatment,
 *     probe_location, openminds_subject) hide when count === 0.
 *   - `combined` and `ontology` are ALWAYS visible (combined joins the
 *     visible per-class grains; ontology has its own data shape and is
 *     the only place ontology rows surface). This matches v2 exactly.
 *   - While class-counts is still fetching we render the full set so
 *     there's no flicker; once counts arrive, empty tabs disappear.
 *
 * The `ontology` and `combined` tabs each have a dedicated server endpoint
 * with a different response shape; for now they fall back to the standard
 * single-class fetch. Ontology-table-specific UI (per-row variableNames /
 * docIds) is a follow-up.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { cn } from '@/lib/cn';
import { ApiError } from '@/lib/api/client';
import { useClassCounts } from '@/lib/api/datasets';
import { useSummaryTable } from '@/lib/api/tables';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { SummaryTableView } from '@/components/app/SummaryTableView';
import { OntologyTablesView } from '@/components/app/OntologyTablesView';

// 2026-04-28 — `Ontology` tab renamed to `Mappings` (team review
// feedback). The previous label described the data type; the new
// label describes what the user sees inside — a list of column
// names mapped to controlled-vocabulary ontology nodes. Reviewer:
// "Need to come up with a better name for the summary table called
// ontology." The route slug stays `/tables/ontology` (URL backwards-
// compat); only the visible label changes.
const COMMON_CLASSES = [
  { id: 'subject', label: 'Subjects' },
  { id: 'element', label: 'Elements' },
  { id: 'element_epoch', label: 'Epochs' },
  { id: 'treatment', label: 'Treatments' },
  { id: 'probe_location', label: 'Probe locations' },
  { id: 'openminds_subject', label: 'OpenMINDS subjects' },
  { id: 'combined', label: 'Combined' },
  { id: 'ontology', label: 'Mappings' },
] as const;

/**
 * Tabs that bypass the count-driven hide rule. `combined` is a join over
 * whichever per-class grains DO exist on the dataset (still useful when
 * only some classes are populated). `ontology` lives in its own endpoint
 * with its own response shape (groups, not rows) and is never reflected
 * in `/class-counts`, so we never hide it.
 */
const ALWAYS_VISIBLE_CLASSES = new Set(['combined', 'ontology']);

/**
 * Pretty per-class label for the empty-state copy. The URL slug is
 * the source of truth (`subject`, `element`, `treatment`...) but it's
 * jargon when shown to a user — render the friendlier label from the
 * sub-nav config instead.
 */
const CLASS_LABELS: Record<string, string> = COMMON_CLASSES.reduce(
  (acc, c) => {
    acc[c.id] = c.label.toLowerCase();
    return acc;
  },
  {} as Record<string, string>,
);

export function TableShell({
  datasetId,
  className: activeClass,
}: {
  datasetId: string;
  className: string;
}) {
  // Per-class doc counts drive the empty-tab hide. While counts are
  // pending we render the full nav (no flicker); once counts arrive
  // the empty tabs drop. If the call errors we keep the full nav too,
  // since hiding tabs based on a failed count fetch would be worse
  // than leaving them and letting the per-tab empty state speak.
  const { data: countsResp } = useClassCounts(datasetId);
  const visibleClasses = useMemo(() => {
    if (!countsResp) return COMMON_CLASSES;
    return COMMON_CLASSES.filter((c) => {
      if (ALWAYS_VISIBLE_CLASSES.has(c.id)) return true;
      // The count for `element` is occasionally keyed `probe` server-
      // side (legacy column name kept after the slug rename); accept
      // either to avoid a false-empty drop on the Elements tab.
      const count =
        c.id === 'element'
          ? countsResp.classCounts.element ?? countsResp.classCounts.probe ?? 0
          : c.id === 'element_epoch'
            ? countsResp.classCounts.element_epoch ?? countsResp.classCounts.epoch ?? 0
            : countsResp.classCounts[c.id] ?? 0;
      return count > 0;
    });
  }, [countsResp]);

  return (
    <div className="space-y-4">
      <nav
        aria-label="Table classes"
        className="flex flex-wrap gap-1.5 border-b border-border-subtle pb-3"
      >
        {visibleClasses.map((c) => {
          const isActive = c.id === activeClass;
          return (
            <Link
              key={c.id}
              href={`/datasets/${datasetId}/tables/${c.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ndi-teal',
                isActive
                  ? 'bg-ndi-teal-light text-ndi-teal ring-1 ring-inset ring-ndi-teal-border'
                  : 'text-fg-secondary hover:bg-bg-muted hover:text-brand-navy',
              )}
            >
              {c.label}
            </Link>
          );
        })}
      </nav>

      <TableContent datasetId={datasetId} className={activeClass} />
    </div>
  );
}

/**
 * Dispatch component — picks the right fetch+render branch for the
 * active class. The `ontology` class has a different response shape
 * (`{groups: OntologyTableGroup[]}`) so it routes to a dedicated
 * `<OntologyTablesView>` (which calls its own `useOntologyTables`
 * hook). All other classes (including `combined`, same envelope as
 * `subject`/`element`/etc., just a different URL) use the standard
 * `<StandardTableContent>` below, which calls `useSummaryTable`.
 *
 * Splitting the two branches into separate components keeps both
 * subtrees compliant with React hooks rules — each function calls its
 * own hooks unconditionally, and the dispatcher just routes between
 * them by class.
 */
function TableContent({
  datasetId,
  className,
}: {
  datasetId: string;
  className: string;
}) {
  if (className === 'ontology') {
    return <OntologyTablesView datasetId={datasetId} />;
  }
  return <StandardTableContent datasetId={datasetId} className={className} />;
}

/**
 * Pick the row's "primary document" identifier for click-through.
 * Ported verbatim from v2's `frontend/src/pages/TableTab.tsx::pickDocId`.
 *
 * Different classes carry the row identity under different field names:
 *
 *   - subject / openminds_subject  → `subjectDocumentIdentifier`
 *   - element (legacy: probe)      → `probeDocumentIdentifier`
 *   - element_epoch (legacy: epoch)→ `epochDocumentIdentifier`
 *   - treatment / probe_location   → carry their own `*DocumentIdentifier`
 *   - combined join rows           → mix of the three above
 *   - older synth rows             → bare `subjectId` / `probeId` / `id`
 *   - generic fallback             → `documentIdentifier`
 *
 * Trying a fixed per-class mapping (the new repo's pre-fix behavior)
 * dropped clicks for OpenMINDS subject rows on datasets where the
 * cloud emitted `documentIdentifier` rather than the strongly-typed
 * `subjectDocumentIdentifier`. The fallback chain — same order as the
 * data-browser SPA — finds *any* identifier the row exposes, so every
 * clickable grain (including `combined`) lights up.
 *
 * Returning `undefined` means "no usable id on this row"; the caller
 * silently no-ops. `ontology` rows go through `<OntologyTablesView>`
 * and never reach this helper.
 */
function pickDocId(row: Record<string, unknown>): string | undefined {
  const candidates = [
    row.subjectDocumentIdentifier,
    row.probeDocumentIdentifier,
    row.epochDocumentIdentifier,
    row.treatmentDocumentIdentifier,
    row.probe_locationDocumentIdentifier,
    row.subjectId,
    row.probeId,
    row.epochId,
    row.documentIdentifier,
    row.id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return undefined;
}

/**
 * Standard fetch + view for every class except `ontology`. Calls
 * `useSummaryTable(datasetId, className)` for the per-class table —
 * `combined` lands here too (same envelope, different URL).
 */
function StandardTableContent({
  datasetId,
  className,
}: {
  datasetId: string;
  className: string;
}) {
  const query = useSummaryTable(datasetId, className);
  const router = useRouter();

  // Wire row-click navigation to `/datasets/[id]/documents/[ndiId]`.
  // Any `*DocumentIdentifier` cell value IS the ndiId — the cloud's
  // detail endpoint resolves either Mongo `_id` or ndiId, so we don't
  // need a separate ID lookup. The pickDocId() helper walks the
  // fallback chain so OpenMINDS rows (and combined-join rows) light
  // up regardless of which identifier field the cloud surfaces.
  const onRowClick = useCallback(
    (row: Record<string, unknown>) => {
      const id = pickDocId(row);
      if (!id) return;
      // Honor in-progress text selection — users frequently highlight
      // an ID to copy. Same defensive pattern as DocumentExplorer's
      // row click handler.
      const sel = typeof window !== 'undefined' ? window.getSelection?.() : null;
      if (sel && sel.toString().length > 0) return;
      router.push(`/datasets/${datasetId}/documents/${encodeURIComponent(id)}`);
    },
    [router, datasetId],
  );

  if (query.isPending) {
    return (
      <Card>
        <CardBody>
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        </CardBody>
      </Card>
    );
  }

  if (query.isError) {
    // Audit 2026-04-27 #6 — distinguish 404 ("dataset doesn't have
    // any rows of this class") from a true server error. The
    // backend returns 404 for "no rows" cases (most datasets don't
    // have treatments, openminds_subject, or probe_location); the
    // pre-fix UI rendered "Failed to load" + "Something went wrong"
    // alarm copy for what is really an empty state. Cross-reference
    // ApiError.status: 404 is empty, anything else is real failure.
    const friendlyName = CLASS_LABELS[className] ?? className;
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <Card>
          <CardBody>
            <p className="text-sm text-fg-secondary">
              No <span className="font-mono">{friendlyName}</span> rows in this dataset.
            </p>
            <p className="text-xs text-fg-muted mt-2">
              This dataset doesn&rsquo;t publish the {friendlyName} grain.
              Try another tab.
            </p>
          </CardBody>
        </Card>
      );
    }
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-red-700">
            Couldn&rsquo;t load the <span className="font-mono">{friendlyName}</span>{' '}
            table — please retry.
          </p>
          <p className="text-xs text-fg-muted mt-2 font-mono">
            {query.error instanceof Error ? query.error.message : String(query.error)}
          </p>
        </CardBody>
      </Card>
    );
  }

  const data = query.data;
  if (!data || data.rows.length === 0) {
    const friendlyName = CLASS_LABELS[className] ?? className;
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-fg-secondary">
            No <span className="font-mono">{friendlyName}</span> rows in this dataset.
          </p>
          <p className="text-xs text-fg-muted mt-2 italic">
            The table endpoint returned 0 rows. Try a different class or
            confirm this dataset publishes the {friendlyName} grain.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <SummaryTableView
      data={data}
      tableType={className}
      title={`${datasetId}-${className}`}
      datasetId={datasetId}
      onRowClick={onRowClick}
    />
  );
}
