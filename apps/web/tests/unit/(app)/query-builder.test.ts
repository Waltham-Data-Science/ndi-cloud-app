/**
 * QueryBuilder default-operation regression tripwire.
 *
 * Ported verbatim from `ndi-data-browser-v2/frontend/src/components/query/QueryBuilder.test.tsx`
 * (Phase 6.5e of the cross-repo unification). Single adaptation: import
 * path. Same intent — pin the amendment §4.B3 default against silent
 * inversion to a stricter operator.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_QUERY_OPERATION } from '@/components/app/QueryBuilder';

describe('QueryBuilder default operation', () => {
  it('defaults to contains_string (amendment §4.B3, Report C §7.6)', () => {
    expect(DEFAULT_QUERY_OPERATION).toBe('contains_string');
  });

  it('is NOT a stricter operator that would lose MATLAB-convention matches', () => {
    // Tripwire against silent inversion to exact_string / exact_string_anycase
    // / identical — all of which would narrow results in a way researchers
    // migrating from the MATLAB tutorial wouldn't expect.
    const stricterOperators = [
      'exact_string',
      'exact_string_anycase',
      'identical',
      'equals',
    ];
    expect(stricterOperators).not.toContain(DEFAULT_QUERY_OPERATION);
  });
});
