/**
 * Tool handlers for the experimental /ask chat.
 *
 * Each handler:
 *   - Validates input via zod
 *   - Constructs the FastAPI URL from `INTERNAL_API_URL`
 *   - Times out after TOOL_TIMEOUT_MS
 *   - Returns the parsed JSON body OR `{ error: string }` on failure
 *
 * Returning `{ error }` rather than throwing keeps the AI SDK happy —
 * tool execution errors get fed back to Claude as content, and the
 * system prompt instructs the model to handle these gracefully in
 * natural language. The user sees a polite "I couldn't fetch X" rather
 * than a 500.
 *
 * Anonymous-public endpoints only — no cookies, no CSRF, no auth.
 */
import { tool } from 'ai';
import { z } from 'zod';

const TOOL_TIMEOUT_MS = 8_000;

type ToolError = { error: string };
type ToolResult<T> = T | ToolError;

function baseUrl(): string | null {
  const u = process.env.INTERNAL_API_URL;
  return typeof u === 'string' && u.length > 0 ? u : null;
}

async function fetchJson<T>(url: string): Promise<ToolResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      // Anonymous-only — no cookies forwarded.
      cache: 'no-store',
    });
    if (!res.ok) {
      return { error: `Upstream returned ${res.status}` };
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { error: 'Network timeout (8s exceeded)' };
    }
    return { error: 'Network error contacting catalog service' };
  } finally {
    clearTimeout(timer);
  }
}

// ─── list_published_datasets ────────────────────────────────────────

export const listPublishedDatasetsInput = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  query: z.string().min(1).optional(),
});

export async function listPublishedDatasetsHandler(
  input: z.infer<typeof listPublishedDatasetsInput>,
): Promise<ToolResult<{ totalNumber: number; datasets: unknown[] }>> {
  const parsed = listPublishedDatasetsInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const page = parsed.data.page ?? 1;
  const pageSize = Math.min(parsed.data.pageSize ?? 20, 100);
  let url = `${base}/api/datasets/published?page=${page}&pageSize=${pageSize}`;
  if (parsed.data.query) {
    url += `&q=${encodeURIComponent(parsed.data.query)}`;
  }
  return fetchJson(url);
}

// ─── get_dataset ────────────────────────────────────────────────────

export const getDatasetInput = z.object({
  id: z.string().min(1, 'id is required'),
});

export async function getDatasetHandler(
  input: z.infer<typeof getDatasetInput>,
): Promise<ToolResult<unknown>> {
  const parsed = getDatasetInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  return fetchJson(`${base}/api/datasets/${encodeURIComponent(parsed.data.id)}`);
}

// ─── get_dataset_summary ────────────────────────────────────────────

export const getDatasetSummaryInput = getDatasetInput;

export async function getDatasetSummaryHandler(
  input: z.infer<typeof getDatasetSummaryInput>,
): Promise<ToolResult<unknown>> {
  const parsed = getDatasetSummaryInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  return fetchJson(
    `${base}/api/datasets/${encodeURIComponent(parsed.data.id)}/summary`,
  );
}

// ─── get_dataset_class_counts ───────────────────────────────────────

export const getDatasetClassCountsInput = getDatasetInput;

export async function getDatasetClassCountsHandler(
  input: z.infer<typeof getDatasetClassCountsInput>,
): Promise<ToolResult<unknown>> {
  const parsed = getDatasetClassCountsInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  return fetchJson(
    `${base}/api/datasets/${encodeURIComponent(parsed.data.id)}/class-counts`,
  );
}

// ─── get_facets ─────────────────────────────────────────────────────

export const getFacetsInput = z.object({});

export async function getFacetsHandler(
  _input: z.infer<typeof getFacetsInput>,
): Promise<ToolResult<unknown>> {
  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };
  return fetchJson(`${base}/api/facets`);
}

// ─── Tool definitions for the AI SDK ────────────────────────────────

export const tools = {
  list_published_datasets: tool({
    description:
      'List published datasets in the NDI Commons catalog. Use this to ' +
      'answer "how many datasets" (set pageSize=1, read totalNumber) or ' +
      '"what datasets cover X" (set query).',
    inputSchema: listPublishedDatasetsInput,
    execute: listPublishedDatasetsHandler,
  }),
  get_dataset: tool({
    description:
      'Fetch the full record for a single dataset by ID. Includes ' +
      'contributors, DOI, license, and other metadata.',
    inputSchema: getDatasetInput,
    execute: getDatasetHandler,
  }),
  get_dataset_summary: tool({
    description:
      'Fetch a compact summary of a dataset (counts + key metadata). ' +
      'Prefer this over get_dataset when full record is overkill.',
    inputSchema: getDatasetSummaryInput,
    execute: getDatasetSummaryHandler,
  }),
  get_dataset_class_counts: tool({
    description:
      'Fetch per-class document counts for a dataset (e.g., how many ' +
      'epochs, probes, subjects).',
    inputSchema: getDatasetClassCountsInput,
    execute: getDatasetClassCountsHandler,
  }),
  get_facets: tool({
    description:
      'Fetch top-level facet aggregations across the catalog: species, ' +
      'brain regions, strains, etc. Use for "what species/regions are ' +
      'represented?".',
    inputSchema: getFacetsInput,
    execute: getFacetsHandler,
  }),
} as const;
