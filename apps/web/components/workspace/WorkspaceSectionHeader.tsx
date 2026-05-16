/**
 * WorkspaceSectionHeader — eyebrow + h2 + optional lede block.
 *
 * Phase B primitive. Mirrors the marketing-section header pattern
 * used throughout `/` and `/about`: a small uppercase teal eyebrow,
 * a bold h2 in the marketing clamp size, and an optional
 * one-sentence lede paragraph below. Keeps the workspace's section
 * dividers visually tied to the marketing site.
 *
 * Used at the top of each Overview tab section (Stat tiles row,
 * Provenance band, Starter views) and inside the Structure /
 * Subjects / Sessions tabs.
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface WorkspaceSectionHeaderProps {
  /** Uppercase teal eyebrow text — short, 2-4 words typical. */
  eyebrow: string;
  /** The main section heading. Marketing-clamp typography. */
  title: ReactNode;
  /**
   * Optional one-line description below the h2. Same font + color
   * as the marketing `.lede` lines.
   */
  description?: ReactNode;
  /**
   * Optional right-side slot — useful for "view all →" links or
   * sort/filter controls that belong at the section level.
   */
  actions?: ReactNode;
  /** Margin-bottom override; defaults to `mb-5` (20px). */
  className?: string;
}

export function WorkspaceSectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: WorkspaceSectionHeaderProps) {
  return (
    <header className={cn('mb-5', className)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-2">
            {eyebrow}
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] m-0">
            {title}
          </h2>
          {description && (
            <p className="mt-2 text-[14.5px] leading-relaxed text-fg-secondary max-w-[680px] m-0">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
}
