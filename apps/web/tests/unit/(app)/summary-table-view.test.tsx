/**
 * SummaryTableView — Phase 6.5a port of `frontend/src/components/tables/SummaryTableView.test.tsx`
 * (data-browser repo). Three monorepo adaptations:
 *
 *   1. Replaces `BrowserRouter` from react-router-dom with mocked
 *      `next/navigation` hooks (`useSearchParams`, `useRouter`,
 *      `usePathname`). The mock returns an empty URLSearchParams plus a
 *      no-op router, which is sufficient for the rendering tests below —
 *      none assert URL-side-effect behavior.
 *   2. Carries forward the `vi.mock('xlsx', ...)` and
 *      `vi.mock('@tanstack/react-virtual', ...)` patterns verbatim. The
 *      virtual mock is required under jsdom because `getBoundingClientRect`
 *      returns zeros there; same pattern as Phase 3c MyDatasets test.
 *   3. The QuickPlot card in the data-browser source is deferred (see
 *      FOLLOW-UP block in `SummaryTableView.tsx`); the original test file
 *      doesn't exercise it, so no test changes are needed for that gap.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/datasets/d1/tables/subject',
}));

// Mock the dynamic `import('xlsx')` call in exportXlsx. We expose a
// single `writeFile` spy plus minimal `utils` stubs so the code under
// test executes without a real xlsx dependency.
const writeFileMock = vi.fn();
const aoaToSheetMock = vi.fn((aoa: unknown[][]) => ({ aoa }));
const bookNewMock = vi.fn(() => ({ SheetNames: [], Sheets: {} }));
const bookAppendSheetMock = vi.fn();
vi.mock('@e965/xlsx', () => ({
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  utils: {
    aoa_to_sheet: (...args: unknown[]) => aoaToSheetMock(...(args as [unknown[][]])),
    book_new: () => bookNewMock(),
    book_append_sheet: (...args: unknown[]) => bookAppendSheetMock(...args),
  },
}));

// @tanstack/react-virtual returns zero items under jsdom because scroll
// container dimensions are 0. Stub it to expose every row so the component
// cell renderers run. Real virtualization is exercised by Playwright E2E.
vi.mock('@tanstack/react-virtual', () => {
  return {
    useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => {
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
      };
    },
  };
});

import { SummaryTableView } from '@/components/app/SummaryTableView';
import type { TableResponse } from '@/lib/api/tables';

function withProviders(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const tutorialHaleyTable: TableResponse = {
  columns: [
    { key: 'subjectIdentifier', label: 'Subject Identifier' },
    { key: 'speciesName', label: 'Species' },
    { key: 'speciesOntology', label: 'Species Ontology' },
    { key: 'strainName', label: 'Strain' },
    { key: 'strainOntology', label: 'Strain Ontology' },
    { key: 'biologicalSexName', label: 'Sex' },
    { key: 'biologicalSexOntology', label: 'Sex Ontology' },
    { key: 'ageAtRecording', label: 'Age at Recording' },
    { key: 'description', label: 'Description' },
  ],
  rows: [
    {
      subjectIdentifier: 'PR811_4144@chalasani-lab.salk.edu',
      speciesName: 'Caenorhabditis elegans',
      speciesOntology: 'NCBITaxon:6239',
      strainName: 'N2',
      strainOntology: 'WBStrain:00000001',
      biologicalSexName: 'hermaphrodite',
      biologicalSexOntology: 'PATO:0001340',
      ageAtRecording: null, // empty across all rows — should auto-hide
      description: null,
    },
  ],
};

describe('SummaryTableView', () => {
  it('renders ontology cells as interactive popover buttons', () => {
    render(withProviders(<SummaryTableView data={tutorialHaleyTable} tableType="subject" />));
    // Ontology values render as popover buttons.
    expect(
      screen.getByRole('button', { name: /NCBITaxon:6239/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /WBStrain:00000001/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /PATO:0001340/ }),
    ).toBeInTheDocument();
  });

  it('renders the row count in the toolbar', () => {
    render(withProviders(<SummaryTableView data={tutorialHaleyTable} tableType="subject" />));
    // Row count appears once in the toolbar area (not inside column picker).
    expect(screen.getAllByText('1 / 1 rows').length).toBeGreaterThanOrEqual(1);
  });

  it('offers an auto-hide toggle for empty columns', () => {
    render(withProviders(<SummaryTableView data={tutorialHaleyTable} tableType="subject" />));
    // ageAtRecording + description are both all-null → 2 empty cols hidden.
    // The toggle text includes the count.
    expect(screen.getAllByText(/2 empty cols hidden/).length).toBeGreaterThanOrEqual(1);
  });

  it('tags ontology chips with data-ontology-term for e2e hooks', () => {
    const { container } = render(
      withProviders(<SummaryTableView data={tutorialHaleyTable} tableType="subject" />),
    );
    const tagged = container.querySelectorAll('[data-ontology-term]');
    expect(tagged.length).toBeGreaterThanOrEqual(3); // species + strain + sex
  });
});

/**
 * Round-3 follow-up (team review round 4) — making ontology *names* clickable.
 *
 * Pre-fix: `N2` was rendered as plain monospace text in the Strain column;
 * the only clickable element was the adjacent `WBStrain:00000001` chip's
 * external-link icon. Reviewer asked for the name itself to land on
 * Wormbase too, so users don't have to scan over to the ID column to
 * click through.
 *
 * Universal rule applied at the cell renderer: any `<X>Name` column
 * whose row carries a sibling `<X>Ontology` value with a resolvable
 * provider URL becomes an `<a>` to that URL. Same href as the chip's
 * icon next to it. Visual treatment matches OntologyPopover (blue +
 * dotted underline + small external-link icon).
 */
