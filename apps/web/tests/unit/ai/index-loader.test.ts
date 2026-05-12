/**
 * index-loader.ts — verifies cosine math + top-K ranking + graceful
 * behavior with the placeholder index.
 *
 * The real Voyage embeddings are 1024-d L2-normalized vectors. For
 * unit tests we use tiny 3-d vectors with known geometry so the test
 * outputs are easy to reason about.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the JSON import so we control the test fixture.
vi.mock('@/lib/ai/dataset-index.json', () => ({
  default: {
    schemaVersion: 1,
    model: 'voyage-4-large',
    dim: 3,
    createdAt: '2026-05-12T00:00:00Z',
    entries: [
      {
        id: 'd-north',
        name: 'North dataset',
        text: 'About the north',
        metadata: { species: ['mouse'], hasSidecar: true },
        // L2-normalized vector pointing along +x
        embedding: [1, 0, 0],
      },
      {
        id: 'd-east',
        name: 'East dataset',
        text: 'About the east',
        metadata: { species: ['rat'], hasSidecar: false },
        embedding: [0, 1, 0],
      },
      {
        id: 'd-northeast',
        name: 'Northeast dataset',
        text: 'About the northeast',
        metadata: { species: ['mouse', 'rat'], hasSidecar: true },
        // 45° between north and east, normalized
        embedding: [Math.SQRT1_2, Math.SQRT1_2, 0],
      },
    ],
  },
}));

import {
  cosineSimilarity,
  topKByVector,
  isIndexEmpty,
  getIndexInfo,
} from '@/lib/ai/index-loader';

describe('lib/ai/index-loader', () => {
  describe('cosineSimilarity', () => {
    it('returns 1 for identical normalized vectors', () => {
      const v = new Float32Array([1, 0, 0]);
      expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
    });

    it('returns 0 for orthogonal vectors', () => {
      expect(
        cosineSimilarity(new Float32Array([1, 0, 0]), new Float32Array([0, 1, 0])),
      ).toBeCloseTo(0, 6);
    });

    it('returns -1 for opposite vectors', () => {
      expect(
        cosineSimilarity(new Float32Array([1, 0, 0]), new Float32Array([-1, 0, 0])),
      ).toBeCloseTo(-1, 6);
    });

    it('returns ~0.707 for 45° angle', () => {
      expect(
        cosineSimilarity(
          new Float32Array([1, 0, 0]),
          new Float32Array([Math.SQRT1_2, Math.SQRT1_2, 0]),
        ),
      ).toBeCloseTo(Math.SQRT1_2, 5);
    });

    it('throws when vector dimensions mismatch', () => {
      expect(() =>
        cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0, 0])),
      ).toThrow(/dimension/i);
    });
  });

  describe('topKByVector', () => {
    it('returns entries ranked by cosine similarity descending', () => {
      const queryAlongX = new Float32Array([1, 0, 0]);
      const results = topKByVector(queryAlongX, 3);
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('d-north'); // cos=1
      expect(results[1].id).toBe('d-northeast'); // cos~0.707
      expect(results[2].id).toBe('d-east'); // cos=0
    });

    it('honors the limit', () => {
      const queryAlongX = new Float32Array([1, 0, 0]);
      const results = topKByVector(queryAlongX, 2);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('d-north');
      expect(results[1].id).toBe('d-northeast');
    });

    it('attaches a score to each result', () => {
      const queryAlongX = new Float32Array([1, 0, 0]);
      const results = topKByVector(queryAlongX, 1);
      expect(results[0].score).toBeCloseTo(1, 6);
    });

    it('returns the original entry data (id, name, text, metadata)', () => {
      const queryAlongX = new Float32Array([1, 0, 0]);
      const top = topKByVector(queryAlongX, 1)[0];
      expect(top.id).toBe('d-north');
      expect(top.name).toBe('North dataset');
      expect(top.text).toBe('About the north');
      expect(top.metadata).toEqual({ species: ['mouse'], hasSidecar: true });
    });
  });

  describe('isIndexEmpty / getIndexInfo', () => {
    it('reports the fixture as non-empty', () => {
      expect(isIndexEmpty()).toBe(false);
    });

    it('exposes model + dim + entry count', () => {
      const info = getIndexInfo();
      expect(info.model).toBe('voyage-4-large');
      expect(info.dim).toBe(3);
      expect(info.count).toBe(3);
    });
  });
});
