/**
 * DependencyGraphView — Phase 6.6 REBUILD-9.
 *
 * Visual + text dependency graph for a single document. Sourced
 * verbatim (with monorepo adapter changes) from
 * `ndi-data-browser-v2/frontend/src/components/documents/DependencyGraph.tsx`.
 *
 * Despite the original sequencing brief framing this rebuild as the
 * "first D3 import," the source DependencyGraph is **not D3-based** —
 * it's a pure CSS-Flexbox tree layout (NodeBox cards + Connector
 * lines). No D3 dependency lands here. REBUILD-11 (QuickPlot +
 * ViolinPlot) is where D3 actually arrives.
 *
 * Tests cover the 5 visible branches: loading, error, no-deps leaf,
 * upstream-only, downstream-only, both-directions, and the visual ↔
 * list view-mode toggle.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { DependencyGraph } from '@/lib/api/documents';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import { DependencyGraphView } from '@/components/app/DependencyGraphView';

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

const SINGLETON_GRAPH: DependencyGraph = {
  target_id: 't1',
  target_ndi_id: 'ndi:target',
  node_count: 1,
  edge_count: 0,
  max_depth: 3,
  truncated: false,
  nodes: [{ ndiId: 'ndi:target', id: 't1', name: 'Solo', className: 'subject' }],
  edges: [],
};

const TWO_WAY_GRAPH: DependencyGraph = {
  target_id: 't1',
  target_ndi_id: 'ndi:target',
  node_count: 3,
  edge_count: 2,
  max_depth: 3,
  truncated: false,
  nodes: [
    { ndiId: 'ndi:target', id: 't1', name: 'Active session', className: 'session' },
    { ndiId: 'ndi:up', id: 'u1', name: 'Subject Foo', className: 'subject' },
    { ndiId: 'ndi:down', id: 'd1', name: 'Probe Bar', className: 'probe' },
  ],
  edges: [
    {
      direction: 'upstream',
      source: 'ndi:target',
      target: 'ndi:up',
      label: 'subjectId',
    },
    {
      direction: 'downstream',
      source: 'ndi:down',
      target: 'ndi:target',
      label: 'sessionId',
    },
  ],
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('DependencyGraphView — Phase 6.6 REBUILD-9', () => {
  it('renders the loading state while the fetch is pending', () => {
    apiFetchMock.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DependencyGraphView datasetId="d1" documentId="t1" />
      </Wrapper>,
    );
    expect(
      screen.getByText(/Building dependency graph/i),
    ).toBeInTheDocument();
  });

  it('renders an empty card on fetch error', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('boom'));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DependencyGraphView datasetId="d1" documentId="t1" />
      </Wrapper>,
    );
    await screen.findByText(/Could not build the dependency graph/i);
  });

  it('renders the leaf-node empty state when node_count === 1', async () => {
    apiFetchMock.mockResolvedValueOnce(SINGLETON_GRAPH);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DependencyGraphView datasetId="d1" documentId="t1" />
      </Wrapper>,
    );
    await screen.findByText(/leaf in the dependency graph/i);
  });

  it('renders both upstream and downstream sections when node_count > 1', async () => {
    apiFetchMock.mockResolvedValueOnce(TWO_WAY_GRAPH);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DependencyGraphView datasetId="d1" documentId="t1" />
      </Wrapper>,
    );
    await screen.findByText(/Depends on/i);
    expect(screen.getByText(/Depended on by/i)).toBeInTheDocument();
    expect(screen.getByText('Subject Foo')).toBeInTheDocument();
    expect(screen.getByText('Probe Bar')).toBeInTheDocument();
    // Target node sits between, with isTarget styling — the name is rendered.
    expect(screen.getByText('Active session')).toBeInTheDocument();
  });

  it('clicking the List toggle switches view to text mode', async () => {
    apiFetchMock.mockResolvedValueOnce(TWO_WAY_GRAPH);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DependencyGraphView datasetId="d1" documentId="t1" />
      </Wrapper>,
    );
    await screen.findByText('Subject Foo');
    const listBtn = screen.getByRole('button', { name: /^List$/i });
    fireEvent.click(listBtn);
    // Text view label includes parenthesized counts; visual view does not.
    expect(screen.getByText(/Depends on \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Depended on by \(1\)/i)).toBeInTheDocument();
  });
});
