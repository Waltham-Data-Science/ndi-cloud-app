/**
 * Format-aware routing for the imageStack viewer.
 *
 * This is a tiny module — three predicates over the `formatOntology`
 * code — but its correctness is load-bearing: the routing decision
 * here is what stops PR #135's canvas decoder from happily painting
 * MP4 container bytes onto a `<canvas>` and producing visible
 * garbage.
 */
import { describe, expect, it } from 'vitest';

import {
  isPngFormat,
  isRawBytesFormat,
  isVideoFormat,
} from '@/lib/imageStack/format';

describe('isVideoFormat', () => {
  it('returns true for NCIT:C190180 (MP4 / H.264 — Bhar dataset)', () => {
    expect(isVideoFormat('NCIT:C190180')).toBe(true);
  });

  it('returns false for image-family ontologies', () => {
    expect(isVideoFormat('NCIT:C70631')).toBe(false); // generic image
    expect(isVideoFormat('NCIT:C85437')).toBe(false); // image mask
  });

  it('returns false for unknown ontology codes', () => {
    expect(isVideoFormat('NCIT:C99999')).toBe(false);
    expect(isVideoFormat('not-an-ontology')).toBe(false);
  });

  it('returns false when formatOntology is undefined or empty', () => {
    expect(isVideoFormat(undefined)).toBe(false);
    expect(isVideoFormat('')).toBe(false);
  });
});

describe('isPngFormat', () => {
  it('returns true for NCIT:C70631 (generic image — Haley dataset)', () => {
    expect(isPngFormat('NCIT:C70631')).toBe(true);
  });

  it('returns true for NCIT:C85437 (image mask — Haley dataset)', () => {
    expect(isPngFormat('NCIT:C85437')).toBe(true);
  });

  it('returns false for video ontology', () => {
    expect(isPngFormat('NCIT:C190180')).toBe(false);
  });

  it('returns false for unknown ontology codes', () => {
    expect(isPngFormat('NCIT:C99999')).toBe(false);
    expect(isPngFormat('image/png')).toBe(false); // wrong scheme
  });

  it('returns false when formatOntology is undefined or empty', () => {
    expect(isPngFormat(undefined)).toBe(false);
    expect(isPngFormat('')).toBe(false);
  });
});

describe('isRawBytesFormat', () => {
  // The empty allowlist is the safety guard that keeps the canvas
  // decoder from running on container bytes. Pin it.

  it('returns false for NCIT:C190180 (MP4) — would otherwise paint container bytes', () => {
    expect(isRawBytesFormat('NCIT:C190180')).toBe(false);
  });

  it('returns false for known image ontologies', () => {
    expect(isRawBytesFormat('NCIT:C70631')).toBe(false);
    expect(isRawBytesFormat('NCIT:C85437')).toBe(false);
  });

  it('returns false for any unknown ontology code (default-deny)', () => {
    expect(isRawBytesFormat('NCIT:C12345')).toBe(false);
    expect(isRawBytesFormat('whatever')).toBe(false);
  });

  it('returns false when formatOntology is undefined or empty', () => {
    expect(isRawBytesFormat(undefined)).toBe(false);
    expect(isRawBytesFormat('')).toBe(false);
  });
});