describe('SummaryTableView — name cells link to ontology provider (round-3 follow-up)', () => {
  it('renders strainName as a clickable link to wormbase.org when strainOntology resolves', () => {
    const { container } = render(
      withProviders(<SummaryTableView data={tutorialHaleyTable} tableType="subject" />),
    );
    const link = container.querySelector('a[data-ontology-name-link="N2"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(
      'https://wormbase.org/species/c_elegans/strain/WBStrain00000001',
    );
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders speciesName as a clickable link to NCBI Taxonomy when speciesOntology resolves', () => {
    const { container } = render(
      withProviders(<SummaryTableView data={tutorialHaleyTable} tableType="subject" />),
    );
    const link = container.querySelector(
      'a[data-ontology-name-link="Caenorhabditis elegans"]',
    );
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(
      'https://www.ncbi.nlm.nih.gov/datasets/taxonomy/browser/?taxon=6239',
    );
  });

  it('renders biologicalSexName as a clickable link to OLS4 when biologicalSexOntology resolves', () => {
    const { container } = render(
      withProviders(<SummaryTableView data={tutorialHaleyTable} tableType="subject" />),
    );
    const link = container.querySelector(
      'a[data-ontology-name-link="hermaphrodite"]',
    );
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(
      'https://www.ebi.ac.uk/ols4/ontologies/pato/classes?obo_id=PATO%3A0001340',
    );
  });

  it('renders backgroundStrainName as a SciCrunch link when backgroundStrainOntology is RRID:', () => {
    // Francesconi fixture pairs `backgroundStrainName: 'WI'` with
    // `backgroundStrainOntology: 'RRID:RGD_13508588'` — the SciCrunch
    // resolver path of the URL builder.
    const { container } = render(
      withProviders(
        <SummaryTableView data={francesconiSubjectTable} tableType="subject" />,
      ),
    );
    const link = container.querySelector('a[data-ontology-name-link="WI"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(
      'https://scicrunch.org/resolver/RRID:RGD_13508588',
    );
  });

  it('does NOT linkify a name whose sibling ontology is an array (multi-value)', () => {
    // Francesconi fixture: `strainName: ['CRF-Cre', 'OTR-IRES-Cre']`
    // paired with `strainOntology: []`. Array values render via the
    // CSV-join formatter and skip the ontology-name link branch — a
    // single hyperlink for "CRF-Cre, OTR-IRES-Cre" pointing at one
    // ontology would be ambiguous.
    const { container } = render(
      withProviders(
        <SummaryTableView data={francesconiSubjectTable} tableType="subject" />,
      ),
    );
    expect(
      container.querySelector('a[data-ontology-name-link="CRF-Cre, OTR-IRES-Cre"]'),
    ).toBeNull();
  });

  it('does NOT linkify a name whose sibling ontology is missing or unmapped', () => {
    // `geneticStrainTypeName: 'wildtype'` has no
    // `geneticStrainTypeOntology` sibling in the Haley fixture — the
    // helper returns null and the cell renders as plain text.
    const { container } = render(
      withProviders(<SummaryTableView data={tutorialHaleyTable} tableType="subject" />),
    );
    // No link element with the wildtype name attribute.
    expect(
      container.querySelector('a[data-ontology-name-link="wildtype"]'),
    ).toBeNull();
  });

  it('renders an external-link icon adjacent to the name inside the same <a>', () => {
    // The icon visually communicates "click → external page". Pinned
    // here so a future style refactor doesn't accidentally drop it.
    const { container } = render(
      withProviders(<SummaryTableView data={tutorialHaleyTable} tableType="subject" />),
    );
    const link = container.querySelector('a[data-ontology-name-link="N2"]');
    expect(link).not.toBeNull();
    expect(link?.querySelector('svg')).not.toBeNull();
  });

  it('stops click propagation so an enclosing row-click handler does not fire', () => {
    // The name-link MUST not double-trigger the row's onRowClick
    // (which navigates to the document detail page). Without
    // stopPropagation the user's click on `N2` would both navigate
    // AND open WormBase — confusing.
    const onRowClick = vi.fn();
    const { container } = render(
      withProviders(
        <SummaryTableView
          data={tutorialHaleyTable}
          tableType="subject"
          onRowClick={onRowClick}
        />,
      ),
    );
    const link = container.querySelector(
      'a[data-ontology-name-link="N2"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    // Prevent the actual `target=_blank` navigation from being attempted in jsdom
    link?.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link!);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('linkifies dynamic treatment-join name columns when their Ontology sibling resolves', () => {
    // Treatment-join columns follow the same `<X>Name`/`<X>Ontology`
    // convention as the canonical subject columns — the universal
    // suffix rule covers them automatically. A dataset that joins a
    // treatment with a UBERON ontology gets a link from the name
    // straight to the OLS4 page.
    const treatmentJoinTable: TableResponse = {
      columns: [
        { key: 'subjectDocumentIdentifier', label: 'Subject Doc ID' },
        {
          key: 'OptogeneticTetanusStimulationTargetLocationName',
          label: 'Optogenetic Tetanus Stimulation Target Location Name',
        },
        {
          key: 'OptogeneticTetanusStimulationTargetLocationOntology',
          label: 'Optogenetic Tetanus Stimulation Target Location Ontology',
        },
      ],
      rows: [
        {
          subjectDocumentIdentifier: 'subj1',
          OptogeneticTetanusStimulationTargetLocationName: 'BNST',
          OptogeneticTetanusStimulationTargetLocationOntology: 'UBERON:0001880',
        },
      ],
    };
    const { container } = render(
      withProviders(<SummaryTableView data={treatmentJoinTable} tableType="subject" />),
    );
    const link = container.querySelector('a[data-ontology-name-link="BNST"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(
      'https://www.ebi.ac.uk/ols4/ontologies/uberon/classes?obo_id=UBERON%3A0001880',
    );
  });
});

describe('SummaryTableView XLS export', () => {
  beforeEach(() => {
    writeFileMock.mockClear();
    aoaToSheetMock.mockClear();
    bookNewMock.mockClear();
    bookAppendSheetMock.mockClear();
  });

  it('renders a dedicated XLS export button alongside CSV and JSON', () => {
    render(
      withProviders(
        <SummaryTableView
          data={tutorialHaleyTable}
          tableType="subject"
          title="haley-subjects"
        />,
      ),
    );
    expect(screen.getByTestId('export-csv')).toBeInTheDocument();
    expect(screen.getByTestId('export-xlsx')).toBeInTheDocument();
    expect(screen.getByTestId('export-json')).toBeInTheDocument();
  });

  it('invokes xlsx.writeFile with an .xlsx filename when XLS is clicked', async () => {
    render(
      withProviders(
        <SummaryTableView
          data={tutorialHaleyTable}
          tableType="subject"
          title="haley-subjects"
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('export-xlsx'));
    // exportXlsx `await`s the dynamic import; waitFor polls until the
    // async work has landed.
    await waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1);
    });
    const [, filename] = writeFileMock.mock.calls[0] as [unknown, string];
    expect(filename).toBe('haley-subjects.xlsx');
    expect(aoaToSheetMock).toHaveBeenCalledTimes(1);
    expect(bookNewMock).toHaveBeenCalledTimes(1);
    expect(bookAppendSheetMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to "table.xlsx" when no title is provided', async () => {
    render(
      withProviders(<SummaryTableView data={tutorialHaleyTable} tableType="subject" />),
    );
    fireEvent.click(screen.getByTestId('export-xlsx'));
    await waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1);
    });
    const [, filename] = writeFileMock.mock.calls[0] as [unknown, string];
    expect(filename).toBe('table.xlsx');
  });
});

// ─── B6a canonical column defaults ──────────────────────────────────────
// Fixture: Francesconi-tutorial-shaped subject row (Dabrowska lab). Exercises
// ordering + hidden-by-default + CSV-join on array cells + dynamic treatment-
// location discovery all in one shot.
const francesconiSubjectTable: TableResponse = {
  columns: [
    { key: 'subjectIdentifier', label: 'Subject Identifier' },
    { key: 'subjectLocalIdentifier', label: 'Local Identifier' },
    { key: 'subjectDocumentIdentifier', label: 'Subject Doc ID' },
    { key: 'sessionDocumentIdentifier', label: 'Session Doc ID' },
    { key: 'strainName', label: 'Strain' },
    { key: 'strainOntology', label: 'Strain Ontology' },
    { key: 'backgroundStrainName', label: 'Background Strain' },
    { key: 'backgroundStrainOntology', label: 'Background Strain Ontology' },
    { key: 'geneticStrainTypeName', label: 'Genetic Strain Type' },
    { key: 'speciesName', label: 'Species' },
    { key: 'speciesOntology', label: 'Species Ontology' },
    { key: 'biologicalSexName', label: 'Sex' },
    { key: 'biologicalSexOntology', label: 'Sex Ontology' },
    { key: 'ageAtRecording', label: 'Age at Recording' },
    { key: 'description', label: 'Description' },
    // Dynamic treatment column from the Dabrowska optogenetic-tetanus dataset
    {
      key: 'OptogeneticTetanusStimulationTargetLocationName',
      label: 'Optogenetic Tetanus Stimulation Target Location Name',
    },
  ],
  rows: [
    {
      subjectIdentifier: 'wi_rat_CRFCre_210818_BNST@dabrowska-lab.rosalindfranklin.edu',
      subjectLocalIdentifier: 'wi_rat_CRFCre_210818_BNST@dabrowska-lab.rosalindfranklin.edu',
      subjectDocumentIdentifier: '412693bb0b2a75c8_c0dc4139300a673e',
      sessionDocumentIdentifier: 'sess_abc123',
      // Multi-valued strain — expect CSV-join rendering
      strainName: ['CRF-Cre', 'OTR-IRES-Cre'],
      strainOntology: [],
      backgroundStrainName: 'WI',
      backgroundStrainOntology: 'RRID:RGD_13508588',
      geneticStrainTypeName: 'knockin',
      speciesName: 'Rattus norvegicus',
      speciesOntology: 'NCBITaxon:10116',
      biologicalSexName: 'male',
      biologicalSexOntology: 'PATO:0000384',
      ageAtRecording: null,
      description: null,
      OptogeneticTetanusStimulationTargetLocationName: 'BNST',
    },
  ],
};

