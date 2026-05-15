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
  let url = `${base}/api/datasets/published?page=${page}&pageSize=${pageSize}`;
  if (parsed.data.query) {
    url += `&q=${encodeURIComponent(parsed.data.query)}`;
  }
  const result = await fetchJson<DatasetListResponse>(url, ctx);
  if (isErrorResult(result)) return result;

  // One reference per dataset in the response — citation chip links to
  // the dataset's overview page in the Document Explorer.
  const references: Reference[] = (result.datasets ?? [])
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

  return { ...result, references };
}
