'use client';

/**
 * /my/ask client — auth-gated wrapper around the existing AskShell.
 *
 * Stream 3.1 (2026-05-15). Mirrors the workspace-client pattern at
 * `app/(app)/my/workspace/[id]/workspace-client.tsx`:
 *
 *   - Anonymous user → redirect to /login with returnTo=/my/ask
 *   - Session loading → render skeleton
 *   - `canUseAsk === false` → render "feature not enabled for your
 *     org" notice with a contact-ops affordance (Stream 3.4 gate)
 *   - Otherwise → render the existing AskShell unchanged
 *
 * Until Stream 3.1 fully lands (route deprecation of /ask), the
 * anonymous-public `/(marketing)/ask` route remains the active
 * experimental surface. This client is the auth-gated alternative
 * that admins + ask-enabled-org users land on when they click the
 * /my nav.
 */
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { AskShell } from '@/app/(marketing)/ask/ask-shell';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/lib/auth/use-session';

export function MyAskClient() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (!session.isLoading && session.user === null) {
      router.replace(`/login?returnTo=${encodeURIComponent('/my/ask')}`);
    }
  }, [session.isLoading, session.user, router]);

  if (session.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-7 py-10 bg-bg-canvas space-y-4">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (session.user === null) {
    return (
      <div className="mx-auto max-w-3xl px-7 py-20 text-center bg-bg-canvas">
        <p className="text-sm text-fg-muted">Redirecting to sign in…</p>
      </div>
    );
  }

  // Stream 3.4 — per-org feature gate. Defaults to true when the
  // FastAPI build hasn't shipped `canUseAsk` yet (older deploy),
  // so this branch only triggers when the gate is explicitly off
  // for this user's org set.
  if (session.user.canUseAsk === false) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="text-[24px] font-semibold text-fg-primary">
          Ask isn&rsquo;t enabled for your organization yet.
        </h1>
        <p className="mt-3 text-[15px] text-fg-secondary leading-relaxed">
          The experimental chat is rolling out to subscribing
          organizations on an opt-in basis. Reach out to NDI Cloud
          ops at{' '}
          <a
            className="text-brand-blue hover:underline"
            href="mailto:info@walthamdatascience.com?subject=Enable%20Ask%20for%20my%20organization"
          >
            info@walthamdatascience.com
          </a>{' '}
          to request access. We&rsquo;ll have you set up the same day.
        </p>
        <p className="mt-3 text-[12.5px] text-fg-muted">
          In the meantime, the published-dataset catalog,
          per-dataset workspace, and Document Explorer are all
          available from your dashboard.
        </p>
      </div>
    );
  }

  return <AskShell />;
}
