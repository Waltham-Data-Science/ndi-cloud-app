'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

import type {
  ImageData as NdiImageData,
  ImageStackParameters,
} from '@/lib/api/binary';
import { Button } from '@/components/ui/Button';

interface ImageViewerProps {
  data: NdiImageData;
  /** Called when the user picks a different frame on a multi-frame image
   * stack. The caller is responsible for re-fetching the image for that
   * frame if needed. */
  onFrameChange?: (frame: number) => void;
}

/** Scientific image viewer with frame stepper + zoom — ported from v1.
 * Zoom is CSS-only so browsers can handle the full-fidelity image bytes
 * without re-downloading. Frame stepper fires onFrameChange so the parent
 * can drive the backend with `?frame=N` once supported. */
export function ImageViewer({ data, onFrameChange }: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [currentFrame, setCurrentFrame] = useState(0);

  if (data.error) {
    const lower = String(data.error).toLowerCase();
    const friendly =
      lower.includes('no download') || lower.includes('download')
        ? 'Image preview is not available for this document. The data file may not be accessible from the cloud.'
        : lower.includes('no file uid') || lower.includes('no file')
          ? 'This document does not have an associated image file.'
          : String(data.error);
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        {friendly}
      </div>
    );
  }

  if (!data.dataUri) {
    return (
      <div className="text-sm text-gray-500 p-3">
        No image data available
      </div>
    );
  }

  const nFrames = data.nFrames ?? 1;
  const isStack = nFrames > 1;

  const handleFrameChange = (f: number) => {
    const clamped = Math.max(0, Math.min(nFrames - 1, f));
    setCurrentFrame(clamped);
    onFrameChange?.(clamped);
  };

  return (
    <div className="space-y-3">
      {/* Info bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-xs text-gray-500 font-mono">
          <span>
            {data.width} × {data.height}
          </span>
          {data.mode && <span>{data.mode}</span>}
          {isStack && <span>{nFrames} frames</span>}
          {data.format && <span>{data.format}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-gray-500 font-mono w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 overflow-auto max-h-[calc(100vh-200px)] min-h-[320px] flex items-center justify-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URI from backend, CSS-only zoom requires raw <img>, see source v2 ImageViewer.tsx */}
        <img
          src={data.dataUri}
          alt="NDI image data"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          className="transition-transform"
        />
      </div>

      {isStack && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => handleFrameChange(currentFrame - 1)}
            disabled={currentFrame === 0}
            aria-label="Previous frame"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <input
            type="range"
            min={0}
            max={nFrames - 1}
            value={currentFrame}
            onChange={(e) => handleFrameChange(Number(e.target.value))}
            className="flex-1"
            aria-label={`Frame ${currentFrame + 1} of ${nFrames}`}
          />
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => handleFrameChange(currentFrame + 1)}
            disabled={currentFrame === nFrames - 1}
            aria-label="Next frame"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-gray-500 font-mono w-20 text-center">
            {currentFrame + 1} / {nFrames}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Browser-side canvas decode for raw uint8 imageStacks
// ---------------------------------------------------------------------------
//
// The PIL-decode path on the backend (`/data/image`) chokes on the raw
// uint8 frame stacks NDI ships for some imageStacks, surfacing
// `BINARY_DECODE_FAILED`. The canvas-decode path bypasses PIL entirely:
//
//   1. `useRawImageData` fetches the raw bytes from `/data/raw` (companion
//      backend endpoint shipped in `ndi-data-browser-v2` PR #106).
//   2. `useImageStackParameters` resolves the partner doc that carries
//      `dimension_size` / `dimension_order` / `data_type`.
//   3. This component renders a `<canvas>` and paints the selected frame
//      via `putImageData`.
//
// Only `data_type === 'uint8'` is supported in v1. uint16 / float32 / logical
// 1-bit need window/level sliders for proper display range mapping; that's
// a separate v2 follow-up. For everything else the caller should fall
// through to the existing PIL path or render the friendly "preview not
// supported" branch.

interface ImageStackCanvasViewerProps {
  /** Raw octet-stream bytes from `/data/raw`. */
  buffer: ArrayBuffer;
  /** Partner-doc-derived metadata describing the byte layout. */
  params: ImageStackParameters;
}

/**
 * Canvas-backed viewer for raw uint8 imageStack frames.
 *
 * Frame layout follows the NDI schema's `YXCZT` default — pixel bytes
 * appear `[y0,x0,c0..cN, y0,x1,c0..cN, ..., yN,xN,c0..cN]` for one
 * frame, with `Z*T` frames concatenated end-to-end. This matches the
 * task spec's documented interleave; non-`YXCZT` orderings are deferred
 * (the v2 follow-up will add a switch).
 *
 * Multi-frame navigation is a flat (Z*T) index for v1. Splitting into
 * separate Z and T sliders is a UX follow-up — the underlying byte math
 * stays the same.
 */
