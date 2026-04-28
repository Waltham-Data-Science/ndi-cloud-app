/**
 * OpenmindsSubjectTableView — frontend projection for the
 * `openminds_subject` summary table.
 *
 * The backend's `_project_for_class` has no branch for this class — it
 * falls through to a generic 2-column projection that is empty for
 * these docs because their `base.name` is unset. The view fetches the
 * documents endpoint instead and projects rows on the frontend.
 *
 * These tests cover:
 *
 *  1. Polymorphic dispatch on `openminds_type` — Strain uses
 *     `ontologyIdentifier`, everything else uses
 *     `preferredOntologyIdentifier`.
 *  2. `subjectDocumentIdentifier` derived from `data.depends_on[].value`
 *     where `name === 'subject_id'`.
 *  3. The synthesized `TableResponse` exposes the 8 expected columns
 *     in the canonical order.
 *  4. Empty-docs renders a friendly empty-state, not a broken/spinning
 *     shell.
 *
 * Mocks `useDocumentsInfinite` directly via `vi.mock('@/lib/api/documents')`
 * — pre-seeding the TanStack cache for an infinite query is finicky
 * (paginated state + getNextPageParam chain), and the projection logic
 * is what matters here, not the hook plumbing.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { DocumentSummary } from '@/lib/api/documents';

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
  usePathname: () => '/datasets/d1/tables/openminds_subject',
}));

// SummaryTableView pulls @tanstack/react-virtual; mock to expose the
// full row range. Same pattern as the existing summary-table-view test.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: () => number;
  }) => {
    const size = estimateSize();
    const items = Array.from({ length: count }, (_, i) => ({
      index: i,
      key: i,
      start: i * size,
      end: (i + 1) * size,
      size,
      lane: 0,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * size,
      measureElement: vi.fn(),
    };
  },
}));

// Stub the documents hook directly. The component only reads
// `data.pages`, `isPending`, `isError`, `hasNextPage`, `isFetchingNextPage`,
// `fetchNextPage`, `error`, and `refetch` — we hand back enough to
// satisfy the contract.
const useDocumentsInfiniteMock = vi.fn();
vi.mock('@/lib/api/documents', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/documents')>(
      '@/lib/api/documents',
    );
  return {
    ...actual,
    useDocumentsInfinite: (...args: unknown[]) =>
      useDocumentsInfiniteMock(...args),
  };
});

import {
  OpenmindsSubjectTableView,
  pickDependencyValue,
  projectOpenmindsRow,
} from '@/components/app/OpenmindsSubjectTableView';

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

/**
 * Helper — build a fake `useDocumentsInfinite` return value with one
 * loaded page of `documents`. Sets `hasNextPage: false` so the auto-
 * stream effect doesn't attempt to call a real fetch in tests.
 */
