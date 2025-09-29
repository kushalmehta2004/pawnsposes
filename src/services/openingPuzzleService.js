/**
 * Opening Puzzle Service
 * Loads opening-specific puzzles from prebuilt JSON shards in /public/openings
 * and maps them to the app's puzzle shape without affecting existing systems.
 */

import puzzleDataService from './puzzleDataService.js';

function slugifyOpening(name) {
  // Normalize possessives/apostrophes and punctuation to match our file slugs
  const cleaned = String(name || '')
    .replace(/[’']/g, '') // remove apostrophes
    .replace(/\b([a-zA-Z]+)'s\b/g, '$1s'); // just in case, convert possessive to plural
  return cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function safeSplitThemes(themes) {
  if (!themes) return [];
  if (Array.isArray(themes)) return themes;
  // Lichess themes may be comma or semicolon separated
  return String(themes)
    .split(/[;,]/)
    .map(t => t.trim())
    .filter(Boolean);
}

// Normalize full opening names to base family names (aligned with ReportDisplay.js)
function getBaseOpeningName(fullName) {
  const name = (fullName || '').toString()
    .replace(/’/g, "'")
    .replace(/\u2019/g, "'");

  if (name.includes("Queen's Gambit") || name.includes('Queens Gambit')) return "Queen's Gambit";
  if (name.includes('Italian Game')) return 'Italian Game';
  if (name.includes('Sicilian Defense') || name.includes('Sicilian')) return 'Sicilian Defense';
  if (name.includes('Ruy Lopez')) return 'Ruy Lopez';
  if (name.includes('French Defense')) return 'French Defense';
  if (name.includes('Caro Kann')) return 'Caro-Kann Defense';
  if (name.includes('Scandinavian')) return 'Scandinavian Defense';
  if (name.includes('London System')) return 'London System';
  if (name.includes("King's Indian") || name.includes('Kings Indian')) return "King's Indian Defense";
  if (name.includes("Queen's Indian") || name.includes('Queens Indian')) return "Queen's Indian Defense";
  if (name.includes('Nimzo Indian')) return 'Nimzo-Indian Defense';
  if (name.includes('English Opening')) return 'English Opening';
  if (name.includes('Four Knights')) return 'Four Knights Game';
  if (name.includes('Scotch Game') || name.includes('Scotch')) return 'Scotch Game';
  if (name.includes('Vienna Game')) return 'Vienna Game';
  if (name.includes("King's Pawn") || name.includes('Kings Pawn')) return "King's Pawn Game";
  if (name.includes("Queen's Pawn") || name.includes('Queens Pawn')) return "Queen's Pawn Game";
  if (name.includes('Indian Game')) return 'Indian Game';
  if (name.includes('Center Game')) return 'Center Game';
  if (name.includes("Bishop's Opening") || name.includes('Bishops Opening')) return "Bishop's Opening";

  const words = name.split(' ');
  if (words.length >= 2) return words.slice(0, 2).join(' ');
  return name;
}

function publicUrl(path) {
  const base = (typeof process !== 'undefined' && process.env && process.env.PUBLIC_URL) ? process.env.PUBLIC_URL : '';
  // Ensure we don't end up with double slashes
  if (base && path.startsWith('/')) return `${base}${path}`;
  return base ? `${base}/${path}` : (path.startsWith('/') ? path : `/${path}`);
}

async function fetchOpeningShard(openingName) {
  const slug = slugifyOpening(openingName);
  const url = publicUrl(`openings/${slug}.json`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Opening shard not found or failed to load: ${url} (status ${res.status})`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn(`Failed to fetch opening shard: ${url}`, e);
    return [];
  }
}

let manifestCache = null;

async function fetchManifest() {
  if (manifestCache) return manifestCache;
  const url = publicUrl('openings/manifest.json');
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Opening manifest not found or failed to load: ${url} (status ${res.status})`);
      manifestCache = [];
      return manifestCache;
    }
    const data = await res.json();
    manifestCache = Array.isArray(data) ? data : [];
    return manifestCache;
  } catch (e) {
    console.warn(`Failed to fetch opening manifest: ${url}`, e);
    manifestCache = [];
    return manifestCache;
  }
}

function normalizeForMatch(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[:]/g, ' ')
    .replace(/\s+/g, '_') // spaces to underscores like manifest keys
    .replace(/[^a-z0-9_]+/g, '')
    .trim();
}

async function resolveManifestMatches(openingName, max = 3) {
  const manifest = await fetchManifest();
  if (!manifest || !manifest.length) return [];
  const norm = normalizeForMatch(openingName);
  // Prefer keys that start with the family name; fallback to contains
  const scored = manifest.map(m => {
    const key = String(m.key || '').toLowerCase();
    let score = 0;
    if (key.startsWith(norm)) score = 3;
    else if (key.includes(norm)) score = 1;
    return { m, score };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.m.count || 0) - (a.m.count || 0));
  return scored.slice(0, max).map(x => x.m);
}

async function fetchOpeningShardBySlug(slug) {
  const url = publicUrl(`openings/${slug}.json`);
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function toAppPuzzle(row, index = 0) {
  // Row expected shape from shard builder (based on Lichess CSV):
  // { PuzzleId, Fen, Moves, Rating, NbPlays, Popularity, Themes, OpeningFamily, OpeningVariation, ECO }
  const sideToMove = row.Fen?.split(' ')[1] === 'b' ? 'black' : 'white';
  const themes = safeSplitThemes(row.Themes);
  const bestMove = (row.Moves || '').split(' ')[0] || '';
  const openingName = row.Opening || row.OpeningFamily || row.OpeningVariation || row.ECO || null;
  return {
    id: row.PuzzleId || `${row.ECO || 'OPEN'}_${index + 1}`,
    position: row.Fen,
    objective: openingName ? `Find the best move in this ${openingName} position.` : 'Find the best move in this opening position.',
    solution: bestMove,
    // Full move sequence (UCI tokens, space-separated) for auto-reply support
    lineUci: (row.Moves || '').trim(),
    sideToMove,
    hint: openingName ? `Key idea from ${openingName}.` : 'Use typical opening principles.',
    explanation: openingName ? `Puzzle sourced from Lichess dataset, ${openingName}.` : 'Puzzle sourced from Lichess dataset.',
    opening: openingName,
    difficulty: 'intermediate',
    source: 'lichess_dataset',
    metadata: {
      rating: row.Rating,
      popularity: row.Popularity,
      nbPlays: row.NbPlays,
      themes,
      eco: row.ECO || null,
      openingVariation: row.OpeningVariation || null
    }
  };
}

function extractOpeningNameFromGame(game) {
  // Try various places where opening info might exist in stored game
  const raw = game?.rawGameData || game || {};
  return (
    raw?.opening?.name ||
    raw?.opening ||
    raw?.analysisData?.opening?.name ||
    raw?.headers?.Opening ||
    raw?.pgnOpening ||
    raw?.ecoName ||
    null
  );
}

function countBy(arr) {
  const m = new Map();
  for (const a of arr) m.set(a, (m.get(a) || 0) + 1);
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

export default {
  // Determine user's top opening families from stored games
  async getUserTopOpenings(username, maxFamilies = 5) {
    const games = await puzzleDataService.getUserGames(username, 200);
    const names = games
      .map(g => extractOpeningNameFromGame(g))
      .filter(Boolean)
      .map(n => getBaseOpeningName(String(n).replace(/:.+$/, '').trim())); // normalize to family
    if (!names.length) return [];
    return countBy(names).slice(0, maxFamilies).map(([name]) => name);
  },

  // Fetch a limited number of puzzles for a single opening name
  async getPuzzlesForOpening(openingName, limit = 10, difficulty = 'easy') {
    // 0) Prefer combined family file if available: /openings/_families/<family>.json
    const famSlug = slugifyOpening(String(openingName).replace(/:.+$/, '').trim());
    let shard = [];
    try {
      const familyUrl = publicUrl(`openings/_families/${famSlug}.json`);
      const res = await fetch(familyUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length) shard = data;
      }
    } catch {}

    // 1) If still empty, try direct per-variation shard from plain opening name
    if (!shard.length) {
      shard = await fetchOpeningShard(openingName);
    }

    // 2) If empty, try to resolve via manifest (handles different naming like "Family Family_Variation")
    if (!shard.length) {
      const matches = await resolveManifestMatches(openingName, 3);
      for (const m of matches) {
        shard = await fetchOpeningShardBySlug(m.slug);
        if (shard.length) break;
      }
    }

    if (!shard.length) return [];

    // Filter by difficulty based on rating
    const ratingRanges = {
      easy: { min: 2000, max: 2300 },
      medium: { min: 2300, max: 2700 },
      hard: { min: 2700, max: Infinity }
    };
    const range = ratingRanges[difficulty] || ratingRanges.easy;
    const filtered = shard.filter(row => {
      const r = parseInt(row.Rating || row.rating || '0', 10);
      return r >= range.min && r <= range.max;
    });

    const pool = filtered.length ? filtered : shard; // fallback to all if no matches

    const trimmed = pool
      .slice(0, Math.min(limit * 2, 200)) // sample a bit more, then shuffle
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(limit, pool.length))
      .map((row, i) => toAppPuzzle(row, i))
      .map(p => ({ ...p, difficulty }));
    return trimmed;
  },

  // Build a combined set of opening puzzles for a user
  async getOpeningPuzzlesForUser(username, maxPuzzles = 10) {
    // Only use TOP 3 opening families from user's games
    let openings = await this.getUserTopOpenings(username, 3);

    // If no user openings, try manifest of available shards (fallback)
    if (!openings.length) {
      const manifest = await fetchManifest();
      // Take first 3 families by manifest key order
      openings = (manifest || []).map(m => String(m.key).split(' ')[0].replace(/_/g, ' ')).slice(0, 3);
    }

    if (!openings.length) return [];

    const per = Math.max(2, Math.ceil(maxPuzzles / openings.length));
    const batches = await Promise.all(openings.map(name => this.getPuzzlesForOpening(name, per)));

    // Filter out empties
    const nonEmpty = batches.filter(b => b && b.length);
    if (!nonEmpty.length) return [];

    // Interleave by opening to avoid grouping
    const result = [];
    let idx = 0;
    const buckets = nonEmpty.map(b => [...b]);
    while (result.length < maxPuzzles) {
      let placed = false;
      for (let i = 0; i < buckets.length && result.length < maxPuzzles; i++) {
        const b = buckets[(idx + i) % buckets.length];
        if (b && b.length) {
          result.push(b.shift());
          placed = true;
        }
      }
      if (!placed) break;
      idx++;
    }
    return result.slice(0, maxPuzzles);
  }
};