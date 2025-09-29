#!/usr/bin/env node
/**
 * Build Tactic/Weakness Shards from lichess_db_puzzle.csv
 *
 * Reads the large Lichess puzzles CSV and writes lightweight JSON shards per tactical theme
 * into /public/tactics so the client can fetch only what it needs.
 *
 * Usage:
 *   node scripts/build-tactic-shards.js --input path/to/lichess_db_puzzle.csv --out public/tactics --per 400 --minRating 0 --maxRows 0
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Simple CSV parser that handles quoted fields
function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        result.push(cur);
        cur = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { input: null, out: null, per: 400, minRating: 0, maxRows: 0 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--input') out.input = args[++i];
    else if (a === '--out') out.out = args[++i];
    else if (a === '--per') out.per = parseInt(args[++i], 10) || out.per;
    else if (a === '--minRating') out.minRating = parseInt(args[++i], 10) || out.minRating;
    else if (a === '--maxRows') out.maxRows = parseInt(args[++i], 10) || out.maxRows;
  }
  if (!out.input || !out.out) {
    console.error('Usage: node scripts/build-tactic-shards.js --input path/to/lichess_db_puzzle.csv --out public/tactics [--per 400] [--minRating 0] [--maxRows 0]');
    process.exit(1);
  }
  return out;
}

// Tactical theme mapping from Lichess themes string (lowercased)
const THEME_MAP = [
  { key: 'fork', match: ['fork'] },
  { key: 'pin', match: ['pin'] },
  { key: 'skewer', match: ['skewer'] },
  { key: 'double-attack', match: ['doubleattack', 'double-attack'] },
  { key: 'discovered-attack', match: ['discoveredattack', 'discovered-attack'] },
  { key: 'x-ray', match: ['xray'] },
  { key: 'zwischenzug', match: ['zwischenzug'] },
  { key: 'removal-of-the-defender', match: ['removalofdefender', 'removal-of-the-defender'] },
  { key: 'overload', match: ['overload'] },
  { key: 'back-rank-mate', match: ['backrankmate', 'back-rank-mate'] },
  { key: 'smothered-mate', match: ['smotheredmate', 'smothered-mate'] },
  { key: 'mate-in-1', match: ['matein1'] },
  { key: 'mate-in-2', match: ['matein2'] },
  { key: 'mate-in-3', match: ['matein3'] },
  { key: 'hanging-piece', match: ['hangingpiece'] },
  { key: 'trapped-piece', match: ['trappedpiece'] },
  { key: 'weak-king', match: ['exposedking', 'weakkingsafety', 'weakkingsafety', 'weakkingsafety'] }
];

function normalizeThemesStr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9,;_\- ]+/g, '')
    .replace(/\s+/g, '');
}

function findThemeKeys(themesStr) {
  const t = normalizeThemesStr(themesStr);
  const keys = [];
  for (const m of THEME_MAP) {
    if (m.match.some(s => t.includes(s))) keys.push(m.key);
  }
  return keys;
}

async function main() {
  const opts = parseArgs();
  ensureDirSync(opts.out);

  const rl = readline.createInterface({
    input: fs.createReadStream(opts.input),
    crlfDelay: Infinity
  });

  let headers = [];
  let processed = 0;
  const groups = new Map(); // key -> rows

  // Pre-create empty arrays for each group
  for (const m of THEME_MAP) groups.set(m.key, []);

  console.log('Reading CSV and building tactic shards...');

  for await (const line of rl) {
    if (!line) continue;
    if (processed === 0) {
      headers = parseCsvLine(line).map(h => h.trim());
      processed++;
      continue;
    }
    if (opts.maxRows && processed > opts.maxRows) break;

    const cols = parseCsvLine(line);
    if (cols.length !== headers.length) { processed++; continue; }
    const row = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i];

    const rating = parseInt(row.Rating || '0', 10) || 0;
    if (rating < opts.minRating) { processed++; continue; }

    const fen = row.FEN || row.Fen || row.fen || '';
    if (!fen) { processed++; continue; }

    const themesRaw = row.Themes || row.Theme || '';
    const keys = findThemeKeys(themesRaw);
    if (!keys.length) { processed++; continue; }

    const keep = {
      PuzzleId: row.PuzzleId,
      Fen: fen,
      Moves: row.Moves,
      Rating: rating,
      NbPlays: parseInt(row.NbPlays || '0', 10) || 0,
      Popularity: parseInt(row.Popularity || '0', 10) || 0,
      Themes: row.Themes
    };

    for (const k of keys) {
      const arr = groups.get(k);
      if (arr.length < opts.per * 3) arr.push(keep);
    }

    processed++;
    if (processed % 100000 === 0) console.log(`Processed ${processed} lines...`);
  }

  console.log('Writing shards...');
  const manifest = [];
  for (const [key, rows] of groups.entries()) {
    if (!rows.length) continue;
    rows.sort(() => Math.random() - 0.5);
    const trimmed = rows.slice(0, opts.per);
    const file = path.join(opts.out, `${key}.json`);
    fs.writeFileSync(file, JSON.stringify(trimmed));
    manifest.push({ key, slug: `${key}.json`, count: trimmed.length });
  }
  try {
    fs.writeFileSync(path.join(opts.out, `manifest.json`), JSON.stringify(manifest, null, 2));
  } catch {}

  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });