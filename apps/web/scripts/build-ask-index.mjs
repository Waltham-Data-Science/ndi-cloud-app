#!/usr/bin/env node
/**
 * Build the experimental /ask chat's RAG semantic search index.
 *
 * This is a one-shot script — run manually when:
 *   - New datasets are published in the NDI Commons catalog
 *   - The `lib/ai/dataset-metadata.json` sidecar has been edited
 *
 * Workflow:
 *   1. Fetch every published dataset from FastAPI (paginated)
 *   2. Load the curated metadata sidecar
 *   3. For each dataset, build a "document" string: catalog fields + sidecar fields
 *   4. Batch-embed all documents via Voyage AI (voyage-4-large, 1024-d)
 *   5. Write `lib/ai/dataset-index.json` with vectors + text + metadata
 *
 * The output is committed to git. Vercel's next build picks up the index.
 *
 * Why Voyage AI: matches the vh-lab + shrek-lab chatbots' embedding contract.
 * One Voyage API key covers all three. voyage-4-large is L2-normalized so the
 * runtime cosine search becomes a dot product (faster + simpler).
 *
 * Usage:
 *   export VOYAGE_API_KEY=<your-key>
 *   export UPSTREAM_API_URL=https://ndb-v2-production.up.railway.app  # optional, has sane default
 *   pnpm --filter @ndi-cloud/web build-ask-index
 *
 * Re-running is safe + idempotent — the output is fully regenerated each run.
 * Re-running with the SAME sidecar+catalog re-embeds (a few cents at Voyage
 * pricing for our scale), so it doubles as a freshness check.
 */
import { VoyageAIClient } from 'voyageai';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '..');

const FASTAPI_URL =
  process.env.UPSTREAM_API_URL ??
  process.env.INTERNAL_API_URL ??
  'https://ndb-v2-production.up.railway.app';

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = 'voyage-4-large';
const PAGE_SIZE = 100;
const MAX_PAGES = 50; // upper bound — 5000 datasets is plenty headroom
const EMBED_BATCH_SIZE = 32; // Voyage caps inputs per request; we stay well under

const METADATA_PATH = path.join(WEB_ROOT, 'lib/ai/dataset-metadata.json');
const OUT_PATH = path.join(WEB_ROOT, 'lib/ai/dataset-index.json');

if (!VOYAGE_API_KEY) {
  console.error('error: VOYAGE_API_KEY env var is required');
  console.error('  hint: same key your vh-lab/shrek-lab chatbots use');
  process.exit(1);
}

const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });

/**
 * Fetch every published dataset, following pagination. Returns an array
 * of raw catalog records (the FastAPI response shape).
 */