/** Extract the visible label from each `<th>` — ignoring the tooltip text
 * that lives in a hidden sibling span. The label is the first `<span>`
 * inside the sort button; this shields us from the tooltip-description
 * string bleeding into `th.textContent`. */
function visibleHeaders(tableEl: HTMLElement): string[] {
  return Array.from(tableEl.querySelectorAll('thead th')).map((th) => {
    const labelSpan = th.querySelector('button span');
    return labelSpan?.textContent?.trim() ?? '';
  });
}

describe('SummaryTableView — B6a canonical column defaults (subject grain)', () => {
  it('hides sessionDocumentIdentifier by default', () => {
    render(withProviders(<SummaryTableView data={francesconiSubjectTable} tableType="subject" />));
    const tableEl = document.querySelector('table');
    if (!tableEl) throw new Error('no table rendered');
    const headers = visibleHeaders(tableEl as HTMLElement);
    expect(headers).not.toContain('Session Doc ID');
  });

  it('keeps sessionDocumentIdentifier available via the column picker', () => {
    const { container } = render(
      withProviders(<SummaryTableView data={francesconiSubjectTable} tableType="subject" />),
    );
    // Click the "Columns" toggle to reveal the picker (fireEvent goes
    // through React's synthetic-event path so the toggle state updates).
    const columnsBtn = screen.getByRole('button', { name: /Columns/i });
    fireEvent.click(columnsBtn);
    // The picker panel lives in a div with the column checkboxes. Look for
    // Session Doc ID as a checkbox label text (not a table header).
    const pickerLabels = Array.from(container.querySelectorAll('label')).map(
      (l) => l.textContent?.trim() ?? '',
    );
    expect(pickerLabels.some((l) => l === 'Session Doc ID')).toBe(true);
  });

  it('renders the canonical headers in canonical order', () => {
    render(withProviders(<SummaryTableView data={francesconiSubjectTable} tableType="subject" />));
    const tableEl = document.querySelector('table');
    if (!tableEl) throw new Error('no table rendered');
    const headers = visibleHeaders(tableEl as HTMLElement);
    // Visible headers in order should start with the canonical 11 + the
    // dynamic treatment column. `sessionDocumentIdentifier` absent (hidden),
    // `ageAtRecording`/`description` absent (also hidden),
    // `subjectIdentifier` absent (hidden-by-default per canonical).
    expect(headers.slice(0, 3)).toEqual([
      'Subject Doc ID',
      'Local Identifier',
      'Strain',
    ]);
    expect(headers).not.toContain('Session Doc ID');
    expect(headers).not.toContain('Age at Recording');
    expect(headers).not.toContain('Description');
  });

  it('CSV-joins array cells in multi-valued columns', () => {
    render(withProviders(<SummaryTableView data={francesconiSubjectTable} tableType="subject" />));
    const tableEl = document.querySelector('table');
    if (!tableEl) throw new Error('no table rendered');
    // `strainName` was set to ['CRF-Cre', 'OTR-IRES-Cre'] — expect CSV-join.
    expect(within(tableEl).getByText('CRF-Cre, OTR-IRES-Cre')).toBeInTheDocument();
  });

  // 2026-04-28 — dynamic treatment columns are visible-by-default
  // again. PR #129 set `visible: false` as a safety measure for the
  // broadcast-treatment bug; that fix was replaced by a per-subject
  // join, originally in `table-shell.tsx::joinTreatmentsToSubjects`
  // (frontend) and then ported to backend's
  // `_broadcast_treatments_onto_subjects` in F-1b (2026-05-19).
  // This test pins the visible-by-default contract: when the data
  // already carries a dynamic treatment column, it appears in the
  // header row.
  it('shows the discovered dynamic treatment column in the default visible headers (subject grain)', () => {
    render(withProviders(<SummaryTableView data={francesconiSubjectTable} tableType="subject" />));
    const tableEl = document.querySelector('table');
    if (!tableEl) throw new Error('no table rendered');
    const headers = visibleHeaders(tableEl as HTMLElement);
    expect(
      headers.some((h) => h.includes('Optogenetic Tetanus Stimulation Target Location')),
    ).toBe(true);
  });
});

