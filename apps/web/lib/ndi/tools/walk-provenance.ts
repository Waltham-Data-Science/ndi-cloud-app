/**
 * `walk_provenance` — traverse the NDI `depends_on` graph from a given
 * document to surface its full derivation chain (upstream) or its
 * children (downstream).
 *
 * This is the tool that lets the chat answer "how was THIS computed?"
 * with a real walk of the document graph — e.g. a tuning_curve_calc
 * → stimulus_response → element_epoch → element → probe → subject.
 *
 * Calls the existing FastAPI route:
 *
 *   GET /api/datasets/:id/documents/:docId/dependencies?depth=N
 *
 * which returns:
 *
 *   {
 *     target_id, target_ndi_id,
 *     nodes: [{ id, ndiId, name, className, isTarget }, ...],
 *     edges: [{ source, target, label, direction }, ...],
 *     node_count, edge_count, truncated, max_depth
 *   }
 *
 * The `docId` URL parameter accepts both MongoDB ObjectIds and NDI
 * IDs — important because tool callers (Claude) sometimes get one
 * form, sometimes the other. Edges reference nodes by `ndiId` (the
 * `412...` form), so the response itself is self-consistent.
 *
 * # Citations
 *
 * Each node in the returned graph gets its own Reference — clicking a
 * node's citation deep-links into the Document Explorer for that
 * specific document. The target document is also cited (with a hint
 * that it's the focal point of the walk).
 */
import { z } from 'zod';

import { makeReference, type Reference } from '../references';
import {
  baseUrl,
  fetchJson,
  isErrorResult,
  logToolInvocation,
  type ToolResult,
} from './shared';

export const walkProvenanceInput = z.object({
  datasetId: z.string().min(1, 'datasetId is required'),
  docId: z.string().min(1, 'docId is required'),
  maxDepth: z.number().int().positive().max(6).optional(),
});

export interface ProvenanceNode {
  id: string;
  ndiId: string;
  name: string;
  className: string;
  isTarget: boolean;
  reference: Reference;
}

export interface ProvenanceEdge {
  source: string;
  target: string;
  label: string;
  direction: 'upstream' | 'downstream' | string;
}

export interface WalkProvenanceResult {
  target: { id: string; ndiId: string };
  nodes: ProvenanceNode[];
  edges: ProvenanceEdge[];
  truncated: boolean;
  maxDepth: number;
  references: Reference[];
}

interface RawDependenciesResponse {
  target_id?: string;
  target_ndi_id?: string;
  nodes?: Array<{
    id?: string;
    ndiId?: string;
    name?: string;
    className?: string;
    isTarget?: boolean;
  }>;
  edges?: ProvenanceEdge[];
  truncated?: boolean;
  max_depth?: number;
}

export async function walkProvenanceHandler(
  input: z.infer<typeof walkProvenanceInput>,
): Promise<ToolResult<WalkProvenanceResult>> {
  logToolInvocation('walk_provenance', {
    datasetId: (input as { datasetId?: unknown } | undefined)?.datasetId,
    docId: (input as { docId?: unknown } | undefined)?.docId,
    maxDepth: (input as { maxDepth?: unknown } | undefined)?.maxDepth,
  });
  const parsed = walkProvenanceInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const { datasetId, docId } = parsed.data;
  const maxDepth = parsed.data.maxDepth ?? 3;

  const url =
    `${base}/api/datasets/${encodeURIComponent(datasetId)}` +
    `/documents/${encodeURIComponent(docId)}/dependencies?depth=${maxDepth}`;

  const result = await fetchJson<RawDependenciesResponse>(url);
  if (isErrorResult(result)) return result;

  const nodes: ProvenanceNode[] = (result.nodes ?? [])
    .filter((n): n is { id: string; ndiId?: string; name?: string; className?: string; isTarget?: boolean } => typeof n.id === 'string')
    .map((n) => ({
      id: n.id,
      ndiId: n.ndiId ?? '',
      name: n.name ?? '',
      className: n.className ?? 'unknown',
      isTarget: Boolean(n.isTarget),
      reference: makeReference({
        datasetId,
        doc_id: n.id,
        class: n.className ?? 'unknown',
        title: n.name && n.name.length > 0 ? n.name : `${n.className ?? 'document'} ${n.id.slice(-8)}`,
        snippet: n.isTarget ? 'Target of the walk' : `Linked via depends_on`,
      }),
    }));

  const references: Reference[] = nodes.map((n) => n.reference);

  return {
    target: {
      id: result.target_id ?? docId,
      ndiId: result.target_ndi_id ?? '',
    },
    nodes,
    edges: result.edges ?? [],
    truncated: Boolean(result.truncated),
    maxDepth: result.max_depth ?? maxDepth,
    references,
  };
}
