-- Create user_puzzles table for storing generated puzzles
-- This replaces IndexedDB storage with persistent cloud storage

CREATE TABLE IF NOT EXISTS user_puzzles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Puzzle identification
  category TEXT NOT NULL CHECK (category IN ('weakness', 'mistake', 'opening', 'endgame')),
  theme TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy', 'intermediate', 'advanced')),
  
  -- Position data
  fen TEXT NOT NULL,
  position TEXT NOT NULL, -- Same as FEN, kept for compatibility
  
  -- Solution data
  solution TEXT, -- First move in UCI format
  line_uci TEXT, -- Full solution line in UCI format (space-separated)
  alternative_moves JSONB DEFAULT '[]'::jsonb,
  start_line_index INTEGER DEFAULT 0,
  
  -- Puzzle metadata
  objective TEXT,
  hint TEXT,
  explanation TEXT,
  
  -- Source information
  source TEXT, -- 'user_game', 'weakness_dataset', 'lichess_opening', etc.
  source_game_id TEXT,
  source_position TEXT,
  move_number INTEGER,
  centipawn_loss INTEGER,
  
  -- Rating and quality
  rating INTEGER,
  estimated_rating INTEGER,
  plies INTEGER, -- Number of half-moves in the puzzle
  user_decisions INTEGER, -- Number of moves the user needs to make
  
  -- Progress tracking
  times_attempted INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0,
  average_time NUMERIC DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  
  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for efficient queries
  CONSTRAINT unique_user_puzzle UNIQUE (user_id, fen, category)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_puzzles_user_id ON user_puzzles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_puzzles_category ON user_puzzles(category);
CREATE INDEX IF NOT EXISTS idx_user_puzzles_difficulty ON user_puzzles(difficulty);
CREATE INDEX IF NOT EXISTS idx_user_puzzles_theme ON user_puzzles(theme);
CREATE INDEX IF NOT EXISTS idx_user_puzzles_created_at ON user_puzzles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_puzzles_user_category ON user_puzzles(user_id, category);
CREATE INDEX IF NOT EXISTS idx_user_puzzles_rating ON user_puzzles(rating);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_user_puzzles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_puzzles_updated_at
  BEFORE UPDATE ON user_puzzles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_puzzles_updated_at();

-- Enable Row Level Security
ALTER TABLE user_puzzles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only read their own puzzles
CREATE POLICY "Users can view their own puzzles"
  ON user_puzzles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own puzzles
CREATE POLICY "Users can insert their own puzzles"
  ON user_puzzles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own puzzles
CREATE POLICY "Users can update their own puzzles"
  ON user_puzzles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own puzzles
CREATE POLICY "Users can delete their own puzzles"
  ON user_puzzles
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create a function to get puzzle statistics
CREATE OR REPLACE FUNCTION get_user_puzzle_stats(p_user_id UUID)
RETURNS TABLE (
  total_puzzles BIGINT,
  by_category JSONB,
  by_difficulty JSONB,
  total_attempted BIGINT,
  total_correct BIGINT,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_puzzles,
    jsonb_object_agg(category, count) as by_category,
    jsonb_object_agg(difficulty, count) as by_difficulty,
    SUM(times_attempted)::BIGINT as total_attempted,
    SUM(times_correct)::BIGINT as total_correct,
    CASE 
      WHEN SUM(times_attempted) > 0 
      THEN ROUND((SUM(times_correct)::NUMERIC / SUM(times_attempted)::NUMERIC) * 100, 2)
      ELSE 0
    END as success_rate
  FROM (
    SELECT 
      category,
      difficulty,
      times_attempted,
      times_correct,
      COUNT(*) OVER (PARTITION BY category) as count
    FROM user_puzzles
    WHERE user_id = p_user_id
  ) subquery
  GROUP BY category, difficulty;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE user_puzzles IS 'Stores user-generated puzzles from game analysis and weakness detection';
COMMENT ON COLUMN user_puzzles.category IS 'Puzzle category: weakness, mistake, opening, or endgame';
COMMENT ON COLUMN user_puzzles.line_uci IS 'Full solution line in UCI format (e.g., "e2e4 e7e5 g1f3")';
COMMENT ON COLUMN user_puzzles.plies IS 'Number of half-moves (plies) in the puzzle solution';
COMMENT ON COLUMN user_puzzles.user_decisions IS 'Number of moves the user needs to make (plies / 2)';