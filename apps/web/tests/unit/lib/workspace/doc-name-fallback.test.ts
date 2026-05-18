import { describe, expect, it } from 'vitest';

import { resolveDocName } from '@/lib/workspace/doc-name-fallback';

describe('resolveDocName', () => {
  describe('step 1: canonical name', () => {
    it('returns the doc.name when present', () => {
      expect(resolveDocName({ name: 'my doc' })).toBe('my doc');
    });

    it('trims whitespace', () => {
      expect(resolveDocName({ name: '  spaced  ' })).toBe('spaced');
    });

    it('empty string falls through', () => {
      expect(
        resolveDocName({ name: '', className: 'subject', id: 'abcdef1234567890abcdef12' }),
      ).toBe('subject · abcdef12…ef12');
    });

    it('whitespace-only falls through', () => {
      expect(
        resolveDocName({ name: '   ', className: 'subject', id: 'abcdef1234567890abcdef12' }),
      ).toBe('subject · abcdef12…ef12');
    });

    it('non-string name falls through', () => {
      expect(
        resolveDocName({
          name: 42 as unknown as string,
          className: 'subject',
          id: 'abcdef1234567890abcdef12',
        }),
      ).toBe('subject · abcdef12…ef12');
    });
  });

  describe('step 2: data.base.name fallback', () => {
    it('returns base.name when top-level name is empty', () => {
      expect(
        resolveDocName({
          name: '',
          data: { base: { name: 'from base' } },
        }),
      ).toBe('from base');
    });

    it('skips when base.name is also empty', () => {
      expect(
        resolveDocName({
          name: '',
          data: { base: { name: '' } },
          className: 'subject',
          id: 'abcdef1234567890abcdef12',
        }),
      ).toBe('subject · abcdef12…ef12');
    });
  });

  describe('step 3: class-specific synthesis', () => {
    it('daqreader: picks first signal file from data.files.file_list', () => {
      expect(
        resolveDocName({
          name: '',
          className: 'daqreader_mfdaq_epochdata_ingested',
          data: {
            files: {
              file_list: ['channel_list.bin', 'ai_group1_seg.nbf_1', 'ai_group2_seg.nbf_1'],
            },
          },
        }),
      ).toBe('ai_group1_seg.nbf_1');
    });

    it('daqreader: any daqreader_ prefix triggers the rule', () => {
      expect(
        resolveDocName({
          name: '',
          className: 'daqreader_spikegadgets_ingested',
          data: { files: { file_list: ['data.nbf_1'] } },
        }),
      ).toBe('data.nbf_1');
    });

    it('daqreader: skips meta.json metadata', () => {
      expect(
        resolveDocName({
          name: '',
          className: 'daqreader_mfdaq_epochdata_ingested',
          data: { files: { file_list: ['meta.json', 'trace.nbf_1'] } },
        }),
      ).toBe('trace.nbf_1');
    });

    it('daqreader: missing file_list falls through to class+id', () => {
      expect(
        resolveDocName({
          name: '',
          className: 'daqreader_mfdaq_epochdata_ingested',
          id: 'abcdef1234567890abcdef12',
          data: { files: {} },
        }),
      ).toBe('daqreader_mfdaq_epochdata_ingested · abcdef12…ef12');
    });

    it('ontologyTableRow: combines ontology + first variable name', () => {
      expect(
        resolveDocName({
          name: '',
          className: 'ontologyTableRow',
          data: {
            ontologyTableRow: {
              ontologyName: 'UBERON',
              variableNames: ['anatomicalLocation', 'cellType'],
            },
          },
        }),
      ).toBe('UBERON: anatomicalLocation');
    });

    it('ontologyTableRow: ontology alone when variables absent', () => {
      expect(
        resolveDocName({
          name: '',
          className: 'ontologyTableRow',
          data: { ontologyTableRow: { ontologyName: 'CL' } },
        }),
      ).toBe('CL');
    });

    it('imageStack falls through to class+id (no inference rule)', () => {
      expect(
        resolveDocName({
          name: '',
          className: 'imageStack',
          id: 'abcdef1234567890abcdef12',
          data: {},
        }),
      ).toBe('imageStack · abcdef12…ef12');
    });
  });

  describe('step 4: class+id last-ditch', () => {
    it('formats long ids with first 8 + last 4', () => {
      expect(
        resolveDocName({
          className: 'subject',
          id: 'abcdef1234567890abcdef12',
        }),
      ).toBe('subject · abcdef12…ef12');
    });

    it('uses ndiId when id is missing', () => {
      expect(
        resolveDocName({
          className: 'session',
          ndiId: '41269431a5b8c44c_40b328d54848906b',
        }),
      ).toBe('session · 41269431…906b');
    });

    it('returns short ids verbatim (no abbreviation)', () => {
      expect(resolveDocName({ className: 'subject', id: 'short12' })).toBe(
        'subject · short12',
      );
    });

    it('class alone when no id', () => {
      expect(resolveDocName({ className: 'session' })).toBe('session');
    });

    it('id alone when no class', () => {
      expect(resolveDocName({ id: 'abcdef1234567890abcdef12' })).toBe(
        'abcdef12…ef12',
      );
    });

    it('"(no name)" when nothing at all', () => {
      expect(resolveDocName({})).toBe('(no name)');
    });
  });

  describe('robustness', () => {
    it('does not throw on null/undefined fields', () => {
      expect(() =>
        resolveDocName({
          name: null as unknown as string,
          className: undefined,
          data: null,
        }),
      ).not.toThrow();
    });

    it('reads className from data.document_class.class_name (bulk-fetch shape)', () => {
      expect(
        resolveDocName({
          name: '',
          data: { document_class: { class_name: 'imageStack' } },
          id: 'abcdef1234567890abcdef12',
        }),
      ).toBe('imageStack · abcdef12…ef12');
    });

    it('reads ndi_id (snake_case) as a fallback', () => {
      expect(
        resolveDocName({
          className: 'session',
          ndi_id: '41269431a5b8c44c_40b328d54848906b',
        }),
      ).toBe('session · 41269431…906b');
    });
  });

  describe('canonical real-world cases', () => {
    it('Francesconi daqreader doc (the live demo case)', () => {
      expect(
        resolveDocName({
          name: '',
          className: 'daqreader_mfdaq_epochdata_ingested',
          id: '68d6e54703a03f5cfdac8ef7',
          data: {
            files: {
              file_list: [
                'ai_group10_seg.nbf_#',
                'ai_group1_seg.nbf_#',
                'ai_group2_seg.nbf_#',
              ],
            },
          },
        }),
      ).toBe('ai_group10_seg.nbf_#');
    });

    it('subject doc with proper name stays unchanged', () => {
      expect(
        resolveDocName({
          name: 'FigS6C_Imazapyr_16@babu-lab.iisc.ac.in',
          className: 'subject',
          id: 'abc',
        }),
      ).toBe('FigS6C_Imazapyr_16@babu-lab.iisc.ac.in');
    });
  });
});
