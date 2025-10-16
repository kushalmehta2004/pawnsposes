# 🚀 Dashboard Implementation Roadmap - Production Ready

## 📋 Executive Summary

**Goal:** Transform "My Reports" into a comprehensive "Dashboard" with 5 sections:
1. Past Reports (PDF viewing)
2. Fix My Weaknesses Puzzles
3. Learn From Mistakes Puzzles
4. Master My Openings Puzzles
5. Sharpen My Endgame Puzzles

**Current Status Analysis:**
- ✅ Supabase database schema for puzzles **ALREADY EXISTS** (`database-puzzles-setup.sql`)
- ✅ Puzzle access service **ALREADY EXISTS** (`puzzleAccessService.js`)
- ✅ Report service **ALREADY EXISTS** (`reportService.js`)
- ✅ Puzzles are **PARTIALLY** stored in Supabase (metadata only)
- ⚠️ Full puzzle data still in IndexedDB (needs migration)
- ⚠️ Dashboard UI doesn't exist yet
- ⚠️ Navigation needs update (My Reports → Dashboard)

---

## 🎯 PHASE 1: Database Schema Verification & Enhancement
**Duration:** 1-2 hours  
**Status:** 🔄 Verification Required

### Tasks:

#### 1.1 Verify Existing Supabase Tables ✅
**Action:** Check if tables exist and are properly configured
```sql
-- Run in Supabase SQL Editor
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('reports', 'puzzles', 'puzzle_unlocks', 'puzzle_progress');
```

**Expected Result:**
- ✅ `reports` table exists
- ✅ `puzzles` table exists
- ✅ `puzzle_unlocks` table exists
- ✅ `puzzle_progress` table exists

#### 1.2 Add Full Puzzle Data Storage Column
**Action:** Extend `puzzles` table to store complete puzzle data (not just metadata)

```sql
-- Add JSONB column for full puzzle data
ALTER TABLE puzzles 
ADD COLUMN IF NOT EXISTS puzzle_data JSONB;

-- Add index for faster retrieval
CREATE INDEX IF NOT EXISTS puzzles_puzzle_data_idx ON puzzles USING GIN (puzzle_data);

-- Add comment
COMMENT ON COLUMN puzzles.puzzle_data IS 'Complete puzzle data including moves, solutions, hints, etc.';
```

**Why:** Currently only metadata is stored. We need full puzzle data for dashboard display.

#### 1.3 Create Dashboard-Specific Views
**Action:** Create optimized views for dashboard queries

```sql
-- View: Latest puzzles per category per user
CREATE OR REPLACE VIEW user_latest_puzzles AS
SELECT DISTINCT ON (user_id, category)
  id,
  user_id,
  report_id,
  category,
  difficulty,
  theme,
  is_locked,
  is_teaser,
  fen,
  title,
  puzzle_data,
  created_at
FROM puzzles
ORDER BY user_id, category, created_at DESC;

-- View: User puzzle statistics
CREATE OR REPLACE VIEW user_puzzle_stats AS
SELECT 
  user_id,
  category,
  COUNT(*) as total_puzzles,
  COUNT(*) FILTER (WHERE is_teaser = true) as free_puzzles,
  COUNT(*) FILTER (WHERE is_locked = false) as unlocked_puzzles,
  COUNT(*) FILTER (WHERE is_locked = true) as locked_puzzles,
  MAX(created_at) as last_generated
FROM puzzles
GROUP BY user_id, category;
```

#### 1.4 Verify RLS Policies
**Action:** Ensure Row Level Security is properly configured

```sql
-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('puzzles', 'reports', 'puzzle_unlocks', 'puzzle_progress');
```

**Expected Policies:**
- Users can only see their own puzzles
- Users can only see their own reports
- Users can only modify their own progress

