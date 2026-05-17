/**
 * DocumentsPicker — class-list mode (no ?docClass=), doc-list mode
 * (?docClass=<name>), assign-to-selection-dimension flow.
 *
 * Phase F3 of the one-canvas redesign. Mocks:
 *   - `useClassCounts` for the class-list mode
 *   - `useDocuments` for the doc-list mode
 *   - `next/navigation` (router + searchParams) so we can flip
 *     `?docClass=` and observe the URL writes
 *   - `useWorkspaceSelection` for the AssignMenu's set() target
 *
 * Includes pure-helper coverage for `deriveDocumentClasses`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const useClassCountsMock = vi.fn();
const useDocumentsMock = vi.fn();
const setSelectionMock = vi.fn();
const useWorkspaceSelectionMock = vi.fn();
const replaceMock = vi.fn();
let searchParamsStub: URLSearchParams = new URLSearchParams();
let pathnameStub: string = '/my/workspace/ds-test';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsStub,
  usePathname: () => pathnameStub,
}));

vi.mock('@/lib/api/datasets', () => ({
  useClassCounts: (...args: unknown[]) => useClassCountsMock(...args),
}));

vi.mock('@/lib/api/documents', () => ({
  useDocuments: (...args: unknown[]) => useDocumentsMock(...args),
}));

vi.mock('@/lib/workspace/use-workspace-selection', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/workspace/use-workspace-selection')
  >();
  return {
    ...actual,
    useWorkspaceSelection: () => useWorkspaceSelectionMock(),
  };
});

import {
  DocumentsPicker,
  deriveDocumentClasses,
} from '@/components/workspace/canvas/DocumentsPicker';

beforeEach(() => {
  useClassCountsMock.mockReset();
  useDocumentsMock.mockReset();
  setSelectionMock.mockReset();
  useWorkspaceSelectionMock.mockReset();
  replaceMock.mockReset();
  searchParamsStub = new URLSearchParams();
  pathnameStub = '/my/workspace/ds-test';
  useWorkspaceSelectionMock.mockReturnValue({
    selection: {
      subject: null,
      session: null,
      probe: null,
      stimulus: null,
      unit: null,
    },
    hasAnySelection: false,
    pickerTab: 'documents',
    set: setSelectionMock,
    clear: vi.fn(),
    clearOne: vi.fn(),
    setPickerTab: vi.fn(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
  searchParamsStub = new URLSearchParams();
});

describe('deriveDocumentClasses', () => {
  const SAMPLE = {
    subject: 5,
    probe: 3,
    treatment: 12,
    element_epoch: 5,
  };

  it('sorts by count desc with name asc tiebreaker', () => {
    const items = deriveDocumentClasses(SAMPLE, '');
    expect(items[0]).toEqual({ className: 'treatment', count: 12 });
    // Tie between subject and element_epoch at count 5 — tiebreak by name.
    expect(items[1]).toEqual({ className: 'element_epoch', count: 5 });
    expect(items[2]).toEqual({ className: 'subject', count: 5 });
  });

  it('filters by case-insensitive substring', () => {
    const items = deriveDocumentClasses(SAMPLE, 'EPOCH');
    expect(items).toHaveLength(1);
    expect(items[0]!.className).toBe('element_epoch');
  });
});

describe('DocumentsPicker — class-list mode (?docClass= unset)', () => {
  it('renders the loading skeleton while class counts are pending', () => {
    useClassCountsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<DocumentsPicker datasetId="ds1" />);
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders the empty / error state when the query fails', () => {
    useClassCountsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<DocumentsPicker datasetId="ds1" />);

    expect(
      screen.getByText(/couldn’t load class counts/i),
    ).toBeInTheDocument();
  });

  it('renders the class list when data is present', () => {
    useClassCountsMock.mockReturnValue({
      data: {
        totalDocuments: 100,
        classCounts: { subject: 5, probe: 3 },
      },
      isLoading: false,
      isError: false,
    });

    render(<DocumentsPicker datasetId="ds1" />);

    expect(screen.getByText('subject')).toBeInTheDocument();
    expect(screen.getByText('probe')).toBeInTheDocument();
  });

  it('clicking a class writes ?docClass=<name> to the URL', () => {
    useClassCountsMock.mockReturnValue({
      data: {
        totalDocuments: 100,
        classCounts: { subject: 5 },
      },
      isLoading: false,
      isError: false,
    });

    render(<DocumentsPicker datasetId="ds1" />);

    fireEvent.click(screen.getByText('subject'));

    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain('docClass=subject');
  });
});

describe('DocumentsPicker — doc-list mode (?docClass=<name>)', () => {
  beforeEach(() => {
    searchParamsStub = new URLSearchParams('docClass=subject');
  });

  it('calls useDocuments with the class name', () => {
    useDocumentsMock.mockReturnValue({
      data: { documents: [] },
      isLoading: false,
      isError: false,
    });

    render(<DocumentsPicker datasetId="ds1" />);

    expect(useDocumentsMock).toHaveBeenCalledWith('ds1', 'subject', 1, 200);
  });

  it('renders the loading skeleton while docs are pending', () => {
    useDocumentsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<DocumentsPicker datasetId="ds1" />);
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders the empty state when the class has zero docs', () => {
    useDocumentsMock.mockReturnValue({
      data: { documents: [], total: 0, page: 1, pageSize: 200 },
      isLoading: false,
      isError: false,
    });

    render(<DocumentsPicker datasetId="ds1" />);

    expect(screen.getByText(/no documents in this class/i)).toBeInTheDocument();
  });

  it('renders the document list when docs are present', () => {
    useDocumentsMock.mockReturnValue({
      data: {
        documents: [
          { id: 'doc-id-1', name: 'first doc' },
          { id: 'doc-id-2', name: 'second doc' },
        ],
        total: 2,
        page: 1,
        pageSize: 200,
      },
      isLoading: false,
      isError: false,
    });

    render(<DocumentsPicker datasetId="ds1" />);

    expect(screen.getByText('first doc')).toBeInTheDocument();
    expect(screen.getByText('second doc')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Set document/i)).toHaveLength(2);
  });

  it('clicking the back button clears ?docClass= from the URL', () => {
    useDocumentsMock.mockReturnValue({
      data: { documents: [] },
      isLoading: false,
      isError: false,
    });

    render(<DocumentsPicker datasetId="ds1" />);

    fireEvent.click(screen.getByRole('button', { name: /all classes/i }));

    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).not.toContain('docClass=');
  });

  it('selecting "Subject" from the assign menu calls set({ subject: docId })', () => {
    useDocumentsMock.mockReturnValue({
      data: {
        documents: [{ id: 'doc-id-to-assign', name: 'pick me' }],
        total: 1,
        page: 1,
        pageSize: 200,
      },
      isLoading: false,
      isError: false,
    });

    render(<DocumentsPicker datasetId="ds1" />);

    const select = screen.getByLabelText(/Set document/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'subject' } });

    expect(setSelectionMock).toHaveBeenCalledTimes(1);
    expect(setSelectionMock).toHaveBeenCalledWith({
      subject: 'doc-id-to-assign',
    });
  });

  it('selecting "Probe" from the assign menu calls set({ probe: docId })', () => {
    useDocumentsMock.mockReturnValue({
      data: {
        documents: [{ id: 'doc-as-probe', name: 'a probe doc' }],
        total: 1,
        page: 1,
        pageSize: 200,
      },
      isLoading: false,
      isError: false,
    });

    render(<DocumentsPicker datasetId="ds1" />);

    const select = screen.getByLabelText(/Set document/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'probe' } });

    expect(setSelectionMock).toHaveBeenCalledWith({
      probe: 'doc-as-probe',
    });
  });
});
