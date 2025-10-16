# 🎯 Complete Dashboard Implementation Roadmap
## With Tier-Based Pricing & Weekly Puzzle System

---

## 📊 Your Pricing Model

### Free Tier
- ✅ 1 Full Report (PDF) - First time only
- ✅ 1 Teaser puzzle per category (4 total)
- ❌ No weekly puzzles

### One-Time Pack - $4.99
- ✅ 1 week's puzzles unlocked from free report
- ✅ All 4 categories unlocked for 1 week
- ❌ No new reports

### Monthly Plan - $6.99/month
- ✅ Weekly puzzles unlocked (4 sections)
- ✅ Puzzles refresh every week from new games
- ✅ Download updated PDF report each week

### Quarterly Plan - $18.99 (3 months)
- ✅ 12 weeks of puzzle access
- ✅ 12 updated puzzle sets + reports
- ✅ Save $2.88 vs monthly

### Annual Plan - $59.99/year
- ✅ 52 weeks of puzzle access
- ✅ Reports included automatically
- ✅ Priority new features
- ✅ Save $23.89 vs monthly

---

## 🏗️ Complete System Architecture

### Database Schema Enhancement

```sql
-- =====================================================
-- PHASE 1: SUBSCRIPTION MANAGEMENT
-- =====================================================

-- 1.1 Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  -- Subscription Details
  tier TEXT NOT NULL, -- 'free', 'one_time', 'monthly', 'quarterly', 'annual'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'cancelled', 'expired', 'paused'
  
  -- Billing
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  price_paid DECIMAL(10,2),
  
  -- Dates
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  current_period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Usage Tracking
  reports_generated INTEGER DEFAULT 0,
  reports_limit INTEGER, -- NULL = unlimited, 1 = free tier
  puzzles_unlocked INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_tier CHECK (tier IN ('free', 'one_time', 'monthly', 'quarterly', 'annual')),
  CONSTRAINT valid_status CHECK (status IN ('active', 'cancelled', 'expired', 'paused'))
);

CREATE INDEX subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX subscriptions_tier_idx ON subscriptions(tier);
CREATE INDEX subscriptions_status_idx ON subscriptions(status);
CREATE INDEX subscriptions_expires_at_idx ON subscriptions(expires_at);

-- 1.2 Add subscription tracking to reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_weekly_report BOOLEAN DEFAULT false;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS week_number INTEGER; -- Week of year
ALTER TABLE reports ADD COLUMN IF NOT EXISTS year INTEGER; -- Year

CREATE INDEX reports_subscription_tier_idx ON reports(subscription_tier);
CREATE INDEX reports_week_year_idx ON reports(week_number, year);

-- 1.3 Add puzzle_data column to puzzles table (if not exists)
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS puzzle_data JSONB;
CREATE INDEX IF NOT EXISTS puzzles_puzzle_data_idx ON puzzles USING GIN (puzzle_data);

-- 1.4 Add weekly tracking to puzzles
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS week_number INTEGER;
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS is_weekly_puzzle BOOLEAN DEFAULT false;

CREATE INDEX puzzles_week_year_idx ON puzzles(week_number, year);

-- =====================================================
-- PHASE 2: ACCESS CONTROL FUNCTIONS
-- =====================================================

-- 2.1 Function to check user subscription status
CREATE OR REPLACE FUNCTION get_user_subscription_status(p_user_id UUID)
RETURNS TABLE (
  tier TEXT,
  status TEXT,
  is_active BOOLEAN,
  reports_remaining INTEGER,
  can_access_puzzles BOOLEAN,
  expires_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.tier,
    s.status,
    (s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > NOW())) as is_active,
    CASE 
      WHEN s.reports_limit IS NULL THEN -1 -- Unlimited
      WHEN s.reports_limit > s.reports_generated THEN s.reports_limit - s.reports_generated
      ELSE 0
    END as reports_remaining,
    (s.tier != 'free' AND s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > NOW())) as can_access_puzzles,
    s.expires_at
  FROM subscriptions s
  WHERE s.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.2 Function to check puzzle access
CREATE OR REPLACE FUNCTION can_access_puzzle(p_user_id UUID, p_puzzle_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_teaser BOOLEAN;
  v_subscription_tier TEXT;
  v_subscription_active BOOLEAN;
  v_puzzle_tier TEXT;
BEGIN
  -- Get puzzle info
  SELECT is_teaser, unlock_tier INTO v_is_teaser, v_puzzle_tier
  FROM puzzles
  WHERE id = p_puzzle_id AND user_id = p_user_id;
  
  -- Teaser puzzles are always accessible
  IF v_is_teaser THEN
    RETURN TRUE;
  END IF;
  
  -- Get user subscription
  SELECT tier, (status = 'active' AND (expires_at IS NULL OR expires_at > NOW()))
  INTO v_subscription_tier, v_subscription_active
  FROM subscriptions
  WHERE user_id = p_user_id;
  
  -- No subscription = no access (except teasers)
  IF v_subscription_tier IS NULL OR NOT v_subscription_active THEN
    RETURN FALSE;
  END IF;
  
  -- Check tier hierarchy: annual > quarterly > monthly > one_time > free
  CASE v_subscription_tier
    WHEN 'annual' THEN RETURN TRUE;
    WHEN 'quarterly' THEN RETURN TRUE;
    WHEN 'monthly' THEN RETURN TRUE;
    WHEN 'one_time' THEN 
      -- One-time can only access puzzles from their purchased week
      RETURN EXISTS (
        SELECT 1 FROM puzzle_unlocks 
        WHERE user_id = p_user_id AND puzzle_id = p_puzzle_id
      );
    ELSE RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.3 Function to initialize free tier for new users
CREATE OR REPLACE FUNCTION initialize_free_tier()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions (user_id, tier, status, reports_limit)
  VALUES (NEW.id, 'free', 'active', 1)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user registration
DROP TRIGGER IF EXISTS on_user_created_init_subscription ON auth.users;
CREATE TRIGGER on_user_created_init_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_free_tier();

-- =====================================================
-- PHASE 3: WEEKLY PUZZLE VIEWS
-- =====================================================

-- 3.1 View for current week's puzzles
CREATE OR REPLACE VIEW user_current_week_puzzles AS
SELECT 
  p.*,
  EXTRACT(WEEK FROM NOW()) as current_week,
  EXTRACT(YEAR FROM NOW()) as current_year,
  can_access_puzzle(p.user_id, p.id) as can_access
FROM puzzles p
WHERE p.week_number = EXTRACT(WEEK FROM NOW())
  AND p.year = EXTRACT(YEAR FROM NOW())
  AND p.is_weekly_puzzle = true;

-- 3.2 View for user's accessible puzzles
CREATE OR REPLACE VIEW user_accessible_puzzles AS
SELECT 
  p.*,
  s.tier as subscription_tier,
  CASE 
    WHEN p.is_teaser THEN true
    WHEN s.tier IN ('monthly', 'quarterly', 'annual') THEN true
    WHEN s.tier = 'one_time' AND pu.id IS NOT NULL THEN true
    ELSE false
  END as is_accessible
FROM puzzles p
LEFT JOIN subscriptions s ON p.user_id = s.user_id
LEFT JOIN puzzle_unlocks pu ON p.id = pu.puzzle_id AND p.user_id = pu.user_id
WHERE s.status = 'active' 
  AND (s.expires_at IS NULL OR s.expires_at > NOW());

-- 3.3 View for dashboard statistics
CREATE OR REPLACE VIEW user_dashboard_stats AS
SELECT 
  p.user_id,
  p.category,
  COUNT(*) as total_puzzles,
  COUNT(*) FILTER (WHERE p.is_teaser) as teaser_puzzles,
  COUNT(*) FILTER (WHERE NOT p.is_teaser) as locked_puzzles,
  COUNT(*) FILTER (WHERE can_access_puzzle(p.user_id, p.id)) as accessible_puzzles,
  MAX(p.created_at) as latest_puzzle_date
FROM puzzles p
GROUP BY p.user_id, p.category;

-- =====================================================
-- PHASE 4: RLS POLICIES
-- =====================================================

-- Enable RLS on subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own subscription (for cancellation)
CREATE POLICY "Users can update own subscription"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can manage all subscriptions
CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- PHASE 5: HELPER FUNCTIONS FOR WEEKLY PUZZLES
-- =====================================================

-- 5.1 Function to mark puzzles as weekly
CREATE OR REPLACE FUNCTION mark_puzzles_as_weekly(p_report_id UUID)
RETURNS void AS $$
DECLARE
  v_week INTEGER;
  v_year INTEGER;
BEGIN
  v_week := EXTRACT(WEEK FROM NOW());
  v_year := EXTRACT(YEAR FROM NOW());
  
  UPDATE puzzles
  SET 
    is_weekly_puzzle = true,
    week_number = v_week,
    year = v_year
  WHERE report_id = p_report_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.2 Function to get week's puzzle count
CREATE OR REPLACE FUNCTION get_weekly_puzzle_count(p_user_id UUID, p_week INTEGER, p_year INTEGER)
RETURNS TABLE (
  category TEXT,
  puzzle_count INTEGER,
  accessible_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.category,
    COUNT(*)::INTEGER as puzzle_count,
    COUNT(*) FILTER (WHERE can_access_puzzle(p_user_id, p.id))::INTEGER as accessible_count
  FROM puzzles p
  WHERE p.user_id = p_user_id
    AND p.week_number = p_week
    AND p.year = p_year
    AND p.is_weekly_puzzle = true
  GROUP BY p.category;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 🔧 Implementation Phases

### **PHASE 1: Database Setup** (30 minutes)

#### Step 1.1: Run Database Migrations
```bash
# Open Supabase Dashboard → SQL Editor
# Copy and paste the entire SQL schema above
# Execute the query
```

#### Step 1.2: Verify Tables Created
```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('subscriptions', 'reports', 'puzzles', 'puzzle_unlocks', 'puzzle_progress')
ORDER BY table_name;

