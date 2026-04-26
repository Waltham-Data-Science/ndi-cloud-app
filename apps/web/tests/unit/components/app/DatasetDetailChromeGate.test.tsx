/**
 * DatasetDetailChromeGate — Phase 6.6 REBUILD-8.
 *
 * The dataset-detail layout (`/datasets/[id]/layout.tsx`) renders the
 * dataset hero + tab bar above every nested route. That's correct for
 * the four primary tabs (Overview, Tables, Pivot, Documents/explorer)
 * but visually misleading on the document detail drilldown
 * (`/datasets/[id]/documents/[docId]`) — the source data-browser had
 * document detail rendered "outside the Outlet" with its own hero.
 *
 * Phase 3b shipped a `documents/[docId]/layout.tsx` passthrough that
 * couldn't actually opt out of the parent layout (Next.js layouts
 * nest). REBUILD-8 fixes this by introducing a client-component gate
 * that reads `usePathname()` and skips the chrome at the
 * document-detail URL.
 *
 * Contract under test:
 *   - At `/datasets/d1/overview` (or any non-document-detail URL),
 *     the gate renders `<DatasetDetailHero>` + `<DatasetTabs>` + the
 *     constrained-width section wrapper.
 *   - At `/datasets/d1/documents/abc123` (the document-detail URL),
 *     the gate renders ONLY `{children}` — no hero, no tabs, no
 *     constrained section. The children are rendered raw so the
 *     document-detail page can ship its own full-bleed hero.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

let CURRENT_PATHNAME = '/datasets/d1/overview';

vi.mock('next/navigation', () => ({
  usePathname: () => CURRENT_PATHNAME,
  useParams: () => ({ id: 'd1' }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

import { DatasetDetailChromeGate } from '@/components/app/DatasetDetailChromeGate';

function withClient(children: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return (
    <QueryClientProvider client={qc}>
      {children}
    </QueryClientProvider>
  );
}

describe('DatasetDetailChromeGate — Phase 6.6 REBUILD-8', () => {
  it('renders dataset hero + tabs at /datasets/[id]/overview', () => {
    CURRENT_PATHNAME = '/datasets/d1/overview';
    render(
      withClient(
        <DatasetDetailChromeGate datasetId="d1">
          <p data-testid="content-marker">tab content</p>
        </DatasetDetailChromeGate>,
      ),
    );
    // DatasetTabs renders a tablist with role="tablist".
    expect(
      screen.getByRole('tablist', { name: /Dataset sections/i }),
    ).toBeInTheDocument();
    // Children are still rendered (inside the section).
    expect(screen.getByTestId('content-marker')).toBeInTheDocument();
  });

  it('renders dataset hero + tabs at /datasets/[id]/tables/[className]', () => {
    CURRENT_PATHNAME = '/datasets/d1/tables/subject';
    render(
      withClient(
        <DatasetDetailChromeGate datasetId="d1">
          <p data-testid="content-marker">table content</p>
        </DatasetDetailChromeGate>,
      ),
    );
    expect(
      screen.getByRole('tablist', { name: /Dataset sections/i }),
    ).toBeInTheDocument();
  });

  it('renders dataset hero + tabs at /datasets/[id]/documents (the explorer)', () => {
    CURRENT_PATHNAME = '/datasets/d1/documents';
    render(
      withClient(
        <DatasetDetailChromeGate datasetId="d1">
          <p data-testid="content-marker">explorer content</p>
        </DatasetDetailChromeGate>,
      ),
    );
    expect(
      screen.getByRole('tablist', { name: /Dataset sections/i }),
    ).toBeInTheDocument();
  });

  it('HIDES dataset hero + tabs at /datasets/[id]/documents/[docId]', () => {
    CURRENT_PATHNAME = '/datasets/d1/documents/abc123';
    render(
      withClient(
        <DatasetDetailChromeGate datasetId="d1">
          <p data-testid="content-marker">document detail content</p>
        </DatasetDetailChromeGate>,
      ),
    );
    expect(
      screen.queryByRole('tablist', { name: /Dataset sections/i }),
    ).toBeNull();
    // Children still render — just without the parent chrome.
    expect(screen.getByTestId('content-marker')).toBeInTheDocument();
  });

  it('handles trailing slash on the document detail URL', () => {
    CURRENT_PATHNAME = '/datasets/d1/documents/abc123/';
    render(
      withClient(
        <DatasetDetailChromeGate datasetId="d1">
          <p data-testid="content-marker">document detail trailing</p>
        </DatasetDetailChromeGate>,
      ),
    );
    expect(
      screen.queryByRole('tablist', { name: /Dataset sections/i }),
    ).toBeNull();
  });

  it('does not match a different dataset id (regression check on path-anchored regex)', () => {
    CURRENT_PATHNAME = '/datasets/d2/documents/abc123';
    render(
      withClient(
        <DatasetDetailChromeGate datasetId="d1">
          <p data-testid="content-marker">cross-dataset</p>
        </DatasetDetailChromeGate>,
      ),
    );
    // datasetId="d1" but URL is for d2 — wouldn't normally happen but
    // assert the regex is anchored on the actual datasetId so other
    // datasets' document-detail URLs render with chrome (proving the
    // gate is dataset-scoped, not pattern-scoped).
    expect(
      screen.getByRole('tablist', { name: /Dataset sections/i }),
    ).toBeInTheDocument();
  });
});
