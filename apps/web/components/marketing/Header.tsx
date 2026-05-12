'use client';

import MenuIcon from '@mui/icons-material/Menu';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type CSSProperties, type MouseEvent } from 'react';

import { logout } from '@/lib/api/auth';
import { commonsSearchUrl, myWorkspaceUrl } from '@/lib/urls';
import { useSession } from '@/lib/auth/use-session';

/**
 * Inline external-link glyph. Replaces the FontAwesome `faExternalLink`
 * import from the source repo — a single 14-byte SVG doesn't justify
 * pulling in the FA runtime + free-solid set (~50 KB gz to the nav
 * chunk). This is the only icon that needed replacing during the port.
 */
function ExternalLinkIcon({
  size = 12,
  style,
}: {
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

type NavLink = {
  label: string;
  href: string;
  /**
   * Truly external — auxiliary reference like Docs on GitHub Pages.
   * Opens in a new tab with an external-link icon. Cross-domain links
   * to our OWN product surfaces (formerly app.ndi-cloud.com, now same
   * apex) leave `external` undefined so they open same-tab and feel
   * like one product to the user.
   */
  external?: boolean;
};

// Data Commons used to be cross-domain at https://app.ndi-cloud.com/datasets;
// post-unification it's same-origin /datasets. Same-tab navigation is
// unchanged because the apex was the goal of the migration.
//
// 2026-04-28 — "For Labs" (/products/private-cloud) hidden from the
// top nav pre-launch (team review feedback). The page describes the
// future Data Browser product, but the working pipeline still runs
// on Nansen, so the team flagged the page as misleading-by-promise.
// The page itself stays reachable at /products/private-cloud (still
// works for direct links / search-engine crawls), it's just not
// promoted from the marketing nav. The home-page bridge row that
// pointed at it is also disabled with a "Coming soon" badge — see
// BridgeRow in `app/(marketing)/page.tsx`. Restore this line when
// the product is ready to ship.
const baseNavLinks: NavLink[] = [
  { label: 'Data Commons', href: commonsSearchUrl() },
  { label: 'LabChat', href: '/products/labchat' },
  { label: 'Platform', href: '/platform' },
  { label: 'About', href: '/about' },
  { label: 'Docs', href: 'https://vh-lab.github.io/NDI-matlab/', external: true },
];

// 2026-05-11 — experimental "Ask" preview. Hidden behind an env
// flag so the link only appears when explicitly enabled per
// environment. The /ask route + /api/ask handler are separately
// gated by ANTHROPIC_API_KEY; this flag controls just the nav
// surface. Insertion point is between Platform and About so it
// reads as a product surface, not a peripheral.
const ASK_ENABLED = process.env.NEXT_PUBLIC_ASK_ENABLED === '1';

const navLinks: NavLink[] = ASK_ENABLED
  ? [
      baseNavLinks[0]!, // Data Commons
      baseNavLinks[1]!, // LabChat
      baseNavLinks[2]!, // Platform
      { label: 'Ask', href: '/ask' },
      baseNavLinks[3]!, // About
      baseNavLinks[4]!, // Docs
    ]
  : baseNavLinks;

export function Header() {
  const { user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  // Responsive nav uses CSS media-query classes (Tailwind `min-[900px]:*`)
  // rather than MUI's `useMediaQuery`. The latter returns `false` during
  // SSR (no `window.matchMedia`) and then the real value after hydration,
  // which used to produce a React hydration mismatch (#418) on every
  // page paint — the server rendered the desktop tree, the client
  // hydrated as the mobile tree (or vice versa) and React tore them
  // apart. CSS-only responsiveness renders both trees in the SSR HTML
  // and hides one via `display: none`; no JS branch involved.
  const [anchorMobileNav, setAnchorMobileNav] = useState<HTMLElement | null>(null);
  const [anchorUser, setAnchorUser] = useState<HTMLElement | null>(null);

  const isActive = (href: string): boolean => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  /**
   * Real logout: POST /api/auth/logout (FastAPI clears HttpOnly + CSRF
   * cookies server-side), then clear the WHOLE TanStack cache (not just
   * `['session']`) so persisted queries from the previous user — saved
   * dataset lists, /my workspace data, etc. — don't leak across logouts
   * via the localStorage persister. Then route to /login.
   *
   * Pattern matches `my-account-client.tsx::handleLogout`. Wrapping the
   * API call in try/finally ensures the local teardown runs even if
   * the network call fails — the user perceives logout success and the
   * next /api/auth/me catches any still-valid cookie.
   *
   * Phase 6.7 cutover-blocker B5 — replaces the Phase 2a stub that
   * just routed to /login without clearing the session.
   */
  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Even if the API call fails, locally treat the session as gone.
      // The Vercel function logs will capture the failure.
    }
    queryClient.clear();
    router.push('/login');
  }

  const openMobileMenu = (e: MouseEvent<HTMLElement>) => setAnchorMobileNav(e.currentTarget);
  const closeMobileMenu = () => setAnchorMobileNav(null);
  const openUserMenu = (e: MouseEvent<HTMLElement>) => setAnchorUser(e.currentTarget);
  const closeUserMenu = () => setAnchorUser(null);

  const handleMobileNav = (link: NavLink) => {
    closeMobileMenu();
    if (link.external) {
      window.open(link.href, '_blank', 'noopener,noreferrer');
    } else {
      router.push(link.href);
    }
  };

  return (
    <nav
      id="top"
      aria-label="Primary"
      className="sticky top-0 z-[1100] bg-black/92 backdrop-blur-md text-white shadow-nav border-b border-white/5"
    >
      <div className="max-w-[1200px] mx-auto px-7 py-3.5 max-nav:px-4.5 max-nav:py-3 flex items-center gap-7 max-nav:gap-3">
        <Link href="/" aria-label="NDI Cloud home" className="flex items-center shrink-0">
          <Image
            src="/logos/ndicloud-wordmark-horizontal.svg"
            alt="NDI Cloud"
            width={121}
            height={22}
            priority
            // brightness(0) + invert(1) recolors the brand wordmark to
            // crisp white over the dark glass nav background.
            className="block h-[22px] w-auto brightness-0 invert"
          />
        </Link>

        <div className="hidden min-[900px]:flex gap-1.5 ml-3 items-center">
            {navLinks.map((link) =>
              link.external ? (
                // `inline-flex items-center gap-1` so the trailing
                // ExternalLinkIcon stays glued to the "Docs" label as a
                // single un-breakable inline-flex line. Pre-fix the icon
                // was a separate inline-flow sibling — the browser saw a
                // line-break opportunity between the text node and the
                // SVG and wrapped the icon to the next line whenever the
                // nav was even slightly tight, breaking header height
                // consistency. (User-reported, 2026-04-27.) The
                // `whitespace-nowrap` belt holds even if a future style
                // ever drops `flex` semantics.
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 whitespace-nowrap text-[13.5px] font-medium px-3 py-2 rounded-md text-white/85 hover:text-white hover:bg-white/5 no-underline transition-all duration-(--duration-base) ease-(--ease-out)"
                >
                  {link.label}
                  <ExternalLinkIcon size={11} style={{ opacity: 0.6 }} />
                </a>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className={clsx(
                    'text-[13.5px] font-medium px-3 py-2 rounded-md no-underline transition-all duration-(--duration-base) ease-(--ease-out)',
                    isActive(link.href)
                      ? 'text-brand-blue-3 opacity-100'
                      : 'text-white/85 hover:text-white hover:bg-white/5',
                  )}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              ),
            )}
            {/* Phase 6.6 PR-I polish: auth-gated nav. Logged-in users
             * get Query + My Workspace surfaced in the desktop nav so
             * they're one click away from anywhere on the marketing
             * site. Visually separated from the marketing nav by a
             * thin white-alpha vertical rule so it's clear these are
             * a different category of link (app routes, not marketing
             * pages). */}
            {user && (
              <>
                <span
                  aria-hidden
                  className="inline-block h-5 w-px bg-white/15 mx-1"
                />
                <Link
                  href="/query"
                  className={clsx(
                    'text-[13.5px] font-medium px-3 py-2 rounded-md no-underline transition-all duration-(--duration-base) ease-(--ease-out)',
                    isActive('/query')
                      ? 'text-brand-blue-3'
                      : 'text-white/85 hover:text-white hover:bg-white/5',
                  )}
                  aria-current={isActive('/query') ? 'page' : undefined}
                >
                  Query
                </Link>
                <Link
                  href={myWorkspaceUrl()}
                  className={clsx(
                    'text-[13.5px] font-medium px-3 py-2 rounded-md no-underline transition-all duration-(--duration-base) ease-(--ease-out)',
                    isActive(myWorkspaceUrl())
                      ? 'text-brand-blue-3'
                      : 'text-white/85 hover:text-white hover:bg-white/5',
                  )}
                  aria-current={isActive(myWorkspaceUrl()) ? 'page' : undefined}
                >
                  My Workspace
                </Link>
              </>
            )}
          </div>

        <div className="flex-1" />

        <div className="min-[900px]:hidden">
            <IconButton
              onClick={openMobileMenu}
              sx={{ color: 'white' }}
              aria-label="Open navigation menu"
            >
              <MenuIcon />
            </IconButton>
            <Menu
              anchorEl={anchorMobileNav}
              open={Boolean(anchorMobileNav)}
              onClose={closeMobileMenu}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              {navLinks.map((link) => (
                <MenuItem key={link.label} onClick={() => handleMobileNav(link)}>
                  {link.label}
                  {link.external && (
                    <>
                      &nbsp;
                      <ExternalLinkIcon size={11} />
                    </>
                  )}
                </MenuItem>
              ))}
              {/* Phase 6.6 PR-I polish: auth-gated mobile nav (Query +
               * My Workspace) parallels the desktop addition above. */}
              {user && (
                <>
                  <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0.5rem 0' }} />
                  <MenuItem
                    onClick={() => {
                      closeMobileMenu();
                      router.push('/query');
                    }}
                  >
                    Query
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeMobileMenu();
                      router.push(myWorkspaceUrl());
                    }}
                  >
                    My Workspace
                  </MenuItem>
                </>
              )}
              <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0.5rem 0' }} />
              {user ? (
                <>
                  <MenuItem onClick={() => { closeMobileMenu(); router.push('/my-account'); }}>
                    My Account
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeMobileMenu();
                      void handleLogout();
                    }}
                  >
                    Log out
                  </MenuItem>
                </>
              ) : (
                <>
                  <MenuItem onClick={() => { closeMobileMenu(); router.push('/login'); }}>
                    Log in
                  </MenuItem>
                  <MenuItem onClick={() => { closeMobileMenu(); router.push('/create-account'); }}>
                    Create Free Account
                  </MenuItem>
                </>
              )}
            </Menu>
        </div>

        <div className="hidden min-[900px]:flex gap-2.5 items-center">
            {user ? (
              <>
                <button
                  type="button"
                  className="text-[13px] font-semibold px-4.5 py-1.5 rounded-pill bg-transparent text-white/85 border border-white/20 hover:bg-white/8 hover:text-white transition-all duration-(--duration-base) ease-(--ease-out) cursor-pointer"
                  onClick={openUserMenu}
                  aria-haspopup="menu"
                  aria-expanded={Boolean(anchorUser)}
                >
                  My Account
                </button>
                <Menu
                  anchorEl={anchorUser}
                  open={Boolean(anchorUser)}
                  onClose={closeUserMenu}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                >
                  <MenuItem onClick={() => { closeUserMenu(); router.push('/my-account'); }}>
                    Account
                  </MenuItem>
                  <MenuItem
                    component="a"
                    href={myWorkspaceUrl()}
                    onClick={closeUserMenu}
                  >
                    Bookmarks
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeUserMenu();
                      void handleLogout();
                    }}
                  >
                    Log out
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="text-[13px] font-semibold px-4.5 py-1.5 rounded-pill bg-transparent text-white/85 border border-white/20 hover:bg-white/8 hover:text-white transition-all duration-(--duration-base) ease-(--ease-out) cursor-pointer"
                  onClick={() => router.push('/login')}
                >
                  Log in
                </button>
                <button
                  type="button"
                  className="text-[13px] font-semibold px-4.5 py-1.5 rounded-pill bg-ndi-teal text-white shadow-cta hover:-translate-y-px hover:shadow-[0_6px_22px_rgba(15,110,86,0.35)] transition-all duration-(--duration-base) ease-(--ease-out) cursor-pointer"
                  onClick={() => router.push('/create-account')}
                >
                  Create Free Account
                </button>
              </>
            )}
          </div>
      </div>
    </nav>
  );
}