### Deliverables:
- ✅ Database schema verified
- ✅ `puzzle_data` column added
- ✅ Dashboard views created
- ✅ RLS policies verified
- 📄 `PHASE1_DATABASE_VERIFICATION.md` (verification report)

---

## 🎯 PHASE 2: Puzzle Storage Migration (IndexedDB → Supabase)
**Duration:** 3-4 hours  
**Status:** 🔄 Critical Migration

### Current State:
- Puzzles are generated in `puzzleGenerationService.js`
- Metadata stored in Supabase via `puzzleAccessService.storePuzzlesBatch()`
- **Full puzzle data stored in IndexedDB** (`puzzleDatabase.js`)

### Target State:
- Full puzzle data stored in Supabase `puzzles.puzzle_data` column
- IndexedDB used only as cache (optional)
- Dashboard fetches from Supabase (single source of truth)

### Tasks:

#### 2.1 Update Puzzle Generation Service
**File:** `src/services/puzzleGenerationService.js`

**Changes:**
1. After generating puzzles, store full data in Supabase
2. Keep IndexedDB as fallback cache
3. Add report_id association

**Implementation:**
```javascript
// In puzzleGenerationService.js
import puzzleAccessService from './puzzleAccessService';

// After puzzle generation (around line 500-600)
async function storePuzzlesAfterGeneration(puzzles, userId, reportId, category) {
  try {
    // Store in Supabase with full data
    await puzzleAccessService.storePuzzlesBatch(
      puzzles.map(p => ({
        ...p,
        category: category,
        puzzle_data: p // Store complete puzzle object
      })),
      userId,
      reportId,
      1 // 1 teaser per category
    );
    
    console.log(`✅ Stored ${puzzles.length} ${category} puzzles in Supabase`);
    
    // Also store in IndexedDB for offline access (optional)
    await storePuzzlesInIndexedDB(puzzles, category);
  } catch (error) {
    console.error('❌ Failed to store puzzles:', error);
    // Fallback to IndexedDB only
    await storePuzzlesInIndexedDB(puzzles, category);
  }
}
```

#### 2.2 Update Puzzle Access Service
**File:** `src/services/puzzleAccessService.js`

**Changes:**
1. Modify `storePuzzlesBatch()` to accept full puzzle data
2. Store in `puzzle_data` JSONB column
3. Add retrieval methods for dashboard

**Implementation:**
```javascript
// In puzzleAccessService.js

async storePuzzlesBatch(puzzles, userId, reportId, teaserCount = 1) {
  try {
    const puzzlesByCategory = puzzles.reduce((acc, puzzle) => {
      const category = puzzle.category || 'tactical';
      if (!acc[category]) acc[category] = [];
      acc[category].push(puzzle);
      return acc;
    }, {});

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
          fen: puzzle.fen || puzzle.position,
          title: puzzle.title || puzzle.description,
          source_game_id: puzzle.sourceGameId,
          rating_estimate: puzzle.ratingEstimate || this._estimateRating(puzzle.difficulty),
          puzzle_data: puzzle // 🆕 Store full puzzle data
        });
      });
    }

    const { data, error } = await supabase
      .from('puzzles')
      .insert(puzzleRecords)
      .select();

    if (error) throw error;

    console.log(`✅ Stored ${data.length} complete puzzles in Supabase`);
    return data;
  } catch (error) {
    console.error('❌ Failed to store puzzle batch:', error);
    throw error;
  }
}

/**
 * Get latest puzzles for dashboard (one per category)
 */
async getLatestPuzzlesByCategory(userId) {
  try {
    const { data, error } = await supabase
      .from('user_latest_puzzles')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    // Group by category
    const puzzlesByCategory = {
      tactical: [],
      positional: [],
      opening: [],
      endgame: []
    };

    data.forEach(puzzle => {
      if (puzzlesByCategory[puzzle.category]) {
        puzzlesByCategory[puzzle.category].push(puzzle);
      }
    });

    return puzzlesByCategory;
  } catch (error) {
    console.error('❌ Failed to fetch latest puzzles:', error);
    throw error;
  }
}

/**
 * Get puzzle statistics for dashboard
 */
async getPuzzleStats(userId) {
  try {
    const { data, error } = await supabase
      .from('user_puzzle_stats')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    return data.reduce((acc, stat) => {
      acc[stat.category] = stat;
      return acc;
    }, {});
  } catch (error) {
    console.error('❌ Failed to fetch puzzle stats:', error);
    throw error;
  }
}
```

