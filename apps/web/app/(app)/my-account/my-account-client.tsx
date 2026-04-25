'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { logout } from '@/lib/api/auth';
import { useSession } from '@/lib/auth/use-session';
import { commonsSearchUrl, myWorkspaceUrl } from '@/lib/urls';
import { MarketingButton } from '@/components/marketing/Button';
import { Header } from '@/components/marketing/Header';
import { Footer } from '@/components/marketing/Footer';

/**
 * /my-account — authenticated user landing.
 *
 * Phase 2b minimum: shows the user's profile (email, name), wires
 * Log out (calls logout() then invalidates session cache + routes
 * to /login), and links to the data-browser surfaces (My Workspace,
 * Data Commons). The full AccountSidebar from the source repo
 * (with "Account Info" / "Change Password" sub-pages) lands in
 * Phase 3a alongside the data-browser routes — that gives a single
 * place to share the auth-aware nav rather than re-implementing it
 * here.
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
      <>
        <Header />
        <main className="px-7 py-20 min-h-[calc(100vh-160px)] bg-bg-canvas flex items-center justify-center">
          <p className="text-fg-muted text-sm">Loading…</p>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="px-7 py-12 min-h-[calc(100vh-160px)] bg-bg-canvas">
        <div className="max-w-[800px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            Your account
          </div>
          <h1 className="text-[2rem] font-bold tracking-tight text-fg-primary leading-[1.2] mb-8 m-0">
            {user.name ?? user.email}
          </h1>

          <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm mb-6">
            <h2 className="text-base font-bold text-fg-primary mb-4 m-0">Profile</h2>
            <Row label="Email" value={user.email} />
            {user.name && <Row label="Name" value={user.name} />}
            <Row
              label="Email verified"
              value={user.emailVerified ? 'Yes' : 'Not yet'}
            />
            {user.orgs && user.orgs.length > 0 && (
              <Row
                label="Organizations"
                value={user.orgs.map((o) => o.name).join(', ')}
              />
            )}
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
      </main>
      <Footer />
    </>
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
