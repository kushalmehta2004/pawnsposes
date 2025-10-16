# 🏗️ Dashboard Architecture - Visual Guide

## 📊 System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                              │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    HEADER (Navigation)                        │ │
│  │  [Logo] [Home] [About] [Gallery] [Reports] [Pricing]         │ │
│  │                                    [User Icon ▼]              │ │
│  │                                      └─ Dashboard ← NEW!      │ │
│  │                                      └─ Sign Out              │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    DASHBOARD PAGE                             │ │
│  │                                                               │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  TAB NAVIGATION                                         │ │ │
│  │  │  [Past Reports] [Fix Weaknesses] [Learn Mistakes]      │ │ │
│  │  │  [Master Openings] [Sharpen Endgame]                   │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                               │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  ACTIVE TAB CONTENT                                     │ │ │
│  │  │                                                         │ │ │
│  │  │  [PastReportsSection] or [PuzzleSection]               │ │ │
│  │  │                                                         │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Fetches Data
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SERVICE LAYER                               │
│                                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐               │
│  │  reportService.js    │  │ puzzleAccessService  │               │
│  │                      │  │                      │               │
│  │  - getUserReports()  │  │ - getLatestPuzzles() │               │
│  │  - getReportById()   │  │ - getPuzzleStats()   │               │
│  │  - deleteReport()    │  │ - storePuzzlesBatch()│               │
│  └──────────────────────┘  └──────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Queries Database
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SUPABASE DATABASE                           │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │   reports    │  │   puzzles    │  │puzzle_unlocks│            │
│  │              │  │              │  │              │            │
│  │ - id         │  │ - id         │  │ - id         │            │
│  │ - user_id    │  │ - user_id    │  │ - user_id    │            │
│  │ - title      │  │ - report_id  │  │ - report_id  │            │
│  │ - pdf_url    │  │ - category   │  │ - unlock_type│            │
│  │ - game_count │  │ - difficulty │  │ - amount_paid│            │
│  │ - created_at │  │ - is_locked  │  │ - created_at │            │
│  │              │  │ - is_teaser  │  │              │            │
│  │              │  │ - puzzle_data│  │              │            │
│  │              │  │   (JSONB) ←──┼──┼─ NEW!        │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    DATABASE VIEWS                            │ │
│  │                                                              │ │
│  │  user_latest_puzzles - Latest puzzle per category per user  │ │
│  │  user_puzzle_stats   - Statistics per category per user     │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow Diagram

### Report Generation → Puzzle Storage → Dashboard Display

