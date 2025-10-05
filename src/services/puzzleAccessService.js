/**
 * Puzzle Access Service
 * Manages puzzle locking, unlocking, and access control via Supabase
 */

import { supabase } from './supabaseClient';

class PuzzleAccessService {
  /**
   * Store puzzle metadata in Supabase after generation
   * @param {Object} puzzleData - Puzzle data from IndexedDB
   * @param {string} userId - User ID
   * @param {string} reportId - Report ID that generated this puzzle
   * @param {boolean} isTeaser - Whether this is a free teaser puzzle
   * @returns {Promise<Object>} - Created puzzle record
   */
  async storePuzzleMetadata(puzzleData, userId, reportId, isTeaser = false) {
    try {
      const { data, error } = await supabase
        .from('puzzles')
        .insert({
          user_id: userId,
          report_id: reportId,
          puzzle_key: puzzleData.id || `${Date.now()}_${Math.random()}`,
          category: puzzleData.category,
          difficulty: puzzleData.difficulty,
          theme: puzzleData.theme,
          is_locked: !isTeaser, // Teasers are unlocked by default
          requires_subscription: !isTeaser,
          is_teaser: isTeaser,
          unlock_tier: isTeaser ? 'free' : 'monthly',
          fen: puzzleData.fen,
          title: puzzleData.title || puzzleData.description,
          source_game_id: puzzleData.sourceGameId,
          rating_estimate: puzzleData.ratingEstimate || puzzleData.difficulty * 300
        })
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Puzzle metadata stored in Supabase:', data.id);
      return data;
    } catch (error) {
      console.error('❌ Failed to store puzzle metadata:', error);
      throw error;
    }
  }

  /**
   * Store multiple puzzle metadata records (batch operation)
   * @param {Array} puzzles - Array of puzzle data
   * @param {string} userId - User ID
   * @param {string} reportId - Report ID
   * @param {number} teaserCount - Number of teasers per category (default: 1)
   * @returns {Promise<Array>} - Created puzzle records
   */
  async storePuzzlesBatch(puzzles, userId, reportId, teaserCount = 1) {
    try {
      // Group puzzles by category
      const puzzlesByCategory = puzzles.reduce((acc, puzzle) => {
        const category = puzzle.category || 'tactical';
        if (!acc[category]) acc[category] = [];
        acc[category].push(puzzle);
        return acc;
      }, {});

      // Mark first N puzzles per category as teasers
      const puzzleRecords = [];
      
      for (const [category, categoryPuzzles] of Object.entries(puzzlesByCategory)) {
        categoryPuzzles.forEach((puzzle, index) => {
          const isTeaser = index < teaserCount;
          
          puzzleRecords.push({
            user_id: userId,
            report_id: reportId,
            puzzle_key: puzzle.id || `${Date.now()}_${Math.random()}_${index}`,
            category: puzzle.category,
            difficulty: puzzle.difficulty,
            theme: puzzle.theme,
            is_locked: !isTeaser,
            requires_subscription: !isTeaser,
            is_teaser: isTeaser,
            unlock_tier: isTeaser ? 'free' : 'monthly',
            fen: puzzle.fen,
            title: puzzle.title || puzzle.description,
            source_game_id: puzzle.sourceGameId,
            rating_estimate: puzzle.ratingEstimate || this._estimateRating(puzzle.difficulty)
          });
        });
      }

      const { data, error } = await supabase
        .from('puzzles')
        .insert(puzzleRecords)
        .select();

      if (error) throw error;

      console.log(`✅ Stored ${data.length} puzzle metadata records (${puzzleRecords.filter(p => p.is_teaser).length} teasers)`);
      return data;
    } catch (error) {
      console.error('❌ Failed to store puzzle batch:', error);
      throw error;
    }
  }

  /**
   * Check if user has access to a specific puzzle
   * @param {string} userId - User ID
   * @param {string} puzzleId - Puzzle ID (Supabase UUID)
   * @returns {Promise<boolean>} - Whether user has access
   */
  async checkPuzzleAccess(userId, puzzleId) {
    try {
      const { data, error } = await supabase
        .rpc('user_has_puzzle_access', {
          p_user_id: userId,
          p_puzzle_id: puzzleId
        });

      if (error) throw error;

      return data === true;
    } catch (error) {
      console.error('❌ Failed to check puzzle access:', error);
      return false;
    }
  }

