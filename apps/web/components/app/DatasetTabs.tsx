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
 * **2026-04-28 (this PR): Pivot tab removed.** The /pivot/[grain]
 * surface was retired — the table never matched any concrete user
 * workflow (no clear pivot story across NDI's session/element/subject
 * grains, low click-through, the FEATURE_PIVOT_V1 flag stayed off in
 * prod). The route + proxy + component are deleted in this same PR.
 * The "Summary tables" tab is now the only summary-tables surface;
 * legacy `/pivot/*` deeplinks are caught by the dataset's not-found.
 *
 * `<Link>` from `next/link` is rendered as a real `<a>` tag, so
 * `role="tab"` rides on top — semantics + standard navigation, both.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, type KeyboardEvent } from 'react';
import {
  BookOpen,
  FolderOpen,
  LayoutDashboard,
  Table2,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/cn';
import { useTutorialAvailability } from '@/lib/data/tutorials';

interface TabSpec {
  id: 'overview' | 'tables' | 'documents' | 'tutorials';
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
   * as selected. Each tab owns its own URL prefix; the matchers are
   * intentionally non-overlapping.
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
    isActive: (path, id) => path.startsWith(`/datasets/${id}/tables`),
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
  {
    // 2026-04-28 — Tutorials tab. Initial PR #130 gated visibility on
    // a hardcoded set of two dataset ids; this PR replaces that with
    // a HEAD probe against the tutorials S3 bucket so any dataset the
    // data team uploads to `ndi-cloud-tutorials.s3.us-east-2.amazonaws.com`
    // lights up automatically. The probe runs in
    // `useTutorialAvailability` (see `lib/data/tutorials.ts`) and the
    // gate fires below in the render path — `isAvailable` is gone
    // because the predicate is async now and lives inside the
    // component body. See `components/app/TutorialView.tsx` for the
    // iframe render and the post-resolve language-pill behavior.
    id: 'tutorials',
    label: 'Tutorial',
    icon: BookOpen,
    href: (id) => `/datasets/${id}/tutorials`,
    isActive: (path, id) => path.startsWith(`/datasets/${id}/tutorials`),
  },
];

export function DatasetTabs({ datasetId }: { datasetId: string }) {
  const pathname = usePathname() ?? '';
  const tablistRef = useRef<HTMLDivElement>(null);
  // Async tutorial availability — when the probe hasn't resolved yet
  // or returned `hasAny: false`, the Tutorials tab is hidden. No
  // skeleton/placeholder by design: a flickering tab that vanishes
  // when the probe 404s reads worse than a tab that simply appears
  // once we know it's real. Probe is cached for 5 minutes per dataset
  // id (see `useTutorialAvailability`).
  const { data: tutorialAvailability } = useTutorialAvailability(datasetId);
  const showTutorialTab = tutorialAvailability?.hasAny ?? false;

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
      {/* At <375px viewports the four tab labels (Overview /
          Summary tables / Document explorer / Tutorial) total ~340px
          of intrinsic width before padding, which forced wrapping or
          overflow without a scroll affordance. `overflow-x-auto` lets
          the tablist scroll horizontally on phones; `px-7` matches the
          page chrome on both sides; tabs themselves keep `whitespace-
          nowrap` so labels don't break mid-word. The scroll container
          loses focus-ring at the tab boundary but tabs still get the
          standard `focus-visible` ring per below. */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Dataset sections"
        onKeyDown={onKeyDown}
        className="mx-auto flex max-w-[1200px] items-center gap-1 px-4 sm:px-7 overflow-x-auto whitespace-nowrap"
      >
        {TABS.filter((tab) => {
          // Tutorials tab is the only tab with conditional visibility.
          // Every other tab always renders.
          if (tab.id === 'tutorials') return showTutorialTab;
          return true;
        }).map((tab) => {
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
                // `shrink-0` keeps each tab its full intrinsic width
                // inside the overflow-x-auto tablist; without it the
                // flex layout would compress tabs to fit and break
                // the `whitespace-nowrap` label rule on mobile.
                '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-[13.5px] font-medium transition-colors',
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
