#!/usr/bin/env node
/**
 * Bundle-size CI gate (with ratchet).
 *
 * Measures "always-loaded initial JS" = rootMainFiles + polyfillFiles from
 * Next 16's build-manifest.json. This is the common floor every page pays
 * before any route-specific chunk loads. Tracking it catches:
 *   - Accidental top-level imports of heavy libs
 *   - Polyfill bloat
 *   - Root layout weight growth (Providers, Analytics, fonts, etc.)
 *
 * Two budgets enforced:
 *   1. **Hard ceiling**: 200 KB gz (Phase 1 plan baseline; never raise).
 *      Defense-in-depth — if the baseline file goes missing, the ceiling
 *      still protects. Catches catastrophic regressions immediately.
 *   2. **Ratchet baseline**: most-recent-passing build's byte count, persisted
 *      in `apps/web/.bundle-size-baseline.json`. Cannot grow without an
 *      explicit `--update` commit. Catches *any* size growth, not just the
 *      ones that punch through the hard ceiling.
 *
 * Phase 6.7 A2 (2026-04-26) introduced the ratchet. Before this, the hard
 * 200 KB ceiling was the only check, which gave ~30 KB silent headroom for
 * accidental growth. Ratchet replaces that headroom with explicit intent.
 *
 * ## Usage
 *
 *   pnpm bundle-size            # Check current build vs baseline (CI)
 *   pnpm bundle-size --update   # Write current size to the baseline file
 *
 * ### When to use --update
 *
 * - **Intentional growth** (e.g., adding a new feature that requires a
 *   library): include `--update` in the same PR that adds the feature.
 *   Reviewer sees the baseline diff alongside the code change and can
 *   judge whether the size cost is worth it.
 * - **Win locked in** (e.g., a refactor reduces bundle): include `--update`
 *   in the same PR so the win can't silently regress later.
 *
 * The baseline file is human-readable JSON with comments-as-fields so a
 * `git blame` on it shows why each baseline change happened.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const NEXT_DIR = join(process.cwd(), 'apps/web/.next');
const BUILD_MANIFEST = join(NEXT_DIR, 'build-manifest.json');
const BASELINE_FILE = join(process.cwd(), 'apps/web/.bundle-size-baseline.json');

// Hard ceiling — never raise. Catches catastrophic regressions even if the
// baseline file is corrupted, missing, or accidentally inflated.
const HARD_CEILING_GZ_BYTES = 200 * 1024;

// Parse args: --update flag rewrites the baseline.
const updateMode = process.argv.includes('--update');

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function info(msg) {
  console.log(`ℹ️  ${msg}`);
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

// --- Read baseline ---
// Fail loudly if the baseline file is missing or malformed — the ratchet's
// whole point is that the byte count is checked-in source of truth.
if (!existsSync(BASELINE_FILE)) {
  fail(
    `Missing baseline file at ${BASELINE_FILE}. Run with --update to initialize it.`,
  );
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));
} catch (e) {
  fail(`Could not parse baseline file ${BASELINE_FILE}: ${e.message}`);
}

const baselineBytes = baseline.rootMainGzBytes ?? 0;

// --- Report ---
console.log('\nInitial JS (rootMainFiles + polyfillFiles), gzipped:\n');
for (const f of perFile.sort((a, b) => b.gz - a.gz)) {
  const sizeKb = (f.gz / 1024).toFixed(1).padStart(7);
  console.log(`   ${sizeKb} KB   ${f.relative}`);
}

const totalKb = (totalGz / 1024).toFixed(1);
const baselineKb = (baselineBytes / 1024).toFixed(1);
const ceilingKb = (HARD_CEILING_GZ_BYTES / 1024).toFixed(0);
const headroomVsCeiling = ((HARD_CEILING_GZ_BYTES - totalGz) / 1024).toFixed(1);
const deltaVsBaseline = totalGz - baselineBytes;
const deltaKb = (deltaVsBaseline / 1024).toFixed(2);

console.log(`\nTotal initial JS: ${totalKb} KB gz (${totalGz} bytes)`);
console.log(`Baseline:         ${baselineKb} KB gz (${baselineBytes} bytes)`);
console.log(`Hard ceiling:     ${ceilingKb} KB gz`);
console.log(
  `Delta vs baseline:${deltaVsBaseline >= 0 ? ' +' : ' '}${deltaKb} KB`,
);
console.log(`Headroom vs ceiling: ${headroomVsCeiling} KB\n`);

// --- --update path: write new baseline + exit ---
if (updateMode) {
  if (totalGz > HARD_CEILING_GZ_BYTES) {
    fail(
      `Refusing to update baseline: current size (${totalKb} KB) exceeds hard ceiling (${ceilingKb} KB). Shrink the bundle first, then re-run --update.`,
    );
  }

  // Preserve the leading underscore-comment fields; bump the timestamp.
  const today = new Date().toISOString().slice(0, 10);
  const next = {
    _comment: baseline._comment,
    _updated: today,
    _context: baseline._context,
    rootMainGzBytes: totalGz,
  };
  writeFileSync(BASELINE_FILE, JSON.stringify(next, null, 2) + '\n');
  ok(`Updated baseline → ${totalKb} KB gz (${totalGz} bytes). Commit this file.`);
  process.exit(0);
}

// --- Check path: enforce ratchet + ceiling ---

// 1. Hard ceiling.
if (totalGz > HARD_CEILING_GZ_BYTES) {
  fail(
    `Hard ceiling exceeded: ${totalKb} KB > ${ceilingKb} KB. Bundle MUST be shrunk before this can land.`,
  );
}

// 2. Ratchet baseline. Allow shrink (deltaVsBaseline ≤ 0); reject growth.
if (deltaVsBaseline > 0) {
  fail(
    `Ratchet baseline exceeded by ${deltaKb} KB (current ${totalKb} KB > baseline ${baselineKb} KB).
   If this growth is intentional, run \`pnpm bundle-size --update\` and commit the new baseline.
   If unintentional, investigate (look for accidental top-level imports of heavy libs).`,
  );
}

// 3. Shrink hint — friendly nudge to lock in the win, but not a failure.
if (deltaVsBaseline < 0) {
  info(
    `Bundle shrunk by ${(-deltaVsBaseline / 1024).toFixed(2)} KB vs baseline. Consider running \`pnpm bundle-size --update\` to lock it in.`,
  );
}

ok(
  deltaVsBaseline === 0
    ? `At baseline (${totalKb} KB gz).`
    : `Under baseline by ${(-deltaVsBaseline / 1024).toFixed(2)} KB (${totalKb} KB gz).`,
);
