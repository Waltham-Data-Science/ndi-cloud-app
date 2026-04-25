'use client';

import { Card, CardBody } from '@/components/ui/Card';

export function DocumentsShell({ datasetId }: { datasetId: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-sm text-fg-secondary">
          Raw document explorer for{' '}
          <span className="font-mono font-medium text-fg-primary">{datasetId}</span>.
        </p>
        <p className="text-xs text-fg-muted mt-3 italic">
          Phase 3b structural shell. The full DocumentExplorerPage port
          (class filter, virtualized list, per-row ontology pills,
          cell-detail render) lands in a follow-up.
        </p>
      </CardBody>
    </Card>
  );
}