```
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 1: USER GENERATES REPORT                                      │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Reports.js                                                         │
│  - User enters chess username                                       │
│  - Fetches games from Lichess/Chess.com                             │
│  - Analyzes games with Gemini AI                                    │
│  - Generates PDF report                                             │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  reportService.saveReport()                                         │
│  - Saves report to Supabase                                         │
│  - Returns reportId                                                 │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 2: PUZZLES GENERATED (Background)                             │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ├─────────────────────────────────────────────────────┐
                 │                                                     │
                 ▼                                                     ▼
┌──────────────────────────────┐  ┌──────────────────────────────────┐
│  Fix My Weaknesses           │  │  Learn From Mistakes             │
│  (weaknessPuzzleService.js)  │  │  (puzzleGenerationService.js)    │
│  - Fetches tactical puzzles  │  │  - Analyzes user mistakes        │
│  - Filters by themes         │  │  - Generates 30 multi-move       │
│  - Returns 20 puzzles        │  │  - Returns 30 puzzles            │
└──────────────┬───────────────┘  └──────────────┬───────────────────┘
               │                                  │
               │                                  │
               ▼                                  ▼
┌──────────────────────────────┐  ┌──────────────────────────────────┐
│  Master My Openings          │  │  Sharpen My Endgame              │
│  (openingAnalysisService.js) │  │  (endgameService.js)             │
│  - Analyzes opening mistakes │  │  - Analyzes endgame positions    │
│  - Generates opening puzzles │  │  - Generates endgame puzzles     │
│  - Returns 20 puzzles        │  │  - Returns 20 puzzles            │
└──────────────┬───────────────┘  └──────────────┬───────────────────┘
               │                                  │
               └──────────────┬───────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  puzzleAccessService.storePuzzlesBatch()                            │
│  - Groups puzzles by category                                       │
│  - Marks first puzzle per category as teaser (is_teaser = true)     │
│  - Marks other puzzles as locked (is_locked = true)                 │
│  - Stores full puzzle data in puzzle_data column (JSONB)            │
│  - Associates with reportId                                         │
│  - Inserts into Supabase puzzles table                              │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SUPABASE puzzles TABLE                                             │
│  ✅ Puzzle metadata stored                                          │
│  ✅ Full puzzle data stored (puzzle_data JSONB)                     │
│  ✅ Teaser flags set (1 per category)                               │
│  ✅ Lock flags set (all except teasers)                             │
│  ✅ Report association maintained (report_id)                       │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 3: USER OPENS DASHBOARD                                       │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Dashboard.js                                                       │
│  - Calls reportService.getUserReports()                             │
│  - Calls puzzleAccessService.getLatestPuzzlesByCategory()           │
│  - Calls puzzleAccessService.getPuzzleStats()                       │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SUPABASE QUERIES                                                   │
│  - SELECT * FROM reports WHERE user_id = ?                          │
│  - SELECT * FROM user_latest_puzzles WHERE user_id = ?              │
│  - SELECT * FROM user_puzzle_stats WHERE user_id = ?                │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DASHBOARD DISPLAYS                                                 │
│  ✅ Past Reports section - Shows all reports                        │
│  ✅ Fix My Weaknesses - Shows tactical puzzles                      │
│  ✅ Learn From Mistakes - Shows positional puzzles                  │
│  ✅ Master My Openings - Shows opening puzzles                      │
│  ✅ Sharpen My Endgame - Shows endgame puzzles                      │
│  ✅ Lock/unlock badges displayed correctly                          │
│  ✅ Statistics displayed per category                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🗂️ File Structure

```
pawnsposes/
│
├── src/
│   ├── pages/
│   │   ├── Dashboard.js ← NEW! Main dashboard page
│   │   ├── MyReports.js (kept for reference, redirects to Dashboard)
│   │   ├── Reports.js (report generation)
│   │   └── ...
│   │
│   ├── components/
│   │   ├── Dashboard/ ← NEW! Dashboard components
│   │   │   ├── PastReportsSection.js ← NEW! Shows PDF reports
│   │   │   └── PuzzleSection.js ← NEW! Shows puzzles per category
│   │   │
│   │   ├── Layout/
│   │   │   └── Header.js (updated: My Reports → Dashboard)
│   │   └── ...
│   │
│   ├── services/
│   │   ├── reportService.js (existing, no changes)
│   │   ├── puzzleAccessService.js (updated: added 2 new methods)
│   │   ├── puzzleGenerationService.js (existing, no changes)
│   │   ├── weaknessPuzzleService.js (existing, no changes)
│   │   ├── openingAnalysisService.js (existing, no changes)
│   │   └── ...
│   │
│   ├── App.js (updated: added Dashboard route)
│   └── ...
│
├── database-puzzles-setup.sql (existing, no changes)
├── DASHBOARD_IMPLEMENTATION_ROADMAP.md ← NEW! Complete plan
├── DASHBOARD_QUICK_START.md ← NEW! Fast track guide
├── DASHBOARD_IMPLEMENTATION_SUMMARY.md ← NEW! Executive summary
├── DASHBOARD_CHECKLIST.md ← NEW! Implementation checklist
└── DASHBOARD_ARCHITECTURE.md ← NEW! This file
```

---

## 🔐 Access Control Logic

```
┌─────────────────────────────────────────────────────────────────────┐
│  USER CLICKS PUZZLE                                                 │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Check: Is puzzle locked?                                           │
│  (puzzle.is_locked === true)                                        │
└────────────────┬────────────────────────────────────────────────────┘
                 │
         ┌───────┴───────┐
         │               │
         ▼               ▼
    ┌────────┐      ┌────────┐
    │  YES   │      │   NO   │
    └───┬────┘      └───┬────┘
        │               │
        ▼               ▼
