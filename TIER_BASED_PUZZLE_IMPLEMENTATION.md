# Tier-Based Puzzle Implementation Summary

## Overview
Implemented a complete tier-based puzzle locking system that integrates seamlessly with your existing subscription infrastructure. Free users see teasers, while paid users unlock puzzles based on their subscription tier.

---

## 🎯 Pricing Model Implementation

### Tiers Configured:

| Tier | Price | Puzzles | Access |
|------|-------|---------|--------|
| **Free** | $0 | 1 teaser/category | Teaser only |
| **One-Time** | $4.99 | 1 week puzzles | 1 week from purchase |
| **Monthly** | $6.99/mo | Weekly updates | 4 weeks (~1 month) |
| **Quarterly** | $18.99/3mo | Weekly updates | 12 weeks (3 months) |
| **Annual** | $59.99/yr | Full year access | 52 weeks + priority features |

---

## 📁 Files Created

### 1. **`tierBasedPuzzleService.js`** ⭐ (Main Service)
Location: `src/services/tierBasedPuzzleService.js`

**Purpose**: Core service for tier-based puzzle management

**Key Functions**:
- `filterPuzzlesByTier(userId, puzzles)` - Separates accessible vs locked puzzles based on tier
- `canUserAccessPuzzle(userId, puzzle)` - Checks if user can access specific puzzle
- `getUnlockInfo(userId)` - Returns upgrade info for locked puzzles
- `addTierMetadata(puzzles, userTier)` - Adds tier information to puzzles for display
- `getTierOptions()` - Returns all subscription tier options for Pricing page

**Tier Configuration**:
```javascript
TIER_CONFIG = {
  free: { teaserCount: 1, maxWeeks: null },
  one_time: { maxWeeks: 1 },
  monthly: { maxWeeks: 4 },
  quarterly: { maxWeeks: 12 },
  annual: { maxWeeks: 52 }
}
```

---

## 🔌 Integration Points

### Dashboard.js (Updated)

**New Imports**:
```javascript
import tierBasedPuzzleService from '../services/tierBasedPuzzleService';
import UpgradePrompt from '../components/UpgradePrompt';
```

**New State**:
```javascript
const [userTier, setUserTier] = useState('free');
const [puzzlesWithTier, setPuzzlesWithTier] = useState({
  weakness: { accessible: [], locked: [] },
  mistake: { accessible: [], locked: [] },
  opening: { accessible: [], locked: [] },
  endgame: { accessible: [], locked: [] }
});
```

**Changes to loadPuzzles()**:
- After loading puzzles from Supabase, applies tier-based filtering
- Separates puzzles into `accessible` (teasers + user-tier eligible) and `locked`
- Updates userTier state for banner display
- Maintains persistence via PuzzleDataContext

**Updated renderPuzzleSection()**:
- Now takes only `category` parameter (simplified)
- Displays accessible puzzles with green border and teaser badge
- Shows locked puzzles with blurred board and "Unlock" button
- Displays UpgradePrompt for free users with locked puzzles
- Shows puzzle count by status (✅ Unlocked / 🔒 Locked)

**Subscription Banner**:
- Shows different message based on `userTier`:
  - Free (unused): "Generate your first report"
  - Free (used): "1 teaser per category - Upgrade to unlock full sets"
  - Paid: Shows tier name + description

---

## 🎨 UI/UX Changes

### Puzzle Cards

**Accessible Puzzles**:
- Green border (border-green-100)
- Teaser badge: 🎁 label if free teaser
- Full visibility and functionality
- "Solve on Lichess" button enabled

**Locked Puzzles**:
- Gray border (border-gray-200)
- Lock icon in top-right
- Board displayed at 40% opacity (opacity-40)
- Description text blurred (blur-sm)
- Orange "Unlock with Plan" button directing to pricing
- Only first 3 locked puzzles shown as preview

**Sections**:
- ✅ Unlocked section shows accessible puzzles
- 🔒 Locked section shows preview of locked content
- Upgrade prompt appears after locked previews for free users

---

## 🔄 How It Works

### User Journey

1. **Free User (First Time)**:
   - Generates first report → Gets teasers only (1 per category)
   - Dashboard shows: 1 teaser puzzle unlocked
   - Other puzzles appear grayed out with lock icon
   - UpgradePrompt encourages subscription

2. **Free User (After Free Report Used)**:
   - Banner changes to "Limited to 1 teaser per category"
   - Can see locked puzzles but can't access them
   - Multiple upgrade options suggested

3. **One-Time Pack User** ($4.99):
   - Immediate access to 1 week of puzzles (all 4 categories)
   - After 1 week: puzzles expire, locked again
   - Prompted to subscribe for continuous access

4. **Monthly Subscriber** ($6.99):
   - Accesses 4 weeks of weekly puzzles
   - New puzzles generated each week
   - Renewal: access continues
   - Shows "Monthly Plan Active" badge

