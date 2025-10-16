# 🔧 Dashboard Implementation - Troubleshooting Guide

## 🚨 Common Issues & Solutions

---

## 📊 PHASE 1: Database Issues

### Issue 1: "puzzle_data column doesn't exist"

**Error Message:**
```
column "puzzle_data" of relation "puzzles" does not exist
```

**Cause:** The `puzzle_data` column hasn't been added to the puzzles table.

**Solution:**
```sql
-- Run in Supabase SQL Editor
ALTER TABLE puzzles 
ADD COLUMN IF NOT EXISTS puzzle_data JSONB;

CREATE INDEX IF NOT EXISTS puzzles_puzzle_data_idx 
ON puzzles USING GIN (puzzle_data);
```

**Verification:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'puzzles' 
AND column_name = 'puzzle_data';
```

---

### Issue 2: "relation 'user_latest_puzzles' does not exist"

**Error Message:**
```
relation "user_latest_puzzles" does not exist
```

**Cause:** The database views haven't been created.

**Solution:**
```sql
-- Run in Supabase SQL Editor
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

**Verification:**
```sql
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_latest_puzzles', 'user_puzzle_stats');
```

---

### Issue 3: "permission denied for table puzzles"

**Error Message:**
```
permission denied for table puzzles
```

**Cause:** Row Level Security (RLS) policies are blocking access.

**Solution:**
```sql
-- Check existing policies
SELECT * FROM pg_policies WHERE tablename = 'puzzles';

-- If no policies exist, create them:
ALTER TABLE puzzles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own puzzles"
ON puzzles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own puzzles"
ON puzzles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own puzzles"
ON puzzles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own puzzles"
ON puzzles FOR DELETE
USING (auth.uid() = user_id);
```

---

## 🔄 PHASE 2: Puzzle Storage Issues

### Issue 4: "puzzleAccessService.getLatestPuzzlesByCategory is not a function"

**Error Message:**
```
TypeError: puzzleAccessService.getLatestPuzzlesByCategory is not a function
```

**Cause:** The method hasn't been added to `puzzleAccessService.js`.

**Solution:**
1. Open `src/services/puzzleAccessService.js`
2. Add the method before the closing brace of the class:

```javascript
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

    console.log('✅ Fetched latest puzzles:', data.length, 'puzzles');
    return puzzlesByCategory;
  } catch (error) {
    console.error('❌ Failed to fetch latest puzzles:', error);
    throw error;
  }
}
```

3. Make sure it's inside the class but before `export default new PuzzleAccessService();`

---

### Issue 5: "Puzzles stored but puzzle_data is null"

**Symptom:** Puzzles appear in database but `puzzle_data` column is null.

**Cause:** `storePuzzlesBatch()` isn't including `puzzle_data` in the insert.

**Solution:**
1. Open `src/services/puzzleAccessService.js`
2. Find `storePuzzlesBatch()` method (around line 58)
3. Add `puzzle_data: puzzle` to the puzzleRecords object:

```javascript
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
  puzzle_data: puzzle // ← ADD THIS LINE
});
```

4. Generate a new report to test

**Verification:**
```sql
SELECT 
  category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE puzzle_data IS NOT NULL) as with_data
FROM puzzles
WHERE user_id = 'YOUR_USER_ID'
GROUP BY category;
```

---

### Issue 6: "Cannot read property 'tactical' of undefined"

**Error Message:**
```
TypeError: Cannot read property 'tactical' of undefined
```

**Cause:** `getLatestPuzzlesByCategory()` is returning undefined or the data structure is wrong.

**Solution:**
1. Check browser console for errors from `getLatestPuzzlesByCategory()`
2. Verify the method returns the correct structure:

```javascript
// Should return:
{
  tactical: [...],
  positional: [...],
  opening: [...],
  endgame: [...]
}
```

3. Add error handling in Dashboard.js:

