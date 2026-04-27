/**
 * PivotView — Phase 6.5b port of `frontend/src/components/datasets/PivotView.test.tsx`
 * (data-browser repo). Adaptations:
 *
 *   1. `MemoryRouter` + `Routes` from react-router-dom replaced with
 *      direct `<PivotView datasetId="DSX" grain="subject" />` props —
 *      the monorepo route page provides those from URL params.
 *   2. `useNavigate` replaced with mocked `next/navigation.useRouter().push`.
 *   3. `ApiError` constructor signature follows the target's
 *      `(status, body)` shape (data-browser was `(body, status)`).
 *
 * Covers:
 *   - Grain selector populated from `DatasetSummary.counts` (only grains with ≥1)
 *   - Table renders rows when pivot data arrives
 *   - Empty state when pivot returns zero rows
 *   - Feature-flag-off (503) renders `PivotDisabledCard`
 *   - `DatasetPivotNavGuard` was removed (dead code; see PivotView.tsx)
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
}));

// Audit 2026-04-23 #63: PivotView renders via VirtualizedTable.
// `@tanstack/react-virtual` returns zero items under jsdom because the
// scroll container has 0 height — same mock pattern as Phase 6.5a's
// SummaryTableView test so every row materializes for the cell
// expectations below.
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

import { ApiError } from '@/lib/api/errors';
import * as datasetsApi from '@/lib/api/datasets';
import type { PivotResponse } from '@/lib/api/datasets';
import type { DatasetSummary } from '@/lib/types/dataset-summary';
import { PivotView } from '@/components/app/PivotView';

function withProviders(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function baseSummary(
  overrides: Partial<DatasetSummary['counts']> = {},
): DatasetSummary {
  const counts = {
    sessions: 2,
    subjects: 3,
    probes: 1,
    elements: 1,
    epochs: 4,
    totalDocuments: 11,
    ...overrides,
  };
  return {
    datasetId: 'DSX',
    counts,
    species: null,
    strains: null,
    sexes: null,
    brainRegions: null,
    probeTypes: null,
    dateRange: { earliest: null, latest: null },
    totalSizeBytes: null,
    citation: {
      title: 'Test',
      license: null,
      datasetDoi: null,
      paperDois: [],
      contributors: [],
      year: null,
    },
    computedAt: new Date().toISOString(),
    schemaVersion: 'summary:v1',
    extractionWarnings: [],
  };
}

type PivotHookResult = ReturnType<typeof datasetsApi.useDatasetPivot>;
type SummaryHookResult = ReturnType<typeof datasetsApi.useDatasetSummary>;

function stubPivot(overrides: Partial<PivotHookResult> = {}): PivotHookResult {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as PivotHookResult;
}

function stubSummary(
  overrides: Partial<SummaryHookResult> = {},
): SummaryHookResult {
  return {
    data: baseSummary(),
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as SummaryHookResult;
}

function pivotResponse(rows: Array<Record<string, unknown>>): PivotResponse {
  return {
    datasetId: 'DSX',
    grain: 'subject',
    columns: [
      { key: 'subjectDocumentIdentifier', label: 'Subject Doc ID' },
      { key: 'subjectLocalIdentifier', label: 'Local Identifier' },
      { key: 'speciesName', label: 'Species' },
      { key: 'strainName', label: 'Strain' },
      { key: 'biologicalSexName', label: 'Sex' },
    ],
    rows,
    computedAt: new Date().toISOString(),
    schemaVersion: 'pivot:v1',
    totalRows: rows.length,
  };
}

describe('PivotView — grain selector', () => {
  it('populates options for grains with count >= 1', () => {
    vi.spyOn(datasetsApi, 'useDatasetSummary').mockReturnValue(
      stubSummary({
        data: baseSummary({ subjects: 3, sessions: 1, elements: 0 }),
      }),
    );
    vi.spyOn(datasetsApi, 'useDatasetPivot').mockReturnValue(
      stubPivot({ data: pivotResponse([]) }),
    );

    render(withProviders(<PivotView datasetId="DSX" grain="subject" />));
    const selector = screen.getByTestId('pivot-grain-selector');
    const subjectOpt = within(selector).getByTestId(
      'pivot-grain-option-subject',
    ) as HTMLOptionElement;
    const sessionOpt = within(selector).getByTestId(
      'pivot-grain-option-session',
    ) as HTMLOptionElement;
    const elementOpt = within(selector).getByTestId(
      'pivot-grain-option-element',
    ) as HTMLOptionElement;

    expect(subjectOpt.disabled).toBe(false);
    expect(sessionOpt.disabled).toBe(false);
    // Elements has zero count → option is disabled (greyed out with "(0)").
    expect(elementOpt.disabled).toBe(true);
    expect(elementOpt.textContent).toContain('(0)');
  });

  it('disables all grain options when summary is loading', () => {
    vi.spyOn(datasetsApi, 'useDatasetSummary').mockReturnValue(
      stubSummary({ data: undefined, isLoading: true }),
    );
    vi.spyOn(datasetsApi, 'useDatasetPivot').mockReturnValue(
      stubPivot({ isLoading: true }),
    );

    render(withProviders(<PivotView datasetId="DSX" grain="subject" />));
    const selector = screen.getByTestId('pivot-grain-selector') as HTMLElement;
    const select = within(selector).getByLabelText('Pivot grain');
    expect(select).toBeDisabled();
  });
});

describe('PivotView — table rendering', () => {
  it('renders the pivot table when rows are present', () => {
    vi.spyOn(datasetsApi, 'useDatasetSummary').mockReturnValue(stubSummary());
    vi.spyOn(datasetsApi, 'useDatasetPivot').mockReturnValue(
      stubPivot({
        data: pivotResponse([
          {
            subjectDocumentIdentifier: 'ndi-sub-A',
            subjectLocalIdentifier: 'A@lab.edu',
            speciesName: 'Caenorhabditis elegans',
            strainName: 'N2',
            biologicalSexName: 'hermaphrodite',
          },
        ]),
      }),
    );

    render(withProviders(<PivotView datasetId="DSX" grain="subject" />));
    const table = screen.getByTestId('pivot-table');
    expect(within(table).getByText('Subject Doc ID')).toBeInTheDocument();
    expect(within(table).getByText('A@lab.edu')).toBeInTheDocument();
    expect(within(table).getByText('Caenorhabditis elegans')).toBeInTheDocument();
    expect(within(table).getByText('N2')).toBeInTheDocument();
  });

  it('renders em-dash for null cells (matches MATLAB blank-cell convention)', () => {
    vi.spyOn(datasetsApi, 'useDatasetSummary').mockReturnValue(stubSummary());
    vi.spyOn(datasetsApi, 'useDatasetPivot').mockReturnValue(
      stubPivot({
        data: pivotResponse([
          {
            subjectDocumentIdentifier: 'ndi-sub-A',
            subjectLocalIdentifier: 'A@lab.edu',
            speciesName: null,
            strainName: null,
            biologicalSexName: null,
          },
        ]),
      }),
    );

    render(withProviders(<PivotView datasetId="DSX" grain="subject" />));
    const table = screen.getByTestId('pivot-table');
    const dashes = within(table).getAllByText('—');
    // 3 null columns for one row.
    expect(dashes.length).toBe(3);
  });

  it('renders an empty-state message when the pivot returns zero rows', () => {
    vi.spyOn(datasetsApi, 'useDatasetSummary').mockReturnValue(stubSummary());
    vi.spyOn(datasetsApi, 'useDatasetPivot').mockReturnValue(
      stubPivot({ data: pivotResponse([]) }),
    );

    render(withProviders(<PivotView datasetId="DSX" grain="subject" />));
    expect(screen.getByTestId('pivot-empty')).toBeInTheDocument();
  });
});

describe('PivotView — feature-flag-off behavior', () => {
  it('renders the disabled card when the pivot endpoint returns 503', () => {
    vi.spyOn(datasetsApi, 'useDatasetSummary').mockReturnValue(stubSummary());
    vi.spyOn(datasetsApi, 'useDatasetPivot').mockReturnValue(
      stubPivot({
        isError: true,
        error: new ApiError(503, {
          code: 'INTERNAL',
          message:
            'Grain-selectable pivot is disabled. Set FEATURE_PIVOT_V1=true to enable.',
          recovery: 'contact_support',
          requestId: null,
        }),
      }),
    );

    render(withProviders(<PivotView datasetId="DSX" grain="subject" />));
    expect(screen.getByTestId('pivot-disabled')).toBeInTheDocument();
    // The table / selector do NOT render when the feature is disabled.
    expect(screen.queryByTestId('pivot-grain-selector')).toBeNull();
    expect(screen.queryByTestId('pivot-table')).toBeNull();
  });
});

// `DatasetPivotNavGuard` removed in the perf-foundational rollup.
// Production code never imported it; the export + its `useDatasetPivot
// (id, 'subject')` probe were dead in real users' page loads. See the
// comment in `components/app/PivotView.tsx` for the full rationale.
