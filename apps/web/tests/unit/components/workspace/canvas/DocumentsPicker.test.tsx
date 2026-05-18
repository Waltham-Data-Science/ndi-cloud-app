/**
 * DocumentsPicker — class-list mode (no ?docClass=), doc-list mode
 * (?docClass=<name>), assign-to-selection-dimension flow.
 *
 * Phase G7 (2026-05-16). The doc-list mode now delegates row
 * rendering to the shared `WorkspaceDataGrid` primitive. Class-list
 * mode stays a button stack (clicks are picker-local navigation, not
 * selection writes). Tests:
 *   - pure `deriveDocumentClasses` (unchanged)
 *   - class-list rendering / loading / error / click → ?docClass=
 *   - doc-list rendering with the grid stub
 *   - "Set as <X>" context-menu group calls set({ [X]: docId })
 *   - bulk-actions factory shape
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { BulkAction } from '@/components/workspace/canvas/DataGridBulkActions';
import type {
  ContextMenuEntry,
  ContextMenuGroup,
  ContextMenuItem,
} from '@/components/workspace/canvas/DataGridContextMenu';

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

interface CapturedGridProps {
  data: unknown[];
  rowId: (row: unknown) => string;
  noun: string;
  primaryId: string | null;
  onPrimaryChange: (id: string | null) => void;
  contextMenuActions: (row: unknown) => ReadonlyArray<ContextMenuEntry>;
  bulkActions: (ids: ReadonlyArray<string>) => ReadonlyArray<BulkAction>;
  lockedColumnIds?: ReadonlyArray<string>;
}

let captured: CapturedGridProps | null = null;

vi.mock('@/components/workspace/canvas/WorkspaceDataGrid', () => ({
  WorkspaceDataGrid: (props: CapturedGridProps) => {
    captured = props;
    return (
      <div data-testid="workspace-data-grid-stub">
        <span data-testid="grid-noun">{props.noun}</span>
        <span data-testid="grid-row-count">{props.data.length}</span>
      </div>
    );
  },
}));

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
  captured = null;
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

  it('renders the empty state via the grid stub when the class has zero docs', () => {
    useDocumentsMock.mockReturnValue({
      data: { documents: [], total: 0, page: 1, pageSize: 200 },
      isLoading: false,
      isError: false,
    });

    render(<DocumentsPicker datasetId="ds1" />);

    expect(screen.getByTestId('grid-row-count')).toHaveTextContent('0');
  });

  it('renders the grid with the document rows', () => {
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

    expect(screen.getByTestId('grid-row-count')).toHaveTextContent('2');
    expect(screen.getByTestId('grid-noun')).toHaveTextContent('document');
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
});

// ── Context-menu factory. ─────────────────────────────────────────
describe('DocumentsPicker — context menu actions', () => {
  beforeEach(() => {
    searchParamsStub = new URLSearchParams('docClass=subject');
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
  });

  it('builds a "Set as" group with all 5 selection dimensions', () => {
    render(<DocumentsPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({
      docId: 'doc-id-to-assign',
      name: 'pick me',
      raw: {},
    });
    const group = actions.find(
      (a): a is ContextMenuGroup =>
        a.kind === 'group' && a.label === 'Set as',
    );
    expect(group).toBeDefined();
    expect(group!.items.map((it) => it.label)).toEqual([
      'Subject',
      'Session',
      'Probe',
      'Stimulus',
      'Unit',
    ]);
  });

  it('"Set as Subject" calls set({ subject: docId })', () => {
    render(<DocumentsPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({
      docId: 'doc-id-to-assign',
      name: 'pick me',
      raw: {},
    });
    const group = actions.find(
      (a): a is ContextMenuGroup => a.kind === 'group',
    );
    const subjectItem = group!.items.find((it) => it.label === 'Subject');
    subjectItem!.onSelect();
    expect(setSelectionMock).toHaveBeenCalledWith({
      subject: 'doc-id-to-assign',
    });
  });

  it('"Set as Probe" calls set({ probe: docId })', () => {
    render(<DocumentsPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({
      docId: 'doc-id-to-assign',
      name: 'pick me',
      raw: {},
    });
    const group = actions.find(
      (a): a is ContextMenuGroup => a.kind === 'group',
    );
    const probeItem = group!.items.find((it) => it.label === 'Probe');
    probeItem!.onSelect();
    expect(setSelectionMock).toHaveBeenCalledWith({
      probe: 'doc-id-to-assign',
    });
  });

  it('includes Copy ID + Open in Document Detail items', () => {
    render(<DocumentsPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({
      docId: 'doc-id-to-assign',
      name: 'pick me',
      raw: {},
    });
    const itemLabels = actions
      .filter((a): a is ContextMenuItem => a.kind === 'item')
      .map((a) => a.label);
    expect(itemLabels).toContain('Copy ID');
    expect(itemLabels).toContain('Open in Document Detail');
  });

  it('"Open in Document Detail" opens the doc-detail route', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);

    render(<DocumentsPicker datasetId="ds1" />);
    const actions = captured!.contextMenuActions({
      docId: 'doc-id-to-assign',
      name: 'pick me',
      raw: {},
    });
    const item = actions.find(
      (a): a is ContextMenuItem =>
        a.kind === 'item' && a.label === 'Open in Document Detail',
    );
    item!.onSelect();
    expect(open).toHaveBeenCalledWith(
      '/datasets/ds1/documents/doc-id-to-assign',
      '_blank',
      'noopener,noreferrer',
    );
    vi.unstubAllGlobals();
  });
});

// ── Bulk actions factory. ─────────────────────────────────────────
describe('DocumentsPicker — bulk actions', () => {
  beforeEach(() => {
    searchParamsStub = new URLSearchParams('docClass=subject');
    useDocumentsMock.mockReturnValue({
      data: {
        documents: [{ id: 'doc-1', name: 'first' }],
        total: 1,
        page: 1,
        pageSize: 200,
      },
      isLoading: false,
      isError: false,
    });
  });

  it('builds copy-ids + ask-claude actions', () => {
    render(<DocumentsPicker datasetId="ds1" />);
    const actions = captured!.bulkActions(['d1', 'd2']);
    expect(actions.map((a) => a.id)).toEqual(['copy-ids', 'ask-claude']);
    expect(actions[0]!.label).toBe('Copy 2 IDs');
  });

  it('"Ask Claude" emits an ask-prefill payload via the bus (uses doc class as noun)', async () => {
    const {
      __resetAskPrefillBusForTests,
      subscribeToAskPrefill,
    } = await import('@/lib/ai/ask-prefill-bus');
    __resetAskPrefillBusForTests();
    const received: Array<{ text: string; autoSend?: boolean }> = [];
    const unsub = subscribeToAskPrefill((p) => received.push(p));

    render(<DocumentsPicker datasetId="ds1" />);
    const actions = captured!.bulkActions(['d1']);
    const ask = actions.find((a) => a.id === 'ask-claude');
    ask!.onSelect(['d1']);

    expect(received).toHaveLength(1);
    // Test setup activates docClass='subject' so the prompt
    // should use "subject" not the generic "document".
    expect(received[0]!.text).toContain('subject');
    expect(received[0]!.text).toContain('d1');
    expect(received[0]!.autoSend).toBe(false);

    unsub();
    __resetAskPrefillBusForTests();
  });
});
