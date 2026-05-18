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
import {
  useDocumentsInfinite,
  type DocumentSummary,
} from '@/lib/api/documents';
import { useSummaryTable, type TableResponse } from '@/lib/api/tables';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { SummaryTableView } from '@/components/app/SummaryTableView';
import { OntologyTablesView } from '@/components/app/OntologyTablesView';
import { OpenmindsSubjectTableView } from '@/components/app/OpenmindsSubjectTableView';

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
 * Tabs that bypass the count-driven hide rule. `ontology` lives in its
 * own endpoint with its own response shape (groups, not rows) and is
 * never reflected in `/class-counts`, so we never hide it.
 *
 * 2026-04-28 — `combined` removed from this set (team review feedback).
 * The combined table's backend builder iterates over `element_epochs`,
 * so for behavioral C. elegans datasets (bhar, haley) which have
 * subjects + treatments but no probes/elements/epochs, the table is
 * always empty. Reviewer: "What is the combined summary table supposed
 * to show? I only see empty tables." Now we gate combined on
 * `element_epoch > 0` (or its legacy alias `epoch`) — the same data
 * that powers the table — so it stops appearing for datasets where
 * the join would produce zero rows.
 */
const ALWAYS_VISIBLE_CLASSES = new Set(['ontology']);

/**
 * Tabs that are NEVER rendered in the default sub-tab strip — even when
 * the dataset has rows for them. The route slugs still resolve (so old
 * bookmarks like `/datasets/<id>/tables/treatment` continue to work and
 * the corresponding view renders), but they're omitted from the visible
 * tab list so they don't compete with the primary grains.
 *
 * Team review round-2 feedback: "I don't think we need treatment or
 * openminds subject tables. They are redundant with the subject
 * summary." (Treatment columns are per-subject-joined onto the
 * Subjects tab server-side via backend's F-1b broadcast in
 * `_broadcast_treatments_onto_subjects` — so the standalone
 * Treatments tab no longer adds information; OpenMINDS Subjects has
 * the same identifying fields the regular Subjects tab carries.) "The
 * combined table doesn't seem to have anything meaningful in it. Maybe
 * drop for now?" (Combined is the Cartesian-style join across grains;
 * with treatments now folded into Subjects, the join produces little
 * the per-class tabs don't already show.)
 *
 * Routes intentionally retained:
 *   - `/datasets/[id]/tables/treatment` (TableContent dispatches here)
 *   - `/datasets/[id]/tables/openminds_subject`
 *     (`<OpenmindsSubjectTableView>`)
 *   - `/datasets/[id]/tables/combined`
 *     (standard projection, same envelope as subject/element/etc.)
 *
 * If a future review wants any of these promoted back into the default
 * strip, drop the class id from this set.
 */
const HIDDEN_DEFAULT_TABS = new Set([
  'treatment',
  'openminds_subject',
  'combined',
]);

/**
 * Page size for the openminds_subject documents fetch that backs the
 * per-subject strain-name join (round-3 fix). 200 is the FastAPI
 * validator's hard ceiling on `/api/datasets/:id/documents?pageSize=...`
 * — `OpenmindsSubjectTableView` uses the same value for the same reason.
 * `useDocumentsInfinite` will stream additional pages until the total
 * is reached, so very large openminds_subject sets (Haley's 9k+) still
 * arrive — they just take more round-trips. The strain-name join
 * applies progressively as each page lands.
 */
