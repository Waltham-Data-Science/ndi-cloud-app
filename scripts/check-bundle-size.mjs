#!/usr/bin/env node
/**
 * Bundle-size CI gate.
 *
 * Measures "always-loaded initial JS" = rootMainFiles + polyfillFiles from
 * Next 16's build-manifest.json. This is the common floor every page pays
 * before any route-specific chunk loads. Tracking it catches:
 *   - Accidental top-level imports of heavy libs
 *   - Polyfill bloat
 *   - Root layout weight growth (Providers, Analytics, fonts, etc.)
 *
 * Budget: **200 KB gz** (app-route floor per plan, Phase 1 baseline).
 * Ratchets down 10 KB per quarter as `next/dynamic` defers heavy widgets
 * below the fold. This is deliberately a floor, not an aspiration.
 *
 * Phase 6 (verification) refines this with per-route measurements once
 * real routes land. For now, the rootMainFiles measurement is the
 * meaningful metric — placeholder pages don't stress route-level chunks.
 */

import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const NEXT_DIR = join(process.cwd(), 'apps/web/.next');
const BUILD_MANIFEST = join(NEXT_DIR, 'build-manifest.json');

// App routes budget: 200 KB gz. Ratchets down over time (plan Phase 6).
const BUDGET_GZ_BYTES = 200 * 1024;

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

if (!existsSync(NEXT_DIR)) {
  fail('No .next/ build output found. Run `pnpm build` first.');
}

if (!existsSync(BUILD_MANIFEST)) {
  fail('No build-manifest.json in .next/. Next 16 build did not complete as expected.');
}

const manifest = JSON.parse(readFileSync(BUILD_MANIFEST, 'utf-8'));

const rootMain = manifest.rootMainFiles ?? [];
const polyfill = manifest.polyfillFiles ?? [];
const all = [...rootMain, ...polyfill];

if (all.length === 0) {
  fail(
    'build-manifest.json has no rootMainFiles/polyfillFiles. Cannot measure initial JS.',
  );
}

let totalGz = 0;
const perFile = [];
for (const relative of all) {
  const abs = join(NEXT_DIR, relative);
  if (!existsSync(abs)) {
    // Some manifest entries can reference virtual modules; skip silently.
    continue;
  }
  const raw = readFileSync(abs);
  const gz = gzipSync(raw).byteLength;
  totalGz += gz;
  perFile.push({ relative, gz });
}

// Report.
console.log('\nInitial JS (rootMainFiles + polyfillFiles), gzipped:\n');
for (const f of perFile.sort((a, b) => b.gz - a.gz)) {
  const sizeKb = (f.gz / 1024).toFixed(1).padStart(7);
  console.log(`   ${sizeKb} KB   ${f.relative}`);
}

const totalKb = (totalGz / 1024).toFixed(1);
const budgetKb = (BUDGET_GZ_BYTES / 1024).toFixed(0);
const headroom = ((BUDGET_GZ_BYTES - totalGz) / 1024).toFixed(1);

console.log(`\nTotal initial JS: ${totalKb} KB gz`);
console.log(`Budget:           ${budgetKb} KB gz`);
console.log(`Headroom:         ${headroom} KB gz\n`);

if (totalGz > BUDGET_GZ_BYTES) {
  fail(`Over budget by ${(-headroom).toString()} KB.`);
}
ok('Under budget.');