#### 2.3 Update Report Display Integration
**File:** `src/pages/ReportDisplay.js`

**Changes:**
1. Pass `reportId` to puzzle generation
2. Ensure puzzles are stored in Supabase after generation

**Current Code (around line 68-160):**
```javascript
const prewarmUserPuzzles = async (analysisData) => {
  // ... existing code ...
  
  // 🆕 Add after puzzle generation
  if (userId && reportId) {
    await puzzleAccessService.storePuzzlesBatch(
      learnDistinct,
      userId,
      reportId,
      1 // 1 teaser per category
    );
  }
};
```

#### 2.4 Update All Puzzle Generation Flows
**Files to Update:**
- `src/services/weaknessPuzzleService.js` (Fix My Weaknesses)
- `src/services/puzzleGenerationService.js` (Learn From Mistakes)
- `src/services/openingAnalysisService.js` (Master My Openings)
- `src/services/endgameService.js` (Sharpen My Endgame - if exists)

**Pattern:**
```javascript
// After generating puzzles
if (userId && reportId) {
  await puzzleAccessService.storePuzzlesBatch(
    generatedPuzzles,
    userId,
    reportId,
    1 // 1 teaser per category
  );
}
```

### Deliverables:
- ✅ All puzzle generation flows store in Supabase
- ✅ Full puzzle data included in storage
- ✅ IndexedDB kept as optional cache
- ✅ Report-puzzle association maintained
- 📄 `PHASE2_MIGRATION_COMPLETE.md` (migration report)

---

## 🎯 PHASE 3: Dashboard UI Development
**Duration:** 6-8 hours  
**Status:** 🆕 New Development

### Tasks:

#### 3.1 Create Dashboard Page Component
**File:** `src/pages/Dashboard.js` (NEW)

