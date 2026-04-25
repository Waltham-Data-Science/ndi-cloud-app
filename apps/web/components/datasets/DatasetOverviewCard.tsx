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
import { ExternalAnchor } from '@/components/ui/ExternalAnchor';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { formatDate } from '@/lib/format';
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
  const abstract = ds.description ?? ds.abstract;
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
          {ds.license && <Badge variant="outline">{ds.license}</Badge>}
          {ds.branchName && ds.branchName !== 'main' && (
            <Badge variant="secondary">{ds.branchName}</Badge>
          )}
          {ds.isPublished === false && <Badge variant="secondary">draft</Badge>}
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

        {(ds.associatedPublications?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-fg-muted flex items-center gap-1 uppercase tracking-wide">
              <BookOpen className="h-3 w-3" /> Associated publications
            </h3>
            <ul className="space-y-1 text-xs">
              {ds.associatedPublications!.map((p, i) => (
                <PublicationRow key={p.DOI ?? p.PMID ?? i} p={p} />
              ))}
            </ul>
          </div>
        )}

        {/* Identifiers row */}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px] text-fg-muted font-mono border-t border-border-subtle pt-3">
          {ds.doi && (
            <>
              <dt>DOI</dt>
              <dd className="truncate">
                <ExternalAnchor href={ds.doi} label={ds.doi} />
              </dd>
            </>
          )}
          {ds.pubMedId && (
            <>
              <dt>PubMed</dt>
              <dd>
                <ExternalAnchor
                  href={`https://pubmed.ncbi.nlm.nih.gov/${ds.pubMedId}/`}
                  label={ds.pubMedId}
                />
              </dd>
            </>
          )}
          {ds.organizationId && (
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
  // `min-w-0 overflow-hidden` on the <li> so the ExternalAnchor / long
  // title can truncate with ellipsis rather than pushing the sidebar
  // card wider. Publication titles are a full sentence; DOIs are long
  // URLs. Same class of bug Steve caught on the dataset DOI row.
  return (
    <li className="min-w-0 space-y-0.5 overflow-hidden">
      {p.DOI ? (
        <ExternalAnchor
          href={p.DOI}
          label={title}
          className="text-xs leading-snug"
        />
      ) : (
        <span className="block truncate text-fg-secondary">{title}</span>
      )}
      <div className="flex flex-wrap gap-2 text-[10px] text-fg-muted font-mono">
        {p.DOI && <span>DOI</span>}
        {p.PMID && (
          <ExternalAnchor
            href={`https://pubmed.ncbi.nlm.nih.gov/${p.PMID}/`}
            label={`PMID ${p.PMID}`}
            iconSize={10}
            className="text-[10px]"
          />
        )}
        {p.PMCID && (
          <ExternalAnchor
            href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${p.PMCID}/`}
            label={p.PMCID}
            iconSize={10}
            className="text-[10px]"
          />
        )}
      </div>
    </li>
  );
}
