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
import { useSummaryTable, type TableResponse } from '@/lib/api/tables';
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

  // 2026-04-28 — Per-subject treatment join (replaces PR #129's
  // hide-by-default safety measure). The reviewer flagged that
  // dynamic treatment columns were broadcasting the SAME values onto
  // every subject row regardless of `depends_on.subject_id` — a
  // 5-subject × 3-treatment dataset rendered 5 rows where every
  // treatment value showed up on every subject. PR #129 made the
  // discovered dynamic columns hidden-by-default; this PR replaces
  // that with a real frontend join so the columns can come back
  // visible with correct per-subject values.
  //
  // Approach: when `className === 'subject'`, fetch the dataset's
  // treatment summary table (already keyed by
  // `subjectDocumentIdentifier` per row — see
  // `_row_treatment` in summary_table_service.py). Group the rows
  // by subject, derive a dynamic column key from each row's
  // `treatmentName` (PascalCase + `Name`/`Ontology` suffix —
  // matches the convention TREATMENT_COLUMN_PATTERN already
  // recognizes), and inject those columns onto the matching subject
  // row. Subjects with no matching treatment leave the cells empty
  // (no broadcast).
  //
  // The treatment query is guarded by `enabled: className === 'subject'`
  // so non-subject grains pay zero network cost. Same TanStack cache
  // scope as the dedicated `Treatments` tab — visiting either
  // primes both.
  const treatmentQuery = useSummaryTable(
    className === 'subject' ? datasetId : undefined,
    className === 'subject' ? 'treatment' : undefined,
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
  const treatmentData = treatmentQuery.data;
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
    // Then: join treatments to subjects when the treatment table
    // has resolved. While treatment is still loading we render the
    // subject table without the dynamic columns rather than block
    // the whole view; columns appear once the join is ready.
    if (!treatmentData) return strainRewritten;
    return joinTreatmentsToSubjects(strainRewritten, treatmentData);
  }, [queryData, className, treatmentData]);

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
 * Convert a human-readable `treatmentName` like
 * `"Optogenetic Tetanus Stimulation Target Location"` into a PascalCase
 * column-key prefix (`OptogeneticTetanusStimulationTargetLocation`).
 *
 * The shape mirrors `discoverDynamicColumns`'s expected key naming —
 * `TREATMENT_COLUMN_PATTERN` accepts both raw `...Location` keys and
 * `...LocationName`/`...LocationOntology` suffixed pairs, so the join
 * emits a `<prefix>Name` column (the treatment value) and a
 * `<prefix>Ontology` column (the treatment's `treatmentOntology`).
 *
 * Whitespace is collapsed, then each word is upper-cased on the first
 * letter. Non-alphanumeric characters are stripped — these are not
 * expected in canonical treatment names, and including them would
 * produce illegal column-key characters that break header rendering.
 * Empty / null / non-string input returns `null` (caller skips).
 */
function pascalCaseFromTreatmentName(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/).map((word) => {
    const clean = word.replace(/[^a-zA-Z0-9]/g, '');
    if (!clean) return '';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  });
  const joined = parts.join('');
  return joined || null;
}

/**
 * 2026-04-28 — Per-subject treatment join. Replaces PR #129's
 * hide-by-default safety measure with a real join keyed off
 * `subjectDocumentIdentifier` so each subject row carries only its
 * OWN treatment values (or empty cells when none apply).
 *
 * Inputs:
 *   - `subjectTable` — the rows + columns from
 *     `useSummaryTable(datasetId, 'subject')`. Already strain-rewritten.
 *   - `treatmentTable` — the rows + columns from
 *     `useSummaryTable(datasetId, 'treatment')`. Each row carries
 *     `subjectDocumentIdentifier`, `treatmentName`, `treatmentOntology`,
 *     `numericValue`, `stringValue` per the v2 backend's
 *     `_row_treatment` projection. The `subjectDocumentIdentifier`
 *     join key matches the same field on subject rows.
 *
 * Output: a new `TableResponse` where:
 *   - Every subject row has every dynamic-treatment column key
 *     present (set to `null` when the subject has no treatment of
 *     that kind) — important for the column-discovery pass in
 *     `discoverDynamicColumns`, which scans the union of all rows.
 *   - The matching subject's row is augmented with the per-subject
 *     treatment value (`stringValue` for the `Name` column;
 *     `treatmentOntology` for the `Ontology` column).
 *   - `data.columns` gains one `{key, label}` entry per discovered
 *     dynamic column (`Name` + `Ontology` pair) so
 *     `SummaryTableView`'s ordered-columns step picks them up.
 *   - Subject row count is unchanged — N treatments do NOT
 *     multiply rows; the bug PR #129 patched was caused by the
 *     opposite path.
 *
 * If a subject has multiple treatments of the same kind, the values
 * collect into an array (the existing `csvJoinFormatter` then
 * renders `"a, b, c"` exactly as it does for multi-valued species
 * etc.). Treatment rows whose `treatmentName` doesn't yield a
 * legal PascalCase key are skipped — the user still sees their
 * treatment via the dedicated Treatments tab.
 *
 * Pure function — does not mutate `subjectTable` or `treatmentTable`.
 */
