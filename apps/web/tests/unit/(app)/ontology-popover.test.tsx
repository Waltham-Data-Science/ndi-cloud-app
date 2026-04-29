/**
 * OntologyPopover — audit #66 hover-delay + Escape + safeHref gate.
 *
 * The data-browser shipped a 327-LOC custom popover with bespoke
 * placement logic, scroll re-anchoring, and portal handling. Phase 3d
 * rewrites it on the `FloatingPanel` primitive (Phase 3a) — that
 * collapses the placement / portal / re-anchor concerns to the
 * primitive and frees the popover to focus on its actual UX contract:
 *   - 150ms open delay (post-hover) so a cursor swiping past a term
 *     doesn't trigger an unwanted popover flash
 *   - 100ms close grace so transit through the 4px trigger-popover
 *     gap doesn't dismiss
 *   - Escape dismisses
 *   - safeHref guard on the provider URL (audit M3 from PR #76 carries)
 *   - EMPTY: prefix renders as plain monospace text (NDI internal IDs,
 *     no external lookup)
 *
 * Tests use `vi.useFakeTimers()` so the timer-based delays can be
 * deterministically advanced. Each `advanceTimersByTime` is wrapped in
 * `act()` so React commits the resulting state before the assertion
 * runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { OntologyPopover } from '@/components/ontology/OntologyPopover';
import { apiFetch } from '@/lib/api/client';

const mockedApiFetch = vi.mocked(apiFetch);

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestQueryProvider;
}

function termFixture(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'NCBITaxon',
    termId: '6239',
    label: 'C. elegans',
    definition: 'A model nematode.',
    url: 'https://example.com',
    ...overrides,
  };
}

beforeEach(() => {
  mockedApiFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('OntologyPopover — audit #66 hover-delay + a11y', () => {
  it('does not open the popover for the first 100ms of hover (debounce)', () => {
    vi.useFakeTimers();
    mockedApiFetch.mockResolvedValue(termFixture());

    const Wrapper = withClient();
    render(
      <Wrapper>
        <OntologyPopover termId="NCBITaxon:6239" />
      </Wrapper>,
    );
    const trigger = screen.getByRole('button', { name: /Ontology term/i });

    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the popover after the 150ms open-delay', () => {
    vi.useFakeTimers();
    mockedApiFetch.mockResolvedValue(termFixture());

    const Wrapper = withClient();
    render(
      <Wrapper>
        <OntologyPopover termId="NCBITaxon:6239" />
      </Wrapper>,
    );
    const trigger = screen.getByRole('button', { name: /Ontology term/i });
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes 100ms after mouseleave (close-grace)', () => {
    vi.useFakeTimers();
    mockedApiFetch.mockResolvedValue(termFixture());

    const Wrapper = withClient();
    render(
      <Wrapper>
        <OntologyPopover termId="NCBITaxon:6239" />
      </Wrapper>,
    );
    const trigger = screen.getByRole('button', { name: /Ontology term/i });
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    // Still open inside the 100ms grace.
    expect(screen.queryByRole('dialog')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', () => {
    vi.useFakeTimers();
    mockedApiFetch.mockResolvedValue(termFixture());

    const Wrapper = withClient();
    render(
      <Wrapper>
        <OntologyPopover termId="NCBITaxon:6239" />
      </Wrapper>,
    );
    fireEvent.mouseEnter(
      screen.getByRole('button', { name: /Ontology term/i }),
    );
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('focus on the trigger opens the popover (keyboard activation)', async () => {
    // Real timers — focus path doesn't use any timers, so fake timers
    // would just create false negatives via state-update batching.
    mockedApiFetch.mockResolvedValue(termFixture({ definition: null, url: null }));

    const Wrapper = withClient();
    render(
      <Wrapper>
        <OntologyPopover termId="NCBITaxon:6239" />
      </Wrapper>,
    );
    const trigger = screen.getByRole('button', { name: /Ontology term/i });
    fireEvent.focus(trigger);
    // Focus → instant open (no hover-delay; keyboard users want
    // immediate response).
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders EMPTY: terms as plain monospace text (no popover, no fetch)', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <OntologyPopover termId="EMPTY:0000198" />
      </Wrapper>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('0000198')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('routes the provider URL through safeHref (audit M3 carry)', async () => {
    vi.useFakeTimers();
    mockedApiFetch.mockResolvedValue(termFixture({ url: 'javascript:alert(1)' }));

    const Wrapper = withClient();
    render(
      <Wrapper>
        <OntologyPopover termId="NCBITaxon:6239" />
      </Wrapper>,
    );
    fireEvent.mouseEnter(
      screen.getByRole('button', { name: /Ontology term/i }),
    );
    act(() => {
      vi.advanceTimersByTime(160);
    });
    vi.useRealTimers();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // 2026-04-29 — narrowed: the strain-name round-3 work added an
    // independent external-link icon next to the chip when the term
    // ID maps to a known resolver via `ontologyUrl(...)` (Wormbase,
    // NCBI Taxonomy, EBI OLS4, SciCrunch). That link is computed
    // from the term ID itself, NOT from the popover's API response,
    // so it doesn't carry the safeHref XSS surface this test pins.
    // Narrowed to the popover-content `<ProviderLink>` ("View on
    // provider →"), which IS the link safeHref guards.
    expect(
      screen.queryByRole('link', { name: /view on provider/i }),
    ).toBeNull();
  });
});
