'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useSession } from '@/lib/auth/use-session';
import { commonsSearchUrl, myWorkspaceUrl } from '@/lib/urls';
import { AccountSidebar } from '@/components/app/AccountSidebar';
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
 * redirect happens client-side in a useEffect — the Edge Middleware
 * (`apps/web/middleware.ts`) is intentionally scoped to Origin /
 * CSP work and does not perform cookie-based 302s. See `/my/page.tsx`
 * for the rationale on keeping auth-gate client-side.
 */
export function MyAccountClient() {
  const router = useRouter();
  const { user, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login?returnTo=/my-account');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="px-7 py-20 bg-bg-canvas flex items-center justify-center">
        <p className="text-fg-muted text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="px-7 py-10 bg-bg-canvas">
      <div className="max-w-[1100px] mx-auto">
        {/* Breadcrumb — restored after visual-comparison audit #8
            flagged it as dropped during the App Router port. Source
            used MUI <Breadcrumbs> with a "›" separator; ported here
            as a plain <nav> + lucide ChevronRight icon to keep
            components/app/** MUI-free. */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm text-fg-muted mb-6"
        >
          <Link
            href="/my-account"
            className="hover:text-fg-primary transition-colors duration-(--duration-fast)"
          >
            My Account
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <span className="text-fg-primary font-medium">Account Info</span>
        </nav>

        {/* Sidebar + content layout — restored from source's
            AccountSidebar shape (audit #9). Sidebar is sticky on
            desktop so the nav stays in view when the content card
            grows; collapses to a top-row on mobile so it doesn't
            consume vertical space. */}
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
          <aside className="md:sticky md:top-6 md:self-start">
            <AccountSidebar />
          </aside>

          <div className="min-w-0 space-y-6">
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm">
              <h1 className="text-[1.5rem] font-bold text-fg-primary mb-1 m-0">
                Account Info
              </h1>
              <p className="text-sm text-fg-muted mb-5 m-0">
                Profile data on your active session. Some fields are
                derived from the cookie session payload (Phase 6.7 B4)
                rather than the user record.
              </p>
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
                value={new Date(user.issuedAt * 1000).toLocaleString('en-US')}
              />
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-fg-primary mb-4 m-0">
                Workspaces
              </h2>
              <p className="text-sm text-fg-secondary mb-4 m-0">
                Your data-browser views — datasets, bookmarks, and the
                public Data Commons.
              </p>
              <div className="flex gap-3 flex-wrap">
                <MarketingButton
                  as="a"
                  href={myWorkspaceUrl()}
                  variant="cta"
                  size="md"
                >
                  Open my workspace →
                </MarketingButton>
                <MarketingButton
                  as="a"
                  href={commonsSearchUrl()}
                  variant="outline"
                  size="md"
                >
                  Data Commons →
                </MarketingButton>
              </div>
            </div>
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
