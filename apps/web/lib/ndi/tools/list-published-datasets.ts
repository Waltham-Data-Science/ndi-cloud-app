/**
 * `list_published_datasets` — paginated catalog list.
 *
 * Wraps the FastAPI `GET /api/datasets/published` endpoint. Anonymous
 * by default; auth-aware via the optional ToolContext so workspace
 * callers can list private-org datasets the same way.
 *
 * Returns dataset summaries + one citation per dataset. The LLM is
 * instructed (via system-prompt) to cite each named dataset with the
 * `references` it gets back here.
 *
 * Migrated 2026-05-15 (Stream 4.3) out of `apps/web/lib/ai/chat-tools.ts`
 * inline form. The inline form duplicated `fetchJson` + lacked ctx
 * forwarding; this consolidated form uses the shared helpers + accepts
 * the optional context like every other handler in this directory.
 */
import { z } from 'zod';

import { makeDatasetReference, type Reference } from '../references';
import {
  baseUrl,
  fetchJson,
  isErrorResult,
  logToolInvocation,
  type ToolContext,
  type ToolResult,
} from './shared';

export const listPublishedDatasetsInput = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  query: z.string().min(1).optional(),
});

interface DatasetListResponse {
  totalNumber: number;
  datasets: Array<{
    id?: string;
    _id?: string;
    name?: string;
    description?: string;
  }>;
}

export async function listPublishedDatasetsHandler(
  input: z.infer<typeof listPublishedDatasetsInput>,
  ctx?: ToolContext,
): Promise<
  ToolResult<DatasetListResponse & { references: Reference[] }>
> {
  logToolInvocation('list_published_datasets', {
    page: input?.page,
    pageSize: input?.pageSize,
    hasQuery: typeof input?.query === 'string' && input.query.length > 0,
  });
  const parsed = listPublishedDatasetsInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const page = parsed.data.page ?? 1;
  const pageSize = Math.min(parsed.data.pageSize ?? 20, 100);
  const query = parsed.data.query?.toLowerCase().trim();

  // The Railway backend (and the upstream Cloud at /datasets/published)
  // accept ONLY `page` + `pageSize` — no `q=` text-search param. Audit
  // 2026-05-18 finding B5 caught us appending a spurious `&q=` that the
  // backend silently dropped, leading the LLM to confidently summarize
  // an unfiltered first-20 page as if its keyword search had worked.
  //
  // When the caller supplies a `query`, we fetch a larger pool (the
  // public catalog is small — ~30 datasets) and do a case-insensitive
  // substring match on the dataset name + description here. For fuzzy
  // / topical queries the LLM should route to `semantic_search_datasets`
  // — the system prompt's tool-selection guide already says so.
  const backendPageSize = query ? 100 : pageSize;
  const backendPage = query ? 1 : page;
  const url = `${base}/api/datasets/published?page=${backendPage}&pageSize=${backendPageSize}`;
  const result = await fetchJson<DatasetListResponse>(url, ctx);
  if (isErrorResult(result)) return result;

  let datasets = result.datasets ?? [];
  let totalNumber = typeof result.totalNumber === 'number'
    ? result.totalNumber
    : datasets.length;
  if (query) {
    const matched = datasets.filter((d) => {
      const haystack = `${d.name ?? ''} ${d.description ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
    totalNumber = matched.length;
    const start = (page - 1) * pageSize;
    datasets = matched.slice(start, start + pageSize);
  }

  // One reference per dataset in the response — citation chip links to
  // the dataset's overview page in the Document Explorer.
  const references: Reference[] = datasets
    .map((d) => {
      const id = d.id ?? d._id;
      if (typeof id !== 'string' || !id) return null;
      return makeDatasetReference({
        datasetId: id,
        title: d.name ?? '(unnamed dataset)',
        snippet:
          (d.description ?? '').slice(0, 120) ||
          'NDI Commons published dataset',
      });
    })
    .filter((r): r is Reference => r !== null);

  return { totalNumber, datasets, references };
}