5. **Quarterly Subscriber** ($18.99):
   - Accesses 12 weeks of puzzles
   - Same weekly generation as monthly
   - Better rate than month-to-month

6. **Annual Subscriber** ($59.99):
   - Full year (52 weeks) access
   - "Priority new features" badge
   - 40% savings vs monthly
   - Shows "Annual Plan Active"

---

## 🔐 Access Control Logic

### Puzzle Accessibility Check
```
IF puzzle.is_teaser:
  ✅ Always accessible (all tiers)
ELSE IF user_tier == 'free':
  ❌ Locked (show teaser only)
ELSE IF user_tier in ['one_time', 'monthly', 'quarterly', 'annual']:
  ✅ Check if puzzle within allowed week window
  IF within window:
    ✅ Accessible
  ELSE:
    ❌ Locked (expired or future puzzle)
```

---

## 📊 Data Flow

```
Dashboard (Load Puzzles)
    ↓
puzzleAccessService.getPuzzlesByCategory()  [Get from Supabase]
    ↓
tierBasedPuzzleService.filterPuzzlesByTier()  [Apply tier filtering]
    ↓
Separate into:
  - accessible[] (show fully)
  - locked[] (show preview/locked)
  - tierInfo (user's tier)
    ↓
setPuzzlesWithTier() [Store in state]
    ↓
renderPuzzleSection(category) [Display by tier]
```

---

## 🔗 Integration with Existing Services

### subscriptionService.js
- Already tracks user tier and expiration
- `getSubscriptionStatus(userId)` returns tier info
- Returns tier: 'free', 'one_time', 'monthly', 'quarterly', 'annual'
- Already integrated with Stripe

### puzzleAccessService.js
- `getPuzzlesByCategory()` - Gets puzzles from Supabase
- `storePuzzlesBatch()` - Stores with `is_teaser` flag
- Tier service builds on top without modifying existing logic

### userProfileService.js
- Continues to manage user profiles
- Subscription status tracked there as well
- Tier service queries subscriptionService primarily

---

## 📋 Database Schema Assumptions

Your `puzzles` table should have:
```
- id (UUID)
- user_id (UUID) 
- is_teaser (boolean) - marks free preview puzzles
- is_locked (boolean) - legacy field, still used
- unlock_tier (string) - tier required (free/monthly/etc)
- category (string) - weakness/mistake/opening/endgame
- fen (string) - chess position
- title/objective (string)
- theme (string)
- week_number (integer) - optional, for weekly tracking
- year (integer) - optional, for weekly tracking
```

---

## 🚀 Quick Feature List

✅ **Free Tier**:
- 1 teaser puzzle per category (from free report)
- Full PDF report (first time)
- Encourage upgrade with visible locked puzzles

✅ **One-Time ($4.99)**:
- 1 week full puzzle access
- All 4 categories unlocked for that week
- Temporary access (expires after week)
- Upsell to subscription

✅ **Recurring Tiers** (Monthly/Quarterly/Annual):
- Weekly puzzle generation
- All categories unlocked
- Automatic renewal
- Longer access windows (4/12/52 weeks)

✅ **Visual Indicators**:
- Green border for unlocked
- Gray/blurred for locked
- Teaser badge for free previews
- Lock icon on locked cards
- Subscription banner showing current tier

✅ **Upgrade Prompts**:
- UpgradePrompt component shown for free users
- Links to pricing page
- Suggests specific tiers
- Shows unlock info for each puzzle

---

## 🔧 Configuration

To customize pricing or tiers, edit `tierBasedPuzzleService.js`:

```javascript
TIER_CONFIG = {
  your_tier: {
    name: 'Display Name',
    teaserCount: 1,
    allowedPuzzles: 'weekly' or 'teaser_only',
    maxWeeks: number_or_null,
    price: amount
  }
}
```

---

## ✅ Testing Checklist

- [ ] Free user sees 1 teaser per category
- [ ] Free user sees other puzzles as locked
- [ ] Clicking "Unlock" goes to pricing page
- [ ] One-time pack user sees 1 week puzzles
- [ ] Monthly user sees 4 weeks of puzzles
- [ ] Quarterly user sees 12 weeks
- [ ] Annual user sees 52 weeks
- [ ] Subscription banner shows correct tier
- [ ] Locked puzzles display correctly (grayed, blurred)
- [ ] UpgradePrompt appears for free users with locked puzzles
- [ ] Puzzle data persists when navigating away and back

---

## 🎯 No Breaking Changes

✅ Existing puzzle system continues to work
✅ All current services unmodified
✅ Backward compatible with existing puzzle data
✅ Can disable tier-based locking by removing filterPuzzlesByTier call
✅ PuzzleDataContext preserves data across navigation

---

## 📞 Support

The system uses `subscriptionService` which already handles:
- Stripe integration
- Payment processing
- Subscription renewal
- Cancellation handling

The tier-based service only:
- Reads subscription status
- Filters puzzles accordingly
- Displays UI based on tier

No payment logic needed here—Stripe handles it!