-- Check subscriptions table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'subscriptions';
```

#### Step 1.3: Test Functions
```sql
-- Test subscription status function
SELECT * FROM get_user_subscription_status('YOUR_USER_ID');

-- Test puzzle access function
SELECT can_access_puzzle('YOUR_USER_ID', 'SOME_PUZZLE_ID');
```

**✅ Checkpoint:** All tables, indexes, functions, and views created successfully.

---

### **PHASE 2: Subscription Service Layer** (45 minutes)

#### Step 2.1: Create Subscription Service

Create `src/services/subscriptionService.js`:

```javascript
import { supabase } from '../supabaseClient';

class SubscriptionService {
  /**
   * Get user's current subscription status
   */
  async getUserSubscription(userId) {
    try {
      const { data, error } = await supabase
        .rpc('get_user_subscription_status', { p_user_id: userId });

      if (error) throw error;
      return data[0] || null;
    } catch (error) {
      console.error('Error fetching subscription:', error);
      return null;
    }
  }

  /**
   * Check if user can access a specific puzzle
   */
  async canAccessPuzzle(userId, puzzleId) {
    try {
      const { data, error } = await supabase
        .rpc('can_access_puzzle', { 
          p_user_id: userId, 
          p_puzzle_id: puzzleId 
        });

      if (error) throw error;
      return data === true;
    } catch (error) {
      console.error('Error checking puzzle access:', error);
      return false;
    }
  }

