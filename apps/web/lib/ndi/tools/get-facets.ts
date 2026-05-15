/**
 * `get_facets` — top-level facet aggregations across the catalog.
 *
 * Wraps the FastAPI `GET /api/facets` endpoint. Species, brain regions,
 * strains, etc. — cross-catalog aggregate, not specific to any dataset.
 *
 * Migrated 2026-05-15 (Stream 4.3) out of `apps/web/lib/ai/chat-tools.ts`.
 */
import { z } from 'zod';

import type { Reference } from '../references';
import {
  baseUrl,
  fetchJson,
  isErrorResult,
  logToolInvocation,
  type ToolContext,
  type ToolResult,
} from './shared';

export const getFacetsInput = z.object({});

interface FacetsResponse {
  species?: unknown[];
  brainRegions?: unknown[];
  strains?: unknown[];
}

export async function getFacetsHandler(
  _input: z.infer<typeof getFacetsInput>,
  ctx?: ToolContext,
): Promise<ToolResult<FacetsResponse & { references: Reference[] }>> {
  logToolInvocation('get_facets');
  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const result = await fetchJson<FacetsResponse>(`${base}/api/facets`, ctx);
  if (isErrorResult(result)) return result;

  // Facets aren't a single document — they're a cross-catalog
  // aggregate. The reference points to the data-commons search page,
  // which is the closest "source" the user can click through to.
  const references: Reference[] = [
    {
      doc_id: 'facets',
      url: '/datasets',
      class: 'facets',
      title: 'Catalog facets (species, brain regions, strains, etc.)',
      snippet: 'Cross-catalog aggregation surface',
    },
  ];

  return { ...result, references };
}
