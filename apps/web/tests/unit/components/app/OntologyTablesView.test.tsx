/**
 * OntologyTablesView — Phase 6.6 REBUILD-7.
 *
 * The ontology table endpoint (`/api/datasets/:id/tables/ontology`)
 * returns `{groups: OntologyTableGroup[]}`, not the standard
 * `{columns, rows}` shape. Phase 3b's `<TableShell>` was passing the
 * "ontology" class to the standard `useSummaryTable` hook + standard
 * `<SummaryTableView>` rendering — it would have rendered an empty
 * table or worse since the response doesn't have a `rows` field.
 *
 * REBUILD-7 fixes this by branching on `activeClass === 'ontology'`
 * inside `<TableShell>` and routing to a dedicated `<OntologyTablesView>`
 * that uses `useOntologyTables` and renders an `<OntologyGroupPicker>`
 * sub-tab strip + the active group's table.
 *
 * Pre-rebuild verification confirmed the endpoint exists and the
 * monorepo's `useOntologyTables()` hook already wraps it with the right
 * type — frontend-only port.
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

import type { OntologyTablesResponse } from '@/lib/api/tables';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/datasets/d1/tables/ontology',
}));

// SummaryTableView pulls @tanstack/react-virtual; mock to deliver the
// full row range. Same pattern as the existing summary-table-view test.
vi.mock('@tanstack/react-virtual', () => ({
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
}));

import { OntologyTablesView } from '@/components/app/OntologyTablesView';

function withGroups(groups: OntologyTablesResponse['groups']) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  qc.setQueryData<OntologyTablesResponse>(
    ['table', 'd1', 'ontology'],
    { groups },
  );
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

const oneGroup: OntologyTablesResponse['groups'] = [
  {
    variableNames: ['name', 'value'],
    names: ['name', 'value'],
    ontologyNodes: ['UBERON:0001870', 'PATO:0000001'],
    rowCount: 3,
    docIds: ['d1', 'd2', 'd3'],
    table: {
      columns: [
        { key: 'name', label: 'name' },
        { key: 'value', label: 'value' },
      ],
      rows: [
        { name: 'a', value: 1 },
        { name: 'b', value: 2 },
        { name: 'c', value: 3 },
      ],
    },
  },
];

const twoGroups: OntologyTablesResponse['groups'] = [
  {
    variableNames: ['region', 'depth'],
    names: ['region', 'depth'],
    ontologyNodes: ['UBERON:0002301', 'PATO:0001595'],
    rowCount: 5,
    docIds: ['a', 'b', 'c', 'd', 'e'],
    table: {
      columns: [
        { key: 'region', label: 'region' },
        { key: 'depth', label: 'depth' },
      ],
      rows: [
        { region: 'V1', depth: 0.4 },
        { region: 'V1', depth: 0.5 },
        { region: 'V2', depth: 0.6 },
        { region: 'V2', depth: 0.7 },
        { region: 'V2', depth: 0.8 },
      ],
    },
  },
  {
    variableNames: ['drug', 'dose'],
    names: ['drug', 'dose'],
    ontologyNodes: ['CHEBI:35225', 'NCIT:C25164'],
    rowCount: 2,
    docIds: ['x', 'y'],
    table: {
      columns: [
        { key: 'drug', label: 'drug' },
        { key: 'dose', label: 'dose' },
      ],
      rows: [
        { drug: 'methylene blue', dose: 0.5 },
        { drug: 'tetrodotoxin', dose: 0.001 },
      ],
    },
  },
];

beforeEach(() => {
  // No-op — fresh QueryClient per test via the wrapper.
});

describe('OntologyTablesView — Phase 6.6 REBUILD-7', () => {
  it('shows an empty hint when the dataset has zero ontology groups', () => {
    const Wrapper = withGroups([]);
    render(
      <Wrapper>
        <OntologyTablesView datasetId="d1" />
      </Wrapper>,
    );
    expect(
      screen.getByText(/This dataset has no ontology table rows/i),
    ).toBeInTheDocument();
  });

  it('renders the single group without a picker (picker is multi-group only)', () => {
    const Wrapper = withGroups(oneGroup);
    render(
      <Wrapper>
        <OntologyTablesView datasetId="d1" />
      </Wrapper>,
    );
    // The first row's "name" cell is in the rendered table.
    expect(screen.getAllByText('a').length).toBeGreaterThan(0);
    // The picker has aria-label="Ontology groups"; with a single group
    // it should NOT render (matches source: `if (groups.length <= 1) return null`).
    expect(
      screen.queryByRole('tablist', { name: /Ontology groups/i }),
    ).toBeNull();
  });

  // 2026-04-28 — picker tab labels now read deduplicated ontology
  // prefixes (e.g. `UBERON · PATO`) instead of the first column
  // names (`region + depth`). Reviewer flagged the column-name
  // form as misleading. See `uniquePrefixes` in OntologyTablesView.
  it('renders a picker for multiple groups; clicking a tab switches the active table', () => {
    const Wrapper = withGroups(twoGroups);
    render(
      <Wrapper>
        <OntologyTablesView datasetId="d1" />
      </Wrapper>,
    );

    // First group active by default: expect the first group's column "region".
    expect(screen.getAllByText(/region/i).length).toBeGreaterThan(0);

    // Picker tabs read the ontology prefixes for each group:
    //   Group 1 ontologyNodes [UBERON:..., PATO:...] → "UBERON · PATO"
    //   Group 2 ontologyNodes [CHEBI:..., NCIT:...]  → "CHEBI · NCIT"
    expect(
      screen.getByRole('tab', { name: /UBERON.*PATO/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /CHEBI.*NCIT/i }),
    ).toBeInTheDocument();

    // Click the second group's tab.
    fireEvent.click(screen.getByRole('tab', { name: /CHEBI.*NCIT/i }));
    // The drug column header should now be visible.
    expect(screen.getAllByText(/drug/i).length).toBeGreaterThan(0);
  });

  it('truncates the picker label after 2 variable names with ellipsis', () => {
    const Wrapper = withGroups([
      {
        variableNames: ['a', 'b', 'c', 'd'],
        names: ['a', 'b', 'c', 'd'],
        ontologyNodes: [],
        rowCount: 0,
        docIds: [],
        table: { columns: [], rows: [] },
      },
      {
        variableNames: ['e', 'f'],
        names: ['e', 'f'],
        ontologyNodes: [],
        rowCount: 0,
        docIds: [],
        table: { columns: [], rows: [] },
      },
    ]);
    render(
      <Wrapper>
        <OntologyTablesView datasetId="d1" />
      </Wrapper>,
    );
    // First group label: "a + b…" (only 2 of 4 var names rendered).
    const firstTab = screen.getByRole('tab', { name: /a \+ b/i });
    expect(firstTab.textContent).toMatch(/…/);
  });
});
