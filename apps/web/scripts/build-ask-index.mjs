#!/usr/bin/env node
/**
 * Build the experimental /ask chat's RAG index in Postgres + pgvector.
 *
 * Pattern mirrors vh-lab + shrek-lab `ingest/run.py`:
 *   1. Open a `staging` row in `rag_versions`
 *   2. Fetch every published dataset from FastAPI
 *   3. Compose a "document" per dataset (catalog + sidecar)
 *   4. Batch-embed via Voyage voyage-4-large (1024d, input_type=document)
 *   5. Bulk-insert into `chunks_staging` under the new version
 *   6. Atomically swap `chunks` and `chunks_staging`, then mark
 *      the version as `production` and the prior production version
 *      as `retired`
 *
 * Run manually when datasets are added or `dataset-metadata.json`
 * changes:
 *
 *   export DATABASE_URL=postgres://...railway.app:.../railway
 *   export VOYAGE_API_KEY=<voyage-key>
 *   pnpm --filter @ndi-cloud/web build-ask-index
 *
 * Re-running is safe — each run gets its own staging version, and
 * the swap is atomic. A failed run leaves the prior production version
 * intact.
 *
 * Setup once per Postgres instance:
 *   psql $DATABASE_URL -f apps/web/lib/ai/db/schema.sql
 */
// We call Voyage via REST rather than the `voyageai` SDK because the
// SDK ships ESM with directory-style sub-imports that don't resolve
// under strict Node ESM (`ERR_UNSUPPORTED_DIR_IMPORT`). The REST
// endpoint is what the SDK wraps anyway — using it directly drops
// one dependency and matches the runtime client in voyage-client.ts.
import pkg from 'pg';
const { Client } = pkg;
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '..');

const FASTAPI_URL =
  process.env.UPSTREAM_API_URL ??
  process.env.INTERNAL_API_URL ??
  'https://ndb-v2-production.up.railway.app';

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const VOYAGE_MODEL = 'voyage-4-large';
const EMBED_DIM = 1024;
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const EMBED_BATCH_SIZE = 32;
const INSERT_BATCH_SIZE = 50;

const METADATA_PATH = path.join(WEB_ROOT, 'lib/ai/dataset-metadata.json');

if (!VOYAGE_API_KEY) {
  console.error('error: VOYAGE_API_KEY env var is required');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('error: DATABASE_URL env var is required');
  console.error('  hint: Railway → ndi-cloud-app → +Add → PostgreSQL → Variables');
  console.error('  hint: then run `psql $DATABASE_URL -f apps/web/lib/ai/db/schema.sql`');
  process.exit(1);
}

const VOYAGE_EMBED_API = 'https://api.voyageai.com/v1/embeddings';

