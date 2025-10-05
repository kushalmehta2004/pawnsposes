# PDF Storage Setup Guide

This guide will help you set up PDF storage for chess analysis reports using Supabase.

## 1. Database Migration

Run the following SQL in your Supabase SQL Editor:

```sql
-- Add pdf_url column to reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Create index for PDF URL lookups
CREATE INDEX IF NOT EXISTS reports_pdf_url_idx ON reports(pdf_url) WHERE pdf_url IS NOT NULL;
```

## 2. Create Storage Bucket

1. Go to your Supabase Dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **Create Bucket**
4. Set the following:
   - **Name**: `report-pdfs`
   - **Public**: ✅ **Yes** (so PDFs can be viewed directly in browser)
   - **File size limit**: 50 MB (or as needed)
   - **Allowed MIME types**: `application/pdf`

## 3. Set Storage Policies (Optional but Recommended)

In the Storage section, click on your `report-pdfs` bucket, then go to **Policies** and create:

### Policy 1: Allow authenticated users to upload PDFs
```sql
CREATE POLICY "Users can upload their own PDFs" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'report-pdfs' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

### Policy 2: Allow public read access to PDFs
```sql
CREATE POLICY "PDFs are publicly readable" ON storage.objects
FOR SELECT USING (bucket_id = 'report-pdfs');
```

### Policy 3: Allow users to delete their own PDFs
```sql
CREATE POLICY "Users can delete their own PDFs" ON storage.objects
FOR DELETE USING (
  bucket_id = 'report-pdfs' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

## 4. Test the Setup

1. Run the application
2. Generate a new chess analysis report
3. Click "Save Report" - it should now generate and store a PDF
4. Go to "My Reports" and click "View PDF" to open the PDF in a new tab

## 5. Troubleshooting

### PDF Generation Issues
- Ensure `html2canvas` and `jspdf` packages are installed
- Check browser console for any errors during PDF generation
- Make sure the page content is fully loaded before generating PDF

### Storage Issues
- Verify the storage bucket exists and is public
- Check that storage policies are correctly set
- Ensure your Supabase project has sufficient storage quota

### File Size Issues
- PDFs are generated at high quality (scale: 2) which may result in large files
- Consider reducing the scale in `pdfService.js` if needed
- Monitor your Supabase storage usage

## 6. Migration for Existing Reports

Existing reports without PDFs will still work - they will fall back to the original /full-report view when clicked. New reports will automatically generate PDFs.

To regenerate PDFs for existing reports, you would need to:
1. Load the report data
2. Recreate the /full-report view with that data
3. Call the PDF generation service
4. Update the report record with the new PDF URL

This migration is optional and existing reports will continue to work as before.