async function fetchAllDatasets() {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${FASTAPI_URL}/api/datasets/published?page=${page}&pageSize=${PAGE_SIZE}`;
    process.stderr.write(`fetching ${url}\n`);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`catalog fetch failed at page ${page}: ${res.status}`);
    }
    const body = await res.json();
    const datasets = body?.datasets ?? [];
    if (datasets.length === 0) break;
    all.push(...datasets);
    if (body.totalNumber && all.length >= body.totalNumber) break;
  }
  return all;
}

/**
 * Fetch each dataset's compact summary (richer than the list view).
 * The summary endpoint returns counts + key metadata that the catalog
 * list doesn't expose, which gives the embedding more signal.
 *
 * Best-effort: if a summary fetch fails, the dataset still gets embedded
 * with whatever list-view fields we have.
 */
async function enrichWithSummaries(datasets) {
  const out = [];
  let i = 0;
  for (const d of datasets) {
    i++;
    const id = d.id || d._id;
    if (!id) {
      out.push({ ...d, _summary: null });
      continue;
    }
    try {
      const res = await fetch(`${FASTAPI_URL}/api/datasets/${id}/summary`, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const summary = await res.json();
        out.push({ ...d, _summary: summary });
      } else {
        out.push({ ...d, _summary: null });
      }
    } catch {
      out.push({ ...d, _summary: null });
    }
    if (i % 25 === 0) {
      process.stderr.write(`  enriched ${i}/${datasets.length}\n`);
    }
  }
  return out;
}

/**
 * Compose the "document" string that gets embedded.
 *
 * Strategy: concatenate the catalog fields with the sidecar fields under
 * labeled sections. The voyage model can pick up structure from labels
 * like "Highlights:" and "Methods:". Field order roughly mirrors
 * vh-lab's content_with_context pattern (most-anchoring info first).
 */
function composeDocument(dataset, sidecar) {
  const lines = [];
  const name = dataset.name ?? '(unnamed dataset)';
  const id = dataset.id || dataset._id || '';

  lines.push(`Dataset: ${name}`);
  if (sidecar?.displayName && sidecar.displayName !== name) {
    lines.push(`Also known as: ${sidecar.displayName}`);
  }
  if (id) lines.push(`ID: ${id}`);

  if (dataset.description) {
    lines.push(`Description: ${dataset.description}`);
  }

  // Species / brain regions / strains — multiple shapes possible
  // depending on whether the cloud has normalized facets attached.
  const species = collectStrings(dataset.species, dataset._summary?.species);
  if (species.length) lines.push(`Species: ${species.join(', ')}`);

  const regions = collectStrings(dataset.brainRegions, dataset._summary?.brainRegions);
  if (regions.length) lines.push(`Brain regions: ${regions.join(', ')}`);

  const strains = collectStrings(dataset.strains, dataset._summary?.strains);
  if (strains.length) lines.push(`Strains: ${strains.join(', ')}`);

  // Contributors — capture for "who built this?" queries
  const contributors = (dataset.contributors ?? [])
    .map((c) => {
      if (typeof c === 'string') return c;
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
      return c.contact ? `${name} (${c.contact})` : name;
    })
    .filter(Boolean);
  if (contributors.length) lines.push(`Contributors: ${contributors.join(', ')}`);

  if (dataset.license) lines.push(`License: ${dataset.license}`);
  if (dataset.doi) lines.push(`DOI: ${dataset.doi}`);

  // Document counts give "how big is this dataset" intuition
  if (dataset._summary?.totalDocuments) {
    lines.push(`Total documents: ${dataset._summary.totalDocuments}`);
  }

  // Sidecar enrichment — explicitly labeled so the model can lean on it
  if (sidecar?.highlights?.length) {
    lines.push(`Highlights:`);
    for (const h of sidecar.highlights) lines.push(`- ${h}`);
  }
  if (sidecar?.notableMethods?.length) {
    lines.push(`Methods: ${sidecar.notableMethods.join(', ')}`);
  }
  if (sidecar?.keywords?.length) {
    // Keywords are search-only signal; we tag them so the model knows
    // they're synonyms / alternate phrasings rather than canonical facts.
    lines.push(`Search keywords: ${sidecar.keywords.join(', ')}`);
  }
  if (sidecar?.piContext) lines.push(`PI context: ${sidecar.piContext}`);

  return lines.join('\n');
}

function collectStrings(...sources) {
  const seen = new Set();
  for (const src of sources) {
    if (!src) continue;
    if (typeof src === 'string') {
      if (src && !seen.has(src)) seen.add(src);
    } else if (Array.isArray(src)) {
      for (const item of src) {
        const s = typeof item === 'string' ? item : item?.name ?? item?.label;
        if (typeof s === 'string' && s && !seen.has(s)) seen.add(s);
      }
    }
  }
  return Array.from(seen);
}

/**
 * Batch-embed an array of strings via Voyage AI. Returns embeddings in
 * the same order as inputs.
 */
async function embedDocuments(texts) {
  const all = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    process.stderr.write(
      `  embedding ${start + 1}-${start + batch.length} of ${texts.length}…\n`,
    );
    const res = await voyage.embed({
      input: batch,
      model: VOYAGE_MODEL,
      inputType: 'document',
    });
    for (const item of res.data ?? []) {
      all.push(item.embedding);
    }
  }
  return all;
}

async function main() {
  console.error(`# Build /ask RAG index`);
  console.error(`# FastAPI: ${FASTAPI_URL}`);
  console.error(`# Voyage model: ${VOYAGE_MODEL}`);

  // 1. Catalog
  const catalog = await fetchAllDatasets();
  console.error(`# Fetched ${catalog.length} datasets from catalog`);

  // 2. Enrichment summaries
  const enriched = await enrichWithSummaries(catalog);
  console.error(`# Fetched ${enriched.filter((d) => d._summary).length} summaries`);

  // 3. Metadata sidecar
  let sidecar = {};
  try {
    const raw = readFileSync(METADATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // Drop the documentation-only keys (_doc, _examples, _schema_doc, etc.)
    // — those are for humans reading the file, not for embedding.
    sidecar = Object.fromEntries(
      Object.entries(parsed).filter(([k]) => !k.startsWith('_')),
    );
    console.error(`# Loaded ${Object.keys(sidecar).length} sidecar entries`);
  } catch (e) {
    console.error(`# warning: could not read sidecar: ${e.message}`);
  }

  // 4. Compose + embed
  const entries = [];
  const docsToEmbed = [];

  for (const dataset of enriched) {
    const id = dataset.id || dataset._id;
    if (!id) continue;
    const sideEntry = sidecar[id];
    const doc = composeDocument(dataset, sideEntry);
    entries.push({
      id,
      name: dataset.name ?? '(unnamed)',
      text: doc,
      metadata: {
        species: collectStrings(dataset.species, dataset._summary?.species),
        brainRegions: collectStrings(
          dataset.brainRegions,
          dataset._summary?.brainRegions,
        ),
        license: dataset.license ?? null,
        doi: dataset.doi ?? null,
        totalDocuments: dataset._summary?.totalDocuments ?? null,
        hasSidecar: Boolean(sideEntry),
      },
    });
    docsToEmbed.push(doc);
  }

  if (entries.length === 0) {
    console.error(`# error: no datasets to index — aborting`);
    process.exit(1);
  }

  console.error(`# Embedding ${entries.length} documents…`);
  const embeddings = await embedDocuments(docsToEmbed);

  if (embeddings.length !== entries.length) {
    console.error(
      `# error: embedding count mismatch (${embeddings.length} vs ${entries.length})`,
    );
    process.exit(1);
  }

  // 5. Write the index
  const index = {
    schemaVersion: 1,
    model: VOYAGE_MODEL,
    dim: embeddings[0]?.length ?? 0,
    createdAt: new Date().toISOString(),
    entries: entries.map((e, i) => ({
      ...e,
      embedding: embeddings[i],
    })),
  };

  writeFileSync(OUT_PATH, JSON.stringify(index));
  console.error(
    `# Wrote ${OUT_PATH} (${index.entries.length} entries, ${index.dim}d, ~${
      Math.round(JSON.stringify(index).length / 1024)
    } KB)`,
  );
}

main().catch((e) => {
  console.error(`# fatal: ${e?.stack ?? e}`);
  process.exit(1);
});
