'use client';

/**
 * WorkspaceCTA — call-to-action that surfaces the /my/workspace/[id]
 * working surface from the public dataset detail pages.
 *
 * Closes Task-3 follow-up gap #4 (sign-up funnel): the public catalog
 * lets anonymous users BROWSE every published dataset, but the path
 * from "I see what's here" → "I want to plot / compute on it" was
 * invisible. This component makes that path one click for both
 * signed-out and signed-in visitors.
 *
 *   - **Signed-out:** "Sign in to plot, compute, and export this
 *     dataset →" → /login?returnTo=/my/workspace/[id]. Post-login
 *     the user lands directly in the workspace for the dataset they
 *     were viewing.
 *
 *   - **Signed-in:** "Open this dataset in your workspace →" →
 *     /my/workspace/[id]. No auth detour needed.
 *
 * Visually a single-line CTA card with brand-blue accent — small
 * enough not to dominate the overview surface, prominent enough that
 * a visitor reading the abstract can't miss the next action.
 *
 * Sized + positioned so it slots into the top of the OverviewContent
 * grid (above the existing two-column body) without disturbing the
 * abstract / sidecar layout. SSR-safe — uses `useSession` which
 * resolves to the signed-out shape during prerender and switches to
 * signed-in once the session cache hydrates.
 */
import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { useSession } from '@/lib/auth/use-session';

interface WorkspaceCTAProps {
  datasetId: string;
}

export function WorkspaceCTA({ datasetId }: WorkspaceCTAProps) {
  const { user, isLoading } = useSession();

  // During the brief session-resolve window, render the signed-out
  // shape — the auth check is cheap and the CTA is non-destructive
  // either way (both states route into the workspace on click).
  const isSignedIn = !!user && !isLoading;

  const href = isSignedIn
    ? `/my/workspace/${datasetId}`
    : `/login?returnTo=${encodeURIComponent(`/my/workspace/${datasetId}`)}`;

  const label = isSignedIn
    ? 'Open this dataset in your workspace'
    : 'Sign in to plot, compute, and export this dataset';

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 no-underline transition-all hover:border-brand-blue/60 hover:bg-brand-blue/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
    >
      <span
        aria-hidden
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-blue/15 text-brand-blue"
      >
        <Sparkles className="h-4 w-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-semibold text-fg-primary">
          {label}
        </span>
        <span className="block text-[12px] text-fg-secondary">
          Plot signals, run group comparisons, walk provenance, and copy out
          the equivalent Python / MATLAB code.
        </span>
      </span>
      <ArrowRight
        aria-hidden
        className="h-4 w-4 shrink-0 text-brand-blue transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
