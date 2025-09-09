/**
 * Puzzle Data Service
 * High-level service for managing puzzle data operations
 * Provides a clean API for the puzzle generation system
 */

import puzzleDB, { initializePuzzleDatabase } from '../utils/puzzleDatabase.js';
import { 
  PuzzleModel, 
  UserGameModel, 
  UserMistakeModel, 
  UserProgressModel,
  PUZZLE_CATEGORIES,
  DIFFICULTY_LEVELS 
} from '../utils/dataModels.js';

class PuzzleDataService {
  constructor() {
    this.isInitialized = false;
    this.initPromise = null;
  }

  // Initialize the service and database
  async initialize() {
    if (this.isInitialized) return;
    
    if (!this.initPromise) {
      this.initPromise = this._doInitialize();
    }
    
    return this.initPromise;
  }

  async _doInitialize() {
    try {
      await initializePuzzleDatabase();
      this.isInitialized = true;
      console.log('✅ Puzzle Data Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Puzzle Data Service:', error);
      throw error;
    }
  }

  // === USER GAMES MANAGEMENT ===

  /**
   * Store user games from API fetch
   */
  async storeUserGames(games, username, platform) {
    await this.initialize();
    
    console.log(`💾 Storing ${games.length} games for ${username} (${platform})`);
    
    const storedGames = [];
    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;

    for (const game of games) {
      try {
        // Enhance game data with additional info
        const enhancedGame = {
          ...game,
          username,
          platform,
          playerColor: this._determinePlayerColor(game, username),
          playerRating: this._extractPlayerRating(game, username),
          opponentRating: this._extractOpponentRating(game, username)
        };

        const gameModel = new UserGameModel(enhancedGame);
        
        if (gameModel.isValid()) {
          const gameId = await puzzleDB.saveUserGame(gameModel);
          storedGames.push({ ...gameModel, id: gameId });
          successCount++;
        } else {
          console.warn('Invalid game data, skipping:', game);
          errorCount++;
        }
      } catch (error) {
        if (error.name === 'ConstraintError' && error.message.includes('uniqueness')) {
          duplicateCount++;
          console.log(`🔄 Duplicate game skipped: ${game.url || game.gameId || 'unknown'}`);
        } else {
          console.warn('Failed to store game:', error);
          errorCount++;
        }
      }
    }

    console.log(`✅ Stored ${successCount} games, ${duplicateCount} duplicates skipped, ${errorCount} errors`);
    return storedGames;
  }

  /**
   * Get stored games for a user
   */
  async getUserGames(username, limit = 50) {
    await this.initialize();
    return await puzzleDB.getUserGames(username, limit);
  }

  /**
   * Get a specific game by ID
   */
  async getGameById(gameId) {
    await this.initialize();
    return await puzzleDB.getGameById(gameId);
  }

  // === PUZZLE MANAGEMENT ===

  /**
   * Store generated puzzles
   */
  async storePuzzles(puzzles) {
    await this.initialize();
    
    console.log(`💾 Storing ${puzzles.length} generated puzzles`);
    
    const storedPuzzles = [];
    let successCount = 0;

    for (const puzzle of puzzles) {
      try {
        const puzzleModel = new PuzzleModel(puzzle);
        
        if (puzzleModel.isValid()) {
          const puzzleId = await puzzleDB.savePuzzle(puzzleModel);
          storedPuzzles.push({ ...puzzleModel, id: puzzleId });
          successCount++;
        } else {
          console.warn('Invalid puzzle data, skipping:', puzzle);
        }
      } catch (error) {
        console.warn('Failed to store puzzle:', error);
      }
    }

    console.log(`✅ Stored ${successCount} puzzles`);
    return storedPuzzles;
  }

  /**
   * Store opening deviations found during analysis
   */
  async saveOpeningDeviations(deviations) {
    await this.initialize();
    try {
      await puzzleDB.saveOpeningDeviations(deviations);
    } catch (e) {
      console.warn('saveOpeningDeviations not implemented in DB or failed:', e);
    }
  }

  /**
   * Get puzzles by category
   */
  async getPuzzlesByCategory(category, limit = 20) {
    await this.initialize();
    
    const puzzles = await puzzleDB.getPuzzlesByCategory(category, limit);
    return puzzles.map(p => new PuzzleModel(p));
  }

