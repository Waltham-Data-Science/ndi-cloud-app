/**
 * `get_dataset_class_counts` — per-class document counts for one dataset.
 *
 * Wraps the FastAPI `GET /api/datasets/:id/class-counts` endpoint.
 * Answers "how many epochs / probes / subjects in dataset X" without
 * needing to walk into individual documents.
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

export const getDatasetClassCountsInput = getDatasetInput;

interface ClassCountsResponse {
  datasetId?: string;
  totalDocuments?: number;
  counts?: Record<string, number>;
}

export async function getDatasetClassCountsHandler(
  input: z.infer<typeof getDatasetClassCountsInput>,
  ctx?: ToolContext,
): Promise<ToolResult<ClassCountsResponse & { references: Reference[] }>> {
  logToolInvocation('get_dataset_class_counts', { id: input?.id });
  const parsed = getDatasetClassCountsInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const datasetId = parsed.data.id;
  const result = await fetchJson<ClassCountsResponse>(
    `${base}/api/datasets/${encodeURIComponent(datasetId)}/class-counts`,
    ctx,
  );
  if (isErrorResult(result)) return result;

  const classNames = Object.keys(result.counts ?? {});
  const references: Reference[] = [
    makeDatasetReference({
      datasetId,
      title: 'Class counts',
      snippet:
        classNames.length > 0
          ? `Counts across ${classNames.length} document classes`
          : 'Class-count summary',
    }),
  ];

  return { ...result, references };
}
