/**
 * StructureBrowser — pure sort/filter coverage + picker-rail behaviour.
 *
 * Phase F3 of the one-canvas redesign (2026-05-16). The browser is
 * now a picker-rail body: clicking a class row no longer navigates
 * out to `/datasets/{id}/documents?class=...`. Instead it switches
 * the picker tab to Documents and writes `?docClass=<className>` for
 * the DocumentsBrowser to consume.
 *
 * Tests in this file:
 *   - `deriveClassList` pure sort + filter behaviour (unchanged from
 *     Phase B)
 *   - clicking a class row writes ?pick=documents&docClass=<name> via
 *     router.replace AND calls setPickerTab('documents') as a
 *     defensive fallback
 *   - class rows render as <button>s, NOT anchors (no outbound nav)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { deriveClassList } from '@/components/workspace/StructureBrowser';

const setMock = vi.fn();
const clearMock = vi.fn();
const clearOneMock = vi.fn();
const setPickerTabMock = vi.fn();

vi.mock('@/lib/workspace/use-workspace-selection', () => ({
  useWorkspaceSelection: () => ({
    selection: {
      subject: null,
      session: null,
      probe: null,
      stimulus: null,
      unit: null,
    },
    set: setMock,
    clear: clearMock,
    clearOne: clearOneMock,
    pickerTab: 'documents',
    setPickerTab: setPickerTabMock,
    hasAnySelection: false,
  }),
}));

let searchParamsStub: URLSearchParams = new URLSearchParams();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => searchParamsStub,
  usePathname: () => '/my/workspace/ds-test',
}));

// Stub the class-counts hook so the browser renders rows without a
// network call. Shape matches `ClassCountsResponse`.
const FIXTURE_COUNTS = {
  classCounts: {
    subject: 5314,
    element_epoch: 4887,
    treatment_drug: 24466,
  },
  totalDocuments: 34667,
};

vi.mock('@/lib/api/datasets', () => ({
  useClassCounts: () => ({
    data: FIXTURE_COUNTS,
    isLoading: false,
    isError: false,
  }),
}));

import { StructureBrowser } from '@/components/workspace/StructureBrowser';

function withProviders(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  setMock.mockReset();
  clearMock.mockReset();
  clearOneMock.mockReset();
  setPickerTabMock.mockReset();
  replaceMock.mockReset();
  searchParamsStub = new URLSearchParams();
});

afterEach(() => {
  searchParamsStub = new URLSearchParams();
});

// ── Pure helpers — unchanged from Phase B. ────────────────────────
const SAMPLE = {
  subject: 5314,
  treatment_drug: 24466,
  imageStack: 564,
  ontologyLabel: 584,
  ontologyTableRow: 5297,
  openminds_subject: 28374,
  session: 2,
  session_in_a_dataset: 1,
  subject_group: 235,
  treatment_transfer: 1675,
  generic_file: 20,
};

describe('deriveClassList', () => {
  it('sorts by count descending (default)', () => {
    const items = deriveClassList(SAMPLE, 'count-desc', '');
    expect(items[0]).toEqual({ className: 'openminds_subject', count: 28374 });
    expect(items[1]).toEqual({ className: 'treatment_drug', count: 24466 });
    expect(items[items.length - 1]).toEqual({
      className: 'session_in_a_dataset',
      count: 1,
    });
  });

  it('sorts by count ascending', () => {
    const items = deriveClassList(SAMPLE, 'count-asc', '');
    expect(items[0]).toEqual({ className: 'session_in_a_dataset', count: 1 });
    expect(items[1]).toEqual({ className: 'session', count: 2 });
    expect(items[items.length - 1]).toEqual({
      className: 'openminds_subject',
      count: 28374,
    });
  });

  it('sorts alphabetically (asc)', () => {
    const items = deriveClassList(SAMPLE, 'name-asc', '');
    expect(items[0]!.className).toBe('generic_file');
    expect(items[items.length - 1]!.className).toBe('treatment_transfer');
  });

  it('sorts alphabetically (desc)', () => {
    const items = deriveClassList(SAMPLE, 'name-desc', '');
    expect(items[0]!.className).toBe('treatment_transfer');
    expect(items[items.length - 1]!.className).toBe('generic_file');
  });

  it('filters case-insensitively by substring', () => {
    const items = deriveClassList(SAMPLE, 'count-desc', 'TREATMENT');
    expect(items.map((i) => i.className).sort()).toEqual([
      'treatment_drug',
      'treatment_transfer',
    ]);
  });

  it('returns the empty list when no class names match the filter', () => {
    const items = deriveClassList(SAMPLE, 'count-desc', 'nonexistentXYZ');
    expect(items).toEqual([]);
  });

  it('trims whitespace from the filter', () => {
    const items = deriveClassList(SAMPLE, 'count-desc', '   subject   ');
    expect(items.map((i) => i.className).sort()).toEqual([
      'openminds_subject',
      'subject',
      'subject_group',
    ]);
  });

  it('breaks ties by class name (count-desc)', () => {
    const sample = {
      a_class: 100,
      b_class: 100,
      c_class: 100,
    };
    const items = deriveClassList(sample, 'count-desc', '');
    expect(items.map((i) => i.className)).toEqual([
      'a_class',
      'b_class',
      'c_class',
    ]);
  });
});

// ── Click → picker-tab switch + docClass URL write. ──────────────
describe('StructureBrowser — class click switches the picker to Documents', () => {
  it('writes ?pick=documents&docClass=<name> via router.replace', () => {
    render(withProviders(<StructureBrowser datasetId="ds-test" />));
    // The class-name span and count span are adjacent (no separator)
    // so the accessible-name reads as e.g. "subject5,314". Match by
    // the class-name text first, then walk up to the button.
    const subjectRow = screen.getByText('subject').closest('button');
    expect(subjectRow).not.toBeNull();
    fireEvent.click(subjectRow!);

    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain('pick=documents');
    expect(url).toContain('docClass=subject');
  });

  it('also calls setPickerTab("documents") as a defensive fallback', () => {
    render(withProviders(<StructureBrowser datasetId="ds-test" />));
    const button = screen.getByText('treatment_drug').closest('button');
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    expect(setPickerTabMock).toHaveBeenCalledWith('documents');
  });

  it('writes the docClass for class names with underscores', () => {
    render(withProviders(<StructureBrowser datasetId="ds-test" />));
    const button = screen.getByText('element_epoch').closest('button');
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain('docClass=element_epoch');
  });

  it('preserves unrelated query params on click', () => {
    searchParamsStub = new URLSearchParams('subject=68d6e54703a03f5cfdac8eff');
    render(withProviders(<StructureBrowser datasetId="ds-test" />));
    const button = screen.getByText('subject').closest('button');
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain('subject=68d6e54703a03f5cfdac8eff');
    expect(url).toContain('pick=documents');
    expect(url).toContain('docClass=subject');
  });
});

describe('StructureBrowser — class rows do not navigate out', () => {
  it('renders class rows as <button>s, not anchors', () => {
    const { container } = render(
      withProviders(<StructureBrowser datasetId="ds-test" />),
    );
    // The row for `subject` (and every other class) must be a button.
    // The retired version used `<Link>` -> `<a>` to the Document
    // Explorer; this guard fails fast if anyone re-introduces the
    // outbound nav.
    const links = container.querySelectorAll(
      'a[href*="/datasets/ds-test/documents"]',
    );
    expect(links.length).toBe(0);
  });
});
