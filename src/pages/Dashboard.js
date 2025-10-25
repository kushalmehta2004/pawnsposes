  /**
 * Dashboard - Unified view for reports and puzzles
 * Displays past reports and all puzzle categories in a tabbed interface
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, 
  Target,
  AlertTriangle,
  BookOpen,
  Crown,
  Loader2,
  Calendar,
  User,
  BarChart3,
  Eye,
  Trash2,
  Edit3,
  Search,
  Filter,
  SortAsc,
  SortDesc,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Lock,
  CheckCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { usePuzzleData } from '../hooks/usePuzzleData';
import toast from 'react-hot-toast';
import reportService from '../services/reportService';
import puzzleAccessService from '../services/puzzleAccessService';
import tierBasedPuzzleService from '../services/tierBasedPuzzleService';
import ChessBoardPreview from '../components/ChessBoardPreview';
import UpgradePrompt from '../components/UpgradePrompt';
import DashboardPuzzleSolver from '../components/DashboardPuzzleSolver';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    profile, 
    loading: profileLoading,
    hasActiveSubscription,
    hasClaimedFreeReport,
    getSubscriptionTier
  } = useUserProfile();
  
  // Use puzzle data from context (persisted across navigation)
  const {
    weaknessPuzzles,
    mistakePuzzles,
    openingPuzzles,
    endgamePuzzles,
    puzzlesLoading,
    setPuzzlesLoading,
    hasCachedPuzzles,
    updatePuzzleData
  } = usePuzzleData();
  
  // Tab state
  const [activeTab, setActiveTab] = useState('reports');
  const [activePuzzle, setActivePuzzle] = useState(null);

  // Reports state
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
  
  // Tier-based puzzle access state
  const [userTier, setUserTier] = useState('free');
  const [puzzlesWithTier, setPuzzlesWithTier] = useState({
    weakness: { accessible: [], locked: [] },
    mistake: { accessible: [], locked: [] },
    opening: { accessible: [], locked: [] },
    endgame: { accessible: [], locked: [] }
  });
  
  const normalizeTier = (tier) => {
    if (!tier) return null;
    const value = tier.toString().toLowerCase();
    if (value.includes('one_time') || value.includes('one-time') || value.includes('one time')) return 'one_time';
    if (value.includes('monthly') || value.includes('month')) return 'monthly';
    if (value.includes('quarter') || value.includes('3month') || value.includes('3-month')) return 'quarterly';
    if (value.includes('annual') || value.includes('year')) return 'annual';
    if (value.includes('free')) return 'free';
    return value;
  };

  const resolveTierFromProfile = useCallback(() => {
    const fromHook = normalizeTier(getSubscriptionTier());
    if (fromHook && fromHook !== 'none') return fromHook;
    const fromProfile = normalizeTier(profile?.subscription_type);
    if (fromProfile && fromProfile !== 'none') return fromProfile;
    const altProfile = normalizeTier(profile?.subscription_tier);
    if (altProfile && altProfile !== 'none') return altProfile;
    return null;
  }, [getSubscriptionTier, profile]);
  
  const reportsPerPage = 10;

  // Tab configuration
  const tabs = [
    { id: 'reports', label: 'Past Reports', icon: FileText },
    { id: 'weaknesses', label: 'Fix My Weaknesses', icon: Target },
    { id: 'mistakes', label: 'Learn From Mistakes', icon: AlertTriangle },
    { id: 'openings', label: 'Master My Openings', icon: BookOpen },
    { id: 'endgame', label: 'Sharpen My Endgame', icon: Crown }
  ];

  // Load data on component mount
  useEffect(() => {
    if (user) {
      loadReports();
      loadStats();
      if (!hasCachedPuzzles(user.id)) {
        loadPuzzles();
      }
    }
  }, [user]);

  useEffect(() => {
    if (!user || profileLoading) {
      return;
    }

    const resolvedTier = resolveTierFromProfile() || 'free';

    if (resolvedTier !== userTier) {
      setUserTier(resolvedTier);
    }
  }, [user, profile, profileLoading, getSubscriptionTier, userTier]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * reportsPerPage;
      const reportsData = await reportService.getUserReports(user.id, {
        limit: reportsPerPage,
        offset,
        sortBy,
        sortOrder
      });
      setReports(reportsData);
    } catch (error) {
      console.error('❌ Error loading reports:', error);
      toast.error(`Failed to load reports: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || profileLoading) {
      return;
    }

    if (
      weaknessPuzzles.length === 0 &&
      mistakePuzzles.length === 0 &&
      openingPuzzles.length === 0 &&
      endgamePuzzles.length === 0
    ) {
      return;
    }

    const applyTierFiltering = async () => {
      try {
        const fallbackTier = userTier && userTier !== 'none' ? userTier : resolveTierFromProfile();

        const filteredByTier = await Promise.all([
          tierBasedPuzzleService.filterPuzzlesByTier(user.id, weaknessPuzzles, fallbackTier),
          tierBasedPuzzleService.filterPuzzlesByTier(user.id, mistakePuzzles, fallbackTier),
          tierBasedPuzzleService.filterPuzzlesByTier(user.id, openingPuzzles, fallbackTier),
          tierBasedPuzzleService.filterPuzzlesByTier(user.id, endgamePuzzles, fallbackTier)
        ]);

        const tierInfo = filteredByTier[0]?.tierInfo;
        if (tierInfo) {
          const resolvedTier = fallbackTier && fallbackTier !== 'none' ? fallbackTier : tierInfo.tier;
          if (resolvedTier && resolvedTier !== userTier) {
            setUserTier(resolvedTier);
          }
          console.log(`👤 User tier (refilter): ${resolvedTier || tierInfo.tier}`);
        }

        setPuzzlesWithTier({
          weakness: {
            accessible: filteredByTier[0]?.accessible || [],
            locked: filteredByTier[0]?.locked || []
          },
          mistake: {
            accessible: filteredByTier[1]?.accessible || [],
            locked: filteredByTier[1]?.locked || []
          },
          opening: {
            accessible: filteredByTier[2]?.accessible || [],
            locked: filteredByTier[2]?.locked || []
          },
          endgame: {
            accessible: filteredByTier[3]?.accessible || [],
            locked: filteredByTier[3]?.locked || []
          }
        });
      } catch (error) {
        console.error('⚠️ Error applying tier filters:', error);
      }
    };

    applyTierFiltering();
  }, [
    user,
    profileLoading,
    userTier,
    resolveTierFromProfile,
    weaknessPuzzles,
    mistakePuzzles,
    openingPuzzles,
    endgamePuzzles
  ]);

  const loadStats = async () => {
    try {
      const statsData = await reportService.getReportStats(user.id);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadPuzzles = async () => {
    try {
      setPuzzlesLoading(true);
      
      console.log('🔍 Loading puzzles from Supabase for Dashboard...');
      console.log('🔍 User ID:', user.id);
      
      // ✅ Run diagnostics to understand puzzle state
      const diagnostics = await puzzleAccessService.diagnosePuzzleStatus(user.id);
      
      // ✅ If we have orphaned puzzles (puzzles without report_id), try to fix them automatically
      if (diagnostics && diagnostics.puzzlesWithoutReportId > 0) {
        console.warn(`⚠️ Found ${diagnostics.puzzlesWithoutReportId} orphaned puzzles. Attempting automatic fix...`);
        try {
          const fixedCount = await puzzleAccessService.fixOrphanedPuzzles(user.id);
          if (fixedCount > 0) {
            console.log(`✅ Successfully fixed ${fixedCount} orphaned puzzles`);
            toast.success(`Fixed ${fixedCount} puzzles that weren't showing`, { duration: 4000 });
          }
        } catch (fixError) {
          console.error('❌ Failed to fix orphaned puzzles:', fixError);
          // Don't block the flow if fix fails
        }
      }
      
      // ✅ Load puzzles from Supabase (persistent across devices)
      // This ensures puzzles are never lost and accessible from any device
      
      // Load ALL puzzles for each category from most recent report
      const [weaknessData, mistakeData, openingData, endgameData] = await Promise.all([
        puzzleAccessService.getPuzzlesByCategory(user.id, 'weakness', 1000), // High limit to get all puzzles
        puzzleAccessService.getPuzzlesByCategory(user.id, 'mistake', 1000),
        puzzleAccessService.getPuzzlesByCategory(user.id, 'opening', 1000),
        puzzleAccessService.getPuzzlesByCategory(user.id, 'endgame', 1000)
      ]);
      
      console.log('🔍 Loaded from Supabase:', {
        weakness: weaknessData.length,
        mistake: mistakeData.length,
        opening: openingData.length,
        endgame: endgameData.length,
        totalPuzzles: weaknessData.length + mistakeData.length + openingData.length + endgameData.length
      });
      
      // Extract puzzle_data from Supabase records
      // Each record has the full puzzle object in the puzzle_data JSONB column
      const extractPuzzleData = (records, defaultCategory) => {
        return records.map((record, idx) => {
          // ⚠️ CRITICAL: puzzle_data might be stored as JSON string or object
          let fullData = record.puzzle_data;
          if (typeof fullData === 'string') {
            try {
              fullData = JSON.parse(fullData);
            } catch (e) {
              console.warn(`⚠️ Failed to parse puzzle_data for puzzle ${record.puzzle_key}:`, e);
              fullData = {};
            }
          }
          if (!fullData) fullData = {};
          
          const normalizedCategory = record.category === 'learn-mistakes' ? 'mistake' : record.category;
          
          // Debug log for first few puzzles
          if (idx < 2) {
            console.log(`🔍 [EXTRACTPUZZLEDATA] Puzzle ${idx} puzzle_data AFTER PARSING:`, {
              hasMetadata: !!fullData.metadata,
              metadataRating: fullData.metadata?.rating,
              metadataThemes: fullData.metadata?.themes,
              metadataThemesType: Array.isArray(fullData.metadata?.themes) ? 'array' : typeof fullData.metadata?.themes,
              rootRating: fullData.rating,
              rootThemes: fullData.themes,
              hasThemes: !!fullData.themes,
              hasTheme: !!fullData.theme,
              hasRating: !!fullData.rating,
              rating_estimate: record.rating_estimate,
              extractedRating: fullData.metadata?.rating || fullData.rating || record.rating_estimate || 1500,
              extractedThemes: fullData.metadata?.themes || fullData.themes || fullData.theme || []
            });
          }
          
          // 🎯 CRITICAL: Robust extraction with type validation
          // Priority order: metadata → root fields → record fields → defaults
          
          // Themes extraction with validation
          let extractedThemes = [];
          if (Array.isArray(fullData.metadata?.themes) && fullData.metadata.themes.length > 0) {
            extractedThemes = fullData.metadata.themes;
          } else if (Array.isArray(fullData.themes) && fullData.themes.length > 0) {
            extractedThemes = fullData.themes;
          } else if (typeof fullData.theme === 'string' && fullData.theme.length > 0) {
            extractedThemes = [fullData.theme];
          } else if (typeof record.theme === 'string' && record.theme.length > 0) {
            extractedThemes = [record.theme];
          }
          
          // Themes must be an array
          if (!Array.isArray(extractedThemes)) {
            extractedThemes = [];
          }
          
          // Rating extraction with validation
          let extractedRating = 1500; // Safe default
          if (typeof fullData.metadata?.rating === 'number' && fullData.metadata.rating > 0) {
            extractedRating = fullData.metadata.rating;
          } else if (typeof fullData.rating === 'number' && fullData.rating > 0) {
            extractedRating = fullData.rating;
          } else if (typeof record.rating_estimate === 'number' && record.rating_estimate > 0) {
            extractedRating = record.rating_estimate;
          }
          
          console.log(`🎯 [EXTRACT_FINAL] Puzzle ${fullData.id}: themes=${JSON.stringify(extractedThemes)}, rating=${extractedRating}`);
          
          return {
            ...fullData, // Spread the full puzzle data
            id: fullData.id || record.puzzle_key || record.id, // Prefer original puzzle id when available
            supabaseId: record.id, // Keep reference to Supabase record
            category: normalizedCategory || defaultCategory,
            isLocked: record.is_locked,
            isTeaser: record.is_teaser,
            // 🎯 Use validated extracted values
            themes: extractedThemes,
            rating: extractedRating,
            hint: fullData.hint || '',
            position: fullData.position || fullData.initialPosition || record.fen,
            fen: fullData.fen || record.fen,
            solution: fullData.solution || '',
            lineUci: fullData.lineUci || '',
            fullPuzzle: fullData // Keep reference to full puzzle data including metadata
          };
        });
      };

      // Update context with new puzzle data
      const extractedWeakness = extractPuzzleData(weaknessData, 'weakness');
      const extractedMistake = extractPuzzleData(mistakeData, 'mistake');
      const extractedOpening = extractPuzzleData(openingData, 'opening');
      const extractedEndgame = extractPuzzleData(endgameData, 'endgame');

      // 🔍 DEBUG: Verify extraction worked correctly
      const verifyExtraction = (puzzles, name) => {
        if (puzzles.length === 0) {
          console.log(`✅ [${name}] No puzzles to verify`);
          return;
        }
        
        // 🎯 NEW: Analyze difficulty distribution
        const easy = puzzles.filter(p => (p.rating || 0) >= 700 && (p.rating || 0) < 1500).length;
        const medium = puzzles.filter(p => (p.rating || 0) >= 1500 && (p.rating || 0) < 2000).length;
        const hard = puzzles.filter(p => (p.rating || 0) >= 2100).length;
        
        const first = puzzles[0];
        const validRating = typeof first.rating === 'number' && first.rating > 0;
        const validThemes = Array.isArray(first.themes) && first.themes.length > 0;
        console.log(`✅ [${name}] Extraction verification:`, {
          totalPuzzles: puzzles.length,
          difficultyDistribution: { easy, medium, hard },
          firstPuzzleId: first.id,
          firstPuzzleRating: first.rating,
          firstPuzzleThemes: first.themes,
          ratingValid: validRating ? '✅' : '⚠️ Rating missing/invalid',
          themesValid: validThemes ? '✅' : '⚠️ Themes missing/empty',
          allValid: validRating && validThemes ? '✅ PASS' : '❌ FAIL'
        });
      };
      
      verifyExtraction(extractedWeakness, 'Weakness');
      verifyExtraction(extractedMistake, 'Mistake');
      verifyExtraction(extractedOpening, 'Opening');
      verifyExtraction(extractedEndgame, 'Endgame');

      updatePuzzleData(user.id, extractedWeakness, extractedMistake, extractedOpening, extractedEndgame);
      
      // ✅ Apply tier-based filtering
      try {
        const fallbackTier = resolveTierFromProfile();

        const filteredByTier = await Promise.all([
          tierBasedPuzzleService.filterPuzzlesByTier(user.id, extractedWeakness, fallbackTier),
          tierBasedPuzzleService.filterPuzzlesByTier(user.id, extractedMistake, fallbackTier),
          tierBasedPuzzleService.filterPuzzlesByTier(user.id, extractedOpening, fallbackTier),
          tierBasedPuzzleService.filterPuzzlesByTier(user.id, extractedEndgame, fallbackTier)
        ]);

        // Extract tier info from first result
        const tierInfo = filteredByTier[0]?.tierInfo;
        if (tierInfo) {
          const resolvedTier = fallbackTier && fallbackTier !== 'none' ? fallbackTier : tierInfo.tier;
          if (resolvedTier && resolvedTier !== userTier) {
            setUserTier(resolvedTier);
          }
          console.log(`👤 User tier: ${resolvedTier || tierInfo.tier}`);
        }

        // Set accessible and locked puzzles by category
        setPuzzlesWithTier({
          weakness: { 
            accessible: filteredByTier[0]?.accessible || [], 
            locked: filteredByTier[0]?.locked || [] 
          },
          mistake: { 
            accessible: filteredByTier[1]?.accessible || [], 
            locked: filteredByTier[1]?.locked || [] 
          },
          opening: { 
            accessible: filteredByTier[2]?.accessible || [], 
            locked: filteredByTier[2]?.locked || [] 
          },
          endgame: { 
            accessible: filteredByTier[3]?.accessible || [], 
            locked: filteredByTier[3]?.locked || [] 
          }
        });

        console.log(`✅ Tier-based filtering complete`);
      } catch (tierError) {
        console.warn('⚠️ Tier filtering error, showing all puzzles:', tierError);
      }
      
      console.log(`✅ Loaded puzzles from Supabase: ${weaknessData.length} weakness, ${mistakeData.length} mistake, ${openingData.length} opening, ${endgameData.length} endgame`);
      
    } catch (error) {
      console.error('❌ Error loading puzzles from Supabase:', error);
      toast.error('Failed to load puzzles');
    } finally {
      setPuzzlesLoading(false);
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
      if (report.pdf_url) {
        window.open(report.pdf_url, '_blank', 'noopener,noreferrer');
        return;
      }
      
      const reportData = await reportService.getReportById(report.id, user.id);
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
      loadReports();
      loadStats();
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
      loadReports();
    } catch (error) {
      console.error('Error updating title:', error);
      toast.error('Failed to update title');
    }
  };

  const handleCancelEdit = () => {
    setEditingTitle(null);
    setNewTitle('');
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'lichess': return '♞';
      case 'chess.com': return '♜';
      default: return '♟';
    }
  };

  const handleSolveOnPawnsPoses = (puzzle, category) => {
    if (!puzzle) {
      toast.error('Puzzle data missing');
      return;
    }

    console.log('📊 [DASHBOARD] Original puzzle data:', {
      id: puzzle.id,
      themes: puzzle.themes,
      themesType: Array.isArray(puzzle.themes) ? 'array' : typeof puzzle.themes,
      rating: puzzle.rating,
      hint: puzzle.hint ? puzzle.hint.substring(0, 50) : 'none',
      hasFullPuzzle: !!puzzle.fullPuzzle,
      fullPuzzleMetadata: puzzle.fullPuzzle?.metadata ? Object.keys(puzzle.fullPuzzle.metadata) : 'N/A'
    });

    const fen = puzzle.position || puzzle.fen;
    if (!fen) {
      toast.error('Puzzle position not available');
      return;
    }

    // 🎯 CRITICAL: Preserve extracted themes and rating, with fallback to metadata if needed
    const normalizedThemes = Array.isArray(puzzle.themes) && puzzle.themes.length > 0
      ? puzzle.themes
      : (Array.isArray(puzzle.fullPuzzle?.metadata?.themes) && puzzle.fullPuzzle.metadata.themes.length > 0
        ? puzzle.fullPuzzle.metadata.themes
        : (Array.isArray(puzzle.theme) && puzzle.theme.length > 0 ? puzzle.theme : []));
    
    const normalizedRating = (typeof puzzle.rating === 'number' && puzzle.rating > 0)
      ? puzzle.rating
      : (typeof puzzle.fullPuzzle?.metadata?.rating === 'number' && puzzle.fullPuzzle.metadata.rating > 0
        ? puzzle.fullPuzzle.metadata.rating
        : 1500);
    
    const normalizedPuzzle = {
      ...puzzle,
      id: puzzle.id || puzzle.supabaseId,
      position: fen,
      fen,
      lineUci: puzzle.lineUci || puzzle.solution || puzzle.moves || '',
      solution: puzzle.solution || (puzzle.lineUci ? puzzle.lineUci.split(' ')[0] : ''),
      source: 'supabase', // Mark as user-generated puzzle from Supabase
      // 🎯 Use explicitly validated themes and rating
      themes: normalizedThemes,
      rating: normalizedRating,
      hint: puzzle.hint || puzzle.fullPuzzle?.hint || ''
    };

    console.log('📊 [DASHBOARD] Normalized puzzle before modal:', {
      id: normalizedPuzzle.id,
      rating: normalizedPuzzle.rating,
      themes: normalizedPuzzle.themes,
      themesType: Array.isArray(normalizedPuzzle.themes) ? 'array' : typeof normalizedPuzzle.themes,
      extractedCorrectly: normalizedPuzzle.rating > 1500 && normalizedPuzzle.themes.length > 0 ? '✅' : '⚠️'
    });

    setActivePuzzle({
      puzzle: normalizedPuzzle,
      category
    });
  };

  const availablePlatforms = [...new Set(reports.map(r => r.platform))];

  // Render puzzle section with tier-based locking
  const renderPuzzleSection = (category) => {
    const categoryData = puzzlesWithTier[category];
    const accessible = categoryData?.accessible || [];
    const locked = categoryData?.locked || [];

    if (puzzlesLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin mr-2" size={24} />
          <span className="text-gray-600">Loading puzzles...</span>
        </div>
      );
    }

    if (accessible.length === 0 && locked.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="mb-4 text-gray-400">
            {category === 'weakness' && <Target size={64} className="mx-auto" />}
            {category === 'mistake' && <AlertTriangle size={64} className="mx-auto" />}
            {category === 'opening' && <BookOpen size={64} className="mx-auto" />}
            {category === 'endgame' && <Crown size={64} className="mx-auto" />}
          </div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No puzzles generated yet</h3>
          <p className="text-gray-600 mb-4">Play more games and generate reports to unlock personalized puzzles!</p>
          <button
            onClick={() => navigate('/reports')}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all shadow-md hover:shadow-lg"
          >
            Generate Report
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {/* Accessible Puzzles */}
        {accessible.length > 0 && (
          <div>
            {accessible.length > 0 && locked.length > 0 && (
              <h4 className="text-lg font-semibold text-gray-700 mb-4">
                ✅ Unlocked ({accessible.length} puzzle{accessible.length !== 1 ? 's' : ''})
              </h4>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {accessible.map((puzzle, index) => {
                const fen = puzzle.fen || puzzle.position;
                const isTeaserText = (puzzle.isTeaser || puzzle.is_teaser || puzzle.isTeaserPromo) ? '🎁 Teaser' : '';
                
                return (
                  <motion.div
                    key={puzzle.id || index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white rounded-lg p-6 shadow-lg hover:shadow-xl transition-shadow border-2 border-green-100"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-gray-500 text-sm">#{index + 1}</span>
                      {isTeaserText && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                          {isTeaserText}
                        </span>
                      )}
                    </div>
                    
                    {fen && (
                      <div className="mb-4 flex justify-center">
                        <ChessBoardPreview 
                          position={fen}
                          orientation="auto"
                          size={240}
                          showCoordinates={false}
                        />
                      </div>
                    )}
                    
                    {(puzzle.objective || puzzle.description || puzzle.title) && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-700 font-medium">
                          {puzzle.objective || puzzle.description || puzzle.title}
                        </p>
                      </div>
                    )}
                    
                    {puzzle.theme && (
                      <div className="mb-4">
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {puzzle.theme}
                        </span>
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      <button
                        onClick={() => handleSolveOnPawnsPoses(puzzle, category)}
                        className="w-full px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all"
                      >
                        Solve on PawnsPoses
                      </button>
                      <button
                        onClick={() => {
                          if (fen) {
                            const lichessFen = fen.replace(/ /g, '_');
                            const lichessUrl = `https://lichess.org/analysis/${lichessFen}`;
                            window.open(lichessUrl, '_blank');
                          } else {
                            toast.error('Puzzle position not available');
                          }
                        }}
                        className="w-full px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all"
                      >
                        Solve on Lichess →
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Locked Puzzles */}
        {locked.length > 0 && (
          <div>
            <h4 className="text-lg font-semibold text-gray-700 mb-4">
              🔒 Locked ({locked.length} puzzle{locked.length !== 1 ? 's' : ''})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {locked.slice(0, 3).map((puzzle, index) => (
                <motion.div
                  key={puzzle.id || index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-gray-50 rounded-lg p-6 shadow-md border-2 border-gray-200 opacity-60 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-gray-200/20 pointer-events-none" />
                  
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-gray-400 text-sm">#{accessible.length + index + 1}</span>
                    <Lock size={20} className="text-gray-400" />
                  </div>
                  
                  {puzzle.fen || puzzle.position ? (
                    <div className="mb-4 flex justify-center opacity-40">
                      <ChessBoardPreview 
                        position={puzzle.fen || puzzle.position}
                        orientation="auto"
                        size={240}
                        showCoordinates={false}
                      />
                    </div>
                  ) : null}
                  
                  <div className="mb-4 blur-sm">
                    {(puzzle.objective || puzzle.description || puzzle.title) && (
                      <p className="text-sm text-gray-600 font-medium">
                        {puzzle.objective || puzzle.description || puzzle.title}
                      </p>
                    )}
                  </div>
                  
                  <button
                    onClick={() => navigate('/pricing')}
                    className="w-full px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all"
                  >
                    Unlock with Plan
                  </button>
                </motion.div>
              ))}
            </div>

            {/* Show upgrade prompt if there are locked puzzles */}
            {locked.length > 0 && userTier === 'free' && (
              <div className="mt-8">
                <UpgradePrompt 
                  title="Unlock All Puzzles"
                  description={`You have ${locked.length} more puzzle${locked.length !== 1 ? 's' : ''} waiting! Subscribe to unlock the complete personalized puzzle set.`}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render reports section
  const renderReportsSection = () => {
    if (loading && reports.length === 0) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin mr-2" size={24} />
          <span className="text-gray-600">Loading reports...</span>
        </div>
      );
    }

    return (
      <>
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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
          </div>
        )}

        {/* Controls */}
        <div className="bg-white rounded-lg p-6 shadow-lg mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search reports..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Platform Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <select
                value={filterPlatform}
                onChange={(e) => setFilterPlatform(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
              >
                <option value="all">All Platforms</option>
                {availablePlatforms.map(platform => (
                  <option key={platform} value={platform}>{platform}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="created_at">Date</option>
                <option value="title">Title</option>
                <option value="game_count">Games</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {sortOrder === 'asc' ? <SortAsc size={20} /> : <SortDesc size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Reports List */}
        <div className="space-y-4">
          {filteredReports.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow-lg">
              <FileText className="mx-auto mb-4 text-gray-400" size={64} />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No reports found</h3>
              <p className="text-gray-600">Generate your first chess analysis report to get started!</p>
            </div>
          ) : (
            filteredReports.map((report) => (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-lg p-6 shadow-lg hover:shadow-xl transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {editingTitle === report.id ? (
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          className="flex-1 px-3 py-1 border border-blue-500 rounded focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveTitle(report.id)}
                          className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          <CheckCircle size={16} />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <h3 className="text-xl font-semibold text-gray-800 mb-2">{report.title}</h3>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-1">
                        <User size={16} />
                        <span>{report.username}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-lg">{getPlatformIcon(report.platform)}</span>
                        <span>{report.platform}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar size={16} />
                        <span>{formatDate(report.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <BarChart3 size={16} />
                        <span>{report.game_count} games</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleViewReport(report)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="View Report"
                    >
                      <Eye size={20} />
                    </button>
                    <button
                      onClick={() => handleEditTitle(report)}
                      className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                      title="Edit Title"
                    >
                      <Edit3 size={20} />
                    </button>
                    <button
                      onClick={() => handleDeleteReport(report.id, report.title)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Report"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Pagination */}
        {filteredReports.length > 0 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-gray-600">
              Page {currentPage}
            </span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={filteredReports.length < reportsPerPage}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </>
    );
  };

  if (loading && reports.length === 0 && !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4" size={48} />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const handleCloseSolver = () => {
    setActivePuzzle(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pt-24 pb-8">
      <div className="container mx-auto px-4 max-w-7xl">
        
        {/* Subscription Status Banner */}
        {user && !profileLoading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            {userTier === 'free' ? (
              hasClaimedFreeReport() ? (
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-[#7C2D12] dark:to-[#92400E] border-2 border-orange-200 dark:border-orange-800 rounded-xl p-4 shadow-md">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <Lock className="w-6 h-6 text-orange-600 dark:text-orange-300" />
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-orange-100">📋 Free Plan - Limited Puzzles</p>
                        <p className="text-sm text-gray-600 dark:text-orange-200">You have 1 teaser puzzle per category. Subscribe to unlock full puzzle sets weekly!</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/pricing')}
                      className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-lg hover:from-orange-600 hover:to-amber-600 transition-all shadow-md hover:shadow-lg"
                    >
                      Upgrade Now
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-[#14532D] dark:to-[#155E3B] border-2 border-green-200 dark:border-green-800 rounded-xl p-4 shadow-md">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-500 dark:bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        1
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-green-100">Free Report Available</p>
                        <p className="text-sm text-gray-600 dark:text-green-200">You have 1 free report remaining. Subscribe for unlimited access!</p>
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
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-[#581C87] dark:to-[#4F46E5] border-2 border-purple-200 dark:border-purple-800 rounded-xl p-4 shadow-md">
                <div className="flex items-center gap-3">
                  <Crown className="w-6 h-6 text-purple-600 dark:text-purple-300" />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 dark:text-purple-100">
                      ✨ {userTier.charAt(0).toUpperCase() + userTier.slice(1).replace('_', ' ')} Plan Active
                    </p>
                    <p className="text-sm text-gray-600 dark:text-purple-200">
                      {userTier === 'one_time' 
                        ? 'Valid for 1 week from purchase'
                        : userTier === 'monthly' 
                        ? 'Weekly puzzle updates with premium access'
                        : userTier === 'quarterly'
                        ? '3 months of weekly puzzles & reports'
                        : userTier === 'annual'
                        ? 'Full year access + priority features'
                        : 'Enjoy your subscription!'}
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
          <h1 className="text-4xl font-bold text-gray-800 mb-2">My Dashboard</h1>
          <p className="text-gray-600">View your reports and practice with personalized puzzles</p>
        </motion.div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-lg mb-8 overflow-x-auto">
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-semibold transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={20} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'reports' && renderReportsSection()}
            {activeTab === 'weaknesses' && renderPuzzleSection('weakness')}
            {activeTab === 'mistakes' && renderPuzzleSection('mistake')}
            {activeTab === 'openings' && renderPuzzleSection('opening')}
            {activeTab === 'endgame' && renderPuzzleSection('endgame')}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Puzzle Solver Modal */}
      {activePuzzle && (
        <DashboardPuzzleSolver
          entry={activePuzzle}
          onClose={handleCloseSolver}
        />
      )}
    </div>
  );
};

export default Dashboard;