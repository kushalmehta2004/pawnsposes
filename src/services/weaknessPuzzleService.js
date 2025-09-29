/**
 * Weakness (Tactics) Puzzle Service
 * Loads tactic/weakness-specific puzzles from prebuilt JSON shards in /public/tactics
 * and maps them to the app's puzzle shape (similar to opening/endgame services).
 */

// IndexedDB is not used for Fix My Weaknesses anymore
// import puzzleDataService from './puzzleDataService.js';

function publicUrl(path) {
  const base = (typeof process !== 'undefined' && process.env && process.env.PUBLIC_URL) ? process.env.PUBLIC_URL : '';
  if (base && path.startsWith('/')) return `${base}${path}`;
  return base ? `${base}/${path}` : (path.startsWith('/') ? path : `/${path}`);
}

function slugifyThemeKey(k) {
  return String(k || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '');
}

async function fetchManifest() {
  const url = publicUrl('tactics/manifest.json');
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchThemeShardBySlug(slug) {
  const url = publicUrl(`tactics/${slug}.json`);
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function safeSplitThemes(themes) {
  if (!themes) return [];
  if (Array.isArray(themes)) return themes;
  return String(themes)
    .split(/[;,]/)
    .map(t => t.trim())
    .filter(Boolean);
}

function toAppPuzzle(row, index = 0) {
  // Row shape (from Lichess CSV-derived shards):
  // { PuzzleId, Fen, Moves, Rating, NbPlays, Popularity, Themes }
  const sideToMove = row.Fen?.split(' ')[1] === 'b' ? 'black' : 'white';
  const themes = safeSplitThemes(row.Themes);
  const bestMove = (row.Moves || '').split(' ')[0] || '';
  const primaryTheme = themes[0] || 'Tactical Motif';
  return {
    id: row.PuzzleId || `TACTIC_${index + 1}`,
    position: row.Fen,
    objective: `Find the best move (${primaryTheme}).`,
    solution: bestMove,
    lineUci: (row.Moves || '').trim(),
    sideToMove,
    hint: `Look for forcing moves: checks, captures, threats. (${primaryTheme})`,
    explanation: '',
    difficulty: 'intermediate',
    source: 'lichess_dataset',
    metadata: {
      rating: row.Rating,
      popularity: row.Popularity,
      nbPlays: row.NbPlays,
      themes
    }
  };
}

function normalizeWeaknessTag(s) {
  const t = String(s || '').toLowerCase();
  // Map various weakness labels to shard theme keys
  if (t.includes('fork')) return 'fork';
  if (t.includes('pin')) return 'pin';
  if (t.includes('skewer')) return 'skewer';
  if (t.includes('discover')) return 'discovered-attack';
  if (t.includes('double')) return 'double-attack';
  if (t.includes('back rank') || t.includes('backrank')) return 'back-rank-mate';
  if (t.includes('smother')) return 'smothered-mate';
  if (t.includes('hanging')) return 'hanging-piece';
  if (t.includes('trapped')) return 'trapped-piece';
  if (t.includes('mate in 1') || t.includes('mate-in-1')) return 'mate-in-1';
  if (t.includes('mate in 2') || t.includes('mate-in-2')) return 'mate-in-2';
  if (t.includes('mate in 3') || t.includes('mate-in-3')) return 'mate-in-3';
  if (t.includes('king safety') || t.includes('exposed king') || t.includes('weak king')) return 'weak-king';
  return null;
}

function inferThemeFromMistake(m) {
  // Prefer explicit theme on mistake record
  if (m?.theme) {
    const mapped = normalizeWeaknessTag(m.theme);
    if (mapped) return mapped;
  }
  // Fallback to description-based heuristics
  const d = `${m?.mistakeType || ''} ${m?.description || ''}`;
  const tag = normalizeWeaknessTag(d);
  if (tag) return tag;
  // Coarse mapping by mistake type
  const mt = String(m?.mistakeType || '').toLowerCase();
  if (mt.includes('missed_tactic') || mt.includes('blunder')) return 'hanging-piece';
  if (mt.includes('endgame')) return 'mate-in-2';
  return null;
}

function countBy(arr) {
  const m = new Map();
  for (const a of arr) m.set(a, (m.get(a) || 0) + 1);
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

export default {
  // Fetch a limited number of puzzles for a single weakness theme key
  async getPuzzlesForTheme(themeKey, limit = 10, difficulty = 'easy') {
    const slug = slugifyThemeKey(themeKey);
    // Direct fetch by slug
    let shard = await fetchThemeShardBySlug(slug);
    // If empty, try manifest contains match
    if (!shard.length) {
      const manifest = await fetchManifest();
      const norm = slug;
      const match = (manifest || []).find(m => String(m.key || '').toLowerCase() === norm || String(m.slug || '').toLowerCase() === `${norm}.json`);
      if (match) shard = await fetchThemeShardBySlug(match.key);
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
      .slice(0, Math.min(limit * 2, 200))
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(limit, pool.length))
      .map((row, i) => toAppPuzzle(row, i))
      // Set difficulty label
      .map(p => ({ ...p, difficulty }));
    return trimmed;
  },

  // Build a combined set of tactic puzzles purely from shards (no IndexedDB)
  async getWeaknessPuzzlesForUser(username, maxPuzzles = 10) {
    // Use a balanced default theme set; username is only for logging elsewhere
    const defaults = ['fork', 'pin', 'hanging-piece', 'mate-in-2'];

    const per = Math.max(2, Math.ceil(maxPuzzles / defaults.length));
    const batches = await Promise.all(defaults.map(t => this.getPuzzlesForTheme(t, per)));
    const buckets = batches.filter(b => b && b.length).map(b => [...b]);
    if (!buckets.length) return [];

    // Interleave to avoid grouping by same theme
    const result = [];
    let idx = 0;
    while (result.length < maxPuzzles) {
      let placed = false;
      for (let i = 0; i < buckets.length && result.length < maxPuzzles; i++) {
        const b = buckets[(idx + i) % buckets.length];
        if (b && b.length) { result.push({ ...b.shift(), source: 'weakness_dataset' }); placed = true; }
      }
      if (!placed) break;
      idx++;
    }
    return result.slice(0, maxPuzzles);
  }
};