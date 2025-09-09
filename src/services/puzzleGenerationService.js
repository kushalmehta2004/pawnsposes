/**
 * Puzzle Generation Service
 * Generates targeted puzzles based on user's stored mistakes and weaknesses
 */

import puzzleDataService from './puzzleDataService.js';
import openingPuzzleService from './openingPuzzleService.js';
import { MISTAKE_TYPES, TACTICAL_THEMES, PUZZLE_CATEGORIES, DIFFICULTY_LEVELS } from '../utils/dataModels.js';

class PuzzleGenerationService {
  constructor() {
    this.isGenerating = false;
  }

  // Interleave items by key so successive items with same key are spaced out
  _interleaveByGame(items, limit, keyFn) {
    if (!Array.isArray(items) || items.length === 0) return [];

    // Group by key
    const groups = new Map();
    for (const item of items) {
      const k = keyFn(item) || `nogame:${Math.random()}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(item);
    }

    // Sort groups by size descending to spread larger groups first
    const buckets = Array.from(groups.values()).sort((a, b) => b.length - a.length);

    const result = [];
    let idx = 0;
    while (result.length < Math.min(limit, items.length)) {
      let placed = false;
      for (let i = 0; i < buckets.length && result.length < limit; i++) {
        const bucket = buckets[(idx + i) % buckets.length];
        if (bucket && bucket.length > 0) {
          // Avoid placing same-key consecutively
          const candidate = bucket[0];
          const last = result[result.length - 1];
          const candidateKey = keyFn(candidate) || '';
          const lastKey = last ? (keyFn(last) || '') : '';
          if (candidateKey && candidateKey === lastKey && bucket.length > 1) {
            // try next in bucket
            const next = bucket.find(x => (keyFn(x) || '') !== lastKey) || candidate;
            const idxInBucket = bucket.indexOf(next);
            if (idxInBucket > -1) bucket.splice(idxInBucket, 1);
            result.push(next);
          } else {
            bucket.shift();
            result.push(candidate);
          }
          placed = true;
        }
      }
      if (!placed) break; // nothing left to place
      idx++;
      // Remove empty buckets
      for (let i = buckets.length - 1; i >= 0; i--) if (buckets[i].length === 0) buckets.splice(i, 1);
      if (buckets.length === 0) break;
    }

    // Final shuffle to add randomness without breaking interleave too much
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      // Avoid swapping into same-key adjacency if possible
      if (i > 0 && j > 0) {
        const ki = keyFn(result[i]) || '';
        const kj = keyFn(result[j]) || '';
        const prevKi = keyFn(result[i - 1]) || '';
        const prevKj = keyFn(result[j - 1]) || '';
        if ((ki === prevKj) || (kj === prevKi)) continue;
      }
      const tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }

    return result.slice(0, limit);
  }

  /**
   * Generate puzzles for "Fix My Weaknesses" based on recurring mistake patterns
   */
  async generateWeaknessPuzzles(username, options = {}) {
    const { maxPuzzles = 10, difficulty = 'intermediate' } = options;
    
    console.log(`🧩 Generating weakness puzzles for ${username}...`);
    
    try {
      // Get stored mistakes from database
      const allMistakes = await puzzleDataService.getUserMistakes(username);
      
      console.log(`📊 Found ${allMistakes?.length || 0} stored mistakes for ${username}`);
      
      if (!allMistakes || allMistakes.length === 0) {
        console.warn('⚠️ No stored mistakes found - using fallback puzzles');
        const fallbackPuzzles = this.generateFallbackPuzzles('fix-weaknesses', maxPuzzles);
        fallbackPuzzles.forEach(puzzle => {
          puzzle.source = 'fallback';
          puzzle.debugInfo = 'No stored mistakes found';
        });
        return fallbackPuzzles;
      }

      // Group mistakes by type to find patterns
      const mistakeGroups = this.groupMistakesByType(allMistakes);
      
      console.log(`🔍 Mistake groups:`, Object.keys(mistakeGroups).map(type => 
        `${type}: ${mistakeGroups[type].length} mistakes`
      ));
      
      // Generate puzzles for the most common mistake types
      const puzzles = [];
      const sortedMistakeTypes = Object.entries(mistakeGroups)
        .sort(([,a], [,b]) => b.length - a.length)
        .slice(0, 5); // Top 5 mistake types

      for (const [mistakeType, mistakes] of sortedMistakeTypes) {
        const remaining = maxPuzzles - puzzles.length;
        if (remaining <= 0) break;
        const perType = Math.max(1, Math.ceil(maxPuzzles / sortedMistakeTypes.length));
        const take = Math.min(perType, remaining);
        const puzzlesForType = await this.generatePuzzlesForMistakeType(
          mistakeType, 
          mistakes, 
          take,
          difficulty
        );
        puzzles.push(...puzzlesForType);
      }

      console.log(`✅ Generated ${puzzles.length} weakness puzzles from stored mistakes`);
      return puzzles;
      
    } catch (error) {
      console.error('❌ Error generating weakness puzzles:', error);
      return this.generateFallbackPuzzles('fix-weaknesses', maxPuzzles);
    }
  }

  /**
   * Generate puzzles for "Learn From My Mistakes" based on actual game positions
   */
  async generateMistakePuzzles(username, options = {}) {
    const { maxPuzzles = 10, difficulty = 'intermediate' } = options;
    
    console.log(`🧩 Generating mistake-based puzzles for ${username}...`);
    
    try {
      // Get stored mistakes with position data
      const mistakes = await puzzleDataService.getUserMistakes(username);
      
      console.log(`📊 Found ${mistakes?.length || 0} stored mistakes for ${username}`);
      
      if (!mistakes || mistakes.length === 0) {
        console.warn('⚠️ No stored mistakes found - using fallback puzzles');
        const fallbackPuzzles = this.generateFallbackPuzzles('learn-mistakes', maxPuzzles);
        fallbackPuzzles.forEach(puzzle => {
          puzzle.source = 'fallback';
          puzzle.debugInfo = 'No stored mistakes found';
        });
        return fallbackPuzzles;
      }

      // Filter mistakes that have valid FEN positions
      const mistakesWithPositions = mistakes.filter(mistake => 
        mistake.fen && mistake.correctMove
      );

      console.log(`🎯 Found ${mistakesWithPositions.length} mistakes with valid positions`);

      if (mistakesWithPositions.length === 0) {
        console.warn('⚠️ No mistakes with valid positions found - using fallback puzzles');
        const fallbackPuzzles = this.generateFallbackPuzzles('learn-mistakes', maxPuzzles);
        fallbackPuzzles.forEach(puzzle => {
          puzzle.source = 'fallback';
          puzzle.debugInfo = 'No mistakes with valid positions';
        });
        return fallbackPuzzles;
      }

      // Randomize and interleave by game to avoid consecutive from the same game
      const orderedMistakes = this._interleaveByGame(
        [...mistakesWithPositions].sort(() => Math.random() - 0.5),
        maxPuzzles,
        (m) => m.gameId || m.game_id || m.game || m.gameNumber || null
      );
      const puzzles = orderedMistakes.map((mistake, index) => this.convertMistakeToPuzzle(mistake, index + 1));

      console.log(`✅ Generated ${puzzles.length} mistake-based puzzles from your games`);
      return puzzles;
      
    } catch (error) {
      console.error('❌ Error generating mistake puzzles:', error);
      return this.generateFallbackPuzzles('learn-mistakes', maxPuzzles);
    }
  }

  /**
   * Generate opening puzzles based on user's opening repertoire
   */
  async generateOpeningPuzzles(username, options = {}) {
    const { maxPuzzles = 10, difficulty = 'intermediate', preferredFamilies = null } = options;
    
    console.log(`🧩 Generating opening puzzles for ${username} (STRICT to most played openings)...`);
    
    try {
      // If caller provides explicit families, honor them strictly
      if (Array.isArray(preferredFamilies) && preferredFamilies.length) {
        const top = preferredFamilies.slice(0, 3);
        const per = Math.max(2, Math.ceil(maxPuzzles / top.length));
        const batches = await Promise.all(top.map(name => openingPuzzleService.getPuzzlesForOpening(name, per)));
        const buckets = batches.filter(b => b && b.length).map(b => [...b]);
        const result = [];
        let idx = 0;
        while (result.length < maxPuzzles) {
          let placed = false;
          for (let i = 0; i < buckets.length && result.length < maxPuzzles; i++) {
            const b = buckets[(idx + i) % buckets.length];
            if (b && b.length) { result.push(b.shift()); placed = true; }
          }
          if (!placed) break;
          idx++;
        }
        console.log(`✅ Generated ${result.length} opening puzzles from preferred families (strict):`, top);
        const final = result.slice(0, maxPuzzles).map(p => ({ ...p, source: 'opening_repertoire' }));
        return final;
      }

      // Otherwise, compute the user's top openings and ONLY use those (no fallbacks)
      const topFamilies = await openingPuzzleService.getUserTopOpenings(username, 3);
      if (!Array.isArray(topFamilies) || topFamilies.length === 0) {
        console.warn('⚠️ No top openings detected for user; using default popular families (strict to openings only).');
        // Fallback to popular families to avoid empty sets while shards build
        const defaults = ["English Opening", "French Defense", "Scotch Game", "Queen's Gambit"].slice(0, 3);
        const per = Math.max(2, Math.ceil(maxPuzzles / defaults.length));
        const batches = await Promise.all(defaults.map(name => openingPuzzleService.getPuzzlesForOpening(name, per)));
        const nonEmpty = batches.filter(b => b && b.length);
        if (!nonEmpty.length) return [];
        const result = [];
        let idx = 0;
        const buckets = nonEmpty.map(b => [...b]);
        while (result.length < maxPuzzles) {
          let placed = false;
          for (let i = 0; i < buckets.length && result.length < maxPuzzles; i++) {
            const b = buckets[(idx + i) % buckets.length];
            if (b && b.length) { result.push(b.shift()); placed = true; }
          }
          if (!placed) break;
          idx++;
        }
        const final = result.slice(0, maxPuzzles).map(p => ({ ...p, source: 'opening_repertoire' }));
        return final;
      }
      const per = Math.max(2, Math.ceil(maxPuzzles / topFamilies.length));
      const batches = await Promise.all(topFamilies.map(name => openingPuzzleService.getPuzzlesForOpening(name, per)));
      const nonEmpty = batches.filter(b => b && b.length);
      if (!nonEmpty.length) {
        console.warn('⚠️ No opening puzzles found in shards for user top openings; returning none (strict mode).');
        return [];
      }
      const result = [];
      let idx = 0;
      const buckets = nonEmpty.map(b => [...b]);
      while (result.length < maxPuzzles) {
        let placed = false;
        for (let i = 0; i < buckets.length && result.length < maxPuzzles; i++) {
          const b = buckets[(idx + i) % buckets.length];
          if (b && b.length) { result.push(b.shift()); placed = true; }
        }
        if (!placed) break;
        idx++;
      }
      console.log(`✅ Generated ${result.length} opening puzzles from user top openings (strict).`);
      const final = result.slice(0, maxPuzzles).map(p => ({ ...p, source: 'opening_repertoire' }));
      return final;
      
    } catch (error) {
      console.error('❌ Error generating opening puzzles:', error);
      // Strict: do not fallback to non-opening puzzles
      return [];
    }
  }

  /**
   * Generate general endgame puzzles (not user-specific)
   */
  async generateEndgamePuzzles(options = {}) {
    const { maxPuzzles = 10, difficulty = 'intermediate' } = options;
    
    console.log(`🧩 Generating endgame puzzles...`);
    
    try {
      const mod = await import('./endgamePuzzleService.js');
      const endgameService = mod.default || mod;
      const puzzles = await endgameService.getEndgamePuzzles(maxPuzzles);
      if (Array.isArray(puzzles) && puzzles.length) return puzzles;
      console.warn('⚠️ No endgame dataset found, falling back to curated.');
      return this.generateFallbackPuzzles('sharpen-endgame', maxPuzzles);
    } catch (e) {
      console.warn('⚠️ Failed to load endgame service, using curated fallback.', e);
      return this.generateFallbackPuzzles('sharpen-endgame', maxPuzzles);
    }
  }

  /**
   * Group mistakes by type for pattern analysis
   */
  groupMistakesByType(mistakes) {
    const groups = {};
    
    mistakes.forEach(mistake => {
      const type = mistake.mistakeType || 'unknown';
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(mistake);
    });
    
    return groups;
  }

  /**
   * Generate puzzles for a specific mistake type
   */
  async generatePuzzlesForMistakeType(mistakeType, mistakes, count, difficulty) {
    const puzzles = [];

    // Random sample of mistakes for this type (favor recent, but diversify)
    const pool = [...mistakes].sort((a, b) => new Date(b.lastOccurrence) - new Date(a.lastOccurrence));
    const selected = [];
    const usedGame = new Set();
    for (let i = 0; i < pool.length && selected.length < count; i++) {
      const m = pool[i];
      const g = m.gameId || m.game_id || m.game || m.gameNumber || null;
      // Prefer new game ids to diversify
      if (!g || !usedGame.has(g) || selected.length + (pool.length - i) <= count) {
        selected.push(m);
        if (g) usedGame.add(g);
      }
    }

    // Shuffle to avoid grouping
    selected.sort(() => Math.random() - 0.5);

    selected.forEach((mistake, index) => {
      const fen = mistake.fen || this.getDefaultPositionForMistakeType(mistakeType);
      const sideToMove = fen?.split(' ')[1] === 'b' ? 'black' : 'white';
      const puzzle = {
        id: `${mistakeType}_${index + 1}`,
        position: fen,
        objective: this.getObjectiveForMistakeType(mistakeType),
        solution: mistake.correctMove || 'Nf3',
        playerMove: mistake.playerMove || '',
        sideToMove,
        hint: this.getHintForMistakeType(mistakeType),
        explanation: mistake.description || this.getExplanationForMistakeType(mistakeType),
        mistakeType: mistakeType,
        difficulty: difficulty,
        source: 'user_mistake',
        debugGameId: mistake?.gameId || mistake?.game_id || mistake?.game || mistake?.gameNumber || null,
      };

      puzzles.push(puzzle);
    });

    return puzzles;
  }

  /**
   * Convert a stored mistake to a puzzle format
   */
  convertMistakeToPuzzle(mistake, puzzleId) {
    const fen = mistake.fen;
    const sideToMove = fen?.split(' ')[1] === 'b' ? 'black' : 'white';
    return {
      id: puzzleId,
      position: fen,
      objective: `Find the best move in this position from your game.`,
      solution: mistake.correctMove,
      playerMove: mistake.playerMove || '',
      sideToMove,
      hint: this.getHintForMistakeType(mistake.mistakeType),
      explanation: mistake.description || `The best move was ${mistake.correctMove}. ${this.getExplanationForMistakeType(mistake.mistakeType)}`,
      mistakeType: mistake.mistakeType,
      gameInfo: mistake.gameId ? `From your game: ${mistake.gameId}` : '',
      difficulty: this.getDifficultyFromEvaluation(mistake.centipawnLoss),
      source: 'user_game'
    };
  }

  /**
   * Convert opening deviation to puzzle format
   */
  convertOpeningToPuzzle(deviation, puzzleId) {
    const fen = deviation.fen;
    const sideToMove = fen?.split(' ')[1] === 'b' ? 'black' : 'white';
    const best = deviation.correct_move || deviation.bestMove || 'Nf3';
    return {
      id: puzzleId,
      position: fen,
      objective: `Find the best continuation in this ${deviation.opening} position.`,
      solution: best,
      sideToMove,
      hint: `This is a key position in the ${deviation.opening}.`,
      explanation: `In the ${deviation.opening}, the best move is ${best}.`,
      opening: deviation.opening,
      difficulty: 'intermediate',
      source: 'opening_repertoire'
    };
  }

  /**
   * Generate fallback puzzles when no user data is available
   */
  generateFallbackPuzzles(puzzleType, count) {
    const fallbackPuzzles = {
      'fix-weaknesses': [
        {
          id: 1,
          position: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 4',
          objective: 'White to move. Find the best move to maintain the initiative.',
          solution: 'Ng5',
          hint: 'Look for a move that attacks the weak f7 square.',
          explanation: 'Ng5 attacks the f7 pawn, which is only defended by the king, creating immediate threats.',
          source: 'curated'
        },
        {
          id: 2,
          position: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2',
          objective: 'White to move. Develop with purpose.',
          solution: 'exd5',
          hint: 'Consider capturing in the center.',
          explanation: 'exd5 opens the center and gives White better piece development opportunities.',
          source: 'curated'
        }
      ],
      'learn-mistakes': [
        {
          id: 1,
          position: 'r1bq1rk1/ppp2ppp/2n1bn2/3p4/3P4/2N1PN2/PPP2PPP/R1BQKB1R w KQ - 0 7',
          objective: 'White to move. Find the tactical shot you missed.',
          solution: 'Nxd5',
          hint: 'Look for a knight fork opportunity.',
          explanation: 'Nxd5 creates a fork, attacking both the queen and the knight on e6.',
          source: 'curated'
        }
      ],
      'master-openings': [
        {
          id: 1,
          position: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
          objective: 'Black to move. Respond to 1.e4 with a solid defense.',
          solution: 'e5',
          hint: 'Control the center with a pawn.',
          explanation: '1...e5 is the most principled response, fighting for central control.',
          source: 'curated'
        }
      ],
      'sharpen-endgame': [
        {
          id: 1,
          position: '8/8/8/8/8/3K4/3P4/3k4 w - - 0 1',
          objective: 'White to move. Promote the pawn.',
          solution: 'Kc4',
          hint: 'Support your pawn with the king.',
          explanation: 'Kc4 supports the pawn advance and helps it promote.',
          source: 'curated'
        }
      ]
    };

    return (fallbackPuzzles[puzzleType] || fallbackPuzzles['fix-weaknesses']).slice(0, count);
  }

  /**
   * Helper methods for generating puzzle content
   */
  getDefaultPositionForMistakeType(mistakeType) {
    const positions = {
      [MISTAKE_TYPES.TACTICAL_MISS]: 'r1bq1rk1/ppp2ppp/2n1bn2/3p4/3P4/2N1PN2/PPP2PPP/R1BQKB1R w KQ - 0 7',
      [MISTAKE_TYPES.POSITIONAL_ERROR]: 'rnbqkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 0 3',
      [MISTAKE_TYPES.BLUNDER]: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3'
    };
    
    return positions[mistakeType] || positions[MISTAKE_TYPES.TACTICAL_MISS];
  }

  getObjectiveForMistakeType(mistakeType) {
    const objectives = {
      [MISTAKE_TYPES.TACTICAL_MISS]: 'Find the tactical shot you missed.',
      [MISTAKE_TYPES.POSITIONAL_ERROR]: 'Find the best positional move.',
      [MISTAKE_TYPES.BLUNDER]: 'Avoid the blunder and find the correct move.',
      [MISTAKE_TYPES.MISSED_WIN]: 'Find the winning move you missed.'
    };
    
    return objectives[mistakeType] || 'Find the best move in this position.';
  }

  getHintForMistakeType(mistakeType) {
    const hints = {
      [MISTAKE_TYPES.TACTICAL_MISS]: 'Look for tactical motifs like forks, pins, or skewers.',
      [MISTAKE_TYPES.POSITIONAL_ERROR]: 'Consider piece activity and pawn structure.',
      [MISTAKE_TYPES.BLUNDER]: 'Check for opponent threats before moving.',
      [MISTAKE_TYPES.MISSED_WIN]: 'Look for forcing moves that create threats.'
    };
    
    return hints[mistakeType] || 'Think about the key features of this position.';
  }

  getExplanationForMistakeType(mistakeType) {
    const explanations = {
      [MISTAKE_TYPES.TACTICAL_MISS]: 'This position contains a tactical motif that should be recognized.',
      [MISTAKE_TYPES.POSITIONAL_ERROR]: 'The key is to improve piece coordination and pawn structure.',
      [MISTAKE_TYPES.BLUNDER]: 'Always check for opponent threats before making your move.',
      [MISTAKE_TYPES.MISSED_WIN]: 'Forcing moves often lead to winning positions.'
    };
    
    return explanations[mistakeType] || 'This position teaches important chess principles.';
  }

  getDifficultyFromEvaluation(evaluation) {
    if (!evaluation) return 'intermediate';
    
    const absEval = Math.abs(evaluation);
    if (absEval < 100) return 'beginner';
    if (absEval < 300) return 'intermediate';
    return 'advanced';
  }
}

// Create singleton instance
const puzzleGenerationService = new PuzzleGenerationService();

export default puzzleGenerationService;