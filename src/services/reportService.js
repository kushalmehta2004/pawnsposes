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
   * @param {string} pdfUrl - URL of the uploaded PDF
   * @param {string} platform - Platform
   * @param {string} username - Username
   * @param {string} title - Report title
   * @param {number} gameCount - Number of games analyzed
   * @returns {Promise<Object>} - Created report record with ID
   */
  async saveReport(userId, pdfUrl, platform, username, title, gameCount) {
    try {
      const { data, error } = await supabase
        .from('reports')
        .insert({
          user_id: userId,
          username: username,
          platform: platform,
          title: title,
          game_count: gameCount,
          analysis_data: null, // No JSON data for PDF reports
          pdf_url: pdfUrl,
          summary_metrics: null, // No metrics for PDF reports
        })
        .select()
        .single();

      if (error) throw error;

      console.log('✅ PDF Report saved to Supabase:', data.id);
      return data;
    } catch (error) {
      console.error('❌ Failed to save PDF report:', error);
      throw error;
    }
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

      // Decompress analysis_data if compressed (for legacy JSON reports)
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

      // Decompress analysis_data if compressed
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