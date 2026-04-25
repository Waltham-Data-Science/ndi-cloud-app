'use client';

import MenuIcon from '@mui/icons-material/Menu';
import { useMediaQuery } from '@mui/material';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { clsx } from 'clsx';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type CSSProperties, type MouseEvent } from 'react';

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

const navLinks: NavLink[] = [
  // Data Commons used to be cross-domain at https://app.ndi-cloud.com/datasets;
  // post-unification it's same-origin /datasets. Same-tab navigation is
  // unchanged because the apex was the goal of the migration.
  { label: 'Data Commons', href: commonsSearchUrl() },
  { label: 'For Labs', href: '/products/private-cloud' },
  { label: 'LabChat', href: '/products/labchat' },
  { label: 'Platform', href: '/platform' },
  { label: 'About', href: '/about' },
  { label: 'Docs', href: 'https://vh-lab.github.io/NDI-matlab/', external: true },
];

export function Header() {
  const { user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useMediaQuery('(max-width:900px)');
  const [anchorMobileNav, setAnchorMobileNav] = useState<HTMLElement | null>(null);
  const [anchorUser, setAnchorUser] = useState<HTMLElement | null>(null);

  const isActive = (href: string): boolean => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

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

        {!isMobile && (
          <div className="flex gap-1.5 ml-3">
            {navLinks.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13.5px] font-medium px-3 py-2 rounded-md text-white/85 hover:text-white hover:bg-white/5 no-underline transition-all duration-(--duration-base) ease-(--ease-out)"
                >
                  {link.label}
                  <ExternalLinkIcon size={11} style={{ marginLeft: 4, opacity: 0.6 }} />
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
          </div>
        )}

        <div className="flex-1" />

        {isMobile ? (
          <>
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
              <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0.5rem 0' }} />
              {user ? (
                <>
                  <MenuItem onClick={() => { closeMobileMenu(); router.push('/my-account'); }}>
                    My Account
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      closeMobileMenu();
                      // Phase 2b/3a wires real logout via apiFetch('/api/auth/logout');
                      // Phase 2a stub clears local session state by routing to login.
                      router.push('/login');
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
          </>
        ) : (
          <div className="flex gap-2.5 items-center">
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
                      // Phase 2b/3a: real logout. See note in mobile branch.
                      router.push('/login');
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
        )}
      </div>
    </nav>
  );
}
