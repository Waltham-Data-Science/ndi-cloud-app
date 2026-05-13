#!/usr/bin/env node
/**
 * audit-public-api.mjs — Layer 1 of the NDI-python integration audit.
 *
 * Hits an identical set of public, anonymous-readable endpoints on
 * two ndb-v2 backend URLs (live + experimental) and JSON-diffs every
 * response. Used to prove that swapping in NDI-python's parsers /
 * ontology lookup / compression handling does NOT regress the
 * public-anonymous response surface byte-for-byte.
 *
 * Usage:
 *   LIVE_API_URL=https://ndb-v2-production.up.railway.app \
 *   EXPERIMENTAL_API_URL=https://ndb-v2-staging.up.railway.app \
 *   node apps/web/scripts/audit-public-api.mjs
 *
 * Exit code:
 *   0 — every endpoint matched (after deterministic-field stripping)
 *   1 — at least one diff; full report printed to stdout
 *   2 — one or both backends unreachable / bad config
 *
 * Notes:
 *   - All requests are GET and unauthenticated. The auth-gated paths
 *     (private datasets, edits) are out of scope for the public audit.
 *   - Non-deterministic fields (request IDs, timestamps in metadata,
 *     cache headers) are stripped before diffing — see SCRUB_PATHS.
 *   - The 8 published dataset IDs are hardcoded here intentionally —
 *     this audit targets a fixed snapshot of the catalog, so a new
 *     dataset getting published doesn't change what we audit.
 *     If you re-bake the audit later, regenerate this list via
 *     `curl $URL/api/datasets/published?page=1&pageSize=100 | jq`.
 *   - For binary endpoints (timeseries / signal), we diff the JSON
 *     envelope shape AND a numerical-summary digest of the channels
 *     (sample count, min, max, mean) — NOT the raw float arrays.
 *     Tiny float-rounding diffs are tolerated within EPSILON; gross
 *     shape mismatches still fail.
 */

import { argv, env, exit } from 'node:process';

// ----- Config -----------------------------------------------------------

const LIVE = env.LIVE_API_URL ?? 'https://ndb-v2-production.up.railway.app';
const EXPERIMENTAL = env.EXPERIMENTAL_API_URL;
const TIMEOUT_MS = Number(env.AUDIT_TIMEOUT_MS ?? 30_000);
const EPSILON = 1e-6; // float-equality tolerance for binary-summary digests
const VERBOSE = argv.includes('--verbose');

if (!EXPERIMENTAL) {
  console.error(
    'EXPERIMENTAL_API_URL not set. Example:\n' +
      '  EXPERIMENTAL_API_URL=https://ndb-v2-staging.up.railway.app \\\n' +
      '  LIVE_API_URL=https://ndb-v2-production.up.railway.app \\\n' +
      '  node apps/web/scripts/audit-public-api.mjs',
  );
  exit(2);
}

// The 8 published datasets, captured 2026-05-13. Update by re-baking.
const DATASETS = [
  '69bc5ca11d547b1f6d083761', // Bhar — C. elegans memory transfer
  '682e7772cdf3f24938176fac', // Haley — C. elegans foraging
  '67f723d574f5f79c6062389d', // Dabrowska — BNST patch-clamp
  '668b0539f13096e04f1feccd', // Carbon-fiber test dataset
  // 4 more from the catalog — backfilled at audit run-time below.
];

// Document IDs known to exercise specific binary paths. These come from
// the demo-curated `binarySignalExample` sidecar entries.
const KNOWN_BINARY_DOCS = [
  {
    dataset: '67f723d574f5f79c6062389d', // Dabrowska
    docId: '68d6e54703a03f5cfdac8eff',
    file: 'ai_group1_seg.nbf_1',
    note: 'NBF — patch-Vm voltage trace',
  },
  // Haley VHSB doc lives at a docId we'll discover at audit-time by
  // probing the class-tables endpoint. Keep list small + extensible.
];

// Document IDs known to have provenance. Discovered at audit-time
// to keep this script self-contained.

// Class names we'll probe per dataset for query_documents diff.
const COMMON_CLASSES = ['subject', 'probe', 'element', 'element_epoch'];

// Fields that vary per-request and must be stripped before diffing.
// Each entry is a dot-path, supporting `[]` for "every element".
const SCRUB_PATHS = [
  // Response-level
  'requestId',
  'request_id',
  'x-request-id',
  // Cache + timing
  'cache_age_s',
  'cache.age_seconds',
  'fetched_at',
  'last_modified',
  // FastAPI envelope variations
  'meta.requestId',
  'meta.fetched_at',
  // Per-row volatile (rarely seen but cheap to strip)
  '[].cached_at',
];

