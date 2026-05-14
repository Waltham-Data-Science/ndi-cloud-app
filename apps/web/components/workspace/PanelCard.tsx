'use client';

/**
 * PanelCard — shared frame for every workspace panel.
 *
 * The /my workspace is composed of a vertical stack of panels (Dataset
 * Structure, Signal Viewer, Spike Activity, Behavioral Compare,
 * Treatment Timeline, …). Each panel has the same outer shape:
 *
 *   ┌─ Card ─────────────────────────────────────────────────┐
 *   │  Icon · Title                                          │
 *   │  Short subtitle / hint text                            │
 *   │  ┌──────────────────────────────────────────────────┐  │
 *   │  │ Parameter form / controls                        │  │
 *   │  └──────────────────────────────────────────────────┘  │
 *   │  Result area (chart / table / status / empty state)    │
 *   │  Footer:  [ Run ]   [ Show code ]                      │
 *   └────────────────────────────────────────────────────────┘
 *
 * This component owns the chrome (border, padding, header, footer
 * slot); each panel fills the body. Keeping the chrome in one place
 * means future style sweeps (rounded radius, focus rings, hover) hit
 * every panel without duplicating CSS across N files.
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface PanelCardProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /**
   * Optional footer slot. Typically the Run + Show code buttons live
   * here so they're consistently anchored at the bottom of the card.
   */
  footer?: ReactNode;
  /**
   * Optional `id` for the card heading — useful for `aria-labelledby`
   * links from inside the body (e.g., a "go back to this panel" link).
   */
  headingId?: string;
  className?: string;
}

export function PanelCard({
  icon: Icon,
  title,
  subtitle,
  children,
  footer,
  headingId,
  className,
}: PanelCardProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border-subtle bg-bg-surface shadow-sm',
        'p-6 space-y-4',
        className,
      )}
      aria-labelledby={headingId}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-blue/10 text-brand-blue"
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="flex-1 min-w-0">
          <h3
            id={headingId}
            className="text-[15px] font-semibold text-fg-primary leading-tight"
          >
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-[12.5px] text-fg-secondary leading-snug">
              {subtitle}
            </p>
          )}
        </div>
      </header>

      <div className="space-y-3">{children}</div>

      {footer && (
        <footer className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-subtle">
          {footer}
        </footer>
      )}
    </section>
  );
}
