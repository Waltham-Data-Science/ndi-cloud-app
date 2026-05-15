'use client';

/**
 * DocumentDetailView — rich JSON tree + dependencies + files for a single
 * NDI document.
 *
 * Ported from `ndi-data-browser-v2/frontend/src/components/documents/DocumentDetail.tsx`
 * (Phase 6.5c of the cross-repo unification — see
 * `docs/plans/cross-repo-unification-2026-04-24.md`). Two monorepo
 * adaptations vs. v2 source:
 *
 *   1. Replaces react-router-dom `<Link>` with Next's `<Link>`. Same
 *      contract; only the import path differs.
 *   2. Imports rewritten for monorepo layout.
 *
 * Original behavior:
 *
 * - JSON-tree rendering of every non-special field on the document.
 * - Per-class header with NDI id / class name / definition / datestamp.
 * - Dependencies list (one row per `depends_on` entry, linked through
 *   to that doc's detail page).
 * - File list (when the document has `files.file_info`).
 * - 200-char string truncation + 100-item array truncation in the
 *   JSON tree to keep the DOM manageable on giant docs.
 *
 * Note: the data-browser also ships `DependencyGraph` (a D3 viz of the
 * doc's depends_on graph). That visualization layer is deferred — the
 * inline dependency list above renders the same data in a textual form
 * that's sufficient for first ship. See FOLLOW-UP at the bottom.
 */
import type { ReactElement } from 'react';
import { Calendar, File, FileText, Link2 } from 'lucide-react';
import Link from 'next/link';

import type { DocumentSummary } from '@/lib/api/documents';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import { formatDateTime } from '@/lib/format';
import { OntologyPopover } from '@/components/ontology/OntologyPopover';
import { isOntologyTerm } from '@/lib/ontology/utils';

interface DocumentDetailViewProps {
  document: DocumentSummary;
  datasetId?: string;
}

/** Color-coded JSON tree — ported from v1 with a small cap on large
 * nested arrays to avoid rendering 10k-entry lists inline. */