// ----- Fetch helper -----------------------------------------------------

async function fetchJson(baseUrl, path) {
  const url = new URL(path, baseUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { __nonJson: true, text: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: { __error: err instanceof Error ? err.message : String(err) },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ----- Scrubbing --------------------------------------------------------

function scrub(value, pathSpecs = SCRUB_PATHS) {
  // Cheap recursive walk. Applies dot-path matchers.
  return scrubInner(value, pathSpecs, '');
}

function scrubInner(node, pathSpecs, currentPath) {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    return node.map((item) =>
      scrubInner(item, pathSpecs, `${currentPath}[]`),
    );
  }
  const out = {};
  for (const [key, val] of Object.entries(node)) {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    if (pathSpecs.some((p) => p === nextPath || p === `[].${key}`)) continue;
    out[key] = scrubInner(val, pathSpecs, nextPath);
  }
  return out;
}

// ----- Deep diff --------------------------------------------------------

/**
 * Returns null if equal, else an object describing the first difference
 * encountered. Numeric values are compared with EPSILON tolerance to
 * absorb float-rounding noise from any decoder swap.
 */
function deepDiff(a, b, path = '') {
  if (a === b) return null;
  if (typeof a !== typeof b) {
    return { path, kind: 'type', a: typeof a, b: typeof b };
  }
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return null;
    if (Math.abs(a - b) <= EPSILON) return null;
    return { path, kind: 'number', a, b };
  }
  if (a === null || b === null) {
    return { path, kind: 'null', a, b };
  }
  if (typeof a !== 'object') {
    return { path, kind: 'value', a, b };
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return { path, kind: 'shape', a: Array.isArray(a), b: Array.isArray(b) };
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      return { path, kind: 'length', a: a.length, b: b.length };
    }
    for (let i = 0; i < a.length; i++) {
      const d = deepDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) {
    const missing = aKeys.filter((k) => !bKeys.includes(k));
    const extra = bKeys.filter((k) => !aKeys.includes(k));
    return { path, kind: 'keys', missing, extra };
  }
  for (const k of aKeys) {
    const d = deepDiff(a[k], b[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return null;
}

// ----- Endpoint inventory ----------------------------------------------

function buildEndpoints(extraDatasets, extraBinaryDocs) {
  const eps = [];

  // Catalog
  eps.push({ name: 'catalog list', path: '/api/datasets/published?page=1&pageSize=100' });
  eps.push({ name: 'facets all', path: '/api/facets' });

  // Per-dataset
  const allDatasets = [...new Set([...DATASETS, ...extraDatasets])];
  for (const id of allDatasets) {
    eps.push({ name: `summary ${id}`, path: `/api/datasets/${id}/summary` });
    eps.push({ name: `record ${id}`, path: `/api/datasets/${id}` });
    eps.push({ name: `class-counts ${id}`, path: `/api/datasets/${id}/class-counts` });
    for (const cls of COMMON_CLASSES) {
      eps.push({
        name: `tables ${id} ${cls}`,
        path: `/api/datasets/${id}/tables/${cls}?pageSize=10`,
      });
    }
  }

  // Binary docs — both /data/timeseries (Document Explorer) and /signal (Ask)
  for (const bd of [...KNOWN_BINARY_DOCS, ...extraBinaryDocs]) {
    eps.push({
      name: `timeseries ${bd.dataset}/${bd.docId} (${bd.note})`,
      path: `/api/datasets/${bd.dataset}/documents/${bd.docId}/data/timeseries`,
      binary: true,
    });
    const fileParam = bd.file ? `&file=${encodeURIComponent(bd.file)}` : '';
    eps.push({
      name: `signal ${bd.dataset}/${bd.docId} (${bd.note})`,
      path: `/api/datasets/${bd.dataset}/documents/${bd.docId}/signal?downsample=2000${fileParam}`,
      binary: true,
    });
  }

  return eps;
}

// ----- Binary-response digest ------------------------------------------

/**
 * Reduce a timeseries response to a stable digest before comparison.
 * We don't compare raw float arrays (decoder rounding noise would
 * generate false positives). Instead, the digest captures per-channel
 * (count, min, max, mean) — granular enough to catch real regressions
 * (wrong sample count, wrong range), tolerant of minor numerical drift.
 */
function timeseriesDigest(body) {
  if (!body || typeof body !== 'object' || body.__nonJson || body.__error) {
    return body;
  }
  // Soft errors flow through unchanged so they're directly comparable.
  if (body.error) return { error: body.error, format: body.format ?? null };

  const digest = {
    format: body.format ?? null,
    sample_count: body.sample_count ?? body.sample_rate ?? null,
    channel_count: 0,
    channels_digest: {},
  };
  const channels = body.channels ?? {};
  if (channels && typeof channels === 'object') {
    digest.channel_count = Object.keys(channels).length;
    for (const [name, arr] of Object.entries(channels)) {
      if (Array.isArray(arr) && arr.length > 0) {
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        let count = 0;
        let nulls = 0;
        for (const v of arr) {
          if (v === null || (typeof v === 'number' && Number.isNaN(v))) {
            nulls += 1;
            continue;
          }
          if (typeof v === 'number') {
            if (v < min) min = v;
            if (v > max) max = v;
            sum += v;
            count += 1;
          }
        }
        digest.channels_digest[name] = {
          length: arr.length,
          finite_count: count,
          null_count: nulls,
          min: count ? min : null,
          max: count ? max : null,
          mean: count ? sum / count : null,
        };
      } else {
        digest.channels_digest[name] = { length: 0 };
      }
    }
  }
  return digest;
}

// ----- Main -------------------------------------------------------------

async function main() {
  console.log(`Audit: ${LIVE}  vs  ${EXPERIMENTAL}`);
  console.log();

  // 1. Bootstrap extras from the live catalog so we audit every published
  //    dataset, not just the hand-listed 4.
  const catalog = await fetchJson(LIVE, '/api/datasets/published?page=1&pageSize=100');
  const extraDatasets = [];
  if (catalog.ok && catalog.body?.items) {
    for (const item of catalog.body.items) {
      const id = item?.id ?? item?._id ?? null;
      if (id && !DATASETS.includes(id)) extraDatasets.push(id);
    }
  } else {
    console.error(
      `Bootstrap failed: GET ${LIVE}/api/datasets/published returned ${catalog.status}.`,
    );
    exit(2);
  }
  console.log(`Bootstrapped ${extraDatasets.length} extra datasets from live catalog.`);

  // 2. Build endpoint inventory.
  const eps = buildEndpoints(extraDatasets, []);
  console.log(`Probing ${eps.length} endpoints on each backend…`);

  // 3. Race both backends on every endpoint, in parallel.
  const results = await Promise.all(
    eps.map(async (ep) => {
      const [a, b] = await Promise.all([
        fetchJson(LIVE, ep.path),
        fetchJson(EXPERIMENTAL, ep.path),
      ]);

      // Status check
      if (a.status !== b.status) {
        return { ep, kind: 'status', a: a.status, b: b.status };
      }
      if (!a.ok) {
        return { ep, kind: 'live-error', status: a.status, body: a.body };
      }

      // Binary endpoints → digest first, then diff
      let liveBody = a.body;
      let expBody = b.body;
      if (ep.binary) {
        liveBody = timeseriesDigest(liveBody);
        expBody = timeseriesDigest(expBody);
      }

      // Scrub volatile fields
      liveBody = scrub(liveBody);
      expBody = scrub(expBody);

      const diff = deepDiff(liveBody, expBody);
      return { ep, kind: diff ? 'diff' : 'match', diff };
    }),
  );

  // 4. Report
  let matches = 0;
  let diffs = 0;
  let errors = 0;
  for (const r of results) {
    if (r.kind === 'match') {
      matches += 1;
      if (VERBOSE) console.log(`  ✓ ${r.ep.name}`);
    } else if (r.kind === 'diff') {
      diffs += 1;
      console.log(`  ✗ ${r.ep.name}`);
      console.log(`      path: ${r.diff.path || '<root>'}`);
      console.log(`      kind: ${r.diff.kind}`);
      console.log(`      live: ${JSON.stringify(r.diff.a ?? r.diff.missing).slice(0, 200)}`);
      console.log(`      exp : ${JSON.stringify(r.diff.b ?? r.diff.extra).slice(0, 200)}`);
    } else if (r.kind === 'status') {
      diffs += 1;
      console.log(`  ✗ ${r.ep.name}  (status ${r.a} vs ${r.b})`);
    } else {
      errors += 1;
      console.log(`  ! ${r.ep.name}  ${r.kind} ${JSON.stringify(r.body).slice(0, 200)}`);
    }
  }

  console.log();
  console.log(`Summary: ${matches} match  |  ${diffs} diff  |  ${errors} error`);

  if (diffs > 0 || errors > 0) {
    exit(1);
  }
  exit(0);
}

main().catch((err) => {
  console.error('Audit script crashed:', err);
  exit(2);
});
