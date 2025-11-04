/**
 * Puzzle Generation Service
 * Generates targeted puzzles based on user's stored mistakes and weaknesses
 */

import puzzleDataService from './puzzleDataService.js';
import openingPuzzleService from './openingPuzzleService.js';
import weaknessPuzzleService from './weaknessPuzzleService.js';
import puzzleService from './puzzleService.js';
import { MISTAKE_TYPES, TACTICAL_THEMES, PUZZLE_CATEGORIES, DIFFICULTY_LEVELS } from '../utils/dataModels.js';
import stockfishAnalyzer from '../utils/stockfishAnalysis.js';
import { Chess } from 'chess.js';

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
   * Generate puzzles for "Fix My Weaknesses" using only Lichess tactic shards (no IndexedDB)
   */
  async generateWeaknessPuzzles(username, options = {}) {
    const { maxPuzzles = 10, difficulty = 'easy' } = options;

    console.log(`🧩 Generating weakness puzzles from Lichess shards (username ignored for DB) ...`);

    try {
      // Preferred themes to sample from shards (advanced rating preferred inside service)
      const themePool = [
        'fork', 'pin', 'skewer', 'discovered-attack',
        'back-rank-mate', 'hanging-piece', 'double-attack', 'x-ray',
        'trapped-piece', 'weak-king', 'mate-in-2', 'mate-in-3', 'mate-in-1'
      ];

      const perTheme = Math.max(2, Math.ceil(maxPuzzles / Math.min(themePool.length, 6)));
      const batches = await Promise.all(themePool.map(t => weaknessPuzzleService.getPuzzlesForTheme(t, perTheme, difficulty)));
      const buckets = batches.filter(b => b && b.length).map(b => [...b]);
      if (!buckets.length) {
        console.warn('⚠️ No tactic shards available; returning empty set.');
        return [];
      }

      // Interleave across themes and dedupe
      const tokens = (s) => String(s || '').split(/\s+/).filter(Boolean);
      const keyOf = (p) => `${p.position}::${tokens(p.lineUci).slice(0, 6).join(' ')}`;

      const seen = new Set();
      const interleaved = [];
      let idx = 0;
      while (interleaved.length < maxPuzzles) {
        let placed = false;
        for (let i = 0; i < buckets.length && interleaved.length < maxPuzzles; i++) {
          const b = buckets[(idx + i) % buckets.length];
          if (b && b.length) {
            const cand = b.shift();
            const k = keyOf(cand);
            if (!seen.has(k)) {
              seen.add(k);
              interleaved.push({ ...cand, source: 'weakness_dataset' });
              placed = true;
            }
          }
        }
        if (!placed) break;
        idx++;
      }

      console.log(`✅ Generated ${interleaved.length} weakness puzzles from shards only`);
      return interleaved;
    } catch (error) {
      console.error('❌ Error generating weakness puzzles (shards):', error);
      return [];
    }
  }

  /**
   * Generate puzzles for "Learn From My Mistakes" based on actual game positions
   * MANDATORY: Generate EXACTLY 20 multi-move puzzles (minimum 4 plies each)
   * 
   * @param {string} username - Username to generate puzzles for
   * @param {object} options - Options object
   * @param {number} options.maxPuzzles - Maximum puzzles to generate (default 20)
   * @param {string} options.difficulty - Difficulty level (default 'intermediate')
   * @param {function} options.onProgress - Callback(puzzle, index, total) called after each puzzle is generated
   */
  async generateMistakePuzzles(username, options = {}) {
    const { maxPuzzles = 20, difficulty = 'intermediate', onProgress = null } = options;
    const EXACT_PUZZLES = 20;  // EXACTLY 20 puzzles, no more, no less
    const MINIMUM_PLIES = 10;  // 5 full moves minimum (5 user decisions) - high-quality long tactical puzzles
    const TARGET_PLIES = 16;   // Target 8 full moves for maximum tactical depth
    
    console.log(`🧩 Generating EXACTLY ${EXACT_PUZZLES} long multi-move puzzles (10-16 plies) for ${username}...`);
    
    try {
      // Get stored mistakes with position data
      const mistakes = await puzzleDataService.getUserMistakes(username, 200); // Get more mistakes to ensure we have enough
      
      console.log(`📊 Found ${mistakes?.length || 0} stored mistakes for ${username}`);
      
      if (!mistakes || mistakes.length === 0) {
        console.error('❌ No stored mistakes found - cannot generate puzzles without user game data');
        console.error('💡 Please import games first to generate personalized puzzles');
        return [];
      }

      // Filter mistakes that have valid FEN positions
      const mistakesWithPositions = mistakes.filter(mistake => 
        mistake.fen && mistake.correctMove
      );

      console.log(`🎯 Found ${mistakesWithPositions.length} mistakes with valid positions`);

      if (mistakesWithPositions.length === 0) {
        console.error('❌ No mistakes with valid positions found - cannot generate puzzles');
        console.error('💡 Please ensure imported games have valid position data');
        return [];
      }

      // Randomize and interleave by game to avoid consecutive from the same game
      // Get MORE mistakes initially to ensure we can reach EXACT_PUZZLES after filtering
      // For long puzzles (10-16 plies), we need MORE candidates since success rate is lower (~30-40%)
      const orderedMistakes = this._interleaveByGame(
        [...mistakesWithPositions].sort(() => Math.random() - 0.5),
        Math.min(mistakesWithPositions.length, 100), // Process up to 100 positions to find 20 long puzzles
        (m) => m.gameId || m.game_id || m.game || m.gameNumber || null
      );
      const basePuzzles = orderedMistakes.map((mistake, index) => this.convertMistakeToPuzzle(mistake, index + 1));
      
      console.log(`🎲 Processing ${basePuzzles.length} mistake positions to generate ${EXACT_PUZZLES} long puzzles...`);

      // Build multi-move lines for ALL puzzles by extending engine PVs iteratively
      const enhanced = [];

      // Helpers for UCI parsing and move application
      const isUci = (s) => /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(s || '');
      const normalizeSan = (s) => (s || '').replace(/[+#?!]/g, '').replace(/=/g, '').trim();
      const applyUciMove = (fen, uci) => {
        try {
          if (!isUci(uci)) return null;
          const e = new Chess(fen);
          const from = uci.slice(0, 2).toLowerCase();
          const to = uci.slice(2, 4).toLowerCase();
          const prom = uci.length > 4 ? uci[4].toLowerCase() : undefined;
          const m = e.move({ from, to, promotion: prom });
          return m ? e.fen() : null;
        } catch {
          return null;
        }
      };
      const toUciFromSolution = (sol, fen) => {
        try {
          if (!sol) return null;
          if (isUci(sol)) return sol.toLowerCase();
          const e = new Chess(fen);
          const m = e.move(normalizeSan(sol));
          if (!m) return null;
          const promo = m.promotion ? m.promotion.toLowerCase() : '';
          return `${m.from}${m.to}${promo}`.toLowerCase();
        } catch {
          return null;
        }
      };
      const extendPv = async (fen, wantPlies = 10, maxPlies = 16) => {
        const out = [];
        let curFen = fen;
        // Longer timeouts for better quality long puzzles
        const firstTime = 500;    // 500ms for first move - better quality
        const nextTime = 400;     // 400ms for subsequent moves - maintain quality
        
        while (out.length < maxPlies) {
          try {
            const timeBudget = out.length === 0 ? firstTime : nextTime;
            const analysis = await stockfishAnalyzer.analyzePositionDeep(curFen, 15, timeBudget);  // Depth 15 - higher quality for long puzzles
            let pv = Array.isArray(analysis?.principalVariation) ? analysis.principalVariation : [];
            if ((!pv || pv.length === 0) && analysis?.bestMove) pv = [analysis.bestMove];
            if (!pv || pv.length === 0) break;
            
            let appended = 0;
            for (const mv of pv) {
              if (!isUci(mv)) break;
              const nf = applyUciMove(curFen, mv);
              if (!nf) break;
              out.push(mv.toLowerCase());
              curFen = nf;
              appended++;
              if (out.length >= maxPlies) break;
            }
            
            if (appended === 0) break; // cannot extend further
            
            // If we have enough plies, we can stop early
            if (out.length >= wantPlies) break;
          } catch (err) {
            // Timeout or analysis error - return what we have so far
            break;
          }
        }
        return out;
      };

      // Parallel batch processing for long puzzle generation
      const BATCH_SIZE = 5; // Process 5 positions in parallel for better quality control
      let processedCount = 0;
      
      for (let i = 0; i < basePuzzles.length; i += BATCH_SIZE) {
        // Stop IMMEDIATELY if we already have exactly EXACT_PUZZLES
        if (enhanced.length >= EXACT_PUZZLES) {
          break;
        }
        
        const batch = basePuzzles.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        const batchResults = await Promise.allSettled(
          batch.map(async (p) => {
            try {
              const targetMin = MINIMUM_PLIES;
              const targetMax = TARGET_PLIES;
              
              // Try to extend the position to create long puzzle
              const line = await extendPv(p.position, targetMin, targetMax);

              // Skip if doesn't meet minimum (10 plies = 5 user decisions)
              if (line.length < targetMin) {
                return null;
              }

              // Success! Return enhanced long puzzle
              return {
                ...p,
                lineUci: line.slice(0, targetMax).join(' '),
                startLineIndex: 0,
                difficulty: 'advanced',
                estimatedRating: 2000,
                rating: 2000,
                source: p.source || 'user_game',
                plies: line.length,
                userDecisions: Math.floor(line.length / 2) // Track number of user decisions
              };
            } catch (e) {
              return null;
            }
          })
        );
        
        // Collect successful results
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            enhanced.push(result.value);
            console.log(`✅ Generated long puzzle ${enhanced.length}/${EXACT_PUZZLES} with ${result.value.plies} plies (${result.value.userDecisions} user decisions)`);
            
            // Call progress callback for real-time caching
            if (onProgress && typeof onProgress === 'function') {
              try {
                onProgress(result.value, enhanced.length, EXACT_PUZZLES);
              } catch (err) {
                console.warn('⚠️ Error in onProgress callback:', err);
              }
            }
            
            // STOP IMMEDIATELY when we reach exactly EXACT_PUZZLES
            if (enhanced.length >= EXACT_PUZZLES) {
              break;
            }
          }
        }
        
        processedCount += batch.length;
        console.log(`🔄 Processed ${processedCount}/${basePuzzles.length} positions (Generated: ${enhanced.length}/${EXACT_PUZZLES})`);
      }

      // Sort by line length (shortest lines first for easy difficulty)
      const toks = (s) => String(s || '').split(/\s+/).filter(Boolean);
      enhanced.sort((a, b) => toks(a.lineUci).length - toks(b.lineUci).length);

      // If we don't have enough puzzles, use ADAPTIVE STRATEGY with looser requirements
      if (enhanced.length < EXACT_PUZZLES) {
        console.warn(`⚠️ Only ${enhanced.length}/${EXACT_PUZZLES} long puzzles generated. Trying adaptive strategy...`);
        
        const alreadyUsedPositions = new Set(enhanced.map(p => p.position));
        let remainingCandidates = basePuzzles.filter(p => !alreadyUsedPositions.has(p.position));
        
        console.log(`🔄 Retrying with ${remainingCandidates.length} remaining positions using looser requirements...`);
        
        // ADAPTIVE STRATEGY: Try progressively shorter minimum plies
        const adaptiveStrategies = [
          { minPlies: 8, maxPlies: 16, label: 'medium-length (8-16 plies)' },  // 4-8 decisions
          { minPlies: 6, maxPlies: 12, label: 'shorter (6-12 plies)' },        // 3-6 decisions
          { minPlies: 4, maxPlies: 10, label: 'tactical (4-10 plies)' }        // 2-5 decisions
        ];
        
        for (const strategy of adaptiveStrategies) {
          // Stop if we already have enough puzzles
          if (enhanced.length >= EXACT_PUZZLES) break;
          
          console.log(`🎯 Trying ${strategy.label} puzzles to fill remaining ${EXACT_PUZZLES - enhanced.length} slots...`);
          
          // Track positions used in this strategy to avoid duplicates
          const usedInThisStrategy = new Set();
          
          for (let i = 0; i < remainingCandidates.length && enhanced.length < EXACT_PUZZLES; i += BATCH_SIZE) {
            const batch = remainingCandidates.slice(i, i + BATCH_SIZE);
            
            const batchResults = await Promise.allSettled(
              batch.map(async (p) => {
                try {
                  // Skip if already used in this strategy
                  if (usedInThisStrategy.has(p.position)) return null;
                  
                  // Try with current strategy's requirements
                  const line = await extendPv(p.position, strategy.minPlies, strategy.maxPlies);
                  
                  if (line.length >= strategy.minPlies) {
                    usedInThisStrategy.add(p.position);
                    return {
                      ...p,
                      lineUci: line.slice(0, strategy.maxPlies).join(' '),
                      startLineIndex: 0,
                      difficulty: 'advanced',
                      estimatedRating: 2000,
                      rating: 2000,
                      source: p.source || 'user_game',
                      plies: line.length,
                      userDecisions: Math.floor(line.length / 2),
                      adaptiveStrategy: strategy.label // Track which strategy was used
                    };
                  }
                  return null;
                } catch (e) {
                  return null;
                }
              })
            );
            
            for (const result of batchResults) {
              if (result.status === 'fulfilled' && result.value) {
                enhanced.push(result.value);
                console.log(`✅ Generated puzzle ${enhanced.length}/${EXACT_PUZZLES} with ${result.value.plies} plies (${result.value.userDecisions} decisions) [${result.value.adaptiveStrategy}]`);
                
                // Call progress callback for real-time caching
                if (onProgress && typeof onProgress === 'function') {
                  try {
                    onProgress(result.value, enhanced.length, EXACT_PUZZLES);
                  } catch (err) {
                    console.warn('⚠️ Error in onProgress callback:', err);
                  }
                }
                
                if (enhanced.length >= EXACT_PUZZLES) break;
              }
            }
            
            // Stop processing this strategy if we have enough
            if (enhanced.length >= EXACT_PUZZLES) break;
          }
          
          // Update remaining candidates for next strategy (remove positions used in this strategy)
          remainingCandidates = remainingCandidates.filter(p => !usedInThisStrategy.has(p.position));
          
          // If this strategy filled the quota, no need to try easier ones
          if (enhanced.length >= EXACT_PUZZLES) {
            console.log(`✅ Reached ${EXACT_PUZZLES} puzzles using ${strategy.label} strategy`);
            break;
          }
          
          console.log(`📊 After ${strategy.label}: ${enhanced.length}/${EXACT_PUZZLES} puzzles, ${remainingCandidates.length} positions remaining`);
        }
        
        // Re-sort after adding more puzzles (longest first for better user experience)
        enhanced.sort((a, b) => toks(b.lineUci).length - toks(a.lineUci).length);
      }

      // Assign difficulties based on puzzle length: shorter = easier, longer = harder
      const result = enhanced.slice(0, EXACT_PUZZLES).map((p, index) => {
        let difficulty, rating;
        const plies = p.plies || toks(p.lineUci).length;
        
        // Adaptive difficulty based on puzzle length
        if (plies <= 5) {
          difficulty = 'easy';
          rating = 1200 + Math.floor(Math.random() * 300); // 1200-1500 (very short)
        } else if (plies <= 7) {
          difficulty = 'easy';
          rating = 1500 + Math.floor(Math.random() * 300); // 1500-1800 (short)
        } else if (plies <= 9) {
          difficulty = 'medium';
          rating = 1700 + Math.floor(Math.random() * 300); // 1700-2000 (medium-short)
        } else if (plies <= 11) {
          difficulty = 'medium';
          rating = 1900 + Math.floor(Math.random() * 300); // 1900-2200 (medium)
        } else if (plies <= 13) {
          difficulty = 'hard';
          rating = 2100 + Math.floor(Math.random() * 300); // 2100-2400 (medium-long)
        } else {
          difficulty = 'hard';
          rating = 2300 + Math.floor(Math.random() * 400); // 2300-2700 (very long)
        }
        return { ...p, difficulty, rating };
      });

      // Apply winning side filter: ensure user always gets to play from the winning side
      console.log(`🎯 Filtering puzzles to ensure user always plays from winning side...`);
      const filteredResult = await Promise.all(
        result.map(puzzle => this.ensureWinningPuzzle(puzzle))
      );
      
      if (filteredResult.length < EXACT_PUZZLES) {
        console.warn(`⚠️ Generated ${filteredResult.length}/${EXACT_PUZZLES} puzzles from user mistakes`);
        console.warn(`💡 Import more games to generate the full set of 20 puzzles`);
      } else {
        // Count puzzles by length category
        const longPuzzles = filteredResult.filter(p => (p.plies || 0) >= 10).length;
        const mediumPuzzles = filteredResult.filter(p => (p.plies || 0) >= 6 && (p.plies || 0) < 10).length;
        const shortPuzzles = filteredResult.filter(p => (p.plies || 0) < 6).length;
        const flippedPuzzles = filteredResult.filter(p => p.isFlipped).length;
        
        console.log(`✅ Successfully generated ${filteredResult.length} puzzles from user mistakes:`);
        if (longPuzzles > 0) console.log(`   📏 ${longPuzzles} long puzzles (10-16 plies = 5-8 decisions)`);
        if (mediumPuzzles > 0) console.log(`   📏 ${mediumPuzzles} medium puzzles (6-9 plies = 3-4 decisions)`);
        if (shortPuzzles > 0) console.log(`   📏 ${shortPuzzles} short puzzles (4-5 plies = 2 decisions)`);
        if (flippedPuzzles > 0) console.log(`   🔄 ${flippedPuzzles} puzzles flipped to winning side`);
      }
      
      return filteredResult;
      
    } catch (error) {
      console.error('❌ Critical error generating mistake puzzles:', error);
      console.error('💡 Please check that games are properly imported and contain valid position data');
      return [];
    }
  }

  /**
   * Generate opening puzzles based on user's opening repertoire
   */
  async generateOpeningPuzzles(username, options = {}) {
    const { maxPuzzles = 20, difficulty = 'easy', preferredFamilies = null } = options;
    
    console.log(`🧩 Generating opening puzzles for ${username} (STRICT to most played openings)...`);
    
    try {
      // If caller provides explicit families, honor them strictly
      if (Array.isArray(preferredFamilies) && preferredFamilies.length) {
        const top = preferredFamilies.slice(0, 3);
        const per = Math.max(2, Math.ceil(maxPuzzles / top.length));
        const batches = await Promise.all(top.map(name => openingPuzzleService.getPuzzlesForOpening(name, per, difficulty)));
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
       const batches = await Promise.all(defaults.map(name => openingPuzzleService.getPuzzlesForOpening(name, per, difficulty)));
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
      const batches = await Promise.all(topFamilies.map(name => openingPuzzleService.getPuzzlesForOpening(name, per, difficulty)));
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
    const { maxPuzzles = 20, difficulty = 'easy' } = options;

    console.log(`🧩 Generating endgame puzzles...`);

    try {
      const mod = await import('./endgamePuzzleService.js');
      const endgameService = mod.default || mod;
      const puzzles = await endgameService.getEndgamePuzzles(maxPuzzles, difficulty);
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
   * Flip a FEN position 180 degrees (rotate the board)
   * This changes the perspective so the opponent's side is to move
   */
  flipFEN(fen) {
    if (!fen) return fen;
    
    try {
      const parts = fen.split(' ');
      if (parts.length < 6) return fen;
      
      const [placement, activeColor, castling, enPassant, halfmove, fullmove] = parts;
      
      // Flip the board position (rotate 180 degrees)
      const rows = placement.split('/');
      const flippedRows = rows
        .map(row => {
          // Expand numbers to pieces first
          let expanded = '';
          for (const char of row) {
            if (/\d/.test(char)) {
              expanded += ' '.repeat(parseInt(char));
            } else {
              expanded += char;
            }
          }
          // Reverse and flip case
          const reversed = expanded.split('').reverse().map(c => {
            if (c === ' ') return c;
            return c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
          }).join('');
          // Compress back
          let compressed = '';
          let spaces = 0;
          for (const char of reversed) {
            if (char === ' ') {
              spaces++;
            } else {
              if (spaces > 0) compressed += spaces;
              spaces = 0;
              compressed += char;
            }
          }
          if (spaces > 0) compressed += spaces;
          return compressed;
        })
        .reverse()
        .join('/');
      
      // Flip active color
      const flippedColor = activeColor === 'w' ? 'b' : 'w';
      
      // Flip castling rights (swap K/Q with k/q)
      let flippedCastling = castling;
      if (castling !== '-') {
        flippedCastling = castling
          .split('')
          .map(c => {
            if (c === 'K') return 'k';
            if (c === 'Q') return 'q';
            if (c === 'k') return 'K';
            if (c === 'q') return 'Q';
            return c;
          })
          .join('');
        // Sort for consistency
        const rights = flippedCastling.split('').sort().join('');
        flippedCastling = rights === '' ? '-' : rights;
      }
      
      // Flip en passant square if it exists
      let flippedEnPassant = '-';
      if (enPassant !== '-' && /^[a-h][36]$/.test(enPassant)) {
        const file = enPassant.charCodeAt(0) - 97; // a-h to 0-7
        const rank = 9 - parseInt(enPassant[1]); // 3 or 6 flipped
        flippedEnPassant = String.fromCharCode(97 + (7 - file)) + rank;
      }
      
      return `${flippedRows} ${flippedColor} ${flippedCastling} ${flippedEnPassant} ${halfmove} ${fullmove}`;
    } catch (err) {
      console.error('Error flipping FEN:', err);
      return fen;
    }
  }

  /**
   * Check if a position is losing for the side to move (evaluation < -250 cp)
   * If so, flip the board so the user gets the winning side
   */
  async ensureWinningPuzzle(puzzle) {
    try {
      // Quick evaluation to check if position is too losing
      const analysis = await stockfishAnalyzer.analyzePositionDeep(puzzle.position, 12, 200);
      
      // If position evaluates to losing (< -250 cp), flip the board
      if (analysis?.evaluation?.type === 'cp' && analysis.evaluation.value < -250) {
        console.log(`⚠️ Position was losing (eval: ${analysis.evaluation.value} cp) - flipping to winning side for user...`);
        
        // Flip the entire position
        const flippedFEN = this.flipFEN(puzzle.position);
        const flippedAnalysis = await stockfishAnalyzer.analyzePositionDeep(flippedFEN, 12, 200);
        
        // Get the best move in the flipped position
        const bestMove = flippedAnalysis?.bestMove || '';
        
        return {
          ...puzzle,
          position: flippedFEN,
          solution: bestMove,
          sideToMove: puzzle.sideToMove === 'white' ? 'black' : 'white',
          objective: `Find the best move to exploit your opponent's weakness from your game.`,
          explanation: `In this critical position, playing the strong move is key to converting your advantage.`,
          isFlipped: true
        };
      }
      
      return puzzle;
    } catch (err) {
      console.error('Error ensuring winning puzzle:', err);
      // If analysis fails, return original puzzle
      return puzzle;
    }
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
          position: '2rq1rk1/pp1bppbp/3p1np1/8/3NP3/1BN1BP2/PPPQ2PP/2KR3R w - - 0 14',
          objective: 'White to move. Find the powerful tactical blow.',
          solution: 'Nf5',
          hint: 'Look for a knight sacrifice that exposes the king.',
          explanation: 'Nf5! is a brilliant knight sacrifice. After gxf5 exf5, White has a devastating attack with the bishop pair aimed at the exposed king.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2250
        },
        {
          id: 2,
          position: 'r1b2rk1/pp3ppp/2n1p3/q1ppP3/3P4/P1PB1N2/2Q2PPP/R1B2RK1 w - - 0 15',
          objective: 'White to move. Exploit the weak dark squares.',
          solution: 'Bxh7+',
          hint: 'A classic bishop sacrifice on h7.',
          explanation: 'Bxh7+! Kxh7 Ng5+ and White wins the queen with a devastating attack.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2300
        },
        {
          id: 3,
          position: '3r2k1/p4ppp/1p2p3/nPq5/P2pPQ2/5P2/6PP/1R1R2K1 w - - 0 25',
          objective: 'White to move. Find the winning combination.',
          solution: 'Rxd4',
          hint: 'Sacrifice the exchange to open lines.',
          explanation: 'Rxd4! cxd4 Qxd4+ and White wins with the powerful centralized queen.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2350
        },
        {
          id: 4,
          position: 'r4rk1/1bq1bppp/p2ppn2/1p6/3NPP2/2N1B3/PPPQ2PP/2KR1B1R w - - 0 13',
          objective: 'White to move. Breakthrough in the center.',
          solution: 'Ndxb5',
          hint: 'A knight sacrifice opens up the position.',
          explanation: 'Ndxb5! axb5 Nxb5 and White has a strong attack against the exposed queen and weak dark squares.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2280
        },
        {
          id: 5,
          position: '2kr3r/ppp2ppp/2n1b3/4N3/2Pq4/3B4/PP3PPP/R2Q1RK1 w - - 0 15',
          objective: 'White to move. Find the forcing sequence.',
          solution: 'Nxf7',
          hint: 'A knight sacrifice leads to perpetual check or better.',
          explanation: 'Nxf7! Kxf7 Qh5+ and White has at minimum a perpetual check, but likely wins material.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2320
        },
        {
          id: 6,
          position: 'r2q1rk1/1p1bbppp/p1np1n2/4p3/P2PP3/2N1BN1P/1P2BPP1/R2Q1RK1 w - - 0 12',
          objective: 'White to move. Exploit the pin.',
          solution: 'd5',
          hint: 'The knight on c6 is pinned to the queen.',
          explanation: 'd5! wins material because the knight on c6 is pinned and cannot move without losing the queen.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2200
        },
        {
          id: 7,
          position: '2rq1rk1/1p1n1ppp/p2ppn2/6B1/3NPP2/2N5/PPP1Q1PP/2KR3R w - - 0 14',
          objective: 'White to move. Find the tactical shot.',
          solution: 'Nxe6',
          hint: 'Remove the defender of the d7 knight.',
          explanation: 'Nxe6! fxe6 Qxe6+ and White wins the knight on d7 with a strong attack.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2260
        },
        {
          id: 8,
          position: 'r1bq1rk1/pp3pbp/2np1np1/2p1p3/2P1P3/2NPBN2/PP2BPPP/R2Q1RK1 w - - 0 10',
          objective: 'White to move. Break through with a pawn sacrifice.',
          solution: 'd4',
          hint: 'Open the center with a pawn break.',
          explanation: 'd4! cxd4 Nxd4 and White has excellent piece activity and central control.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2240
        },
        {
          id: 9,
          position: '3r2k1/1bq2ppp/p3pn2/1p6/3NP3/1BP2Q2/PP3PPP/3R2K1 w - - 0 20',
          objective: 'White to move. Find the winning move.',
          solution: 'Nf5',
          hint: 'Attack the weak e6 pawn and threaten the king.',
          explanation: 'Nf5! attacks e6 and threatens Qh5, winning material or delivering checkmate.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2290
        },
        {
          id: 10,
          position: 'r2qk2r/ppp2ppp/2n1bn2/2bpp3/4P3/2PP1N2/PP1NBPPP/R1BQ1RK1 w kq - 0 9',
          objective: 'White to move. Punish Black\'s development.',
          solution: 'Nxe5',
          hint: 'Win material with a tactical sequence.',
          explanation: 'Nxe5! Nxe5 d4 and White wins a piece due to the pin on the bishop.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2270
        },
        {
          id: 11,
          position: '2r3k1/5ppp/p1q1p3/1p1pP3/3n1P2/P2B1Q1P/1P4P1/2R3K1 b - - 0 25',
          objective: 'Black to move. Find the winning tactic.',
          solution: 'Nf3+',
          hint: 'A knight fork wins the queen.',
          explanation: 'Nf3+! gxf3 Qxf3 and Black has won the queen for a knight.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2310
        },
        {
          id: 12,
          position: 'r1b1k2r/pp1n1ppp/2p1p3/q7/1b1P4/2NB1N2/PP2QPPP/R1B2RK1 w kq - 0 11',
          objective: 'White to move. Exploit the exposed king.',
          solution: 'Bxh7+',
          hint: 'A classic Greek Gift sacrifice.',
          explanation: 'Bxh7+! Kxh7 Ng5+ Kg8 Qh5 and White has a winning attack.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2330
        },
        {
          id: 13,
          position: '3r1rk1/pp3ppp/2p1b3/8/2BPq3/P3P3/1P2QPPP/R4RK1 b - - 0 18',
          objective: 'Black to move. Find the winning combination.',
          solution: 'Rd1',
          hint: 'A rook sacrifice forces checkmate.',
          explanation: 'Rd1! Rxd1 Qxf2+ Kh1 Qxf1#. A beautiful back-rank mate.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2360
        },
        {
          id: 14,
          position: 'r2q1rk1/1p1bbppp/p1nppn2/8/3NP3/2N1BP2/PPPQ2PP/2KR1B1R w - - 0 12',
          objective: 'White to move. Find the powerful knight move.',
          solution: 'Ndb5',
          hint: 'Attack the weak a7 pawn and c7 square.',
          explanation: 'Ndb5! attacks a7 and threatens Nc7, winning the exchange or forcing major concessions.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2220
        },
        {
          id: 15,
          position: '2rq1rk1/pp2bppp/2n1pn2/3p4/3P1B2/2PBPN2/PP1N1PPP/R2Q1RK1 w - - 0 12',
          objective: 'White to move. Win material with tactics.',
          solution: 'Bxf6',
          hint: 'Remove the defender of the e7 bishop.',
          explanation: 'Bxf6! Bxf6 Nxd5 and White wins a pawn with a better position.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2230
        },
        {
          id: 16,
          position: 'r1b2rk1/pp1nqppp/2p1pn2/3p4/2PP4/2N1PN2/PP2BPPP/R1BQ1RK1 w - - 0 10',
          objective: 'White to move. Break in the center.',
          solution: 'cxd5',
          hint: 'Open lines for your pieces.',
          explanation: 'cxd5! cxd5 Nb5 and White has strong pressure on the queenside.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2210
        },
        {
          id: 17,
          position: '3r2k1/p4ppp/1p2p3/2q5/P2pP3/5P2/1P1Q2PP/1R1R2K1 w - - 0 24',
          objective: 'White to move. Find the winning move.',
          solution: 'Qh6',
          hint: 'Threaten checkmate on g7.',
          explanation: 'Qh6! threatens Qg7# and Black cannot adequately defend.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2340
        },
        {
          id: 18,
          position: 'r2q1rk1/1p1b1ppp/p1n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 11',
          objective: 'White to move. Castle or attack?',
          solution: 'O-O',
          hint: 'Complete development before attacking.',
          explanation: 'O-O! brings the king to safety and connects the rooks, preparing for a kingside attack.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2190
        },
        {
          id: 19,
          position: '2r3k1/5ppp/p2qp3/1p1pP3/3n1P2/P2B1Q1P/1P4P1/2R3K1 w - - 0 24',
          objective: 'White to move. Find the tactical blow.',
          solution: 'Rxc8+',
          hint: 'A rook sacrifice leads to checkmate.',
          explanation: 'Rxc8+! Qxc8 Qf6 and White has an unstoppable mating attack.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2370
        },
        {
          id: 20,
          position: 'r1bq1rk1/pp2bppp/2nppn2/8/2BNP3/2N1B3/PPP2PPP/R2Q1RK1 w - - 0 10',
          objective: 'White to move. Find the strong continuation.',
          solution: 'Nxe6',
          hint: 'A knight sacrifice opens up the position.',
          explanation: 'Nxe6! fxe6 Bxe6+ Kh8 Qd3 and White has a winning attack.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2300
        },
        {
          id: 21,
          position: '2r2rk1/1p1qbppp/p2p1n2/4p3/4P3/1NN1BP2/PPP1Q1PP/2KR3R w - - 0 15',
          objective: 'White to move. Find the winning tactic.',
          solution: 'Nd5',
          hint: 'Centralize the knight with tempo.',
          explanation: 'Nd5! Nxd5 exd5 and White has a powerful passed pawn and better position.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2250
        },
        {
          id: 22,
          position: 'r2q1rk1/1p1bbppp/p1nppn2/8/2BNP3/2N1BP2/PPPQ2PP/2KR3R w - - 0 13',
          objective: 'White to move. Sacrifice for attack.',
          solution: 'Nxe6',
          hint: 'Remove the key defender.',
          explanation: 'Nxe6! fxe6 Bxe6+ Kh8 Qd3 and White has a devastating attack on the dark squares.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2320
        },
        {
          id: 23,
          position: '3r2k1/pp3ppp/2p1b3/8/2BPq3/P3P3/1P2QPPP/R4RK1 w - - 0 19',
          objective: 'White to move. Defend accurately.',
          solution: 'Qf2',
          hint: 'Trade queens to neutralize the attack.',
          explanation: 'Qf2! offers a queen trade that eliminates Black\'s attacking chances.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2200
        },
        {
          id: 24,
          position: 'r1b1k2r/pp1nqppp/2p1pn2/3p4/2PP4/2N1PN2/PP2BPPP/R1BQK2R w KQkq - 0 9',
          objective: 'White to move. Castle or develop?',
          solution: 'O-O',
          hint: 'King safety is paramount.',
          explanation: 'O-O! completes development and prepares for central action.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2180
        },
        {
          id: 25,
          position: '2rq1rk1/1p1bbppp/p1nppn2/8/3NP3/2N1BP2/PPPQB1PP/2KR3R w - - 0 13',
          objective: 'White to move. Find the breakthrough.',
          solution: 'Nxe6',
          hint: 'A knight sacrifice destroys Black\'s pawn structure.',
          explanation: 'Nxe6! fxe6 Bg4 and White has tremendous pressure on the weakened kingside.',
          source: 'curated',
          difficulty: 'advanced',
          estimatedRating: 2310
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

  /**
   * Generate and save weakness puzzles to Supabase
   */
  async generateAndSaveWeaknessPuzzles(userId, username, options = {}) {
    try {
      console.log(`🧩 Generating and saving weakness puzzles for user ${userId}...`);
      
      const puzzles = await this.generateWeaknessPuzzles(username, options);
      
      if (puzzles.length === 0) {
        console.warn('⚠️ No weakness puzzles generated');
        return [];
      }

      // Add category to puzzles
      const puzzlesWithCategory = puzzles.map(p => ({
        ...p,
        category: 'weakness',
        fen: p.position || p.fen
      }));

      // Save to Supabase
      const savedPuzzles = await puzzleService.savePuzzlesBatch(userId, puzzlesWithCategory);
      console.log(`✅ Saved ${savedPuzzles.length} weakness puzzles to Supabase`);
      
      return savedPuzzles;
    } catch (error) {
      console.error('❌ Error generating and saving weakness puzzles:', error);
      throw error;
    }
  }

  /**
   * Generate and save mistake puzzles to Supabase
   */
  async generateAndSaveMistakePuzzles(userId, username, options = {}) {
    try {
      console.log(`🧩 Generating and saving mistake puzzles for user ${userId}...`);
      
      const puzzles = await this.generateMistakePuzzles(username, options);
      
      if (puzzles.length === 0) {
        console.warn('⚠️ No mistake puzzles generated');
        return [];
      }

      // Add category to puzzles
      const puzzlesWithCategory = puzzles.map(p => ({
        ...p,
        category: 'mistake',
        fen: p.position || p.fen
      }));

      // Save to Supabase
      const savedPuzzles = await puzzleService.savePuzzlesBatch(userId, puzzlesWithCategory);
      console.log(`✅ Saved ${savedPuzzles.length} mistake puzzles to Supabase`);
      
      return savedPuzzles;
    } catch (error) {
      console.error('❌ Error generating and saving mistake puzzles:', error);
      throw error;
    }
  }

  /**
   * Generate and save opening puzzles to Supabase
   */
  async generateAndSaveOpeningPuzzles(userId, username, options = {}) {
    try {
      console.log(`🧩 Generating and saving opening puzzles for user ${userId}...`);
      
      const puzzles = await this.generateOpeningPuzzles(username, options);
      
      if (puzzles.length === 0) {
        console.warn('⚠️ No opening puzzles generated');
        return [];
      }

      // Add category to puzzles
      const puzzlesWithCategory = puzzles.map(p => ({
        ...p,
        category: 'opening',
        fen: p.position || p.fen
      }));

      // Save to Supabase
      const savedPuzzles = await puzzleService.savePuzzlesBatch(userId, puzzlesWithCategory);
      console.log(`✅ Saved ${savedPuzzles.length} opening puzzles to Supabase`);
      
      return savedPuzzles;
    } catch (error) {
      console.error('❌ Error generating and saving opening puzzles:', error);
      throw error;
    }
  }

  /**
   * Generate and save endgame puzzles to Supabase
   */
  async generateAndSaveEndgamePuzzles(userId, options = {}) {
    try {
      console.log(`🧩 Generating and saving endgame puzzles for user ${userId}...`);
      
      const puzzles = await this.generateEndgamePuzzles(options);
      
      if (puzzles.length === 0) {
        console.warn('⚠️ No endgame puzzles generated');
        return [];
      }

      // Add category to puzzles
      const puzzlesWithCategory = puzzles.map(p => ({
        ...p,
        category: 'endgame',
        fen: p.position || p.fen
      }));

      // Save to Supabase
      const savedPuzzles = await puzzleService.savePuzzlesBatch(userId, puzzlesWithCategory);
      console.log(`✅ Saved ${savedPuzzles.length} endgame puzzles to Supabase`);
      
      return savedPuzzles;
    } catch (error) {
      console.error('❌ Error generating and saving endgame puzzles:', error);
      throw error;
    }
  }
}

// Create singleton instance
const puzzleGenerationService = new PuzzleGenerationService();

export default puzzleGenerationService;