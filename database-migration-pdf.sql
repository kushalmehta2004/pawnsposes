-- Migration to add PDF support to reports table
-- Run this in your Supabase SQL Editor to add PDF functionality

-- Add pdf_url column to store the PDF file URL
ALTER TABLE reports ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Create index for PDF URL lookups
CREATE INDEX IF NOT EXISTS reports_pdf_url_idx ON reports(pdf_url) WHERE pdf_url IS NOT NULL;

-- Create storage bucket for report PDFs (run this in Supabase dashboard or via API)
-- This needs to be done through the Supabase dashboard under Storage
-- Bucket name: report-pdfs
-- Public: true (so PDFs can be viewed directly)

-- Update the existing policies to handle PDF URLs
-- (The existing policies already cover the new column since they use SELECT *, UPDATE, etc.)

-- Optional: Add a function to clean up orphaned PDFs
CREATE OR REPLACE FUNCTION cleanup_orphaned_pdfs()
RETURNS void AS $$
BEGIN
  -- This function can be called periodically to clean up PDFs
  -- that are no longer referenced by any reports
  -- Implementation would require custom logic based on your storage structure
  RAISE NOTICE 'PDF cleanup function created. Implement cleanup logic as needed.';
END;
$$ LANGUAGE plpgsql;

-- Verify the migration
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'reports' AND column_name = 'pdf_url';