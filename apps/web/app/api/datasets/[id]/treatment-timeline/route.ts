/**
 * POST /api/datasets/[id]/treatment-timeline — workspace panel endpoint.
 *
 * Thin route handler that reuses the chat-side `treatmentTimelineHandler`
 * (lib/ndi/tools/treatment-timeline.ts). Same parity contract as the
 * spike-summary wrapper: chat invokes the handler from the Anthropic
 * streamText tool loop; the workspace panel invokes the same handler
 * over HTTP so the GUI gets identical chart payloads + references the
 * chat would produce.
 *
 * Auth-forwarding: the workspace is auth-gated, so every request that
 * lands here carries the user's session Cookie + X-XSRF-TOKEN. We
 * extract both and pass them via `ToolContext` to the handler so its
 * outbound FastAPI calls authenticate the caller and return private-
 * dataset rows the user has access to.
 *
 * Path-id guard mirrors `/api/datasets/[id]/route.ts` — accept only
 * the bare alphanumeric/_- id shapes Mongo uses, so a crafted path
 * can't reach an unintended upstream URL.
 */
import { type NextRequest } from 'next/server';

import {
  treatmentTimelineHandler,
  treatmentTimelineInput,
} from '@/lib/ndi/tools/treatment-timeline';
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

  // Merge the route param into the body so the handler's zod schema
  // sees `datasetId` even when the client only supplied the URL path.
  const merged =
    body && typeof body === 'object'
      ? { ...(body as Record<string, unknown>), datasetId: id }
      : { datasetId: id };

  const parsed = treatmentTimelineInput.safeParse(merged);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    );
  }

  // toolContextFromRequest threads auth headers + the inbound
  // request id so cross-boundary tracing can correlate this call
  // with the FastAPI log lines for the same panel load.
  const result = await treatmentTimelineHandler(
    parsed.data,
    toolContextFromRequest(req),
  );
  // The handler returns either a `ToolError` (`{ error: string }`) or
  // a `TreatmentTimelineResult` envelope. Both shapes are returned
  // verbatim — the panel discriminates on the presence of `error`.
  return Response.json(result, { status: 200 });
}
