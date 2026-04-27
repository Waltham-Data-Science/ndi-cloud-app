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
 * The `ontology` and `combined` tabs each have a dedicated server endpoint
 * with a different response shape; for now they fall back to the standard
 * single-class fetch. Ontology-table-specific UI (per-row variableNames /
 * docIds) is a follow-up.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { cn } from '@/lib/cn';
import { useSummaryTable } from '@/lib/api/tables';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { SummaryTableView } from '@/components/app/SummaryTableView';
import { OntologyTablesView } from '@/components/app/OntologyTablesView';

const COMMON_CLASSES = [
  { id: 'subject', label: 'Subjects' },
  { id: 'element', label: 'Elements' },
  { id: 'element_epoch', label: 'Epochs' },
  { id: 'treatment', label: 'Treatments' },
  { id: 'probe_location', label: 'Probe locations' },
  { id: 'openminds_subject', label: 'OpenMINDS subjects' },
  { id: 'combined', label: 'Combined' },
  { id: 'ontology', label: 'Ontology' },
] as const;

export function TableShell({
  datasetId,
  className: activeClass,
}: {
  datasetId: string;
  className: string;
}) {
  return (
    <div className="space-y-4">
      <nav
        aria-label="Table classes"
        className="flex flex-wrap gap-1.5 border-b border-border-subtle pb-3"
      >
        {COMMON_CLASSES.map((c) => {
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
 * Per-class accessor for the row's primary document identifier. The
 * cloud's table rows expose multiple `*DocumentIdentifier` fields (one
 * per related class), so a generic "find any DocumentIdentifier" lookup
 * would pick the wrong column. This map encodes the **primary**
 * document the row represents — clicking a subject row should open the
 * subject's document, not the session it links to.
 *
 * `element` maps to `probeDocumentIdentifier` because the backend
 * renamed the URL slug to "element" but kept the column key as
 * `probe*` (data-browser convention preserved through the rename).
 *
 * `combined` is intentionally absent — it's a multi-class join with
 * no single "primary" row, so we fall back to non-clickable rows.
 * `ontology` is handled by `<OntologyTablesView>` and never reaches
 * this branch.
 */
const PRIMARY_DOC_ID_FIELD: Record<string, string | undefined> = {
  subject: 'subjectDocumentIdentifier',
  element: 'probeDocumentIdentifier',
  element_epoch: 'epochDocumentIdentifier',
  treatment: 'treatmentDocumentIdentifier',
  probe_location: 'probe_locationDocumentIdentifier',
  openminds_subject: 'subjectDocumentIdentifier',
};

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
  // The `*DocumentIdentifier` cell value IS the ndiId — the cloud's
  // detail endpoint resolves either Mongo `_id` or ndiId, so we don't
  // need a separate ID lookup. Smoke-test feedback explicitly called
  // out non-clickable rows as a regression vs the data-browser SPA;
  // this restores parity for every grain whose primary key is
  // unambiguous (see PRIMARY_DOC_ID_FIELD).
  const onRowClick = useCallback(
    (row: Record<string, unknown>) => {
      const accessor = PRIMARY_DOC_ID_FIELD[className];
      if (!accessor) return;
      const id = row[accessor];
      if (typeof id !== 'string' || id.length === 0) return;
      // Honor in-progress text selection — users frequently highlight
      // an ID to copy. Same defensive pattern as DocumentExplorer's
      // row click handler.
      const sel = typeof window !== 'undefined' ? window.getSelection?.() : null;
      if (sel && sel.toString().length > 0) return;
      router.push(`/datasets/${datasetId}/documents/${encodeURIComponent(id)}`);
    },
    [router, datasetId, className],
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
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-red-700">
            Failed to load <span className="font-mono">{className}</span> table.
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
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-fg-secondary">
            No <span className="font-mono">{className}</span> rows in this dataset.
          </p>
          <p className="text-xs text-fg-muted mt-2 italic">
            The table endpoint returned 0 rows. Try a different class or
            confirm this dataset publishes the {className} grain.
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
      onRowClick={PRIMARY_DOC_ID_FIELD[className] ? onRowClick : undefined}
    />
  );
}