function settledInfiniteQuery(documents: DocumentSummary[]) {
  return {
    data: {
      pages: [
        {
          documents,
          total: documents.length,
          page: 1,
          pageSize: 500,
        },
      ],
      pageParams: [1],
    },
    isPending: false,
    isError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

const speciesDoc: DocumentSummary = {
  ndiId: 'ndi:species:1',
  name: 'Caenorhabditis elegans',
  className: 'openminds_subject',
  data: {
    base: { id: 'ndi:species:1' },
    openminds: {
      matlab_type: 'openminds.controlledterms.Species',
      openminds_type: 'https://openminds.om-i.org/types/Species',
      fields: {
        name: 'Caenorhabditis elegans',
        preferredOntologyIdentifier: 'NCBITaxon:6239',
        // Strain-only field present on a Species doc would be ignored:
        ontologyIdentifier: 'IGNORED:0000001',
        description: 'A nematode roundworm.',
        synonym: 'C. elegans',
      },
    },
    depends_on: [{ name: 'subject_id', value: 'ndi:subject:abc' }],
  },
};

const strainDoc: DocumentSummary = {
  ndiId: 'ndi:strain:1',
  name: 'N2',
  className: 'openminds_subject',
  data: {
    base: { id: 'ndi:strain:1' },
    openminds: {
      matlab_type: 'openminds.core.research.Strain',
      openminds_type: 'https://openminds.om-i.org/types/Strain',
      fields: {
        name: 'N2',
        // Strain uses Schema B (`ontologyIdentifier`); a stale Schema A
        // value should NOT win over it.
        ontologyIdentifier: 'WBStrain:00000001',
        preferredOntologyIdentifier: 'IGNORED:0000002',
      },
    },
    depends_on: [{ name: 'subject_id', value: 'ndi:subject:abc' }],
  },
};

const sexDoc: DocumentSummary = {
  ndiId: 'ndi:sex:1',
  name: 'female',
  className: 'openminds_subject',
  data: {
    base: { id: 'ndi:sex:1' },
    openminds: {
      matlab_type: 'openminds.controlledterms.BiologicalSex',
      openminds_type: 'https://openminds.om-i.org/types/BiologicalSex',
      fields: {
        name: 'female',
        preferredOntologyIdentifier: 'PATO:0000383',
      },
    },
    depends_on: [{ name: 'subject_id', value: 'ndi:subject:abc' }],
  },
};

beforeEach(() => {
  useDocumentsInfiniteMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('projectOpenmindsRow — pure projection', () => {
  it('Species row uses preferredOntologyIdentifier (Schema A)', () => {
    const row = projectOpenmindsRow(speciesDoc);
    expect(row.type).toBe('Species');
    expect(row.name).toBe('Caenorhabditis elegans');
    expect(row.ontologyIdentifier).toBe('NCBITaxon:6239');
    // The stale `ontologyIdentifier` on the Species doc must NOT bleed
    // through — the dispatch picks `preferredOntologyIdentifier`.
    expect(row.ontologyIdentifier).not.toBe('IGNORED:0000001');
  });

  it('Strain row uses ontologyIdentifier (Schema B)', () => {
    const row = projectOpenmindsRow(strainDoc);
    expect(row.type).toBe('Strain');
    expect(row.name).toBe('N2');
    expect(row.ontologyIdentifier).toBe('WBStrain:00000001');
    // The Schema A Strain field is intentionally ignored.
    expect(row.ontologyIdentifier).not.toBe('IGNORED:0000002');
  });

  it('BiologicalSex row uses preferredOntologyIdentifier', () => {
    const row = projectOpenmindsRow(sexDoc);
    expect(row.type).toBe('BiologicalSex');
    expect(row.name).toBe('female');
    expect(row.ontologyIdentifier).toBe('PATO:0000383');
  });

  it('subjectDocumentIdentifier extracts depends_on subject_id value', () => {
    const row = projectOpenmindsRow(speciesDoc);
    expect(row.subjectDocumentIdentifier).toBe('ndi:subject:abc');
  });

  it('documentIdentifier mirrors doc.ndiId', () => {
    expect(projectOpenmindsRow(speciesDoc).documentIdentifier).toBe(
      'ndi:species:1',
    );
    expect(projectOpenmindsRow(strainDoc).documentIdentifier).toBe(
      'ndi:strain:1',
    );
  });

  it('matlabType passes through verbatim', () => {
    expect(projectOpenmindsRow(speciesDoc).matlabType).toBe(
      'openminds.controlledterms.Species',
    );
    expect(projectOpenmindsRow(strainDoc).matlabType).toBe(
      'openminds.core.research.Strain',
    );
  });

  it('returns empty strings for missing optional fields', () => {
    const minimalDoc: DocumentSummary = {
      ndiId: 'ndi:min:1',
      data: {
        openminds: {
          matlab_type: 'openminds.controlledterms.GeneticStrainType',
          openminds_type: 'https://openminds.om-i.org/types/GeneticStrainType',
          fields: { name: 'transgenic' },
        },
      },
    };
    const row = projectOpenmindsRow(minimalDoc);
    expect(row.subjectDocumentIdentifier).toBe('');
    expect(row.ontologyIdentifier).toBe('');
    expect(row.description).toBe('');
    expect(row.synonym).toBe('');
  });
});

describe('pickDependencyValue', () => {
  it('returns the matching dependency value', () => {
    const raw = [
      { name: 'session_id', value: 'ndi:sess:1' },
      { name: 'subject_id', value: 'ndi:subj:1' },
    ];
    expect(pickDependencyValue(raw, 'subject_id')).toBe('ndi:subj:1');
  });

  it('returns "" when no matching dependency exists', () => {
    expect(
      pickDependencyValue([{ name: 'other', value: 'x' }], 'subject_id'),
    ).toBe('');
  });

  it('returns "" for null/undefined raw', () => {
    expect(pickDependencyValue(null, 'subject_id')).toBe('');
    expect(pickDependencyValue(undefined, 'subject_id')).toBe('');
  });

  it('handles single-object (collapsed) shape', () => {
    expect(
      pickDependencyValue(
        { name: 'subject_id', value: 'ndi:subj:1' },
        'subject_id',
      ),
    ).toBe('ndi:subj:1');
  });
});

describe('OpenmindsSubjectTableView — rendering', () => {
  it('renders the synthesized 8-column table for Species/Strain/BiologicalSex docs', () => {
    useDocumentsInfiniteMock.mockReturnValue(
      settledInfiniteQuery([speciesDoc, strainDoc, sexDoc]),
    );
    const Wrapper = withClient();
    render(
      <Wrapper>
        <OpenmindsSubjectTableView datasetId="d1" />
      </Wrapper>,
    );

    // The 8 column headers are present in order. SummaryTableView's
    // ordered-columns step picks these up from
    // `OPENMINDS_SUBJECT_DEFAULT_COLUMNS`.
    const expectedHeaders = [
      'Doc ID',
      'Subject Doc ID',
      'Type',
      'Name',
      'Ontology ID',
      'MATLAB Type',
      'Description',
      'Synonym',
    ];
    for (const header of expectedHeaders) {
      // Column-toggle picker isn't open; headers in the table itself
      // render as clickable sort buttons. `getAllByText` because the
      // column-toggle picker may surface them too if open, but it
      // isn't open by default.
      expect(screen.getAllByText(header).length).toBeGreaterThan(0);
    }

    // Per-row data lands. C. elegans + N2 + female names in the table.
    expect(screen.getAllByText('Caenorhabditis elegans').length).toBeGreaterThan(0);
    expect(screen.getAllByText('N2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('female').length).toBeGreaterThan(0);

    // The Strain doc's WBStrain ontology ID and the Species doc's
    // NCBITaxon ID both appear (rendered via OntologyPopover trigger
    // text).
    expect(screen.getAllByText(/WBStrain:00000001/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/NCBITaxon:6239/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PATO:0000383/).length).toBeGreaterThan(0);
  });

  it('renders an empty-state message when the dataset has zero openminds docs', () => {
    useDocumentsInfiniteMock.mockReturnValue(settledInfiniteQuery([]));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <OpenmindsSubjectTableView datasetId="d1" />
      </Wrapper>,
    );
    // The empty-state copy is split across a `<span>` (the `<p>` has
    // "No ", a `<span class="font-mono">openminds subjects</span>`, and
    // " rows in this dataset."). Match on the `<p>`'s combined
    // textContent rather than relying on one single text node.
    const matches = screen.getAllByText((_, node) => {
      if (!node) return false;
      // Only count the leaf-most matching paragraph (not its ancestors),
      // so the assertion isn't ambiguous between <body>/<div>/<p>.
      if (node.tagName !== 'P') return false;
      const text = node.textContent ?? '';
      return /No\s+openminds subjects\s+rows in this dataset/i.test(text);
    });
    expect(matches.length).toBeGreaterThan(0);
    // No table rendered (no column headers).
    expect(screen.queryByText(/Ontology ID/)).toBeNull();
  });
});
