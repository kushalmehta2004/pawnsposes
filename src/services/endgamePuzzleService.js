/**
 * Endgame Puzzle Service
 * Loads endgame-specific puzzles from prebuilt JSON in /public/endgames
 * and maps them to the app's puzzle shape (similar to openingPuzzleService).
 */

function publicUrl(path) {
  const base = (typeof process !== 'undefined' && process.env && process.env.PUBLIC_URL) ? process.env.PUBLIC_URL : '';
  if (base && path.startsWith('/')) return `${base}${path}`;
  return base ? `${base}/${path}` : (path.startsWith('/') ? path : `/${path}`);
}

async function fetchEndgameSet(slug) {
  const url = publicUrl(`endgames/${slug}.json`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Endgame] Failed to load shard ${slug}: status ${res.status} @ ${url}`);
      return [];
    }
    const data = await res.json();
    console.log(`[Endgame] Loaded shard ${slug}: ${Array.isArray(data) ? data.length : 0} rows @ ${url}`);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn(`[Endgame] Error fetching shard ${slug} @ ${url}`, e);
    return [];
  }
}

async function fetchManifest() {
  const url = publicUrl('endgames/manifest.json');
  try {
    console.log(`[Endgame] Fetching manifest @ ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Endgame] Manifest not found: status ${res.status}`);
      return [];
    }
    const data = await res.json();
    console.log(`[Endgame] Manifest entries: ${Array.isArray(data) ? data.length : 0}`);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[Endgame] Error fetching manifest', e);
    return [];
  }
}

import { Chess } from 'chess.js';

function toAppPuzzle(row, index = 0) {
  const originalFen = row.Fen;
  const originalSide = originalFen?.split(' ')[1] === 'b' ? 'black' : 'white';
  const theme = row.Themes || row.Theme || 'Endgame Technique';

  const tokens = String(row.Moves || '').trim().split(/\s+/).filter(Boolean);

  let position = originalFen;
  let sideToMove = originalSide;
  let lineUci = tokens.join(' ');
  let bestMove = tokens[0] || '';

  // Shift one ply so the opponent moves first, and user plays second
  // Only if there are at least two tokens to avoid breaking mate-in-1 puzzles
  if (tokens.length >= 2 && originalFen) {
    try {
      const engine = new Chess(originalFen);
      const first = tokens[0];
      if (/^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(first)) {
        const from = first.slice(0, 2);
        const to = first.slice(2, 4);
        const prom = first.length > 4 ? first[4] : undefined;
        const moved = engine.move({ from, to, promotion: prom });
        if (moved) {
          position = engine.fen();
          sideToMove = originalSide === 'white' ? 'black' : 'white';
          bestMove = tokens[1];
          lineUci = tokens.slice(1).join(' ');
        }
      }
    } catch (_) {
      // Fallback to original if any error
    }
  }

  return {
    id: row.PuzzleId || `END_${index + 1}`,
    position,
    objective: row.Objective || `Find the best move in this endgame (${theme}).`,
    solution: bestMove,
    lineUci,
    sideToMove,
    hint: row.Hint || 'Think in terms of opposition, zugzwang, or promotion races.',
    explanation: row.Explanation || 'From curated endgame data set.',
    endgameTheme: theme,
    difficulty: 'intermediate',
    source: 'endgame_dataset',
    metadata: {
      rating: row.Rating || null,
      themes: Array.isArray(row.Themes) ? row.Themes : String(row.Themes || theme).split(/[;,]/).map(s => s.trim()).filter(Boolean)
    }
  };
}

export default {
  // Load endgame sets using manifest and priority themes
  async getEndgamePuzzles(maxPuzzles = 10) {
    const manifest = await fetchManifest();
    const priorities = [
      'rook-endgame',
      'pawn-endgame',
      'bishop-endgame',
      'knight-endgame',
      'queen-endgame',
      'queen-rook-endgame',
      'zugzwang',
      'mate-in-1',
      'mate-in-2',
      'mate-in-3',
      'endgame'
    ];
    const byKey = new Map((manifest || []).map(m => [String(m?.key || '').toLowerCase(), m]));
    const selected = [];
    for (const k of priorities) {
      const entry = byKey.get(k);
      if (entry) selected.push(entry);
    }
    if (!selected.length && manifest && manifest.length) selected.push(...manifest);

    const batches = await Promise.all(selected.map(e => fetchEndgameSet(e.key)));
    const rows = batches.flat();
    rows.sort(() => Math.random() - 0.5);
    const take = rows.slice(0, maxPuzzles);
    return take.map((r, i) => toAppPuzzle(r, i));
  }
};