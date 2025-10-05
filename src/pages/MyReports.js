/**
 * My Reports Dashboard
 * Displays user's saved chess analysis reports with filtering and management
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, 
  Calendar, 
  User, 
  BarChart3, 
  Trash2, 
  Eye, 
  Edit3, 
  Search,
  Filter,
  SortAsc,
  SortDesc,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Crown,
  Lock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import toast from 'react-hot-toast';
import reportService from '../services/reportService';

const MyReports = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    profile, 
    loading: profileLoading,
    hasActiveSubscription,
    hasClaimedFreeReport,
    getSubscriptionTier
  } = useUserProfile();
  
  // State management
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingTitle, setEditingTitle] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  
  const reportsPerPage = 10;

  // Load reports and stats on component mount
  useEffect(() => {
    if (user) {
      loadReports();
      loadStats();
    }
  }, [user, sortBy, sortOrder, currentPage]);

  const loadReports = async () => {
    try {
      setLoading(true);
      console.log('🔍 Loading reports for user:', user.id);
      const offset = (currentPage - 1) * reportsPerPage;
      const reportsData = await reportService.getUserReports(user.id, {
        limit: reportsPerPage,
        offset,
        sortBy,
        sortOrder
      });
      console.log('📊 Reports loaded:', reportsData.length, 'reports found');
      console.log('📋 Reports data:', reportsData);
      setReports(reportsData);
    } catch (error) {
      console.error('❌ Error loading reports:', error);
      toast.error(`Failed to load reports: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await reportService.getReportStats(user.id);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  // Filter reports based on search and platform
  const filteredReports = reports.filter(report => {
    const matchesSearch = report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         report.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlatform = filterPlatform === 'all' || report.platform === filterPlatform;
    return matchesSearch && matchesPlatform;
  });

  // Handle report actions
  const handleViewReport = async (report) => {
    try {
      // If PDF URL exists, open it in a new tab
      if (report.pdf_url) {
        console.log('📄 Opening PDF report:', report.pdf_url);
        window.open(report.pdf_url, '_blank', 'noopener,noreferrer');
        return;
      }
      
      // Fallback: Load full report data and navigate to /full-report (for legacy reports)
      console.log('📊 Loading legacy report data for:', report.id);
      const reportData = await reportService.getReportById(report.id, user.id);
      
      // Navigate to FullReport with the saved analysis data
      navigate('/full-report', {
        state: {
          analysis: reportData.analysis_data.analysis,
          performanceMetrics: reportData.analysis_data.performanceMetrics,
          recurringWeaknesses: reportData.analysis_data.recurringWeaknesses,
          engineInsights: reportData.analysis_data.engineInsights,
          improvementRecommendations: reportData.analysis_data.improvementRecommendations,
          personalizedResources: reportData.analysis_data.personalizedResources,
          dataSource: 'saved_report',
          reportId: report.id
        }
      });
    } catch (error) {
      console.error('Error loading report:', error);
      toast.error('Failed to load report');
    }
  };

  const handleDeleteReport = async (reportId, reportTitle) => {
    if (!window.confirm(`Are you sure you want to delete "${reportTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await reportService.deleteReport(reportId, user.id);
      toast.success('Report deleted successfully');
      loadReports(); // Refresh the list
      loadStats(); // Refresh stats
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Failed to delete report');
    }
  };

  const handleEditTitle = (report) => {
    setEditingTitle(report.id);
    setNewTitle(report.title);
  };

  const handleSaveTitle = async (reportId) => {
    if (!newTitle.trim()) {
      toast.error('Title cannot be empty');
      return;
    }

    try {
      await reportService.updateReportTitle(reportId, user.id, newTitle.trim());
      toast.success('Title updated successfully');
      setEditingTitle(null);
      loadReports(); // Refresh the list
    } catch (error) {
      console.error('Error updating title:', error);
      toast.error('Failed to update title');
    }
  };

  const handleCancelEdit = () => {
    setEditingTitle(null);
    setNewTitle('');
  };

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get platform icon
  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'lichess': return '♞';
      case 'chess.com': return '♜';
      default: return '♟';
    }
  };

  // Get unique platforms for filter
  const availablePlatforms = [...new Set(reports.map(r => r.platform))];

  if (loading && reports.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4" size={48} />
          <p className="text-gray-600">Loading your reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pt-24 pb-8">
      <div className="container mx-auto px-4 max-w-7xl">
        
        {/* ✅ PHASE 2: Subscription Status Banner */}
        {user && !profileLoading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            {!hasActiveSubscription() ? (
              // Free tier user
              hasClaimedFreeReport() ? (
                // Free report already used - show upgrade prompt
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200 rounded-xl p-4 shadow-md">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <Lock className="w-6 h-6 text-orange-600" />
                      <div>
                        <p className="font-semibold text-gray-800">Free Report Used</p>
                        <p className="text-sm text-gray-600">Subscribe to generate unlimited reports and access personalized puzzles</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/pricing')}
                      className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-lg hover:from-orange-600 hover:to-amber-600 transition-all shadow-md hover:shadow-lg"
                    >
                      View Plans
                    </button>
                  </div>
                </div>
              ) : (
                // Free report still available
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 shadow-md">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        1
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">Free Report Available</p>
                        <p className="text-sm text-gray-600">You have 1 free report remaining. Subscribe for unlimited access!</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/reports')}
                      className="px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all shadow-md hover:shadow-lg"
                    >
                      Generate Report
                    </button>
                  </div>
                </div>
              )
            ) : (
              // Subscribed user
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-xl p-4 shadow-md">
                <div className="flex items-center gap-3">
                  <Crown className="w-6 h-6 text-purple-600" />
                  <div>
                    <p className="font-semibold text-gray-800">
                      {getSubscriptionTier().charAt(0).toUpperCase() + getSubscriptionTier().slice(1)} Plan Active
                    </p>
                    <p className="text-sm text-gray-600">
                      {profile?.subscription_expires_at 
                        ? `Expires: ${new Date(profile.subscription_expires_at).toLocaleDateString()}`
                        : 'Unlimited reports and personalized puzzles'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-gray-800 mb-2">My Chess Reports</h1>
          <p className="text-gray-600">View and manage your saved chess analysis reports</p>
        </motion.div>

        {/* Stats Cards */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
          >
            <div className="bg-white rounded-lg p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Reports</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.totalReports}</p>
                </div>
                <FileText className="text-blue-500" size={32} />
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Games Analyzed</p>
                  <p className="text-2xl font-bold text-green-600">{stats.totalGamesAnalyzed}</p>
                </div>
                <BarChart3 className="text-green-500" size={32} />
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Platforms</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {Object.keys(stats.platformBreakdown).length}
                  </p>
                </div>
                <TrendingUp className="text-purple-500" size={32} />
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">This Month</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {stats.recentActivity.filter(r => 
                      new Date(r.created_at).getMonth() === new Date().getMonth()
                    ).length}
                  </p>
                </div>
                <Calendar className="text-orange-500" size={32} />
              </div>
            </div>
          </motion.div>
        )}

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg p-6 shadow-lg mb-8"
        >
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search reports..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <Filter size={20} className="text-gray-500" />
                <select
                  value={filterPlatform}
                  onChange={(e) => setFilterPlatform(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Platforms</option>
                  {availablePlatforms.map(platform => (
                    <option key={platform} value={platform}>
                      {platform === 'lichess' ? 'Lichess' : 'Chess.com'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {sortOrder === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />}
                  Sort
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Reports List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-lg overflow-hidden"
        >
          {filteredReports.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto mb-4 text-gray-400" size={64} />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">No Reports Found</h3>
              <p className="text-gray-500 mb-6">
                {reports.length === 0 
                  ? "You haven't created any reports yet. Start by analyzing your games!"
                  : "No reports match your current search and filter criteria."
                }
              </p>
              {reports.length === 0 && (
                <button
                  onClick={() => navigate('/reports')}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Analyze Games
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              <AnimatePresence>
                {filteredReports.map((report, index) => (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.1 }}
                    className="p-6 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      
                      {/* Report Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-2xl">{getPlatformIcon(report.platform)}</span>
                          
                          {editingTitle === report.id ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                className="flex-1 px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                onKeyPress={(e) => e.key === 'Enter' && handleSaveTitle(report.id)}
                              />
                              <button
                                onClick={() => handleSaveTitle(report.id)}
                                className="text-green-600 hover:text-green-700"
                              >
                                <CheckCircle size={20} />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="text-gray-600 hover:text-gray-700"
                              >
                                <AlertCircle size={20} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-1">
                              <h3 className="text-lg font-semibold text-gray-800">{report.title}</h3>
                              <button
                                onClick={() => handleEditTitle(report)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <Edit3 size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-6 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <User size={16} />
                            <span>{report.username}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <BarChart3 size={16} />
                            <span>{report.game_count} games</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar size={16} />
                            <span>{formatDate(report.created_at)}</span>
                          </div>
                        </div>
                        
                        {/* Summary Metrics */}
                        {report.summary_metrics && (
                          <div className="flex items-center gap-4 mt-3 text-sm">
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              Win Rate: {report.summary_metrics.winRate}
                            </span>
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                              Accuracy: {report.summary_metrics.accuracy}
                            </span>
                            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                              {report.summary_metrics.skillLevel}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleViewReport(report)}
                          className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Eye size={16} />
                          {report.pdf_url ? 'View PDF' : 'View'}
                        </button>
                        <button
                          onClick={() => handleDeleteReport(report.id, report.title)}
                          className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* Pagination */}
        {filteredReports.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-4 mt-8"
          >
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            
            <span className="text-gray-600">
              Page {currentPage}
            </span>
            
            <button
              onClick={() => setCurrentPage(prev => prev + 1)}
              disabled={filteredReports.length < reportsPerPage}
              className="flex items-center gap-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default MyReports;