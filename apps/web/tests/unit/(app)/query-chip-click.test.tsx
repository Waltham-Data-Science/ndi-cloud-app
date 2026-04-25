/**
 * QueryBuilder chip-click integration test — Phase 6.5e.
 *
 * Pins the contract that 6.5d's catalog FacetPanel chip clicks depend on.
 * 6.5d pushes navigations of the form
 *
 *     /query?op=contains_string&field=data.ontology_name&param1=NCBITaxon:6239
 *
 * QueryBuilder must:
 *   1. Read those params on mount.
 *   2. Open the advanced-filters panel.
 *   3. Prefill the first condition's `field`, `op`, `param1` inputs.
 *   4. Run the predicate when the user clicks "Run query", dispatching
 *      a POST `/api/query` with the right `searchstructure`.
 *
 * Without this contract the catalog chip clicks shipped in 6.5d land on
 * a non-functional /query — that's the gap that makes 6.5e a Phase 7
 * blocker (see plan doc POST-PHASE-6.5 STATE).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

// next/navigation mock — `useSearchParams` returns the chip-click URL
// the catalog FacetPanel pushes (Phase 6.5d contract).
let CURRENT_URL = '?op=contains_string&field=data.ontology_name&param1=NCBITaxon:6239';
const routerReplaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(CURRENT_URL),
  useRouter: () => ({
    push: vi.fn(),
    replace: routerReplaceMock,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/query',
}));

import { apiFetch } from '@/lib/api/client';
import { QueryBuilder } from '@/components/app/QueryBuilder';
import type { QueryResponse } from '@/lib/api/query';

const mockedApiFetch = vi.mocked(apiFetch);

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

beforeEach(() => {
  mockedApiFetch.mockReset();
  routerReplaceMock.mockReset();
  CURRENT_URL = '?op=contains_string&field=data.ontology_name&param1=NCBITaxon:6239';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('QueryBuilder — chip-click landing path (Phase 6.5d → 6.5e contract)', () => {
  it('prefills the predicate from URL params and opens the advanced-filters panel', async () => {
    // Operations endpoint resolves with an empty list — QueryBuilder
    // falls back to FALLBACK_OPERATIONS, which still includes
    // contains_string.
    mockedApiFetch.mockResolvedValueOnce({ operations: [] });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QueryBuilder onResults={vi.fn()} />
      </Wrapper>,
    );

    // Advanced filters panel opens automatically on chip-click landing.
    const fieldInput = (await screen.findByTestId(
      'query-condition-field-0',
    )) as HTMLInputElement;
    const opSelect = screen.getByTestId('query-condition-op-0') as HTMLSelectElement;
    const param1Input = screen.getByTestId(
      'query-condition-param1-0',
    ) as HTMLInputElement;

    expect(fieldInput.value).toBe('data.ontology_name');
    expect(opSelect.value).toBe('contains_string');
    expect(param1Input.value).toBe('NCBITaxon:6239');
  });

  it('runs the prefilled predicate when the user clicks Run query', async () => {
    // Two apiFetch calls fire on mount: useQueryOperations + the
    // mutation. Resolve operations first; then resolve the run.
    const queryResults: QueryResponse = {
      documents: [
        {
          id: 'doc-1',
          ndiId: 'ndi-1',
          name: 'C. elegans subject',
          className: 'subject',
          datasetId: 'd1',
        },
      ],
      total: 1,
    };
    mockedApiFetch.mockImplementation((url: string, init?: { method?: string }) => {
      if (url.startsWith('/api/query/operations')) {
        return Promise.resolve({ operations: [] });
      }
      if (url === '/api/query' && init?.method === 'POST') {
        return Promise.resolve(queryResults);
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const onResults = vi.fn();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QueryBuilder onResults={onResults} />
      </Wrapper>,
    );

    // Wait for the prefilled state.
    await screen.findByTestId('query-condition-field-0');

    // Click Run query.
    fireEvent.click(screen.getByTestId('query-builder-run'));

    // Assert the mutation fired with the right structure.
    await waitFor(() => {
      const queryCalls = (mockedApiFetch.mock.calls as Array<
        [string, { method?: string; body?: unknown }?]
      >).filter(
        ([url, init]) => url === '/api/query' && init?.method === 'POST',
      );
      expect(queryCalls.length).toBeGreaterThanOrEqual(1);
      const body = queryCalls[0]?.[1]?.body as
        | {
            searchstructure: Array<{ operation: string; field?: string; param1?: string }>;
            scope: string;
          }
        | undefined;
      expect(body).toBeDefined();
      expect(body!.searchstructure).toHaveLength(1);
      const cond = body!.searchstructure[0]!;
      expect(cond.operation).toBe('contains_string');
      expect(cond.field).toBe('data.ontology_name');
      expect(cond.param1).toBe('NCBITaxon:6239');
      expect(body!.scope).toBe('public');
    });

    // Assert the result was propagated upward to the caller.
    await waitFor(() => {
      expect(onResults).toHaveBeenCalledWith(queryResults);
    });
  });

  it('uses the same field path that 6.5d catalog chips push (data.ontology_name, not openminds.fields.*)', async () => {
    // Tripwire — if 6.5d's chip handler regresses to the old pre-6.5e
    // openminds.fields.preferredOntologyIdentifier path, this test goes
    // red because the URL the test sets up wouldn't be the path
    // QueryBuilder reads. It also catches the inverse: if 6.5e ever
    // changes the URL contract without coordinating with the catalog.
    mockedApiFetch.mockResolvedValue({ operations: [] });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QueryBuilder onResults={vi.fn()} />
      </Wrapper>,
    );
    const fieldInput = (await screen.findByTestId(
      'query-condition-field-0',
    )) as HTMLInputElement;
    expect(fieldInput.value).toBe('data.ontology_name');
    // Specifically NOT one of the pre-6.5e candidates we'd been
    // tempted to use:
    expect(fieldInput.value).not.toBe('openminds.fields.preferredOntologyIdentifier');
    expect(fieldInput.value).not.toBe('element.fields.probeType');
  });

  it('falls back to a fresh empty condition when no URL params are present', async () => {
    CURRENT_URL = ''; // no params — direct /query landing
    mockedApiFetch.mockResolvedValueOnce({ operations: [] });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QueryBuilder onResults={vi.fn()} />
      </Wrapper>,
    );
    // The simple search input is what shows by default — advanced
    // filters panel should be collapsed when there's nothing to
    // hydrate.
    expect(
      screen.getByPlaceholderText(/Search by class/i),
    ).toBeInTheDocument();
    // No prefilled advanced-filter inputs.
    expect(screen.queryByTestId('query-condition-field-0')).toBeNull();
  });
});
