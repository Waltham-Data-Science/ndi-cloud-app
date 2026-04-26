/**
 * Tests for the marketing <Header />.
 *
 * Coverage focuses on the auth-aware contract (anonymous vs authenticated
 * CTAs), active-route detection (used by `aria-current="page"` for screen
 * readers + the `text-brand-blue-3` active style), the
 * Docs-as-external-only rule (other "external" feeling links like Data
 * Commons stay same-tab per the cross-domain nav rules), and every click
 * path that mutates router state — auth pages depend on these working.
 *
 * MUI's `useMediaQuery` reads `window.matchMedia` which jsdom doesn't
 * implement; the test setup provides a stub that defaults to "desktop"
 * (`matches: false`), letting us assert the desktop branch directly. A
 * separate test forces mobile via the stub.
 *
 * The router push mock is a file-level singleton so tests can assert
 * `expect(pushMock).toHaveBeenCalledWith(...)` without per-test plumbing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { Header } from '@/components/marketing/Header';
import { useSession } from '@/lib/auth/use-session';

vi.mock('@/lib/auth/use-session');
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/',
}));

// Header.handleLogout calls `logout()` from lib/api/auth — mock so tests
// don't actually fire /api/auth/logout.
const logoutMock = vi.fn(() => Promise.resolve());
vi.mock('@/lib/api/auth', () => ({
  logout: () => logoutMock(),
}));

const mockedUseSession = vi.mocked(useSession);

// Each test gets a fresh QueryClient — `Header.handleLogout` calls
// `queryClient.clear()` which we want to spy on per-test (B5).
let testQueryClient: QueryClient;
function render(ui: ReactElement) {
  testQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return rtlRender(
    <QueryClientProvider client={testQueryClient}>{ui}</QueryClientProvider>,
  );
}

function stubMatchMedia(mobile: boolean) {
  const stub = vi.fn().mockImplementation((query: string) => ({
    matches: mobile && query.includes('max-width:900px'),
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: stub,
  });
}

beforeEach(() => {
  pushMock.mockClear();
  logoutMock.mockClear();
});

describe('Header (anonymous user, desktop)', () => {
  beforeEach(() => {
    mockedUseSession.mockReturnValue({ user: null, isLoading: false, error: null });
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the brand logo with link to home', () => {
    render(<Header />);
    const home = screen.getByRole('link', { name: /ndi cloud home/i });
    expect(home.getAttribute('href')).toBe('/');
  });

  it('renders the desktop nav links (Data Commons + product pages + external Docs)', () => {
    render(<Header />);
    expect(screen.getByRole('link', { name: /data commons/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /for labs/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^labchat$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^platform$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^about$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^docs$/i })).toBeInTheDocument();
  });

  it('opens Data Commons same-tab (cross-domain product nav rule)', () => {
    render(<Header />);
    const dc = screen.getByRole('link', { name: /data commons/i });
    expect(dc.getAttribute('href')).toBe('/datasets');
    expect(dc.getAttribute('target')).toBeNull();
  });

  it('opens Docs in a new tab with rel="noopener noreferrer"', () => {
    render(<Header />);
    const docs = screen.getByRole('link', { name: /^docs$/i });
    expect(docs.getAttribute('href')).toBe('https://vh-lab.github.io/NDI-matlab/');
    expect(docs.getAttribute('target')).toBe('_blank');
    expect(docs.getAttribute('rel')).toContain('noopener');
  });

  it('renders Log in + Create Free Account buttons when unauthenticated', () => {
    render(<Header />);
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create free account/i })).toBeInTheDocument();
    // No "My Account" button because no session.
    expect(screen.queryByRole('button', { name: /^my account$/i })).toBeNull();
  });

  it('clicking Log in routes to /login', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole('button', { name: /log in/i }));
    expect(pushMock).toHaveBeenCalledWith('/login');
  });

  it('clicking Create Free Account routes to /create-account (kebab-case)', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole('button', { name: /create free account/i }));
    expect(pushMock).toHaveBeenCalledWith('/create-account');
  });
});

describe('Header (authenticated user, desktop)', () => {
  beforeEach(() => {
    mockedUseSession.mockReturnValue({
      user: {
        id: 'u-audri',
        email: 'audri@walthamdatascience.com',
        name: 'Audri B',
        emailVerified: true,
      },
      isLoading: false,
      error: null,
    });
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the My Account dropdown trigger when authenticated', () => {
    render(<Header />);
    expect(screen.getByRole('button', { name: /^my account$/i })).toBeInTheDocument();
    // Anonymous CTAs gone.
    expect(screen.queryByRole('button', { name: /log in/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /create free account/i })).toBeNull();
  });
});

describe('Header user menu (desktop, authenticated)', () => {
  beforeEach(() => {
    mockedUseSession.mockReturnValue({
      user: {
        id: 'u-audri',
        email: 'audri@walthamdatascience.com',
        emailVerified: true,
      },
      isLoading: false,
      error: null,
    });
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the user menu and reveals Account + Bookmarks + Log out', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole('button', { name: /^my account$/i }));
    expect(screen.getByRole('menuitem', { name: /^account$/i })).toBeInTheDocument();
    // Bookmarks is the cross-domain workspace link — same-tab href to /my.
    const bookmarks = screen.getByRole('menuitem', { name: /bookmarks/i });
    expect(bookmarks.getAttribute('href')).toBe('/my');
    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
  });

  it('clicking Account in the user menu routes to /my-account', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole('button', { name: /^my account$/i }));
    await user.click(screen.getByRole('menuitem', { name: /^account$/i }));
    expect(pushMock).toHaveBeenCalledWith('/my-account');
  });

  it('clicking Log out calls logout() + clears the query cache + routes to /login (B5)', async () => {
    const user = userEvent.setup();
    render(<Header />);
    const clearSpy = vi.spyOn(testQueryClient, 'clear');
    await user.click(screen.getByRole('button', { name: /^my account$/i }));
    await user.click(screen.getByRole('menuitem', { name: /log out/i }));

    // Real backend logout (not the Phase 2a router-only stub).
    expect(logoutMock).toHaveBeenCalledTimes(1);
    // Cache leak fix: queryClient.clear drops the persisted previous-user
    // datasets / session entries so localStorage doesn't leak across users.
    expect(clearSpy).toHaveBeenCalledTimes(1);
    // Route to login last (covers the success path; the failure path is
    // covered separately).
    expect(pushMock).toHaveBeenCalledWith('/login');
  });

  it('clicking Log out completes the local teardown even when the API fails', async () => {
    logoutMock.mockRejectedValueOnce(new Error('network'));
    const user = userEvent.setup();
    render(<Header />);
    const clearSpy = vi.spyOn(testQueryClient, 'clear');
    await user.click(screen.getByRole('button', { name: /^my account$/i }));
    await user.click(screen.getByRole('menuitem', { name: /log out/i }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    // Even when /api/auth/logout fails, the local teardown still runs:
    // user perceives logout, next /api/auth/me catches any still-valid
    // cookie. Vercel function logs capture the upstream failure.
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/login');
  });
});

describe('Header (mobile, anonymous)', () => {
  beforeEach(() => {
    mockedUseSession.mockReturnValue({ user: null, isLoading: false, error: null });
    stubMatchMedia(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the hamburger MenuIcon trigger and hides the desktop link row', () => {
    render(<Header />);
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toBeInTheDocument();
    // Desktop link row hidden — Data Commons appears only via the MUI
    // <Menu> popover after the hamburger is clicked. Direct query for
    // "Data Commons" in the rendered nav root finds nothing.
    const navRoot = screen.getByRole('navigation', { name: /primary/i });
    expect(navRoot.querySelector('a[href="/datasets"]')).toBeNull();
  });

  it('opens the mobile menu and shows nav links + Log in / Create Account', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    // The MUI Menu portals into <body>; queries via the document-wide screen.
    expect(screen.getByRole('menuitem', { name: /data commons/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /create free account/i })).toBeInTheDocument();
  });

  it('clicking an internal nav menuitem routes via Next router (not window.open)', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<Header />);
    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /^platform$/i }));
    expect(pushMock).toHaveBeenCalledWith('/platform');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('clicking the external Docs menuitem opens a new window (not router.push)', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<Header />);
    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /^docs/i }));
    expect(openSpy).toHaveBeenCalledWith(
      'https://vh-lab.github.io/NDI-matlab/',
      '_blank',
      'noopener,noreferrer',
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('clicking Log in mobile menuitem routes to /login', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /log in/i }));
    expect(pushMock).toHaveBeenCalledWith('/login');
  });

  it('clicking Create Free Account mobile menuitem routes to /create-account', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /create free account/i }));
    expect(pushMock).toHaveBeenCalledWith('/create-account');
  });
});

/*
 * Phase 2b reminder DISCHARGED.
 *
 * The integration test that this it.todo was reserving lives at:
 *   apps/web/tests/unit/components/marketing/Header.auth-integration.test.tsx
 *
 * That spec exercises the full real-useSession() + apiFetch() + mocked
 * `global.fetch` chain (not the JSX-branch-only mocks used in this
 * file). Phase 6 layers a Playwright e2e on top hitting a real preview
 * deploy with a real session cookie.
 *
 * Leaving this comment block as a paper trail — if a future refactor
 * wonders why there's an extra integration spec file, this points at
 * the why.
 */

describe('Header (mobile, authenticated)', () => {
  beforeEach(() => {
    mockedUseSession.mockReturnValue({
      user: {
        id: 'u-audri',
        email: 'audri@walthamdatascience.com',
        emailVerified: true,
      },
      isLoading: false,
      error: null,
    });
    stubMatchMedia(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows My Account + Log out (not Log in / Create Account) in the mobile menu', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    expect(screen.getByRole('menuitem', { name: /my account/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^log in$/i })).toBeNull();
  });

  it('clicking My Account mobile menuitem routes to /my-account', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /^my account$/i }));
    expect(pushMock).toHaveBeenCalledWith('/my-account');
  });

  it('clicking Log out mobile menuitem calls logout() + clears cache + routes to /login (B5)', async () => {
    const user = userEvent.setup();
    render(<Header />);
    const clearSpy = vi.spyOn(testQueryClient, 'clear');
    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /log out/i }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/login');
  });
});
