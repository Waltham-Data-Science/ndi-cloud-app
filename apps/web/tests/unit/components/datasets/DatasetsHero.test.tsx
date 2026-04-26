/**
 * DatasetsHero — Phase 6.6 REBUILD-4.
 *
 * The catalog page's full-bleed depth-gradient hero band, ported from
 * `ndi-data-browser-v2/frontend/src/pages/DatasetsPage.tsx:144-234`.
 *
 * Contract under test:
 *   1. Eyebrow + H1 + intro paragraph render.
 *   2. Search form submission pushes `?q=<value>` to the catalog URL via
 *      `useRouter().push` (URL state, not local state — REBUILD-5 reads
 *      `?q=` to filter visible results).
 *   3. Popular-search chip click pushes `?q=<chip-label>`.
 *   4. The "Published datasets" stat reads `data.totalNumber` from the
 *      shared `usePublishedDatasets(1, 20)` cache and runs it through
 *      `formatNumber` (1234 → "1,234").
 *   5. The other three stats render static label/value pairs ("Crossref",
 *      "OpenMINDS", "No login required") — no backend dependency.
 *
 * The "client-side stats" decision per the plan-of-record: there is no
 * `/api/datasets/stats` endpoint on the FastAPI proxy — the only dynamic
 * stat is the published-dataset count, and that comes from the existing
 * `/api/datasets/published` envelope's `totalNumber` field. This avoids a
 * second request per catalog mount and reuses the prefetched RSC cache.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

const routerPushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/datasets',
}));

import { DatasetsHero } from '@/components/datasets/DatasetsHero';
import type { DatasetListResponse } from '@/lib/api/datasets';

beforeEach(() => {
  routerPushMock.mockReset();
});

function withSeed(total: number) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  // Seed the same query key the catalog RSC prefetches so the hero's
  // `usePublishedDatasets(1, 20)` resolves synchronously without hitting
  // the network.
  qc.setQueryData<DatasetListResponse>(
    ['datasets', 'published', 1, 20],
    {
      datasets: [],
      totalNumber: total,
    } as DatasetListResponse,
  );
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

describe('DatasetsHero — Phase 6.6 REBUILD-4', () => {
  it('renders eyebrow, H1, and intro paragraph', () => {
    const Wrapper = withSeed(42);
    render(
      <Wrapper>
        <DatasetsHero />
      </Wrapper>,
    );
    expect(
      screen.getByText(/NDI Data Commons.*Open access/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Discover published neuroscience datasets/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Faceted search across every dataset/i),
    ).toBeInTheDocument();
  });

  it('search submission pushes ?q=<value> to the catalog URL', () => {
    const Wrapper = withSeed(42);
    render(
      <Wrapper>
        <DatasetsHero />
      </Wrapper>,
    );
    const input = screen.getByRole('searchbox', {
      name: /Search datasets/i,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'orientation tuning' } });
    fireEvent.click(screen.getByRole('button', { name: /^Search$/ }));
    expect(routerPushMock).toHaveBeenCalledWith(
      '/datasets?q=orientation+tuning',
    );
  });

  it('search submission with whitespace-only value clears ?q', () => {
    const Wrapper = withSeed(42);
    render(
      <Wrapper>
        <DatasetsHero />
      </Wrapper>,
    );
    const input = screen.getByRole('searchbox', {
      name: /Search datasets/i,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /^Search$/ }));
    // Empty/whitespace search drops the param entirely so the URL stays
    // clean (matches source: `setParam('q', draftQ.trim() || null)`).
    expect(routerPushMock).toHaveBeenCalledWith('/datasets');
  });

  it('clicking a popular-search chip pushes that term to ?q', () => {
    const Wrapper = withSeed(42);
    render(
      <Wrapper>
        <DatasetsHero />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mus musculus' }));
    expect(routerPushMock).toHaveBeenCalledWith('/datasets?q=Mus+musculus');
  });

  it('renders Published datasets stat with formatNumber(totalNumber)', () => {
    const Wrapper = withSeed(1234);
    render(
      <Wrapper>
        <DatasetsHero />
      </Wrapper>,
    );
    expect(screen.getByText('Published datasets')).toBeInTheDocument();
    // Intl.NumberFormat default locale formats 1234 as "1,234". Match
    // either the en-US comma or any thousands separator (CI runs in en-US
    // by default but be tolerant if the runner's locale shifts).
    expect(screen.getByText(/^1[,.]?234$/)).toBeInTheDocument();
  });

  it('renders three static stats (Crossref, OpenMINDS, No login required)', () => {
    const Wrapper = withSeed(0);
    render(
      <Wrapper>
        <DatasetsHero />
      </Wrapper>,
    );
    expect(screen.getByText('DOI coverage')).toBeInTheDocument();
    expect(screen.getByText('Crossref')).toBeInTheDocument();
    expect(screen.getByText('Metadata standard')).toBeInTheDocument();
    expect(screen.getByText('OpenMINDS')).toBeInTheDocument();
    expect(screen.getByText('Access')).toBeInTheDocument();
    expect(screen.getByText('No login required')).toBeInTheDocument();
  });
});
