'use client';

/**
 * WorkspaceAuthGate — preserves the existing client-side auth flow for
 * `/my/workspace/[id]/*` after the Phase A layout split.
 *
 * Pre-redesign (`workspace-client.tsx`) the auth check lived in the
 * single client component that owned the whole workspace. After the
 * Phase A split, the hero + tabbar are server-rendered (right H1 on
 * first paint, share-preview-safe), and the auth gate has to wrap
 * just the tab content — anything we want gated behind `useSession`.
 *
 * The gate behavior is unchanged from the pre-redesign component:
 *   - `session.isLoading`         → render a skeleton block
 *   - `session.user === null`     → redirect to /login?returnTo=<current path>
 *                                   render a "Redirecting…" line
 *   - authenticated user          → render `children`
 *
 * `returnTo` uses the current `usePathname()` (not a hardcoded id) so
 * the user lands back on the exact tab they were trying to reach.
 *
 * The hero + tabbar are intentionally NOT gated — they paint with
 * public dataset metadata which is the same content `/datasets/[id]`
 * already shows. A brief flash of the hero before redirect is fine
 * and matches the dataset-detail-hero pattern.
 */
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { Skeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/lib/auth/use-session';

interface WorkspaceAuthGateProps {
  datasetId: string;
  children: ReactNode;
}

export function WorkspaceAuthGate({
  datasetId,
  children,
}: WorkspaceAuthGateProps) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? `/my/workspace/${datasetId}`;

  useEffect(() => {
    if (!session.isLoading && session.user === null) {
      // Preserve the user's intended tab in returnTo. The redirect
      // target is whatever URL they originally tried to load
      // (including query params? `usePathname` returns just the
      // pathname; for v1 we encode just that. URL state — selection,
      // filters, ask mode — re-derives once the user is back).
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [session.isLoading, session.user, router, pathname]);

  if (session.isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] px-7 py-12">
        <div className="space-y-4">
          <Skeleton className="h-16 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (session.user === null) {
    return (
      <div className="mx-auto max-w-[1200px] px-7 py-20 flex items-center justify-center">
        <p className="text-sm text-fg-muted">Redirecting to sign in…</p>
      </div>
    );
  }

  return <>{children}</>;
}
