# Phase 3 Setup Guide: Puzzle Access Control

This guide will walk you through setting up the database tables and testing the puzzle access control system.

## 📋 Prerequisites

- Supabase project set up and configured
- `.env` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- User authentication working (Phase 1)
- User profiles table created (Phase 2)

## 🗄️ Step 1: Create Database Tables

You need to run two SQL files in your Supabase SQL Editor to create the required tables.

### 1.1 Create Reports Table (if not already created)

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the contents of `database-setup.sql`
5. Click **Run** or press `Ctrl+Enter`
6. Verify success: You should see "Success. No rows returned"

**What this creates:**
- `reports` table to store report metadata
- Indexes for efficient queries
- Row Level Security (RLS) policies
- Auto-update trigger for `updated_at` field

### 1.2 Create Puzzle Tables

1. In Supabase SQL Editor, click **New Query**
2. Copy and paste the contents of `database-puzzles-setup.sql`
3. Click **Run** or press `Ctrl+Enter`
4. Verify success: You should see "Success. No rows returned"

**What this creates:**
- `puzzles` table for puzzle metadata and access control
- `puzzle_unlocks` table for tracking one-time purchases
- `puzzle_progress` table for tracking user attempts
- Helper functions: `user_has_puzzle_access()`, `get_accessible_puzzle_count()`
- Indexes for efficient queries
- Row Level Security (RLS) policies

## ✅ Step 2: Verify Database Setup

Run this query in Supabase SQL Editor to verify all tables were created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('reports', 'puzzles', 'puzzle_unlocks', 'puzzle_progress')
ORDER BY table_name;
```

**Expected output:**
```
puzzle_progress
puzzle_unlocks
puzzles
reports
```

## 🧪 Step 3: Test the Integration

### 3.1 Generate a Test Report

1. Start your development server: `npm run dev`
2. Sign in to your account
3. Go to the Reports page
4. Enter a chess username and generate a report
5. Wait for the analysis to complete

### 3.2 Verify Report Storage

Check the browser console for these log messages:

```
💾 Saving report to Supabase...
✅ Report saved to Supabase with ID: [uuid]
```

Verify in Supabase:

```sql
SELECT id, username, platform, title, game_count, created_at 
FROM reports 
ORDER BY created_at DESC 
LIMIT 5;
```

### 3.3 Verify Puzzle Storage

Check the browser console for these log messages:

```
🧩 Starting puzzle generation for [username]...
💾 Storing puzzle metadata in Supabase for access control...
✅ Stored [N] puzzles in Supabase with access control
```

Verify in Supabase:

```sql
SELECT 
  category,
  difficulty,
  is_locked,
  is_teaser,
  COUNT(*) as count
FROM puzzles
GROUP BY category, difficulty, is_locked, is_teaser
ORDER BY category, difficulty;
```

**Expected output:**
- You should see puzzles across different categories (tactical, positional, opening, endgame)
- Each category should have 1 teaser puzzle (`is_teaser = true`, `is_locked = false`)
- Other puzzles should be locked (`is_locked = true`, `requires_subscription = true`)

## 🔍 Step 4: Test Access Control

### 4.1 Test Teaser Access

Run this query to see which puzzles are free teasers:

```sql
SELECT 
  id,
  category,
  difficulty,
  title,
  is_teaser,
  is_locked
FROM puzzles
WHERE is_teaser = true
ORDER BY category;
```

**Expected:** 1 puzzle per category marked as teaser

### 4.2 Test Access Check Function

Test the `user_has_puzzle_access()` function:

```sql
-- Replace [user_id] and [puzzle_id] with actual values from your database
SELECT user_has_puzzle_access(
  '[user_id]'::uuid,
  '[puzzle_id]'::uuid
) as has_access;
```

**Expected:**
- `true` for teaser puzzles (even without subscription)
- `false` for locked puzzles (without subscription)

### 4.3 Test Puzzle Count Function

```sql
-- Replace [user_id] with actual user ID
SELECT get_accessible_puzzle_count('[user_id]'::uuid) as accessible_count;
```

**Expected:** Should return the number of teaser puzzles (typically 4, one per category)

## 🐛 Troubleshooting

### Issue: "relation 'reports' does not exist"

**Solution:** Run `database-setup.sql` first to create the reports table.

### Issue: "relation 'puzzles' does not exist"

**Solution:** Run `database-puzzles-setup.sql` to create puzzle tables.

### Issue: "Report saved but puzzles not stored"

**Possible causes:**
1. Check browser console for errors
2. Verify `userId` and `reportId` are present in the analysis data
3. Check that puzzles were generated (at least 20 puzzles required)

**Debug query:**
```sql
SELECT COUNT(*) FROM puzzles WHERE user_id = '[your_user_id]'::uuid;
```

### Issue: "RLS policy violation"

**Solution:** Ensure you're authenticated and the `auth.uid()` matches the `user_id` in the tables.

**Debug query:**
```sql
-- Check current user
SELECT auth.uid();

