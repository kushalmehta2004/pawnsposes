# Phase 3: Puzzle Access Control & Teasers - Implementation Guide

## Overview
This phase implements the puzzle locking/unlocking system based on the **Report Free → Puzzles Paid** pricing model.

---

## Pricing Model Summary

### Free Tier
- ✅ 1 Full Report (PDF) for free (first time only)
- ✅ **1 teaser puzzle per category** (4 total teasers)
- ❌ No access to remaining puzzles

### Subscription Plans
- **Monthly (₹619)**: Weekly puzzles unlocked (4 sections), refreshed weekly
- **Quarterly (₹1682)**: 3 months of weekly puzzle access (12 sets)
- **Annual (₹5314)**: Full-year access (52 sets), priority features

### One-Time Pack
- **₹442**: Unlock all puzzles from the free report (cheap entry point)

---

## Database Schema

### Tables Created

#### 1. `puzzles` Table
Stores puzzle metadata and access control flags.

**Key Fields:**
- `id` (UUID): Primary key
- `user_id` (UUID): Owner of the puzzle
- `report_id` (UUID): Report that generated this puzzle
- `puzzle_key` (TEXT): Unique key for IndexedDB sync
- `category` (TEXT): tactical, positional, opening, endgame
- `difficulty` (TEXT): beginner, easy, medium, hard, expert
- `is_locked` (BOOLEAN): Whether puzzle requires subscription
- `is_teaser` (BOOLEAN): Whether this is a free teaser puzzle
- `unlock_tier` (TEXT): free, one_time, monthly, quarterly, annual
- `fen` (TEXT): Starting position
- `title` (TEXT): Puzzle description

#### 2. `puzzle_unlocks` Table
Tracks one-time purchases and unlock history.

**Key Fields:**
- `id` (UUID): Primary key
- `user_id` (UUID): User who unlocked
- `report_id` (UUID): Report unlocked
- `unlock_type` (TEXT): one_time_pack, subscription, free_teaser
- `payment_id` (TEXT): Stripe payment intent ID
- `amount_paid` (DECIMAL): Amount paid in USD
- `expires_at` (TIMESTAMP): Expiration date (NULL for permanent)

#### 3. `puzzle_progress` Table
Tracks user attempts and completion status.

**Key Fields:**
- `id` (UUID): Primary key
- `user_id` (UUID): User
- `puzzle_id` (UUID): Puzzle
- `completed` (BOOLEAN): Whether puzzle is completed
- `correct` (BOOLEAN): Whether solved correctly
- `attempts` (INTEGER): Number of attempts
- `hints_used` (INTEGER): Hints used
- `time_spent` (INTEGER): Time in seconds

---

## Helper Functions

### `user_has_puzzle_access(p_user_id, p_puzzle_id)`
Checks if a user has access to a specific puzzle.

**Logic:**
1. If puzzle is a teaser → Allow access
2. If puzzle is not locked → Allow access
3. If user has active subscription → Allow access
4. If user has one-time unlock for the report → Allow access
5. Otherwise → Deny access

### `get_accessible_puzzle_count(p_user_id, p_category)`
Returns the count of puzzles a user can access (optionally filtered by category).

---

## Service Layer: `puzzleAccessService.js`

### Key Methods

#### `storePuzzlesBatch(puzzles, userId, reportId, teaserCount = 1)`
Stores puzzle metadata in Supabase after generation.
- Automatically marks first N puzzles per category as teasers
- Sets `is_locked` and `requires_subscription` flags

#### `checkPuzzleAccess(userId, puzzleId)`
Checks if user has access to a specific puzzle using the database function.

#### `getUserPuzzles(userId, filters)`
Retrieves all puzzles for a user with optional filters:
- `category`: Filter by category
- `difficulty`: Filter by difficulty
- `isLocked`: Filter by locked status
- `isTeaser`: Filter by teaser status
- `reportId`: Filter by report

#### `unlockPuzzlesOneTime(userId, reportId, paymentId, amountPaid)`
Unlocks all puzzles from a report via one-time purchase (₹442).
- Creates unlock record in `puzzle_unlocks`
- Updates all puzzles for the report to `is_locked = false`

#### `recordPuzzleProgress(userId, puzzleId, progressData)`
Records user's puzzle attempt and progress.

