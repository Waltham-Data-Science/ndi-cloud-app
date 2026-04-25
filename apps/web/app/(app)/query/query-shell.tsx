'use client';

/**
 * /query content shell — Phase 3e.
 *
 * The data-browser ships three coordinated components in this layout:
 *   - FacetPanel (left) — distinct-value chips backed by `useFacets`,
 *     click → seed the builder with `contains_string` on
 *     `data.ontology_name`.
 *   - QueryBuilder (center) — condition rows + "AND/OR" + scope
 *     selector + run-query button. Hydrates from URL params for
 *     ontology "Find everywhere" cross-links.
 *   - OutputShapePreview (right) — static NDI-matlab tutorial column
 *     sets for subject / probe / epoch grains.
 *
 * Phase 3e ships the structural shell. The 750-LOC content port lands
 * as a follow-up; the audit gates that this Phase 3 sub-tree was
 * blocking (#65 tab a11y, #64 MyDatasets virt, #66 OntologyPopover)
 * are all closed — Phase 4 (`/api/*` rewrite + cookie domain) is the
 * next critical unblock.
 */
import Link from 'next/link';

import { Card, CardBody } from '@/components/ui/Card';

export function QueryShell() {
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)_20rem]">
      <aside className="space-y-4 min-w-0">
        <Card>
          <CardBody>
            <p className="text-xs font-bold tracking-[0.1em] uppercase text-fg-muted mb-2">
              Facets
            </p>
            <p className="text-sm text-fg-secondary">
              Cross-dataset distinct-values chips (species / brain
              region / strain / sex / probe type).
            </p>
            <p className="text-xs text-fg-muted mt-3 italic">
              Phase 3e structural shell. The full FacetPanel + chip
              interactions port in a follow-up.
            </p>
          </CardBody>
        </Card>
      </aside>

      <section className="space-y-4 min-w-0">
        <Card>
          <CardBody>
            <p className="text-xs font-bold tracking-[0.1em] uppercase text-fg-muted mb-2">
              Query builder
            </p>
            <p className="text-sm text-fg-secondary">
              Condition rows + AND/OR + scope selector + run-query.
              Defaults to{' '}
              <code className="font-mono text-[12px]">contains</code>
              {' '}case-insensitive.
            </p>
            <p className="text-xs text-fg-muted mt-3 italic">
              Phase 3e structural shell. The full QueryBuilder + AST
              visualizer (heavy below-the-fold widget — will wrap in
              <code className="not-italic font-mono text-[11px] mx-1">next/dynamic</code>
              with <code className="not-italic font-mono text-[11px] mx-1">ssr: false</code>
              per audit #52) ports in a follow-up.
            </p>
            <p className="text-sm text-fg-secondary mt-4">
              In the meantime, browse the{' '}
              <Link href="/datasets" className="text-ndi-teal hover:underline font-semibold">
                Data Commons
              </Link>{' '}
              for individual dataset detail.
            </p>
          </CardBody>
        </Card>
      </section>

      <aside className="space-y-4 min-w-0">
        <Card>
          <CardBody>
            <p className="text-xs font-bold tracking-[0.1em] uppercase text-fg-muted mb-2">
              Output shape
            </p>
            <p className="text-sm text-fg-secondary">
              NDI-matlab tutorial column sets for subject / probe /
              epoch grains.
            </p>
            <p className="text-xs text-fg-muted mt-3 italic">
              Phase 3e structural shell.
            </p>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
