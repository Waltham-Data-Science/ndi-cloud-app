/**
 * POST /api/datasets/[id]/spike-summary — workspace panel endpoint.
 *
 * Thin route handler that reuses the chat-side `fetchSpikeSummaryHandler`
 * (lib/ai/tools/fetch-spike-summary.ts). The chat path invokes the
 * handler from the Anthropic streamText tool loop; the workspace panel
 * invokes the same handler over HTTP so the GUI gets identical chart
 * payloads + references the chat would produce.
 *
 * This route takes precedence over the catch-all `/api/:path*` rewrite
 * in `next.config.ts` (Next.js resolves `app/api/` route handlers
 * before falling through to rewrites), so the FastAPI never sees this
 * path — the handler itself reaches Railway server-side via
 * `baseUrl()` exactly like the chat tool does. That keeps the chat /
 * panel parity tight: one path of code does the discovery, filtering,
 * stride-sampling, and payload shaping.
 *
 * Path-id guard mirrors `/api/datasets/[id]/route.ts` — accept only
 * the bare alphanumeric/_- id shapes Mongo uses, so a crafted path
 * can't reach an unintended upstream URL.
 */
import { type NextRequest } from 'next/server';

import {
  fetchSpikeSummaryHandler,
  fetchSpikeSummaryInput,
} from '@/lib/ndi/tools/fetch-spike-summary';

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
  // sees `datasetId`. We accept either spelling defensively — if the
  // client supplied a different id in the body, the URL wins (the URL
  // is the canonical resource identifier).
  const merged =
    body && typeof body === 'object'
      ? { ...(body as Record<string, unknown>), datasetId: id }
      : { datasetId: id };

  const parsed = fetchSpikeSummaryInput.safeParse(merged);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    );
  }

  const result = await fetchSpikeSummaryHandler(parsed.data);
  // The handler returns either a `ToolError` (`{ error: string }`) or
  // a `FetchSpikeSummaryToolResult` envelope. Both shapes are returned
  // verbatim — the panel discriminates on the presence of `error`.
  return Response.json(result, { status: 200 });
}