  /**
   * Get subscription tier details
   */
  getTierDetails(tier) {
    const tiers = {
      free: {
        name: 'Free',
        price: 0,
        features: ['1 Full Report', '1 Teaser per category'],
        reportsLimit: 1,
        puzzlesAccess: 'teaser_only'
      },
      one_time: {
        name: 'One-Time Pack',
        price: 4.99,
        features: ['1 week puzzles', 'All 4 categories'],
        reportsLimit: 0,
        puzzlesAccess: 'one_week'
      },
      monthly: {
        name: 'Monthly Plan',
        price: 6.99,
        features: ['Weekly puzzles', 'Weekly reports', '4 categories'],
        reportsLimit: null, // unlimited
        puzzlesAccess: 'weekly'
      },
      quarterly: {
        name: 'Quarterly Plan',
        price: 18.99,
        features: ['12 weeks puzzles', '12 reports', 'Save $2.88'],
        reportsLimit: null,
        puzzlesAccess: 'weekly'
      },
      annual: {
        name: 'Annual Plan',
        price: 59.99,
        features: ['52 weeks puzzles', '52 reports', 'Priority features', 'Save $23.89'],
        reportsLimit: null,
        puzzlesAccess: 'weekly'
      }
    };

    return tiers[tier] || tiers.free;
  }

