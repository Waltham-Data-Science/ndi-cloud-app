'use client';

/**
 * Catalog filter sidebar — Phase 6.6 REBUILD-5.
 *
 * Multi-select species/brain-region/license filter for `/datasets`.
 * Ported from `ndi-data-browser-v2/frontend/src/pages/DatasetsPage.tsx:446-589`
 * (the inline `FacetSidebar` + `FacetGroup` closures).
 *
 * Adapter changes vs. source:
 *   1. Lifted from a private closure inside `DatasetsPage` into a named
 *      module export so the catalog client island can import it directly
 *      and the test suite can render it in isolation.
 *   2. `cn` import path (`@/lib/cn`) matches monorepo's existing helper.
 *   3. The mobile toggle uses the ported `<Button variant="secondary">`
 *      from `@/components/ui/Button` (same primitive the source uses).
 *
 * Pure rendering + interaction surface — owns no URL state. The
 * `onToggleSpecies` / `onToggleRegion` / `onToggleLicense` callbacks
 * receive the toggled string; the caller (the catalog client island)
 * is responsible for translating that into a `router.push` URL update.
 * That separation makes the sidebar reusable for any future
 * non-URL-state list (e.g. an embedded picker in a modal).
 */
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export interface FacetSidebarProps {
  species: string[];
  regions: string[];
  licenses: string[];
  activeSpecies: string[];
  activeRegions: string[];
  activeLicenses: string[];
  onToggleSpecies: (v: string) => void;
  onToggleRegion: (v: string) => void;
  onToggleLicense: (v: string) => void;
  loading: boolean;
}

export function FacetSidebar({
  species,
  regions,
  licenses,
  activeSpecies,
  activeRegions,
  activeLicenses,
  onToggleSpecies,
  onToggleRegion,
  onToggleLicense,
  loading,
}: FacetSidebarProps) {
  const [open, setOpen] = useState(false);
  const hasAny = species.length + regions.length + licenses.length > 0;

  return (
    <>
      {/* Mobile toggle — desktop hides this row (the aside is always
       * visible at md+). */}
      <div className="md:hidden">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className="w-full justify-center"
        >
          {open ? 'Hide filters' : 'Show filters'}
        </Button>
      </div>

      <aside
        className={cn(
          'md:sticky md:top-20 md:self-start md:block space-y-3',
          open ? 'block' : 'hidden md:block',
        )}
        aria-label="Dataset filters"
      >
        <FacetGroup
          title="Species"
          options={species}
          active={activeSpecies}
          onToggle={onToggleSpecies}
          loading={loading}
          emptyHint="No species aggregated yet."
        />
        <FacetGroup
          title="Brain region"
          options={regions}
          active={activeRegions}
          onToggle={onToggleRegion}
          loading={loading}
          emptyHint="No regions aggregated yet."
        />
        {/* License is derived client-side from the current page's
         * datasets — it never has a "loading" state of its own. Source
         * intentionally passes `loading={false}` here. */}
        <FacetGroup
          title="License"
          options={licenses}
          active={activeLicenses}
          onToggle={onToggleLicense}
          loading={false}
          emptyHint="No licenses on current page."
        />
        {!loading && !hasAny && (
          <p className="text-[11.5px] text-fg-muted px-1">
            Facets will appear here once the first datasets index.
          </p>
        )}
      </aside>
    </>
  );
}

interface FacetGroupProps {
  title: string;
  options: string[];
  active: string[];
  onToggle: (v: string) => void;
  loading: boolean;
  emptyHint: string;
}

function FacetGroup({
  title,
  options,
  active,
  onToggle,
  loading,
  emptyHint,
}: FacetGroupProps) {
  return (
    <div className="bg-white rounded-xl border border-border-subtle p-4">
      {/* Phase 6.6 PR-G a11y polish: was `<h5>` (heading-order
       * violation on `/datasets` — the page has h1 + h2 from the
       * hero/results-info chrome; jumping to h5 here skips h3+h4).
       * Facet group titles are visual labels for the checkbox lists,
       * not navigation milestones, so `<p>` preserves the styling
       * without the false heading semantic. The checkbox `<ul>` below
       * carries the actual interactive structure.
       */}
      <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-fg-muted mb-3">
        {title}
      </p>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-4 bg-bg-muted rounded animate-pulse"
            />
          ))}
        </div>
      ) : options.length === 0 ? (
        <p className="text-[11.5px] text-fg-muted">{emptyHint}</p>
      ) : (
        <ul className="space-y-1">
          {options.slice(0, 24).map((opt) => {
            const checked = active.includes(opt);
            return (
              <li key={opt}>
                <label
                  className={cn(
                    'flex items-center gap-2 py-1 text-[13px] cursor-pointer rounded-md px-1',
                    checked
                      ? 'text-ndi-teal font-medium'
                      : 'text-fg-secondary hover:text-brand-navy',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(opt)}
                    className="accent-[var(--ndi-teal)] h-3.5 w-3.5 m-0"
                    aria-label={opt}
                  />
                  <span className="truncate" title={opt}>
                    {opt}
                  </span>
                </label>
              </li>
            );
          })}
          {options.length > 24 && (
            <li className="text-[11px] text-fg-muted px-1 pt-1">
              + {options.length - 24} more (refine with search)
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
