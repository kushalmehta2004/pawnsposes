/**
 * Puzzle Pre-fetch Service
 * Pre-fetches and caches puzzles for instant display
 * Ensures puzzles are ready when users navigate to puzzle pages
 */

import puzzleGenerationService from './puzzleGenerationService.js';
import { initializePuzzleDatabase, getPuzzleDatabase } from '../utils/puzzleDatabase.js';

class PuzzlePrefetchService {
  constructor() {
    this.prefetchInProgress = new Set();
    this.CACHE_VERSION = 'v11-adaptive-4to16plies';
  }

  /**
   * Get cache key for a specific puzzle type
   */
  getCacheKey(username, puzzleType, difficulty = null) {
    const user = username || 'anonymous';
    const diff = difficulty ? `:${difficulty}` : '';
    return `pawnsposes:puzzles:${user}:${puzzleType}${diff}:${this.CACHE_VERSION}`;
  }

  /**
   * Check if puzzles are already cached
   */
  async isCached(username, puzzleType, difficulty = null) {
    try {
      await initializePuzzleDatabase();
      const db = getPuzzleDatabase();
      const cacheKey = this.getCacheKey(username, puzzleType, difficulty);
      const cached = await db.getSetting(cacheKey, null);
      
      return cached && Array.isArray(cached.puzzles) && cached.puzzles.length > 0;
    } catch (error) {
      console.warn('⚠️ Error checking puzzle cache:', error);
      return false;
    }
  }

  /**
   * Get cached puzzles
   */
  async getCachedPuzzles(username, puzzleType, difficulty = null) {
    try {
      await initializePuzzleDatabase();
      const db = getPuzzleDatabase();
      const cacheKey = this.getCacheKey(username, puzzleType, difficulty);
      const cached = await db.getSetting(cacheKey, null);
      
      if (cached && Array.isArray(cached.puzzles) && cached.puzzles.length > 0) {
        console.log(`♻️ Retrieved ${cached.puzzles.length} cached puzzles for ${puzzleType}`);
        return cached;
      }
      
      return null;
    } catch (error) {
      console.warn('⚠️ Error retrieving cached puzzles:', error);
      return null;
    }
  }

  /**
   * Cache puzzles for a specific type
   */
  async cachePuzzles(username, puzzleType, puzzles, metadata = {}, difficulty = null) {
    try {
      await initializePuzzleDatabase();
      const db = getPuzzleDatabase();
      const cacheKey = this.getCacheKey(username, puzzleType, difficulty);
      
      const cacheData = {
        puzzles,
        metadata,
        cachedAt: new Date().toISOString(),
        version: this.CACHE_VERSION
      };
      
      await db.saveSetting(cacheKey, cacheData);
      console.log(`💾 Cached ${puzzles.length} puzzles for ${puzzleType}`);
      
      return true;
    } catch (error) {
      console.error('❌ Error caching puzzles:', error);
      return false;
    }
  }

