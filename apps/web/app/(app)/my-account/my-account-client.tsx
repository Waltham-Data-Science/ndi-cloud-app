'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { logout } from '@/lib/api/auth';
import { useSession } from '@/lib/auth/use-session';
import { commonsSearchUrl, myWorkspaceUrl } from '@/lib/urls';
import { MarketingButton } from '@/components/marketing/Button';

/**
 * /my-account — authenticated user landing.
 *
 * Phase 6.7 (B4): the FastAPI cookie session never carries the
 * user's raw email, display name, or email-verification flag —
 * `MeResponse` exposes only `userId`, `email_hash` (16-char SHA-256
 * prefix), `organizationIds: string[]`, `isAdmin`, and timestamp
 * fields. Consumers that previously rendered `user.email` /
 * `user.name` / `user.emailVerified` / org names must either show
 * the hash + the user ID, or accept that those rows aren't
 * available on this surface.
 *
 * Profile rows reflect what's actually on the session: the userId
 * prefix as an "Account ID" support reference, an org-membership
 * count (no names — `MeResponse` only carries IDs), an admin badge
 * if applicable, and the session-issued time. Wires Log out (calls
 * logout() then invalidates session cache + routes to /login), and
 * links to the data-browser surfaces.
 *
 * Routes to /login if useSession() resolves to user=null. The
 * redirect happens client-side in a useEffect; Phase 5 wires Edge
 * Middleware so unauthenticated users hitting /my-account get a
 * server-side 302 to /login before any HTML ships.
 */
export function MyAccountClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading } = useSession();
  const [logoutPending, setLogoutPending] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login?returnTo=/my-account');
    }
  }, [isLoading, user, router]);

  async function handleLogout() {
    setLogoutPending(true);
    try {
      await logout();
    } finally {
      // Clear cache regardless of API outcome — even if the network
      // call failed, locally we treat the session as gone.
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      router.push('/login');
    }
  }

  if (isLoading || !user) {
    return (
      <div className="px-7 py-20 bg-bg-canvas flex items-center justify-center">
        <p className="text-fg-muted text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="px-7 py-12 bg-bg-canvas">
      <div className="max-w-[800px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            Your account
          </div>
          <h1 className="text-[2rem] font-bold tracking-tight text-fg-primary leading-[1.2] mb-8 m-0">
            Account
          </h1>

          <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm mb-6">
            <h2 className="text-base font-bold text-fg-primary mb-4 m-0">Profile</h2>
            <Row label="Account ID" value={user.userId.slice(0, 12) + '…'} />
            <Row label="Email hash" value={user.email_hash} />
            <Row
              label="Organizations"
              value={
                user.organizationIds.length === 0
                  ? 'None'
                  : `${user.organizationIds.length} ${user.organizationIds.length === 1 ? 'organization' : 'organizations'}`
              }
            />
            {user.isAdmin && <Row label="Role" value="Admin" />}
            <Row
              label="Signed in"
              value={new Date(user.issuedAt * 1000).toLocaleString()}
            />
          </div>

          <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm mb-6">
            <h2 className="text-base font-bold text-fg-primary mb-4 m-0">Workspaces</h2>
            <p className="text-sm text-fg-secondary mb-4 m-0">
              Your data-browser views — datasets, bookmarks, and the public
              Data Commons.
            </p>
            <div className="flex gap-3 flex-wrap">
              <MarketingButton as="a" href={myWorkspaceUrl()} variant="cta" size="md">
                Open my workspace →
              </MarketingButton>
              <MarketingButton as="a" href={commonsSearchUrl()} variant="outline" size="md">
                Data Commons →
              </MarketingButton>
            </div>
          </div>

          <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-fg-primary mb-4 m-0">Security</h2>
            <div className="flex gap-3 flex-wrap">
              <Link
                href="/reset-password"
                className="text-sm font-semibold text-ndi-teal hover:underline"
              >
                Change password
              </Link>
              <span className="text-border-strong">·</span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={logoutPending}
                className="text-sm font-semibold text-red-700 hover:underline disabled:opacity-60"
              >
                {logoutPending ? 'Signing out…' : 'Log out'}
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 py-2 text-sm border-b border-border-subtle last:border-b-0">
      <div className="text-xs font-bold tracking-eyebrow uppercase text-fg-muted self-center">
        {label}
      </div>
      <div className="text-fg-primary">{value}</div>
    </div>
  );
}
