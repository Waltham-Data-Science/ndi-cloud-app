'use client';

/**
 * Ontology hooks — single-term lookup + batch-prefetch (with cache seeding).
 * Ported from `ndi-data-browser-v2/frontend/src/api/ontology.ts`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { apiFetch } from './client';
import { normalizeOntologyTerm } from '@/lib/ontology/utils';

/** Backend response shape — matches `OntologyTerm.to_dict()` in
 *  `backend/services/ontology_cache.py`. */
export interface OntologyTerm {
  provider: string;
  termId: string;
  label: string | null;
  definition: string | null;
  url: string | null;
}

interface BatchResponse {
  terms: OntologyTerm[];
}

function termCacheKey(term: string): readonly [string, string] {
  return ['ontology', term] as const;
}

export function useOntologyLookup(term: string | undefined) {
  const normalized = term ? normalizeOntologyTerm(term) : null;
  return useQuery({
    queryKey: termCacheKey(normalized ?? ''),
    queryFn: () =>
      apiFetch<OntologyTerm>(
        `/api/ontology/lookup?term=${encodeURIComponent(normalized!)}`,
      ),
    enabled: !!normalized,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Batch-prefetch ontology terms surfaced in a table view and seed the
 * TanStack Query cache with per-term entries so subsequent single-term
 * `useOntologyLookup()` calls (from the popover) hit instantly.
 *
 * Deduplicates and normalizes input before POSTing. Safe to call with an
 * empty list (no-op). Batches up to 200 terms per request (backend cap).
 *
 * CSRF: `apiFetch` auto-fetches and echoes `X-XSRF-TOKEN` for POST.
 */
export function useBatchOntologyLookup(termIds: readonly string[]): void {
  const queryClient = useQueryClient();
  const lastSeen = useRef<string>('');

  const normalized = useMemo(() => {
    const set = new Set<string>();
    for (const t of termIds) {
      const n = normalizeOntologyTerm(t);
      if (n) set.add(n);
    }
    return [...set].sort();
  }, [termIds]);

  const mutation = useMutation({
    mutationFn: async (terms: string[]) => {
      if (terms.length === 0) {
        return { terms: [] } satisfies BatchResponse;
      }
      const CHUNK = 200;
      const all: OntologyTerm[] = [];
      for (let i = 0; i < terms.length; i += CHUNK) {
        const body = { terms: terms.slice(i, i + CHUNK) };
        const r = await apiFetch<BatchResponse>('/api/ontology/batch-lookup', {
          method: 'POST',
          body,
        });
        all.push(...r.terms);
      }
      return { terms: all } satisfies BatchResponse;
    },
    onSuccess: (data, variables) => {
      const seen = new Set<string>();
      for (const t of data.terms) {
        const id = `${t.provider}:${t.termId}`;
        queryClient.setQueryData(termCacheKey(id), t);
        seen.add(id);
      }
      // Any term we asked about but the backend didn't return — seed a
      // null entry so the popover shows "not found" immediately rather
      // than refetching.
      for (const req of variables) {
        if (!seen.has(req)) {
          queryClient.setQueryData(termCacheKey(req), {
            provider: req.split(':')[0] ?? '',
            termId: req.split(':').slice(1).join(':'),
            label: null,
            definition: null,
            url: null,
          } satisfies OntologyTerm);
        }
      }
    },
  });

  useEffect(() => {
    const fingerprint = normalized.join('|');
    if (fingerprint === lastSeen.current) return;
    lastSeen.current = fingerprint;
    if (normalized.length === 0) return;
    const missing = normalized.filter(
      (t) => queryClient.getQueryData(termCacheKey(t)) === undefined,
    );
    if (missing.length === 0) return;
    mutation.mutate(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- React Compiler manages identity for `mutation` and `queryClient`; gating purely on `normalized` matches the data-browser implementation
  }, [normalized]);
}