  /**
   * Pre-fetch puzzles for all difficulty levels of a puzzle type
   */
  async prefetchPuzzleType(username, puzzleType, analysisData = null) {
    const prefetchKey = `${username}:${puzzleType}`;
    
    // Prevent duplicate pre-fetching
    if (this.prefetchInProgress.has(prefetchKey)) {
      console.log(`⏳ Pre-fetch already in progress for ${puzzleType}`);
      return { success: false, reason: 'already_in_progress' };
    }

    this.prefetchInProgress.add(prefetchKey);

    try {
      console.log(`🚀 Pre-fetching puzzles for ${puzzleType}...`);

      let puzzles = [];
      let metadata = {};

      switch (puzzleType) {
        case 'fix-weaknesses': {
          // Pre-fetch for all difficulty levels
          const difficulties = ['easy', 'medium', 'hard'];
          const results = await Promise.all(
            difficulties.map(async (difficulty) => {
              const isCached = await this.isCached(username, puzzleType, difficulty);
              if (isCached) {
                console.log(`✅ ${puzzleType} (${difficulty}) already cached`);
                return { difficulty, cached: true };
              }

              const puzzles = await puzzleGenerationService.generateWeaknessPuzzles(
                username, 
                { maxPuzzles: 10, difficulty }
              );

              const metadata = {
                title: 'Fix My Weaknesses',
                subtitle: 'Puzzles targeting your recurring mistake patterns',
                description: 'These puzzles are generated from your most common mistakes to help you improve.',
                difficulty
              };

              await this.cachePuzzles(username, puzzleType, puzzles, metadata, difficulty);
              
              return { difficulty, cached: false, count: puzzles.length };
            })
          );

          console.log(`✅ Pre-fetched fix-weaknesses for all difficulties:`, results);
          return { success: true, results };
        }

        case 'master-openings': {
          // Extract top opening families from analysis data
          let topFamilies = analysisData?.performanceMetrics?.topOpeningFamilies || [];
          
          if (!Array.isArray(topFamilies) || topFamilies.length === 0) {
            const freq = analysisData?.performanceMetrics?.openingFrequencies;
            if (freq && typeof freq === 'object') {
              const best = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
              if (best) topFamilies = [best];
            }
          }

          // Normalize family names
          const normalizeFamily = (name) => {
            const n = String(name || '').replace(/'/g, "'").trim();
            if (/king'?s\s*pawn/i.test(n)) return "King's Pawn Game";
            if (/french/i.test(n)) return 'French Defense';
            if (/scotch|scoth/i.test(n)) return 'Scotch Game';
            if (/english(\s+opening)?/i.test(n)) return 'English Opening';
            if (/caro[-\s]?kann/i.test(n)) return 'Caro-Kann Defense';
            if (/queen'?s\s+gambit/i.test(n)) return "Queen's Gambit";
            if (/sicilian/i.test(n)) return 'Sicilian Defense';
            if (/ruy\s+lopez/i.test(n)) return 'Ruy Lopez';
            if (/four\s+knights/i.test(n)) return 'Four Knights Game';
            if (/queen'?s\s+pawn/i.test(n)) return "Queen's Pawn Game";
            if (/italian\s+game/i.test(n)) return 'Italian Game';
            return n;
          };

          const normalizedFamilies = Array.isArray(topFamilies) ? topFamilies.map(normalizeFamily) : [];
          const singleTop = normalizedFamilies.length ? [normalizedFamilies[0]] : [];

          // Pre-fetch for all difficulty levels
          const difficulties = ['easy', 'medium', 'hard'];
          const results = await Promise.all(
            difficulties.map(async (difficulty) => {
              const isCached = await this.isCached(username, puzzleType, difficulty);
              if (isCached) {
                console.log(`✅ ${puzzleType} (${difficulty}) already cached`);
                return { difficulty, cached: true };
              }

              const puzzles = await puzzleGenerationService.generateOpeningPuzzles(
                username,
                { maxPuzzles: 10, difficulty, preferredFamilies: singleTop }
              );

              const sub = (singleTop && singleTop.length)
                ? `Puzzles from your most played opening: ${singleTop[0]}`
                : 'Key positions from your opening repertoire';

              const metadata = {
                title: 'Master My Openings',
                subtitle: sub,
                description: 'Improve your understanding of your favorite openings.',
                difficulty
              };

              await this.cachePuzzles(username, puzzleType, puzzles, metadata, difficulty);
              
              return { difficulty, cached: false, count: puzzles.length };
            })
          );

          console.log(`✅ Pre-fetched master-openings for all difficulties:`, results);
          return { success: true, results };
        }

        case 'sharpen-endgame': {
          // Pre-fetch for all difficulty levels
          const difficulties = ['easy', 'medium', 'hard'];
          const results = await Promise.all(
            difficulties.map(async (difficulty) => {
              const isCached = await this.isCached(username, puzzleType, difficulty);
              if (isCached) {
                console.log(`✅ ${puzzleType} (${difficulty}) already cached`);
                return { difficulty, cached: true };
              }

              const puzzles = await puzzleGenerationService.generateEndgamePuzzles(
                { maxPuzzles: 10, difficulty }
              );

              const metadata = {
                title: 'Sharpen My Endgame',
                subtitle: 'Essential endgame techniques',
                description: 'Master fundamental endgame positions and techniques.',
                difficulty
              };

              await this.cachePuzzles(username, puzzleType, puzzles, metadata, difficulty);
              
              return { difficulty, cached: false, count: puzzles.length };
            })
          );

          console.log(`✅ Pre-fetched sharpen-endgame for all difficulties:`, results);
          return { success: true, results };
        }

        default:
          console.warn(`⚠️ Unknown puzzle type: ${puzzleType}`);
          return { success: false, reason: 'unknown_type' };
      }
    } catch (error) {
      console.error(`❌ Error pre-fetching ${puzzleType}:`, error);
      return { success: false, error: error.message };
    } finally {
      this.prefetchInProgress.delete(prefetchKey);
    }
  }

  /**
   * Pre-fetch all puzzle types for a user
   * This is called after report generation completes
   */
  async prefetchAllPuzzles(username, analysisData = null) {
    console.log(`🚀 Starting pre-fetch for all puzzle types for ${username}...`);

    const puzzleTypes = [
      'fix-weaknesses',
      'master-openings',
      'sharpen-endgame'
    ];

    try {
      const results = await Promise.allSettled(
        puzzleTypes.map(type => this.prefetchPuzzleType(username, type, analysisData))
      );

      const summary = results.map((result, index) => ({
        type: puzzleTypes[index],
        status: result.status,
        data: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason : null
      }));

      console.log(`✅ Pre-fetch complete for ${username}:`, summary);

      return {
        success: true,
        summary
      };
    } catch (error) {
      console.error('❌ Error during pre-fetch:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clear cached puzzles for a user
   */
  async clearCache(username, puzzleType = null) {
    try {
      await initializePuzzleDatabase();
      const db = getPuzzleDatabase();

      if (puzzleType) {
        // Clear specific puzzle type (all difficulties)
        const difficulties = ['easy', 'medium', 'hard'];
        for (const difficulty of difficulties) {
          const cacheKey = this.getCacheKey(username, puzzleType, difficulty);
          await db.deleteSetting(cacheKey);
        }
        console.log(`🗑️ Cleared cache for ${puzzleType}`);
      } else {
        // Clear all puzzle types
        const puzzleTypes = ['fix-weaknesses', 'master-openings', 'sharpen-endgame', 'learn-mistakes'];
        const difficulties = ['easy', 'medium', 'hard'];
        
        for (const type of puzzleTypes) {
          for (const difficulty of difficulties) {
            const cacheKey = this.getCacheKey(username, type, difficulty);
            await db.deleteSetting(cacheKey);
          }
          // Also clear without difficulty (for learn-mistakes)
          const cacheKey = this.getCacheKey(username, type);
          await db.deleteSetting(cacheKey);
        }
        console.log(`🗑️ Cleared all puzzle cache for ${username}`);
      }

      return true;
    } catch (error) {
      console.error('❌ Error clearing cache:', error);
      return false;
    }
  }

  /**
   * Get cache status for all puzzle types
   */
  async getCacheStatus(username) {
    const puzzleTypes = [
      { type: 'fix-weaknesses', hasDifficulty: true },
      { type: 'master-openings', hasDifficulty: true },
      { type: 'sharpen-endgame', hasDifficulty: true },
      { type: 'learn-mistakes', hasDifficulty: false }
    ];

    const status = {};

    for (const { type, hasDifficulty } of puzzleTypes) {
      if (hasDifficulty) {
        status[type] = {};
        const difficulties = ['easy', 'medium', 'hard'];
        for (const difficulty of difficulties) {
          const isCached = await this.isCached(username, type, difficulty);
          status[type][difficulty] = isCached;
        }
      } else {
        const isCached = await this.isCached(username, type);
        status[type] = isCached;
      }
    }

    return status;
  }

  /**
   * Check if pre-fetch is currently in progress for a puzzle type
   */
  isPrefetchInProgress(username, puzzleType) {
    const prefetchKey = `${username}:${puzzleType}`;
    return this.prefetchInProgress.has(prefetchKey);
  }

  /**
   * Check if any pre-fetch is in progress for a user
   */
  isAnyPrefetchInProgress(username) {
    const puzzleTypes = ['fix-weaknesses', 'master-openings', 'sharpen-endgame'];
    return puzzleTypes.some(type => this.isPrefetchInProgress(username, type));
  }
}

// Export singleton instance
const puzzlePrefetchService = new PuzzlePrefetchService();
export default puzzlePrefetchService;