const OPENMINDS_SUBJECT_PAGE_SIZE = 200;

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
  //
  // 2026-04-28 (round 2) — `HIDDEN_DEFAULT_TABS` (treatment,
  // openminds_subject, combined) are now filtered out unconditionally
  // for the default strip per team review feedback. Exception: when
  // the user has navigated directly to one of those slugs (e.g. via
  // a saved bookmark), we surface the active tab in the strip so they
  // know where they are. The route + view continue to render.
  const { data: countsResp } = useClassCounts(datasetId);
  const visibleClasses = useMemo(() => {
    const baseList = COMMON_CLASSES.filter((c) => {
      // Always keep the active tab in the strip — including hidden
      // defaults the user landed on via direct URL — so the active
      // state has a visible target.
      if (c.id === activeClass) return true;
      return !HIDDEN_DEFAULT_TABS.has(c.id);
    });
    if (!countsResp) return baseList;
    return baseList.filter((c) => {
      if (ALWAYS_VISIBLE_CLASSES.has(c.id)) return true;
      // Keep the active class regardless of count (so the active
      // ring renders and the user can navigate away from an empty
      // tab they bookmarked).
      if (c.id === activeClass) return true;
      // The count for `element` is occasionally keyed `probe` server-
      // side (legacy column name kept after the slug rename); accept
      // either to avoid a false-empty drop on the Elements tab.
      // `combined` gates on the element_epoch count (the iterable the
      // backend builds the join from) — see the ALWAYS_VISIBLE_CLASSES
      // comment above.
      const count =
        c.id === 'element'
          ? countsResp.classCounts.element ?? countsResp.classCounts.probe ?? 0
          : c.id === 'element_epoch' || c.id === 'combined'
            ? countsResp.classCounts.element_epoch ?? countsResp.classCounts.epoch ?? 0
            : countsResp.classCounts[c.id] ?? 0;
      return count > 0;
    });
  }, [countsResp, activeClass]);

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
 * active class. Two non-standard classes have dedicated branches:
 *
 *   - `ontology` — different response shape
 *     (`{groups: OntologyTableGroup[]}`); routes to `<OntologyTablesView>`
 *     which calls `useOntologyTables`.
 *   - `openminds_subject` — backend's `_project_for_class` has no
 *     branch for this class, so the standard summary-table endpoint
 *     returns a near-empty 2-column projection. Routes to
 *     `<OpenmindsSubjectTableView>` which fetches the documents
 *     endpoint instead and projects rows on the frontend.
 *
 * All other classes (including `combined`, same envelope as
 * `subject`/`element`/etc., just a different URL) use the standard
 * `<StandardTableContent>` below, which calls `useSummaryTable`.
 *
 * Splitting branches into separate components keeps each subtree
 * compliant with React hooks rules — each function calls its own
 * hooks unconditionally, and the dispatcher just routes between them
 * by class.
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
  if (className === 'openminds_subject') {
    return <OpenmindsSubjectTableView datasetId={datasetId} />;
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

  // 2026-05-19 — F-1b ported to backend. `summary_table_service.py`'s
  // `_project_for_class("subject", ...)` now broadcasts per-subject
  // treatment columns server-side (one `<prefix>Name` +
  // `<prefix>Ontology` pair per distinct treatmentName). The cloud-app
  // gets the broadcast columns inline in the subject summary response;
  // no frontend join needed. See ADR-009 and
  // backend `a560a41` (subject enrichment fetches treatment_drug +
  // treatment_transfer in addition to literal treatment so subclass-
  // only datasets like Bhar get the broadcast).
  //
  // Pre-2026-05-19 history: this used to fetch the dataset's treatment
  // summary table separately and join client-side. The ~100-line
  // `joinTreatmentsToSubjects` + `pascalCaseFromTreatmentName`
  // helpers and the matching treatment query hook are removed in
  // this commit.

  // 2026-04-28 (round 3) — Strain-name lookup. The team-review feedback
  // surfaced a separate strain-display bug from the round-1 NDI-ref
  // payload: subjects whose `strainName` IS already a clean ID like
  // `WBStrain:00000001` were rendering the *ID*, not the human-readable
  // strain *name* (`N2`). The cloud's subject summary projection
  // doesn't carry the strain's `fields.name` — that lives on the
  // companion `openminds_subject` doc of type `Strain` linked back via
  // `depends_on.subject_id`. We fetch those docs progressively (cap at
  // 200/page per the FastAPI validator) and build a per-subject
  // strain-name map that's spliced onto each subject row in the
  // `enrichedData` memo below. The original ID still flows through
  // `strainOntology` (also clickable and now hyperlinked to Wormbase
  // via the URL builder + the cell renderer), so the user sees the
  // human name AND a link to the canonical provider page.
  //
  // Same `enabled`-gating story as the treatment join — only fires for
  // the subject grain so other tabs pay zero network cost. The
  // `useDocumentsInfinite` query is shared with `OpenmindsSubjectTableView`
  // (same TanStack cache key), so visiting either tab primes both.
  const openmindsDocsQuery = useDocumentsInfinite(
    className === 'subject' ? datasetId : undefined,
    className === 'subject' ? 'openminds_subject' : null,
    OPENMINDS_SUBJECT_PAGE_SIZE,
  );

  // 2026-04-28 — Subject grain row enrichment for the strain-raw-ID bug
  // (team review feedback). The `subject` summary endpoint sometimes
  // returns `strainName` as an array of `ndi://`-prefixed companion-doc
  // references rather than a human-readable label (Schema-B Strain
  // docs whose `fields.name` is itself a list of references). The
  // table's `csvJoinFormatter` then stringifies the array, producing
  // the raw `ndi://412695ff…` text the reviewer flagged. The
  // `strainOntology` sibling column DOES carry a clean `WBStrain:…`
  // value — the SummaryTableView's ontology-popover machinery
  // already lights that up as a clickable resolver chip. Best-
  // available frontend fix: when `strainName` looks like an
  // `ndi://`-only payload AND `strainOntology` has a real ontology
  // ID, swap `strainName` to the ontology ID so the cell renders the
  // resolver chip instead of the raw NDI ref. The label-resolution
  // path lives in OntologyPopover; the user-visible result is "the
  // strain cell shows a clickable WBStrain:WBStrain00027007 chip
  // that resolves to N2" instead of "the strain cell shows
  // ndi://412695ff…". Long-term, the synthesizer should resolve
  // Schema-B nested name references on the backend (a Steve task);
  // this is the unblocker today.
  // Closure reads `query.data`; the React-19 strict exhaustive-deps
  // rule wants the parent `query` reference rather than the
  // sub-property — listing `query` keeps the dep stable across
  // re-fetches that change the data identity.
  const queryData = query.data;
  const openmindsDocs = useMemo<DocumentSummary[] | undefined>(() => {
    if (className !== 'subject') return undefined;
    if (!openmindsDocsQuery.data) return undefined;
    return openmindsDocsQuery.data.pages.flatMap((p) => p.documents);
  }, [openmindsDocsQuery.data, className]);
  const enrichedData = useMemo(() => {
    if (!queryData) return queryData;
    if (className !== 'subject') return queryData;
    // First: strain-rewrite per-row (PR #129 behavior preserved).
    const strainRewritten: TableResponse = {
      ...queryData,
      rows: queryData.rows.map((r) =>
        rewriteStrainNdiRefToOntology(r as Record<string, unknown>),
      ),
    };
    // Second: replace `strainName` (currently the bare ID like
    // `WBStrain:00000001`) with the human-readable strain name from
    // the matching openminds_subject Strain doc. While the
    // openminds_subject docs are still in flight we leave the row
    // alone — the user briefly sees the ID, then it flips to the
    // human name once data lands.
    return openmindsDocs
      ? joinStrainNamesToSubjects(strainRewritten, openmindsDocs)
      : strainRewritten;
    // (Treatment broadcast columns ship inline from the backend per F-1b;
    // no client-side join needed.)
  }, [queryData, className, openmindsDocs]);

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

  const data = enrichedData;
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

/**
 * Detect whether a value is an `ndi://`-prefixed reference (single
 * string or a list of strings, all of which start with `ndi://`).
 *
 * The cloud's Schema-B Strain documents store `fields.name` as a list
 * of `ndi://` companion-doc references rather than a human-readable
 * label. The summary table's column projection passes those through
 * unchanged, and `csvJoinFormatter` then stringifies the array — the
 * user sees `ndi://412695ff44…` text, not a strain name.
 */
function isNdiRefPayload(v: unknown): boolean {
  if (Array.isArray(v)) {
    return (
      v.length > 0 &&
      v.every((x) => typeof x === 'string' && x.startsWith('ndi://'))
    );
  }
  if (typeof v === 'string') {
    return v.startsWith('ndi://');
  }
  return false;
}

/**
 * 2026-04-28 (round 3) — Per-subject strain-name join.
 *
 * The cloud's subject summary projection sometimes ships `strainName`
 * as the bare ontology ID (e.g. `WBStrain:00000001`) rather than the
 * human-readable strain name (`N2`). The team-review feedback was
 * explicit: "currently displaying as 00000001 should be displaying as
 * N2 and link to wormbase.org". The strain *name* lives on the partner
 * `openminds_subject` doc of type `Strain`, linked to the subject via
 * `data.depends_on[name=subject_id].value`.
 *
 * Inputs:
 *   - `subjectTable` — the rows + columns from
 *     `useSummaryTable(datasetId, 'subject')`. Already strain-NDI-ref
 *     rewritten by the time we get here. The `strainName` column may
 *     be a clean string (e.g. `WBStrain:00000001`), an array, or
 *     `null`/empty.
 *   - `openmindsDocs` — every `openminds_subject` doc returned by
 *     `useDocumentsInfinite`. We filter to `matlab_type ===
 *     'openminds.core.research.Strain'` (or the openminds_type URI
 *     terminal segment `Strain`) and walk `depends_on` for the
 *     subject linkage.
 *
 * Output: a new `TableResponse` with `strainName` replaced by the
 * resolved strain name on each subject row that has a matching Strain
 * doc. Subjects with no matching openminds_subject Strain are left
 * alone (the `strainOntology` column still renders the ID chip with
 * its hyperlink — no information lost). Pure function; does not
 * mutate inputs.
 *
 * Long-term, the synthesizer should ship the strain name directly on
 * the subject row; this is the unblocker today.
 */
function joinStrainNamesToSubjects(
  subjectTable: TableResponse,
  openmindsDocs: ReadonlyArray<DocumentSummary>,
): TableResponse {
  const strainNamesBySubjectId = buildStrainNamesBySubjectId(openmindsDocs);
  if (strainNamesBySubjectId.size === 0) return subjectTable;
  const newRows = subjectTable.rows.map((row) => {
    const subjectId = row.subjectDocumentIdentifier;
    if (typeof subjectId !== 'string' || !subjectId) return row;
    const resolvedName = strainNamesBySubjectId.get(subjectId);
    if (!resolvedName) return row;
    return { ...row, strainName: resolvedName };
  });
  return { ...subjectTable, rows: newRows };
}

/**
 * Walk an array of openminds_subject documents and return a map keyed
 * by `subject_id` (extracted from `depends_on`) whose value is the
 * strain's human-readable `fields.name`. Skips any non-Strain docs
 * (Species, BiologicalSex, GeneticStrainType — those carry their own
 * names but aren't relevant to the strain column). Skips Strain docs
 * whose `fields.name` is missing or non-string (Schema-B nested-ref
 * payloads still slip through to `rewriteStrainNdiRefToOntology` for
 * the popover chip fallback). Multiple Strain docs per subject keep
 * the FIRST one we see — datasets with multiple strains per subject
 * are rare; if we hit one, the dedicated OpenMINDS Subjects tab is the
 * complete view.
 *
 * Exported for unit testing — kept module-local (not from any other
 * file) so the shape change is contained to this PR.
 */
export function buildStrainNamesBySubjectId(
  docs: ReadonlyArray<DocumentSummary>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const doc of docs) {
    if (!isStrainDoc(doc)) continue;
    const subjectId = pickSubjectIdFromDependsOn(doc);
    if (!subjectId) continue;
    if (out.has(subjectId)) continue; // first-write wins
    const name = pickStrainName(doc);
    if (!name) continue;
    out.set(subjectId, name);
  }
  return out;
}

