/**
 * `ImageStackVideoViewer` — native `<video>` viewer for imageStacks
 * whose `formatOntology` flags them as MP4 (NCIT:C190180). Streams
 * directly against `/api/datasets/{id}/documents/{id}/data/raw`.
 *
 * The companion `ndi-data-browser-v2` PR adds Range support +
 * `Content-Type: video/mp4` to that handler. Without those, browsers
 * may degrade to a download prompt — graceful failure mode pinned
 * implicitly here (we don't mock the browser's video machinery; we
 * assert what we render).
 */
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ImageStackVideoViewer } from '@/components/app/ImageStackVideoViewer';

describe('ImageStackVideoViewer', () => {
  it('renders a <video controls> pointing at the /data/raw endpoint', () => {
    render(<ImageStackVideoViewer datasetId="d1" documentId="doc-1" />);
    const video = screen.getByTestId('imagestack-video') as HTMLVideoElement;
    expect(video).toBeInTheDocument();
    expect(video.tagName).toBe('VIDEO');
    // The src points at the /data/raw endpoint shared with the canvas
    // decode path — same backend route, different content negotiation.
    expect(video.getAttribute('src')).toBe(
      '/api/datasets/d1/documents/doc-1/data/raw',
    );
    // Must be controllable by the user — no autoplay / muted gimmicks.
    expect(video.hasAttribute('controls')).toBe(true);
  });

  it('falls back to a download link when the <video> element fires onError', () => {
    render(<ImageStackVideoViewer datasetId="d1" documentId="doc-1" />);
    const video = screen.getByTestId('imagestack-video') as HTMLVideoElement;
    // Simulate the browser failing to decode the bytes (codec
    // mismatch, transport, missing Content-Type). The component
    // should swap the player for an explicit download anchor.
    fireEvent.error(video);

    expect(screen.queryByTestId('imagestack-video')).toBeNull();
    const link = screen.getByRole('link', { name: /download video file/i });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe(
      '/api/datasets/d1/documents/doc-1/data/raw',
    );
    // The browser-native `download` attribute hints at "save" rather
    // than "navigate to a binary URL" behavior.
    expect(link.hasAttribute('download')).toBe(true);
  });

  it('builds the URL with the provided dataset / document ids verbatim', () => {
    // Callers occasionally pass URL-unsafe ids; we don't currently
    // encode them (matches every other call site in DataPanel that
    // builds these URLs as template strings) — pin that today so a
    // future encoder change is a deliberate decision.
    render(
      <ImageStackVideoViewer datasetId="dataset-with-dashes" documentId="doc.with.dots" />,
    );
    const video = screen.getByTestId('imagestack-video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe(
      '/api/datasets/dataset-with-dashes/documents/doc.with.dots/data/raw',
    );
  });
});
