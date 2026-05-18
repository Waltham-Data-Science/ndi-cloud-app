/**
 * Document ID validation accepts EITHER form NDI uses on the wire:
 *
 *   - 24-char Mongo `_id` hex
 *   - NDI ndiId `<16 hex>_<16 hex>`
 *
 * The backend's `_validators.py::DocumentId` regex matches the same
 * pair, so the client-side check should mirror that.
 */
import { describe, it, expect } from 'vitest';

import {
  isValidDocId,
  getDocIdErrorMessage,
} from '@/lib/workspace/doc-id-validation';

describe('isValidDocId', () => {
  it('accepts a 24-char lowercase hex Mongo id', () => {
    expect(isValidDocId('68d6e54703a03f5cfdac8ef7')).toBe(true);
  });

  it('accepts a 24-char uppercase hex Mongo id', () => {
    expect(isValidDocId('68D6E54703A03F5CFDAC8EF7')).toBe(true);
  });

  it('accepts a 24-char mixed-case hex Mongo id', () => {
    expect(isValidDocId('68d6E54703a03F5CFdac8eF7')).toBe(true);
  });

  it('accepts a 16+16 hex NDI ndiId (lowercase)', () => {
    expect(isValidDocId('4126945b004f4f5a_c0ccb3a4ec7146d6')).toBe(true);
  });

  it('accepts a 16+16 hex NDI ndiId (uppercase)', () => {
    expect(isValidDocId('4126945B004F4F5A_C0CCB3A4EC7146D6')).toBe(true);
  });

  it('accepts a realistic Bhar NDI id', () => {
    expect(isValidDocId('412695ff43107ae3_c0a769ef358dea62')).toBe(true);
  });

  it('accepts a realistic Francesconi NDI id', () => {
    expect(isValidDocId('4126945b004f4f5a_c0ccb3a4ec7146d6')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidDocId('')).toBe(false);
  });

  it('rejects 23 chars (one short of Mongo)', () => {
    expect(isValidDocId('68d6e54703a03f5cfdac8ef')).toBe(false);
  });

  it('rejects 25 chars (one over Mongo)', () => {
    expect(isValidDocId('68d6e54703a03f5cfdac8ef70')).toBe(false);
  });

  it('rejects 24 chars but non-hex', () => {
    expect(isValidDocId('zzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false);
    expect(isValidDocId('68d6e54703a03f5cfdac8efg')).toBe(false);
  });

  it('rejects NDI-shape without the underscore', () => {
    // 16 hex + 16 hex with no separator (32 chars, no `_`)
    expect(isValidDocId('4126945b004f4f5ac0ccb3a4ec7146d6')).toBe(false);
  });

  it('rejects NDI-shape with wrong-side lengths', () => {
    // 15+16 with underscore
    expect(isValidDocId('4126945b004f4f5_c0ccb3a4ec7146d6')).toBe(false);
    // 16+15 with underscore
    expect(isValidDocId('4126945b004f4f5a_c0ccb3a4ec7146d')).toBe(false);
    // 17+16
    expect(isValidDocId('4126945b004f4f5ab_c0ccb3a4ec7146d6')).toBe(false);
  });

  it('rejects NDI-shape with non-hex chars', () => {
    expect(isValidDocId('4126945b004f4f5a_c0ccb3a4ec7146dz')).toBe(false);
    expect(isValidDocId('zzzzzzzzzzzzzzzz_zzzzzzzzzzzzzzzz')).toBe(false);
  });

  it('rejects garbage strings', () => {
    expect(isValidDocId('not-an-id')).toBe(false);
    expect(isValidDocId('hello world')).toBe(false);
    expect(isValidDocId('123')).toBe(false);
  });
});

describe('getDocIdErrorMessage', () => {
  it('returns "required" for empty string', () => {
    expect(getDocIdErrorMessage('')).toBe('Document ID is required');
  });

  it('returns null for a valid Mongo id', () => {
    expect(getDocIdErrorMessage('68d6e54703a03f5cfdac8ef7')).toBeNull();
  });

  it('returns null for a valid NDI ndiId', () => {
    expect(
      getDocIdErrorMessage('4126945b004f4f5a_c0ccb3a4ec7146d6')
    ).toBeNull();
  });

  it('returns the mismatch message for non-matching shape', () => {
    expect(getDocIdErrorMessage('not-an-id')).toBe(
      'Document ID must be a 24-char hex Mongo id OR a 16+16 hex NDI id'
    );
  });

  it('returns the mismatch message for 23-char hex', () => {
    expect(getDocIdErrorMessage('68d6e54703a03f5cfdac8ef')).toBe(
      'Document ID must be a 24-char hex Mongo id OR a 16+16 hex NDI id'
    );
  });

  it('returns the mismatch message for NDI shape without underscore', () => {
    expect(
      getDocIdErrorMessage('4126945b004f4f5ac0ccb3a4ec7146d6')
    ).toBe('Document ID must be a 24-char hex Mongo id OR a 16+16 hex NDI id');
  });
});