  /**
   * Get all puzzles for a user with access control info
   * @param {string} userId - User ID
   * @param {Object} filters - Optional filters (category, difficulty, locked status)
   * @returns {Promise<Array>} - Array of puzzle metadata with access info
   */
  async getUserPuzzles(userId, filters = {}) {
    try {
      let query = supabase
        .from('puzzles')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.difficulty) {
        query = query.eq('difficulty', filters.difficulty);
      }
      if (filters.isLocked !== undefined) {
        query = query.eq('is_locked', filters.isLocked);
      }
      if (filters.isTeaser !== undefined) {
        query = query.eq('is_teaser', filters.isTeaser);
      }
      if (filters.reportId) {
        query = query.eq('report_id', filters.reportId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Failed to get user puzzles:', error);
      throw error;
    }
  }

  /**
   * Get accessible puzzle count for user
   * @param {string} userId - User ID
   * @param {string} category - Optional category filter
   * @returns {Promise<number>} - Count of accessible puzzles
   */
  async getAccessiblePuzzleCount(userId, category = null) {
    try {
      const { data, error } = await supabase
        .rpc('get_accessible_puzzle_count', {
          p_user_id: userId,
          p_category: category
        });

      if (error) throw error;

      return data || 0;
    } catch (error) {
      console.error('❌ Failed to get accessible puzzle count:', error);
      return 0;
    }
  }

  /**
   * Unlock puzzles via one-time purchase
   * @param {string} userId - User ID
   * @param {string} reportId - Report ID to unlock
   * @param {string} paymentId - Stripe payment intent ID
   * @param {number} amountPaid - Amount paid in USD
   * @returns {Promise<Object>} - Unlock record
   */
  async unlockPuzzlesOneTime(userId, reportId, paymentId, amountPaid = 4.99) {
    try {
      // Create unlock record
      const { data: unlockData, error: unlockError } = await supabase
        .from('puzzle_unlocks')
        .insert({
          user_id: userId,
          report_id: reportId,
          unlock_type: 'one_time_pack',
          payment_id: paymentId,
          amount_paid: amountPaid,
          expires_at: null // Permanent unlock
        })
        .select()
        .single();

      if (unlockError) throw unlockError;

      // Update all puzzles for this report to be unlocked
      const { error: updateError } = await supabase
        .from('puzzles')
        .update({ is_locked: false })
        .eq('user_id', userId)
        .eq('report_id', reportId);

      if (updateError) throw updateError;

      console.log('✅ Puzzles unlocked via one-time purchase:', reportId);
      return unlockData;
    } catch (error) {
      console.error('❌ Failed to unlock puzzles:', error);
      throw error;
    }
  }

  /**
   * Check if user has unlocked a specific report's puzzles
   * @param {string} userId - User ID
   * @param {string} reportId - Report ID
   * @returns {Promise<boolean>} - Whether report is unlocked
   */
  async hasReportUnlock(userId, reportId) {
    try {
      const { data, error } = await supabase
        .from('puzzle_unlocks')
        .select('id')
        .eq('user_id', userId)
        .eq('report_id', reportId)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .limit(1);

      if (error) throw error;

      return data && data.length > 0;
    } catch (error) {
      console.error('❌ Failed to check report unlock:', error);
      return false;
    }
  }

  /**
   * Record puzzle attempt/progress
   * @param {string} userId - User ID
   * @param {string} puzzleId - Puzzle ID (Supabase UUID)
   * @param {Object} progressData - Progress data (correct, timeSpent, hintsUsed)
   * @returns {Promise<Object>} - Progress record
   */
  async recordPuzzleProgress(userId, puzzleId, progressData) {
    try {
      const { data: existing, error: fetchError } = await supabase
        .from('puzzle_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('puzzle_id', puzzleId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (existing) {
        // Update existing progress
        const { data, error } = await supabase
          .from('puzzle_progress')
          .update({
            completed: progressData.completed || existing.completed,
            correct: progressData.correct || existing.correct,
            attempts: (existing.attempts || 0) + 1,
            hints_used: (existing.hints_used || 0) + (progressData.hintsUsed || 0),
            time_spent: (existing.time_spent || 0) + (progressData.timeSpent || 0),
            last_attempted_at: new Date().toISOString(),
            completed_at: progressData.completed ? new Date().toISOString() : existing.completed_at
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new progress record
        const { data, error } = await supabase
          .from('puzzle_progress')
          .insert({
            user_id: userId,
            puzzle_id: puzzleId,
            completed: progressData.completed || false,
            correct: progressData.correct || false,
            attempts: 1,
            hints_used: progressData.hintsUsed || 0,
            time_spent: progressData.timeSpent || 0,
            completed_at: progressData.completed ? new Date().toISOString() : null
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error('❌ Failed to record puzzle progress:', error);
      throw error;
    }
  }

  /**
   * Get user's puzzle progress statistics
   * @param {string} userId - User ID
   * @param {string} category - Optional category filter
   * @returns {Promise<Object>} - Progress statistics
   */
  async getUserProgressStats(userId, category = null) {
    try {
      let query = supabase
        .from('puzzle_progress')
        .select(`
          *,
          puzzles!inner(category, difficulty)
        `)
        .eq('user_id', userId);

      if (category) {
        query = query.eq('puzzles.category', category);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Calculate statistics
      const stats = {
        totalAttempts: data.length,
        completed: data.filter(p => p.completed).length,
        correct: data.filter(p => p.correct).length,
        totalTime: data.reduce((sum, p) => sum + (p.time_spent || 0), 0),
        totalHints: data.reduce((sum, p) => sum + (p.hints_used || 0), 0),
        accuracy: data.length > 0 ? ((data.filter(p => p.correct).length / data.length) * 100).toFixed(1) : 0
      };

      return stats;
    } catch (error) {
      console.error('❌ Failed to get progress stats:', error);
      throw error;
    }
  }

  /**
   * Get puzzle summary for a report (counts by lock status)
   * @param {string} userId - User ID
   * @param {string} reportId - Report ID
   * @returns {Promise<Object>} - Puzzle summary with counts
   */
  async getPuzzleSummary(userId, reportId) {
    try {
      const { data, error } = await supabase
        .from('puzzles')
        .select('is_locked, is_teaser, category')
        .eq('user_id', userId)
        .eq('report_id', reportId);

      if (error) throw error;

      const summary = {
        total: data.length,
        free: data.filter(p => !p.is_locked || p.is_teaser).length,
        locked: data.filter(p => p.is_locked && !p.is_teaser).length,
        byCategory: {}
      };

      // Count by category
      data.forEach(puzzle => {
        if (!summary.byCategory[puzzle.category]) {
          summary.byCategory[puzzle.category] = {
            total: 0,
            free: 0,
            locked: 0
          };
        }
        summary.byCategory[puzzle.category].total++;
        if (!puzzle.is_locked || puzzle.is_teaser) {
          summary.byCategory[puzzle.category].free++;
        } else {
          summary.byCategory[puzzle.category].locked++;
        }
      });

      console.log('✅ Puzzle summary loaded:', summary);
      return summary;
    } catch (error) {
      console.error('❌ Failed to get puzzle summary:', error);
      throw error;
    }
  }

  /**
   * Check if user has one-time unlock for a report
   * @param {string} userId - User ID
   * @param {string} reportId - Report ID
   * @returns {Promise<boolean>} - Whether user has one-time unlock
   */
  async checkOneTimeUnlock(userId, reportId) {
    return this.hasReportUnlock(userId, reportId);
  }

  /**
   * Helper: Estimate rating based on difficulty level
   * @private
   */
  _estimateRating(difficulty) {
    const ratingMap = {
      'beginner': 800,
      'easy': 1200,
      'medium': 1600,
      'hard': 2000,
      'expert': 2400
    };
    return ratingMap[difficulty] || 1500;
  }
}

// Export singleton instance
const puzzleAccessService = new PuzzleAccessService();
export default puzzleAccessService;