/**
 * Opening Analysis Service
 * Analyzes opening play and identifies deviations from theory
 * Supports opening-based puzzle generation
 */

import { Chess } from 'chess.js';
import puzzleDataService from './puzzleDataService.js';
import { OpeningDeviationModel } from '../utils/dataModels.js';

class OpeningAnalysisService {
  constructor() {
    this.openingDatabase = this.initializeOpeningDatabase();
  }

  /**
   * Initialize basic opening database
   * In a full implementation, this would be loaded from a comprehensive database
   */
  initializeOpeningDatabase() {
    return {
      // Sicilian Defense
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1': {
        name: 'King\'s Pawn Opening',
        mainLines: ['c5', 'e5', 'e6', 'c6', 'd6'],
        bestMove: 'c5',
        category: 'sicilian'
      },
      'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2': {
        name: 'Sicilian Defense',
        mainLines: ['Nf3', 'Nc3', 'f4'],
        bestMove: 'Nf3',
        category: 'sicilian'
      },
      
      // French Defense
      'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2': {
        name: 'French Defense',
        mainLines: ['d4', 'exd5', 'Nc3'],
        bestMove: 'd4',
        category: 'french'
      },
      
      // Caro-Kann Defense
      'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2': {
        name: 'Caro-Kann Defense',
        mainLines: ['d4', 'exd5', 'Nc3'],
        bestMove: 'd4',
        category: 'caro_kann'
      },
      
      // Queen's Gambit
      'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1': {
        name: 'Queen\'s Pawn Opening',
        mainLines: ['d5', 'Nf6', 'e6', 'c5'],
        bestMove: 'd5',
        category: 'queens_pawn'
      },
      'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2': {
        name: 'Queen\'s Gambit',
        mainLines: ['dxc4', 'e6', 'c6', 'Nf6'],
        bestMove: 'dxc4',
        category: 'queens_gambit'
      },
      
      // English Opening
      'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1': {
        name: 'English Opening',
        mainLines: ['e5', 'Nf6', 'c5', 'e6'],
        bestMove: 'e5',
        category: 'english'
      },
      
      // Ruy Lopez
      'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3': {
        name: 'Ruy Lopez',
        mainLines: ['a6', 'Nf6', 'f5', 'Be7'],
        bestMove: 'a6',
        category: 'ruy_lopez'
      },
      
      // Italian Game
      'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3': {
        name: 'Italian Game',
        mainLines: ['Be7', 'Nf6', 'f5'],
        bestMove: 'Be7',
        category: 'italian'
      }
    };
  }

  /**
   * Analyze all stored games for opening deviations
   */
  async analyzeAllGamesForOpenings(username, options = {}) {
    const {
      maxGames = 20,
      onProgress = () => {}
    } = options;

    console.log(`📖 Starting opening analysis for ${username}...`);

    try {
      // Get stored games
      const games = await puzzleDataService.getUserGames(username, maxGames);
      
      if (games.length === 0) {
        throw new Error('No games found for analysis. Please fetch games first.');
      }

      console.log(`📊 Analyzing ${games.length} games for opening deviations...`);

      const allDeviations = [];
      const openingStats = {};

      for (let i = 0; i < games.length; i++) {
        const game = games[i];
        
        onProgress({
          current: i + 1,
          total: games.length,
          stage: 'analyzing_opening',
          message: `Analyzing game ${i + 1}/${games.length}`,
          gameId: game.gameId
        });

        try {
          const gameDeviations = await this.analyzeGameOpenings(game);
          allDeviations.push(...gameDeviations);

          // Track opening statistics
          for (const deviation of gameDeviations) {
            const opening = deviation.opening;
            if (!openingStats[opening]) {
              openingStats[opening] = {
                count: 0,
                deviations: 0,
                accuracy: []
              };
            }
            openingStats[opening].count++;
            openingStats[opening].deviations++;
          }

        } catch (error) {
          console.warn(`❌ Failed to analyze openings in game ${game.gameId}:`, error.message);
        }
      }

      // Store all detected deviations
      if (allDeviations.length > 0) {
        await this.storeOpeningDeviations(allDeviations);
        console.log(`💾 Stored ${allDeviations.length} opening deviations in database`);
      }

      const analysisResult = {
        totalGames: games.length,
        totalDeviations: allDeviations.length,
        openingStats: openingStats,
        mostCommonDeviations: this.findMostCommonDeviations(allDeviations),
        averageDeviationsPerGame: (allDeviations.length / games.length).toFixed(1)
      };

      console.log(`✅ Opening analysis complete:`);
      console.log(`   📖 ${allDeviations.length} deviations found in ${games.length} games`);

      return analysisResult;

    } catch (error) {
      console.error('Opening analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze a single game for opening deviations
   */
  async analyzeGameOpenings(game) {
    console.log(`📖 Analyzing openings in game ${game.gameId}...`);

    const chess = new Chess();
    const deviations = [];

    // Load the game moves
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

    // Analyze first 15 moves (opening phase)
    const openingMoves = Math.min(15, moves.length);
    
    for (let i = 0; i < openingMoves; i++) {
      const currentFen = chess.fen();
      const playerMove = moves[i];
      const moveNumber = Math.floor(i / 2) + 1;
      const isPlayerMove = this.isPlayerMove(i, game.playerColor);

      // Only analyze player's moves
      if (!isPlayerMove) {
        chess.move(playerMove);
        continue;
      }

      // Check if this position is in our opening database
      const openingInfo = this.openingDatabase[currentFen];
      
      if (openingInfo) {
        const playerMoveNotation = playerMove.san;
        const isMainLine = openingInfo.mainLines.includes(playerMoveNotation);
        const isBestMove = openingInfo.bestMove === playerMoveNotation;

        if (!isMainLine && !isBestMove) {
          // This is a deviation from theory
          const deviation = new OpeningDeviationModel({
            opening: openingInfo.name,
            deviation_move: playerMoveNotation,
            correct_move: openingInfo.bestMove,
            fen: currentFen,
            frequency: 1,
            gameIds: [game.gameId],
            lastOccurrence: new Date().toISOString()
          });

          deviations.push(deviation);
          
          console.log(`📖 Opening deviation found: ${openingInfo.name} - played ${playerMoveNotation}, theory suggests ${openingInfo.bestMove}`);
        }
      }

      chess.move(playerMove);
    }

    return deviations;
  }

  /**
   * Store opening deviations in database
   */
  async storeOpeningDeviations(deviations) {
    // Group deviations by position to avoid duplicates
    const deviationMap = new Map();

    for (const deviation of deviations) {
      const key = `${deviation.fen}_${deviation.deviation_move}`;
      
      if (deviationMap.has(key)) {
        const existing = deviationMap.get(key);
        existing.frequency++;
        existing.gameIds.push(...deviation.gameIds);
        existing.lastOccurrence = deviation.lastOccurrence;
      } else {
        deviationMap.set(key, deviation);
      }
    }

    // Store unique deviations
    const uniqueDeviations = Array.from(deviationMap.values());

    try {
      // Persist to IndexedDB for use by opening puzzles
      if (typeof puzzleDataService.saveOpeningDeviations === 'function') {
        await puzzleDataService.saveOpeningDeviations(uniqueDeviations);
        console.log(`📖 Stored ${uniqueDeviations.length} unique opening deviations`);
      } else {
        console.log(`📖 Opening deviations ready (${uniqueDeviations.length}), but saveOpeningDeviations not implemented`);
      }
    } catch (e) {
      console.warn('Failed to store opening deviations:', e);
    }
    
    return uniqueDeviations;
  }

  /**
   * Find most common opening deviations
   */
  findMostCommonDeviations(deviations) {
    const deviationCounts = {};

    for (const deviation of deviations) {
      const key = `${deviation.opening} - ${deviation.deviation_move}`;
      deviationCounts[key] = (deviationCounts[key] || 0) + 1;
    }

    return Object.entries(deviationCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([deviation, count]) => ({ deviation, count }));
  }

  /**
   * Get opening recommendations for a position
   */
  getOpeningRecommendation(fen) {
    const openingInfo = this.openingDatabase[fen];
    
    if (openingInfo) {
      return {
        opening: openingInfo.name,
        bestMove: openingInfo.bestMove,
        mainLines: openingInfo.mainLines,
        category: openingInfo.category,
        explanation: this.generateOpeningExplanation(openingInfo)
      };
    }

    return null;
  }

  /**
   * Generate explanation for opening recommendation
   */
  generateOpeningExplanation(openingInfo) {
    const explanations = {
      sicilian: 'The Sicilian Defense is Black\'s most popular and best-scoring response to 1.e4, fighting for central control.',
      french: 'The French Defense leads to rich positional play with typical pawn structures and piece development patterns.',
      caro_kann: 'The Caro-Kann Defense is a solid choice that avoids the tactical complications of other defenses.',
      queens_gambit: 'The Queen\'s Gambit is one of the oldest and most respected openings, offering White good central control.',
      english: 'The English Opening is a flexible system that can transpose into many different pawn structures.',
      ruy_lopez: 'The Ruy Lopez is one of the oldest chess openings, focusing on controlling the center and developing pieces.',
      italian: 'The Italian Game leads to open, tactical positions with quick development and central control.'
    };

    return explanations[openingInfo.category] || 'This opening focuses on sound development and central control.';
  }

  /**
   * Check if it's the player's move
   */
  isPlayerMove(moveIndex, playerColor) {
    const isWhiteMove = moveIndex % 2 === 0;
    return (playerColor === 'white' && isWhiteMove) || (playerColor === 'black' && !isWhiteMove);
  }

  /**
   * Get opening statistics for a user
   */
  async getOpeningStats(username) {
    // This would query the database for stored opening deviations
    // For now, return a placeholder
    return {
      totalDeviations: 0,
      mostCommonDeviation: 'None analyzed yet',
      openingsPlayed: [],
      accuracy: 0
    };
  }

  /**
   * Generate opening-based puzzles
   */
  generateOpeningPuzzles(deviations, limit = 10) {
    const puzzles = [];

    for (const deviation of deviations.slice(0, limit)) {
      const puzzle = {
        fen: deviation.fen,
        solution: deviation.correct_move,
        category: 'master-openings',
        theme: 'opening_theory',
        difficulty: 2, // Opening puzzles are generally easier
        objective: `Find the best move in the ${deviation.opening}`,
        hint: `This is a key position in the ${deviation.opening}. Look for the most principled continuation.`,
        explanation: `The correct move is ${deviation.correct_move}. ${this.generateOpeningExplanation({ category: deviation.opening.toLowerCase().replace(/[^a-z]/g, '_') })}`,
        sourceGameId: deviation.gameIds[0],
        moveNumber: 5, // Approximate opening move
        metadata: {
          opening: deviation.opening,
          deviationMove: deviation.deviation_move,
          frequency: deviation.frequency
        }
      };

      puzzles.push(puzzle);
    }

    return puzzles;
  }
}

// Create singleton instance
const openingAnalysisService = new OpeningAnalysisService();

export default openingAnalysisService;
export { openingAnalysisService };