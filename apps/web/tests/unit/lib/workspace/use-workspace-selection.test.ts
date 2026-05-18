/**
 * useWorkspaceSelection — URL-state hook for the workspace canvas's
 * multi-key selection context.
 *
 * Phase F1 of the one-canvas redesign (2026-05-16). Tests exercise:
 *
 *   - reading each of the 5 selection dimensions out of URL params
 *   - invalid (non-hex) values silently degrade to null (defensive
 *     against hostile share links)
 *   - `set()` patches one or more keys atomically in a single URL write
 *   - `set()` with null/empty/missing values removes the URL param
 *   - `set()` with an invalid hex value is silently ignored (no garbage
 *     ever written back to the URL)
 *   - `clear()` removes all 5 dimensions in one write
 *   - `clearOne()` removes a single dimension
 *   - the picker tab is read from `?pick=` and defaults to `subjects`
 *   - `setPickerTab()` updates `?pick=` without touching selection
 *   - unrelated query params (e.g. ?ask=drawer) are preserved through
 *     every mutation — critical, because the AskPanel is a sibling
 *     URL-state consumer
 *   - `hasAnySelection` reflects whether any dimension is set
 *
 * Next.js navigation is stubbed at the module level, same as the
 * Phase D useAskPanelState test (the pattern is intentional and
 * cross-tested).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const replaceMock = vi.fn();
let searchParamsStub: URLSearchParams = new URLSearchParams();
let pathnameStub: string = '/my/workspace/ds-test';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsStub,
  usePathname: () => pathnameStub,
}));

import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

/**
 * NDI uses multiple id shapes across its document classes — the
 * suite uses representative samples of each:
 *   - 24-char hex Mongo ObjectId (most chart inputs)
 *   - 32-char `<hex>_<hex>` compound id (subject document identifier)
 *   - Local NDI identifier with hyphens ("NSUBJ-005-PR811")
 * All three must round-trip through the hook untouched.
 */
const VALID_ID_1 = '68d6e54703a03f5cfdac8eff';
const VALID_ID_2 = '68d6e54703a03f5cfdac8f00';
const VALID_ID_3 = '68d6e54703a03f5cfdac8f01';
const VALID_COMPOUND_ID = '4126945ae99b0be0_40c293809848f24d';
const VALID_LOCAL_ID = 'NSUBJ-005-PR811';

function setParam(key: string, value: string | null) {
  const p = new URLSearchParams(searchParamsStub.toString());
  if (value === null) {
    p.delete(key);
  } else {
    p.set(key, value);
  }
  searchParamsStub = p;
}

beforeEach(() => {
  replaceMock.mockReset();
  searchParamsStub = new URLSearchParams();
  pathnameStub = '/my/workspace/ds-test';
});

afterEach(() => {
  searchParamsStub = new URLSearchParams();
});

describe('useWorkspaceSelection — initial read', () => {
  it('returns all-null selection when no params present', () => {
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection).toEqual({
      subject: null,
      session: null,
      probe: null,
      stimulus: null,
      unit: null,
    });
    expect(result.current.hasAnySelection).toBe(false);
  });

  it('reads ?subject= into selection.subject', () => {
    setParam('subject', VALID_ID_1);
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.subject).toBe(VALID_ID_1);
    expect(result.current.hasAnySelection).toBe(true);
  });

  it('reads ?session= into selection.session', () => {
    setParam('session', VALID_ID_1);
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.session).toBe(VALID_ID_1);
  });

  it('reads ?probe= into selection.probe', () => {
    setParam('probe', VALID_ID_1);
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.probe).toBe(VALID_ID_1);
  });

  it('reads ?stim= (short form) into selection.stimulus', () => {
    setParam('stim', VALID_ID_1);
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.stimulus).toBe(VALID_ID_1);
  });

  it('reads ?unit= into selection.unit', () => {
    setParam('unit', VALID_ID_1);
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.unit).toBe(VALID_ID_1);
  });

  it('reads multiple dimensions simultaneously', () => {
    setParam('subject', VALID_ID_1);
    setParam('session', VALID_ID_2);
    setParam('unit', VALID_ID_3);
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.subject).toBe(VALID_ID_1);
    expect(result.current.selection.session).toBe(VALID_ID_2);
    expect(result.current.selection.unit).toBe(VALID_ID_3);
    expect(result.current.hasAnySelection).toBe(true);
  });
});

describe('useWorkspaceSelection — id-shape permissiveness', () => {
  // NDI ids come in multiple shapes; the validator deliberately
  // accepts anything that isn't obvious garbage. Strict shape
  // checks (e.g. 24-hex-only) would silently reject every real
  // subject-id pick — that's the bug that motivated this hook.

  it('accepts a 32-char `<hex>_<hex>` compound id', () => {
    setParam('subject', VALID_COMPOUND_ID);
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.subject).toBe(VALID_COMPOUND_ID);
  });

  it('accepts a local NDI identifier with hyphens', () => {
    setParam('subject', VALID_LOCAL_ID);
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.subject).toBe(VALID_LOCAL_ID);
  });

  it('accepts short ids without rejecting them', () => {
    setParam('subject', 'abc123');
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.subject).toBe('abc123');
  });

  it('treats an empty string as no selection', () => {
    setParam('subject', '');
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.subject).toBeNull();
  });

  it('rejects values containing whitespace (garbage / share-link tampering)', () => {
    setParam('subject', 'hello world');
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.subject).toBeNull();
  });

  it('rejects absurdly long values (>128 chars)', () => {
    setParam('subject', 'a'.repeat(129));
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.subject).toBeNull();
  });

  it('accepts exactly 128 chars at the boundary', () => {
    const onTwentyEight = 'a'.repeat(128);
    setParam('subject', onTwentyEight);
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.selection.subject).toBe(onTwentyEight);
  });
});

describe('useWorkspaceSelection — set() patch', () => {
  it('writes a single key', () => {
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.set({ subject: VALID_ID_1 });
    });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain(`subject=${VALID_ID_1}`);
  });

  it('writes multiple keys atomically in a single URL write', () => {
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.set({ subject: VALID_ID_1, session: VALID_ID_2 });
    });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain(`subject=${VALID_ID_1}`);
    expect(url).toContain(`session=${VALID_ID_2}`);
  });

  it('removes a key when value is null', () => {
    setParam('subject', VALID_ID_1);
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.set({ subject: null });
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).not.toContain('subject=');
  });

  it('removes a key when value is empty string', () => {
    setParam('subject', VALID_ID_1);
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.set({ subject: '' });
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).not.toContain('subject=');
  });

  it('uses ?stim= short-form when patching stimulus', () => {
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.set({ stimulus: VALID_ID_1 });
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain(`stim=${VALID_ID_1}`);
    expect(url).not.toContain('stimulus=');
  });

  it('silently ignores values containing whitespace (does not write garbage)', () => {
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.set({ subject: 'hello world' });
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).not.toContain('subject=');
  });

  it('accepts compound NDI subject ids (no shape constraint)', () => {
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.set({ subject: VALID_COMPOUND_ID });
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain(`subject=${VALID_COMPOUND_ID}`);
  });

  it('keys not in the patch are left untouched', () => {
    setParam('subject', VALID_ID_1);
    setParam('session', VALID_ID_2);
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.set({ probe: VALID_ID_3 });
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain(`subject=${VALID_ID_1}`);
    expect(url).toContain(`session=${VALID_ID_2}`);
    expect(url).toContain(`probe=${VALID_ID_3}`);
  });
});

describe('useWorkspaceSelection — clear()', () => {
  it('removes all 5 dimensions in a single URL write', () => {
    setParam('subject', VALID_ID_1);
    setParam('session', VALID_ID_2);
    setParam('probe', VALID_ID_3);
    setParam('stim', VALID_ID_1);
    setParam('unit', VALID_ID_2);
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.clear();
    });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).not.toContain('subject=');
    expect(url).not.toContain('session=');
    expect(url).not.toContain('probe=');
    expect(url).not.toContain('stim=');
    expect(url).not.toContain('unit=');
  });

  it('preserves unrelated params (e.g. ?ask=drawer)', () => {
    setParam('subject', VALID_ID_1);
    setParam('ask', 'drawer');
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.clear();
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain('ask=drawer');
    expect(url).not.toContain('subject=');
  });
});

describe('useWorkspaceSelection — clearOne()', () => {
  it('removes only the specified dimension', () => {
    setParam('subject', VALID_ID_1);
    setParam('session', VALID_ID_2);
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.clearOne('subject');
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).not.toContain('subject=');
    expect(url).toContain(`session=${VALID_ID_2}`);
  });
});

describe('useWorkspaceSelection — picker tab', () => {
  it('defaults to "subjects" when no ?pick= is present', () => {
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.pickerTab).toBe('subjects');
  });

  it.each(['subjects', 'sessions', 'probes', 'stimuli', 'documents'])(
    'reads ?pick=%s',
    (tab) => {
      setParam('pick', tab);
      const { result } = renderHook(() => useWorkspaceSelection());
      expect(result.current.pickerTab).toBe(tab);
    },
  );

  it('falls back to "subjects" on an invalid ?pick= value', () => {
    setParam('pick', 'bogus');
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.pickerTab).toBe('subjects');
  });

  it('setPickerTab writes ?pick= without touching selection', () => {
    setParam('subject', VALID_ID_1);
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.setPickerTab('sessions');
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain('pick=sessions');
    expect(url).toContain(`subject=${VALID_ID_1}`);
  });
});

describe('useWorkspaceSelection — preserves unrelated params', () => {
  it('keeps ?ask=drawer through a selection patch', () => {
    setParam('ask', 'drawer');
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.set({ subject: VALID_ID_1 });
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain('ask=drawer');
    expect(url).toContain(`subject=${VALID_ID_1}`);
  });

  it('keeps arbitrary query params through clearOne', () => {
    setParam('subject', VALID_ID_1);
    setParam('foo', 'bar');
    const { result } = renderHook(() => useWorkspaceSelection());
    act(() => {
      result.current.clearOne('subject');
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain('foo=bar');
    expect(url).not.toContain('subject=');
  });
});

describe('useWorkspaceSelection — hasAnySelection', () => {
  it('is false when nothing is selected', () => {
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.hasAnySelection).toBe(false);
  });

  it('is true when any single dimension is set', () => {
    setParam('unit', VALID_ID_1);
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.hasAnySelection).toBe(true);
  });

  it('is false when all values are garbage (whitespace, degrade to null)', () => {
    setParam('subject', 'with space');
    setParam('session', 'also with space');
    const { result } = renderHook(() => useWorkspaceSelection());
    expect(result.current.hasAnySelection).toBe(false);
  });
});