-- Check if user has reports
SELECT COUNT(*) FROM reports WHERE user_id = auth.uid();
```

### Issue: "Puzzles not showing as teasers"

**Check teaser logic:**
```sql
SELECT 
  category,
  COUNT(*) FILTER (WHERE is_teaser = true) as teaser_count,
  COUNT(*) as total_count
FROM puzzles
WHERE user_id = '[your_user_id]'::uuid
GROUP BY category;
```

**Expected:** Each category should have exactly 1 teaser

## 📊 Monitoring Queries

### View All Puzzles for a User

```sql
SELECT 
  category,
  difficulty,
  is_locked,
  is_teaser,
  requires_subscription,
  title,
  created_at
FROM puzzles
WHERE user_id = '[your_user_id]'::uuid
ORDER BY category, created_at;
```

### View Report Summary

```sql
SELECT 
  r.id,
  r.username,
  r.platform,
  r.title,
  r.game_count,
  r.created_at,
  COUNT(p.id) as puzzle_count,
  COUNT(p.id) FILTER (WHERE p.is_teaser = true) as teaser_count,
  COUNT(p.id) FILTER (WHERE p.is_locked = true) as locked_count
FROM reports r
LEFT JOIN puzzles p ON p.report_id = r.id
WHERE r.user_id = '[your_user_id]'::uuid
GROUP BY r.id
ORDER BY r.created_at DESC;
```

### View Puzzle Access Statistics

```sql
SELECT 
  category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE is_teaser = true) as teasers,
  COUNT(*) FILTER (WHERE is_locked = true) as locked,
  COUNT(*) FILTER (WHERE requires_subscription = true) as needs_subscription
FROM puzzles
WHERE user_id = '[your_user_id]'::uuid
GROUP BY category
ORDER BY category;
```

## ✨ Next Steps

Once you've verified that:
- ✅ Reports are being saved to Supabase
- ✅ Puzzles are being stored with correct access control flags
- ✅ Teaser puzzles are properly marked (1 per category)
- ✅ Access control functions work correctly

You can proceed to:

1. **Step 4**: Update puzzle list UI to show lock indicators
2. **Step 5**: Add access control to puzzle detail pages
3. **Step 6**: Implement one-time purchase flow ($4.99 unlock)

See `PHASE3_IMPLEMENTATION.md` for detailed implementation steps.

## 🎯 Success Criteria

Phase 3 Step 3 (Integration) is complete when:

- [x] Reports are saved to Supabase after analysis
- [x] Puzzles are stored in Supabase with metadata
- [x] First puzzle per category is marked as teaser
- [x] Other puzzles are marked as locked
- [x] Access control functions work correctly
- [x] No errors in browser console during report generation
- [x] Database queries return expected results

## 📚 Additional Resources

- **Implementation Guide**: `PHASE3_IMPLEMENTATION.md`
- **Database Schema**: `database-puzzles-setup.sql`
- **Service Layer**: `src/services/puzzleAccessService.js`
- **Report Service**: `src/services/reportService.js`

## 🆘 Need Help?

If you encounter issues:

1. Check browser console for error messages
2. Check Supabase logs in Dashboard → Logs
3. Verify RLS policies are enabled
4. Test database functions directly in SQL Editor
5. Check that environment variables are set correctly

---

**Last Updated**: Phase 3 Step 3 Implementation
**Status**: Integration Complete ✅