/**
 * Report Service
 * Handles saving, retrieving, and managing chess analysis reports
 */

import { supabase } from './supabaseClient';

/**
 * Generates a title for the report based on analysis data
 * @param {Object} analysis - Analysis data
 * @returns {string} - Generated title
 */
const generateReportTitle = (analysis) => {
  const username = analysis?.username || analysis?.formData?.username || 'Unknown Player';
  const platform = analysis?.formData?.platform || analysis?.platform;
  const gameCount = analysis?.games?.length || analysis?.gameData?.length || 0;
  const date = new Date().toLocaleDateString();
  
  // Only include platform in title if it's known
  if (platform && platform !== 'Unknown Platform') {
    return `${username} - ${platform} Analysis (${gameCount} games) - ${date}`;
  } else {
    return `${username} - Analysis (${gameCount} games) - ${date}`;
  }
};

/**
 * Saves a complete chess analysis report to Supabase
 * @param {Object} reportData - Complete report data from FullReport
 * @param {string} userId - User ID from auth
 * @returns {Promise<Object>} - Saved report with ID
 */
export const saveReport = async (reportData, userId) => {
  try {
    const {
      analysis,
      performanceMetrics,
      recurringWeaknesses,
      engineInsights,
      improvementRecommendations,
      personalizedResources
    } = reportData;

    // Generate auto title
    const title = generateReportTitle(analysis);
    
    // Extract key metadata with debugging
    console.log('🔍 Analysis structure for platform extraction:', {
      'analysis.formData': analysis?.formData,
      'analysis.platform': analysis?.platform,
      'analysis keys': Object.keys(analysis || {}),
      'analysis.player': analysis?.player,
      'analysis.username': analysis?.username
    });
    
    const username = analysis?.username || analysis?.formData?.username || analysis?.player?.username;
    const platform = analysis?.formData?.platform || analysis?.platform || analysis?.player?.platform || 'lichess'; // fallback to lichess
    const gameCount = analysis?.games?.length || analysis?.gameData?.length || 0;
    
    console.log('📊 Extracted metadata:', { username, platform, gameCount });
    
    // Prepare report payload
    const reportPayload = {
      user_id: userId,
      title,
      username,
      platform,
      game_count: gameCount,
      created_at: new Date().toISOString(),
      
      // Store complete analysis data
      analysis_data: {
        analysis,
        performanceMetrics,
        recurringWeaknesses,
        engineInsights,
        improvementRecommendations,
        personalizedResources
      },
      
      // Extract summary metrics for quick access
      summary_metrics: {
        winRate: performanceMetrics?.winRate || analysis?.winRate || 0,
        accuracy: performanceMetrics?.averageAccuracy || performanceMetrics?.accuracy || analysis?.accuracy || 0,
        totalGames: gameCount,
        primaryWeakness: recurringWeaknesses?.[0]?.title || 'Not identified',
        skillLevel: analysis?.skillLevel || 'Intermediate'
      }
    };

    const { data, error } = await supabase
      .from('reports')
      .insert([reportPayload])
      .select()
      .single();

    if (error) {
      console.error('Error saving report:', error);
      throw new Error(`Failed to save report: ${error.message}`);
    }

    console.log('✅ Report saved successfully:', data.id);
    return data;

  } catch (error) {
    console.error('Error in saveReport:', error);
    throw error;
  }
};

/**
 * Retrieves all reports for a specific user
 * @param {string} userId - User ID from auth
 * @param {Object} options - Query options (limit, offset, sortBy, sortOrder)
 * @returns {Promise<Array>} - Array of user reports
 */
export const getUserReports = async (userId, options = {}) => {
  try {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = options;

    let query = supabase
      .from('reports')
      .select(`
        id,
        title,
        username,
        platform,
        game_count,
        created_at,
        summary_metrics
      `)
      .eq('user_id', userId)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching user reports:', error);
      throw new Error(`Failed to fetch reports: ${error.message}`);
    }

    return data || [];

  } catch (error) {
    console.error('Error in getUserReports:', error);
    throw error;
  }
};

/**
 * Retrieves a specific report by ID (with full analysis data)
 * @param {string} reportId - Report ID
 * @param {string} userId - User ID for security
 * @returns {Promise<Object>} - Complete report data
 */
export const getReportById = async (reportId, userId) => {
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Report not found or access denied');
      }
      console.error('Error fetching report:', error);
      throw new Error(`Failed to fetch report: ${error.message}`);
    }

    return data;

  } catch (error) {
    console.error('Error in getReportById:', error);
    throw error;
  }
};

/**
 * Deletes a report by ID
 * @param {string} reportId - Report ID
 * @param {string} userId - User ID for security
 * @returns {Promise<boolean>} - Success status
 */
export const deleteReport = async (reportId, userId) => {
  try {
    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', reportId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting report:', error);
      throw new Error(`Failed to delete report: ${error.message}`);
    }

    console.log('✅ Report deleted successfully:', reportId);
    return true;

  } catch (error) {
    console.error('Error in deleteReport:', error);
    throw error;
  }
};

/**
 * Updates a report title
 * @param {string} reportId - Report ID
 * @param {string} userId - User ID for security
 * @param {string} newTitle - New title
 * @returns {Promise<Object>} - Updated report
 */
export const updateReportTitle = async (reportId, userId, newTitle) => {
  try {
    const { data, error } = await supabase
      .from('reports')
      .update({ title: newTitle })
      .eq('id', reportId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating report title:', error);
      throw new Error(`Failed to update report: ${error.message}`);
    }

    return data;

  } catch (error) {
    console.error('Error in updateReportTitle:', error);
    throw error;
  }
};

/**
 * Gets report statistics for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Report statistics
 */
export const getReportStats = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('id, created_at, platform, game_count, summary_metrics')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching report stats:', error);
      throw new Error(`Failed to fetch report statistics: ${error.message}`);
    }

    const stats = {
      totalReports: data.length,
      totalGamesAnalyzed: data.reduce((sum, report) => sum + (report.game_count || 0), 0),
      platformBreakdown: {},
      recentActivity: data
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5)
    };

    // Calculate platform breakdown
    data.forEach(report => {
      const platform = report.platform || 'Unknown';
      stats.platformBreakdown[platform] = (stats.platformBreakdown[platform] || 0) + 1;
    });

    return stats;

  } catch (error) {
    console.error('Error in getReportStats:', error);
    throw error;
  }
};

export default {
  saveReport,
  getUserReports,
  getReportById,
  deleteReport,
  updateReportTitle,
  getReportStats
};