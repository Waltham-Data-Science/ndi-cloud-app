'use client';

/**
 * CiteModal — Plan B B4 "Cite" affordance.
 *
 * Renders BibTeX / RIS / plain-text citation blocks with per-block
 * copy + (for the structured formats) download buttons. Both DOIs
 * (dataset and paper) are presented as parallel, valid citation
 * targets — one cites the data, the other cites the paper.
 *
 * Round-5 review (2026-04-29) team feedback: the original
 * "preferred / secondary" framing was confusing. Both citations are
 * valid; they just serve different purposes. New copy makes that
 * explicit per DOI block ("Cite when specifically referencing the
 * dataset" / "...the paper") and drops the preferred/secondary
 * language entirely. Endnote-style importers also benefit from
 * direct `.bib` / `.ris` downloads, which this modal now provides
 * alongside Copy.
 *
 * The year field is labelled "Upload year" — the
 * :ts:`DatasetSummaryCitation.year` field is record-creation year, not
 * paper publication year (see the FROZEN shape docstring).
 *
 * This modal reads from ``citation`` only. It does not touch the
 * broader :class:`DatasetSummary` — all cite-format code works off the
 * citation sub-shape alone.
 */
import { useMemo } from 'react';

import { ExternalAnchor } from '@/components/ui/ExternalAnchor';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from '@/components/ui/CopyButton';
import { DownloadFileButton } from '@/components/ui/DownloadFileButton';
import { Modal } from '@/components/ui/Modal';
import {
  stripDoiPrefix,
  toBibtex,
  toPlainText,
  toRis,
} from '@/lib/citation-formats';
import type { DatasetSummaryCitation } from '@/lib/types/dataset-summary';

export interface CiteModalProps {
  open: boolean;
  onClose: () => void;
  citation: DatasetSummaryCitation;
}

export function CiteModal({ open, onClose, citation }: CiteModalProps) {
  const bibtex = useMemo(() => toBibtex(citation), [citation]);
  const ris = useMemo(() => toRis(citation), [citation]);
  const plain = useMemo(() => toPlainText(citation), [citation]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cite this dataset"
      description="Ready-to-paste citations in three formats."
      size="lg"
    >
      <div className="space-y-5" data-testid="cite-modal-body">
        <DoiBlock citation={citation} />

        <CiteBlock
          label="Plain text"
          value={plain}
          testId="cite-plain"
        />
        <CiteBlock
          label="BibTeX"
          value={bibtex}
          testId="cite-bibtex"
          monospace
          downloadFilename={downloadFilename(citation, 'bib')}
          downloadMime="application/x-bibtex"
        />
        <CiteBlock
          label="RIS"
          value={ris}
          testId="cite-ris"
          monospace
          downloadFilename={downloadFilename(citation, 'ris')}
          downloadMime="application/x-research-info-systems"
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// DoiBlock — the visual primary/secondary distinction required by §4.B4.
// ---------------------------------------------------------------------------

function DoiBlock({ citation }: { citation: DatasetSummaryCitation }) {
  const hasDatasetDoi = !!citation.datasetDoi;
  const hasPaperDois = citation.paperDois.length > 0;

  if (!hasDatasetDoi && !hasPaperDois) {
    return (
      <p
        className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200"
        data-testid="cite-no-doi"
      >
        No DOI on record for this dataset yet. Quote the title and NDI Cloud
        URL until the dataset DOI is minted.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="cite-doi-block">
      {hasDatasetDoi && (
        <div
          className="rounded-md border border-brand-300 bg-brand-50 p-3"
          data-testid="cite-dataset-doi"
        >
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="default">Dataset DOI</Badge>
            <span className="text-[11px] text-gray-500">
              Cite when specifically referencing the dataset.
            </span>
          </div>
          <ExternalAnchor
            href={citation.datasetDoi!}
            label={stripDoiPrefix(citation.datasetDoi!)}
            className="font-mono text-xs"
          />
        </div>
      )}
      {hasPaperDois && (
        <div
          className="rounded-md border border-gray-200 bg-gray-50 p-3"
          data-testid="cite-paper-dois"
        >
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="outline">Paper DOI</Badge>
            <span className="text-[11px] text-gray-500">
              Cite when specifically referencing the paper.
            </span>
          </div>
          <ul className="space-y-0.5">
            {citation.paperDois.map((doi) => (
              <li key={doi}>
                <ExternalAnchor
                  href={doi}
                  label={stripDoiPrefix(doi)}
                  className="font-mono text-xs"
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {citation.year != null && (
        <p
          className="text-[11px] text-gray-500"
          data-testid="cite-upload-year-note"
        >
          Upload year: <span className="font-mono">{citation.year}</span>. This
          is the record-creation year in NDI Cloud, not the paper publication
          year — resolve paper DOIs externally for the publication year.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CiteBlock — generic labelled block with copy button.
// ---------------------------------------------------------------------------

function CiteBlock({
  label,
  value,
  testId,
  monospace = false,
  downloadFilename,
  downloadMime,
}: {
  label: string;
  value: string;
  testId: string;
  monospace?: boolean;
  /** When present, render a Download button alongside Copy that saves
   * the citation body as a file with this filename (e.g. `ndi-cloud-d1.bib`).
   * Used for BibTeX (.bib) and RIS (.ris) so Endnote-style importers can
   * ingest the file directly instead of round-tripping through clipboard. */
  downloadFilename?: string;
  downloadMime?: string;
}) {
  return (
    <section className="space-y-1.5" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          {label}
        </h3>
        <div className="flex items-center gap-2">
          {downloadFilename && downloadMime && (
            <DownloadFileButton
              value={value}
              filename={downloadFilename}
              mime={downloadMime}
              ariaLabel={`Download ${label} citation`}
              testId={`${testId}-download`}
            />
          )}
          <CopyButton
            value={value}
            ariaLabel={`Copy ${label} citation`}
            testId={`${testId}-copy`}
          />
        </div>
      </div>
      <pre
        className={
          monospace
            ? 'whitespace-pre-wrap break-words rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] text-gray-800'
            : 'whitespace-pre-wrap break-words rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800'
        }
        data-testid={`${testId}-content`}
      >
        {value}
      </pre>
    </section>
  );
}

// ---------------------------------------------------------------------------
// downloadFilename — build a download filename keyed off the dataset DOI
// (or a short fallback) so the saved file is self-describing.
// ---------------------------------------------------------------------------

/**
 * Build a download filename for the BibTeX/RIS citation export.
 *
 * Preferred shape: `ndi-cloud-<doi-suffix>.<ext>` so users can drop the
 * file straight into Endnote / Mendeley / Zotero with no rename needed
 * (the filename hints at the source). Falls back to `ndi-cloud-citation.<ext>`
 * when the dataset has no DOI yet.
 *
 * The DOI suffix is the part after the `10.63884/` prefix (or any
 * prefix — the helper just splits on the last `/`); non-filename-safe
 * characters are scrubbed to `-` so Windows + macOS Finder both accept
 * the name.
 */
function downloadFilename(
  citation: DatasetSummaryCitation,
  ext: 'bib' | 'ris',
): string {
  const datasetDoi = citation.datasetDoi;
  if (!datasetDoi) return `ndi-cloud-citation.${ext}`;
  const suffix = stripDoiPrefix(datasetDoi).split('/').pop() ?? 'citation';
  const safe = suffix.replace(/[^a-zA-Z0-9.\-_]+/g, '-');
  return `ndi-cloud-${safe}.${ext}`;
}