**Structure:**
```javascript
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, 
  Target, 
  Brain, 
  BookOpen, 
  Crown,
  Lock,
  Unlock,
  TrendingUp,
  Calendar,
  User
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import reportService from '../services/reportService';
import puzzleAccessService from '../services/puzzleAccessService';
import toast from 'react-hot-toast';

// Import section components
import PastReportsSection from '../components/Dashboard/PastReportsSection';
import PuzzleSection from '../components/Dashboard/PuzzleSection';

const Dashboard = () => {
  const { user } = useAuth();
  const { profile, hasActiveSubscription } = useUserProfile();
  
  const [activeTab, setActiveTab] = useState('reports');
  const [reports, setReports] = useState([]);
  const [puzzles, setPuzzles] = useState({});
  const [puzzleStats, setPuzzleStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load reports
      const reportsData = await reportService.getUserReports(user.id, {
        limit: 10,
        sortBy: 'created_at',
        sortOrder: 'desc'
      });
      setReports(reportsData);
      
      // Load latest puzzles per category
      const puzzlesData = await puzzleAccessService.getLatestPuzzlesByCategory(user.id);
      setPuzzles(puzzlesData);
      
      // Load puzzle statistics
      const statsData = await puzzleAccessService.getPuzzleStats(user.id);
      setPuzzleStats(statsData);
      
    } catch (error) {
      console.error('❌ Error loading dashboard:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'reports', label: 'Past Reports', icon: FileText },
    { id: 'weaknesses', label: 'Fix My Weaknesses', icon: Target, category: 'tactical' },
    { id: 'mistakes', label: 'Learn From Mistakes', icon: Brain, category: 'positional' },
    { id: 'openings', label: 'Master My Openings', icon: BookOpen, category: 'opening' },
    { id: 'endgame', label: 'Sharpen My Endgame', icon: Crown, category: 'endgame' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pt-24 pb-8">
      <div className="container mx-auto px-4 max-w-7xl">
        
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-gray-800 mb-2">My Dashboard</h1>
          <p className="text-gray-600">View your reports and practice puzzles</p>
        </motion.div>

        {/* Subscription Status Banner */}
        {/* ... similar to MyReports.js ... */}

        {/* Tab Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-lg mb-8 overflow-x-auto"
        >
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const stats = tab.category ? puzzleStats[tab.category] : null;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                      : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={20} />
                  <span>{tab.label}</span>
                  {stats && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-gray-200 rounded-full">
                      {stats.total_puzzles}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'reports' && (
            <PastReportsSection 
              reports={reports} 
              loading={loading}
              onRefresh={loadDashboardData}
            />
          )}
          
          {activeTab === 'weaknesses' && (
            <PuzzleSection
              category="tactical"
              title="Fix My Weaknesses"
              description="Practice tactical puzzles based on your game analysis"
              puzzles={puzzles.tactical || []}
              stats={puzzleStats.tactical}
              loading={loading}
              hasSubscription={hasActiveSubscription()}
            />
          )}
          
          {activeTab === 'mistakes' && (
            <PuzzleSection
              category="positional"
              title="Learn From Mistakes"
              description="Replay positions where you missed opportunities"
              puzzles={puzzles.positional || []}
              stats={puzzleStats.positional}
              loading={loading}
              hasSubscription={hasActiveSubscription()}
            />
          )}
          
          {activeTab === 'openings' && (
            <PuzzleSection
              category="opening"
              title="Master My Openings"
              description="Practice opening positions from your games"
              puzzles={puzzles.opening || []}
              stats={puzzleStats.opening}
              loading={loading}
              hasSubscription={hasActiveSubscription()}
            />
          )}
          
          {activeTab === 'endgame' && (
            <PuzzleSection
              category="endgame"
              title="Sharpen My Endgame"
              description="Master endgame techniques from your games"
              puzzles={puzzles.endgame || []}
              stats={puzzleStats.endgame}
              loading={loading}
              hasSubscription={hasActiveSubscription()}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Dashboard;
```

#### 3.2 Create Past Reports Section Component
**File:** `src/components/Dashboard/PastReportsSection.js` (NEW)

**Purpose:** Display PDF reports (reuse logic from MyReports.js)

```javascript
import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Calendar, Eye, Download, Loader2 } from 'lucide-react';

const PastReportsSection = ({ reports, loading, onRefresh }) => {
  const handleViewReport = (report) => {
    if (report.pdf_url) {
      window.open(report.pdf_url, '_blank', 'noopener,noreferrer');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={48} />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white rounded-lg p-12 text-center shadow-lg"
      >
        <FileText size={64} className="mx-auto mb-4 text-gray-300" />
        <h3 className="text-xl font-semibold text-gray-700 mb-2">No Reports Yet</h3>
        <p className="text-gray-500 mb-6">Generate your first chess analysis report to get started</p>
        <button
          onClick={() => window.location.href = '/reports'}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Generate Report
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {reports.map((report, index) => (
        <motion.div
          key={report.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-white rounded-lg p-6 shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
          onClick={() => handleViewReport(report)}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="text-blue-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">{report.title}</h3>
                <p className="text-sm text-gray-500">@{report.username}</p>
              </div>
            </div>
          </div>
          
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Calendar size={16} />
              <span>{new Date(report.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 size={16} />
              <span>{report.game_count} games analyzed</span>
            </div>
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleViewReport(report);
            }}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Eye size={16} />
            <span>View Report</span>
          </button>
        </motion.div>
      ))}
    </motion.div>
  );
};

export default PastReportsSection;
```