#### `getUserProgressStats(userId, category)`
Returns progress statistics (accuracy, completion rate, time spent, etc.).

---

## Implementation Steps

### ✅ Step 1: Database Setup (COMPLETED)
- [x] Create `database-puzzles-setup.sql`
- [x] Define tables: `puzzles`, `puzzle_unlocks`, `puzzle_progress`
- [x] Create indexes for performance
- [x] Set up Row Level Security (RLS) policies
- [x] Create helper functions

### ✅ Step 2: Service Layer (COMPLETED)
- [x] Create `puzzleAccessService.js`
- [x] Implement access control methods
- [x] Implement unlock methods
- [x] Implement progress tracking

### 🔄 Step 3: Integration with Report Generation (NEXT)
- [ ] Modify `Reports.js` to call `storePuzzlesBatch()` after puzzle generation
- [ ] Pass `userId`, `reportId`, and `teaserCount = 1`
- [ ] Store puzzle metadata in Supabase alongside IndexedDB

### ⏳ Step 4: Puzzle List UI Updates
- [ ] Modify puzzle list page to fetch puzzles from Supabase
- [ ] Add visual indicators for locked puzzles (lock icon, blur effect)
- [ ] Show "Upgrade to Unlock" CTA on locked puzzles
- [ ] Display teaser badge on free puzzles

### ⏳ Step 5: Puzzle Detail Page Access Control
- [ ] Add access check before allowing puzzle solving
- [ ] Show upgrade modal for locked puzzles
- [ ] Allow subscribed users full access
- [ ] Track puzzle progress via `recordPuzzleProgress()`

### ⏳ Step 6: One-Time Purchase Flow
- [ ] Add "Unlock All Puzzles - ₹442" button on report page
- [ ] Integrate with Stripe Checkout
- [ ] Call `unlockPuzzlesOneTime()` after successful payment
- [ ] Refresh puzzle list to show unlocked puzzles

---

## Testing Checklist

### Database Testing
- [ ] Run `database-puzzles-setup.sql` in Supabase SQL Editor
- [ ] Verify all tables created successfully
- [ ] Verify indexes created
- [ ] Verify RLS policies active
- [ ] Test helper functions with sample data

### Service Testing
- [ ] Test `storePuzzlesBatch()` with sample puzzles
- [ ] Verify teasers marked correctly (1 per category)
- [ ] Test `checkPuzzleAccess()` for different user states:
  - Free user (should access only teasers)
  - Subscribed user (should access all)
  - One-time unlock user (should access report puzzles)
- [ ] Test `getUserPuzzles()` with various filters
- [ ] Test `unlockPuzzlesOneTime()` flow
- [ ] Test `recordPuzzleProgress()` and `getUserProgressStats()`

### Integration Testing
- [ ] Generate a report and verify puzzles stored in both IndexedDB and Supabase
- [ ] Verify teaser puzzles are accessible without subscription
- [ ] Verify locked puzzles show lock icon and CTA
- [ ] Test one-time unlock flow end-to-end
- [ ] Test subscription unlock flow (after Stripe integration)

---

## Next Steps

### Immediate (Step 3)
1. Integrate `puzzleAccessService.storePuzzlesBatch()` into report generation flow
2. Test puzzle metadata storage after report generation
3. Verify teaser logic (1 puzzle per category unlocked)

### Short-term (Steps 4-5)
1. Update puzzle list UI with lock indicators
2. Add access control to puzzle detail page
3. Implement upgrade modals and CTAs

### Medium-term (Step 6)
1. Implement one-time purchase flow with Stripe
2. Test payment → unlock flow
3. Add purchase confirmation and success states

### Long-term (Phase 4)
1. Full Stripe subscription integration
2. Webhook handling for subscription events
3. Customer portal for subscription management

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     PUZZLE ACCESS FLOW                       │
└─────────────────────────────────────────────────────────────┘

1. REPORT GENERATION
   ┌──────────────┐
   │ Reports.js   │
   │ (generates)  │──┐
   └──────────────┘  │
                     ├──> IndexedDB (full puzzle data)
                     │
                     └──> Supabase (metadata + access control)
                          ├─> puzzles table
                          │   ├─ is_locked: true/false
                          │   ├─ is_teaser: true/false
                          │   └─ unlock_tier: free/monthly/etc.
                          │
                          └─> First puzzle per category marked as teaser

