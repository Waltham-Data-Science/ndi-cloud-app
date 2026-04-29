'use client';
/**
 * DatasetSummaryCard — Plan B B1 landing card.
 *
 * Labeled-facts block (no prose sentence) rendering the synthesized
 * :class:`DatasetSummary`. Section layout:
 *   - Counts (6 count chips)
 *   - Biology (species / strains / sexes as ontology pills)
 *   - Anatomy (brainRegions pills)
 *   - Scale (date range + total size)
 *   - Citation (title / license / DOIs / contributors / year)
 *
 * ``[]`` renders an em-dash ("—"). ``null`` renders "Not applicable" —
 * these signals carry different meaning (amendment §3) and the UI must
 * preserve the distinction.
 *
 * Full strings are preserved, never truncated (amendment §4.B1).
 *
 * # Degraded-data UX (audit 2026-04-27 #2/#3/#4)
 *
 * When the backend's stage-1 / stage-2 cloud calls fail, the response
 * still ships a structurally-valid summary — but with values that
 * LOOK trustworthy and aren't (e.g. `counts.sessions = 0` doesn't
 * mean "zero sessions", it means "we tried to count and couldn't").
 * We cross-reference `extractionWarnings` with values to render an
 * inline degraded marker on affected fields, and humanize the raw
 * warning copy in the footer tooltip. See
 * :module:`lib/data/summary-degradation` for the warning vocabulary.
 */
import { Info } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { FloatingPanel } from '@/components/ui/FloatingPanel';
import { cn } from '@/lib/cn';
import {
  degradedFieldsFromSummary,
  humanizeWarning,
  type DegradedFields,
} from '@/lib/data/summary-degradation';
import { formatBytes, formatDate } from '@/lib/format';
import type {
  DatasetSummary,
  OntologyTerm,
} from '@/lib/types/dataset-summary';

export interface DatasetSummaryCardProps {
  summary: DatasetSummary;
  className?: string;
}

export function DatasetSummaryCard({
  summary,
  className,
}: DatasetSummaryCardProps) {
  // Compute once and pass down — keeps every section's "is my data
  // unreliable?" check identical and lets us assert the matrix in
  // isolation in `summary-degradation.test.ts`.
  const degraded = useMemo(
    () => degradedFieldsFromSummary(summary),
    [summary],
  );

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Dataset summary</CardTitle>
        <CardDescription className="text-xs">
          Synthesized from the cloud-indexed classes for dataset{' '}
          <span className="font-mono">{summary.datasetId}</span>.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-6 text-sm">
        <CountsSection counts={summary.counts} degraded={degraded} />
        <BiologySection
          species={summary.species}
          strains={summary.strains}
          sexes={summary.sexes}
          degraded={degraded.biology}
        />
        <AnatomySection
          brainRegions={summary.brainRegions}
          degraded={degraded.brainRegions}
        />
        <ProbeTypesSection
          probeTypes={summary.probeTypes}
          degraded={degraded.probeTypes}
        />
        <ScaleSection
          dateRange={summary.dateRange}
          totalSizeBytes={summary.totalSizeBytes}
        />
        {/* Citation block intentionally lives on the Details card next to
            this one (license, DOIs, contributors, year). Rendering it here
            duplicated that block; removed to de-noise the summary. */}
        <SummaryFooter
          computedAt={summary.computedAt}
          extractionWarnings={summary.extractionWarnings}
        />
      </CardBody>
    </Card>
  );
}

/**
 * Inline "this field is degraded" marker. Renders an em-dash with a
 * subtle amber tint and an Info icon carrying a native-tooltip
 * explanation. The em-dash + tint pattern matches the existing
 * "value-empty" rendering so the visual vocabulary stays consistent;
 * the icon is what tells the user "this isn't an absence, it's a
 * failure."
 *
 * Native `title` attribute (vs FloatingPanel) is intentional: the
 * marker appears 0-N times per card, and pulling the heavyweight
 * floating-panel-on-every-marker would balloon the DOM. The tooltip
 * is a confirmation signal — users mostly read the em-dash + icon
 * and infer the problem from context.
 */