#### 3.3 Create Puzzle Section Component
**File:** `src/components/Dashboard/PuzzleSection.js` (NEW)

**Purpose:** Display puzzles for each category with lock/unlock status

```javascript
import React from 'react';
import { motion } from 'framer-motion';
import { 
  Lock, 
  Unlock, 
  Play, 
  TrendingUp, 
  Calendar,
  Loader2,
  AlertCircle 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PuzzleSection = ({ 
  category, 
  title, 
  description, 
  puzzles, 
  stats, 
  loading, 
  hasSubscription 
}) => {
  const navigate = useNavigate();

  const handlePuzzleClick = (puzzle) => {
    if (puzzle.is_locked && !hasSubscription) {
      // Show upgrade modal
      navigate('/pricing');
      return;
    }
    
    // Navigate to puzzle page
    navigate(`/puzzle/${category}`, {
      state: { 
        puzzleId: puzzle.id,
        puzzleData: puzzle.puzzle_data 
      }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={48} />
      </div>
    );
  }

  if (!puzzles || puzzles.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white rounded-lg p-12 text-center shadow-lg"
      >
        <AlertCircle size={64} className="mx-auto mb-4 text-gray-300" />
        <h3 className="text-xl font-semibold text-gray-700 mb-2">No Puzzles Generated Yet</h3>
        <p className="text-gray-500 mb-6">
          Generate a chess report to unlock personalized {title.toLowerCase()} puzzles
        </p>
        <button
          onClick={() => navigate('/reports')}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Generate Report
        </button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Card */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-gray-800 mb-4">{title} Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.total_puzzles}</p>
              <p className="text-sm text-gray-600">Total Puzzles</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{stats.free_puzzles}</p>
              <p className="text-sm text-gray-600">Free Teasers</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">{stats.unlocked_puzzles}</p>
              <p className="text-sm text-gray-600">Unlocked</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.locked_puzzles}</p>
              <p className="text-sm text-gray-600">Locked</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Puzzles Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {puzzles.slice(0, 6).map((puzzle, index) => (
          <motion.div
            key={puzzle.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`bg-white rounded-lg p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer ${
              puzzle.is_locked && !hasSubscription ? 'opacity-75' : ''
            }`}
            onClick={() => handlePuzzleClick(puzzle)}
          >
            {/* Lock/Unlock Badge */}
            <div className="flex items-center justify-between mb-4">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                puzzle.is_teaser 
                  ? 'bg-green-100 text-green-700'
                  : puzzle.is_locked && !hasSubscription
                  ? 'bg-red-100 text-red-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {puzzle.is_teaser ? '🎁 FREE TEASER' : puzzle.is_locked && !hasSubscription ? '🔒 LOCKED' : '✅ UNLOCKED'}
              </span>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                puzzle.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                puzzle.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {puzzle.difficulty.toUpperCase()}
              </span>
            </div>

            {/* Puzzle Title */}
            <h4 className="font-semibold text-gray-800 mb-2">
              {puzzle.title || `${category} Puzzle #${index + 1}`}
            </h4>

            {/* Puzzle Info */}
            <div className="space-y-2 text-sm text-gray-600 mb-4">
              {puzzle.theme && (
                <p className="flex items-center gap-2">
                  <TrendingUp size={14} />
                  <span>Theme: {puzzle.theme}</span>
                </p>
              )}
              <p className="flex items-center gap-2">
                <Calendar size={14} />
                <span>{new Date(puzzle.created_at).toLocaleDateString()}</span>
              </p>
            </div>

            {/* Action Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePuzzleClick(puzzle);
              }}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                puzzle.is_locked && !hasSubscription
                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
              disabled={puzzle.is_locked && !hasSubscription}
            >
              {puzzle.is_locked && !hasSubscription ? (
                <>
                  <Lock size={16} />
                  <span>Upgrade to Unlock</span>
                </>
              ) : (
                <>
                  <Play size={16} />
                  <span>Solve Puzzle</span>
                </>
              )}
            </button>
          </motion.div>
        ))}
      </motion.div>

      {/* View All Button */}
      {puzzles.length > 6 && (
        <div className="text-center">
          <button
            onClick={() => navigate(`/puzzle/${category}`)}
            className="px-8 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            View All {puzzles.length} Puzzles
          </button>
        </div>
      )}
    </div>
  );
};

