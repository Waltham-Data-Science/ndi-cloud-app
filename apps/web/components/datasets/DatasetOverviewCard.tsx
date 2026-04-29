'use client';

/**
 * DatasetOverviewCard — the "Details" surface on the dataset detail
 * Overview tab. Renders the abstract / contributors / corresponding
 * authors / funding / associated publications / identifiers blocks,
 * plus the Cite + Use-this-data action buttons that open
 * `CiteModal` / `UseThisDataModal`.
 *
 * Extracted from `ndi-data-browser-v2/frontend/src/pages/DatasetDetailPage.tsx`
 * (lines 459-687 in the source) into a standalone file so the
 * monorepo's `app/(app)/datasets/[id]/overview/overview-content.tsx`
 * can compose it directly. `ContributorRow` and `PublicationRow` stay
 * file-local helpers (same shape as the source's inline definitions).
 */
import { BookOpen, Code2, Quote, Users } from 'lucide-react';
import { useState } from 'react';

import { CiteModal } from '@/components/datasets/CiteModal';
import { UseThisDataModal } from '@/components/datasets/UseThisDataModal';
import { CopyButton } from '@/components/ui/CopyButton';
import { ExternalAnchor } from '@/components/ui/ExternalAnchor';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { isDefaultBranch } from '@/lib/dataset-filters';
import { toDoiUrl } from '@/lib/doi-url';
import { cleanAbstract, formatDate } from '@/lib/format';
import { normalizeLicense } from '@/lib/license-normalize';
import { normalizeOrcid } from '@/lib/orcid';
import type {
  AssociatedPublication,
  Contributor,
  DatasetRecord,
} from '@/lib/api/datasets';
import type { DatasetSummary } from '@/lib/types/dataset-summary';