/**
 * True iff this openminds_subject doc represents a Strain — checked
 * primarily via the canonical `matlab_type` discriminator
 * (`'openminds.core.research.Strain'`), with a fallback to the
 * `openminds_type` URI's terminal segment for older docs that don't
 * carry the matlab discriminator.
 */
function isStrainDoc(doc: DocumentSummary): boolean {
  const data = (doc.data ?? {}) as Record<string, unknown>;
  const openminds = (data.openminds ?? {}) as Record<string, unknown>;
  const matlabType = openminds.matlab_type;
  if (typeof matlabType === 'string' && matlabType === 'openminds.core.research.Strain') {
    return true;
  }
  const openmindsType = openminds.openminds_type;
  if (typeof openmindsType === 'string') {
    const terminal = openmindsType.split('/').pop() ?? '';
    if (terminal === 'Strain') return true;
  }
  return false;
}

/**
 * Walk a Strain doc's `depends_on` for the `subject_id` link and return
 * the subject's NDI ID. Mirrors `pickDependencyValue` in
 * `OpenmindsSubjectTableView` but inlined here so the two callsites stay
 * decoupled (they compute different downstream shapes).
 */
function pickSubjectIdFromDependsOn(doc: DocumentSummary): string | null {
  const data = (doc.data ?? {}) as Record<string, unknown>;
  const raw = data.depends_on;
  if (!raw) return null;
  const arr = Array.isArray(raw) ? raw : [raw];
  for (const d of arr) {
    if (!d || typeof d !== 'object') continue;
    const name = (d as Record<string, unknown>).name;
    if (name !== 'subject_id') continue;
    const value = (d as Record<string, unknown>).value;
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

/**
 * Pull `data.openminds.fields.name` off a Strain doc, defending
 * against the cloud emitting non-string payloads (lists of nested
 * `ndi://` refs). When the field IS a string, return it trimmed.
 * Otherwise null — caller skips the row.
 */
function pickStrainName(doc: DocumentSummary): string | null {
  const data = (doc.data ?? {}) as Record<string, unknown>;
  const openminds = (data.openminds ?? {}) as Record<string, unknown>;
  const fields = (openminds.fields ?? {}) as Record<string, unknown>;
  const name = fields.name;
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed || null;
}

/**
 * Best-available frontend fix for the strain-raw-ID render bug. When
 * the subject row's `strainName` is an `ndi://`-only payload AND the
 * sibling `strainOntology` carries a real `PROVIDER:ID` ontology
 * value, replace `strainName` with the ontology ID so the cell renders
 * the existing OntologyPopover chip (clickable, label-resolved) instead
 * of the raw NDI reference. Same treatment for `backgroundStrainName`
 * which has the same Schema-B shape.
 *
 * Returns the row unchanged when the strain fields are already clean
 * strings or when there's no ontology sibling to fall back on. Pure
 * function — does not mutate the input row.
 *
 * Long-term, the synthesizer should resolve Schema-B nested name
 * references on the backend; this helper is the team-review-pass
 * unblocker so the bhar/haley datasets render strains today.
 */
function rewriteStrainNdiRefToOntology(
  row: Record<string, unknown>,
): Record<string, unknown> {
  let out: Record<string, unknown> | null = null;
  for (const [nameKey, ontologyKey] of [
    ['strainName', 'strainOntology'],
    ['backgroundStrainName', 'backgroundStrainOntology'],
  ] as const) {
    if (
      isNdiRefPayload(row[nameKey]) &&
      typeof row[ontologyKey] === 'string' &&
      row[ontologyKey].includes(':')
    ) {
      if (!out) out = { ...row };
      out[nameKey] = row[ontologyKey];
    }
  }
  return out ?? row;
}

/**
 * 2026-05-19 — pascalCaseFromTreatmentName + joinTreatmentsToSubjects
 * REMOVED. Treatment broadcast columns now ship inline from the
 * backend per F-1b (see `summary_table_service.py` ::
 * `_broadcast_treatments_onto_subjects` +
 * `_pascal_case_from_treatment_name`). The cloud-app's subject
 * summary response carries `<prefix>Name` + `<prefix>Ontology`
 * columns ready to render — no client-side pivot needed. The
 * workspace's SubjectsBrowser also gets them for free now.
 *
 * Historical helpers preserved in git history at commit fd44603
 * if anyone needs the JS reference; the Python port lives in
 * backend/services/summary_table_service.py.
 */
// (pascalCaseFromTreatmentName + joinTreatmentsToSubjects deleted —
// ported to backend in F-1b. See block comment above.)