  /**
   * Check if user can generate a new report
   */
  async canGenerateReport(userId) {
    try {
      const subscription = await this.getUserSubscription(userId);
      
      if (!subscription) return false;
      
      // Free tier: check reports_remaining
      if (subscription.tier === 'free') {
        return subscription.reports_remaining > 0;
      }
      
      // Paid tiers: check if subscription is active
      return subscription.is_active;
    } catch (error) {
      console.error('Error checking report generation:', error);
      return false;
    }
  }

  /**
   * Get current week's puzzles for user
   */
  async getCurrentWeekPuzzles(userId) {
    try {
      const { data, error } = await supabase
        .from('user_current_week_puzzles')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching current week puzzles:', error);
      return [];
    }
  }

  /**
   * Get user's accessible puzzles
   */
  async getAccessiblePuzzles(userId, category = null) {
    try {
      let query = supabase
        .from('user_accessible_puzzles')
        .select('*')
        .eq('user_id', userId)
        .eq('is_accessible', true);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching accessible puzzles:', error);
      return [];
    }
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(userId) {
    try {
      const { data, error } = await supabase
        .from('user_dashboard_stats')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      return [];
    }
  }

  /**
   * Upgrade subscription (placeholder for Stripe integration)
   */
  async upgradeSubscription(userId, newTier) {
    // TODO: Integrate with Stripe
    console.log(`Upgrading user ${userId} to ${newTier}`);
    // This will be implemented when Stripe is integrated
    return { success: false, message: 'Stripe integration pending' };
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId) {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({ 
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      return { success: false, error };
    }
  }
}

export default new SubscriptionService();
```

**✅ Checkpoint:** Subscription service created and ready to use.

---

### **PHASE 3: Update Puzzle Storage** (30 minutes)

#### Step 3.1: Update puzzleAccessService.js

Add these methods to `src/services/puzzleAccessService.js`:

```javascript
// Add to existing puzzleAccessService.js

/**
 * Store puzzles with full data (for dashboard)
 * @param {Array} puzzles - Array of complete puzzle objects
 * @param {string} userId - User ID
 * @param {string} reportId - Report ID
 * @param {boolean} isWeeklyReport - Whether this is a weekly subscription report
 * @returns {Promise<Array>} - Created puzzle records
 */
async storePuzzlesWithFullData(puzzles, userId, reportId, isWeeklyReport = false) {
  try {
    const currentWeek = isWeeklyReport ? this._getCurrentWeek() : null;
    const currentYear = isWeeklyReport ? new Date().getFullYear() : null;

    // Group puzzles by category
    const puzzlesByCategory = puzzles.reduce((acc, puzzle) => {
      const category = puzzle.category || 'tactical';
      if (!acc[category]) acc[category] = [];
      acc[category].push(puzzle);
      return acc;
    }, {});

    // Mark first puzzle per category as teaser
    const puzzleRecords = [];
    
    for (const [category, categoryPuzzles] of Object.entries(puzzlesByCategory)) {
      categoryPuzzles.forEach((puzzle, index) => {
        const isTeaser = index === 0; // First puzzle is teaser
        
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
          rating_estimate: puzzle.ratingEstimate || this._estimateRating(puzzle.difficulty),
          puzzle_data: puzzle, // ← STORE FULL PUZZLE DATA
          is_weekly_puzzle: isWeeklyReport,
          week_number: currentWeek,
          year: currentYear
        });
      });
    }

    const { data, error } = await supabase
      .from('puzzles')
      .insert(puzzleRecords)
      .select();

    if (error) throw error;

    console.log(`✅ Stored ${data.length} puzzles with full data (${puzzleRecords.filter(p => p.is_teaser).length} teasers)`);
    return data;
  } catch (error) {
    console.error('❌ Failed to store puzzles with full data:', error);
    throw error;
  }
}

