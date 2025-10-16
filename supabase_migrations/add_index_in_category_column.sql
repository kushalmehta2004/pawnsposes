-- Add index_in_category column to puzzles table for ordering
-- This ensures puzzles are displayed in the exact order they were generated

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'puzzles' AND column_name = 'index_in_category'
  ) THEN
    ALTER TABLE puzzles ADD COLUMN index_in_category INTEGER DEFAULT 0;
    COMMENT ON COLUMN puzzles.index_in_category IS 'Position of puzzle within its category (0-29 for 30 puzzles)';
  END IF;
END $$;

-- Create index for efficient ordering queries
CREATE INDEX IF NOT EXISTS puzzles_category_order_idx 
  ON puzzles(user_id, report_id, category, index_in_category);

-- Verify the change
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'puzzles' 
  AND column_name = 'index_in_category';