const db = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function fetchAllDatasets() {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${FASTAPI_URL}/api/datasets/published?page=${page}&pageSize=${PAGE_SIZE}`;
    process.stderr.write(`fetching ${url}\n`);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`catalog fetch failed at page ${page}: ${res.status}`);
    const body = await res.json();
    const datasets = body?.datasets ?? [];
    if (datasets.length === 0) break;
    all.push(...datasets);
    if (body.totalNumber && all.length >= body.totalNumber) break;
  }
  return all;
}

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
      out.push({ ...d, _summary: res.ok ? await res.json() : null });
    } catch {
      out.push({ ...d, _summary: null });
    }
    if (i % 25 === 0) {
      process.stderr.write(`  enriched ${i}/${datasets.length}\n`);
    }
  }
  return out;
}

function collectStrings(...sources) {
  const seen = new Set();
  for (const src of sources) {
    if (!src) continue;
    if (typeof src === 'string') {
      if (src) seen.add(src);
    } else if (Array.isArray(src)) {
      for (const item of src) {
        const s = typeof item === 'string' ? item : item?.name ?? item?.label;
        if (typeof s === 'string' && s) seen.add(s);
      }
    }
  }
  return Array.from(seen);
}

function composeDocument(dataset, sidecar) {
  const lines = [];
  const name = dataset.name ?? '(unnamed dataset)';
  const id = dataset.id || dataset._id || '';

  lines.push(`Dataset: ${name}`);
  if (sidecar?.displayName && sidecar.displayName !== name) {
    lines.push(`Also known as: ${sidecar.displayName}`);
  }
  if (id) lines.push(`ID: ${id}`);
  if (dataset.description) lines.push(`Description: ${dataset.description}`);

  const species = collectStrings(dataset.species, dataset._summary?.species);
  if (species.length) lines.push(`Species: ${species.join(', ')}`);

  const regions = collectStrings(dataset.brainRegions, dataset._summary?.brainRegions);
  if (regions.length) lines.push(`Brain regions: ${regions.join(', ')}`);

  const strains = collectStrings(dataset.strains, dataset._summary?.strains);
  if (strains.length) lines.push(`Strains: ${strains.join(', ')}`);

  const contributors = (dataset.contributors ?? [])
    .map((c) => {
      if (typeof c === 'string') return c;
      const n = [c.firstName, c.lastName].filter(Boolean).join(' ');
      return c.contact ? `${n} (${c.contact})` : n;
    })
    .filter(Boolean);
  if (contributors.length) lines.push(`Contributors: ${contributors.join(', ')}`);

  if (dataset.license) lines.push(`License: ${dataset.license}`);
  if (dataset.doi) lines.push(`DOI: ${dataset.doi}`);
  if (dataset._summary?.totalDocuments) {
    lines.push(`Total documents: ${dataset._summary.totalDocuments}`);
  }

  if (sidecar?.highlights?.length) {
    lines.push(`Highlights:`);
    for (const h of sidecar.highlights) lines.push(`- ${h}`);
  }
  if (sidecar?.notableMethods?.length) {
    lines.push(`Methods: ${sidecar.notableMethods.join(', ')}`);
  }
  if (sidecar?.keywords?.length) {
    lines.push(`Search keywords: ${sidecar.keywords.join(', ')}`);
  }
  if (sidecar?.piContext) lines.push(`PI context: ${sidecar.piContext}`);

  // Demo-curated binary-signal example so the LLM has a deterministic
  // doc + filename to pass to `fetch_signal` without exploring (which
  // routinely overruns the step cap). Format chosen to be greppable
  // from the semantic-search chunk text the LLM consumes.
  if (sidecar?.binarySignalExample) {
    const ex = sidecar.binarySignalExample;
    if (ex.docId && ex.filename) {
      lines.push(`Demo binary signal example: docId=${ex.docId} file=${ex.filename}`);
      if (ex.description) lines.push(`  (${ex.description})`);
    }
  }

  return lines.join('\n');
}

async function embedDocuments(texts) {
  const all = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    process.stderr.write(
      `  embedding ${start + 1}-${start + batch.length} of ${texts.length}…\n`,
    );
    const res = await fetch(VOYAGE_EMBED_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: batch,
        model: VOYAGE_MODEL,
        input_type: 'document',
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Voyage embed failed (${res.status}): ${errText.slice(0, 200)}`);
    }
    const body = await res.json();
    for (const item of body.data ?? []) all.push(item.embedding);
  }
  return all;
}

/** Format a number array as a pgvector literal: '[0.123, 0.456, ...]' */
function vectorLiteral(vec) {
  return '[' + vec.join(',') + ']';
}

async function openStagingVersion(label) {
  const res = await db.query(
    `INSERT INTO rag_versions (label, status) VALUES ($1, 'staging') RETURNING id`,
    [label],
  );
  return res.rows[0].id;
}

async function clearStagingTable() {
  await db.query('TRUNCATE chunks_staging');
}

