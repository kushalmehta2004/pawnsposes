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

  /**
   * Store puzzle with full data (for Dashboard system)
   * Stores complete puzzle object in puzzle_data JSONB column
   * @param {Object} puzzleData - Complete puzzle data
   * @param {string} userId - User ID
   * @param {string} reportId - Report ID
   * @param {boolean} isTeaser - Whether this is a teaser puzzle
   * @returns {Promise<Object>} - Created puzzle record
   */
  async storePuzzleWithFullData(puzzleData, userId, reportId, isTeaser = false) {
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
          is_locked: !isTeaser,
          requires_subscription: !isTeaser,
          is_teaser: isTeaser,
          unlock_tier: isTeaser ? 'free' : 'monthly',
          fen: puzzleData.fen,
          title: puzzleData.title || puzzleData.description,
          source_game_id: puzzleData.sourceGameId,
          rating_estimate: puzzleData.ratingEstimate || this._estimateRating(puzzleData.difficulty),
          puzzle_data: puzzleData, // Store complete puzzle object
          is_weekly_puzzle: false, // Will be updated by mark_puzzles_as_weekly()
          week_number: null,
          year: null
        })
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Puzzle with full data stored:', data.id);
      return data;
    } catch (error) {
      console.error('❌ Failed to store puzzle with full data:', error);
      throw error;
    }
  }

  /**
   * Store multiple puzzles with full data (batch operation for Dashboard)
   * @param {Array} puzzles - Array of complete puzzle data
   * @param {string} userId - User ID
   * @param {string} reportId - Report ID
   * @param {number} teaserCount - Number of teasers per category
   * @returns {Promise<Array>} - Created puzzle records
   */
  async storePuzzlesBatchWithFullData(puzzles, userId, reportId, teaserCount = 1) {
    try {
      console.log(`📊 storePuzzlesBatchWithFullData called with ${puzzles.length} puzzles`);
      console.log('📊 Sample puzzle:', puzzles[0]);
      
      // Group puzzles by category
      const puzzlesByCategory = puzzles.reduce((acc, puzzle) => {
        const category = puzzle.category || 'tactical';
        if (!acc[category]) acc[category] = [];
        acc[category].push(puzzle);
        return acc;
      }, {});

      console.log('📊 Puzzles grouped by category:', Object.keys(puzzlesByCategory).map(cat => `${cat}: ${puzzlesByCategory[cat].length}`).join(', '));

      // Mark first N puzzles per category as teasers
      const puzzleRecords = [];
      
      for (const [category, categoryPuzzles] of Object.entries(puzzlesByCategory)) {
        categoryPuzzles.forEach((puzzle, index) => {
          const isTeaser = index < teaserCount;
          
          // Extract FEN from either 'fen' or 'position' field
          const fenValue = puzzle.fen || puzzle.position;
          
          // Skip puzzles without a valid FEN
          if (!fenValue) {
            console.warn('⚠️ Skipping puzzle without FEN:', puzzle.id);
            return;
          }
          
          puzzleRecords.push({
            user_id: userId,
            report_id: reportId || null, // Make reportId optional (nullable)
            puzzle_key: puzzle.id || `${Date.now()}_${Math.random()}_${index}`,
            category: puzzle.category || category, // Use category from grouping if not in puzzle
            difficulty: puzzle.difficulty || 'intermediate',
            theme: puzzle.theme || puzzle.mistakeType || 'tactical', // Handle missing theme
            is_locked: !isTeaser,
            requires_subscription: !isTeaser,
            is_teaser: isTeaser,
            unlock_tier: isTeaser ? 'free' : 'monthly',
            fen: fenValue,
            title: puzzle.title || puzzle.objective || puzzle.description || 'Chess Puzzle',
            source_game_id: puzzle.sourceGameId || puzzle.debugGameId || null,
            rating_estimate: puzzle.ratingEstimate || puzzle.estimatedRating || puzzle.rating || this._estimateRating(puzzle.difficulty),
            puzzle_data: puzzle, // Store complete puzzle object
            index_in_category: index, // Store position within category (0-29)
            is_weekly_puzzle: false,
            week_number: null,
            year: null
          });
        });
      }

      const uniqueRecords = [];
      const seenKeys = new Set();

      for (const record of puzzleRecords) {
        const key = `${record.user_id}-${record.puzzle_key}`;
        if (seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);
        uniqueRecords.push(record);
      }

      if (uniqueRecords.length === 0) {
        console.warn('⚠️ No valid puzzles to store after deduplication');
        return [];
      }

      if (uniqueRecords.length !== puzzleRecords.length) {
        console.warn(`⚠️ Deduplicated ${puzzleRecords.length - uniqueRecords.length} duplicate puzzles in batch`);
      }

      const { data, error } = await supabase
        .from('puzzles')
        .upsert(uniqueRecords, {
          onConflict: 'user_id,puzzle_key',
          ignoreDuplicates: false
        })
        .select();

      if (error) throw error;

      console.log(`✅ Stored ${data.length} puzzles with full data (${puzzleRecords.filter(p => p.is_teaser).length} teasers)`);
      return data;
    } catch (error) {
      console.error('❌ Failed to store puzzle batch with full data:', error);
      throw error;
    }
  }

  /**
   * Get puzzles by category with full data (for Dashboard display)
   * Returns puzzles from the most recent report, ordered by index_in_category
   * @param {string} userId - User ID
   * @param {string} category - Puzzle category
   * @param {number} limit - Number of puzzles to return (default: 1000 to get all puzzles)
   * @returns {Promise<Array>} - Puzzles with full data in correct order
   */
  async getPuzzlesByCategory(userId, category, limit = 1000) {
    try {
      console.log(`🔍 getPuzzlesByCategory called for user ${userId}, category ${category}`);
      
      // Step 1: Get the most recent report_id for this user
      const { data: recentReport, error: reportError } = await supabase
        .from('reports')
        .select('id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (reportError) {
        console.error('❌ Error getting most recent report:', reportError);
        throw reportError;
      }

      if (!recentReport || recentReport.length === 0) {
        console.warn(`⚠️ No reports found for user ${userId}`);
        return [];
      }

      const mostRecentReportId = recentReport[0].id;
      console.log(`📊 Most recent report ID: ${mostRecentReportId} (created: ${recentReport[0].created_at})`);

      // Step 2: Get ALL puzzles from that most recent report for this category
      const { data, error } = await supabase
        .from('puzzles')
        .select('*')
        .eq('user_id', userId)
        .eq('report_id', mostRecentReportId)
        .eq('category', category)
        .not('puzzle_data', 'is', null) // Only puzzles with full data
        .order('index_in_category', { ascending: true }) // Maintain original order
        .limit(limit);

      if (error) {
        console.error('❌ Error loading puzzles:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.warn(`⚠️ No puzzles found for report ${mostRecentReportId}, category ${category}`);
        console.warn(`⚠️ This means either no puzzles were generated for this category or updatePuzzlesWithReportId() didn't execute`);
        return [];
      }

      console.log(`✅ Loaded ${data.length} puzzles from most recent report for category ${category}`);
      console.log(`📊 Report ID: ${mostRecentReportId}, Puzzles: ${data.length}`);
      
      return data || [];
    } catch (error) {
      console.error('❌ Failed to get puzzles by category:', error);
      return [];
    }
  }

  /**
   * Emergency fix: Assign orphaned puzzles to the most recent report
   * Use this if puzzles are stuck with null report_id
   * @param {string} userId - User ID
   * @returns {Promise<number>} - Number of puzzles fixed
   */
  async fixOrphanedPuzzles(userId) {
    try {
      console.log('🔧 Attempting to fix orphaned puzzles for user:', userId);
      
      // Get the most recent report for this user
      const { data: reports, error: reportError } = await supabase
        .from('reports')
        .select('id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (reportError) throw reportError;
      
      if (!reports || reports.length === 0) {
        console.warn('⚠️ No reports found for this user');
        return 0;
      }
      
      const mostRecentReportId = reports[0].id;
      console.log(`📊 Most recent report: ${mostRecentReportId}`);
      
      // Find all puzzles without report_id
      const { data: orphanedPuzzles, error: orphanError } = await supabase
        .from('puzzles')
        .select('id, category, created_at')
        .eq('user_id', userId)
        .is('report_id', null);
      
      if (orphanError) throw orphanError;
      
      if (!orphanedPuzzles || orphanedPuzzles.length === 0) {
        console.log('✅ No orphaned puzzles found');
        return 0;
      }
      
      console.log(`📊 Found ${orphanedPuzzles.length} orphaned puzzles`);
      
      // Update them with the most recent report_id
      const { data, error } = await supabase
        .from('puzzles')
        .update({ report_id: mostRecentReportId })
        .eq('user_id', userId)
        .is('report_id', null)
        .select();
      
      if (error) throw error;
      
      const fixedCount = data?.length || 0;
      console.log(`✅ Fixed ${fixedCount} orphaned puzzles by assigning them to report ${mostRecentReportId}`);
      return fixedCount;
    } catch (error) {
      console.error('❌ Failed to fix orphaned puzzles:', error);
      throw error;
    }
  }

  /**
   * Diagnostic function to check puzzle status in database
   * Useful for debugging why puzzles aren't showing on Dashboard
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Diagnostic information
   */
  async diagnosePuzzleStatus(userId) {
    try {
      console.log('🔍 Running puzzle diagnostics for user:', userId);
      
      // Get all puzzles for this user
      const { data: allPuzzles, error } = await supabase
        .from('puzzles')
        .select('id, category, report_id, created_at, is_teaser, puzzle_data')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const diagnostics = {
        totalPuzzles: allPuzzles?.length || 0,
        puzzlesWithReportId: allPuzzles?.filter(p => p.report_id !== null).length || 0,
        puzzlesWithoutReportId: allPuzzles?.filter(p => p.report_id === null).length || 0,
        puzzlesWithData: allPuzzles?.filter(p => p.puzzle_data !== null).length || 0,
        puzzlesWithoutData: allPuzzles?.filter(p => p.puzzle_data === null).length || 0,
        byCategory: {},
        recentPuzzles: allPuzzles?.slice(0, 10).map(p => ({
          id: p.id.substring(0, 8),
          category: p.category,
          report_id: p.report_id ? p.report_id.substring(0, 8) : 'NULL',
          created: p.created_at,
          hasData: !!p.puzzle_data
        })) || []
      };
      
      // Group by category
      ['weakness', 'mistake', 'opening', 'endgame'].forEach(category => {
        const categoryPuzzles = allPuzzles?.filter(p => p.category === category) || [];
        diagnostics.byCategory[category] = {
          total: categoryPuzzles.length,
          withReportId: categoryPuzzles.filter(p => p.report_id !== null).length,
          withoutReportId: categoryPuzzles.filter(p => p.report_id === null).length,
          teasers: categoryPuzzles.filter(p => p.is_teaser).length
        };
      });
      
      console.log('📊 Puzzle Diagnostics:', diagnostics);
      return diagnostics;
    } catch (error) {
      console.error('❌ Failed to run diagnostics:', error);
      return null;
    }
  }

  /**
   * Update puzzles with report_id after report is saved
   * This is needed because puzzles are generated before the report is saved
   * @param {string} userId - User ID
   * @param {string} reportId - Report ID to assign to puzzles
   * @returns {Promise<number>} - Number of puzzles updated
   */
  async updatePuzzlesWithReportId(userId, reportId) {
    try {
      console.log(`🔄 Updating puzzles with report_id: ${reportId} for user: ${userId}`);
      
      // First, check how many puzzles need updating
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data: puzzlesToUpdate, error: checkError } = await supabase
        .from('puzzles')
        .select('id, category, created_at')
        .eq('user_id', userId)
        .is('report_id', null)
        .gte('created_at', fiveMinutesAgo);
      
      if (checkError) {
        console.error('❌ Error checking puzzles to update:', checkError);
        throw checkError;
      }
      
      console.log(`📊 Found ${puzzlesToUpdate?.length || 0} puzzles to update:`, 
        puzzlesToUpdate?.map(p => ({ id: p.id.substring(0, 8), category: p.category, created: p.created_at }))
      );
      
      if (!puzzlesToUpdate || puzzlesToUpdate.length === 0) {
        console.warn('⚠️ No puzzles found to update! This might mean:');
        console.warn('  1. Puzzles were already updated (report_id is not null)');
        console.warn('  2. Puzzles are older than 5 minutes');
        console.warn('  3. Puzzles were not stored yet');
        return 0;
      }
      
      // Update all puzzles for this user that don't have a report_id yet
      const { data, error } = await supabase
        .from('puzzles')
        .update({ report_id: reportId })
        .eq('user_id', userId)
        .is('report_id', null)
        .gte('created_at', fiveMinutesAgo)
        .select();

      if (error) {
        console.error('❌ Supabase error during update:', error);
        throw error;
      }

      const updatedCount = data?.length || 0;
      console.log(`✅ Successfully updated ${updatedCount} puzzles with report_id: ${reportId}`);
      
      if (updatedCount !== puzzlesToUpdate.length) {
        console.warn(`⚠️ Expected to update ${puzzlesToUpdate.length} puzzles but only updated ${updatedCount}`);
      }
      
      return updatedCount;
    } catch (error) {
      console.error('❌ Failed to update puzzles with report_id:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      throw error;
    }
  }
}

// Export singleton instance
const puzzleAccessService = new PuzzleAccessService();
export default puzzleAccessService;