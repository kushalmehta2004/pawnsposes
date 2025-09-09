/**
 * Mistake Analysis Service
 * Analyzes games to detect and categorize player mistakes
 * Creates the foundation for weakness-based puzzle generation
 */

import { Chess } from 'chess.js';
import stockfishAnalyzer, { StockfishAnalyzer } from '../utils/stockfishAnalysis.js';
import puzzleDataService from './puzzleDataService.js';
import { 
  MISTAKE_TYPES, 
  TACTICAL_THEMES,
  classifyMistake,
  UserMistakeModel 
} from '../utils/dataModels.js';

class MistakeAnalysisService {
  constructor() {
    this.stockfish = stockfishAnalyzer; // Use the singleton instance
    this.isAnalyzing = false;
  }

  /**
   * Analyze all stored games for mistakes
   */
  async analyzeAllGamesForMistakes(username, options = {}) {
    const {
      maxGames = 10,
      onProgress = () => {},
      analysisDepth = 18,
      timeLimit = 5000
    } = options;

    if (this.isAnalyzing) {
      throw new Error('Analysis already in progress');
    }

    this.isAnalyzing = true;
    console.log(`🔍 Starting mistake analysis for ${username}...`);

    try {
      // Get stored games
      const games = await puzzleDataService.getUserGames(username, maxGames);
      
      if (games.length === 0) {
        throw new Error('No games found for analysis. Please fetch games first.');
      }

      console.log(`📊 Analyzing ${games.length} games for mistakes...`);

      const allMistakes = [];
      let totalPositionsAnalyzed = 0;

      for (let i = 0; i < games.length; i++) {
        const game = games[i];
        
        onProgress({
          current: i + 1,
          total: games.length,
          stage: 'analyzing_game',
          message: `Analyzing game ${i + 1}/${games.length}`,
          gameId: game.gameId
        });

        try {
          const gameMistakes = await this.analyzeGameForMistakes(game, {
            analysisDepth,
            timeLimit,
            onProgress: (pos) => {
              totalPositionsAnalyzed++;
              onProgress({
                current: i + 1,
                total: games.length,
                stage: 'analyzing_position',
                message: `Game ${i + 1}: Move ${pos.moveNumber}`,
                positionsAnalyzed: totalPositionsAnalyzed
              });
            }
          });

          allMistakes.push(...gameMistakes);
          console.log(`📊 Game ${i + 1}: Found ${gameMistakes.length} mistakes`);

        } catch (error) {
          console.warn(`❌ Failed to analyze game ${game.gameId}:`, error.message);
        }

        // Small delay between games
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Store all detected mistakes
      if (allMistakes.length > 0) {
        await puzzleDataService.storeMistakes(allMistakes);
        console.log(`💾 Stored ${allMistakes.length} mistakes in database`);
      }

      // Generate mistake patterns
      const patterns = await this.generateMistakePatterns(allMistakes);

      const analysisResult = {
        totalGames: games.length,
        totalMistakes: allMistakes.length,
        positionsAnalyzed: totalPositionsAnalyzed,
        mistakesByType: this.categorizeMistakes(allMistakes),
        patterns: patterns,
        averageMistakesPerGame: (allMistakes.length / games.length).toFixed(1)
      };

      console.log(`✅ Mistake analysis complete:`);
      console.log(`   📊 ${allMistakes.length} mistakes found in ${games.length} games`);
      console.log(`   🎯 ${totalPositionsAnalyzed} positions analyzed`);

      return analysisResult;

    } finally {
      this.isAnalyzing = false;
    }
  }

  /**
   * Analyze a single game for mistakes
   */
  async analyzeGameForMistakes(game, options = {}) {
    const {
      analysisDepth = 18,
      timeLimit = 5000,
      onProgress = () => {}
    } = options;

    console.log(`🔍 Analyzing game ${game.gameId} for mistakes...`);

    const chess = new Chess();
    const mistakes = [];

    // Load the game
    let moves = [];
    if (game.pgn) {
      chess.loadPgn(game.pgn);
      moves = chess.history({ verbose: true });
      chess.reset();
    } else if (game.moves) {
      const moveList = typeof game.moves === 'string' ? game.moves.split(' ') : game.moves;
      for (const move of moveList) {
        if (move.trim()) {
          const moveObj = chess.move(move.trim());
          if (moveObj) moves.push(moveObj);
        }
      }
      chess.reset();
    } else {
      throw new Error('No moves found in game data');
    }

    if (moves.length < 10) {
      console.log(`⚠️ Game too short (${moves.length} moves), skipping analysis`);
      return mistakes;
    }

    // Analyze key positions (every 3rd move after move 10, plus critical positions)
    const positionsToAnalyze = this.selectKeyPositions(moves, game);
    
    console.log(`📊 Selected ${positionsToAnalyze.length} key positions for analysis`);

    for (let i = 0; i < positionsToAnalyze.length; i++) {
      const position = positionsToAnalyze[i];
      
      onProgress({
        moveNumber: position.moveNumber,
        total: positionsToAnalyze.length,
        current: i + 1
      });

      try {
        // Set up position
        chess.reset();
        for (let j = 0; j < position.moveIndex; j++) {
          chess.move(moves[j]);
        }

        const currentFen = chess.fen();
        const playerMove = moves[position.moveIndex];
        const isPlayerMove = this.isPlayerMove(position.moveNumber, game.playerColor);

        if (!isPlayerMove) continue; // Only analyze player's moves

        // Get engine analysis for this position
        const analysis = await this.stockfish.analyzePositionDeep(currentFen, analysisDepth, timeLimit);
        
        if (!analysis || !analysis.bestMove) continue;

        // Check if player move matches engine recommendation
        const mistake = this.evaluateMove(
          playerMove,
          analysis,
          currentFen,
          game,
          position.moveNumber
        );

        if (mistake) {
          mistakes.push(mistake);
          console.log(`❌ Mistake found: Move ${position.moveNumber} - ${mistake.mistakeType} (${mistake.centipawnLoss}cp)`);
        }

      } catch (error) {
        console.warn(`Failed to analyze position ${position.moveNumber}:`, error.message);
      }
    }

    return mistakes;
  }

  /**
   * Select key positions for analysis (not every move to save time)
   */
  selectKeyPositions(moves, game) {
    const positions = [];
    
    // Analyze every 3rd move after move 10 (opening phase)
    for (let i = 10; i < Math.min(moves.length, 40); i += 3) {
      positions.push({
        moveIndex: i,
        moveNumber: Math.floor(i / 2) + 1,
        priority: 'medium',
        phase: 'middlegame'
      });
    }

    // Analyze more frequently in endgame (last 20 moves)
    const endgameStart = Math.max(40, moves.length - 20);
    for (let i = endgameStart; i < moves.length; i += 2) {
      positions.push({
        moveIndex: i,
        moveNumber: Math.floor(i / 2) + 1,
        priority: 'high',
        phase: 'endgame'
      });
    }

    // Add critical positions if we have accuracy data
    if (game.accuracyData && game.accuracyData.analysis) {
      const criticalMoves = this.findCriticalMovesFromAccuracy(game.accuracyData, moves.length);
      for (const criticalMove of criticalMoves) {
        if (criticalMove.moveIndex < moves.length) {
          positions.push({
            moveIndex: criticalMove.moveIndex,
            moveNumber: criticalMove.moveNumber,
            priority: 'critical',
            phase: 'critical',
            expectedLoss: criticalMove.centipawnLoss
          });
        }
      }
    }

    // Remove duplicates and sort by move number
    const uniquePositions = positions.filter((pos, index, arr) => 
      arr.findIndex(p => p.moveIndex === pos.moveIndex) === index
    );

    return uniquePositions.sort((a, b) => a.moveIndex - b.moveIndex);
  }

  /**
   * Find critical moves from Chess.com accuracy data
   */
  findCriticalMovesFromAccuracy(accuracyData, totalMoves) {
    const criticalMoves = [];
    
    if (!accuracyData.analysis || !Array.isArray(accuracyData.analysis)) {
      return criticalMoves;
    }

    for (let i = 0; i < accuracyData.analysis.length && i < totalMoves; i++) {
      const moveAnalysis = accuracyData.analysis[i];
      
      if (moveAnalysis && moveAnalysis.judgment) {
        const judgment = moveAnalysis.judgment;
        
        // Look for blunders, mistakes, and missed wins
        if (judgment.name === 'blunder' || judgment.name === 'mistake' || judgment.name === 'missed_win') {
          criticalMoves.push({
            moveIndex: i,
            moveNumber: Math.floor(i / 2) + 1,
            centipawnLoss: Math.abs(judgment.value || 0),
            judgmentType: judgment.name
          });
        }
      }
    }

    return criticalMoves;
  }

  /**
   * Evaluate if a move is a mistake
   */
  evaluateMove(playerMove, analysis, fen, game, moveNumber) {
    const bestMove = analysis.bestMove;
    const bestEval = analysis.evaluation;
    
    if (!bestMove || !bestEval) return null;

    // If player played the best move, no mistake
    if (playerMove.san === bestMove || playerMove.from + playerMove.to === bestMove) {
      return null;
    }

    // Calculate centipawn loss
    let centipawnLoss = 0;
    
    if (bestEval.type === 'cp') {
      // For centipawn evaluations, we need to compare with player's move evaluation
      // For now, we'll estimate based on alternative moves or use a default
      centipawnLoss = this.estimateCentipawnLoss(analysis, playerMove);
    } else if (bestEval.type === 'mate') {
      // Missed forced mate is always significant
      centipawnLoss = 500; // Treat missed mate as 5 pawn equivalent
    }

    // Only consider significant mistakes (>50cp loss)
    if (centipawnLoss < 50) return null;

    const mistakeType = classifyMistake(centipawnLoss, bestEval.type === 'mate');
    if (!mistakeType) return null;

    // Determine tactical theme
    const theme = this.identifyTacticalTheme(analysis, fen, bestMove);

    // Normalize best move to SAN using chess.js for consistent puzzle validation
    const chessForSan = new Chess(fen);
    let bestMoveSAN = bestMove;
    try {
      // If bestMove is UCI like e2e4, convert to SAN by making the move on a copy
      const uciMatch = /^([a-h][1-8])([a-h][1-8])[qrbn]?$/i.test(bestMove);
      if (uciMatch) {
        const from = bestMove.slice(0, 2);
        const to = bestMove.slice(2, 4);
        const promotion = bestMove.slice(4, 5).toLowerCase();
        const moveObj = chessForSan.move({ from, to, promotion: promotion || undefined });
        if (moveObj && moveObj.san) {
          bestMoveSAN = moveObj.san; // e.g., 'e5', 'Nf3', 'Qxe5+'
        }
      }
    } catch (e) {
      // Fallback: keep original bestMove
    }

    return new UserMistakeModel({
      username: game.username,
      mistakeType,
      description: this.generateMistakeDescription(mistakeType, theme, centipawnLoss),
      fen,
      correctMove: bestMoveSAN,
      playerMove: playerMove.san,
      centipawnLoss,
      gameId: game.gameId,
      moveNumber,
      category: this.categorizeMistakeForPuzzles(mistakeType, theme),
      theme
    });
  }

  /**
   * Estimate centipawn loss (simplified version)
   */
  estimateCentipawnLoss(analysis, playerMove) {
    // This is a simplified estimation
    // In a full implementation, we'd need to analyze the player's move too
    
    if (analysis.alternativeMoves && analysis.alternativeMoves.length > 1) {
      const bestEval = analysis.alternativeMoves[0].evaluation;
      const secondBestEval = analysis.alternativeMoves[1].evaluation;
      
      if (bestEval && secondBestEval && bestEval.type === 'cp' && secondBestEval.type === 'cp') {
        return Math.abs(bestEval.value - secondBestEval.value);
      }
    }

    // Default estimation based on analysis depth and quality
    if (analysis.analysisQuality > 80) {
      return 150; // Assume significant mistake for high-quality analysis
    }
    
    return 100; // Default moderate mistake
  }

  /**
   * Identify tactical theme from position and best move
   */
  identifyTacticalTheme(analysis, fen, bestMove) {
    // This is a simplified theme identification
    // A full implementation would use more sophisticated pattern recognition
    
    const chess = new Chess(fen);
    const move = chess.move(bestMove);
    
    if (!move) return TACTICAL_THEMES.HANGING_PIECE;

    // Basic pattern recognition
    if (move.captured) {
      return TACTICAL_THEMES.HANGING_PIECE;
    }
    
    if (chess.inCheck()) {
      return TACTICAL_THEMES.MATE_IN_1;
    }
    
    if (analysis.evaluation?.type === 'mate') {
      const mateIn = Math.abs(analysis.evaluation.value);
      if (mateIn === 1) return TACTICAL_THEMES.MATE_IN_1;
      if (mateIn === 2) return TACTICAL_THEMES.MATE_IN_2;
      return TACTICAL_THEMES.MATE_IN_3;
    }

    // Default to hanging piece for now
    return TACTICAL_THEMES.HANGING_PIECE;
  }

  /**
   * Generate human-readable mistake description
   */
  generateMistakeDescription(mistakeType, theme, centipawnLoss) {
    const severity = centipawnLoss >= 200 ? 'major' : centipawnLoss >= 100 ? 'significant' : 'minor';
    
    const descriptions = {
      [MISTAKE_TYPES.BLUNDER]: `${severity} blunder - missed better continuation`,
      [MISTAKE_TYPES.MISTAKE]: `${severity} mistake - inaccurate move`,
      [MISTAKE_TYPES.MISSED_WIN]: 'missed winning opportunity',
      [MISTAKE_TYPES.MISSED_TACTIC]: `missed tactical shot (${theme})`,
      [MISTAKE_TYPES.INACCURACY]: 'slight inaccuracy'
    };

    return descriptions[mistakeType] || 'positional error';
  }

  /**
   * Categorize mistake for puzzle generation
   */
  categorizeMistakeForPuzzles(mistakeType, theme) {
    if (mistakeType === MISTAKE_TYPES.MISSED_TACTIC) {
      return 'fix-weaknesses';
    }
    
    if (mistakeType === MISTAKE_TYPES.MISSED_WIN) {
      return 'learn-mistakes';
    }
    
    return 'fix-weaknesses'; // Default category
  }

  /**
   * Check if it's the player's move
   */
  isPlayerMove(moveNumber, playerColor) {
    const isWhiteMove = moveNumber % 2 === 1;
    return (playerColor === 'white' && isWhiteMove) || (playerColor === 'black' && !isWhiteMove);
  }

  /**
   * Categorize mistakes by type
   */
  categorizeMistakes(mistakes) {
    const categories = {};
    
    for (const mistake of mistakes) {
      const type = mistake.mistakeType;
      if (!categories[type]) {
        categories[type] = [];
      }
      categories[type].push(mistake);
    }

    return categories;
  }

  /**
   * Generate mistake patterns for weakness identification
   */
  async generateMistakePatterns(mistakes) {
    const patterns = {
      mostCommonMistakes: {},
      tacticalWeaknesses: {},
      positionalWeaknesses: {},
      timeBasedPatterns: {}
    };

    // Count mistake types
    for (const mistake of mistakes) {
      const type = mistake.mistakeType;
      patterns.mostCommonMistakes[type] = (patterns.mostCommonMistakes[type] || 0) + 1;
      
      const theme = mistake.theme;
      patterns.tacticalWeaknesses[theme] = (patterns.tacticalWeaknesses[theme] || 0) + 1;
    }

    return patterns;
  }

  /**
   * Get analysis statistics
   */
  async getAnalysisStats(username) {
    const mistakes = await puzzleDataService.getMostFrequentMistakes(50);
    const games = await puzzleDataService.getUserGames(username, 50);

    return {
      totalMistakes: mistakes.length,
      totalGamesAnalyzed: games.filter(g => g.analysisData).length,
      mostCommonMistake: mistakes[0]?.mistakeType || 'none',
      averageMistakesPerGame: games.length > 0 ? (mistakes.length / games.length).toFixed(1) : 0
    };
  }
}

// Create singleton instance
const mistakeAnalysisService = new MistakeAnalysisService();

export default mistakeAnalysisService;
export { mistakeAnalysisService };