export default PuzzleSection;
```

#### 3.4 Update Navigation (Header)
**File:** `src/components/Layout/Header.js`

**Changes:**
- Replace "My Reports" with "Dashboard"
- Update route from `/my-reports` to `/dashboard`

```javascript
// Line 133-140 (Desktop)
<Link
  to="/dashboard"  // Changed from /my-reports
  onClick={() => setShowUserMenu(false)}
  className="flex items-center space-x-2 w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 transition-colors"
>
  <User size={16} />
  <span>Dashboard</span>  {/* Changed from My Reports */}
</Link>

// Line 211-218 (Mobile)
<Link
  to="/dashboard"  // Changed from /my-reports
  onClick={closeMenu}
  className="flex items-center justify-center space-x-2 w-full px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
>
  <User size={18} />
  <span>Dashboard</span>  {/* Changed from My Reports */}
</Link>
```

#### 3.5 Update Routing
**File:** `src/App.js`

**Changes:**
- Add Dashboard route
- Keep MyReports as fallback (optional)

```javascript
import Dashboard from './pages/Dashboard';

// In routes
<Route path="/dashboard" element={<Dashboard />} />
<Route path="/my-reports" element={<Navigate to="/dashboard" replace />} /> {/* Redirect old route */}
```

#### 3.6 Dark Mode Support
**File:** `src/components/Dashboard/Dashboard.js` and all sub-components

**Implementation:**
- Use existing Tailwind dark mode classes
- Ensure all components inherit theme from parent
- Test with dark mode toggle (if exists)

```javascript
// Example dark mode classes
className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
```

### Deliverables:
- ✅ Dashboard page created
- ✅ Past Reports section functional
- ✅ 4 puzzle sections functional
- ✅ Navigation updated
- ✅ Routing configured
- ✅ Dark mode support
- 📄 `PHASE3_DASHBOARD_UI_COMPLETE.md`

---

## 🎯 PHASE 4: Testing & Quality Assurance
**Duration:** 3-4 hours  
**Status:** 🧪 Testing Phase

### Tasks:

#### 4.1 Database Testing
**Checklist:**
- [ ] Verify puzzles are stored with full data
- [ ] Check report-puzzle associations
- [ ] Test RLS policies (users can only see their own data)
- [ ] Verify teaser logic (1 per category)
- [ ] Test puzzle retrieval performance

**SQL Test Queries:**
```sql
-- Test 1: Check puzzle storage
SELECT 
  category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE is_teaser = true) as teasers,
  COUNT(*) FILTER (WHERE puzzle_data IS NOT NULL) as with_data
FROM puzzles
WHERE user_id = 'YOUR_USER_ID'
GROUP BY category;

-- Test 2: Check latest puzzles view
SELECT * FROM user_latest_puzzles WHERE user_id = 'YOUR_USER_ID';

