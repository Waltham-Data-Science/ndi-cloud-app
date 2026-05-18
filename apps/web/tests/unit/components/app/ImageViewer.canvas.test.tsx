/**
 * ImageStackCanvasViewer — browser-side canvas decode for raw uint8
 * imageStack frames.
 *
 * The PIL-decode path (`/data/image`) chokes on raw uint8 frame stacks
 * with `BINARY_DECODE_FAILED`. This component receives the bytes from
 * `/data/raw` (companion endpoint, ndi-data-browser-v2 PR #106) plus
 * the partner `imageStack_parameters` doc's layout metadata, and paints
 * frames onto a `<canvas>` via `putImageData`.
 *
 * jsdom doesn't ship a real CanvasRenderingContext2D — it provides a
 * stub that throws on most calls. We don't need to verify the actual
 * pixel painting in this unit test (that's the canvas API's job, and
 * pinning it would require pulling in jsdom-canvas or a similar
 * polyfill). Instead we assert:
 *
 *   1. The canvas mounts when params + buffer arrive.
 *   2. `putImageData` is called with width-and-height arguments matching
 *      the params' `dimension_size[1]` (W) and `dimension_size[0]` (H).
 *   3. Single-frame stacks (Z*T == 1) hide the frame slider; multi-frame
 *      stacks render it.
 *   4. The info bar surfaces channel count + data type.
 *
 * The full DataPanel routing test (canvas vs PIL fallthrough) lives in
 * `DataPanel.test.tsx` — this spec is the leaf component's contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  ImageStackCanvasViewer,
} from '@/components/ndi/media/ImageViewer';
import type { ImageStackParameters } from '@/lib/api/binary';

// Capture every `putImageData` call so we can assert canvas rendering
// happened with the right dimensions. jsdom doesn't paint, but
// installing a stub on `getContext('2d')` is enough to verify the
// component called the right APIs in the right order.
//
// Two pieces are stubbed:
//   - `putImageData` — what the component calls to paint a frame.
//   - `createImageData` — used by the component's `makeImageData`
//     fallback when the `ImageData` global isn't on `globalThis`
//     (jsdom doesn't ship it by default).
function installCanvasMock() {
  const putImageData = vi.fn();
  const createImageData = vi.fn(
    (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
      colorSpace: 'srgb',
    }) as unknown as ImageData,
  );
  const ctx = {
    putImageData,
    createImageData,
  } as unknown as CanvasRenderingContext2D;
  const getContext = vi.fn(() => ctx);
  // Patch the prototype so every <canvas> rendered in the test gets
  // the stub. Restored in afterEach.
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext =
    getContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
  return {
    putImageData,
    createImageData,
    getContext,
    restore: () => {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    },
  };
}

const HEIGHT = 4;
const WIDTH = 4;
const CHANNELS = 3;
// Canonical YXCZT params with all five axes — pinned by parseDimensions
// to `{H, W, C, Z, T}`. The viewer no longer destructures the size
// directly; it parses through `parseDimensions(order, size)`.
const PARAMS_RGB: ImageStackParameters = {
  dimension_size: [HEIGHT, WIDTH, CHANNELS, 1, 1],
  dimension_order: 'YXCZT',
  data_type: 'uint8',
  data_limits: [0, 255],
};

describe('ImageStackCanvasViewer', () => {
  let canvasMock: ReturnType<typeof installCanvasMock>;

  beforeEach(() => {
    canvasMock = installCanvasMock();
  });

  afterEach(() => {
    canvasMock.restore();
    vi.clearAllMocks();
  });

  it('mounts a canvas and calls putImageData with the params dimensions', () => {
    // 4x4x3 = 48 bytes — known pattern: top-left red.
    const buf = new ArrayBuffer(HEIGHT * WIDTH * CHANNELS);
    const u8 = new Uint8Array(buf);
    u8[0] = 255; // R
    u8[1] = 0; // G
    u8[2] = 0; // B

    render(<ImageStackCanvasViewer buffer={buf} params={PARAMS_RGB} />);

    const canvas = screen.getByTestId('imagestack-canvas') as HTMLCanvasElement;
    expect(canvas).toBeInTheDocument();
    // The component sets canvas.width/height from params before paint.
    expect(canvas.width).toBe(WIDTH);
    expect(canvas.height).toBe(HEIGHT);

    // putImageData was called with an ImageData of the right shape.
    expect(canvasMock.putImageData).toHaveBeenCalledTimes(1);
    const call = canvasMock.putImageData.mock.calls[0]!;
    const imageData = call[0] as ImageData;
    expect(imageData.width).toBe(WIDTH);
    expect(imageData.height).toBe(HEIGHT);
    // The component packs 4 bytes per pixel (RGBA).
    expect(imageData.data.length).toBe(WIDTH * HEIGHT * 4);
    // Top-left pixel: R=255, G=0, B=0, A=255 from the input pattern.
    expect(imageData.data[0]).toBe(255);
    expect(imageData.data[1]).toBe(0);
    expect(imageData.data[2]).toBe(0);
    expect(imageData.data[3]).toBe(255);
  });

  it('broadcasts grayscale (C=1) input to RGB on the canvas', () => {
    const grayParams: ImageStackParameters = {
      ...PARAMS_RGB,
      dimension_size: [HEIGHT, WIDTH, 1, 1, 1],
    };
    const buf = new ArrayBuffer(HEIGHT * WIDTH);
    const u8 = new Uint8Array(buf);
    u8[0] = 200; // single grayscale value at top-left

    render(<ImageStackCanvasViewer buffer={buf} params={grayParams} />);

    expect(canvasMock.putImageData).toHaveBeenCalledTimes(1);
    const imageData = canvasMock.putImageData.mock.calls[0]![0] as ImageData;
    // Top-left RGBA: R=G=B=200, A=255 (grayscale broadcast).
    expect(imageData.data[0]).toBe(200);
    expect(imageData.data[1]).toBe(200);
    expect(imageData.data[2]).toBe(200);
    expect(imageData.data[3]).toBe(255);
  });

  it('hides the frame slider when there is only one frame (Z=T=1)', () => {
    const buf = new ArrayBuffer(HEIGHT * WIDTH * CHANNELS);
    render(<ImageStackCanvasViewer buffer={buf} params={PARAMS_RGB} />);
    // The slider is the `<input type="range">`. Single-frame stacks
    // skip the entire frame-stepper row.
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('renders the frame slider when nFrames > 1 (Z=2, T=3 → 6 frames)', () => {
    const multiFrameParams: ImageStackParameters = {
      ...PARAMS_RGB,
      dimension_size: [HEIGHT, WIDTH, CHANNELS, 2, 3],
    };
    const buf = new ArrayBuffer(HEIGHT * WIDTH * CHANNELS * 2 * 3);
    render(
      <ImageStackCanvasViewer buffer={buf} params={multiFrameParams} />,
    );
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider).toBeInTheDocument();
    expect(slider.max).toBe('5'); // 6 frames - 1 = max index 5
    // Frame counter copy ("1 / 6").
    expect(screen.getByText(/1 \/ 6/)).toBeInTheDocument();
  });

  it('shows channel count + data type in the info bar', () => {
    const buf = new ArrayBuffer(HEIGHT * WIDTH * CHANNELS);
    render(<ImageStackCanvasViewer buffer={buf} params={PARAMS_RGB} />);
    expect(screen.getByText(/3ch/)).toBeInTheDocument();
    expect(screen.getByText(/uint8/)).toBeInTheDocument();
    expect(screen.getByText(/4 × 4/)).toBeInTheDocument();
  });

  it('paints a neutral fallback frame when the buffer is shorter than the params claim', () => {
    // Params say 4x4x3 = 48 bytes but the buffer is only 10. The
    // component should still call putImageData (so the canvas isn't a
    // confusing blank rectangle); it falls back to a uniform mid-gray
    // frame as a visible signal that something's off without crashing.
    const buf = new ArrayBuffer(10);
    render(<ImageStackCanvasViewer buffer={buf} params={PARAMS_RGB} />);
    expect(canvasMock.putImageData).toHaveBeenCalledTimes(1);
    const imageData = canvasMock.putImageData.mock.calls[0]![0] as ImageData;
    // Every pixel is mid-gray (128, 128, 128, 255).
    expect(imageData.data[0]).toBe(128);
    expect(imageData.data[1]).toBe(128);
    expect(imageData.data[2]).toBe(128);
    expect(imageData.data[3]).toBe(255);
  });

  // -------------------------------------------------------------------------
  // dim_order-aware decoding (Step 2 of the format-aware viewer rework)
  // -------------------------------------------------------------------------
  //
  // Pre-fix the viewer destructured `[H, W, C, Z, T] = dimension_size`
  // unconditionally — fine for the canonical YXCZT shape, but every
  // production imageStack ships YX or YXT (Haley / Bhar). Pin both
  // shapes so a future destructure regression is caught here.

  it('parses a 2D YX layout (Haley dataset PNG masks) — single grayscale frame, no slider', () => {
    // 256x256 grayscale frame, no time / no z. nFrames === 1 → the
    // frame stepper is hidden.
    const yxParams: ImageStackParameters = {
      dimension_size: [4, 4],
      dimension_order: 'YX',
      data_type: 'uint8',
      data_limits: [0, 255],
    };
    const buf = new ArrayBuffer(4 * 4); // grayscale: 16 bytes
    const u8 = new Uint8Array(buf);
    u8[0] = 200;

    render(<ImageStackCanvasViewer buffer={buf} params={yxParams} />);

    // Single-frame stack — slider is hidden.
    expect(screen.queryByRole('slider')).toBeNull();
    // putImageData fires with the 4x4 RGBA shape; the grayscale value
    // is broadcast across R, G, B.
    expect(canvasMock.putImageData).toHaveBeenCalledTimes(1);
    const imageData = canvasMock.putImageData.mock.calls[0]![0] as ImageData;
    expect(imageData.width).toBe(4);
    expect(imageData.height).toBe(4);
    expect(imageData.data[0]).toBe(200);
    expect(imageData.data[1]).toBe(200);
    expect(imageData.data[2]).toBe(200);
    expect(imageData.data[3]).toBe(255);
  });

  it('parses a 3D YXT layout (Bhar dataset frame stacks) — T frames with slider visible', () => {
    // 4x4 grayscale frames, 6 time steps. The frame stepper renders
    // because nFrames > 1.
    const yxtParams: ImageStackParameters = {
      dimension_size: [4, 4, 6],
      dimension_order: 'YXT',
      data_type: 'uint8',
      data_limits: [0, 255],
    };
    const buf = new ArrayBuffer(4 * 4 * 6);
    render(<ImageStackCanvasViewer buffer={buf} params={yxtParams} />);

    // Slider exposes T-1 as max (zero-indexed frames).
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider).toBeInTheDocument();
    expect(slider.max).toBe('5');
    // Frame counter copy uses the 1-based "1 / 6" form.
    expect(screen.getByText(/1 \/ 6/)).toBeInTheDocument();
    // Channel label collapses to grayscale because YXT has no C axis.
    expect(screen.getByText(/grayscale/i)).toBeInTheDocument();
  });

  it('renders the canvas without crashing when params dont parse (length mismatch)', () => {
    // dimension_size length != dimension_order length — `parseDimensions`
    // returns null. The component should mount the canvas (so the info
    // bar still shows) but not call putImageData.
    const malformedParams: ImageStackParameters = {
      dimension_size: [10, 20], // 2 numbers
      dimension_order: 'YXCZT', // 5 letters
      data_type: 'uint8',
      data_limits: [0, 255],
    };
    const buf = new ArrayBuffer(0);
    render(<ImageStackCanvasViewer buffer={buf} params={malformedParams} />);
    expect(screen.getByTestId('imagestack-canvas')).toBeInTheDocument();
    // No paint when params don't parse — we don't want to render a
    // misleading frame.
    expect(canvasMock.putImageData).not.toHaveBeenCalled();
  });
});
