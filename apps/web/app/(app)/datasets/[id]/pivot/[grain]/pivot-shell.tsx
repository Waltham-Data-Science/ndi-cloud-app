'use client';

import Link from 'next/link';

import { Card, CardBody } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

const GRAINS = [
  { id: 'subject', label: 'Per subject' },
  { id: 'session', label: 'Per session' },
  { id: 'element', label: 'Per element' },
] as const;

export function PivotShell({
  datasetId,
  grain: activeGrain,
}: {
  datasetId: string;
  grain: string;
}) {
  return (
    <div className="space-y-4">
      <nav
        aria-label="Pivot grain"
        className="flex flex-wrap gap-1.5 border-b border-border-subtle pb-3"
      >
        {GRAINS.map((g) => {
          const isActive = g.id === activeGrain;
          return (
            <Link
              key={g.id}
              href={`/datasets/${datasetId}/pivot/${g.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ndi-teal',
                isActive
                  ? 'bg-ndi-teal-light text-ndi-teal ring-1 ring-inset ring-ndi-teal-border'
                  : 'text-fg-secondary hover:bg-bg-muted hover:text-brand-navy',
              )}
            >
              {g.label}
            </Link>
          );
        })}
      </nav>

      <Card>
        <CardBody>
          <p className="text-sm text-fg-secondary">
            Pivot grid at grain <span className="font-mono font-medium text-fg-primary">{activeGrain}</span>{' '}
            for dataset <span className="font-mono font-medium text-fg-primary">{datasetId}</span>.
          </p>
          <p className="text-xs text-fg-muted mt-3 italic">
            Phase 3b structural shell. The virtualized pivot grid +
            cell-detail panel ports in a follow-up.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