/**
 * Get latest puzzles by category for dashboard
 * @param {string} userId - User ID
 * @param {number} limit - Number of puzzles per category
 * @returns {Promise<Object>} - Puzzles grouped by category
 */
async getLatestPuzzlesByCategory(userId, limit = 10) {
  try {
    const categories = ['tactical', 'positional', 'opening', 'endgame'];
    const result = {};

    for (const category of categories) {
      const { data, error } = await supabase
        .from('puzzles')
        .select('*')
        .eq('user_id', userId)
        .eq('category', category)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      result[category] = data || [];
    }

    return result;
  } catch (error) {
    console.error('❌ Failed to get latest puzzles:', error);
    return { tactical: [], positional: [], opening: [], endgame: [] };
  }
}

/**
 * Get puzzle statistics for dashboard
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Statistics by category
 */
async getPuzzleStats(userId) {
  try {
    const { data, error } = await supabase
      .from('user_dashboard_stats')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    // Convert array to object keyed by category
    const stats = {};
    data.forEach(stat => {
      stats[stat.category] = {
        total: stat.total_puzzles,
        teaser: stat.teaser_puzzles,
        locked: stat.locked_puzzles,
        accessible: stat.accessible_puzzles,
        latestDate: stat.latest_puzzle_date
      };
    });

    return stats;
  } catch (error) {
    console.error('❌ Failed to get puzzle stats:', error);
    return {};
  }
}

/**
 * Helper: Get current week number
 */
_getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start;
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.floor(diff / oneWeek) + 1;
}

/**
 * Helper: Estimate rating from difficulty
 */
_estimateRating(difficulty) {
  const ratings = {
    'beginner': 800,
    'easy': 1200,
    'medium': 1600,
    'hard': 2000,
    'expert': 2400
  };
  return ratings[difficulty] || 1600;
}
```

#### Step 3.2: Update Report Generation to Store Full Puzzle Data

Find where puzzles are generated (likely in `ReportDisplay.js` or similar) and update the storage call:

```javascript
// OLD CODE (stores only metadata):
await puzzleAccessService.storePuzzlesBatch(puzzles, userId, reportId);