```javascript
const loadDashboardData = async () => {
  try {
    setLoading(true);
    
    // Load puzzles with error handling
    const puzzlesData = await puzzleAccessService.getLatestPuzzlesByCategory(user.id);
    setPuzzles(puzzlesData || {
      tactical: [],
      positional: [],
      opening: [],
      endgame: []
    });
    
  } catch (error) {
    console.error('❌ Error loading dashboard:', error);
    // Set empty state
    setPuzzles({
      tactical: [],
      positional: [],
      opening: [],
      endgame: []
    });
    toast.error('Failed to load dashboard data');
  } finally {
    setLoading(false);
  }
};
```

---

## 🎨 PHASE 3: UI Issues

### Issue 7: "Dashboard page is blank"

**Symptom:** Dashboard loads but shows nothing (blank page).

**Possible Causes & Solutions:**

**Cause 1: Import error**
```javascript
// Check Dashboard.js imports
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import reportService from '../services/reportService';
import puzzleAccessService from '../services/puzzleAccessService';
```

**Cause 2: Component not exported**
```javascript
// At the end of Dashboard.js
export default Dashboard;
```

**Cause 3: Route not configured**
```javascript
// In App.js
import Dashboard from './pages/Dashboard';

// In routes
<Route path="/dashboard" element={<Dashboard />} />
```

**Cause 4: Authentication required**
```javascript
// Add to Dashboard.js
const { user } = useAuth();

if (!user) {
  return <Navigate to="/auth" replace />;
}
```

---

### Issue 8: "Module not found: Can't resolve './Dashboard/PastReportsSection'"

**Error Message:**
```
Module not found: Error: Can't resolve './Dashboard/PastReportsSection'
```

**Cause:** Component files don't exist or are in wrong location.

**Solution:**
1. Verify folder structure:
```
src/
  components/
    Dashboard/
      PastReportsSection.js
      PuzzleSection.js
```

2. Check import paths in Dashboard.js:
```javascript
import PastReportsSection from '../components/Dashboard/PastReportsSection';
import PuzzleSection from '../components/Dashboard/PuzzleSection';
```

3. If files don't exist, create them using code from roadmap

---

### Issue 9: "Navigation still shows 'My Reports'"

**Symptom:** Header still shows "My Reports" instead of "Dashboard".

**Solution:**
1. Open `src/components/Layout/Header.js`
2. Find line ~133 (desktop menu):
```javascript
<Link
  to="/dashboard"  // Change from /my-reports
  onClick={() => setShowUserMenu(false)}
  className="flex items-center space-x-2 w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 transition-colors"
>
  <User size={16} />
  <span>Dashboard</span>  {/* Change from My Reports */}
</Link>
```

3. Find line ~211 (mobile menu) and make same changes
4. Clear browser cache (Ctrl+Shift+R)

---

### Issue 10: "Tabs not displaying correctly"

**Symptom:** Tabs are stacked vertically or not visible.

**Solution:**
1. Check tab container has correct classes:
```javascript
<div className="flex border-b border-gray-200">
  {tabs.map((tab) => (
    // tab buttons
  ))}
</div>
```

2. Check for CSS conflicts in browser DevTools
3. Verify Tailwind CSS is loaded
4. Add overflow-x-auto for mobile:
```javascript
<div className="bg-white rounded-lg shadow-lg mb-8 overflow-x-auto">
  <div className="flex border-b border-gray-200">
    {/* tabs */}
  </div>
</div>
```

---

### Issue 11: "Lock icons not displaying"

**Symptom:** Lock/unlock badges don't show or show incorrectly.

**Solution:**
1. Verify lucide-react icons are imported:
```javascript
import { Lock, Unlock } from 'lucide-react';
```

2. Check badge rendering logic in PuzzleSection.js:
```javascript
<span className={`px-3 py-1 rounded-full text-xs font-semibold ${
  puzzle.is_teaser 
    ? 'bg-green-100 text-green-700'
    : puzzle.is_locked && !hasSubscription
    ? 'bg-red-100 text-red-700'
    : 'bg-blue-100 text-blue-700'
}`}>
  {puzzle.is_teaser ? '🎁 FREE TEASER' : puzzle.is_locked && !hasSubscription ? '🔒 LOCKED' : '✅ UNLOCKED'}
</span>
```

