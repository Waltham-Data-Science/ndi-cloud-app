'use client';

import { useState } from 'react';
import { Download, FileWarning } from 'lucide-react';

interface ImageStackVideoViewerProps {
  /** Dataset id; used to build the `/data/raw` URL. */
  datasetId: string;
  /** Document id; used to build the `/data/raw` URL. */
  documentId: string;
}

/**
 * Native `<video>` viewer for imageStacks whose `formatOntology` flags
 * them as a video container (NCIT:C190180 — MP4 / H.264). Bhar dataset
 * `69bc5ca1...` ships ~564 docs in this shape.
 *
 * **Backend coupling**: streams against `/api/datasets/{id}/documents/{id}/data/raw`,
 * the same endpoint the canvas decoder uses. A companion PR on
 * `ndi-data-browser-v2` adds Range support + `Content-Type: video/mp4`
 * sniffing to that handler so the browser can seek smoothly. **We
 * intentionally don't gate the render on those headers being present**:
 * if the backend hasn't deployed yet, the browser may show a download
 * prompt instead of an inline player — graceful degradation, no
 * regression vs. today's "preview not supported" behavior.
 *
 * **Error fallback**: if the `<video>` element fires `onError` (e.g.,
 * the browser refuses to play the codec, or the network fails) we
 * swap to a "Download video file" anchor so the user can still get
 * the bytes via a normal browser download.
 */
export function ImageStackVideoViewer({
  datasetId,
  documentId,
}: ImageStackVideoViewerProps) {
  const [errored, setErrored] = useState(false);
  // Stream the raw octet-stream bytes from the same endpoint the
  // canvas decoder uses. The companion backend PR will tag responses
  // with `Content-Type: video/mp4` + `Accept-Ranges: bytes`; without
  // that, browsers may degrade to download but the URL is still
  // valid.
  const src = `/api/datasets/${datasetId}/documents/${documentId}/data/raw`;

  if (errored) {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2.5 rounded-md border border-border-subtle bg-bg-muted/60 px-3 py-2.5 text-xs text-fg-secondary">
          <FileWarning className="h-3.5 w-3.5 mt-0.5 shrink-0 text-fg-muted" aria-hidden />
          <div>Inline playback wasn&rsquo;t supported by your browser.</div>
        </div>
        <a
          href={src}
          download
          className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-secondary hover:text-fg-primary underline underline-offset-2"
        >
          <Download className="h-3.5 w-3.5" />
          Download video file
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 bg-black overflow-hidden">
      <video
        // The `<video>` element will fire `onError` if the browser
        // can't decode the bytes (codec mismatch, transport failure,
        // missing Content-Type). We swap to the download fallback in
        // that branch — same shape as the existing image-error UX in
        // VideoPlayer, just without the v1 backend `data.error` field.
        src={src}
        controls
        preload="metadata"
        className="w-full max-h-[calc(100vh-200px)]"
        onError={() => setErrored(true)}
        data-testid="imagestack-video"
      >
        Your browser does not support video playback.
      </video>
    </div>
  );
}
