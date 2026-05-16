'use client';

/**
 * WorkspaceTabs — URL-routed tab bar for `/my/workspace/[id]/*`.
 *
 * Phase A of the workspace redesign (2026-05-16 design doc). Clones
 * the `DatasetTabs` ARIA + visual pattern exactly so the workspace
 * navigation reads as a continuation of `/datasets/[id]/...`. The
 * pattern is the WAI-ARIA tablist authoring practice:
 *
 *   - `role="tablist"` on the container
 *   - `role="tab"` + `aria-selected` on each tab, derived from
 *     `usePathname()` (URL is the source of truth)
 *   - **Roving tabindex**: the active tab is `tabIndex={0}`; others
 *     are `tabIndex={-1}` and reached via ArrowLeft/Right (wrap),
 *     Home/End. Lets keyboard users move between tabs without tabbing
 *     through every tab to reach the panel below.
 *   - **URL-routed, not state-controlled**: each tab is a `next/link`
 *     `<Link>` so back/forward + deep-linking + browser nav stay in
 *     lockstep with the visible active state.
 *
 * The five workspace tabs are intentionally **fixed** (no async
 * availability gate like the Tutorials tab on `DatasetTabs`). Every
 * workspace exposes all five; tabs whose content doesn't apply for
 * the dataset render an empty-state inside, not a missing tab.
 *
 * Ask is **not** a tab. It's a workspace-level drawer affordance
 * built in Phase D; the trigger sits in the hero CTA row + a
 * keyboard shortcut. Keeping Ask out of the tab bar is a locked
 * decision (see design doc, "Decisions" section).
 */
import { BarChart3, LayoutDashboard, Microscope, Users2, Workflow } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

interface TabSpec {
  id: 'overview' | 'structure' | 'subjects' | 'sessions' | 'analyses';
  label: string;
  icon: LucideIcon;
  href: (datasetId: string) => string;
  isActive: (pathname: string, datasetId: string) => boolean;
}

const TABS: readonly TabSpec[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    href: (id) => `/my/workspace/${id}/overview`,
    isActive: (path, id) => path === `/my/workspace/${id}/overview`,
  },
  {
    id: 'structure',
    label: 'Structure',
    icon: Workflow,
    href: (id) => `/my/workspace/${id}/structure`,
    isActive: (path, id) => path.startsWith(`/my/workspace/${id}/structure`),
  },
  {
    id: 'subjects',
    label: 'Subjects',
    icon: Users2,
    href: (id) => `/my/workspace/${id}/subjects`,
    isActive: (path, id) => path.startsWith(`/my/workspace/${id}/subjects`),
  },
  {
    id: 'sessions',
    label: 'Sessions',
    icon: Microscope,
    href: (id) => `/my/workspace/${id}/sessions`,
    isActive: (path, id) => path.startsWith(`/my/workspace/${id}/sessions`),
  },
  {
    id: 'analyses',
    label: 'Analyses',
    icon: BarChart3,
    href: (id) => `/my/workspace/${id}/analyses`,
    isActive: (path, id) => path.startsWith(`/my/workspace/${id}/analyses`),
  },
];

export function WorkspaceTabs({ datasetId }: { datasetId: string }) {
  const pathname = usePathname() ?? '';
  const tablistRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!tablistRef.current) return;
    const tabs = Array.from(
      tablistRef.current.querySelectorAll<HTMLAnchorElement>('[role="tab"]'),
    );
    if (tabs.length === 0) return;
    const current = tabs.indexOf(document.activeElement as HTMLAnchorElement);
    if (current < 0) return;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (e.key === 'ArrowLeft')
      next = (current - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next !== null) {
      e.preventDefault();
      tabs[next]!.focus();
    }
  };

  return (
    <div
      className="sticky top-[58px] z-30 bg-bg-surface border-b border-border-subtle"
      style={{ boxShadow: 'var(--shadow-xs)' }}
    >
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Workspace sections"
        onKeyDown={onKeyDown}
        className="mx-auto flex max-w-[1200px] items-center gap-1 px-7"
      >
        {TABS.map((tab) => {
          const active = tab.isActive(pathname, datasetId);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href(datasetId)}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={cn(
                '-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-3 text-[13.5px] font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ndi-teal',
                active
                  ? 'border-ndi-teal text-ndi-teal'
                  : 'border-transparent text-fg-secondary hover:text-brand-navy',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