3. Verify `hasSubscription` prop is passed correctly

---

## 🔍 PHASE 4: Testing Issues

### Issue 12: "Dashboard loads but shows 'No puzzles generated yet'"

**Symptom:** Dashboard loads but all puzzle sections show empty state.

**Possible Causes:**

**Cause 1: No puzzles in database**
```sql
-- Check if puzzles exist
SELECT COUNT(*) FROM puzzles WHERE user_id = 'YOUR_USER_ID';
```
**Solution:** Generate a new report to create puzzles

**Cause 2: Puzzles exist but not fetched**
```javascript
// Check browser console for errors
// Look for: "❌ Failed to fetch latest puzzles"
```
**Solution:** Check `getLatestPuzzlesByCategory()` implementation

**Cause 3: Wrong user ID**
```javascript
// In Dashboard.js, log user ID
console.log('User ID:', user.id);

// Compare with database
SELECT DISTINCT user_id FROM puzzles;
```
**Solution:** Ensure correct user ID is being used

---

### Issue 13: "Reports show but puzzles don't"

**Symptom:** Past Reports section works but puzzle sections are empty.

**Solution:**
1. Check if puzzles were generated with full data:
```sql
SELECT 
  category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE puzzle_data IS NOT NULL) as with_data
FROM puzzles
WHERE user_id = 'YOUR_USER_ID'
GROUP BY category;
```

2. If `with_data` is 0, regenerate report (puzzles need full data)

3. Check browser console for fetch errors

4. Verify `getLatestPuzzlesByCategory()` is being called:
```javascript
// In Dashboard.js loadDashboardData()
console.log('Fetching puzzles for user:', user.id);
const puzzlesData = await puzzleAccessService.getLatestPuzzlesByCategory(user.id);
console.log('Puzzles fetched:', puzzlesData);
```

---

### Issue 14: "All puzzles show as locked (even teasers)"

**Symptom:** Free teaser puzzles show as locked.

**Solution:**
1. Check database teaser flags:
```sql
SELECT 
  category,
  is_teaser,
  is_locked,
  COUNT(*)
FROM puzzles
WHERE user_id = 'YOUR_USER_ID'
GROUP BY category, is_teaser, is_locked;
```

2. Should see 1 teaser per category with `is_teaser = true` and `is_locked = false`

3. If not, regenerate report (teaser logic may not have run)

4. Check `storePuzzlesBatch()` teaser logic:
```javascript
const isTeaser = index < teaserCount; // Should be true for first puzzle

puzzleRecords.push({
  // ...
  is_locked: !isTeaser, // Should be false for teasers
  is_teaser: isTeaser,  // Should be true for teasers
  // ...
});
```

---

### Issue 15: "Mobile view is broken"

**Symptom:** Dashboard doesn't display correctly on mobile.

**Solution:**
1. Check viewport meta tag in `public/index.html`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

2. Add responsive classes to tab container:
```javascript
<div className="bg-white rounded-lg shadow-lg mb-8 overflow-x-auto">
  <div className="flex border-b border-gray-200">
    {tabs.map((tab) => (
      <button
        className="... whitespace-nowrap" // Add whitespace-nowrap
      >
        {/* tab content */}
      </button>
    ))}
  </div>
</div>
```

3. Check grid classes for cards:
```javascript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* cards */}
</div>
```

4. Test in browser DevTools mobile view (Ctrl+Shift+M)

---

## 🚀 PHASE 5: Deployment Issues

### Issue 16: "Build fails with 'Module not found'"

**Error Message:**
```
Module not found: Error: Can't resolve 'X'
```

**Solution:**
1. Check all imports are correct
2. Verify all files exist
3. Check for typos in import paths
4. Run `npm install` to ensure dependencies are installed
5. Clear node_modules and reinstall:
```bash
rm -rf node_modules
npm install
```

---