export function DatasetOverviewCard({
  ds,
  datasetId,
  summary,
}: {
  ds: DatasetRecord;
  datasetId: string;
  summary?: DatasetSummary;
}) {
  // `cleanAbstract` strips a leading "DATASET BEING PROCESSED."
  // synthesizer-pipeline placeholder and reports it via `processing`
  // so we render a discrete badge alongside the prose instead of
  // letting the marker leak into body copy.
  const { text: abstract, processing } = cleanAbstract(
    ds.description ?? ds.abstract,
  );
  // Normalize the license string so the badge text matches what
  // DatasetCard renders. See `lib/license-normalize.ts`.
  const normalizedLicense = normalizeLicense(ds.license);
  const [citeOpen, setCiteOpen] = useState(false);
  const [useDataOpen, setUseDataOpen] = useState(false);
  return (
    <Card>
      <CardHeader>
        {/* Card-scoped h2 (hero has the h1); keeps heading order clean for axe. */}
        <h2 className="text-[14px] font-bold text-brand-navy leading-tight">
          Details
        </h2>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {normalizedLicense && (
            <Badge variant="outline">{normalizedLicense}</Badge>
          )}
          {/* `isDefaultBranch` covers `main` / `original` /
              `original submission` so neither catalog surface leaks
              the default branch name as a noisy badge. See
              `DEFAULT_BRANCH_NAMES` in `lib/dataset-filters.ts`. */}
          {!isDefaultBranch(ds.branchName) && (
            <Badge variant="secondary">{ds.branchName}</Badge>
          )}
          {/* Mutually exclusive: when the synthesizer is processing, we
              surface "Processing" only and skip the Draft pill (the
              dataset is mid-enrichment, "is it draft or processing"
              is a confusing parallel question — Processing wins).
              Once enrichment finishes, the Draft pill returns. Same
              rule as DatasetCard's status pill block. */}
          {processing ? (
            <Badge variant="secondary" title="Synthesizer enrichment in progress">
              Processing
            </Badge>
          ) : (
            ds.isPublished === false && <Badge variant="secondary">draft</Badge>
          )}
        </div>
      </CardHeader>

      <CardBody className="space-y-4 text-sm">
        {abstract && (
          <p className="text-fg-secondary text-[13px] leading-relaxed">
            {abstract}
          </p>
        )}

        {(ds.contributors?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-fg-muted flex items-center gap-1 uppercase tracking-wide">
              <Users className="h-3 w-3" /> Contributors
            </h3>
            <ul className="space-y-0.5 text-xs">
              {ds.contributors!.map((c, i) => (
                <ContributorRow key={`${c.firstName}-${c.lastName}-${i}`} c={c} />
              ))}
            </ul>
          </div>
        )}

        {(ds.correspondingAuthors?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide">
              Corresponding authors
            </h3>
            <ul className="space-y-0.5 text-xs">
              {ds.correspondingAuthors!.map((c, i) => (
                <ContributorRow key={`${c.firstName}-${c.lastName}-${i}`} c={c} />
              ))}
            </ul>
          </div>
        )}

        {(ds.funding?.length ?? 0) > 0 && (
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wide">
              Funding
            </h3>
            <p className="text-xs text-fg-secondary">
              {ds
                .funding!.map((f) => f.source)
                .filter(Boolean)
                .join('; ')}
            </p>
          </div>
        )}

        {/* Associated publications.
            2026-04-28 (round 2) — section restructured per team review
            mock-up. The previous render shipped:
              - title hyperlink with raw `p.DOI` href (which `safeHref`
                resolved against the local origin → broke to
                `ndi-cloud.com/10.1016/...` whenever the cloud emitted a
                bare DOI rather than a doi.org URL — the "broken paper
                link" the team flagged)
              - tiny `DOI` token with no link
              - `PMID` chip linking to pubmed
              - `PMCID` chip linking to PMC, with the PMC prefix passed
                through verbatim from the cloud (some records lack the
                `PMC` prefix, breaking the URL)
            New shape:
              - Paper title links via `toDoiUrl(p.DOI)` so a bare DOI
                gets wrapped in `https://doi.org/...`
              - DOI / PMID / PMC each render as a labeled blue link with
                the value (e.g. `DOI 10.1016/j.celrep.2025.115768`)
              - PMC URL force-prefixed with `PMC` if the field doesn't
                already include it
            Hidden entirely when `associatedPublications` is empty —
            matches the design mock and avoids an empty header. */}
        {(ds.associatedPublications?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-fg-muted flex items-center gap-1 uppercase tracking-wide">
              <BookOpen className="h-3 w-3" /> Associated publications
            </h3>
            <ul className="space-y-2 text-xs">
              {ds.associatedPublications!.map((p, i) => (
                <PublicationRow key={p.DOI ?? p.PMID ?? i} p={p} />
              ))}
            </ul>
          </div>
        )}

        {/* Identifiers row.
            2026-04-28 (round 2) — restructured per team review mock-up:
              - DOI first (blue hyperlink to https://doi.org/<value>),
                normalized via `toDoiUrl` so bare DOIs wrap correctly
              - NDI ID second (gray monospace + copy button — relocated
                from the OverviewContent footer so the dataset's
                permanent identifier sits alongside the DOI rather than
                outside the card)
              - Created
              - Updated
            PubMed dropped from this block — it described a paper-level
            identifier that didn't belong on the dataset; that
            information now lives in the Associated publications section
            above. */}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-[11px] text-fg-muted font-mono border-t border-border-subtle pt-3">
          {ds.doi && (
            <>
              <dt>DOI</dt>
              <dd className="truncate min-w-0">
                <ExternalAnchor href={toDoiUrl(ds.doi) ?? ds.doi} label={ds.doi} />
              </dd>
            </>
          )}
          <dt>NDI</dt>
          <dd className="flex min-w-0 items-center gap-1.5">
            <code className="font-mono text-fg-secondary truncate">
              {datasetId}
            </code>
            <CopyButton
              value={datasetId}
              ariaLabel={`Copy NDI dataset ID ${datasetId}`}
              className="shrink-0"
            />
          </dd>
          {/*
            Audit 2026-04-27 #23 — pre-fix the row read "Org
            649b1b1bea20f31db68d4f9f" (a Mongo ObjectId) which is
            meaningless to readers. The cloud's `/api/datasets/:id`
            response returns the organization's _id only — there's
            no name in the same payload. Hiding the row entirely
            until we have a name is honest. A follow-up can resolve
            the id to a name via a separate cloud call and re-show
            the row when the name lands.

            Detection rule: render the row ONLY if `organizationId`
            exists AND doesn't look like a 24-hex Mongo ObjectId.
            The 24-hex test is the standard ObjectId shape (12-byte
            hex). User-friendly slugs (e.g. `walthamdatascience`,
            `brandeis-lab`) pass through unchanged.
          */}
          {ds.organizationId && !isMongoObjectId(ds.organizationId) && (
            <>
              <dt>Org</dt>
              <dd>{ds.organizationId}</dd>
            </>
          )}
          <dt>Created</dt>
          <dd>{formatDate(ds.createdAt)}</dd>
          <dt>Updated</dt>
          <dd>{formatDate(ds.updatedAt)}</dd>
        </dl>

        {/* Action buttons */}
        <div
          className="flex flex-wrap gap-2 border-t border-border-subtle pt-3"
          data-testid="dataset-actions"
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCiteOpen(true)}
            disabled={!summary}
            data-testid="open-cite-modal"
            aria-label="Open citation formats"
          >
            <Quote className="h-3 w-3" aria-hidden />
            Cite
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setUseDataOpen(true)}
            data-testid="open-use-data-modal"
            aria-label="Open code snippets for local analysis"
          >
            <Code2 className="h-3 w-3" aria-hidden />
            Use this data
          </Button>
        </div>
      </CardBody>
      {summary && (
        <CiteModal
          open={citeOpen}
          onClose={() => setCiteOpen(false)}
          citation={summary.citation}
        />
      )}
      <UseThisDataModal
        open={useDataOpen}
        onClose={() => setUseDataOpen(false)}
        datasetId={datasetId}
      />
    </Card>
  );
}

