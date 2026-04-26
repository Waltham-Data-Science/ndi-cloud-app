/**
 * /my workspace integration — Phase 6.6 REBUILD-6.
 *
 * Pins the contract for the rebuilt MyDatasetsClient:
 *   1. Glassmorphic hero with depth-gradient bg + brandmark pattern +
 *      4-column HeroStat grid (Total / Published / Storage / Orgs).
 *   2. Admin badge + scope toggle render only when `useSession` exposes
 *      `user.isAdmin === true`. Non-admin sessions never see them.
 *   3. View toggle (grid ↔ table). Grid renders DatasetCard per dataset.
 *      Table renders the audit-#64 virtualized MyDatasetsTable. Toggle
 *      flips the view.
 *   4. Status filter chips (All / Published / Draft) drive a
 *      client-side filter over the loaded datasets.
 *
 * Pre-rebuild verification confirmed `/api/auth/me` already carries
 * `isAdmin` from FastAPI (`MeResponse.is_admin` → `auth.py:97-109`).
 * The monorepo's `AuthUser` type was discarding the field; this PR
 * extends the type so `useSession()` surfaces it. Frontend-only fix
 * — no backend coordination required.
 */
import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
} from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { AuthUser } from '@/lib/api/auth';
import type { DatasetListResponse, DatasetRecord } from '@/lib/api/datasets';
import { mockAuthUser } from '@/tests/fixtures/auth';

// `MyDatasetsTable` from Phase 3c (audit #64 virtualized table) wraps
// `useVirtualizer` from `@tanstack/react-virtual`, which doesn't measure
// in jsdom. Mock to return the full row range so visible-count
// assertions are predictable. Same pattern as the existing
// `my-datasets-virtualization.test.tsx`.
vi.mock('@tanstack/react-virtual', () => {
  return {
    useVirtualizer: ({ count }: { count: number }) => ({
      getVirtualItems: () =>
        Array.from({ length: count }, (_, i) => ({
          index: i,
          start: i * 56,
          size: 56,
          key: i,
          end: (i + 1) * 56,
          lane: 0,
        })),
      getTotalSize: () => count * 56,
      measureElement: vi.fn(),
    }),
  };
});

const routerReplaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: routerReplaceMock,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { MyDatasetsClient } from '@/app/(app)/my/my-datasets-client';

function makeRecord(overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: 'd1',
    name: 'Default name',
    isPublished: true,
    publishStatus: 'published',
    totalSize: 1024 * 1024,
    ...overrides,
  };
}

