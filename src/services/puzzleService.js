/**
 * Puzzle Service - Supabase operations for user puzzles
 * Handles CRUD operations for puzzles stored in Supabase
 */

import supabase from './supabaseClient';

class PuzzleService {
  /**
   * Save a single puzzle to Supabase
   */
  async savePuzzle(userId, puzzleData) {
    try {
      const puzzleRecord = {
        user_id: userId,
        category: puzzleData.category,
        theme: puzzleData.theme,
        difficulty: puzzleData.difficulty || 'intermediate',
        fen: puzzleData.fen || puzzleData.position,
        position: puzzleData.position || puzzleData.fen,
        solution: puzzleData.solution,
        line_uci: puzzleData.lineUci || puzzleData.line_uci,
        alternative_moves: puzzleData.alternativeMoves || puzzleData.alternative_moves || [],
        start_line_index: puzzleData.startLineIndex || puzzleData.start_line_index || 0,
        objective: puzzleData.objective,
        hint: puzzleData.hint,
        explanation: puzzleData.explanation,
        source: puzzleData.source,
        source_game_id: puzzleData.sourceGameId || puzzleData.source_game_id,
        source_position: puzzleData.sourcePosition || puzzleData.source_position,
        move_number: puzzleData.moveNumber || puzzleData.move_number,
        centipawn_loss: puzzleData.centipawnLoss || puzzleData.centipawn_loss,
        rating: puzzleData.rating || puzzleData.estimatedRating,
        estimated_rating: puzzleData.estimatedRating || puzzleData.estimated_rating || puzzleData.rating,
        plies: puzzleData.plies,
        user_decisions: puzzleData.userDecisions || puzzleData.user_decisions,
        times_attempted: puzzleData.timesAttempted || 0,
        times_correct: puzzleData.timesCorrect || 0,
        average_time: puzzleData.averageTime || 0,
        metadata: puzzleData.metadata || {}
      };

      const { data, error } = await supabase
        .from('user_puzzles')
        .upsert(puzzleRecord, {
          onConflict: 'user_id,fen,category',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error saving puzzle:', error);
        throw error;
      }

      console.log('✅ Puzzle saved successfully:', data.id);
      return data;
    } catch (error) {
      console.error('❌ Error in savePuzzle:', error);
      throw error;
    }
  }

  /**
   * Save multiple puzzles in batch
   */
  async savePuzzlesBatch(userId, puzzles) {
    try {
      if (!puzzles || puzzles.length === 0) {
        console.log('⚠️ No puzzles to save');
        return [];
      }

      console.log(`💾 Saving ${puzzles.length} puzzles to Supabase...`);

      const puzzleRecords = puzzles.map(puzzle => ({
        user_id: userId,
        category: puzzle.category,
        theme: puzzle.theme,
        difficulty: puzzle.difficulty || 'intermediate',
        fen: puzzle.fen || puzzle.position,
        position: puzzle.position || puzzle.fen,
        solution: puzzle.solution,
        line_uci: puzzle.lineUci || puzzle.line_uci,
        alternative_moves: puzzle.alternativeMoves || puzzle.alternative_moves || [],
        start_line_index: puzzle.startLineIndex || puzzle.start_line_index || 0,
        objective: puzzle.objective,
        hint: puzzle.hint,
        explanation: puzzle.explanation,
        source: puzzle.source,
        source_game_id: puzzle.sourceGameId || puzzle.source_game_id,
        source_position: puzzle.sourcePosition || puzzle.source_position,
        move_number: puzzle.moveNumber || puzzle.move_number,
        centipawn_loss: puzzle.centipawnLoss || puzzle.centipawn_loss,
        rating: puzzle.rating || puzzle.estimatedRating,
        estimated_rating: puzzle.estimatedRating || puzzle.estimated_rating || puzzle.rating,
        plies: puzzle.plies,
        user_decisions: puzzle.userDecisions || puzzle.user_decisions,
        times_attempted: puzzle.timesAttempted || 0,
        times_correct: puzzle.timesCorrect || 0,
        average_time: puzzle.averageTime || 0,
        metadata: puzzle.metadata || {}
      }));

      // Supabase has a limit on batch inserts, so we'll chunk them
      const BATCH_SIZE = 100;
      const results = [];

      for (let i = 0; i < puzzleRecords.length; i += BATCH_SIZE) {
        const batch = puzzleRecords.slice(i, i + BATCH_SIZE);
        
        const { data, error } = await supabase
          .from('user_puzzles')
          .upsert(batch, {
            onConflict: 'user_id,fen,category',
            ignoreDuplicates: false
          })
          .select();

        if (error) {
          console.error(`❌ Error saving puzzle batch ${i / BATCH_SIZE + 1}:`, error);
          throw error;
        }

        results.push(...(data || []));
        console.log(`✅ Saved batch ${i / BATCH_SIZE + 1} (${batch.length} puzzles)`);
      }

      console.log(`✅ Successfully saved ${results.length} puzzles`);
      return results;
    } catch (error) {
      console.error('❌ Error in savePuzzlesBatch:', error);
      throw error;
    }
  }

  /**
   * Get puzzles by category
   */
  async getPuzzlesByCategory(userId, category, options = {}) {
    try {
      const { limit = 20, offset = 0, difficulty = null } = options;

      let query = supabase
        .from('user_puzzles')
        .select('*')
        .eq('user_id', userId)
        .eq('category', category)
        .order('created_at', { ascending: false });

      if (difficulty) {
        query = query.eq('difficulty', difficulty);
      }

      if (limit) {
        query = query.range(offset, offset + limit - 1);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error fetching puzzles by category:', error);
        throw error;
      }

      console.log(`✅ Fetched ${data?.length || 0} puzzles for category: ${category}`);
      return data || [];
    } catch (error) {
      console.error('❌ Error in getPuzzlesByCategory:', error);
      throw error;
    }
  }

  /**
   * Get all puzzles for a user
   */
  async getAllPuzzles(userId, options = {}) {
    try {
      const { limit = 100, offset = 0 } = options;

      let query = supabase
        .from('user_puzzles')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (limit) {
        query = query.range(offset, offset + limit - 1);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error fetching all puzzles:', error);
        throw error;
      }

      console.log(`✅ Fetched ${data?.length || 0} total puzzles`);
      return data || [];
    } catch (error) {
      console.error('❌ Error in getAllPuzzles:', error);
      throw error;
    }
  }

  /**
   * Get puzzle statistics
   */
  async getPuzzleStats(userId) {
    try {
      const { data, error } = await supabase
        .rpc('get_user_puzzle_stats', { p_user_id: userId });

      if (error) {
        console.error('❌ Error fetching puzzle stats:', error);
        throw error;
      }

      return data?.[0] || {
        total_puzzles: 0,
        by_category: {},
        by_difficulty: {},
        total_attempted: 0,
        total_correct: 0,
        success_rate: 0
      };
    } catch (error) {
      console.error('❌ Error in getPuzzleStats:', error);
      // Return default stats on error
      return {
        total_puzzles: 0,
        by_category: {},
        by_difficulty: {},
        total_attempted: 0,
        total_correct: 0,
        success_rate: 0
      };
    }
  }

  /**
   * Update puzzle progress (after user attempts)
   */
  async updatePuzzleProgress(puzzleId, progressData) {
    try {
      const updates = {
        times_attempted: progressData.timesAttempted,
        times_correct: progressData.timesCorrect,
        average_time: progressData.averageTime,
        last_attempted_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('user_puzzles')
        .update(updates)
        .eq('id', puzzleId)
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating puzzle progress:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Error in updatePuzzleProgress:', error);
      throw error;
    }
  }

  /**
   * Delete a puzzle
   */
  async deletePuzzle(puzzleId, userId) {
    try {
      const { error } = await supabase
        .from('user_puzzles')
        .delete()
        .eq('id', puzzleId)
        .eq('user_id', userId);

      if (error) {
        console.error('❌ Error deleting puzzle:', error);
        throw error;
      }

      console.log('✅ Puzzle deleted successfully');
      return true;
    } catch (error) {
      console.error('❌ Error in deletePuzzle:', error);
      throw error;
    }
  }

  /**
   * Delete all puzzles for a category
   */
  async deletePuzzlesByCategory(userId, category) {
    try {
      const { error } = await supabase
        .from('user_puzzles')
        .delete()
        .eq('user_id', userId)
        .eq('category', category);

      if (error) {
        console.error('❌ Error deleting puzzles by category:', error);
        throw error;
      }

      console.log(`✅ Deleted all puzzles for category: ${category}`);
      return true;
    } catch (error) {
      console.error('❌ Error in deletePuzzlesByCategory:', error);
      throw error;
    }
  }

  /**
   * Get puzzle count by category
   */
  async getPuzzleCountByCategory(userId) {
    try {
      const { data, error } = await supabase
        .from('user_puzzles')
        .select('category')
        .eq('user_id', userId);

      if (error) {
        console.error('❌ Error fetching puzzle counts:', error);
        throw error;
      }

      const counts = {
        weakness: 0,
        mistake: 0,
        opening: 0,
        endgame: 0
      };

      data?.forEach(puzzle => {
        if (counts.hasOwnProperty(puzzle.category)) {
          counts[puzzle.category]++;
        }
      });

      return counts;
    } catch (error) {
      console.error('❌ Error in getPuzzleCountByCategory:', error);
      return { weakness: 0, mistake: 0, opening: 0, endgame: 0 };
    }
  }
}

const puzzleService = new PuzzleService();
export default puzzleService;