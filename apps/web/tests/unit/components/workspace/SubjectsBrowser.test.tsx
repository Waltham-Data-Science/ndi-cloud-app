/**
 * SubjectsBrowser — pure filter algorithm coverage.
 *
 * Phase C of the workspace redesign (2026-05-16). The browser
 * delegates filtering to a pure function (`filterSubjects`) so the
 * substring matching + sex equality + case insensitivity rules can
 * be locked here without React Testing Library setup. The component
 * itself is exercised manually via Vercel preview + Playwright
 * smoke (Phase E).
 */
import { describe, expect, it } from 'vitest';

import { filterSubjects } from '@/components/workspace/SubjectsBrowser';

const SAMPLE = [
  {
    subjectDocumentIdentifier: 's1',
    subjectLocalIdentifier: 'Fig1_Naive_01@babu-lab.iisc.ac.in',
    speciesName: 'Caenorhabditis elegans',
    strainName: 'N2',
    biologicalSexName: 'hermaphrodite',
  },
  {
    subjectDocumentIdentifier: 's2',
    subjectLocalIdentifier: 'Fig1_Trained_02@babu-lab.iisc.ac.in',
    speciesName: 'Caenorhabditis elegans',
    strainName: 'PR811',
    biologicalSexName: 'hermaphrodite',
  },
  {
    subjectDocumentIdentifier: 's3',
    subjectLocalIdentifier: 'NSUBJ-005-PR811',
    speciesName: 'Caenorhabditis elegans',
    strainName: 'PR811',
    biologicalSexName: 'male',
  },
  {
    subjectDocumentIdentifier: 's4',
    subjectLocalIdentifier: 'NSUBJ-006',
    speciesName: 'Rattus norvegicus',
    strainName: 'Sprague-Dawley',
    biologicalSexName: 'female',
  },
];

describe('filterSubjects', () => {
  it('returns every row when all filters are empty', () => {
    expect(
      filterSubjects(SAMPLE, { strain: '', species: '', sex: '' }),
    ).toHaveLength(SAMPLE.length);
  });

  it('filters strain by case-insensitive substring (tutorial pattern)', () => {
    const rows = filterSubjects(SAMPLE, {
      strain: 'pr811',
      species: '',
      sex: '',
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.strainName === 'PR811')).toBe(true);
  });

  it('filters species by substring', () => {
    const rows = filterSubjects(SAMPLE, {
      strain: '',
      species: 'rattus',
      sex: '',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.speciesName).toBe('Rattus norvegicus');
  });

  it('filters sex by exact match', () => {
    const rows = filterSubjects(SAMPLE, {
      strain: '',
      species: '',
      sex: 'female',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subjectDocumentIdentifier).toBe('s4');
  });

  it('combines filters with AND semantics', () => {
    const rows = filterSubjects(SAMPLE, {
      strain: 'PR811',
      species: 'elegans',
      sex: 'hermaphrodite',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subjectDocumentIdentifier).toBe('s2');
  });

  it('returns no rows when no row matches', () => {
    const rows = filterSubjects(SAMPLE, {
      strain: 'nonexistent',
      species: '',
      sex: '',
    });
    expect(rows).toEqual([]);
  });

  it('trims whitespace from text filters', () => {
    const rows = filterSubjects(SAMPLE, {
      strain: '   PR811   ',
      species: '',
      sex: '',
    });
    expect(rows).toHaveLength(2);
  });

  it('handles rows with null/missing fields gracefully', () => {
    const sparseRows = [
      { subjectDocumentIdentifier: 's-sparse' },
      {
        subjectDocumentIdentifier: 's-full',
        strainName: 'N2',
        speciesName: 'C. elegans',
        biologicalSexName: 'hermaphrodite',
      },
    ];
    // A strain filter excludes the sparse row (it has no strain to
    // match), keeps the full row.
    const rows = filterSubjects(sparseRows, {
      strain: 'N2',
      species: '',
      sex: '',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subjectDocumentIdentifier).toBe('s-full');
  });
});
