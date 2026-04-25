'use client';

/**
 * DatasetTabs — URL-routed dataset detail tab bar.
 *
 * **Audit 2026-04-23 #65 fix.** The data-browser shipped a tab bar built
 * on react-router NavLink with a custom matcher but no roving tabindex
 * + no arrow-key handling. This implementation rebuilds the tab bar
 * from scratch on the WAI-ARIA tablist authoring practice:
 *
 *   - `role="tablist"` on the container
 *   - `role="tab"` + `aria-selected` on each tab, derived from
 *     `usePathname()` (URL is the source of truth for active tab)
 *   - **Roving tabindex**: only the active tab is in the natural
 *     tab-order (`tabIndex={0}`); others sit at `tabIndex={-1}` and
 *     are reached via ArrowLeft/ArrowRight (with wrap-around) or
 *     Home/End. This is what makes a tab bar accessible by keyboard
 *     without requiring the user to tab through every tab to reach
 *     the panel below.
 *   - **URL-routed, not state-controlled**: each tab is a `next/link`
 *     `<Link>` so back/forward + deep-linking work for free, and the
 *     active state stays in lockstep with the URL during browser nav
 *     events that don't pass through React state.
 *
 * The "Summary tables" tab is the omnibus — it's active for any
 * `tables/*` AND `pivot/*` URL because pivot is conceptually a table
 * view-mode, not a separate top-level surface (matches the
 * data-browser's prefix-matching behavior).
 *
 * `<Link>` from `next/link` is rendered as a real `<a>` tag, so
 * `role="tab"` rides on top — semantics + standard navigation, both.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, type KeyboardEvent } from 'react';
import {
  FolderOpen,
  LayoutDashboard,
  Table2,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/cn';

interface TabSpec {
  id: 'overview' | 'tables' | 'documents';
  label: string;
  icon: LucideIcon;
  /**
   * `href` is the navigation target. For "Summary tables" it points
   * at the default subject view — keeps first-click behavior identical
   * to the data-browser `/tables` → `tables/subject` redirect.
   */
  href: (datasetId: string) => string;
  /**
   * `isActive` returns whether this tab should reflect the current URL
   * as selected. Custom matcher because Summary tables must light up
   * for `/tables/*` AND `/pivot/*`, not just for the canonical href.
   */
  isActive: (pathname: string, datasetId: string) => boolean;
}

const TABS: readonly TabSpec[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    href: (id) => `/datasets/${id}/overview`,
    isActive: (path, id) => path === `/datasets/${id}/overview`,
  },
  {
    id: 'tables',
    label: 'Summary tables',
    icon: Table2,
    href: (id) => `/datasets/${id}/tables/subject`,
    isActive: (path, id) =>
      path.startsWith(`/datasets/${id}/tables`) ||
      path.startsWith(`/datasets/${id}/pivot`),
  },
  {
    id: 'documents',
    label: 'Document explorer',
    icon: FolderOpen,
    href: (id) => `/datasets/${id}/documents`,
    // Match `/documents` exact + `/documents?...` but NOT
    // `/documents/[docId]` (that's the document-detail drill-down,
    // which lives outside the tab bar).
    isActive: (path, id) => {
      const base = `/datasets/${id}/documents`;
      if (path === base) return true;
      if (path.startsWith(`${base}?`)) return true;
      return false;
    },
  },
];

export function DatasetTabs({ datasetId }: { datasetId: string }) {
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
    else if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
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
        aria-label="Dataset sections"
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
