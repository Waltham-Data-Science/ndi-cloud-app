/**
 * `get_dataset_summary` — compact summary of a dataset (counts +
 * key metadata).
 *
 * Wraps the FastAPI `GET /api/datasets/:id/summary` endpoint. Cheaper
 * than `get_dataset` and usually sufficient for orientation questions.
 *
 * Migrated 2026-05-15 (Stream 4.3) out of `apps/web/lib/ai/chat-tools.ts`.
 */
import { z } from 'zod';

import { makeDatasetReference, type Reference } from '../references';
import { getDatasetInput } from './get-dataset';
import {
  baseUrl,
  fetchJson,
  isErrorResult,
  logToolInvocation,
  type ToolContext,
  type ToolResult,
} from './shared';

export const getDatasetSummaryInput = getDatasetInput;

interface DatasetSummary {
  id?: string;
  _id?: string;
  name?: string;
  totalDocuments?: number;
}

export async function getDatasetSummaryHandler(
  input: z.infer<typeof getDatasetSummaryInput>,
  ctx?: ToolContext,
): Promise<ToolResult<DatasetSummary & { references: Reference[] }>> {
  logToolInvocation('get_dataset_summary', { id: input?.id });
  const parsed = getDatasetSummaryInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const datasetId = parsed.data.id;
  const result = await fetchJson<DatasetSummary>(
    `${base}/api/datasets/${encodeURIComponent(datasetId)}/summary`,
    ctx,
  );
  if (isErrorResult(result)) return result;

  const references: Reference[] = [
    makeDatasetReference({
      datasetId,
      title: result.name ?? '(unnamed dataset)',
      snippet:
        typeof result.totalDocuments === 'number'
          ? `Compact summary — ${result.totalDocuments} documents`
          : 'Compact dataset summary',
    }),
  ];

  return { ...result, references };
}
