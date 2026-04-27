'use client';

/**
 * AccountSidebar — left-rail nav for /my-account.
 *
 * Ported from `ndi-web-app-wds/app/src/components/accountSidebar/
 * accountSidebar.tsx` (visual-comparison audit #9 — restored after
 * the App Router port flattened the my-account page to single-column
 * with no nav scaffolding).
 *
 * Source structure:
 *   - Account Info (active when on /my-account)
 *   - Change Password (active when on /reset-password)
 *   - hr separator
 *   - My Workspace (cross-app link to data-browser surface)
 *   - Data Commons (cross-app link to /datasets)
 *   - hr separator
 *   - Log Out (button with confirm-then-fire pattern)
 *
 * App Router differences from source:
 *   - source used `setPage(...)` state + URL `?activePage=...` query
 *     — App Router routes each page natively, so each item is just
 *     a `<Link href>` (or button for Log Out). `usePathname()`
 *     decides the active state instead of state.
 *   - source's logout flow imported the AccountContext + cleared
 *     localStorage (the old auth flow stored token + userId in
 *     localStorage). Phase 2b replaced both with the cookie-only
 *     session — logout calls `/api/auth/logout` and invalidates
 *     the `['session']` TanStack Query cache. No localStorage to
 *     clear.
 *
 * The sidebar is `<nav aria-label="Account sections">` so it groups
 * cleanly for screen-reader landmark navigation.
 */
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { logout } from '@/lib/api/auth';
import { commonsSearchUrl, myWorkspaceUrl } from '@/lib/urls';

export function AccountSidebar() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [logoutPending, setLogoutPending] = useState(false);

  async function handleLogout() {
    setLogoutPending(true);
    try {
      await logout();
    } catch {
      // Logout API failure: still clear locally — the user's intent
      // was to sign out, and our session cache is the only thing
      // controlling client-side auth-gate visibility.
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      router.push('/login');
    }
  }

  // Derive active state from URL — App Router idiom. Source used a
  // setPage state machine instead because Pages Router didn't have
  // sub-routes for these views.
  const isAccountInfo = pathname === '/my-account';
  const isChangePassword = pathname === '/reset-password';

  return (
    <nav
      aria-label="Account sections"
      className="flex flex-col gap-0.5 text-sm"
    >
      <SidebarLink href="/my-account" active={isAccountInfo}>
        Account Info
      </SidebarLink>
      <SidebarLink href="/reset-password" active={isChangePassword}>
        Change Password
      </SidebarLink>

      <hr className="my-3 border-border-subtle" />

      {/* Cross-app links — same-tab navigation since the workspace +
          commons live on the same origin post-cutover. The arrow
          glyph signals "more in this area" without "opens in new
          window" semantics. */}
      <SidebarLink href={myWorkspaceUrl()} external>
        My Workspace →
      </SidebarLink>
      <SidebarLink href={commonsSearchUrl()} external>
        Data Commons →
      </SidebarLink>

      <hr className="my-3 border-border-subtle" />

      <button
        type="button"
        onClick={handleLogout}
        disabled={logoutPending}
        className="text-left px-3 py-2 rounded-md text-red-700 hover:bg-red-50 disabled:opacity-60 transition-colors duration-(--duration-fast)"
      >
        {logoutPending ? 'Signing out…' : 'Log Out'}
      </button>
    </nav>
  );
}

function SidebarLink({
  href,
  active,
  external,
  children,
}: {
  href: string;
  active?: boolean;
  external?: boolean;
  children: React.ReactNode;
}) {
  const className = active
    ? 'block px-3 py-2 rounded-md font-semibold text-ndi-teal bg-ndi-teal-light'
    : 'block px-3 py-2 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-bg-muted transition-colors duration-(--duration-fast)';
  // External cross-app links use a plain <a> so the browser does a
  // full document navigation (matches source `accountSidebar`'s
  // `externalLink` semantics — these aren't App Router routes).
  if (external) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      className={className}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