function joinTreatmentsToSubjects(
  subjectTable: TableResponse,
  treatmentTable: TableResponse,
): TableResponse {
  // Group treatments by subjectDocumentIdentifier and dynamic column
  // key. Outer key = subjectDocumentIdentifier; inner = column key
  // (e.g. `OptogeneticTetanusStimulationTargetLocationName`); value =
  // collected array of values across multiple treatments of the same
  // kind on the same subject.
  const bySubject = new Map<string, Map<string, unknown[]>>();
  // Track every distinct dynamic column key we discover, so we can
  // surface them in `data.columns` even if no subject row has been
  // written for them yet (avoids missing headers).
  const discoveredKeys = new Map<string, string>(); // key -> human label

  for (const tRow of treatmentTable.rows) {
    const subjectId = tRow.subjectDocumentIdentifier;
    if (typeof subjectId !== 'string' || !subjectId) continue;
    const prefix = pascalCaseFromTreatmentName(tRow.treatmentName);
    if (!prefix) continue;

    const nameKey = `${prefix}Name`;
    const ontologyKey = `${prefix}Ontology`;
    const nameLabel = typeof tRow.treatmentName === 'string'
      ? `${tRow.treatmentName} Name`
      : nameKey;
    const ontologyLabel = typeof tRow.treatmentName === 'string'
      ? `${tRow.treatmentName} Ontology`
      : ontologyKey;

    discoveredKeys.set(nameKey, nameLabel);
    discoveredKeys.set(ontologyKey, ontologyLabel);

    let perSubject = bySubject.get(subjectId);
    if (!perSubject) {
      perSubject = new Map<string, unknown[]>();
      bySubject.set(subjectId, perSubject);
    }
    // Treatment value: prefer `stringValue` (e.g. `UBERON:0001930`
    // for a Location-typed treatment); fall back to `numericValue`
    // for dose / duration / onset variants. Empty arrays from the
    // backend (`numeric_value: []`) are skipped — the cell stays
    // empty for that subject.
    const stringVal = tRow.stringValue;
    const numericVal = tRow.numericValue;
    const value = (typeof stringVal === 'string' && stringVal)
      || (typeof stringVal === 'number' ? stringVal : null)
      || (typeof numericVal === 'number' ? numericVal : null)
      || (Array.isArray(numericVal) && numericVal.length > 0 ? numericVal : null);
    if (value !== null) {
      const arr = perSubject.get(nameKey) ?? [];
      arr.push(value);
      perSubject.set(nameKey, arr);
    }
    const ontology = tRow.treatmentOntology;
    if (typeof ontology === 'string' && ontology) {
      const arr = perSubject.get(ontologyKey) ?? [];
      arr.push(ontology);
      perSubject.set(ontologyKey, arr);
    }
  }

  // No discovered dynamic columns → return the strain-rewritten
  // table unchanged (avoid a needless allocation that would also
  // change column object identity for the column-toggle picker).
  if (discoveredKeys.size === 0) return subjectTable;

  // Inject per-subject values onto each row. Subjects with no
  // treatments leave the dynamic cells `null` (NOT broadcast). Use
  // `null` rather than omitting the key so `discoverDynamicColumns`
  // sees the column on every row when scanning for the union of
  // keys, keeping the column-picker entry correctly registered.
  const newRows = subjectTable.rows.map((row) => {
    const subjectId = row.subjectDocumentIdentifier;
    const perSubject = typeof subjectId === 'string' ? bySubject.get(subjectId) : undefined;
    const out: Record<string, unknown> = { ...row };
    for (const key of discoveredKeys.keys()) {
      const collected = perSubject?.get(key);
      if (!collected || collected.length === 0) {
        out[key] = null;
      } else if (collected.length === 1) {
        out[key] = collected[0];
      } else {
        out[key] = collected;
      }
    }
    return out;
  });

  // Append the discovered columns to `data.columns` so SummaryTableView's
  // ordered-columns build picks them up. Skip any keys the backend
  // already emits (defensive — current backend doesn't, but a future
  // backend join would).
  const existingKeys = new Set(subjectTable.columns.map((c) => c.key));
  const newColumns = [
    ...subjectTable.columns,
    ...[...discoveredKeys.entries()]
      .filter(([key]) => !existingKeys.has(key))
      .map(([key, label]) => ({ key, label })),
  ];

  return { columns: newColumns, rows: newRows };
}
