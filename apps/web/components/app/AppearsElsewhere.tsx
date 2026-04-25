'use client';

/**
 * AppearsElsewhere — opt-in cross-cloud reference search.
 *
 * Ported from `ndi-data-browser-v2/frontend/src/components/query/AppearsElsewhere.tsx`
 * (Phase 6.5e of the cross-repo unification — see
 * `docs/plans/cross-repo-unification-2026-04-24.md`). Single monorepo
 * adaptation: import paths `@/api/query` → `@/lib/api/query`.
 *
 * Mounts in collapsed/teaser form by default — the cross-cloud lookup is
 * expensive (fan-out across every dataset) so we don't fire it on every
 * doc detail render. A single click upgrades the request to fire.
 */
import { useState } from 'react';

import { useAppearsElsewhere } from '@/lib/api/query';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';

export function AppearsElsewhere({
  datasetId,
  documentId,
}: {
  datasetId: string;
  documentId: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const q = useAppearsElsewhere(enabled ? documentId : undefined, datasetId);

  if (!enabled) {
    return (
      <div className="rounded border border-dashed border-border-strong p-3">
        <p className="text-sm text-fg-secondary">
          Find where this document is referenced across all other datasets.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => setEnabled(true)}
        >
          Search cross-cloud
        </Button>
      </div>
    );
  }

  if (q.isLoading) {
    return <p className="text-sm text-fg-muted">Searching cross-cloud…</p>;
  }
  if (q.isError) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
        Could not complete cross-cloud search.{' '}
        <button className="underline" onClick={() => q.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  if (!q.data) return null;

  if (q.data.datasets.length === 0) {
    return <p className="text-sm text-fg-secondary">Not referenced anywhere else.</p>;
  }

  return (
    <Card>
      <CardBody>
        <h3 className="text-sm font-semibold mb-2">
          Referenced by {q.data.totalReferences} documents across{' '}
          {q.data.datasets.length} other datasets
        </h3>
        <ul className="space-y-1">
          {q.data.datasets.map((d) => (
            <li key={d.datasetId} className="text-sm">
              <a
                href={`/datasets/${d.datasetId}`}
                className="text-ndi-teal hover:underline"
              >
                {d.datasetId}
              </a>{' '}
              <span className="text-fg-muted">
                — {d.count} reference{d.count === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
