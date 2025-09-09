/**
 * Puzzle Database - IndexedDB wrapper for storing puzzles, games, and user progress
 * Provides persistent storage for the dynamic puzzle generation system
 */

class PuzzleDatabase {
  constructor() {
    this.dbName = 'PawnsPosesDB';
    this.version = 2; // Increment version to add username index
    this.db = null;
  }

  // Initialize the database with all required object stores
  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ Puzzle database initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('🔧 Setting up database schema...');

        // User Games Store
        if (!db.objectStoreNames.contains('user_games')) {
          const gamesStore = db.createObjectStore('user_games', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          gamesStore.createIndex('gameId', 'gameId', { unique: true });
          gamesStore.createIndex('platform', 'platform', { unique: false });
          gamesStore.createIndex('username', 'username', { unique: false });
          gamesStore.createIndex('dateAdded', 'dateAdded', { unique: false });
          console.log('📊 Created user_games store');
        }

        // Generated Puzzles Store
        if (!db.objectStoreNames.contains('puzzles')) {
          const puzzlesStore = db.createObjectStore('puzzles', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          puzzlesStore.createIndex('category', 'category', { unique: false });
          puzzlesStore.createIndex('difficulty', 'difficulty', { unique: false });
          puzzlesStore.createIndex('theme', 'theme', { unique: false });
          puzzlesStore.createIndex('sourceGameId', 'sourceGameId', { unique: false });
          puzzlesStore.createIndex('dateGenerated', 'dateGenerated', { unique: false });
          puzzlesStore.createIndex('fen', 'fen', { unique: false });
          console.log('🧩 Created puzzles store');
        }

        // User Mistakes Store (for pattern recognition)
        if (!db.objectStoreNames.contains('user_mistakes')) {
          const mistakesStore = db.createObjectStore('user_mistakes', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          mistakesStore.createIndex('mistakeType', 'mistakeType', { unique: false });
          mistakesStore.createIndex('frequency', 'frequency', { unique: false });
          mistakesStore.createIndex('lastOccurrence', 'lastOccurrence', { unique: false });
          mistakesStore.createIndex('gameId', 'gameId', { unique: false });
          mistakesStore.createIndex('username', 'username', { unique: false });
          console.log('❌ Created user_mistakes store');
        } else {
          // Handle database upgrade - add username index if it doesn't exist
          const transaction = event.target.transaction;
          const mistakesStore = transaction.objectStore('user_mistakes');
          if (!mistakesStore.indexNames.contains('username')) {
            mistakesStore.createIndex('username', 'username', { unique: false });
            console.log('🔧 Added username index to user_mistakes store');
          }
        }

        // Opening Deviations Store
        if (!db.objectStoreNames.contains('opening_deviations')) {
          const openingsStore = db.createObjectStore('opening_deviations', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          openingsStore.createIndex('opening', 'opening', { unique: false });
          openingsStore.createIndex('deviation_move', 'deviation_move', { unique: false });
          openingsStore.createIndex('frequency', 'frequency', { unique: false });
          openingsStore.createIndex('fen', 'fen', { unique: false });
          console.log('📖 Created opening_deviations store');
        } else {
          // Ensure indexes exist on upgrade
          const transaction = event.target.transaction;
          const openingsStore = transaction.objectStore('opening_deviations');
          if (!openingsStore.indexNames.contains('opening')) openingsStore.createIndex('opening', 'opening', { unique: false });
          if (!openingsStore.indexNames.contains('deviation_move')) openingsStore.createIndex('deviation_move', 'deviation_move', { unique: false });
          if (!openingsStore.indexNames.contains('frequency')) openingsStore.createIndex('frequency', 'frequency', { unique: false });
          if (!openingsStore.indexNames.contains('fen')) openingsStore.createIndex('fen', 'fen', { unique: false });
        }

        // User Progress Store
        if (!db.objectStoreNames.contains('user_progress')) {
          const progressStore = db.createObjectStore('user_progress', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          progressStore.createIndex('puzzleId', 'puzzleId', { unique: false });
          progressStore.createIndex('category', 'category', { unique: false });
          progressStore.createIndex('completed', 'completed', { unique: false });
          progressStore.createIndex('dateAttempted', 'dateAttempted', { unique: false });
          console.log('📈 Created user_progress store');
        }

        // User Settings Store
        if (!db.objectStoreNames.contains('user_settings')) {
          const settingsStore = db.createObjectStore('user_settings', { 
            keyPath: 'key' 
          });
          console.log('⚙️ Created user_settings store');
        }

        console.log('✅ Database schema setup complete');
      };
    });
  }

  // === USER GAMES METHODS ===

  async saveUserGame(gameData) {
    const transaction = this.db.transaction(['user_games'], 'readwrite');
    const store = transaction.objectStore('user_games');
    
    const gameId = gameData.gameId || gameData.url || `${Date.now()}_${Math.random()}`;
    
    const gameRecord = {
      gameId: gameId,
      platform: gameData.platform || 'unknown',
      username: gameData.username,
      pgn: gameData.pgn,
      moves: gameData.moves,
      result: gameData.result || gameData.white?.result,
      timeControl: gameData.time_control || gameData.perf,
      playerColor: gameData.playerColor,
      opponentRating: gameData.opponentRating,
      playerRating: gameData.playerRating,
      accuracyData: gameData.accuracyData,
      analysisData: gameData.analysisData,
      dateAdded: new Date().toISOString(),
      rawGameData: gameData
    };

    return new Promise((resolve, reject) => {
      // First check if game already exists
      const checkRequest = store.get(gameId);
      
      checkRequest.onsuccess = () => {
        if (checkRequest.result) {
          // Game already exists, update it
          const updateRequest = store.put(gameRecord);
          updateRequest.onsuccess = () => resolve(updateRequest.result);
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          // Game doesn't exist, add it
          const addRequest = store.add(gameRecord);
          addRequest.onsuccess = () => resolve(addRequest.result);
          addRequest.onerror = () => reject(addRequest.error);
        }
      };
      
      checkRequest.onerror = () => reject(checkRequest.error);
    });
  }

  async getUserGames(username, limit = 50) {
    const transaction = this.db.transaction(['user_games'], 'readonly');
    const store = transaction.objectStore('user_games');
    const index = store.index('username');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(username);
      request.onsuccess = () => {
        const games = request.result
          .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
          .slice(0, limit);
        resolve(games);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getGameById(gameId) {
    const transaction = this.db.transaction(['user_games'], 'readonly');
    const store = transaction.objectStore('user_games');
    const index = store.index('gameId');
    
    return new Promise((resolve, reject) => {
      const request = index.get(gameId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // === PUZZLES METHODS ===

  async savePuzzle(puzzleData) {
    const transaction = this.db.transaction(['puzzles'], 'readwrite');
    const store = transaction.objectStore('puzzles');
    
    const puzzleRecord = {
      fen: puzzleData.fen,
      solution: puzzleData.solution,
      alternativeMoves: puzzleData.alternativeMoves || [],
      category: puzzleData.category, // 'fix-weaknesses', 'learn-mistakes', etc.
      theme: puzzleData.theme, // 'fork', 'pin', 'mate', etc.
      difficulty: puzzleData.difficulty, // 1-5 scale
      objective: puzzleData.objective,
      hint: puzzleData.hint,
      explanation: puzzleData.explanation,
      sourceGameId: puzzleData.sourceGameId,
      sourcePosition: puzzleData.sourcePosition,
      moveNumber: puzzleData.moveNumber,
      centipawnLoss: puzzleData.centipawnLoss,
      dateGenerated: new Date().toISOString(),
      timesAttempted: 0,
      timesCorrect: 0,
      averageTime: 0,
      metadata: puzzleData.metadata || {}
    };

    return new Promise((resolve, reject) => {
      const request = store.add(puzzleRecord);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getPuzzlesByCategory(category, limit = 20) {
    const transaction = this.db.transaction(['puzzles'], 'readonly');
    const store = transaction.objectStore('puzzles');
    const index = store.index('category');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(category);
      request.onsuccess = () => {
        const puzzles = request.result
          .sort((a, b) => new Date(b.dateGenerated) - new Date(a.dateGenerated))
          .slice(0, limit);
        resolve(puzzles);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getPuzzlesByDifficulty(difficulty, limit = 20) {
    const transaction = this.db.transaction(['puzzles'], 'readonly');
    const store = transaction.objectStore('puzzles');
    const index = store.index('difficulty');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(difficulty);
      request.onsuccess = () => resolve(request.result.slice(0, limit));
      request.onerror = () => reject(request.error);
    });
  }

  async getAllPuzzles() {
    const transaction = this.db.transaction(['puzzles'], 'readonly');
    const store = transaction.objectStore('puzzles');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // === USER MISTAKES METHODS ===

  async saveMistake(mistakeData) {
    const transaction = this.db.transaction(['user_mistakes'], 'readwrite');
    const store = transaction.objectStore('user_mistakes');
    
    const mistakeRecord = {
      username: mistakeData.username,
      mistakeType: mistakeData.mistakeType, // 'hanging_piece', 'missed_fork', etc.
      description: mistakeData.description,
      fen: mistakeData.fen,
      correctMove: mistakeData.correctMove,
      playerMove: mistakeData.playerMove,
      centipawnLoss: mistakeData.centipawnLoss,
      gameId: mistakeData.gameId,
      moveNumber: mistakeData.moveNumber,
      frequency: 1,
      lastOccurrence: new Date().toISOString(),
      category: mistakeData.category,
      theme: mistakeData.theme
    };

    return new Promise((resolve, reject) => {
      const request = store.add(mistakeRecord);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getMistakesByType(mistakeType) {
    const transaction = this.db.transaction(['user_mistakes'], 'readonly');
    const store = transaction.objectStore('user_mistakes');
    const index = store.index('mistakeType');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(mistakeType);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getMostFrequentMistakes(limit = 10) {
    const transaction = this.db.transaction(['user_mistakes'], 'readonly');
    const store = transaction.objectStore('user_mistakes');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const mistakes = request.result
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, limit);
        resolve(mistakes);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getUserMistakes(username, limit = 100) {
    const transaction = this.db.transaction(['user_mistakes'], 'readonly');
    const store = transaction.objectStore('user_mistakes');
    const index = store.index('username');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(username);
      request.onsuccess = () => {
        const mistakes = request.result.slice(0, limit);
        resolve(mistakes);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getOpeningDeviations(username, limit = 50) {
    const transaction = this.db.transaction(['opening_deviations'], 'readonly');
    const store = transaction.objectStore('opening_deviations');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const deviations = request.result
          .slice(0, limit);
        resolve(deviations);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveOpeningDeviations(deviations = []) {
    const transaction = this.db.transaction(['opening_deviations'], 'readwrite');
    const store = transaction.objectStore('opening_deviations');

    return Promise.all(deviations.map((dev) => new Promise((resolve, reject) => {
      const record = {
        opening: dev.opening,
        deviation_move: dev.deviation_move,
        correct_move: dev.correct_move,
        fen: dev.fen,
        frequency: dev.frequency || 1,
        gameIds: dev.gameIds || [],
        lastOccurrence: dev.lastOccurrence || new Date().toISOString()
      };
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        // if duplicate or any error, try put to upsert (avoid duplicates on refresh)
        const putReq = store.put({ ...record, id: record.id });
        putReq.onsuccess = () => resolve(putReq.result);
        putReq.onerror = () => reject(putReq.error);
      };
    })));
  }

  // === USER PROGRESS METHODS ===

  async saveProgress(progressData) {
    const transaction = this.db.transaction(['user_progress'], 'readwrite');
    const store = transaction.objectStore('user_progress');
    
    const progressRecord = {
      puzzleId: progressData.puzzleId,
      category: progressData.category,
      completed: progressData.completed,
      correct: progressData.correct,
      timeSpent: progressData.timeSpent,
      hintsUsed: progressData.hintsUsed,
      attempts: progressData.attempts,
      dateAttempted: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const request = store.add(progressRecord);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getProgressByCategory(category) {
    const transaction = this.db.transaction(['user_progress'], 'readonly');
    const store = transaction.objectStore('user_progress');
    const index = store.index('category');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(category);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // === SETTINGS METHODS ===

  async saveSetting(key, value) {
    const transaction = this.db.transaction(['user_settings'], 'readwrite');
    const store = transaction.objectStore('user_settings');
    
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value, lastUpdated: new Date().toISOString() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSetting(key, defaultValue = null) {
    const transaction = this.db.transaction(['user_settings'], 'readonly');
    const store = transaction.objectStore('user_settings');
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : defaultValue);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // === UTILITY METHODS ===

  async clearAllData() {
    const storeNames = ['user_games', 'puzzles', 'user_mistakes', 'opening_deviations', 'user_progress'];
    const transaction = this.db.transaction(storeNames, 'readwrite');
    
    const promises = storeNames.map(storeName => {
      return new Promise((resolve, reject) => {
        const request = transaction.objectStore(storeName).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);
    console.log('🗑️ All puzzle data cleared');
  }

  async getStorageStats() {
    const storeNames = ['user_games', 'puzzles', 'user_mistakes', 'opening_deviations', 'user_progress'];
    const transaction = this.db.transaction(storeNames, 'readonly');
    
    const stats = {};
    
    for (const storeName of storeNames) {
      const store = transaction.objectStore(storeName);
      const count = await new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      stats[storeName] = count;
    }
    
    return stats;
  }

  // === CLEAR/DELETE METHODS ===

  /**
   * Clear all data from a specific store
   */
  async clearStore(storeName) {
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => {
        console.log(`🗑️ Cleared all data from ${storeName} store`);
        resolve();
      };
      request.onerror = () => {
        console.error(`❌ Failed to clear ${storeName} store:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clear all data from all stores
   */
  async clearAllData() {
    const storeNames = ['user_games', 'puzzles', 'user_mistakes', 'opening_deviations', 'user_progress', 'user_settings'];
    
    console.log('🗑️ Clearing all data from IndexedDB...');
    
    try {
      for (const storeName of storeNames) {
        await this.clearStore(storeName);
      }
      console.log('✅ All IndexedDB data cleared successfully');
    } catch (error) {
      console.error('❌ Failed to clear all data:', error);
      throw error;
    }
  }

  /**
   * Delete the entire database (nuclear option)
   */
  async deleteDatabase() {
    return new Promise((resolve, reject) => {
      // Close current connection first
      this.close();
      
      const deleteRequest = indexedDB.deleteDatabase(this.dbName);
      
      deleteRequest.onsuccess = () => {
        console.log('🗑️ Database deleted completely');
        resolve();
      };
      
      deleteRequest.onerror = () => {
        console.error('❌ Failed to delete database:', deleteRequest.error);
        reject(deleteRequest.error);
      };
      
      deleteRequest.onblocked = () => {
        console.warn('⚠️ Database deletion blocked - close all tabs');
        reject(new Error('Database deletion blocked'));
      };
    });
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('📊 Database connection closed');
    }
  }
}

// Create singleton instance
const puzzleDB = new PuzzleDatabase();

export default puzzleDB;

// Export utility functions
export const initializePuzzleDatabase = async () => {
  try {
    await puzzleDB.initialize();
    return puzzleDB;
  } catch (error) {
    console.error('Failed to initialize puzzle database:', error);
    throw error;
  }
};

export const getPuzzleDatabase = () => puzzleDB;