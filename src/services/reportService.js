/**
 * Report Service
 * Manages report storage and retrieval in Supabase
 */

import { supabase } from './supabaseClient';
import { compress, decompress } from 'lz-string';

class ReportService {
  /**
   * Helper: Encode string to base64
   * @private
   */
  _encodeBase64(str) {
    const uint8Array = new TextEncoder().encode(str);
    let binary = '';
    uint8Array.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
  }

  /**
   * Helper: Decode base64 to string
   * @private
   */
  _decodeBase64(base64) {
    const binary = atob(base64);
    const uint8Array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      uint8Array[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(uint8Array);
  }

  /**
   * Save a PDF report to Supabase
   * @param {string} userId - User ID
   * @param {string} pdfUrl - URL of the uploaded PDF (or analysis data object)
   * @param {string} platform - Platform
   * @param {string} username - Username
   * @param {string} title - Report title (optional)
   * @param {number} gameCount - Number of games analyzed (optional)
   * @param {string} subscriptionTier - User's subscription tier (optional)
   * @returns {Promise<Object>} - Created report record with ID
   */
  async saveReport(userId, pdfUrl, platform, username, title = null, gameCount = null, subscriptionTier = 'free') {
    try {
      // Handle both PDF URL and analysis data object
      const isPdfUrl = typeof pdfUrl === 'string' && pdfUrl.startsWith('http');
      const analysisData = isPdfUrl ? null : pdfUrl;
      const actualPdfUrl = isPdfUrl ? pdfUrl : null;
      
      // Auto-generate title if not provided
      const reportTitle = title || this._generateReportTitle({ username, platform });
      
      // Extract game count from analysis data if not provided
      const actualGameCount = gameCount || analysisData?.games?.length || analysisData?.gameData?.length || 0;
      
      // Get current week and year for weekly tracking
      const now = new Date();
      const weekNumber = this._getISOWeek(now);
      const year = now.getFullYear();
      
      const { data, error } = await supabase
        .from('reports')
        .insert({
          user_id: userId,
          username: username,
          platform: platform,
          title: reportTitle,
          game_count: actualGameCount,
          analysis_data: analysisData,
          pdf_url: actualPdfUrl,
          summary_metrics: analysisData ? this._extractSummaryMetrics(analysisData) : null,
          subscription_tier: subscriptionTier, // Track tier when report was generated
          is_weekly_report: true, // Mark as weekly report for dashboard
          week_number: weekNumber,
          year: year
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Report saved to Supabase (${subscriptionTier} tier, week ${weekNumber}/${year}):`, data.id);
      return data;
    } catch (error) {
      console.error('❌ Failed to save report:', error);
      throw error;
    }
  }

  /**
   * Create an early report placeholder (before analysis is complete)
   * This allows puzzles to be linked to a report_id immediately
   * @param {string} userId - User ID
   * @param {string} platform - Platform (chess.com or lichess)
   * @param {string} username - Username
   * @param {string} subscriptionTier - User's subscription tier
   * @returns {Promise<Object>} - Created report record with ID
   */
  async createEarlyReport(userId, platform, username, subscriptionTier = 'free') {
    try {
      console.log(`📝 Creating early report placeholder for ${username} (${platform})...`);
      
      const reportTitle = this._generateReportTitle({ username, platform });
      const now = new Date();
      const weekNumber = this._getISOWeek(now);
      const year = now.getFullYear();
      
      const { data, error } = await supabase
        .from('reports')
        .insert({
          user_id: userId,
          username: username,
          platform: platform,
          title: reportTitle,
          game_count: 0, // Will be updated later
          analysis_data: null, // Will be filled in later
          pdf_url: null,
          summary_metrics: null,
          subscription_tier: subscriptionTier,
          is_weekly_report: true,
          week_number: weekNumber,
          year: year
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Early report created with ID: ${data.id}`);
      return data;
    } catch (error) {
      console.error('❌ Failed to create early report:', error);
      throw error;
    }
  }

  /**
   * Update an existing report with full analysis data
   * @param {string} reportId - Report ID to update
   * @param {Object} analysisData - Full analysis data
   * @param {string} pdfUrl - PDF URL (optional)
   * @param {number} gameCount - Number of games analyzed
   * @returns {Promise<Object>} - Updated report record
   */
  async updateReportWithAnalysis(reportId, analysisData, pdfUrl = null, gameCount = null) {
    try {
      console.log(`📝 Updating report ${reportId} with full analysis data...`);
      
      const actualGameCount = gameCount || analysisData?.games?.length || analysisData?.gameData?.length || 0;
      
      const { data, error } = await supabase
        .from('reports')
        .update({
          analysis_data: analysisData,
          pdf_url: pdfUrl,
          game_count: actualGameCount,
          summary_metrics: this._extractSummaryMetrics(analysisData),
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Report ${reportId} updated with full analysis`);
      return data;
    } catch (error) {
      console.error('❌ Failed to update report:', error);
      throw error;
    }
  }

  /**
   * Get ISO week number
   * @private
   */
  _getISOWeek(date) {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target) / 604800000);
  }

  /**
   * Get all reports for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options (limit, offset, sortBy, sortOrder)
   * @returns {Promise<Array>} - Array of report records
   */
  async getUserReports(userId, options = {}) {
    try {
      let query = supabase
        .from('reports')
        .select('*')
        .eq('user_id', userId);

      if (options.sortBy && options.sortOrder) {
        query = query.order(options.sortBy, { ascending: options.sortOrder === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.range(options.offset, options.offset + options.limit - 1);
      }

      const { data, error } = await query;

      if (error) throw error;

      const reports = data.map(report => {
        if (report.analysis_data && typeof report.analysis_data === 'object' && report.analysis_data.compressed) {
          const decompressed = decompress(this._decodeBase64(report.analysis_data.data));
          report.analysis_data = JSON.parse(decompressed);
        }
        return report;
      });

      return reports;
    } catch (error) {
      console.error('❌ Failed to get user reports:', error);
      throw error;
    }
  }

  /**
   * Get the most recent report for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} - Latest report or null
   */
  async getLatestUserReport(userId) {
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return null;
      }

      if (data.analysis_data && typeof data.analysis_data === 'object' && data.analysis_data.compressed) {
        const decompressed = decompress(this._decodeBase64(data.analysis_data.data));
        data.analysis_data = JSON.parse(decompressed);
      }

      return data;
    } catch (error) {
      console.error('❌ Failed to get latest user report:', error);
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

      if (data.analysis_data && data.analysis_data.compressed) {
        const decompressed = decompress(this._decodeBase64(data.analysis_data.data));
        data.analysis_data = JSON.parse(decompressed);
      }

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