'use client';

/**
 * Summary tables tab content shell — Phase 3b. Provides the per-class
 * sub-nav (subject / element / element_epoch / treatment / ...) so the
 * URL contract is in place for follow-up content port. Each sub-nav
 * link routes to `/datasets/[id]/tables/[className]` and the active
 * class is reflected in the styling.
 */
import Link from 'next/link';

import { cn } from '@/lib/cn';
import { Card, CardBody } from '@/components/ui/Card';

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

      <Card>
        <CardBody>
          <p className="text-sm text-fg-secondary">
            Summary table for <span className="font-mono font-medium text-fg-primary">{activeClass}</span>{' '}
            in dataset <span className="font-mono font-medium text-fg-primary">{datasetId}</span>.
          </p>
          <p className="text-xs text-fg-muted mt-3 italic">
            Phase 3b structural shell. The TanStack Table-backed
            `SummaryTableView` (with virtualized rows + ontology popovers
            + cell-detail hover) ports in a follow-up to this PR. The
            tab bar a11y close (audit #65) is the deliverable that
            blocks Phase 3c onward.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
