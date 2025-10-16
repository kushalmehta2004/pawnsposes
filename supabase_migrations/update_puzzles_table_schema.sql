-- Update puzzles table schema to support Dashboard puzzle storage
-- This migration adds puzzle_data column and updates category constraint

-- Add puzzle_data column if it doesn't exist (stores complete puzzle object)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'puzzles' AND column_name = 'puzzle_data'
  ) THEN
    ALTER TABLE puzzles ADD COLUMN puzzle_data JSONB;
    COMMENT ON COLUMN puzzles.puzzle_data IS 'Complete puzzle object for Dashboard display';
  END IF;
END $$;

-- Add weekly puzzle tracking columns if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'puzzles' AND column_name = 'is_weekly_puzzle'
  ) THEN
    ALTER TABLE puzzles ADD COLUMN is_weekly_puzzle BOOLEAN DEFAULT false;
    COMMENT ON COLUMN puzzles.is_weekly_puzzle IS 'Whether this puzzle counts toward weekly subscription limit';
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'puzzles' AND column_name = 'week_number'
  ) THEN
    ALTER TABLE puzzles ADD COLUMN week_number INTEGER;
    COMMENT ON COLUMN puzzles.week_number IS 'ISO week number for weekly puzzle tracking';
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'puzzles' AND column_name = 'year'
  ) THEN
    ALTER TABLE puzzles ADD COLUMN year INTEGER;
    COMMENT ON COLUMN puzzles.year IS 'Year for weekly puzzle tracking';
  END IF;
END $$;

-- Drop the old category constraint if it exists
ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS valid_category;

-- Add new category constraint with updated values
ALTER TABLE puzzles ADD CONSTRAINT valid_category 
  CHECK (category IN ('weakness', 'mistake', 'opening', 'endgame', 'tactical', 'positional'));

-- Create index on puzzle_data for faster queries
CREATE INDEX IF NOT EXISTS puzzles_puzzle_data_idx ON puzzles USING GIN (puzzle_data);

-- Create index for weekly puzzle queries
CREATE INDEX IF NOT EXISTS puzzles_weekly_idx ON puzzles(user_id, is_weekly_puzzle, week_number, year) 
  WHERE is_weekly_puzzle = true;

-- Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'puzzles' 
  AND column_name IN ('puzzle_data', 'is_weekly_puzzle', 'week_number', 'year')
ORDER BY ordinal_position;