  /**
   * Get puzzles by difficulty
   */
  async getPuzzlesByDifficulty(difficulty, limit = 20) {
    await this.initialize();
    
    const puzzles = await puzzleDB.getPuzzlesByDifficulty(difficulty, limit);
    return puzzles.map(p => new PuzzleModel(p));
  }

  /**
   * Get all puzzles
   */
  async getAllPuzzles() {
    await this.initialize();
    
    const puzzles = await puzzleDB.getAllPuzzles();
    return puzzles.map(p => new PuzzleModel(p));
  }

  /**
   * Get adaptive puzzle selection for user
   */
  async getAdaptivePuzzles(category, userRating = 1500, limit = 10) {
    await this.initialize();
    
    // Get all puzzles for category
    const allPuzzles = await this.getPuzzlesByCategory(category, 100);
    
    if (allPuzzles.length === 0) {
      return [];
    }

    // Calculate target difficulty based on user rating
    let targetDifficulty = DIFFICULTY_LEVELS.MEDIUM;
    if (userRating < 1200) targetDifficulty = DIFFICULTY_LEVELS.BEGINNER;
    else if (userRating < 1500) targetDifficulty = DIFFICULTY_LEVELS.EASY;
    else if (userRating < 1800) targetDifficulty = DIFFICULTY_LEVELS.MEDIUM;
    else if (userRating < 2100) targetDifficulty = DIFFICULTY_LEVELS.HARD;
    else targetDifficulty = DIFFICULTY_LEVELS.EXPERT;

    // Filter and sort puzzles
    const adaptivePuzzles = allPuzzles
      .filter(puzzle => {
        // Prefer puzzles close to target difficulty
        const difficultyDiff = Math.abs(puzzle.difficulty - targetDifficulty);
        return difficultyDiff <= 1;
      })
      .sort((a, b) => {
        // Sort by success rate (lower success rate = needs more practice)
        const aSuccessRate = a.getSuccessRate();
        const bSuccessRate = b.getSuccessRate();
        
        if (aSuccessRate === bSuccessRate) {
          // Secondary sort by recency
          return new Date(b.dateGenerated) - new Date(a.dateGenerated);
        }
        
        return aSuccessRate - bSuccessRate;
      })
      .slice(0, limit);

    return adaptivePuzzles;
  }

  // === MISTAKE TRACKING ===

  /**
   * Store user mistakes
   */
  async storeMistakes(mistakes) {
    await this.initialize();
    
    console.log(`💾 Storing ${mistakes.length} user mistakes`);
    
    const storedMistakes = [];
    
    for (const mistake of mistakes) {
      try {
        const mistakeModel = new UserMistakeModel(mistake);
        
        if (mistakeModel.isValid()) {
          const mistakeId = await puzzleDB.saveMistake(mistakeModel);
          storedMistakes.push({ ...mistakeModel, id: mistakeId });
        }
      } catch (error) {
        console.warn('Failed to store mistake:', error);
      }
    }

    return storedMistakes;
  }

  /**
   * Get most frequent mistakes for weakness analysis
   */
  async getMostFrequentMistakes(limit = 10) {
    await this.initialize();
    return await puzzleDB.getMostFrequentMistakes(limit);
  }

  /**
   * Get mistakes by type
   */
  async getMistakesByType(mistakeType) {
    await this.initialize();
    return await puzzleDB.getMistakesByType(mistakeType);
  }

  /**
   * Get all mistakes for a specific user
   */
  async getUserMistakes(username, limit = 100) {
    await this.initialize();
    return await puzzleDB.getUserMistakes(username, limit);
  }

  /**
   * Get opening deviations for a specific user
   */
  async getOpeningDeviations(username, limit = 50) {
    await this.initialize();
    return await puzzleDB.getOpeningDeviations(username, limit);
  }

  // === PROGRESS TRACKING ===

  /**
   * Record puzzle attempt
   */
  async recordPuzzleAttempt(puzzleId, category, correct, timeSpent, hintsUsed = 0) {
    await this.initialize();
    
    const progressData = {
      puzzleId,
      category,
      completed: true,
      correct,
      timeSpent,
      hintsUsed,
      attempts: 1
    };

    const progressModel = new UserProgressModel(progressData);
    return await puzzleDB.saveProgress(progressModel);
  }

