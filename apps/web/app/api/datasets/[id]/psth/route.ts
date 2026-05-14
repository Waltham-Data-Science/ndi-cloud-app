/**
 * POST /api/datasets/[id]/psth — workspace panel endpoint.
 *
 * Thin route handler that reuses the chat-side `psthHandler`
 * (lib/ndi/tools/psth.ts). Same pattern as spike-summary: workspace
 * panel hits this route, route forwards the caller's auth headers,
 * handler reaches Railway server-side via `baseUrl()`.
 */
import { type NextRequest } from 'next/server';

import { psthHandler, psthInput } from '@/lib/ndi/tools/psth';
import { authHeadersFromRequest } from '@/lib/ndi/tools/shared';

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
  // sees `datasetId`. URL wins on collision — it's the canonical
  // resource identifier.
  const merged =
    body && typeof body === 'object'
      ? { ...(body as Record<string, unknown>), datasetId: id }
      : { datasetId: id };

  const parsed = psthInput.safeParse(merged);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    );
  }

  const result = await psthHandler(parsed.data, {
    authHeaders: authHeadersFromRequest(req),
  });
  // Handler returns either a `ToolError` (`{ error: string }`) or a
  // `PsthToolResult` envelope. Both shapes pass through verbatim —
  // the panel discriminates on the presence of `error`.
  return Response.json(result, { status: 200 });
}