### Issue 17: "Dashboard works locally but not in production"

**Symptom:** Dashboard works with `npm start` but not after deployment.

**Possible Causes:**

**Cause 1: Environment variables not set**
```bash
# Check .env file
REACT_APP_SUPABASE_URL=your_url
REACT_APP_SUPABASE_ANON_KEY=your_key
```
**Solution:** Set environment variables in hosting platform (Vercel/Netlify)

**Cause 2: Build errors ignored**
```bash
# Check build output
npm run build
```
**Solution:** Fix all build warnings/errors

**Cause 3: Route not configured**
**Solution:** Ensure hosting platform supports client-side routing (add `_redirects` or `vercel.json`)

---

### Issue 18: "Database queries fail in production"

**Error Message:**
```
Failed to fetch latest puzzles: FetchError
```

**Solution:**
1. Check Supabase URL and keys are correct in production
2. Verify RLS policies allow access
3. Check Supabase logs in Dashboard → Logs
4. Test queries directly in Supabase SQL Editor
5. Verify user is authenticated in production

---

## 🔧 General Debugging Tips

### Tip 1: Check Browser Console
```javascript
// Open DevTools (F12)
// Go to Console tab
// Look for red errors
// Check Network tab for failed requests
```

### Tip 2: Add Debug Logging
```javascript
// In Dashboard.js
console.log('🔍 Dashboard mounted');
console.log('👤 User:', user);
console.log('📊 Reports:', reports);
console.log('🧩 Puzzles:', puzzles);
console.log('📈 Stats:', puzzleStats);
```

### Tip 3: Check Supabase Logs
```
1. Go to Supabase Dashboard
2. Click on your project
3. Go to Logs section
4. Filter by "API" or "Database"
5. Look for errors
```

### Tip 4: Test Queries Directly
```sql
-- In Supabase SQL Editor
-- Test each query individually
SELECT * FROM reports WHERE user_id = 'YOUR_USER_ID';
SELECT * FROM puzzles WHERE user_id = 'YOUR_USER_ID';
SELECT * FROM user_latest_puzzles WHERE user_id = 'YOUR_USER_ID';
SELECT * FROM user_puzzle_stats WHERE user_id = 'YOUR_USER_ID';
```

### Tip 5: Clear Cache
```javascript
// Clear browser cache
// Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

// Clear localStorage
localStorage.clear();

// Clear IndexedDB
indexedDB.deleteDatabase('PuzzleDatabase');
```

---

## 📞 Still Having Issues?

### Checklist Before Asking for Help:

- [ ] Checked browser console for errors
- [ ] Checked Supabase logs
- [ ] Verified database schema is correct
- [ ] Verified all files exist
- [ ] Verified all imports are correct
- [ ] Cleared browser cache
- [ ] Tried in incognito/private mode
- [ ] Tested on different browser
- [ ] Checked this troubleshooting guide

### Information to Provide:

1. **Error Message:** Full error message from console
2. **Steps to Reproduce:** What you did before error occurred
3. **Expected Behavior:** What should happen
4. **Actual Behavior:** What actually happened
5. **Environment:** Browser, OS, Node version
6. **Code:** Relevant code snippets
7. **Database:** Query results from Supabase

---

## 🎯 Quick Fixes Summary

| Issue | Quick Fix |
|-------|-----------|
| puzzle_data column missing | Run ALTER TABLE query |
| Views don't exist | Run CREATE VIEW queries |
| Method not found | Add method to service file |
| puzzle_data is null | Add `puzzle_data: puzzle` to insert |
| Dashboard blank | Check imports and routes |
| Navigation not updated | Update Header.js links |
| Tabs not working | Check flex classes |
| No puzzles showing | Generate new report |
| All puzzles locked | Check teaser logic |
| Mobile broken | Add responsive classes |
| Build fails | Check imports and dependencies |
| Production fails | Check environment variables |

---

**Troubleshooting Guide Version:** 1.0  
**Last Updated:** 2025  
**Coverage:** All common issues from Phases 1-5