function JsonTree({
  data,
  depth = 0,
  keyHint,
}: {
  data: unknown;
  depth?: number;
  keyHint?: string;
}): ReactElement {
  if (data === null || data === undefined) {
    return <span className="text-fg-muted">null</span>;
  }
  if (typeof data === 'boolean') {
    return <span className="text-blue-500">{data ? 'true' : 'false'}</span>;
  }
  if (typeof data === 'number') {
    return <span className="text-emerald-600">{data}</span>;
  }
  if (typeof data === 'string') {
    // Ontology resolution (ontology-sweep audit B4/F2, 2026-05-14): when a
    // string value is a recognized CURIE (e.g. "NCBITaxon:10116",
    // "UBERON:0001870", "CL:0000540"), route it through OntologyPopover
    // so the user sees the resolved label + a click-through to the
    // provider page. Without this, the JsonTree on every
    // /datasets/.../documents/[docId] page renders raw CURIEs as bare
    // quoted strings — the same data the SummaryTableView already
    // resolves elsewhere.
    //
    // Capture `isOntologyTerm`'s boolean result without using the
    // predicate as a type guard — the predicate is `value is string`,
    // and applying it to an already-string value collapses the negative
    // branch to `never` in TS's control-flow analysis.
    const looksOntological: boolean = isOntologyTerm(data);
    if (looksOntological) {
      const trimmed = data.trim();
      const findEverywherePath = `/query?op=contains_string&field=openminds.fields.preferredOntologyIdentifier&param1=${encodeURIComponent(trimmed)}`;
      return (
        <span className="inline-block">
          <OntologyPopover termId={trimmed} findEverywherePath={findEverywherePath} />
        </span>
      );
    }
    if (data.length > 200) {
      return <span className="text-amber-700">&quot;{data.slice(0, 200)}…&quot;</span>;
    }
    return <span className="text-amber-700">&quot;{data}&quot;</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-fg-muted">[]</span>;
    }
    const maxItems = 100;
    const truncated = data.length > maxItems;
    const items = truncated ? data.slice(0, maxItems) : data;
    return (
      <div className={depth > 0 ? 'pl-3 border-l border-border-subtle' : ''}>
        {items.map((item, i) => (
          <div key={i} className="py-0.5">
            <span className="text-fg-muted text-[10px] mr-1">[{i}]</span>
            <JsonTree data={item} depth={depth + 1} />
          </div>
        ))}
        {truncated && (
          <div className="text-[10px] text-fg-muted italic py-0.5">
            + {data.length - maxItems} more items ({keyHint ?? ''})
          </div>
        )}
      </div>
    );
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-fg-muted">{'{}'}</span>;
    }
    return (
      <div className={depth > 0 ? 'pl-3 border-l border-border-subtle' : ''}>
        {entries.map(([k, v]) => (
          <div key={k} className="py-0.5">
            <span className="text-purple-600 font-medium">{k}</span>
            <span className="text-fg-muted">: </span>
            <JsonTree data={v} depth={depth + 1} keyHint={k} />
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(data)}</span>;
}

export function DocumentDetailView({ document: doc, datasetId }: DocumentDetailViewProps) {
  const data = (doc.data ?? {}) as Record<string, unknown>;
  const base = (data.base ?? {}) as Record<string, unknown>;
  const documentClass = (data.document_class ?? {}) as Record<string, unknown>;
  const files = (data.files ?? {}) as Record<string, unknown>;
  const deps = _normalizeDepends(data.depends_on);

  const fileInfo = _normalizeFileInfo(files.file_info);
  const hasFiles = fileInfo.length > 0;

  const displayData = { ...data };
  delete displayData.document_class;
  delete displayData.depends_on;
  delete displayData.files;
  delete displayData.base;

  const className =
    String((documentClass.class_name as string) ?? doc.className ?? '') || 'document';
  const datestamp = (base.datestamp as string) ?? '';
  const ndiId = (base.id as string) ?? doc.ndiId ?? '';
  const definition = (documentClass.definition as string) ?? '';

  return (
    <div className="space-y-4" data-testid="document-detail-view">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <Badge variant="secondary" className="font-mono text-[10px]">
            {className}
          </Badge>
          {hasFiles && (
            <Badge variant="outline" className="font-mono text-[10px]">
              <File className="h-3 w-3 mr-1" />
              Has files
            </Badge>
          )}
        </div>
        {doc.name && (
          <h2 className="text-sm font-medium text-fg-primary leading-tight">
            {doc.name}
          </h2>
        )}
        <div className="mt-1 space-y-0.5 text-[10px] font-mono text-fg-muted leading-tight">
          <p>ID: {ndiId || doc.id}</p>
          {definition && <p>{definition}</p>}
          {datestamp && (
            <p className="flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              {/* Date+time per team review feedback (`Apr 22, 2026 at
                  4:33 PM`) — document timestamps capture a specific
                  moment, so the time component matters. See `formatDateTime`
                  in `lib/format.ts`. */}
              {formatDateTime(datestamp)}
            </p>
          )}
        </div>
      </div>

      {/* Dependencies (top-level list — the visual graph viz is deferred,
          see the FOLLOW-UP block at the bottom of this file) */}
      {deps.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-xs font-medium flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" />
              Dependencies ({deps.length})
            </CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="space-y-1">
              {deps.map((dep, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-fg-muted font-mono">{dep.name}:</span>
                  {dep.value ? (
                    datasetId ? (
                      <Link
                        href={`/datasets/${datasetId}/documents/${dep.value}`}
                        className="font-mono text-ndi-teal hover:underline truncate"
                      >
                        {dep.value}
                      </Link>
                    ) : (
                      <span className="font-mono text-ndi-teal truncate">{dep.value}</span>
                    )
                  ) : (
                    <span className="text-fg-muted italic">empty</span>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Files */}
      {hasFiles && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-xs font-medium flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Files ({fileInfo.length})
            </CardTitle>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="space-y-1">
              {fileInfo.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs font-mono text-fg-secondary"
                >
                  <File className="h-3 w-3 shrink-0" />
                  <span className="truncate">{f.name}</span>
                  {f.uid && (
                    <span className="text-[10px] text-fg-muted truncate">{f.uid}</span>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <Separator />

      {/* JSON tree */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-xs font-medium">Document Properties</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <div className="font-mono text-xs leading-relaxed overflow-auto max-h-[calc(100vh-220px)] min-h-[240px]">
            <JsonTree data={displayData} />
          </div>
        </CardBody>
      </Card>

      {/* DependencyGraph viz — DEFERRED.
       *
       * The data-browser source mounts a sibling `DependencyGraph` card
       * here that draws the doc's depends_on graph as an SVG with D3-like
       * layout. Porting it requires ~420 LOC of layout code; the inline
       * dependency list above already renders the same data textually,
       * which is sufficient for first ship. The viz lands in a follow-up
       * (Phase 6.5c-2 or as part of a viz pass alongside Phase 6.5b's
       * deferred QuickPlot card).
       */}
    </div>
  );
}

function _normalizeDepends(raw: unknown): Array<{ name: string; value: string }> {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: Array<{ name: string; value: string }> = [];
  for (const d of arr) {
    if (!d || typeof d !== 'object') continue;
    const name = String((d as Record<string, unknown>).name ?? 'depends_on');
    const value = (d as Record<string, unknown>).value;
    if (typeof value === 'string') {
      out.push({ name, value });
    } else if (Array.isArray(value) && value.length === 0) {
      out.push({ name, value: '' });
    }
  }
  return out;
}

function _normalizeFileInfo(raw: unknown): Array<{ name: string; uid: string }> {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: Array<{ name: string; uid: string }> = [];
  for (const f of arr) {
    if (!f || typeof f !== 'object') continue;
    const name = String((f as Record<string, unknown>).name ?? '');
    const locations = (f as Record<string, unknown>).locations;
    let uid = '';
    if (locations && typeof locations === 'object' && !Array.isArray(locations)) {
      uid = String((locations as Record<string, unknown>).uid ?? '');
    }
    out.push({ name: name || 'file', uid });
  }
  return out;
}