describe('SummaryTableView — B6a canonical column defaults (probe grain)', () => {
  const probeTable: TableResponse = {
    columns: [
      { key: 'probeDocumentIdentifier', label: 'Probe Doc ID' },
      { key: 'probeName', label: 'Name' },
      { key: 'probeType', label: 'Type' },
      { key: 'probeReference', label: 'Reference' },
      { key: 'probeLocationName', label: 'Probe Location' },
      { key: 'probeLocationOntology', label: 'Probe Location Ontology' },
      { key: 'cellTypeName', label: 'Cell Type' },
      { key: 'cellTypeOntology', label: 'Cell Type Ontology' },
      { key: 'subjectDocumentIdentifier', label: 'Subject Doc ID' },
    ],
    rows: [
      {
        probeDocumentIdentifier: '412693bb0bf99bbe_c0cb88b37570afba',
        probeName: 'Vm_210401_BNSTIII_a',
        probeType: 'patch-Vm',
        probeReference: '[1]',
        // Multi-valued location list demonstrates CSV-join
        probeLocationName: ['bed nucleus of stria terminalis', 'BNST'],
        probeLocationOntology: ['UBERON:0001880'],
        cellTypeName: 'Type III BNST neuron',
        cellTypeOntology: 'EMPTY:0000073',
        subjectDocumentIdentifier: '412693bb0b2cf772_c0d06cadbb168eb5',
      },
    ],
  };

  it('renders the 9 probe columns in canonical order', () => {
    render(withProviders(<SummaryTableView data={probeTable} tableType="element" />));
    const tableEl = document.querySelector('table');
    if (!tableEl) throw new Error('no table rendered');
    const headers = visibleHeaders(tableEl as HTMLElement);
    // Subject Doc ID first, then Probe Doc ID, then descriptors.
    expect(headers[0]).toBe('Subject Doc ID');
    expect(headers[1]).toBe('Probe Doc ID');
    expect(headers[2]).toBe('Name');
  });

  it('CSV-joins probeLocationName when multi-valued', () => {
    render(withProviders(<SummaryTableView data={probeTable} tableType="element" />));
    const tableEl = document.querySelector('table');
    if (!tableEl) throw new Error('no table rendered');
    expect(
      within(tableEl).getByText('bed nucleus of stria terminalis, BNST'),
    ).toBeInTheDocument();
  });
});

describe('SummaryTableView cell rendering', () => {
  const dualClockTable: TableResponse = {
    columns: [
      { key: 'epochNumber', label: 'Epoch' },
      { key: 'epochStart', label: 'Start' },
      { key: 'epochStop', label: 'Stop' },
    ],
    rows: [
      {
        epochNumber: 't00001',
        epochStart: { devTime: 0, globalTime: 739256.7 },
        epochStop: { devTime: 3600, globalTime: 739256.75 },
      },
    ],
  };

  it('renders {devTime, globalTime} structured epoch values', () => {
    const { container } = render(
      withProviders(<SummaryTableView data={dualClockTable} tableType="element_epoch" />),
    );
    const tableEl = container.querySelector('table');
    if (!tableEl) throw new Error('no table rendered');
    const tableWithin = within(tableEl);
    // Dev times (0 and 3600) render on the first line per cell.
    expect(tableWithin.getByText('0')).toBeInTheDocument();
    expect(tableWithin.getByText('3600')).toBeInTheDocument();
    // Global times render on the second line.
    expect(tableWithin.getByText('739256.7')).toBeInTheDocument();
    expect(tableWithin.getByText('739256.75')).toBeInTheDocument();
  });
});