2. PUZZLE ACCESS CHECK
   ┌──────────────┐
   │ User clicks  │
   │ puzzle       │
   └──────┬───────┘
          │
          ├──> puzzleAccessService.checkPuzzleAccess()
          │    └──> Supabase RPC: user_has_puzzle_access()
          │         ├─ Is teaser? → ✅ Allow
          │         ├─ Has subscription? → ✅ Allow
          │         ├─ Has one-time unlock? → ✅ Allow
          │         └─ Otherwise → ❌ Deny (show upgrade modal)
          │
          └──> If allowed:
               ├─> Load full puzzle from IndexedDB
               └─> Track progress in Supabase

3. UNLOCK FLOW
   ┌──────────────┐
   │ User clicks  │
   │ "Unlock $5"  │
   └──────┬───────┘
          │
          ├──> Stripe Checkout
          │    └──> Payment Success
          │         └──> puzzleAccessService.unlockPuzzlesOneTime()
          │              ├─> Create puzzle_unlocks record
          │              └─> Update puzzles: is_locked = false
          │
          └──> Refresh puzzle list (now unlocked)
```

---

## File Structure

```
d:\pawns-poses\
├── database-puzzles-setup.sql          # ✅ Database schema
├── src\
│   ├── services\
│   │   └── puzzleAccessService.js      # ✅ Access control service
│   ├── pages\
│   │   └── Reports.js                  # 🔄 Needs integration
│   └── components\
│       ├── PuzzleCard.js               # ⏳ Needs lock UI
│       └── PuzzleDetail.js             # ⏳ Needs access check
└── PHASE3_IMPLEMENTATION.md            # ✅ This file
```

---

## Questions & Decisions

### Q: Should we migrate existing IndexedDB puzzles to Supabase?
**A:** No. Existing puzzles stay in IndexedDB. New puzzles (after Phase 3 deployment) will be stored in both IndexedDB (full data) and Supabase (metadata).

### Q: What happens if user clears IndexedDB but has unlocked puzzles in Supabase?
**A:** Puzzle metadata remains in Supabase. User can regenerate the report to restore full puzzle data to IndexedDB. Access control is preserved.

### Q: Can users share puzzle links?
**A:** No. Puzzles are user-specific (RLS policies enforce `user_id` check). Shared links will fail access check.

### Q: How do we handle subscription expiration?
**A:** Phase 4 (Stripe webhooks) will update `user_profiles.has_active_subscription`. Access checks will automatically deny access when subscription expires.

---

## Support & Troubleshooting

### Common Issues

**Issue:** Puzzles not storing in Supabase after report generation
- **Fix:** Ensure `puzzleAccessService.storePuzzlesBatch()` is called in `Reports.js` after puzzle generation
- **Check:** Verify `reportId` is available and passed correctly

**Issue:** User can't access teaser puzzles
- **Fix:** Verify `is_teaser = true` in database for first puzzle per category
- **Check:** Run query: `SELECT * FROM puzzles WHERE is_teaser = true;`

**Issue:** RLS policies blocking access
- **Fix:** Verify user is authenticated and `auth.uid()` matches `user_id`
- **Check:** Test with Supabase SQL Editor using `SELECT auth.uid();`

**Issue:** One-time unlock not working
- **Fix:** Verify `puzzle_unlocks` record created and `expires_at` is NULL
- **Check:** Run query: `SELECT * FROM puzzle_unlocks WHERE user_id = '<user_id>';`

---

## Completion Criteria

Phase 3 is complete when:
- ✅ Database schema deployed to Supabase
- ✅ Service layer implemented and tested
- ✅ Report generation stores puzzle metadata
- ✅ Puzzle list shows lock indicators
- ✅ Puzzle detail page enforces access control
- ✅ One-time unlock flow functional
- ✅ Progress tracking working
- ✅ All tests passing

---

**Status:** Step 1 & 2 Complete ✅ | Step 3 In Progress 🔄

**Next Action:** Integrate `puzzleAccessService.storePuzzlesBatch()` into `Reports.js`