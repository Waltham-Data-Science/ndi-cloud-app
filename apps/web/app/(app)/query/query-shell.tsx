'use client';

/**
 * `/query` content shell — Phase 6.5e (cross-repo unification).
 *
 * Ported from `ndi-data-browser-v2/frontend/src/pages/QueryPage.tsx`
 * (the data-browser's QueryPage body, sans hero — the hero stays in the
 * RSC at `./page.tsx` so it ships static HTML). Replaces the Phase 3e
 * structural shell with the real cross-cloud query surface:
 *
 *   - **FacetPanel (left)** — distinct-values chips backed by
 *     `useFacets`. Click → in-memory seed bumps the QueryBuilder via
 *     React state (no URL round-trip; the chip-click contract from
 *     6.5d's catalog FacetPanel uses URL params instead, both work).
 *   - **QueryBuilder (center)** — full ported builder with the
 *     `?op=...&field=...&param1=...` URL-hydration block reading the
 *     6.5d catalog chip-click landing format.
 *   - **OutputShapePreview (right)** — static B6a column-set preview.
 *   - **ResultsCard (below builder)** — first-200 results table with
 *     cross-links to dataset detail pages. Renders only when results
 *     are present.
 *
 * Component-level splitting per the migration plan: this shell renders
 * three coordinated cards plus a results table. None individually meets
 * the "heavy widget below the fold" bar that Phase 3b/3c set for
 * `next/dynamic` (no D3, no uPlot, no AST viz). Bundle stays under the
 * 200 KB gz cap by virtue of being plain forms + tables.
 *
 * Two facet-click paths converge here:
 *   1. **Same-page chip click** (FacetPanel sidebar inside this shell)
 *      bumps `seedKey` and remounts the builder with `seedConditions`.
 *      Deterministic; doesn't touch URL state.
 *   2. **Cross-page chip click** (catalog FacetPanel from 6.5d) pushes
 *      `/query?op=...&field=data.ontology_name&param1=...`. The
 *      QueryBuilder's mount-time `useEffect` reads URL params and
 *      prefills the predicate.
 *
 * Both land in an open advanced-filters panel with the predicate
 * applied; one click on "Run query" executes it.
 */
import { useState } from 'react';

import { FacetPanel } from '@/components/app/FacetPanel';
import { OutputShapePreview } from '@/components/app/OutputShapePreview';
import { QueryBuilder } from '@/components/app/QueryBuilder';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatNumber } from '@/lib/format';
import type { QueryNode, QueryResponse } from '@/lib/api/query';
import type { OntologyTerm } from '@/lib/types/facets';

export function QueryShell() {
  const [results, setResults] = useState<QueryResponse | null>(null);
  // Facet clicks inject a fresh seed + re-key the builder so the
  // initialization useEffect re-runs. `seedKey` increments
  // monotonically per click; `seed` holds the initial condition list
  // the builder should start with.
  const [seed, setSeed] = useState<{
    key: number;
    conditions: QueryNode[];
  } | null>(null);

  const handleSelectOntologyFacet = (
    _kind: 'species' | 'brainRegions' | 'strains' | 'sexes',
    term: OntologyTerm,
  ) => {
    // Same canonical field path as the data-browser's QueryPage and the
    // 6.5d catalog chip handler: `data.ontology_name` matches both full
    // IDs (`NCBITaxon:10116`) and human labels in the same cell.
    const param1 = term.ontologyId ?? term.label;
    if (!param1) return;
    const condition: QueryNode = {
      operation: 'contains_string',
      field: 'data.ontology_name',
      param1,
    };
    setSeed((prev) => ({
      key: (prev?.key ?? 0) + 1,
      conditions: [condition],
    }));
  };

  const handleSelectProbeType = (probeType: string) => {
    // `element.type` is the canonical probe-type field — same as the
    // data-browser's QueryPage and the 6.5d catalog chip handler.
    const condition: QueryNode = {
      operation: 'contains_string',
      field: 'element.type',
      param1: probeType,
    };
    setSeed((prev) => ({
      key: (prev?.key ?? 0) + 1,
      conditions: [condition],
    }));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)_20rem]">
      <aside className="space-y-4 min-w-0">
        <FacetPanel
          onSelectOntologyFacet={handleSelectOntologyFacet}
          onSelectProbeType={handleSelectProbeType}
        />
      </aside>

      <section className="space-y-4 min-w-0">
        {/*
          `key` forces a re-mount on each facet click so the builder's
          mount-time useEffect picks up the fresh seed. Without this a
          second click on a different chip would not reach the builder's
          state (its useEffect runs once per mount).
        */}
        <QueryBuilder
          key={seed?.key ?? 'initial'}
          onResults={setResults}
          onClear={() => setResults(null)}
          seedConditions={seed?.conditions}
        />
        {results && <ResultsCard results={results} />}
      </section>

      <aside className="space-y-4 min-w-0">
        <OutputShapePreview />
      </aside>
    </div>
  );
}

function ResultsCard({ results }: { results: QueryResponse }) {
  const docs = results.documents ?? [];
  const total =
    results.total ?? results.totalItems ?? results.number_matches ?? docs.length;
  return (
    <Card data-testid="query-results">
      <CardHeader>
        <CardTitle className="text-sm">
          Results — {formatNumber(total)} documents
        </CardTitle>
      </CardHeader>
      <CardBody>
        {docs.length === 0 ? (
          <p className="text-sm text-fg-muted">No matching documents.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-border-subtle">
            <table className="w-full text-sm">
              <thead className="bg-bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-fg-secondary">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-fg-secondary">
                    Class
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-fg-secondary">
                    Dataset
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-fg-secondary">
                    ndiId
                  </th>
                </tr>
              </thead>
              <tbody>
                {docs.slice(0, 200).map((d, i) => {
                  const id = String(d.id ?? d.ndiId ?? i);
                  const dsId = String(d.datasetId ?? '');
                  return (
                    <tr
                      key={id}
                      className="border-t border-border-subtle hover:bg-bg-muted"
                    >
                      <td className="px-3 py-1.5">
                        {dsId && d.id ? (
                          <a
                            href={`/datasets/${dsId}/documents/${d.id}`}
                            className="text-ndi-teal hover:underline"
                          >
                            {String(d.name ?? d.id)}
                          </a>
                        ) : (
                          <span>{String(d.name ?? d.id ?? '')}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {String(d.className ?? '—')}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-fg-muted">
                        {dsId ? (
                          <a
                            href={`/datasets/${dsId}`}
                            className="hover:underline"
                          >
                            {dsId.slice(0, 8)}…
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-fg-muted truncate max-w-[220px] md:max-w-[340px] lg:max-w-[480px]">
                        {String(d.ndiId ?? '')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {docs.length > 200 && (
              <p className="px-3 py-2 text-xs text-fg-muted">
                Showing first 200 of {formatNumber(docs.length)} returned
                documents.
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