export function ImageStackCanvasViewer({
  buffer,
  params,
}: ImageStackCanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [currentFrame, setCurrentFrame] = useState(0);

  const [H, W, C, Z, T] = params.dimension_size;
  // Treat zero/missing Z and T as 1 — single-volume / single-time stacks
  // are common and a 0 here would multiply nFrames to 0, blocking the
  // initial paint.
  const nFrames = Math.max(1, Z) * Math.max(1, T);
  const isStack = nFrames > 1;

  // Channel handling: 1 → grayscale broadcast to RGB, 3 → interleaved
  // RGB on the C-major axis. Channel counts > 3 (e.g., 4-channel
  // RGBA-with-alpha or hyperspectral) collapse to the first 3 channels;
  // a more thoughtful handling lands with the v2 window/level sliders.
  const channels = Math.max(1, C);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = W;
    canvas.height = H;

    // Use a constructed ImageData when the global is available
    // (browsers); fall back to canvas API's `createImageData` so the
    // component works in jsdom test environments where the `ImageData`
    // global isn't installed by default. Both yield the same shape.
    const makeImageData = (
      pixels: Uint8ClampedArray<ArrayBuffer>,
      width: number,
      height: number,
    ): ImageData => {
      if (typeof ImageData !== 'undefined') {
        return new ImageData(pixels, width, height);
      }
      const empty = ctx.createImageData(width, height);
      empty.data.set(pixels);
      return empty;
    };

    const bytesPerFrame = H * W * channels;
    const totalBytes = nFrames * bytesPerFrame;
    if (buffer.byteLength < totalBytes) {
      // The buffer is shorter than the parameters say it should be —
      // either the doc was truncated or the parameters are wrong. Paint
      // a neutral gray frame so the canvas renders something visible
      // (versus a white/empty canvas that looks like a render bug).
      const rgba = new Uint8ClampedArray(W * H * 4);
      for (let i = 0; i < W * H; i++) {
        rgba[i * 4] = 128;
        rgba[i * 4 + 1] = 128;
        rgba[i * 4 + 2] = 128;
        rgba[i * 4 + 3] = 255;
      }
      ctx.putImageData(makeImageData(rgba, W, H), 0, 0);
      return;
    }

    const offset = currentFrame * bytesPerFrame;
    const frame = new Uint8Array(buffer, offset, bytesPerFrame);
    const rgba = new Uint8ClampedArray(H * W * 4);

    if (channels === 1) {
      // Grayscale — broadcast intensity to RGB.
      for (let i = 0; i < H * W; i++) {
        const v = frame[i] ?? 0;
        rgba[i * 4] = v;
        rgba[i * 4 + 1] = v;
        rgba[i * 4 + 2] = v;
        rgba[i * 4 + 3] = 255;
      }
    } else {
      // Interleaved RGB on C-major axis (YXCZT default). Stride is
      // `channels` bytes per pixel; we read the first three channels
      // and discard any extras.
      for (let i = 0; i < H * W; i++) {
        const base = i * channels;
        rgba[i * 4] = frame[base] ?? 0;
        rgba[i * 4 + 1] = frame[base + 1] ?? 0;
        rgba[i * 4 + 2] = frame[base + 2] ?? 0;
        rgba[i * 4 + 3] = 255;
      }
    }

    ctx.putImageData(makeImageData(rgba, W, H), 0, 0);
  }, [buffer, currentFrame, H, W, channels, nFrames]);

  const handleFrameChange = (f: number) => {
    const clamped = Math.max(0, Math.min(nFrames - 1, f));
    setCurrentFrame(clamped);
  };

  const channelLabel = channels === 1 ? 'grayscale' : `${channels}ch`;

  return (
    <div className="space-y-3">
      {/* Info bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-xs text-gray-500 font-mono">
          <span>
            {W} × {H}
          </span>
          <span>{channelLabel}</span>
          <span>{params.data_type}</span>
          {isStack && <span>{nFrames} frames</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-gray-500 font-mono w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 overflow-auto max-h-[calc(100vh-200px)] min-h-[320px] flex items-center justify-center p-2">
        <canvas
          ref={canvasRef}
          data-testid="imagestack-canvas"
          aria-label="NDI imageStack frame"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center',
            // Pixel-art style for low-res scientific frames — preserves
            // intensity boundaries instead of bilinear-blurring them on
            // upscale (the user's "zoom in" intent is "see the pixels").
            imageRendering: 'pixelated',
          }}
          className="transition-transform"
        />
      </div>

      {isStack && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => handleFrameChange(currentFrame - 1)}
            disabled={currentFrame === 0}
            aria-label="Previous frame"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <input
            type="range"
            min={0}
            max={nFrames - 1}
            value={currentFrame}
            onChange={(e) => handleFrameChange(Number(e.target.value))}
            className="flex-1"
            aria-label={`Frame ${currentFrame + 1} of ${nFrames}`}
          />
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => handleFrameChange(currentFrame + 1)}
            disabled={currentFrame === nFrames - 1}
            aria-label="Next frame"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-gray-500 font-mono w-20 text-center">
            {currentFrame + 1} / {nFrames}
          </span>
        </div>
      )}
    </div>
  );
}
