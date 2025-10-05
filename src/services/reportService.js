/**
 * Report Service
 * Manages report storage and retrieval in Supabase
 */

import { supabase } from './supabaseClient';

class ReportService {
  /**
   * Save a report to Supabase
   * @param {string} userId - User ID
   * @param {Object} reportData - Report data from analysis
   * @returns {Promise<Object>} - Created report record with ID
   */
  async saveReport(userId, reportData) {
    try {
      const { data, error } = await supabase
        .from('reports')
        .insert({
          user_id: userId,
          username: reportData.username || reportData.formData?.username,
          platform: reportData.platform || reportData.formData?.platform,
          title: this._generateReportTitle(reportData),
          game_count: reportData.games?.length || reportData.gameData?.length || 0,
          analysis_data: reportData.rawAnalysis || reportData,
          summary_metrics: this._extractSummaryMetrics(reportData),
        })
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Report saved to Supabase:', data.id);
      return data;
    } catch (error) {
      console.error('❌ Failed to save report:', error);
      throw error;
    }
  }

  /**
   * Get all reports for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Array of report records
   */
  async getUserReports(userId) {
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Failed to get user reports:', error);
      throw error;
    }
  }

  /**
   * Get a specific report by ID
   * @param {string} reportId - Report ID
   * @returns {Promise<Object>} - Report record
   */
  async getReportById(reportId) {
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('❌ Failed to get report:', error);
      throw error;
    }
  }

  /**
   * Delete a report
   * @param {string} reportId - Report ID
   * @returns {Promise<void>}
   */
  async deleteReport(reportId) {
    try {
      const { error } = await supabase
        .from('reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;

      console.log('✅ Report deleted:', reportId);
    } catch (error) {
      console.error('❌ Failed to delete report:', error);
      throw error;
    }
  }

  /**
   * Helper: Generate report title
   * @private
   */
  _generateReportTitle(reportData) {
    const username = reportData.username || reportData.formData?.username || 'Unknown';
    const platform = reportData.platform || reportData.formData?.platform || 'Unknown';
    const date = new Date().toLocaleDateString();
    return `${username} (${platform}) - ${date}`;
  }

  /**
   * Helper: Extract summary metrics from report data
   * @private
   */
  _extractSummaryMetrics(reportData) {
    const rawAnalysis = reportData.rawAnalysis || reportData;
    
    return {
      winRate: rawAnalysis.winRate || null,
      averageAccuracy: rawAnalysis.averageAccuracy || null,
      totalGames: reportData.games?.length || reportData.gameData?.length || 0,
      weaknessCount: rawAnalysis.recurringWeaknesses?.length || 0,
      strengthCount: rawAnalysis.strengths?.length || 0,
    };
  }
}

// Export singleton instance
const reportService = new ReportService();
export default reportService;