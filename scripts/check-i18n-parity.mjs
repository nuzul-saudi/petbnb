#!/usr/bin/env node
// i18n parity check. Compares src/locales/ar.json against
// src/locales/en.json:
//   - same set of flattened keys
//   - no empty string values on either side
//   - every t('…') / t("…") reference in src/ matches a key that
//     actually exists in BOTH locales
//
// Exits non-zero on any failure. Wired into the CI workflow so a
// missing locale entry fails the build before it can hit production.
//
// Pure Node — no dependencies. Walks the source tree itself rather
// than relying on ESLint/jscodeshift.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const AR_PATH = join(SRC, 'locales', 'ar.json');
const EN_PATH = join(SRC, 'locales', 'en.json');

const failures = [];

// ---------------------------------------------------------------------------
// 1. Load both locales, flatten to dotted keys.
// ---------------------------------------------------------------------------

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key, out);
    } else {
      out.set(key, v);
    }
  }
  return out;
}

const ar = flatten(JSON.parse(readFileSync(AR_PATH, 'utf8')));
const en = flatten(JSON.parse(readFileSync(EN_PATH, 'utf8')));

// ---------------------------------------------------------------------------
// 2. Key-set parity.
// ---------------------------------------------------------------------------

const arKeys = new Set(ar.keys());
const enKeys = new Set(en.keys());

const missingFromEn = [...arKeys].filter((k) => !enKeys.has(k));
const missingFromAr = [...enKeys].filter((k) => !arKeys.has(k));

if (missingFromEn.length > 0) {
  failures.push(
    `Keys in ar.json but missing from en.json (${missingFromEn.length}):\n  ` +
      missingFromEn.sort().join('\n  '),
  );
}
if (missingFromAr.length > 0) {
  failures.push(
    `Keys in en.json but missing from ar.json (${missingFromAr.length}):\n  ` +
      missingFromAr.sort().join('\n  '),
  );
}

// ---------------------------------------------------------------------------
// 3. No empty values on either side.
// ---------------------------------------------------------------------------

const emptyAr = [...ar.entries()]
  .filter(([, v]) => typeof v === 'string' && v.trim() === '')
  .map(([k]) => k);
const emptyEn = [...en.entries()]
  .filter(([, v]) => typeof v === 'string' && v.trim() === '')
  .map(([k]) => k);

if (emptyAr.length > 0) {
  failures.push(
    `Empty values in ar.json (${emptyAr.length}):\n  ` + emptyAr.sort().join('\n  '),
  );
}
if (emptyEn.length > 0) {
  failures.push(
    `Empty values in en.json (${emptyEn.length}):\n  ` + emptyEn.sort().join('\n  '),
  );
}

// ---------------------------------------------------------------------------
// 4. Every t('…') in src/ resolves to an existing key in BOTH locales.
//    Dynamic keys (template literals, variable interpolation) get skipped
//    — they can't be checked statically.
// ---------------------------------------------------------------------------

const T_CALL = /\bt\(\s*(['"`])([a-zA-Z0-9_.]+)\1/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

const referenced = new Map(); // key → list of "file:line"

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  // Skip the locale JSON imports themselves.
  let m;
  T_CALL.lastIndex = 0;
  while ((m = T_CALL.exec(src)) !== null) {
    const key = m[2];
    const line = src.slice(0, m.index).split('\n').length;
    if (!referenced.has(key)) referenced.set(key, []);
    referenced.get(key).push(`${file.replace(ROOT + '/', '')}:${line}`);
  }
}

const undefinedRefs = [];
for (const [key, sites] of referenced) {
  if (!arKeys.has(key) || !enKeys.has(key)) {
    undefinedRefs.push(`${key}  (${sites.slice(0, 2).join(', ')}${sites.length > 2 ? ', …' : ''})`);
  }
}

if (undefinedRefs.length > 0) {
  failures.push(
    `t('…') references with no matching locale key (${undefinedRefs.length}):\n  ` +
      undefinedRefs.sort().join('\n  '),
  );
}

// ---------------------------------------------------------------------------
// 5. Report.
// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(
    `i18n parity OK — ${arKeys.size} keys, ${referenced.size} referenced from code.`,
  );
  process.exit(0);
}

console.error('i18n parity check FAILED:\n');
for (const f of failures) {
  console.error(`• ${f}\n`);
}
process.exit(1);