┌──────────────┐  ┌──────────────┐
│ Check: Is    │  │ Allow access │
│ teaser?      │  │ Navigate to  │
│              │  │ puzzle page  │
└───┬──────────┘  └──────────────┘
    │
    ├─────────────┬─────────────┐
    │             │             │
    ▼             ▼             ▼
┌────────┐  ┌────────┐  ┌────────────┐
│ Teaser │  │ Has    │  │ No access  │
│ (Free) │  │ Active │  │ Show       │
│        │  │ Sub?   │  │ pricing    │
└───┬────┘  └───┬────┘  └────────────┘
    │           │
    ▼           ▼
┌────────┐  ┌────────┐
│ Allow  │  │ Allow  │
│ access │  │ access │
└────────┘  └────────┘
```

---

## 📊 Database Schema Relationships

```
┌─────────────────────────────────────────────────────────────────────┐
│                         auth.users (Supabase Auth)                  │
│  - id (UUID)                                                        │
│  - email                                                            │
│  - created_at                                                       │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 │ user_id (FK)
                 │
         ┌───────┴───────┐
         │               │
         ▼               ▼
┌──────────────┐  ┌──────────────────────────────────────────────────┐
│   reports    │  │              user_profiles                       │
│              │  │  - id                                            │
│ - id         │  │  - user_id (FK → auth.users.id)                  │
│ - user_id ───┼──┤  - subscription_tier                             │
│ - title      │  │  - subscription_status                           │
│ - username   │  │  - subscription_expires_at                       │
│ - platform   │  │  - has_claimed_free_report                       │
│ - pdf_url    │  └──────────────────────────────────────────────────┘
│ - game_count │
│ - created_at │
└──────┬───────┘
       │
       │ report_id (FK)
       │
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           puzzles                                    │
│  - id (UUID)                                                         │
│  - user_id (FK → auth.users.id)                                      │
│  - report_id (FK → reports.id)                                       │
│  - category (tactical, positional, opening, endgame)                 │
│  - difficulty (easy, medium, hard)                                   │
│  - theme (fork, pin, skewer, etc.)                                   │
│  - is_locked (boolean)                                               │
│  - is_teaser (boolean)                                               │
│  - requires_subscription (boolean)                                   │
│  - fen (starting position)                                           │
│  - title (puzzle title)                                              │
│  - puzzle_data (JSONB) ← Full puzzle data                            │
│  - created_at                                                        │
└──────┬───────────────────────────────────────────────────────────────┘
       │
       │ puzzle_id (FK)
       │
       ├─────────────────────┬─────────────────────┐
       │                     │                     │
       ▼                     ▼                     ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
│puzzle_unlocks│  │ puzzle_progress  │  │ user_latest_     │
│              │  │                  │  │ puzzles (VIEW)   │
│ - id         │  │ - id             │  │                  │
│ - user_id    │  │ - user_id        │  │ Latest puzzle    │
│ - report_id  │  │ - puzzle_id      │  │ per category     │
│ - unlock_type│  │ - completed      │  │ per user         │
│ - payment_id │  │ - correct        │  └──────────────────┘
│ - amount_paid│  │ - attempts       │
│ - created_at │  │ - time_spent     │  ┌──────────────────┐
└──────────────┘  │ - created_at     │  │ user_puzzle_     │
                  └──────────────────┘  │ stats (VIEW)     │
                                        │                  │
                                        │ Statistics per   │
                                        │ category per user│
                                        └──────────────────┘