function withSession(
  user: AuthUser | null,
  myDatasets: DatasetListResponse,
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  // Seed the session cache directly so `useSession()` resolves
  // synchronously (no `me()` fetch). The hook reads `['session']`.
  qc.setQueryData<AuthUser | null>(['session'], user);
  // Seed the my-datasets query under the scope=mine key (default).
  qc.setQueryData<DatasetListResponse>(
    ['datasets', 'my', 'mine'],
    myDatasets,
  );
  qc.setQueryData<DatasetListResponse>(
    ['datasets', 'my', 'all'],
    myDatasets,
  );
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

beforeEach(() => {
  routerReplaceMock.mockReset();
});

describe('/my workspace — Phase 6.6 REBUILD-6', () => {
  it('renders the depth-gradient hero with eyebrow + h1 + 4 HeroStat cards', () => {
    const Wrapper = withSession(
      mockAuthUser({ organizationIds: ['o1'] }),
      {
        datasets: [makeRecord({ totalSize: 2 * 1024 * 1024 })],
        totalNumber: 1,
      } as DatasetListResponse,
    );
    render(
      <Wrapper>
        <MyDatasetsClient />
      </Wrapper>,
    );

    expect(
      screen.getByRole('heading', { level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Total datasets')).toBeInTheDocument();
    // "Published" appears in both the HeroStat label AND the filter
    // chip — assert at least one match rather than exact-one.
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
    expect(screen.getByText('Storage used')).toBeInTheDocument();
    expect(screen.getByText('Organizations')).toBeInTheDocument();
  });

  it('hides the scope toggle and admin badge for non-admin sessions', () => {
    const Wrapper = withSession(
      mockAuthUser({ isAdmin: false }),
      {
        datasets: [makeRecord()],
        totalNumber: 1,
      } as DatasetListResponse,
    );
    render(
      <Wrapper>
        <MyDatasetsClient />
      </Wrapper>,
    );
    expect(screen.queryByTestId('my-scope-toggle')).toBeNull();
    expect(screen.queryByText(/^admin$/i)).toBeNull();
  });

  it('shows the scope toggle and admin badge for admin sessions', () => {
    const Wrapper = withSession(
      mockAuthUser({ isAdmin: true }),
      {
        datasets: [makeRecord()],
        totalNumber: 1,
      } as DatasetListResponse,
    );
    render(
      <Wrapper>
        <MyDatasetsClient />
      </Wrapper>,
    );
    expect(screen.getByTestId('my-scope-toggle')).toBeInTheDocument();
    // Admin badge sits in the eyebrow row.
    expect(screen.getByText(/^admin$/i)).toBeInTheDocument();
    // Both scope-toggle buttons are accessible.
    expect(
      screen.getByRole('button', { name: /My org only/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /All orgs/i }),
    ).toBeInTheDocument();
  });

  it('view toggle flips between grid and table; grid renders DatasetCard, table renders virtualized rows', () => {
    const Wrapper = withSession(
      mockAuthUser(),
      {
        datasets: [
          makeRecord({ id: 'd1', name: 'First dataset' }),
          makeRecord({ id: 'd2', name: 'Second dataset' }),
        ],
        totalNumber: 2,
      } as DatasetListResponse,
    );
    render(
      <Wrapper>
        <MyDatasetsClient />
      </Wrapper>,
    );

    // Grid is the default — both dataset names render.
    expect(screen.getAllByText('First dataset').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Second dataset').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Table view/i }));
    // After swap, the dense table header should render.
    expect(
      screen.getAllByRole('columnheader').length,
    ).toBeGreaterThan(0);
  });

  it('status filter narrows visible datasets (Published filter hides drafts)', () => {
    const Wrapper = withSession(
      mockAuthUser(),
      {
        datasets: [
          makeRecord({
            id: 'pub',
            name: 'Pub dataset',
            isPublished: true,
            publishStatus: 'published',
          }),
          makeRecord({
            id: 'draft',
            name: 'Draft dataset',
            isPublished: false,
            publishStatus: 'draft',
          }),
        ],
        totalNumber: 2,
      } as DatasetListResponse,
    );
    render(
      <Wrapper>
        <MyDatasetsClient />
      </Wrapper>,
    );

    // The "Published" filter chip — locate via aria-pressed semantics
    // (multiple elements contain "Published" text; the chip is a
    // `<button aria-pressed>` with text starting with "Published"). Note:
    // the chip text concatenates "Published" + count, so we use
    // `startsWith` rather than `\b` boundary (digit-letter is not a
    // word boundary in JS regex).
    const publishedChip = screen.getAllByRole('button').find(
      (b) =>
        b.textContent?.startsWith('Published') &&
        b.hasAttribute('aria-pressed'),
    );
    expect(publishedChip).toBeDefined();
    fireEvent.click(publishedChip!);

    expect(screen.getByText(/Pub dataset/i)).toBeInTheDocument();
    expect(screen.queryByText(/Draft dataset/i)).toBeNull();
  });

  it('redirects unauthenticated sessions to /login?returnTo=/my', () => {
    const Wrapper = withSession(null, {
      datasets: [],
      totalNumber: 0,
    } as DatasetListResponse);
    render(
      <Wrapper>
        <MyDatasetsClient />
      </Wrapper>,
    );
    expect(routerReplaceMock).toHaveBeenCalledWith('/login?returnTo=/my');
  });
});
