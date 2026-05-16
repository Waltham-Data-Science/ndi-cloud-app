/**
 * `/my/workspace/[id]/structure` — class browser (Phase A scaffold).
 *
 * Phase B fills this with the full class-browser layout (sortable
 * list of all 11+ NDI document classes with counts + drill-in links).
 * Phase A shows a placeholder that points users at the existing
 * `/datasets/[id]/documents` surface — which already provides the
 * raw document browsing experience the Structure tab will eventually
 * mirror inside the workspace.
 */
import type { Metadata } from 'next';
import { Workflow } from 'lucide-react';

import { WorkspaceComingSoonPlaceholder } from '@/components/workspace/WorkspaceComingSoonPlaceholder';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Structure',
  description:
    'Browse every NDI document class in this dataset with counts and drill-in.',
  robots: { index: false, follow: false },
};

export default async function WorkspaceStructurePage({ params }: PageProps) {
  const { id } = await params;
  return (
    <WorkspaceComingSoonPlaceholder
      tabName="Structure"
      icon={Workflow}
      description="The Structure tab will surface every NDI document class in this dataset with per-class counts, sort + filter, and direct drill into the underlying documents."
      planned={[
        'All 11+ document classes (subject, element, treatment, ontologyTableRow, …) in one list',
        'Per-class counts with sort + filter',
        'One-click drill into the Summary Tables surface, scoped to the class',
        'Show-code helper that copies the equivalent Python / MATLAB snippet',
      ]}
      alternative={{
        label: 'Document Explorer',
        href: `/datasets/${id}/documents`,
        description:
          'The existing Document Explorer is the raw-document surface that the Structure tab will eventually wrap inside the workspace. Filter by class, drill into individual documents, walk the depends_on graph.',
      }}
    />
  );
}