```

---

## 🎨 Component Hierarchy

```
Dashboard.js
│
├── Header (existing)
│   └── User Menu
│       ├── Dashboard ← NEW!
│       └── Sign Out
│
├── Subscription Status Banner (existing)
│
├── Tab Navigation
│   ├── Past Reports Tab
│   ├── Fix My Weaknesses Tab
│   ├── Learn From Mistakes Tab
│   ├── Master My Openings Tab
│   └── Sharpen My Endgame Tab
│
└── Tab Content (conditional rendering)
    │
    ├── PastReportsSection.js ← NEW!
    │   └── Report Cards
    │       ├── Report Title
    │       ├── Username
    │       ├── Date
    │       ├── Game Count
    │       └── View Button
    │
    └── PuzzleSection.js ← NEW! (4 instances, one per category)
        ├── Statistics Card
        │   ├── Total Puzzles
        │   ├── Free Teasers
        │   ├── Unlocked
        │   └── Locked
        │
        ├── Puzzle Cards Grid
        │   └── Puzzle Card
        │       ├── Lock/Unlock Badge
        │       ├── Difficulty Badge
        │       ├── Puzzle Title
        │       ├── Theme
        │       ├── Date
        │       └── Action Button
        │           ├── "Solve Puzzle" (if unlocked)
        │           └── "Upgrade to Unlock" (if locked)
        │
        └── View All Button (if >6 puzzles)
```

---

## 🔄 State Management

```
Dashboard.js State:
│
├── activeTab (string)
│   └── Controls which tab is displayed
│       Values: 'reports', 'weaknesses', 'mistakes', 'openings', 'endgame'
│
├── reports (array)
│   └── List of user's reports from Supabase
│       Fetched by: reportService.getUserReports()
│
├── puzzles (object)
│   └── Puzzles grouped by category
│       {
│         tactical: [...],
│         positional: [...],
│         opening: [...],
│         endgame: [...]
│       }
│       Fetched by: puzzleAccessService.getLatestPuzzlesByCategory()
│
├── puzzleStats (object)
│   └── Statistics per category
│       {
│         tactical: { total_puzzles, free_puzzles, unlocked_puzzles, locked_puzzles },
│         positional: { ... },
│         opening: { ... },
│         endgame: { ... }
│       }
│       Fetched by: puzzleAccessService.getPuzzleStats()
│
└── loading (boolean)
    └── Controls loading state
        true: Show loading spinner
        false: Show content