-- Test 3: Check puzzle stats view
SELECT * FROM user_puzzle_stats WHERE user_id = 'YOUR_USER_ID';
```

#### 4.2 Frontend Testing
**Checklist:**
- [ ] Dashboard loads without errors
- [ ] All 5 tabs display correctly
- [ ] Past reports section shows PDFs
- [ ] Puzzle sections show correct data
- [ ] Lock/unlock badges display correctly
- [ ] Free teasers are accessible
- [ ] Locked puzzles show upgrade prompt
- [ ] Navigation works (Header → Dashboard)
- [ ] Mobile responsive design
- [ ] Dark mode works (if applicable)

#### 4.3 Integration Testing
**Checklist:**
- [ ] Generate new report → Puzzles stored in Supabase
- [ ] Dashboard shows newly generated puzzles
- [ ] Click puzzle → Navigates to puzzle page
- [ ] Click locked puzzle → Shows pricing page
- [ ] Click report → Opens PDF
- [ ] Refresh dashboard → Data persists
- [ ] Sign out → Sign in → Data still there

#### 4.4 Performance Testing
**Checklist:**
- [ ] Dashboard loads in <2 seconds
- [ ] Puzzle data retrieval is fast (<500ms)
- [ ] No memory leaks (check DevTools)
- [ ] Smooth animations
- [ ] No console errors

#### 4.5 Edge Case Testing
**Checklist:**
- [ ] User with no reports → Shows empty state
- [ ] User with no puzzles → Shows empty state
- [ ] User with only 1 category of puzzles → Works
- [ ] Free user with locked puzzles → Shows correctly
- [ ] Subscribed user → All puzzles unlocked
- [ ] Network error → Graceful error handling

### Deliverables:
- ✅ All tests passed
- ✅ Bugs fixed
- ✅ Performance optimized
- 📄 `PHASE4_TESTING_REPORT.md`

---

## 🎯 PHASE 5: Production Deployment
**Duration:** 2-3 hours  
**Status:** 🚀 Deployment

### Tasks:

#### 5.1 Pre-Deployment Checklist
- [ ] All code reviewed
- [ ] All tests passed
- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] Build succeeds without errors
- [ ] No console errors in production build

#### 5.2 Database Deployment
**Steps:**
1. Backup existing Supabase database
2. Run Phase 1 SQL scripts in production
3. Verify tables and views created
4. Test RLS policies in production

#### 5.3 Frontend Deployment
**Steps:**
1. Build production bundle: `npm run build`
2. Test production build locally
3. Deploy to hosting (Vercel/Netlify/etc.)
4. Verify deployment successful
5. Test live site

#### 5.4 Post-Deployment Verification
**Checklist:**
- [ ] Dashboard accessible at `/dashboard`
- [ ] All tabs functional
- [ ] Puzzles loading correctly
- [ ] Reports displaying correctly
- [ ] No 404 errors
- [ ] No console errors
- [ ] Mobile works correctly
- [ ] Dark mode works (if applicable)

#### 5.5 User Communication
**Tasks:**
- [ ] Update documentation
- [ ] Notify users of new Dashboard feature
- [ ] Create tutorial/guide (optional)
- [ ] Monitor for user feedback

### Deliverables:
- ✅ Production deployment complete
- ✅ All features working in production
- ✅ Users notified
- 📄 `PHASE5_DEPLOYMENT_COMPLETE.md`

---

## 🎯 PHASE 6: Monitoring & Optimization
**Duration:** Ongoing  
**Status:** 📊 Post-Launch

### Tasks:

#### 6.1 Monitoring Setup
- [ ] Set up error tracking (Sentry/LogRocket)
- [ ] Monitor Supabase query performance
- [ ] Track user engagement with Dashboard
- [ ] Monitor puzzle generation success rate

#### 6.2 Performance Optimization
- [ ] Optimize database queries
- [ ] Add caching where appropriate
- [ ] Lazy load puzzle data
- [ ] Optimize images/assets

#### 6.3 User Feedback
- [ ] Collect user feedback
- [ ] Identify pain points
- [ ] Prioritize improvements
- [ ] Implement enhancements

### Deliverables:
- ✅ Monitoring in place
- ✅ Performance optimized
- ✅ User feedback collected
- 📄 `PHASE6_OPTIMIZATION_REPORT.md`

---

## 📊 Progress Tracking

### Overall Progress: 0% Complete

| Phase | Status | Progress | Duration | Priority |
|-------|--------|----------|----------|----------|
| Phase 1: Database | 🔄 Not Started | 0% | 1-2 hours | 🔴 Critical |
| Phase 2: Migration | 🔄 Not Started | 0% | 3-4 hours | 🔴 Critical |
| Phase 3: UI Development | 🔄 Not Started | 0% | 6-8 hours | 🔴 Critical |
| Phase 4: Testing | 🔄 Not Started | 0% | 3-4 hours | 🟡 High |
| Phase 5: Deployment | 🔄 Not Started | 0% | 2-3 hours | 🟡 High |
| Phase 6: Monitoring | 🔄 Not Started | 0% | Ongoing | 🟢 Medium |

**Total Estimated Time:** 15-21 hours (2-3 days of focused work)

---

## 🚨 Critical Dependencies

### Must Complete First:
1. ✅ Supabase database setup (already done)
2. ✅ Authentication system (already done)
3. ✅ Report generation (already done)
4. ⚠️ Phase 1 (Database schema enhancement)
5. ⚠️ Phase 2 (Puzzle storage migration)

### Can Work in Parallel:
- Phase 3 UI development (after Phase 1 complete)
- Phase 4 Testing (alongside Phase 3)

---

## 🎯 Success Criteria

### Phase 1-2 Success:
- ✅ All puzzles stored in Supabase with full data
- ✅ Report-puzzle associations maintained
- ✅ Teaser logic working (1 per category)
- ✅ No data loss from IndexedDB migration

### Phase 3 Success:
- ✅ Dashboard accessible from navigation
- ✅ All 5 sections functional
- ✅ Lock/unlock logic working
- ✅ Mobile responsive
- ✅ Dark mode support

### Overall Success:
- ✅ Users can view past reports
- ✅ Users can see latest puzzles per category
- ✅ Free users see teasers + upgrade prompts
- ✅ Subscribed users see all puzzles unlocked
- ✅ No breaking changes to existing features
- ✅ Production-ready quality

---

## 🆘 Rollback Plan

### If Issues Arise:

**Phase 1-2 Rollback:**
1. Revert database changes (drop new columns/views)
2. Keep IndexedDB as primary storage
3. Investigate issues

**Phase 3 Rollback:**
1. Revert navigation changes (Dashboard → My Reports)
2. Keep old MyReports page
3. Remove Dashboard route
4. Investigate issues

**Full Rollback:**
1. Revert all code changes
2. Restore database backup
3. Clear user caches
4. Notify users of temporary issue

---

## 📞 Support & Resources

### Documentation:
- Supabase Docs: https://supabase.com/docs
- React Router: https://reactrouter.com/
- Framer Motion: https://www.framer.com/motion/
- Tailwind CSS: https://tailwindcss.com/

### Internal Docs:
- `PHASE3_PROGRESS.md` - Current puzzle system status
- `FINAL_IMPLEMENTATION_STATUS.md` - Puzzle generation details
- `database-puzzles-setup.sql` - Database schema

---

## ✅ Next Steps

### Immediate Actions:
1. **Review this roadmap** - Ensure all requirements understood
2. **Run Phase 1 verification** - Check database status
3. **Start Phase 1 implementation** - Enhance database schema
4. **Begin Phase 2 planning** - Map out migration strategy

### Questions to Answer:
- [ ] Should we keep IndexedDB as cache or remove it entirely?
- [ ] Do we need offline support for puzzles?
- [ ] Should we migrate existing IndexedDB puzzles to Supabase?
- [ ] What's the priority: speed or completeness?

---

**Roadmap Version:** 1.0  
**Created:** 2025  
**Status:** Ready for Implementation  
**Estimated Completion:** 2-3 days of focused work

---

🎉 **This roadmap provides a complete, production-ready implementation plan for the Dashboard feature!**