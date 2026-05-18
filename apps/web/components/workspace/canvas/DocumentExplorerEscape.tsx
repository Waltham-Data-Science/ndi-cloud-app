'use client';

/**
 * DocumentExplorerEscape — the SINGLE outbound link from the
 * workspace canvas to the Document Explorer at
 * `/datasets/[id]/documents`. Renders in the picker rail footer.
 *
 * Phase F2 of the one-canvas redesign. Pre-redesign there were FIVE
 * "Browse documents" / "View document" / "Browse units" links
 * scattered across the panels + ViewActionsRail — the user
 * complaint was that the workspace kept dumping them into the
 * Document Explorer and they lost context. This consolidates all
 * those outbound links into one, clearly marked as leaving the
 * workspace, and removes the rest.
 *
 * The link explicitly uses `target="_blank"` so the workspace tab
 * stays put — even if the user clicks the escape, they don't lose
 * their selection context. Returning to the workspace is just
 * "close the new tab."
 */
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/cn';

export interface DocumentExplorerEscapeProps {
  datasetId: string;
  className?: string;
}

export function DocumentExplorerEscape({
  datasetId,
  className,
}: DocumentExplorerEscapeProps) {
  return (
    <Link
      href={`/datasets/${datasetId}/documents`}
      target="_blank"
      rel="noopener"
      className={cn(
        'inline-flex items-center gap-1.5',
        'text-[11.5px] text-fg-muted hover:text-brand-blue',
        'focus-visible:outline-none focus-visible:underline',
        'transition-colors duration-(--duration-base) ease-(--ease-out)',
        className,
      )}
      title="Opens the Document Explorer in a new tab — your workspace stays put"
    >
      <ExternalLink className="h-3 w-3" aria-hidden />
      Browse all documents in Document Explorer
    </Link>
  );
}
