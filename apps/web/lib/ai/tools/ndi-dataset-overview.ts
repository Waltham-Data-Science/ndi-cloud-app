/**
 * `ndi_dataset_overview` — SDK-level dataset summary computed by the
 * NDI-python ``ndi.dataset.Dataset`` binding.
 *
 * What it returns (and why it can't come from ``ndi_query``):
 *   - ``element_count``: number of element documents in the dataset
 *   - ``subject_count``: number of distinct subjects
 *   - ``epoch_count``: TOTAL epochs across all elements — this is a
 *     traversal-derived number; ``ndi_query`` would only return raw
 *     ``element_epoch`` docs and the LLM would have to count manually
 *   - ``elements``: up to 50 ``{name, type}`` pairs for orientation
 *
 * The endpoint is a thin wrapper around
 * :class:`backend.services.DatasetBindingService` which lazily
 * downloads + caches the dataset's Mongo docs locally via
 * :func:`ndi.cloud.orchestration.downloadDataset`. First call for an
 * un-warmed dataset is slow (~10-30s) — the chat's pre-warm cron
 * keeps the 3 demo datasets ready, but a CALL from the LLM on a
 * cold dataset will still wait.
 *
 * GRACEFUL DEGRADATION (critical): when the backend's binding is
 * unavailable (NDI-python not installed in the Railway image, cloud
 * unreachable, etc.) the backend returns 503. We translate that to a
 * STRUCTURED hint the LLM can act on rather than a hard failure — the
 * chat falls back to ``ndi_query`` automatically.
 *
 * No chart fence. The overview is text-only. The LLM is expected to
 * weave the numbers into its prose and cite the dataset reference.
 */
import { z } from 'zod';

import { makeDatasetReference, type Reference } from '../references';
import { baseUrl, type ToolError, type ToolResult } from './shared';

// Cold loads on the backend can take up to ~30s for the demo
// datasets; 45s gives margin while still capping the chat's
// perceived "thinking" time. If the backend's 60s router timeout is
// reached, we'd already abort here at 45s and surface the error
// hint.
const TOOL_TIMEOUT_MS = 45_000;

export const ndiDatasetOverviewInput = z.object({
  /**
   * Dataset ID (24-char hex Mongo ObjectId for production datasets).
   * Accepts the same id strings ``ndi_query`` uses in its CSV scope —
   * pass exactly what you'd cite in the answer.
   */
  datasetId: z.string().min(1, 'datasetId is required'),
});

export type NdiDatasetOverviewInput = z.infer<typeof ndiDatasetOverviewInput>;

interface BackendElement {
  name: string;
  type: string;
}

interface BackendOverview {
  element_count: number;
  subject_count: number;
  epoch_count: number;
  elements: BackendElement[];
  elements_truncated: boolean;
  reference: string;
  cache_hit: boolean;
  cache_age_seconds: number;
}

/**
 * LLM-facing return shape. Keeps the keys flat + descriptive so the
 * model can pick them up without re-parsing.
 */
export interface NdiDatasetOverviewResult {
  element_count: number;
  subject_count: number;
  epoch_count: number;
  elements: BackendElement[];
  elements_truncated: boolean;
  /** True when this call hit a warm cache (no download). */
  cache_hit: boolean;
  /** Seconds since the dataset's most-recent cold download. */
  cache_age_seconds: number;
  references: Reference[];
}

export async function ndiDatasetOverviewHandler(
  input: NdiDatasetOverviewInput,
): Promise<ToolResult<NdiDatasetOverviewResult>> {
  const parsed = ndiDatasetOverviewInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }
  const { datasetId } = parsed.data;

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const url = `${base}/api/datasets/${encodeURIComponent(datasetId)}/ndi_overview`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return {
        error: (
          `Dataset binding cold-load exceeded ${TOOL_TIMEOUT_MS / 1000}s. ` +
          'The dataset may be unusually large or the binding is warming. ' +
          'Try ndi_query for the underlying documents instead.'
        ),
      };
    }
    return {
      error: `Network error contacting dataset-binding service: ${errMsg(e)}`,
    };
  } finally {
    clearTimeout(timer);
  }

  // 503 = backend says "binding unavailable / NDI-python missing / cloud
  // unreachable". We translate to a structured hint so the LLM falls
  // back to ndi_query cleanly. Treating 503 as a hard error would
  // surface a generic failure in the chat — bad UX.
  if (res.status === 503) {
    let reason = 'binding unavailable';
    try {
      const body = (await res.json()) as { reason?: unknown };
      if (typeof body.reason === 'string' && body.reason.length > 0) {
        reason = body.reason;
      }
    } catch {
      // Body wasn't JSON; keep the default reason.
    }
    return {
      error: (
        `Dataset binding unavailable (${reason}). ` +
        'Use ndi_query instead to retrieve raw documents from this dataset.'
      ),
    };
  }

  if (!res.ok) {
    return { error: `Upstream returned ${res.status}` };
  }

  let body: BackendOverview;
  try {
    body = (await res.json()) as BackendOverview;
  } catch (e) {
    return { error: `Failed to parse overview response: ${errMsg(e)}` };
  }

  // Defensive coercion — backend SHOULD send these exact types, but
  // we don't want a malformed payload to crash the renderer.
  const element_count = numOr0(body.element_count);
  const subject_count = numOr0(body.subject_count);
  const epoch_count = numOr0(body.epoch_count);
  const elements = Array.isArray(body.elements)
    ? body.elements.filter(
        (e): e is BackendElement =>
          !!e && typeof e.name === 'string' && typeof e.type === 'string',
      )
    : [];

  const refSnippet =
    `${element_count} element${element_count === 1 ? '' : 's'}, ` +
    `${subject_count} subject${subject_count === 1 ? '' : 's'}, ` +
    `${epoch_count} epoch${epoch_count === 1 ? '' : 's'}`;
  const references: Reference[] = [
    makeDatasetReference({
      datasetId,
      title: body.reference || `Dataset ${datasetId.slice(0, 8)}…`,
      snippet: refSnippet,
    }),
  ];

  return {
    element_count,
    subject_count,
    epoch_count,
    elements,
    elements_truncated: Boolean(body.elements_truncated),
    cache_hit: Boolean(body.cache_hit),
    cache_age_seconds: numOr0(body.cache_age_seconds),
    references,
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function numOr0(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Re-export the error type for the registry's typings.
export type { ToolError };
