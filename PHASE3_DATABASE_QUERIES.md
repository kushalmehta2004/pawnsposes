# Phase 3 Database Queries - Quick Reference

This document contains useful SQL queries for testing and monitoring the puzzle access control system.

## 🔍 Verification Queries

### Check if Tables Exist

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('reports', 'puzzles', 'puzzle_unlocks', 'puzzle_progress')
ORDER BY table_name;
```

**Expected Output:**
- puzzle_progress
- puzzle_unlocks
- puzzles
- reports

### Check Current User

```sql
SELECT auth.uid() as current_user_id;
```

### View All Tables and Row Counts

```sql
SELECT 
  'reports' as table_name, 
  COUNT(*) as row_count 
FROM reports
UNION ALL
SELECT 
  'puzzles' as table_name, 
  COUNT(*) as row_count 
FROM puzzles
UNION ALL
SELECT 
  'puzzle_unlocks' as table_name, 
  COUNT(*) as row_count 
FROM puzzle_unlocks
UNION ALL
SELECT 
  'puzzle_progress' as table_name, 
  COUNT(*) as row_count 
FROM puzzle_progress;
```

## 📊 Reports Queries

### View Recent Reports

```sql
SELECT 
  id,
  username,
  platform,
  title,
  game_count,
  created_at
FROM reports
ORDER BY created_at DESC
LIMIT 10;
```

### View Reports for Specific User

```sql
-- Replace [user_id] with actual UUID
SELECT 
  id,
  username,
  platform,
  title,
  game_count,
  created_at
FROM reports
WHERE user_id = '[user_id]'::uuid
ORDER BY created_at DESC;
```

### View Report with Puzzle Count

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
GROUP BY r.id
ORDER BY r.created_at DESC
LIMIT 10;
```

## 🧩 Puzzle Queries

### View All Puzzles Summary

```sql
SELECT 
  category,
  difficulty,
  is_locked,
  is_teaser,
  requires_subscription,
  COUNT(*) as count
FROM puzzles
GROUP BY category, difficulty, is_locked, is_teaser, requires_subscription
ORDER BY category, difficulty;
```

### View Teaser Puzzles

```sql
SELECT 
  id,
  category,
  difficulty,
  title,
  is_teaser,
  is_locked,
  created_at
FROM puzzles
WHERE is_teaser = true
ORDER BY category, created_at;
```

### View Locked Puzzles

```sql
SELECT 
  id,
  category,
  difficulty,
  title,
  is_locked,
  requires_subscription,
  created_at
FROM puzzles
WHERE is_locked = true
ORDER BY category, created_at;
```

### View Puzzles for Specific User

```sql
-- Replace [user_id] with actual UUID
SELECT 
  category,
  difficulty,
  is_locked,
  is_teaser,
  title,
  created_at
FROM puzzles
WHERE user_id = '[user_id]'::uuid
ORDER BY category, created_at;
```

### View Puzzles by Category

```sql
SELECT 
  category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE is_teaser = true) as teasers,
  COUNT(*) FILTER (WHERE is_locked = true) as locked,
  COUNT(*) FILTER (WHERE requires_subscription = true) as needs_subscription
FROM puzzles
GROUP BY category
ORDER BY category;
```

### View Puzzles for Specific Report

```sql
-- Replace [report_id] with actual UUID
SELECT 
  id,
  category,
  difficulty,
  is_locked,
  is_teaser,
  title,
  created_at
FROM puzzles
WHERE report_id = '[report_id]'::uuid
ORDER BY category, created_at;
```

## 🔓 Unlock Queries

### View All Unlocks

```sql
SELECT 
  pu.id,
  pu.user_id,
  pu.report_id,
  pu.unlock_type,
  pu.payment_amount,
  pu.unlocked_at,
  r.username,
  r.title as report_title
FROM puzzle_unlocks pu
LEFT JOIN reports r ON r.id = pu.report_id
ORDER BY pu.unlocked_at DESC;
```

### View Unlocks for Specific User

```sql
-- Replace [user_id] with actual UUID
SELECT 
  pu.id,
  pu.report_id,
  pu.unlock_type,
  pu.payment_amount,
  pu.unlocked_at,
  r.title as report_title
FROM puzzle_unlocks pu
LEFT JOIN reports r ON r.id = pu.report_id
WHERE pu.user_id = '[user_id]'::uuid
ORDER BY pu.unlocked_at DESC;
```

### Check if User Has Unlocked a Report

```sql
-- Replace [user_id] and [report_id] with actual UUIDs
SELECT EXISTS (
  SELECT 1 
  FROM puzzle_unlocks 
  WHERE user_id = '[user_id]'::uuid 
  AND report_id = '[report_id]'::uuid
  AND unlock_type = 'one_time_pack'
) as has_unlock;
```

