/**
 * Format-aware routing for the DataPanel imageStack pipeline.
 *
 * Production data ships imageStacks with one of three semantic shapes:
 *
 *   1. **Video container** (Bhar dataset, ~564 docs) —
 *      `formatOntology: NCIT:C190180` (MP4 / H.264). Bytes on disk are
 *      a video file; rendering means handing the file to a `<video>`
 *      element, NOT decoding pixels client-side. The previous canvas
 *      decode would happily call `putImageData` on container bytes,
 *      producing garbage.
 *
 *   2. **Image file** (Haley dataset, ~7000 docs) —
 *      `formatOntology: NCIT:C70631` (image, generic) or
 *      `NCIT:C85437` (image mask). Bytes are PNG / TIFF / similar.
 *      PIL on the backend handles these and returns a JPEG-encoded
 *      `data:` URI we paint via `<img>`.
 *
 *   3. **Raw uint8 byte stack** (none in production today) — the
 *      pathway PR #135 introduced for hypothetical raw-bytes
 *      datasets. `parseDimensions` + `<canvas>` + `putImageData`.
 *      Preserved here as a future codepath but disabled by default
 *      via an empty allowlist on `isRawBytesFormat`.
 *
 * We default to "PIL fallback" for any unknown formatOntology — that
 * preserves existing behavior for the long tail of unobserved values.
 *
 * Codes are NCIt (NCI Thesaurus) URIs in production; we match on the
 * trailing local-id form (e.g., `NCIT:C190180`) since that's what the
 * ontology field carries today.
 */

const NCIT_VIDEO_MP4 = 'NCIT:C190180';
const NCIT_IMAGE_GENERIC = 'NCIT:C70631';
const NCIT_IMAGE_MASK = 'NCIT:C85437';

/**
 * Returns true when the imageStack's `formatOntology` indicates a
 * video container (MP4 / H.264). The DataPanel routes these to
 * `<video controls>` against `/data/raw`.
 *
 * Bhar dataset (`69bc5ca1...`, 564 imageStacks) is the canonical
 * producer in production today.
 */
export function isVideoFormat(formatOntology?: string): boolean {
  if (!formatOntology) return false;
  return formatOntology === NCIT_VIDEO_MP4;
}

/**
 * Returns true when `formatOntology` indicates a PNG-family file
 * (or other PIL-decodable image: PNG, TIFF, JPEG, etc.).
 *
 * The DataPanel routes these to the existing `/data/image` PIL
 * pipeline. Haley dataset (`682e7772...`, 7007 imageStacks, mixed
 * uint8/uint16/logical) is the canonical producer in production.
 *
 * Mask images (`NCIT:C85437`) sit alongside generic image
 * (`NCIT:C70631`) in the Haley catalog and follow the same PIL
 * codepath; both flag here as PNG-family.
 */
export function isPngFormat(formatOntology?: string): boolean {
  if (!formatOntology) return false;
  return (
    formatOntology === NCIT_IMAGE_GENERIC ||
    formatOntology === NCIT_IMAGE_MASK
  );
}

/**
 * Returns true when `formatOntology` indicates a raw byte stack
 * suitable for client-side canvas decode (no container, no compression
 * — the bytes ARE the pixels).
 *
 * **Empty allowlist by default**: no production dataset today ships
 * a `formatOntology` that maps to "raw bytes" semantically. The
 * canvas pipeline (`useRawImageData` + `<canvas>` + `putImageData`)
 * is preserved as the codepath to flip on when such a dataset lands
 * — at that point we add the matching ontology code to this
 * function's check.
 *
 * **Why default false matters**: PR #135 wired the canvas decode
 * conditioned only on `data_type === 'uint8'`. Bhar's MP4 docs
 * report `data_type: 'uint8'` (because the underlying decoded video
 * IS 8-bit), so under the inline-first parameter resolution we'd
 * paint container MP4 bytes onto the canvas if we didn't gate
 * explicitly on the format ontology. This function is that gate.
 */
export function isRawBytesFormat(_formatOntology?: string): boolean {
  // Intentional empty allowlist. See module docstring for rationale.
  // When a raw-bytes dataset ships, add the ontology code here:
  //   return formatOntology === 'NCIT:C12345' /* raw 8-bit stack */;
  return false;
}
