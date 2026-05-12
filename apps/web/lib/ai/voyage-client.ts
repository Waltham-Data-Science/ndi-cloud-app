/**
 * Voyage AI runtime query embedding for the experimental /ask chat.
 *
 * The build-time index generator uses the official `voyageai` SDK
 * (Node-only) — but at request time we hit the REST API directly via
 * `fetch` so the function stays runtime-portable (edge + Node both
 * work) and the SDK isn't pulled into the deployed bundle.
 *
 * Voyage returns L2-normalized embeddings by default, so the loaded
 * vectors (also normalized) collapse cosine similarity to a dot
 * product. The model + dimension MUST match what the build-time
 * script wrote into dataset-index.json — otherwise the dot product
 * is semantically meaningless. Both pinned to voyage-4-large here
 * and in scripts/build-ask-index.mjs.
 *
 * 8s timeout matches the other tool handlers in lib/ai/tools.ts.
 */

const VOYAGE_API = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-4-large';
const TIMEOUT_MS = 8_000;

interface VoyageResponse {
  data: Array<{ embedding: number[] }>;
}

export async function embedQuery(text: string): Promise<Float32Array> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(VOYAGE_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: [text],
        model: VOYAGE_MODEL,
        input_type: 'query',
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Voyage returned ${res.status}`);
    }

    const body = (await res.json()) as VoyageResponse;
    const first = body.data?.[0]?.embedding;
    if (!Array.isArray(first)) {
      throw new Error('Voyage response missing embedding');
    }
    return Float32Array.from(first);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Voyage embedding timeout (8s)');
    }
    if (e instanceof Error && /^Voyage/.test(e.message)) throw e;
    if (e instanceof Error && /VOYAGE_API_KEY/.test(e.message)) throw e;
    throw new Error(`Voyage network error: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
