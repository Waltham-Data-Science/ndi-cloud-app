/**
 * POST /api/datasets/[id]/tabular-query — workspace panel endpoint.
 *
 * Thin route handler that reuses the chat-side `tabularQueryHandler`
 * (lib/ndi/tools/tabular-query.ts) so the BehavioralCompare panel and
 * the chat's `tabular_query` tool render identical group statistics
 * and chart payloads off the same code path (ADR-002).
 *
 * Migration note (Stream 4.1, 2026-05-15): BehavioralComparePanel
 * previously bypassed this wrapper, calling
 * `GET /api/datasets/:id/tabular_query` (the underscore-spelled
 * FastAPI path) directly via the Vercel rewrite. That worked for
 * public datasets (GET is exempt from CSRF) but skipped the
 * cross-boundary tracing + auth-forwarding contract every other
 * mutation panel honors. Switching to this POST wrapper:
 *
 *   - Threads auth headers via toolContextFromRequest (ADR-003)
 *   - Threads the inbound x-request-id through to FastAPI for
 *     cross-boundary tracing (ADR-005)
 *   - Surfaces the full chat-tool envelope (groups_summary with
 *     mean/median/std/min/max/q1/q3 + chart_payload + references +
 *     empty_hint) instead of a custom intermediate shape
 *
 * Path-id guard mirrors the sibling wrapper routes — accept only the
 * bare alphanumeric/_- id shapes Mongo uses, so a crafted path can't
 * reach an unintended upstream URL.
 */
import { type NextRequest } from 'next/server';

import {
  tabularQueryHandler,
  tabularQueryInput,
} from '@/lib/ndi/tools/tabular-query';
import { toolContextFromRequest } from '@/lib/ndi/tools/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return Response.json({ error: 'invalid_dataset_id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json_body' }, { status: 400 });
  }

  // URL wins on collision — the path id is the canonical resource id.
  const merged =
    body && typeof body === 'object'
      ? { ...(body as Record<string, unknown>), datasetId: id }
      : { datasetId: id };

  const parsed = tabularQueryInput.safeParse(merged);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    );
  }

  const result = await tabularQueryHandler(
    parsed.data,
    toolContextFromRequest(req),
  );
  // The handler returns either a `ToolError` (`{ error: string }`) or
  // a `TabularQueryToolResult` envelope. Both shapes are returned
  // verbatim — the panel discriminates on the presence of `error`.
  return Response.json(result, { status: 200 });
}
