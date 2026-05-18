/**
 * `get_dataset` — fetch the full record for one dataset by ID.
 *
 * Wraps the FastAPI `GET /api/datasets/:id` endpoint. Anonymous by
 * default; auth-aware via the optional ToolContext.
 *
 * Migrated 2026-05-15 (Stream 4.3) out of `apps/web/lib/ai/chat-tools.ts`.
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

export const getDatasetInput = z.object({
  id: z.string().min(1, 'id is required'),
});

interface DatasetRecord {
  id?: string;
  _id?: string;
  name?: string;
  description?: string;
}

export async function getDatasetHandler(
  input: z.infer<typeof getDatasetInput>,
  ctx?: ToolContext,
): Promise<ToolResult<DatasetRecord & { references: Reference[] }>> {
  logToolInvocation('get_dataset', { id: input?.id });
  const parsed = getDatasetInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const result = await fetchJson<DatasetRecord>(
    `${base}/api/datasets/${encodeURIComponent(parsed.data.id)}`,
    ctx,
  );
  if (isErrorResult(result)) return result;

  const id = result.id ?? result._id ?? parsed.data.id;
  const references: Reference[] = [
    makeDatasetReference({
      datasetId: id,
      title: result.name ?? '(unnamed dataset)',
      snippet:
        (result.description ?? '').slice(0, 120) || 'Full dataset record',
    }),
  ];

  return { ...result, references };
}