  /**
   * Get progress statistics by category
   */
  async getProgressStats(category) {
    await this.initialize();
    
    const progress = await puzzleDB.getProgressByCategory(category);
    
    if (progress.length === 0) {
      return {
        totalAttempts: 0,
        correctAttempts: 0,
        accuracy: 0,
        averageTime: 0,
        hintsUsed: 0
      };
    }

    const totalAttempts = progress.length;
    const correctAttempts = progress.filter(p => p.correct).length;
    const accuracy = (correctAttempts / totalAttempts) * 100;
    const averageTime = progress.reduce((sum, p) => sum + p.timeSpent, 0) / totalAttempts;
    const hintsUsed = progress.reduce((sum, p) => sum + p.hintsUsed, 0);

    return {
      totalAttempts,
      correctAttempts,
      accuracy: Math.round(accuracy),
      averageTime: Math.round(averageTime),
      hintsUsed
    };
  }

  // === STATISTICS AND ANALYTICS ===

  /**
   * Get comprehensive user statistics
   */
  async getUserStats() {
    await this.initialize();
    
    const stats = await puzzleDB.getStorageStats();
    
    // Get category-specific stats
    const categoryStats = {};
    for (const category of Object.values(PUZZLE_CATEGORIES)) {
      categoryStats[category] = await this.getProgressStats(category);
    }

    return {
      storage: stats,
      categories: categoryStats,
      totalPuzzles: stats.puzzles || 0,
      totalGames: stats.user_games || 0,
      totalMistakes: stats.user_mistakes || 0
    };
  }

  /**
   * Check if user has enough data for puzzle generation
   */
  async hasEnoughDataForGeneration(minGames = 5) {
    await this.initialize();
    
    const stats = await puzzleDB.getStorageStats();
    return (stats.user_games || 0) >= minGames;
  }

  /**
   * Get puzzle generation readiness status
   */
  async getPuzzleGenerationStatus() {
    await this.initialize();
    
    const stats = await puzzleDB.getStorageStats();
    const hasGames = (stats.user_games || 0) > 0;
    const hasPuzzles = (stats.puzzles || 0) > 0;
    const hasEnoughGames = (stats.user_games || 0) >= 5;

    return {
      hasGames,
      hasPuzzles,
      hasEnoughGames,
      gameCount: stats.user_games || 0,
      puzzleCount: stats.puzzles || 0,
      canGenerate: hasEnoughGames,
      needsMoreGames: !hasEnoughGames && hasGames,
      needsInitialSetup: !hasGames
    };
  }

  // === UTILITY METHODS ===

  /**
   * Clear all data (for testing/reset)
   */
  async clearAllData() {
    await this.initialize();
    await puzzleDB.clearAllData();
    console.log('🗑️ All puzzle data cleared');
  }

  /**
   * Get database storage statistics
   */
  async getStorageStats() {
    await this.initialize();
    return await puzzleDB.getStorageStats();
  }

  // === PRIVATE HELPER METHODS ===

  _determinePlayerColor(game, username) {
    if (game.white?.username === username) return 'white';
    if (game.black?.username === username) return 'black';
    
    // For Lichess format
    if (game.players) {
      if (game.players.white?.user?.name === username) return 'white';
      if (game.players.black?.user?.name === username) return 'black';
    }
    
    return 'unknown';
  }

  _extractPlayerRating(game, username) {
    const color = this._determinePlayerColor(game, username);
    
    if (color === 'white') {
      return game.white?.rating || game.players?.white?.rating || 0;
    } else if (color === 'black') {
      return game.black?.rating || game.players?.black?.rating || 0;
    }
    
    return 0;
  }

  _extractOpponentRating(game, username) {
    const color = this._determinePlayerColor(game, username);
    
    if (color === 'white') {
      return game.black?.rating || game.players?.black?.rating || 0;
    } else if (color === 'black') {
      return game.white?.rating || game.players?.white?.rating || 0;
    }
    
    return 0;
  }

  // === DATA MANAGEMENT METHODS ===

  /**
   * Clear all stored data (for fresh analysis)
   */
  async clearAllData() {
    await this.initialize();
    return await puzzleDB.clearAllData();
  }

  /**
   * Clear specific data store
   */
  async clearStore(storeName) {
    await this.initialize();
    return await puzzleDB.clearStore(storeName);
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    await this.initialize();
    return await puzzleDB.getStorageStats();
  }
}

// Create singleton instance
const puzzleDataService = new PuzzleDataService();

export default puzzleDataService;

// Export for direct usage
export { puzzleDataService };