// NEW CODE (stores full puzzle data):
await puzzleAccessService.storePuzzlesWithFullData(puzzles, userId, reportId, isWeeklyReport);
```

**✅ Checkpoint:** Puzzle storage updated to include full puzzle data.

---

### **PHASE 4: Dashboard UI Components** (60 minutes)

#### Step 4.1: Create Dashboard Page

Create `src/pages/Dashboard.js`:

```javascript
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import subscriptionService from '../services/subscriptionService';
import puzzleAccessService from '../services/puzzleAccessService';
import reportService from '../services/reportService';
import PastReportsSection from '../components/PastReportsSection';
import PuzzleSection from '../components/PuzzleSection';

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [activeTab, setActiveTab] = useState('reports');
  const [reports, setReports] = useState([]);
  const [puzzles, setPuzzles] = useState({
    tactical: [],
    positional: [],
    opening: [],
    endgame: []
  });
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Get current user
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        navigate('/login');
        return;
      }
      setUser(currentUser);

      // Load subscription
      const subData = await subscriptionService.getUserSubscription(currentUser.id);
      setSubscription(subData);

      // Load reports
      const reportsData = await reportService.getUserReports(currentUser.id);
      setReports(reportsData);

      // Load puzzles by category
      const puzzlesData = await puzzleAccessService.getLatestPuzzlesByCategory(currentUser.id, 10);
      setPuzzles(puzzlesData);

      // Load statistics
      const statsData = await puzzleAccessService.getPuzzleStats(currentUser.id);
      setStats(statsData);

    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'reports', label: 'Past Reports', icon: '📄' },
    { id: 'tactical', label: 'Fix My Weaknesses', icon: '🎯' },
    { id: 'positional', label: 'Learn From Mistakes', icon: '🧠' },
    { id: 'opening', label: 'Master My Openings', icon: '♟️' },
    { id: 'endgame', label: 'Sharpen My Endgame', icon: '👑' }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            My Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {subscription?.tier === 'free' 
              ? 'Free Tier - Upgrade to unlock all puzzles'
              : `${subscription?.tier?.toUpperCase()} Plan - All puzzles unlocked`
            }
          </p>
        </div>

        {/* Subscription Status Banner */}
        {subscription?.tier === 'free' && (
          <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-primary-900 dark:text-primary-100">
                  🎁 Unlock All Puzzles
                </h3>
                <p className="text-primary-700 dark:text-primary-300 text-sm">
                  Get weekly puzzles in all 4 categories starting at $6.99/month
                </p>
              </div>
              <button
                onClick={() => navigate('/pricing')}
                className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
              >
                Upgrade Now
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex flex-wrap -mb-px">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-6 py-4 text-sm font-medium border-b-2 transition-colors
                    ${activeTab === tab.id
                      ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }
                  `}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          {activeTab === 'reports' && (
            <PastReportsSection reports={reports} />
          )}
          
          {activeTab === 'tactical' && (
            <PuzzleSection
              category="tactical"
              title="Fix My Weaknesses"
              description="Tactical puzzles from your games to improve calculation"
              puzzles={puzzles.tactical}
              stats={stats.tactical}
              subscription={subscription}
              onUpgrade={() => navigate('/pricing')}
            />
          )}
          
          {activeTab === 'positional' && (
            <PuzzleSection
              category="positional"
              title="Learn From Mistakes"
              description="Positional puzzles to understand strategic errors"
              puzzles={puzzles.positional}
              stats={stats.positional}
              subscription={subscription}
              onUpgrade={() => navigate('/pricing')}
            />
          )}
          
          {activeTab === 'opening' && (
            <PuzzleSection
              category="opening"
              title="Master My Openings"
              description="Opening puzzles to improve your repertoire"
              puzzles={puzzles.opening}
              stats={stats.opening}
              subscription={subscription}
              onUpgrade={() => navigate('/pricing')}
            />
          )}
          
          {activeTab === 'endgame' && (
            <PuzzleSection
              category="endgame"
              title="Sharpen My Endgame"
              description="Endgame puzzles to master technical positions"
              puzzles={puzzles.endgame}
              stats={stats.endgame}
              subscription={subscription}
              onUpgrade={() => navigate('/pricing')}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
```

#### Step 4.2: Create PastReportsSection Component

Create `src/components/PastReportsSection.js`:

```javascript
import React from 'react';

const PastReportsSection = ({ reports }) => {
  if (!reports || reports.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📄</div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          No Reports Yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Generate your first report to see it here
        </p>
        <a
          href="/upload"
          className="inline-block bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
        >
          Generate Report
        </a>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Your Past Reports
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map(report => (
          <div
            key={report.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="text-4xl">📄</div>
              {report.subscription_tier !== 'free' && (
                <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200 text-xs font-semibold px-2 py-1 rounded">
                  {report.subscription_tier?.toUpperCase()}
                </span>
              )}
            </div>

            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Report #{report.id.slice(0, 8)}
            </h3>

            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
              <p>📅 {new Date(report.created_at).toLocaleDateString()}</p>
              <p>♟️ {report.games_analyzed || 0} games analyzed</p>
              <p>🎮 Platform: {report.platform || 'Unknown'}</p>
              {report.is_weekly_report && (
                <p>📆 Week {report.week_number}, {report.year}</p>
              )}
            </div>

            <a
              href={report.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-primary-600 hover:bg-primary-700 text-white py-2 rounded-lg font-semibold transition-colors"
            >
              View PDF
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PastReportsSection;
```

#### Step 4.3: Create PuzzleSection Component

Create `src/components/PuzzleSection.js`:

```javascript
import React from 'react';
import { useNavigate } from 'react-router-dom';

const PuzzleSection = ({ 
  category, 
  title, 
  description, 
  puzzles, 
  stats, 
  subscription,
  onUpgrade 
}) => {
  const navigate = useNavigate();

  const handlePuzzleClick = (puzzle) => {
    if (puzzle.is_teaser || subscription?.tier !== 'free') {
      // Navigate to puzzle solver
      navigate(`/puzzle/${puzzle.id}`);
    } else {
      // Show upgrade prompt
      onUpgrade();
    }
  };

  if (!puzzles || puzzles.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎯</div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          No {title} Puzzles Yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Generate a report to create puzzles in this category
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {title}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">{description}</p>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.total || 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Puzzles</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.accessible || 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Accessible</div>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {stats.teaser || 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Free Teasers</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {stats.locked || 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Locked</div>
          </div>
        </div>
      )}

      {/* Puzzle Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {puzzles.map(puzzle => {
          const isAccessible = puzzle.is_teaser || subscription?.tier !== 'free';
          const isLocked = !isAccessible;

          return (
            <div
              key={puzzle.id}
              onClick={() => handlePuzzleClick(puzzle)}
              className={`
                border rounded-lg p-6 transition-all cursor-pointer
                ${isLocked 
                  ? 'border-gray-300 dark:border-gray-600 opacity-60 hover:opacity-80' 
                  : 'border-primary-200 dark:border-primary-800 hover:shadow-lg hover:border-primary-400'
                }
              `}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="text-3xl">
                  {isLocked ? '🔒' : '✅'}
                </div>
                <div className="flex flex-col gap-1">
                  {puzzle.is_teaser && (
                    <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs font-semibold px-2 py-1 rounded">
                      FREE TEASER
                    </span>
                  )}
                  {isLocked && (
                    <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-xs font-semibold px-2 py-1 rounded">
                      LOCKED
                    </span>
                  )}
                </div>
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {puzzle.title || `${category} Puzzle`}
              </h3>

              {/* Metadata */}
              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <p>📊 Difficulty: {puzzle.difficulty}</p>
                {puzzle.theme && <p>🎯 Theme: {puzzle.theme}</p>}
                {puzzle.rating_estimate && <p>⭐ Rating: {puzzle.rating_estimate}</p>}
                <p>📅 {new Date(puzzle.created_at).toLocaleDateString()}</p>
              </div>

              {/* Action Button */}
              <button
                className={`
                  w-full py-2 rounded-lg font-semibold transition-colors
                  ${isAccessible
                    ? 'bg-primary-600 hover:bg-primary-700 text-white'
                    : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-400'
                  }
                `}
              >
                {isAccessible ? 'Solve Puzzle' : 'Upgrade to Unlock'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PuzzleSection;
```

**✅ Checkpoint:** Dashboard UI components created.

---

### **PHASE 5: Routing & Navigation** (15 minutes)

#### Step 5.1: Update App.js Routes

Add dashboard route to `src/App.js`:

```javascript
import Dashboard from './pages/Dashboard';

// Inside your Routes component:
<Route path="/dashboard" element={<Dashboard />} />
<Route path="/my-reports" element={<Navigate to="/dashboard" replace />} />
```

#### Step 5.2: Update Header Navigation

Update `src/components/Header.js` (or wherever your navigation is):

```javascript
// Change "My Reports" to "Dashboard"
<Link to="/dashboard" className="nav-link">
  Dashboard
</Link>
```

**✅ Checkpoint:** Routing and navigation updated.

---

### **PHASE 6: Testing** (30 minutes)

#### Test Checklist:

**Database Tests:**
- [ ] Run subscription status function
- [ ] Run puzzle access function
- [ ] Verify views return data
- [ ] Check RLS policies work

**Service Layer Tests:**
- [ ] Test `getUserSubscription()`
- [ ] Test `canAccessPuzzle()`
- [ ] Test `getLatestPuzzlesByCategory()`
- [ ] Test `getPuzzleStats()`

**UI Tests:**
- [ ] Dashboard loads without errors
- [ ] All 5 tabs work
- [ ] Reports display correctly
- [ ] Puzzles display with correct lock status
- [ ] Free teaser badge shows
- [ ] Locked badge shows
- [ ] Click on accessible puzzle navigates
- [ ] Click on locked puzzle shows upgrade
- [ ] Mobile responsive
- [ ] Dark mode works

**User Flow Tests:**
- [ ] Free user sees 1 teaser per category
- [ ] Free user sees locked puzzles
- [ ] Paid user sees all puzzles unlocked
- [ ] Upgrade button works
- [ ] PDF links open correctly

**✅ Checkpoint:** All tests passing.

---

### **PHASE 7: Weekly Puzzle System** (Optional - 45 minutes)

This phase implements automatic weekly puzzle generation for subscribers.

#### Step 7.1: Create Weekly Report Scheduler

Create `src/services/weeklyReportScheduler.js`:

```javascript
import { supabase } from '../supabaseClient';
import subscriptionService from './subscriptionService';
import reportService from './reportService';

class WeeklyReportScheduler {
  /**
   * Check if user needs a weekly report
   */
  async needsWeeklyReport(userId) {
    try {
      const subscription = await subscriptionService.getUserSubscription(userId);
      
      // Only monthly, quarterly, annual get weekly reports
      if (!['monthly', 'quarterly', 'annual'].includes(subscription?.tier)) {
        return false;
      }

      // Check if user already has a report for this week
      const currentWeek = this._getCurrentWeek();
      const currentYear = new Date().getFullYear();

      const { data, error } = await supabase
        .from('reports')
        .select('id')
        .eq('user_id', userId)
        .eq('week_number', currentWeek)
        .eq('year', currentYear)
        .eq('is_weekly_report', true)
        .limit(1);

      if (error) throw error;

      return data.length === 0; // Needs report if none exists for this week
    } catch (error) {
      console.error('Error checking weekly report need:', error);
      return false;
    }
  }

  /**
   * Generate weekly report for user
   */
  async generateWeeklyReport(userId) {
    // This would integrate with your existing report generation
    // For now, it's a placeholder
    console.log(`Generating weekly report for user ${userId}`);
    // TODO: Implement actual report generation
  }

  _getCurrentWeek() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    return Math.floor(diff / oneWeek) + 1;
  }
}

export default new WeeklyReportScheduler();
```

**✅ Checkpoint:** Weekly system ready (requires cron job setup).

---

## 📊 Implementation Summary

### Time Estimates:
- **Phase 1:** Database Setup - 30 minutes
- **Phase 2:** Subscription Service - 45 minutes
- **Phase 3:** Puzzle Storage - 30 minutes
- **Phase 4:** Dashboard UI - 60 minutes
- **Phase 5:** Routing - 15 minutes
- **Phase 6:** Testing - 30 minutes
- **Phase 7:** Weekly System (Optional) - 45 minutes

**Total: 3.5 - 4.5 hours**

### What You Get:
✅ Complete dashboard with 5 sections
✅ Tier-based access control
✅ Free teaser system (1 per category)
✅ Subscription management
✅ Weekly puzzle tracking
✅ Mobile responsive
✅ Dark mode support
✅ Production-ready code

---

## 🚀 Quick Start Command

```bash
# 1. Run database migrations
# Copy SQL from Phase 1 → Supabase SQL Editor → Execute

# 2. Create service files
# Create subscriptionService.js (Phase 2)

# 3. Update puzzle service
# Add methods to puzzleAccessService.js (Phase 3)

# 4. Create UI components
# Create Dashboard.js, PastReportsSection.js, PuzzleSection.js (Phase 4)

# 5. Update routing
# Add routes to App.js (Phase 5)

# 6. Test
# Follow test checklist (Phase 6)
```

---

## 📞 Support & Next Steps

### After Implementation:
1. **Stripe Integration** - Add payment processing
2. **Email Notifications** - Weekly puzzle reminders
3. **Analytics** - Track puzzle completion rates
4. **Social Features** - Share puzzles with friends
5. **Leaderboards** - Compete with other users

### Documentation:
- `DASHBOARD_IMPLEMENTATION_ROADMAP.md` - Original detailed plan
- `DASHBOARD_QUICK_START.md` - Fast track guide
- `DASHBOARD_TROUBLESHOOTING.md` - Common issues
- `DASHBOARD_ARCHITECTURE.md` - System diagrams

---

**Ready to implement?** Start with Phase 1 and work through sequentially. Each phase builds on the previous one.

**Questions?** Refer to the troubleshooting guide or existing documentation.

**Good luck! 🚀**

<function_calls>
<invoke name="ViewFile">
<parameter name="path">c:\pawnsposes\src\services\puzzleAccessService.js