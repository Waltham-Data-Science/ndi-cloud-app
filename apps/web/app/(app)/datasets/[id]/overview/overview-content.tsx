'use client';

/**
 * Overview tab content — Phase 3b shell.
 *
 * Reads the dataset record + summary via TanStack Query and renders
 * a compact factsheet (name, abstract, license, DOI, contributors,
 * dates). The richer DatasetSummaryCard + DatasetProvenanceCard +
 * citation modal port lands as a follow-up — those components
 * (~800 LOC combined) deserve their own PR with tests.
 *
 * The layout's hero already covers the title + byline + DOI; this body
 * renders the abstract + descriptive blocks underneath.
 */
import { useDataset, useDatasetSummary } from '@/lib/api/datasets';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';

export function OverviewContent({ datasetId }: { datasetId: string }) {
  const { data, isLoading, isError } = useDataset(datasetId);
  const summary = useDatasetSummary(datasetId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-dashed border-border-subtle bg-bg-surface p-6 text-center">
        <p className="text-sm text-fg-secondary">
          Couldn&rsquo;t load dataset {datasetId}.
        </p>
      </div>
    );
  }

  const abstract = data.abstract ?? data.description;

  return (
    <div className="space-y-4 max-w-[800px]">
      {abstract && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">About this dataset</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-fg-secondary leading-relaxed whitespace-pre-line">
              {abstract}
            </p>
          </CardBody>
        </Card>
      )}

      {(summary.data?.species?.length || summary.data?.brainRegions?.length) && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Highlights</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {summary.data?.species?.map((s) => (
                <Badge
                  key={`species-${s.label}`}
                  variant="teal"
                  className="font-mono normal-case"
                >
                  {s.label}
                </Badge>
              ))}
              {summary.data?.brainRegions?.map((r) => (
                <Badge
                  key={`region-${r.label}`}
                  variant="outline"
                  className="font-mono normal-case"
                >
                  {r.label}
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <p className="text-xs text-fg-muted italic max-w-prose">
        Phase 3b structural shell — the full Overview (synthesized
        DatasetSummaryCard + DatasetProvenanceCard + citation modal +
        document-class index) ports as a follow-up to this PR. The
        Phase 3b deliverable is the tab-bar a11y fix (audit #65) and
        the layout that hosts these tabs.
      </p>
    </div>
  );
}
