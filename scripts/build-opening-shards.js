#!/usr/bin/env node
/**
 * Build Opening Shards from lichess_db_puzzle.csv
 *
 * Reads the large Lichess puzzles CSV and writes lightweight JSON shards per OpeningFamily
 * into /public/openings so the client can fetch only what it needs.
 *
 * Usage:
 *   node scripts/build-opening-shards.js --input path/to/lichess_db_puzzle.csv --out public/openings --per 300
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Simple CSV parser for a single line that handles quoted fields
function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Double quote inside quotes -> escaped quote
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
  const out = { input: null, out: null, per: 300, minRating: 0, maxRows: 0 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--input') out.input = args[++i];
    else if (a === '--out') out.out = args[++i];
    else if (a === '--per') out.per = parseInt(args[++i], 10) || out.per;
    else if (a === '--minRating') out.minRating = parseInt(args[++i], 10) || out.minRating;
    else if (a === '--maxRows') out.maxRows = parseInt(args[++i], 10) || out.maxRows;
  }
  if (!out.input || !out.out) {
    console.error('Usage: node scripts/build-opening-shards.js --input path/to/lichess_db_puzzle.csv --out public/openings [--per 300] [--minRating 0] [--maxRows 0]');
    process.exit(1);
  }
  return out;
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
  const groups = new Map(); // key (family/opening/ECO) -> array rows

  // Stats to detect available columns
  const stat = { hasOpeningFamily: 0, hasOpening: 0, hasOpeningVariation: 0, hasECO: 0, total: 0 };

  console.log('Reading CSV and building shards...');

  for await (const line of rl) {
    if (!line) continue;
    if (processed === 0) {
      headers = parseCsvLine(line).map(h => h.trim());
      processed++;
      continue;
    }
    if (opts.maxRows && processed > opts.maxRows) break;

    const cols = parseCsvLine(line);
    if (cols.length !== headers.length) {
      processed++;
      continue; // skip malformed line
    }
    const row = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i];

    // Columns used from Lichess docs (variants supported)
    const rating = parseInt(row.Rating || '0', 10) || 0;
    if (rating < opts.minRating) {
      processed++;
      continue;
    }

    const fen = row.FEN || row.Fen || row.fen || '';
    if (!fen) {
      processed++;
      continue;
    }

    // Only keep rows that are explicitly tagged as opening puzzles
    const themesRaw = row.Themes || row.Theme || '';
    const themesStr = String(themesRaw).toLowerCase();
    const isOpeningTheme = themesStr.includes('opening');
    if (!isOpeningTheme) {
      processed++;
      continue;
    }

    // Determine grouping key with fallbacks
    const openingFamily = row.OpeningFamily || row['Opening Family'] || '';
    const opening = row.Opening || row.OpeningName || row['Opening Name'] || '';
    const openingVariation = row.OpeningVariation || row['Opening Variation'] || '';
    const eco = row.ECO || '';
    const openingTagsRaw = row.OpeningTags || '';

    stat.total++;
    if (openingFamily) stat.hasOpeningFamily++;
    if (opening) stat.hasOpening++;
    if (openingVariation) stat.hasOpeningVariation++;
    if (eco) stat.hasECO++;

    // Try to derive a grouping key from OpeningTags when classic columns are absent
    let derivedFromTags = '';
    if (!openingFamily && !opening && !openingVariation && !eco && openingTagsRaw) {
      // Split tags by common delimiters
      const tags = String(openingTagsRaw)
        .split(/[;|,]/)
        .map(t => t.trim())
        .filter(Boolean);
      // Prefer tags that look like top-level opening names
      const preferredIdx = tags.findIndex(t => /(defense|gambit|attack|game|system|opening)/i.test(t));
      derivedFromTags = preferredIdx >= 0 ? tags[preferredIdx] : (tags[0] || '');
    }

    const key = openingFamily || opening || openingVariation || eco || derivedFromTags;
    if (!key) {
      processed++;
      continue;
    }

    const keep = {
      PuzzleId: row.PuzzleId,
      Fen: fen,
      Moves: row.Moves,
      Rating: rating,
      NbPlays: parseInt(row.NbPlays || '0', 10) || 0,
      Popularity: parseInt(row.Popularity || '0', 10) || 0,
      Themes: row.Themes,
      OpeningFamily: openingFamily,
      Opening: opening,
      OpeningVariation: openingVariation,
      ECO: eco,
      OpeningTags: openingTagsRaw
    };

    if (!groups.has(key)) groups.set(key, []);
    const arr = groups.get(key);
    if (arr.length < opts.per * 3) {
      arr.push(keep);
    }

    processed++;
    if (processed % 100000 === 0) console.log(`Processed ${processed} lines...`);
  }

  console.log(`Headers detected: ${headers.join(', ')}`);
  console.log(`Rows seen: ${stat.total} | with OpeningFamily: ${stat.hasOpeningFamily}, Opening: ${stat.hasOpening}, OpeningVariation: ${stat.hasOpeningVariation}, ECO: ${stat.hasECO}`);

  console.log(`Writing ${groups.size} shards to ${opts.out} ...`);
  const manifest = [];
  for (const [key, rows] of groups.entries()) {
    // Shuffle and trim per group to requested count
    rows.sort(() => Math.random() - 0.5);
    const trimmed = rows.slice(0, opts.per);
    const slug = slugify(key);
    const file = path.join(opts.out, `${slug}.json`);
    fs.writeFileSync(file, JSON.stringify(trimmed));
    manifest.push({ key, slug, count: trimmed.length });
  }
  // Write manifest to help client discover available openings when user data lacks opening names
  try {
    fs.writeFileSync(path.join(opts.out, `manifest.json`), JSON.stringify(manifest, null, 2));
  } catch {}

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});