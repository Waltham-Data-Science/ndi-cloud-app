'use client';

/**
 * VideoPlaybackPanel — workspace panel for playing back MP4 / WebM
 * video stored as NDI binary documents (imageStack-class docs whose
 * `formatOntology` flags them as a video container, NCIT:C190180).
 *
 * Unlocks the video-clip-alongside-tabular-analysis workflow flagged in
 * the 2026-05-19 session handoff: Bhar's behavioral video clips (B10)
 * and Haley's experimental video stacks (H12) live as imageStacks in
 * the same dataset as the tabular tuning analyses, but until this
 * panel they were only viewable by drilling out to the legacy
 * dataset-detail surface.
 *
 * Architecture:
 *
 *   1. Reuses `ImageStackVideoViewer` from `components/app/` — the
 *      same component the dataset-detail surface uses. That viewer
 *      already handles native `<video>` controls, codec-error
 *      fallback (download anchor), and Range-supporting streaming
 *      against `/api/datasets/{id}/documents/{id}/data/raw`.
 *
 *   2. Resolves the doc up-front via `useDocument` so we can
 *      detect "this isn't an imageStack video" BEFORE handing it to
 *      the `<video>` element. Without this check, a user pasting a
 *      non-imageStack doc id would see the browser's "no source"
 *      error rather than a friendly "this doc doesn't carry
 *      playable video" message.
 *
 *   3. Form follows the SignalViewerPanel pattern: auto-fill from
 *      `selection.session`, freeform manual override under a
 *      collapsed `<details>` block, hex-24 doc id sanity check.
 *
 *      The natural picker dimension for video is `session` because
 *      the Bhar tutorial selects an `element_epoch` (session) and
 *      its imageStack video child is what drives the playback. We
 *      don't try to walk the depends_on graph here — the picker
 *      tutorials surface the video doc id directly via the
 *      Documents picker tab, and the freeform fallback handles
 *      everything else.
 *
 *   4. Auto-runs after a ~400ms debounce when the docId is auto-filled
 *      and well-formed. Manual edits flip the auto-fill flag and
 *      suppress further auto-runs so the user's typed value is
 *      preserved.
 *
 * Backend coupling: NO backend changes needed. The Railway backend
 * already serves `Content-Type: video/mp4` + `Accept-Ranges: bytes`
 * from `/data/raw` for imageStack video docs (companion PR shipped
 * before the 2026-05-19 handoff). Graceful degradation if those
 * headers are absent — the underlying viewer's onError fallback
 * swaps to a download anchor.
 */
import { Video } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { ImageStackVideoViewer } from '@/components/app/ImageStackVideoViewer';
import { Field } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDocument } from '@/lib/api/documents';
import { isVideoFormat } from '@/lib/imageStack/format';
import { usePanelChangeIndicator } from '@/lib/workspace/use-panel-change-indicator';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

import { PanelCard } from './PanelCard';
import { PanelEmptyState } from './canvas/PanelEmptyState';
import { ShowCodeButton } from './ShowCodeButton';

interface VideoPlaybackPanelProps {
  datasetId: string;
}

const HEX_24 = /^[0-9a-fA-F]{24}$/;

interface PlaybackPayload {
  datasetId: string;
  docId: string;
}

export function VideoPlaybackPanel({ datasetId }: VideoPlaybackPanelProps) {
  const { selection } = useWorkspaceSelection();
  // H7 pulse: session is the most likely auto-fill source for a video
  // doc (behavioral recordings are anchored to a session epoch).
  const pulse = usePanelChangeIndicator([selection.session]);

  // Seed from the session selection. Same write-only-on-arrival
  // contract as SignalViewerPanel — never blank the field on
  // selection.session going null, so a user's typed value survives
  // selection clears elsewhere on the canvas.
  const [docId, setDocId] = useState<string>(selection.session ?? '');
  const [error, setError] = useState<string | null>(null);

  const [isAutoFilled, setIsAutoFilled] = useState<boolean>(
    selection.session !== null,
  );

  // The currently-rendered playback payload. Decoupled from form state
  // so partial typing doesn't trigger fetches on every keystroke.
  const [payload, setPayload] = useState<PlaybackPayload | null>(null);

  // Selection-arrival bridge → local form state. Same pattern as
  // SignalViewer; suppressing the lint rule here is documented as the
  // canonical pattern for selection-bar → form bridging.
  /* eslint-disable react-hooks/set-state-in-effect -- selection-bar bridge to local form state */
  useEffect(() => {
    if (selection.session) {
      setDocId(selection.session);
      setIsAutoFilled(true);
    }
  }, [selection.session]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-run debouncer. Mirrors SignalViewer's 400ms window.
  const lastAutoRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAutoFilled) return;
    const id = docId.trim();
    if (!HEX_24.test(id)) return;
    if (lastAutoRunRef.current === id) return;
    const handle = setTimeout(() => {
      lastAutoRunRef.current = id;
      setError(null);
      setPayload({ datasetId, docId: id });
    }, 400);
    return () => clearTimeout(handle);
  }, [isAutoFilled, docId, datasetId]);

  function handleRun(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const id = docId.trim();
    if (!id) {
      setError('Document ID is required. Pick a session in the rail or paste a 24-char hex ID.');
      return;
    }
    if (!HEX_24.test(id)) {
      setError('Document ID must be a 24-char hex string.');
      return;
    }
    lastAutoRunRef.current = id;
    setPayload({ datasetId, docId: id });
  }

  function onDocIdChange(value: string) {
    setDocId(value);
    if (isAutoFilled && value !== selection.session) {
      setIsAutoFilled(false);
    }
  }

  // Doc-shape probe. Only fires once `payload` is staged (i.e. user
  // clicked Run or auto-fill debounced through). The query keys off
  // datasetId+docId, so re-runs against different ids spin a fresh
  // fetch but re-runs against the same id are cache-hits.
  const docQuery = useDocument(
    payload?.datasetId,
    payload?.docId,
  );

  const docData = docQuery.data?.data as
    | { imageStack?: { formatOntology?: string } }
    | undefined;
  const formatOntology = docData?.imageStack?.formatOntology;
  const isImageStack = docQuery.data?.className === 'imageStack';
  const isVideoDoc = isImageStack && isVideoFormat(formatOntology);

  const docIdTrimmed = docId.trim();
  const showEmptyState =
    !payload && !error && docIdTrimmed.length === 0;

  return (
    <PanelCard
      icon={Video}
      title="Video playback"
      subtitle="Play MP4 / WebM video clips stored as NDI imageStack documents (behavioral recordings, microscopy video, etc.)."
      headingId="panel-video-playback"
      id="video-playback"
      pulse={pulse}
      footer={
        <>
          <MarketingButton
            type="submit"
            variant="cta"
            size="sm"
            onClick={handleRun}
          >
            Run
          </MarketingButton>
          <ShowCodeButton
            toolName="get_document"
            args={payload ?? { datasetId }}
            disabled={payload === null}
          />
        </>
      }
    >
      {isAutoFilled && docId && (
        <span
          className="inline-block text-[10.5px] tracking-eyebrow uppercase text-brand-blue/80 font-bold"
          data-testid="video-playback-auto-hint"
        >
          Auto from selection
        </span>
      )}

      <form onSubmit={handleRun} noValidate className="space-y-3">
        <details className="rounded-md border border-border-subtle bg-bg-canvas px-3 py-2">
          <summary className="cursor-pointer text-[12.5px] font-medium text-fg-secondary">
            Advanced — manual override
          </summary>
          <div className="mt-3">
            <Field
              label="Document ID"
              name="docId"
              value={docId}
              onChange={(e) => onDocIdChange(e.target.value)}
              placeholder="e.g. 68d6e54703a03f5cfdac8eff"
              hint="A 24-char hex NDI document ID for an imageStack-class document whose formatOntology flags it as video (NCIT:C190180)."
              required
            />
          </div>
        </details>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
        >
          {error}
        </div>
      )}

      {showEmptyState && (
        <PanelEmptyState
          illustration="scatter"
          title="Pick a video document to play"
          hint={
            <>
              Pick a session in the left rail or paste an imageStack
              document ID below. Video imageStacks are flagged with
              format ontology <code className="font-mono text-[11.5px]">NCIT:C190180</code> (MP4 / H.264).
            </>
          }
          testId="video-playback-empty"
        />
      )}

      {payload && docQuery.isLoading && (
        <div data-testid="video-playback-loading">
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {payload && docQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
        >
          Couldn&rsquo;t load that document. Check the ID and try again.
        </div>
      )}

      {/* Render the viewer iff the doc is confirmed to be an imageStack
          video container. Anything else — wrong class, wrong format
          ontology, missing ontology — falls through to the unsupported
          message. Routing on `formatOntology` rather than letting the
          `<video>` element fail mid-load keeps the error message
          precise. */}
      {payload && !docQuery.isLoading && !docQuery.isError && docQuery.data && (
        isVideoDoc ? (
          <div data-testid="video-playback-result">
            <ImageStackVideoViewer
              key={payload.docId}
              datasetId={payload.datasetId}
              documentId={payload.docId}
            />
          </div>
        ) : (
          <div
            role="status"
            className="rounded-md border border-border-subtle bg-bg-canvas p-4 text-[13px] text-fg-secondary"
            data-testid="video-playback-unsupported"
          >
            <p className="font-medium text-fg-primary">
              This document does not contain playable video.
            </p>
            <p className="mt-1.5">
              Video playback requires an <code className="font-mono text-[12px]">imageStack</code>{' '}
              document whose <code className="font-mono text-[12px]">formatOntology</code> is{' '}
              <code className="font-mono text-[12px]">NCIT:C190180</code> (MP4 / H.264).{' '}
              {docQuery.data.className ? (
                <>
                  Found class <code className="font-mono text-[12px]">{docQuery.data.className}</code>
                  {formatOntology ? (
                    <>
                      {' '}with format <code className="font-mono text-[12px]">{formatOntology}</code>
                    </>
                  ) : null}
                  .
                </>
              ) : null}
            </p>
          </div>
        )
      )}
    </PanelCard>
  );
}