## 📈 Progress Queries

### View User Progress Summary

```sql
-- Replace [user_id] with actual UUID
SELECT 
  COUNT(*) as total_attempts,
  COUNT(DISTINCT puzzle_id) as unique_puzzles,
  COUNT(*) FILTER (WHERE is_completed = true) as completed,
  COUNT(*) FILTER (WHERE is_correct = true) as correct,
  AVG(time_spent_seconds) as avg_time_seconds,
  SUM(hints_used) as total_hints
FROM puzzle_progress
WHERE user_id = '[user_id]'::uuid;
```

### View Progress by Category

```sql
-- Replace [user_id] with actual UUID
SELECT 
  p.category,
  COUNT(*) as attempts,
  COUNT(DISTINCT pp.puzzle_id) as unique_puzzles,
  COUNT(*) FILTER (WHERE pp.is_completed = true) as completed,
  COUNT(*) FILTER (WHERE pp.is_correct = true) as correct,
  AVG(pp.time_spent_seconds) as avg_time_seconds
FROM puzzle_progress pp
JOIN puzzles p ON p.id = pp.puzzle_id
WHERE pp.user_id = '[user_id]'::uuid
GROUP BY p.category
ORDER BY p.category;
```

### View Recent Progress

```sql
-- Replace [user_id] with actual UUID
SELECT 
  pp.puzzle_id,
  p.category,
  p.difficulty,
  p.title,
  pp.attempts,
  pp.is_completed,
  pp.is_correct,
  pp.time_spent_seconds,
  pp.last_attempt_at
FROM puzzle_progress pp
JOIN puzzles p ON p.id = pp.puzzle_id
WHERE pp.user_id = '[user_id]'::uuid
ORDER BY pp.last_attempt_at DESC
LIMIT 20;
```

## 🔧 Access Control Function Tests

### Test user_has_puzzle_access()

```sql
-- Replace [user_id] and [puzzle_id] with actual UUIDs
SELECT user_has_puzzle_access(
  '[user_id]'::uuid,
  '[puzzle_id]'::uuid
) as has_access;
```

**Expected Results:**
- `true` for teaser puzzles (even without subscription)
- `true` for unlocked puzzles (one-time purchase)
- `true` if user has active subscription
- `false` for locked puzzles without subscription

### Test get_accessible_puzzle_count()

```sql
-- Replace [user_id] with actual UUID
SELECT get_accessible_puzzle_count('[user_id]'::uuid) as accessible_count;
```

**Expected:** Number of teaser puzzles + unlocked puzzles (typically 4 for free users)

### Test get_accessible_puzzle_count() by Category

```sql
-- Replace [user_id] with actual UUID
SELECT get_accessible_puzzle_count('[user_id]'::uuid, 'tactical') as tactical_count;
SELECT get_accessible_puzzle_count('[user_id]'::uuid, 'positional') as positional_count;
SELECT get_accessible_puzzle_count('[user_id]'::uuid, 'opening') as opening_count;
SELECT get_accessible_puzzle_count('[user_id]'::uuid, 'endgame') as endgame_count;
```

**Expected:** 1 per category for free users (teaser puzzles)

## 🧹 Cleanup Queries (Use with Caution!)

### Delete All Puzzles for a User

```sql
-- Replace [user_id] with actual UUID
-- WARNING: This will permanently delete all puzzles!
DELETE FROM puzzles WHERE user_id = '[user_id]'::uuid;
```

### Delete All Reports for a User

```sql
-- Replace [user_id] with actual UUID
-- WARNING: This will cascade delete all associated puzzles!
DELETE FROM reports WHERE user_id = '[user_id]'::uuid;
```

### Delete All Progress for a User

```sql
-- Replace [user_id] with actual UUID
-- WARNING: This will permanently delete all progress!
DELETE FROM puzzle_progress WHERE user_id = '[user_id]'::uuid;
```

### Reset Puzzle Locks (for Testing)

```sql
-- Replace [user_id] with actual UUID
-- This will lock all puzzles except teasers
UPDATE puzzles 
SET is_locked = true 
WHERE user_id = '[user_id]'::uuid 
AND is_teaser = false;
```

### Mark All Puzzles as Unlocked (for Testing)

```sql
-- Replace [user_id] with actual UUID
-- This will unlock all puzzles for testing
UPDATE puzzles 
SET is_locked = false 
WHERE user_id = '[user_id]'::uuid;
```

## 📊 Analytics Queries

### Puzzle Distribution Report