/* ─── Sub-row renderers (unchanged semantics, token-migrated colors) ─── */

function ContributorRow({ c }: { c: Contributor }) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  if (!name && !c.contact) return null;
  // `normalizeOrcid` returns undefined for unrecognized shapes so we
  // simply don't render the affordance — the cloud API sometimes ships
  // bare `NNNN-NNNN-NNNN-NNNN` ids which would resolve against our own
  // origin if we linked naively.
  const orcidHref = normalizeOrcid(c.orcid);
  return (
    <li className="flex items-center gap-1.5">
      <span className="text-fg-secondary">{name || c.contact}</span>
      {orcidHref && (
        <ExternalAnchor
          href={orcidHref}
          label="ORCID"
          className="text-[10px]"
          iconSize={10}
        />
      )}
    </li>
  );
}

function PublicationRow({ p }: { p: AssociatedPublication }) {
  const title = p.title || p.DOI || p.PMID || 'Publication';
  // Resolve the paper DOI to an absolute https://doi.org URL — the
  // cloud's `associatedPublications[].DOI` is sometimes a bare DOI
  // (`10.1016/j.celrep.2025.115768`) which `safeHref` would otherwise
  // resolve against the current origin, producing the broken
  // `ndi-cloud.com/10.1016/...` link the round-2 team review flagged.
  const paperHref = toDoiUrl(p.DOI);
  // PMC ids in the cloud field are inconsistent: some records ship
  // `PMC12294564`, some ship the bare numeric `12294564`. The PMC URL
  // shape REQUIRES the `PMC` prefix, so we force it. Stripping any
  // existing prefix first prevents the double-prefix `PMCPMC...` case.
  const pmcId = p.PMCID
    ? `PMC${p.PMCID.replace(/^PMC/i, '')}`
    : undefined;
  return (
    // `min-w-0 overflow-hidden` on the <li> so the ExternalAnchor / long
    // title can truncate with ellipsis rather than pushing the sidebar
    // card wider. Publication titles are a full sentence; DOIs are long
    // URLs. Same class of bug Steve caught on the dataset DOI row.
    <li className="min-w-0 space-y-1 overflow-hidden">
      {paperHref ? (
        <ExternalAnchor
          href={paperHref}
          label={title}
          className="text-xs leading-snug"
        />
      ) : (
        <span className="block truncate text-fg-secondary">{title}</span>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono">
        {paperHref && p.DOI && (
          <ExternalAnchor
            href={paperHref}
            label={`DOI ${p.DOI.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '')}`}
            iconSize={10}
            className="text-[10px]"
          />
        )}
        {p.PMID && (
          <ExternalAnchor
            href={`https://pubmed.ncbi.nlm.nih.gov/${p.PMID}/`}
            label={`PMID ${p.PMID}`}
            iconSize={10}
            className="text-[10px]"
          />
        )}
        {pmcId && (
          <ExternalAnchor
            href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/`}
            label={pmcId}
            iconSize={10}
            className="text-[10px]"
          />
        )}
      </div>
    </li>
  );
}

/**
 * Mongo ObjectId test — 24 lowercase hex chars. Used to suppress the
 * "Org" row when the cloud only ships the organization's `_id`
 * (audit 2026-04-27 #23). Slugs and human-readable names pass
 * through unchanged.
 */
function isMongoObjectId(s: string): boolean {
  return /^[0-9a-f]{24}$/i.test(s);
}