```

---

## 🚀 Performance Considerations

### Database Queries:
```
┌─────────────────────────────────────────────────────────────────────┐
│  OPTIMIZED QUERIES                                                  │
├─────────────────────────────────────────────────────────────────────┤
│  1. user_latest_puzzles VIEW                                        │
│     - Uses DISTINCT ON for efficient latest puzzle per category     │
│     - Indexed on (user_id, category, created_at)                    │
│     - Returns only latest puzzles (not all puzzles)                 │
│                                                                     │
│  2. user_puzzle_stats VIEW                                          │
│     - Pre-aggregated statistics                                     │
│     - No need to count in application code                          │
│     - Fast retrieval with GROUP BY                                  │
│                                                                     │
│  3. puzzles.puzzle_data JSONB                                       │
│     - GIN index for fast JSONB queries                              │
│     - Stores complete puzzle data (no joins needed)                 │
│     - Single query to get all puzzle info                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Frontend Optimization:
```
┌─────────────────────────────────────────────────────────────────────┐
│  PERFORMANCE OPTIMIZATIONS                                          │
├─────────────────────────────────────────────────────────────────────┤
│  1. Lazy Loading                                                    │
│     - Only load active tab content                                  │
│     - Use React.lazy() for code splitting (optional)                │
│                                                                     │
│  2. Memoization                                                     │
│     - Use React.memo() for PuzzleSection components                 │
│     - Prevent unnecessary re-renders                                │
│                                                                     │
│  3. Data Caching                                                    │
│     - Cache dashboard data in component state                       │
│     - Only refetch on explicit refresh                              │
│                                                                     │
│  4. Pagination                                                      │
│     - Show only 6 puzzles per category initially                    │
│     - "View All" button for full list                               │
│                                                                     │
│  5. Image Optimization                                              │
│     - Use lazy loading for puzzle board images                      │
│     - Optimize SVG icons                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔒 Security Considerations

```
┌─────────────────────────────────────────────────────────────────────┐
│  SECURITY MEASURES                                                  │
├─────────────────────────────────────────────────────────────────────┤
│  1. Row Level Security (RLS)                                        │
│     - Users can only see their own reports                          │
│     - Users can only see their own puzzles                          │
│     - Enforced at database level                                    │
│                                                                     │
│  2. Authentication                                                  │
│     - Dashboard requires authentication                             │
│     - Redirect to /auth if not signed in                            │
│     - Token-based authentication via Supabase                       │
│                                                                     │
│  3. Access Control                                                  │
│     - Teaser puzzles: Always accessible                             │
│     - Locked puzzles: Check subscription status                     │
│     - Enforced in UI and database                                   │
│                                                                     │
│  4. Data Validation                                                 │
│     - Validate user_id matches authenticated user                   │
│     - Validate report_id belongs to user                            │
│     - Validate puzzle_id belongs to user                            │
│                                                                     │
│  5. SQL Injection Prevention                                        │
│     - Use parameterized queries (Supabase handles this)             │
│     - Never concatenate user input into SQL                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📱 Responsive Design

```
┌─────────────────────────────────────────────────────────────────────┐
│  DESKTOP (>1024px)                                                  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  [Tab1] [Tab2] [Tab3] [Tab4] [Tab5]                          │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐                         │ │
│  │  │ Card 1  │ │ Card 2  │ │ Card 3  │  (3 columns)            │ │
│  │  └─────────┘ └─────────┘ └─────────┘                         │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐                         │ │
│  │  │ Card 4  │ │ Card 5  │ │ Card 6  │                         │ │
│  │  └─────────┘ └─────────┘ └─────────┘                         │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  TABLET (768px - 1024px)                                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  [Tab1] [Tab2] [Tab3] [Tab4] [Tab5]                          │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  ┌─────────────────┐ ┌─────────────────┐                     │ │
│  │  │    Card 1       │ │    Card 2       │  (2 columns)        │ │
│  │  └─────────────────┘ └─────────────────┘                     │ │
│  │  ┌─────────────────┐ ┌─────────────────┐                     │ │
│  │  │    Card 3       │ │    Card 4       │                     │ │
│  │  └─────────────────┘ └─────────────────┘                     │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  MOBILE (<768px)                                                    │
├─────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  [Tab1] [Tab2] [Tab3] [Tab4] [Tab5] →  (scroll horizontally) │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │              Card 1                                     │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │              Card 2                                     │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │              Card 3                                     │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  (1 column, stack vertically)                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Summary

**Key Architectural Decisions:**

1. **Hybrid Storage** (Phase 1-2)
   - Metadata + Full Data in Supabase
   - IndexedDB as optional cache
   - Single source of truth: Supabase

2. **Component-Based UI** (Phase 3)
   - Reusable PuzzleSection component
   - Separate PastReportsSection
   - Tab-based navigation

3. **Optimized Queries** (Phase 1)
   - Database views for common queries
   - JSONB for flexible puzzle data
   - Indexed for performance

4. **Access Control** (Existing)
   - RLS at database level
   - UI-level checks
   - Subscription-based unlocking

5. **Responsive Design** (Phase 3)
   - Mobile-first approach
   - Tailwind CSS utilities
   - Smooth animations

---

**Architecture Version:** 1.0  
**Created:** 2025  
**Status:** Ready for Implementation