```sql
SELECT 
  category,
  difficulty,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE is_teaser = true) as teasers,
  COUNT(*) FILTER (WHERE is_locked = false) as unlocked,
  COUNT(*) FILTER (WHERE is_locked = true) as locked,
  ROUND(AVG(rating_estimate)) as avg_rating
FROM puzzles
GROUP BY category, difficulty
ORDER BY category, 
  CASE difficulty
    WHEN 'beginner' THEN 1
    WHEN 'easy' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'hard' THEN 4
    WHEN 'expert' THEN 5
  END;
```

### User Engagement Report

```sql
SELECT 
  u.id as user_id,
  COUNT(DISTINCT r.id) as reports_generated,
  COUNT(DISTINCT p.id) as puzzles_available,
  COUNT(DISTINCT pp.puzzle_id) as puzzles_attempted,
  COUNT(DISTINCT pu.id) as unlocks_purchased,
  MAX(pp.last_attempt_at) as last_activity
FROM auth.users u
LEFT JOIN reports r ON r.user_id = u.id
LEFT JOIN puzzles p ON p.user_id = u.id
LEFT JOIN puzzle_progress pp ON pp.user_id = u.id
LEFT JOIN puzzle_unlocks pu ON pu.user_id = u.id
GROUP BY u.id
ORDER BY last_activity DESC NULLS LAST;
```

### Revenue Potential Report

```sql
SELECT 
  COUNT(DISTINCT user_id) as total_users,
  COUNT(DISTINCT user_id) FILTER (
    WHERE user_id IN (SELECT user_id FROM puzzle_unlocks WHERE unlock_type = 'one_time_pack')
  ) as users_with_one_time,
  COUNT(DISTINCT user_id) FILTER (
    WHERE user_id IN (SELECT user_id FROM puzzle_unlocks WHERE unlock_type = 'subscription')
  ) as users_with_subscription,
  SUM(payment_amount) as total_revenue
FROM puzzle_unlocks;
```

## 🔍 Debugging Queries

### Find Puzzles Without Teasers

```sql
-- This should return empty if teaser logic is working correctly
SELECT 
  user_id,
  report_id,
  category,
  COUNT(*) as puzzle_count,
  COUNT(*) FILTER (WHERE is_teaser = true) as teaser_count
FROM puzzles
GROUP BY user_id, report_id, category
HAVING COUNT(*) FILTER (WHERE is_teaser = true) = 0;
```

### Find Categories with Multiple Teasers

```sql
-- This should return empty if teaser logic is working correctly (max 1 per category)
SELECT 
  user_id,
  report_id,
  category,
  COUNT(*) FILTER (WHERE is_teaser = true) as teaser_count
FROM puzzles
GROUP BY user_id, report_id, category
HAVING COUNT(*) FILTER (WHERE is_teaser = true) > 1;
```

### Find Unlocked Puzzles That Are Still Marked as Locked

```sql
-- This should return empty if unlock logic is working correctly
SELECT 
  p.id,
  p.user_id,
  p.report_id,
  p.category,
  p.is_locked,
  pu.unlock_type
FROM puzzles p
JOIN puzzle_unlocks pu ON pu.report_id = p.report_id AND pu.user_id = p.user_id
WHERE p.is_locked = true
AND pu.unlock_type = 'one_time_pack';
```

### Check RLS Policies

```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('reports', 'puzzles', 'puzzle_unlocks', 'puzzle_progress')
ORDER BY tablename, policyname;
```

## 💡 Tips

1. **Replace Placeholders**: Always replace `[user_id]`, `[report_id]`, and `[puzzle_id]` with actual UUIDs
2. **Use auth.uid()**: In Supabase SQL Editor, `auth.uid()` returns the current authenticated user's ID
3. **Test with Your User**: Use `SELECT auth.uid()` to get your user ID for testing
4. **Check RLS**: If queries return empty results, check if RLS policies are blocking access
5. **Use Transactions**: For cleanup queries, wrap in `BEGIN; ... ROLLBACK;` to test before committing

## 🆘 Common Issues

### "No rows returned" when data should exist

**Cause**: RLS policies blocking access

**Solution**: Check if you're authenticated and the user_id matches:
```sql
SELECT auth.uid(); -- Should return your user ID
SELECT * FROM reports WHERE user_id = auth.uid(); -- Should return your reports
```

### "Function does not exist"

**Cause**: Helper functions not created

**Solution**: Run `database-puzzles-setup.sql` to create functions

### "Relation does not exist"

**Cause**: Tables not created

**Solution**: Run `database-setup.sql` and `database-puzzles-setup.sql`

---

**Last Updated**: Phase 3 Step 3 Complete
**Related Files**: 
- `database-puzzles-setup.sql`
- `PHASE3_SETUP_GUIDE.md`
- `PHASE3_PROGRESS.md`