function DegradedMarker({
  reason,
  testId,
}: {
  reason: string;
  testId?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-amber-700"
      data-testid={testId ?? 'value-degraded'}
      title={reason}
    >
      <span aria-hidden>—</span>
      <Info className="h-3 w-3" aria-label={reason} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section primitives
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </h2>
  );
}

function CountsSection({
  counts,
  degraded,
}: {
  counts: DatasetSummary['counts'];
  degraded: DegradedFields;
}) {
  // `recordRecoverable: true` means the backend's record-fallback path
  // can fill this from the cloud-side `DatasetRecord` even if
  // /document-class-counts times out — so a 0 here is meaningful (it
  // really is zero) and we should NOT render a degraded marker.
  // The other counts (sessions/probes/elements/epochs) have no such
  // fallback; when degraded.counts is set, their `0` is "we don't
  // know," not "there are zero," and the marker prevents viewers
  // from reading "0 sessions" as a fact.
  const items: Array<{
    label: string;
    value: number;
    testId: string;
    recordRecoverable: boolean;
  }> = [
    { label: 'Sessions', value: counts.sessions, testId: 'counts-sessions', recordRecoverable: false },
    { label: 'Subjects', value: counts.subjects, testId: 'counts-subjects', recordRecoverable: true },
    { label: 'Probes', value: counts.probes, testId: 'counts-probes', recordRecoverable: false },
    { label: 'Elements', value: counts.elements, testId: 'counts-elements', recordRecoverable: false },
    { label: 'Epochs', value: counts.epochs, testId: 'counts-epochs', recordRecoverable: false },
    {
      label: 'Documents',
      value: counts.totalDocuments,
      testId: 'counts-total-documents',
      recordRecoverable: true,
    },
  ];
  return (
    <section aria-label="Counts" className="space-y-2">
      <SectionHeading>Counts</SectionHeading>
      <dl
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        data-testid="dataset-summary-counts"
      >
        {items.map((i) => {
          const showDegraded =
            degraded.counts && !i.recordRecoverable && i.value === 0;
          return (
            <div
              key={i.label}
              className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5"
              data-testid={i.testId}
            >
              <dt className="text-[10px] uppercase tracking-wide text-gray-500">
                {i.label}
              </dt>
              <dd className="font-mono text-sm text-gray-800">
                {showDegraded ? (
                  <DegradedMarker
                    reason="Cloud query for class counts timed out — count not recoverable from dataset record."
                    testId="counts-degraded"
                  />
                ) : (
                  new Intl.NumberFormat('en-US').format(i.value)
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function BiologySection({
  species,
  strains,
  sexes,
  degraded,
}: {
  species: OntologyTerm[] | null;
  strains: OntologyTerm[] | null;
  sexes: OntologyTerm[] | null;
  /** When true, biology values are unreliable — the
   * openminds_subject ndiquery failed. Each label renders the
   * degraded marker regardless of whether the value is `[]` or
   * `null`. */
  degraded: boolean;
}) {
  return (
    <section aria-label="Biology" className="space-y-2" data-testid="biology">
      <SectionHeading>Biology</SectionHeading>
      <dl className="space-y-1.5">
        <LabeledOntologyList label="Species" terms={species} degraded={degraded} />
        <LabeledOntologyList label="Strains" terms={strains} degraded={degraded} />
        <LabeledOntologyList label="Sex" terms={sexes} degraded={degraded} />
      </dl>
    </section>
  );
}

function AnatomySection({
  brainRegions,
  degraded,
}: {
  brainRegions: OntologyTerm[] | null;
  degraded: boolean;
}) {
  return (
    <section aria-label="Anatomy" className="space-y-2" data-testid="anatomy">
      <SectionHeading>Anatomy</SectionHeading>
      <dl className="space-y-1.5">
        <LabeledOntologyList
          label="Brain regions"
          terms={brainRegions}
          degraded={degraded}
        />
      </dl>
    </section>
  );
}

function ProbeTypesSection({
  probeTypes,
  degraded,
}: {
  probeTypes: string[] | null;
  degraded: boolean;
}) {
  return (
    <section
      aria-label="Probe types"
      className="space-y-2"
      data-testid="probe-types"
    >
      <SectionHeading>Probe types</SectionHeading>
      <dl className="space-y-1.5">
        <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
          <dt className="pt-0.5 text-xs font-medium text-gray-600">
            Types
          </dt>
          <dd className="flex flex-wrap gap-1.5">
            {renderStringListOrStatus(probeTypes, degraded)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function ScaleSection({
  dateRange,
  totalSizeBytes,
}: {
  dateRange: DatasetSummary['dateRange'];
  totalSizeBytes: number | null;
}) {
  // 2026-04-29 (round 3) — team review: the Scale section's Date range
  // was rendering raw ISO timestamps (e.g.
  // `2026-03-19T20:29:21.206Z → 2026-04-24T18:14:20.806Z`), which is
  // unreadable. Format both endpoints through `formatDate` so the
  // widget reads like `Mar 19, 2026 → Apr 24, 2026`. Distinguishing
  // marker for unparseable values: `formatDate` returns the original
  // string when `new Date(...)` is NaN, so any future legacy non-ISO
  // payload falls back to a string rather than rendering "Invalid
  // Date". When earliest === latest, render a single date (no
  // collapsing arrow on a 1-day window).
  const range = useMemo(() => {
    const { earliest, latest } = dateRange;
    if (!earliest && !latest) return '—';
    if (earliest && latest && earliest === latest) return formatDate(earliest);
    const parts = [
      earliest ? formatDate(earliest) : '?',
      latest ? formatDate(latest) : '?',
    ];
    return parts.join(' → ');
  }, [dateRange]);
  return (
    <section aria-label="Scale" className="space-y-2" data-testid="scale">
      <SectionHeading>Scale</SectionHeading>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-1 text-xs">
        <dt className="font-medium text-gray-600">
          Date range
        </dt>
        <dd className="font-mono text-gray-800">
          {range}
        </dd>
        <dt className="font-medium text-gray-600">
          Total size
        </dt>
        <dd className="font-mono text-gray-800">
          {totalSizeBytes == null ? '—' : formatBytes(totalSizeBytes)}
        </dd>
      </dl>
    </section>
  );
}

// Citation block removed — see note at call site. The citation data is
// still available on `summary.citation` for consumers that need it (e.g.
// the CiteModal); we just don't render a duplicate section on this card.

// ---------------------------------------------------------------------------
// Labeled ontology list + "Not applicable" / "—" states
// ---------------------------------------------------------------------------

function LabeledOntologyList({
  label,
  terms,
  degraded = false,
}: {
  label: string;
  terms: OntologyTerm[] | null;
  /** When true, suppress the `[]` / `null` rendering and show the
   * degraded marker instead — the upstream ndiquery failed and
   * neither "Not applicable" nor "no entries" is the truth. */
  degraded?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-1"
      data-testid={`biology-${slugify(label)}`}
    >
      <dt className="pt-0.5 text-xs font-medium text-gray-600">
        {label}
      </dt>
      <dd className="flex flex-wrap gap-1.5">
        {renderOntologyList(terms, degraded)}
      </dd>
    </div>
  );
}

function renderOntologyList(
  terms: OntologyTerm[] | null,
  degraded = false,
): React.ReactNode {
  // Degraded path: prefer the marker over BOTH "Not applicable" and
  // "—". Audit #4: a C. elegans dataset rendering "Strains: Not
  // applicable" reads like a fact about the dataset, when it actually
  // reflects the openminds_subject ndiquery failing. The `terms`
  // value here is unreliable on the degraded branch — could be `[]`
  // (the backend's exception fallback) or `null` (stage-2 didn't run);
  // either way we want the same marker.
  if (degraded) {
    // Some valid data may still have made it through (rare but
    // possible — partial responses). Render real terms when present;
    // only fall through to the marker when nothing useful is here.
    if (terms && terms.length > 0) {
      return terms.map((t) => (
        <OntologyTermPill key={`${t.label}-${t.ontologyId ?? ''}`} term={t} />
      ));
    }
    return (
      <DegradedMarker reason="Cloud query timed out — partial data; this section may be incomplete." />
    );
  }
  if (terms === null) {
    return (
      <span
        className="text-[11px] italic text-gray-500"
        data-testid="value-not-applicable"
      >
        Not applicable
      </span>
    );
  }
  if (terms.length === 0) {
    return (
      <span
        className="text-[11px] text-gray-500"
        data-testid="value-empty"
      >
        —
      </span>
    );
  }
  return terms.map((t) => (
    <OntologyTermPill key={`${t.label}-${t.ontologyId ?? ''}`} term={t} />
  ));
}

function renderStringListOrStatus(
  values: string[] | null,
  degraded = false,
): React.ReactNode {
  if (degraded) {
    if (values && values.length > 0) {
      return values.map((v) => (
        <Badge key={v} variant="secondary" className="font-mono">
          {v}
        </Badge>
      ));
    }
    return (
      <DegradedMarker reason="Cloud query timed out — partial data; this section may be incomplete." />
    );
  }
  if (values === null) {
    return (
      <span
        className="text-[11px] italic text-gray-500"
        data-testid="value-not-applicable"
      >
        Not applicable
      </span>
    );
  }
  if (values.length === 0) {
    return (
      <span
        className="text-[11px] text-gray-500"
        data-testid="value-empty"
      >
        —
      </span>
    );
  }
  return values.map((v) => (
    <Badge key={v} variant="secondary" className="font-mono">
      {v}
    </Badge>
  ));
}

// ---------------------------------------------------------------------------
// OntologyTermPill — hover >=600ms reveals ontologyId tooltip; click opens
// the resolver.
// ---------------------------------------------------------------------------

const HOVER_TOOLTIP_DELAY_MS = 600;

export interface OntologyTermPillProps {
  term: OntologyTerm;
  /** When true, render without the outer resolver anchor. Required by
   * nested-link consumers (e.g. a catalog card that wraps the whole card
   * in a ``<Link>``) — nested ``<a>`` is invalid HTML and React warns.
   * Default ``false`` keeps the detail-view behavior intact (pill links
   * to the canonical ontology resolver). */
  noLink?: boolean;
}

export function OntologyTermPill({
  term,
  noLink = false,
}: OntologyTermPillProps) {
  // Ref (not state) so the setTimeout callback always reads the *live*
  // hover state, not the closure at call time. A user who briefly hovers
  // and moves away within HOVER_TOOLTIP_DELAY_MS must NOT see a ghost
  // tooltip appear after the timeout fires.
  const hoveringRef = useRef(false);
  const pendingTimeoutRef = useRef<number | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  // Anchor for FloatingPanel — the outer pill span's bounding rect drives
  // the tooltip position. Needed because the tooltip is portaled to
  // `document.body` to escape clipping ancestors (see FloatingPanel for
  // the why). The old inline absolute positioning was clipped by the
  // table scroll container when a pill sat in an ontology table cell.
  const anchorRef = useRef<HTMLSpanElement>(null);

  const resolverHref =
    !noLink && term.ontologyId ? resolverUrl(term.ontologyId) : null;

  function onEnter() {
    hoveringRef.current = true;
    // Cancel any previous pending reveal in case of rapid re-enter.
    if (pendingTimeoutRef.current !== null) {
      window.clearTimeout(pendingTimeoutRef.current);
    }
    pendingTimeoutRef.current = window.setTimeout(() => {
      pendingTimeoutRef.current = null;
      if (hoveringRef.current) {
        setTooltipVisible(true);
      }
    }, HOVER_TOOLTIP_DELAY_MS);
  }
  function onLeave() {
    hoveringRef.current = false;
    if (pendingTimeoutRef.current !== null) {
      window.clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
    setTooltipVisible(false);
  }

  const content = (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset',
        'bg-brand-50 text-brand-800 ring-brand-200',
      )}
      data-testid="ontology-term-pill"
    >
      {term.label}
    </span>
  );

  return (
    <>
      <span
        ref={anchorRef}
        className="relative inline-flex"
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        data-ontology-id={term.ontologyId ?? ''}
      >
        {resolverHref ? (
          <a
            href={resolverHref}
            target="_blank"
            rel="noopener noreferrer"
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-full"
            data-testid="ontology-term-link"
          >
            {content}
          </a>
        ) : (
          content
        )}
      </span>
      <FloatingPanel
        open={tooltipVisible && !!term.ontologyId}
        anchorRef={anchorRef}
        preferredPlacement="below"
        width={200}
        estimatedHeight={28}
        testId="ontology-term-tooltip"
        className="whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-mono shadow-md"
      >
        {term.ontologyId}
      </FloatingPanel>
    </>
  );
}

/**
 * Resolver URL for PROVIDER:ID style ontology references. Falls back to the
 * raw ID when we don't know a canonical resolver.
 */
export function resolverUrl(ontologyId: string): string | null {
  if (!ontologyId.includes(':')) return null;
  const [provider, rest] = ontologyId.split(':', 2) as [string, string];
  const id = rest.trim();
  if (!provider || !id) return null;
  const upper = provider.toUpperCase();
  switch (upper) {
    case 'NCBITAXON':
    case 'UBERON':
    case 'CL':
    case 'CHEBI':
    case 'PATO':
    case 'EFO':
      return `http://purl.obolibrary.org/obo/${upper}_${id}`;
    case 'RRID':
      return `https://scicrunch.org/resolver/RRID:${id}`;
    case 'WBSTRAIN':
      return `https://wormbase.org/species/c_elegans/strain/${id}`;
    case 'PUBCHEM':
      return `https://pubchem.ncbi.nlm.nih.gov/compound/${id}`;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Footer — computedAt + extractionWarnings debug tooltip
// ---------------------------------------------------------------------------

function SummaryFooter({
  computedAt,
  extractionWarnings,
}: {
  computedAt: string;
  extractionWarnings: string[];
}) {
  // Hydration-safe age: SSR renders the absolute ISO timestamp; the
  // client switches to the relative form ("5m ago") after first paint.
  // Pre-fix, `humanizeAge` called `Date.now()` directly in render,
  // which gave SSR and client different "5s ago" / "6s ago" strings →
  // React error #418 hydration mismatch on every dataset detail
  // visit. The relative form is the desired UX; we only defer its
  // computation to after hydration so SSR + first client paint match.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    // Canonical hydration-deferred toggle: explicitly flip from
    // server-rendered output to client-only output AFTER first paint.
    // This is the standard SSR-safe pattern for content that must
    // differ between server and client (here: relative time, which
    // depends on Date.now()). The eslint rule's "you might not need
    // an effect" doesn't apply — we DO need it, exactly once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
  }, []);
  const displayAge = isMounted ? humanizeAge(computedAt) : `at ${computedAt}`;
  const [warningsOpen, setWarningsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  return (
    <footer
      className="flex items-center justify-between border-t border-gray-200 pt-2 text-[10px] text-gray-500"
      data-testid="summary-footer"
    >
      <span data-testid="summary-computed-at">Last computed {displayAge}</span>
      {extractionWarnings.length > 0 && (
        <button
          ref={toggleRef}
          type="button"
          className="inline-flex items-center gap-1 rounded hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          onClick={() => setWarningsOpen((v) => !v)}
          aria-expanded={warningsOpen}
          data-testid="summary-warnings-toggle"
        >
          <Info className="h-3 w-3" aria-hidden />
          {extractionWarnings.length} warning
          {extractionWarnings.length === 1 ? '' : 's'}
        </button>
      )}
      <FloatingPanel
        open={warningsOpen && extractionWarnings.length > 0}
        anchorRef={toggleRef}
        preferredPlacement="above"
        width={320}
        estimatedHeight={Math.min(240, 40 + extractionWarnings.length * 24)}
        testId="summary-warnings-tooltip"
        className="rounded-md border border-gray-200 bg-white p-2 text-[10px] shadow-md"
      >
        <ul className="space-y-1">
          {extractionWarnings.map((w, i) => (
            // Audit #3 — raw operator-grade strings ("counts fetch
            // exceeded 20s") were both alarming and uninformative for
            // end users. `humanizeWarning` rewrites the canonical
            // backend prefixes into friendly copy; unknown warnings
            // pass through unchanged so a new failure mode stays
            // visible (we never silently hide).
            <li
              key={i}
              className="text-gray-700"
              data-testid="summary-warning"
            >
              {humanizeWarning(w)}
            </li>
          ))}
        </ul>
      </FloatingPanel>
    </footer>
  );
}

function humanizeAge(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return `at ${iso}`;
  const ms = Date.now() - then;
  if (ms < 0) return `just now`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
