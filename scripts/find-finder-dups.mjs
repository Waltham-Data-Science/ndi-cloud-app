#!/usr/bin/env node
/**
 * Hygiene CI gate: rejects macOS Finder/iCloud duplicate-file artifacts.
 *
 * macOS Finder names duplicates as `Filename 2.ext`, `Filename 3.ext`, etc.
 * iCloud syncs them. They're never intentional and cause subtle bugs (two
 * source files with `apiFetch` etc).
 *
 * Mirrors ndi-data-browser-v2's identical script (PR #76 audit fix #51).
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'coverage', 'playwright-report', 'test-results', '.turbo', '.vercel']);

// Pattern: " 2", " 3", ... before the final extension. Handles dotfiles too.
const DUP_RE = /\s\d+(\.[^./]+)?$/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      yield* walk(abs);
    } else {
      yield abs;
    }
  }
}

const offenders = [];
for (const file of walk(ROOT)) {
  const base = file.split('/').pop();
  if (DUP_RE.test(base)) {
    offenders.push(relative(ROOT, file));
  }
}

if (offenders.length > 0) {
  console.error('❌ Finder duplicate files detected:');
  for (const f of offenders) {
    console.error(`   ${f}`);
  }
  console.error('\nRemove with: rm -i \"' + offenders.join('\" \"') + '\"');
  process.exit(1);
}

console.log('✅ No Finder duplicates found.');
