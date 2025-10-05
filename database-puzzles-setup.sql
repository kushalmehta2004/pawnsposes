-- Puzzles Access Control Database Setup for Supabase
-- Run this in your Supabase SQL Editor to create puzzle-related tables

-- =====================================================
-- 1. PUZZLES TABLE (Metadata + Access Control)
-- =====================================================
CREATE TABLE IF NOT EXISTS puzzles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  
  -- Puzzle Identification
  puzzle_key TEXT NOT NULL, -- Unique key for IndexedDB sync
  category TEXT NOT NULL, -- 'tactical', 'positional', 'opening', 'endgame'
  difficulty TEXT NOT NULL, -- 'beginner', 'easy', 'medium', 'hard', 'expert'
  theme TEXT, -- 'fork', 'pin', 'skewer', etc.
  
  -- Access Control
  is_locked BOOLEAN DEFAULT true, -- Whether puzzle requires subscription
  requires_subscription BOOLEAN DEFAULT true, -- Whether puzzle needs active subscription
  is_teaser BOOLEAN DEFAULT false, -- Whether this is a free teaser puzzle
  unlock_tier TEXT DEFAULT 'monthly', -- 'free', 'one_time', 'monthly', 'quarterly', 'annual'
  
  -- Puzzle Metadata (for display without loading full data)
  fen TEXT NOT NULL, -- Starting position
  title TEXT, -- Puzzle title/description
  source_game_id TEXT, -- Reference to original game
  rating_estimate INTEGER, -- Estimated difficulty rating
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_category CHECK (category IN ('tactical', 'positional', 'opening', 'endgame')),
  CONSTRAINT valid_difficulty CHECK (difficulty IN ('beginner', 'easy', 'medium', 'hard', 'expert')),
  CONSTRAINT valid_unlock_tier CHECK (unlock_tier IN ('free', 'one_time', 'monthly', 'quarterly', 'annual'))
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS puzzles_user_id_idx ON puzzles(user_id);
CREATE INDEX IF NOT EXISTS puzzles_report_id_idx ON puzzles(report_id);
CREATE INDEX IF NOT EXISTS puzzles_category_idx ON puzzles(category);
CREATE INDEX IF NOT EXISTS puzzles_difficulty_idx ON puzzles(difficulty);
CREATE INDEX IF NOT EXISTS puzzles_is_locked_idx ON puzzles(is_locked);
CREATE INDEX IF NOT EXISTS puzzles_is_teaser_idx ON puzzles(is_teaser);
CREATE INDEX IF NOT EXISTS puzzles_puzzle_key_idx ON puzzles(puzzle_key);
CREATE INDEX IF NOT EXISTS puzzles_created_at_idx ON puzzles(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS puzzles_user_category_locked_idx ON puzzles(user_id, category, is_locked);

-- =====================================================
-- 2. PUZZLE UNLOCKS TABLE (Track One-Time Purchases)
-- =====================================================
CREATE TABLE IF NOT EXISTS puzzle_unlocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  
  -- Unlock Details
  unlock_type TEXT NOT NULL, -- 'one_time_pack', 'subscription', 'free_teaser'
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- NULL for permanent unlocks
  
  -- Payment Reference (for Stripe integration)
  payment_id TEXT, -- Stripe payment intent ID
  amount_paid DECIMAL(10, 2), -- Amount paid in USD
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_unlock_type CHECK (unlock_type IN ('one_time_pack', 'subscription', 'free_teaser'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS puzzle_unlocks_user_id_idx ON puzzle_unlocks(user_id);
CREATE INDEX IF NOT EXISTS puzzle_unlocks_report_id_idx ON puzzle_unlocks(report_id);
CREATE INDEX IF NOT EXISTS puzzle_unlocks_expires_at_idx ON puzzle_unlocks(expires_at);

-- =====================================================
-- 3. PUZZLE PROGRESS TABLE (Track User Attempts)
-- =====================================================
CREATE TABLE IF NOT EXISTS puzzle_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_id UUID REFERENCES puzzles(id) ON DELETE CASCADE,
  
  -- Progress Data
  completed BOOLEAN DEFAULT false,
  correct BOOLEAN DEFAULT false,
  attempts INTEGER DEFAULT 0,
  hints_used INTEGER DEFAULT 0,
  time_spent INTEGER DEFAULT 0, -- Time in seconds
  
  -- Timestamps
  first_attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Unique constraint: one progress record per user per puzzle
  UNIQUE(user_id, puzzle_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS puzzle_progress_user_id_idx ON puzzle_progress(user_id);
CREATE INDEX IF NOT EXISTS puzzle_progress_puzzle_id_idx ON puzzle_progress(puzzle_id);
CREATE INDEX IF NOT EXISTS puzzle_progress_completed_idx ON puzzle_progress(completed);

-- =====================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_progress ENABLE ROW LEVEL SECURITY;

-- Puzzles Policies
CREATE POLICY "Users can view their own puzzles" ON puzzles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own puzzles" ON puzzles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own puzzles" ON puzzles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own puzzles" ON puzzles
  FOR DELETE USING (auth.uid() = user_id);

-- Puzzle Unlocks Policies
CREATE POLICY "Users can view their own unlocks" ON puzzle_unlocks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own unlocks" ON puzzle_unlocks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Puzzle Progress Policies
CREATE POLICY "Users can view their own progress" ON puzzle_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress" ON puzzle_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress" ON puzzle_progress
  FOR UPDATE USING (auth.uid() = user_id);

-- =====================================================
-- 5. HELPER FUNCTIONS
-- =====================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for puzzles table
CREATE TRIGGER update_puzzles_updated_at 
    BEFORE UPDATE ON puzzles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to check if user has access to a puzzle
CREATE OR REPLACE FUNCTION user_has_puzzle_access(
  p_user_id UUID,
  p_puzzle_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_locked BOOLEAN;
  v_is_teaser BOOLEAN;
  v_report_id UUID;
  v_has_subscription BOOLEAN;
  v_has_unlock BOOLEAN;
BEGIN
  -- Get puzzle details
  SELECT is_locked, is_teaser, report_id
  INTO v_is_locked, v_is_teaser, v_report_id
  FROM puzzles
  WHERE id = p_puzzle_id AND user_id = p_user_id;
  
  -- If puzzle doesn't exist or doesn't belong to user, deny access
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- If puzzle is a free teaser, allow access
  IF v_is_teaser = true THEN
    RETURN true;
  END IF;
  
  -- If puzzle is not locked, allow access
  IF v_is_locked = false THEN
    RETURN true;
  END IF;
  
  -- Check if user has active subscription
  SELECT has_active_subscription
  INTO v_has_subscription
  FROM user_profiles
  WHERE user_id = p_user_id;
  
  IF v_has_subscription = true THEN
    RETURN true;
  END IF;
  
  -- Check if user has one-time unlock for this report
  SELECT EXISTS(
    SELECT 1 FROM puzzle_unlocks
    WHERE user_id = p_user_id 
      AND report_id = v_report_id
      AND (expires_at IS NULL OR expires_at > NOW())
  ) INTO v_has_unlock;
  
  RETURN v_has_unlock;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's accessible puzzle count
CREATE OR REPLACE FUNCTION get_accessible_puzzle_count(
  p_user_id UUID,
  p_category TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM puzzles p
  WHERE p.user_id = p_user_id
    AND (p_category IS NULL OR p.category = p_category)
    AND (
      p.is_teaser = true
      OR p.is_locked = false
      OR user_has_puzzle_access(p_user_id, p.id) = true
    );
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. VERIFICATION QUERIES
-- =====================================================

-- Verify puzzles table
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'puzzles' 
ORDER BY ordinal_position;

-- Verify puzzle_unlocks table
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'puzzle_unlocks' 
ORDER BY ordinal_position;

-- Verify puzzle_progress table
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'puzzle_progress' 
ORDER BY ordinal_position;

-- Check indexes
SELECT 
    tablename, 
    indexname, 
    indexdef
FROM pg_indexes 
WHERE tablename IN ('puzzles', 'puzzle_unlocks', 'puzzle_progress')
ORDER BY tablename, indexname;

-- Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename IN ('puzzles', 'puzzle_unlocks', 'puzzle_progress')
ORDER BY tablename, policyname;