async function bulkInsertStaging(entries) {
  // Batch INSERTs to keep statement sizes reasonable. pg's parameterized
  // queries accept up to ~65k params per statement; 50 rows × 6 cols =
  // 300 params per batch — well within limits and gives nice progress.
  for (let start = 0; start < entries.length; start += INSERT_BATCH_SIZE) {
    const batch = entries.slice(start, start + INSERT_BATCH_SIZE);
    const placeholders = [];
    const values = [];
    for (const [i, e] of batch.entries()) {
      const base = i * 6;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::vector, $${base + 5}, $${base + 6})`,
      );
      values.push(
        e.doc_id,
        e.doc_title,
        e.content,
        vectorLiteral(e.embedding),
        e.rag_version_id,
        JSON.stringify(e.metadata),
      );
    }
    await db.query(
      `INSERT INTO chunks_staging
         (doc_id, doc_title, content, embedding, rag_version_id, metadata)
       VALUES ${placeholders.join(',')}`,
      values,
    );
    process.stderr.write(
      `  inserted ${start + batch.length}/${entries.length}\n`,
    );
  }
}

async function promoteStagingToProduction(newVersionId) {
  // Atomic swap inside a transaction. Matches
  // vh-lab-chatbot/ingest/upload.py::promote_staging_to_production_sync.
  await db.query('BEGIN');
  try {
    // 1. Move all current production rows out (will be replaced)
    await db.query('TRUNCATE chunks');
    // 2. Copy staging rows over to production
    await db.query(
      `INSERT INTO chunks
         (doc_id, doc_title, content, embedding, rag_version_id, metadata)
       SELECT doc_id, doc_title, content, embedding, rag_version_id, metadata
       FROM chunks_staging`,
    );
    // 3. Reindex (REINDEX needs to run outside transaction for some Postgres
    //    versions; CREATE INDEX ... is fine here since the data just changed).
    await db.query('REINDEX INDEX idx_chunks_embedding');
    await db.query('REINDEX INDEX idx_chunks_search_vector');
    // 4. Retire prior production versions
    await db.query(
      `UPDATE rag_versions SET status = 'retired'
       WHERE status = 'production' AND id != $1`,
      [newVersionId],
    );
    // 5. Mark new version as production
    await db.query(
      `UPDATE rag_versions
         SET status = 'production', promoted_at = NOW()
         WHERE id = $1`,
      [newVersionId],
    );
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
}

async function main() {
  console.error(`# Build /ask RAG index`);
  console.error(`# FastAPI: ${FASTAPI_URL}`);
  console.error(`# Voyage:  ${VOYAGE_MODEL}`);

  await db.connect();
  try {
    // 1. Catalog
    const catalog = await fetchAllDatasets();
    console.error(`# Fetched ${catalog.length} datasets from catalog`);

    // 2. Enrich
    const enriched = await enrichWithSummaries(catalog);
    console.error(`# Fetched ${enriched.filter((d) => d._summary).length} summaries`);

    // 3. Sidecar
    let sidecar = {};
    try {
      const raw = readFileSync(METADATA_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      sidecar = Object.fromEntries(
        Object.entries(parsed).filter(([k]) => !k.startsWith('_')),
      );
      console.error(`# Loaded ${Object.keys(sidecar).length} sidecar entries`);
    } catch (e) {
      console.error(`# warning: could not read sidecar: ${e.message}`);
    }

    // 4. Compose
    const records = [];
    for (const dataset of enriched) {
      const id = dataset.id || dataset._id;
      if (!id) continue;
      const sideEntry = sidecar[id];
      const content = composeDocument(dataset, sideEntry);
      records.push({
        doc_id: id,
        doc_title: dataset.name ?? null,
        content,
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
    }

    if (records.length === 0) {
      console.error('# error: no datasets to index — aborting');
      process.exit(1);
    }

    // 5. Embed
    console.error(`# Embedding ${records.length} documents…`);
    const embeddings = await embedDocuments(records.map((r) => r.content));
    if (embeddings.length !== records.length) {
      throw new Error(
        `embedding count mismatch (${embeddings.length} vs ${records.length})`,
      );
    }
    if (embeddings[0]?.length !== EMBED_DIM) {
      throw new Error(
        `unexpected embedding dim ${embeddings[0]?.length} (expected ${EMBED_DIM})`,
      );
    }

    // 6. Open staging version
    const label = `manual-${new Date().toISOString()}`;
    const versionId = await openStagingVersion(label);
    console.error(`# Opened staging version ${versionId} (${label})`);

    // 7. Bulk insert into staging
    await clearStagingTable();
    const staged = records.map((r, i) => ({
      ...r,
      rag_version_id: versionId,
      embedding: embeddings[i],
    }));
    await bulkInsertStaging(staged);
    console.error(`# Staged ${staged.length} rows`);

    // 8. Promote
    await promoteStagingToProduction(versionId);
    console.error(`# Promoted version ${versionId} → production`);

    console.error(`# Done. Visit /ask after Vercel redeploys.`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(`# fatal: ${e?.stack ?? e}`);
  process.exit(1);
});
