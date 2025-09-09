#!/usr/bin/env node
/**
 * Combine per-variation opening shards into per-family files.
 *
 * Input: /public/openings contains many files like
 *   "sicilian-defense-sicilian-defense-dragon-variation.json",
 *   and a manifest.json with key and slug fields.
 *
 * Output: For each family (first token of manifest key), write a combined file:
 *   /public/openings/_families/<family-slug>.json
 *   containing a de-duplicated sample across all its variation shards.
 *
 * Usage:
 *   node scripts/build-family-combined.js --openings public/openings --out public/openings/_families --per 500
 */

const fs = require('fs');
const path = require('path');

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { openings: null, out: null, per: 500 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--openings') out.openings = args[++i];
    else if (a === '--out') out.out = args[++i];
    else if (a === '--per') out.per = parseInt(args[++i], 10) || out.per;
  }
  if (!out.openings || !out.out) {
    console.error('Usage: node scripts/build-family-combined.js --openings public/openings --out public/openings/_families [--per 500]');
    process.exit(1);
  }
  return out;
}

function getFamilyFromManifestKey(key) {
  // Manifest key example: "Sicilian_Defense Sicilian_Defense_Dragon_Variation"
  // We treat the first token (before space) as the family: "Sicilian_Defense"
  const first = String(key || '').split(/\s+/)[0] || '';
  return first.replace(/_/g, ' ').trim();
}

function groupByFamily(manifest) {
  const grouped = new Map();
  for (const entry of manifest) {
    const fam = getFamilyFromManifestKey(entry.key);
    if (!fam) continue;
    if (!grouped.has(fam)) grouped.set(fam, []);
    grouped.get(fam).push(entry);
  }
  return grouped;
}

function dedupeByPuzzleId(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const id = r?.PuzzleId || `${r?.ECO || 'OPEN'}_${r?.Fen || ''}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  ensureDirSync(opts.out);

  const manifestPath = path.join(opts.openings, 'manifest.json');
  const manifest = readJsonSafe(manifestPath) || [];
  if (!Array.isArray(manifest) || manifest.length === 0) {
    console.error('No manifest.json found or empty at:', manifestPath);
    process.exit(1);
  }

  const byFamily = groupByFamily(manifest);
  console.log(`Found ${byFamily.size} opening families in manifest`);

  for (const [familyName, entries] of byFamily.entries()) {
    // Load each variation shard, merge, dedupe, shuffle, trim
    let merged = [];
    for (const e of entries) {
      const file = path.join(opts.openings, `${e.slug}.json`);
      const data = readJsonSafe(file);
      if (Array.isArray(data) && data.length) {
        merged.push(...data);
      }
    }

    if (!merged.length) continue;

    // Dedupe by PuzzleId, shuffle, trim
    merged = dedupeByPuzzleId(merged);
    merged.sort(() => Math.random() - 0.5);
    const trimmed = merged.slice(0, opts.per);

    const famSlug = slugify(familyName);
    const outFile = path.join(opts.out, `${famSlug}.json`);
    ensureDirSync(path.dirname(outFile));
    fs.writeFileSync(outFile, JSON.stringify(trimmed));
    console.log(`Wrote ${trimmed.length} puzzles for family ${familyName} -> ${outFile}`);
  }

  console.log('Done building family-combined files.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});