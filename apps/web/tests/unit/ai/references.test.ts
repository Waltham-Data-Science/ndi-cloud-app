/**
 * references.ts — Reference type, URL builders, and footnote parser.
 *
 * The Reference shape is the runtime contract between every tool
 * handler and the chat UI's citation rendering. These tests pin the
 * shape so an accidental refactor doesn't silently break citations.
 */
import { describe, expect, it } from 'vitest';

import {
  datasetOverviewUrl,
  documentExplorerUrl,
  makeDatasetReference,
  makeReference,
  parseFootnotes,
} from '@/lib/ai/references';

describe('documentExplorerUrl', () => {
  it('builds the canonical /datasets/[id]/documents/[docId] path', () => {
    expect(documentExplorerUrl('ds1', 'doc_abc')).toBe(
      '/datasets/ds1/documents/doc_abc',
    );
  });
});

describe('datasetOverviewUrl', () => {
  it('builds the dataset overview path', () => {
    expect(datasetOverviewUrl('ds1')).toBe('/datasets/ds1/overview');
  });
});

describe('makeReference', () => {
  it('fills in `url` from datasetId + doc_id', () => {
    const ref = makeReference({
      datasetId: 'ds1',
      doc_id: 'doc_abc',
      class: 'probe',
      title: 'Probe channel 5',
      snippet: 'patch-Vm @ 10 kHz',
    });
    expect(ref).toEqual({
      doc_id: 'doc_abc',
      url: '/datasets/ds1/documents/doc_abc',
      class: 'probe',
      title: 'Probe channel 5',
      snippet: 'patch-Vm @ 10 kHz',
    });
  });
});

describe('makeDatasetReference', () => {
  it('uses datasetId as doc_id + overview URL + class=dataset', () => {
    const ref = makeDatasetReference({
      datasetId: 'ds1',
      title: 'Example dataset',
      snippet: 'Mouse V1 recordings',
    });
    expect(ref).toEqual({
      doc_id: 'ds1',
      url: '/datasets/ds1/overview',
      class: 'dataset',
      title: 'Example dataset',
      snippet: 'Mouse V1 recordings',
    });
  });
});

describe('parseFootnotes', () => {
  it('parses one footnote definition with class', () => {
    const content = `Some narrative [^1].

### Sources
[^1]: [Spike summary for SD42](/datasets/ds1/documents/abc) — vmspikesummary`;
    const map = parseFootnotes(content);
    expect(map.size).toBe(1);
    expect(map.get(1)).toEqual({
      doc_id: 'abc',
      url: '/datasets/ds1/documents/abc',
      class: 'vmspikesummary',
      title: 'Spike summary for SD42',
      snippet: '',
    });
  });

  it('parses multiple footnote definitions in order', () => {
    const content = `### Sources
[^1]: [First](/datasets/d1/documents/aa) — probe
[^2]: [Second](/datasets/d2/documents/bb) — element
[^3]: [Third](/datasets/d3/overview) — dataset`;
    const map = parseFootnotes(content);
    expect(map.size).toBe(3);
    expect(map.get(2)!.title).toBe('Second');
    // doc_id falls back to the URL when not a /documents/ path.
    expect(map.get(3)!.doc_id).toBe('/datasets/d3/overview');
  });

  it('tolerates a definition without a class (no em-dash suffix)', () => {
    const content = `[^1]: [Title only](/datasets/x/documents/y)`;
    const map = parseFootnotes(content);
    expect(map.get(1)!.class).toBe('reference');
    expect(map.get(1)!.title).toBe('Title only');
  });

  it('skips malformed lines silently', () => {
    const content = `[^1]: not a valid footnote
[^2]: [Valid](/datasets/x/documents/y) — probe`;
    const map = parseFootnotes(content);
    expect(map.size).toBe(1);
    expect(map.get(2)).toBeTruthy();
  });

  it('returns empty map when content has no footnotes', () => {
    expect(parseFootnotes('plain text without footnotes').size).toBe(0);
  });
});
