# Gemini Video Verification - Detailed Criteria & Flow

## Verification Decision Tree

```
Gemini suggests video
    ↓
Does it have title AND creator?
    ├─ NO → Don't verify, don't display
    └─ YES → Search YouTube
        ↓
    Did YouTube search find any videos?
        ├─ NO → Display as unverified (grayed out)
        └─ YES → Get video details
            ↓
        For each video found:
            ├─ Is it embeddable?
            │   └─ NO → Skip this video
            ├─ Does it have region restrictions?
            │   └─ YES → Skip this video
            ├─ Is it at least 120 seconds long?
            │   └─ NO → Skip this video
            ├─ Does it have at least 1000 views?
            │   └─ NO → Skip this video
            └─ YES to all → Candidate video
        ↓
    Are there any candidate videos?
        ├─ NO → Display as unverified
        └─ YES → Rank and select best
            ├─ Sort by: channel match → title similarity → view count
            └─ Select #1
        ↓
    Display verified video with:
    ├─ Clickable YouTube link
    ├─ "✓ Verified" badge
    ├─ View count
    └─ Duration
```

## Verification Checklist

### Pre-Verification Checks
- [ ] Gemini suggestion has `title` (not empty/null)
- [ ] Gemini suggestion has `creator` (not empty/null)

### YouTube Search Checks
- [ ] Search executed with both title AND creator
- [ ] At least one result returned from YouTube API

### Video Quality Checks (MUST ALL PASS)

| Check | Criterion | Value | Reason |
|-------|-----------|-------|--------|
| Embeddable | `embeddable !== false` | TRUE | Video can be played on our site |
| Region Restricted | No region restrictions | FALSE | Accessible worldwide |
| Duration | ≥ 120 seconds | 2 min | Real content, not Shorts |
| Popularity | ≥ 1000 views | 1K | Credible video |
| Live Stream | `live !== true` | FALSE | Stable, permanent content |

### Ranking Algorithm (Priority Order)
1. **Channel Name Match** (Primary)
   - Exact or substring match with Gemini's suggested creator
   - Case-insensitive comparison
   - Example: "GothamChess" matches "gothamchess", "Gotham Chess"

2. **Title Similarity** (Secondary)
   - Fuzzy word-boundary matching
   - Words > 3 characters only
   - Example: "Sicilian Defense Basics" matches "Sicilian Defense COMPLETELY Explained"
   - Similarity Score = Common words / Total words

3. **View Count** (Tertiary)
   - Higher view count = more credible
   - Used only when channel and title are equal

### Example Ranking

**Scenario:** User weak in "Sicilian Defense" by GothamChess

Gemini Suggests:
```
title: "Sicilian Defense Basics"
creator: "GothamChess"
```

YouTube Search Results (after filtering):

| Rank | Video Title | Channel | Views | Channel Match | Title Sim | Score |
|------|------------|---------|-------|---|---|---|
| 1 | Sicilian Defense COMPLETELY Explained | GothamChess | 245K | ✓ | 75% | 9.8 |
| 2 | How to Play Sicilian Defense | LearnChess | 18K | ✗ | 60% | 8.2 |
| 3 | Sicilian Basics for Beginners | agadmator | 156K | ✗ | 80% | 8.5 |

**Selected:** #1 (GothamChess match takes priority)

---

## Detailed Filter Logic

### Filter 1: Embeddable Status
```javascript
if (!x.embeddable) {
  console.warn(`⚠️ Video "${x.title}" is not embeddable (restricted)`);
  return false;
}
```
**Reason:** YouTube sometimes embeds videos with restrictions (age gates, consent, etc.)

### Filter 2: Region Restrictions
```javascript
if (x.regionRestricted) {
  console.warn(`⚠️ Video "${x.title}" has region restrictions`);
  return false;
}
```
**Reason:** Video might not be accessible in all regions

### Filter 3: Duration (2 min minimum)
```javascript
if (x.durationSec < 120) {
  console.warn(`⚠️ Video "${x.title}" is too short (${x.durationSec}s)`);
  return false;
}
```
**Reason:** Educational content should be substantial, not short clips/Shorts

### Filter 4: View Count (1000 minimum)
```javascript
if (x.viewCount < 1000) {
  console.warn(`⚠️ Video "${x.title}" has low view count (${x.viewCount})`);
  return false;
}
```
**Reason:** Popular videos are more likely to be legitimate/quality content

---

## Similarity Matching Algorithm

### Title Matching
```javascript
const geminiBits = geminiTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
const titleBits = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
const commonWords = geminiBits.filter(w => 
  titleBits.some(t => t.includes(w) || w.includes(t))
);
const titleSimilarity = commonWords.length / Math.max(geminiBits.length, 1);
```

**Examples:**

1. Gemini: "Sicilian Defense Basics"
   - Bits: ["sicilian", "defense", "basics"]
   - YouTube: "Sicilian Defense COMPLETELY Explained"
   - Common: ["sicilian", "defense"] = 2/3 = 67%

2. Gemini: "King and Pawn Endgame"
   - Bits: ["king", "pawn", "endgame"]
   - YouTube: "King and Pawn Endgames Explained"
   - Common: ["king", "pawn", "endgame"] = 3/3 = 100%

3. Gemini: "Rook vs Knight"
   - Bits: ["rook", "knight"]
   - YouTube: "How to Handle Rook vs Knight in Endgames"
   - Common: ["rook", "knight"] = 2/2 = 100%

### Channel Matching
```javascript
channelMatch: channelTitle.toLowerCase().includes(geminiCreator.toLowerCase()) || 
             geminiCreator.toLowerCase().includes(channelTitle.toLowerCase())
```

**Examples:**
- ✓ GothamChess ↔ gothamchess
- ✓ GothamChess ↔ Gotham Chess  
- ✓ agadmator ↔ agadmator Antonio Radić
- ✗ GothamChess ↔ ChessNetwork
- ✗ GothamChess ↔ Chess.com

---

## API Call Structure

### Step 1: Search for Videos
```javascript
GET https://www.googleapis.com/youtube/v3/search?
  part=snippet
  maxResults=20
  type=video
  videoEmbeddable=true
  relevanceLanguage=en
  safeSearch=moderate
  order=relevance
  videoSyndicated=true
  q={title}%20{creator}
  key={API_KEY}
```

**Response:** Array of up to 20 video IDs matching the query

### Step 2: Get Video Details
```javascript
GET https://www.googleapis.com/youtube/v3/videos?
  part=contentDetails,statistics,snippet,status
  id={videoId1},{videoId2},...
  key={API_KEY}
```

**Response:** Detailed video metadata (duration, views, restrictions, etc.)

---

## Console Output Hierarchy

### Debug Logs (Non-blocking)
```
🔍 Verifying Gemini video suggestion: "Title" by Creator
```

### Info Logs (Success)
```
✅ Verified Gemini video: "Title" by Channel
   URL: https://www.youtube.com/watch?v=... | Views: 15000 | Duration: 300s
   Channel Match: true | Title Similarity: 85%
✅ Gemini video verified and accessible
```

### Warning Logs (Filters Applied)
```
⚠️ Video "Title" is too short (45s)
⚠️ Video "Title" has region restrictions
⚠️ Video "Title" is not embeddable (restricted)
⚠️ Video "Title" has low view count (500)
```

### Error Logs (Complete Failure)
```
❌ No videos found for: "Title" by Creator
❌ Video verification failed: [error message]
⚠️ Gemini video could not be verified on YouTube
```

---

## Matching Scenarios & Outcomes

### Scenario 1: Perfect Match ✅
```
Gemini: "Sicilian Defense Basics" by GothamChess
YouTube: "Sicilian Defense COMPLETELY Explained (Part 1)" by GothamChess
Channel Match: YES
Title Similarity: 75%
Views: 245,000
Embeddable: YES
Duration: 458s
Region Restricted: NO

RESULT: ✅ VERIFIED → Show clickable link
```

### Scenario 2: Title Match, Different Creator ⚠️
```
Gemini: "Sicilian Defense Basics" by GothamChess
YouTube: "Sicilian Defense Strategy Guide" by LearnChess
Channel Match: NO
Title Similarity: 75%
Views: 45,000
Embeddable: YES
Duration: 420s
Region Restricted: NO

RESULT: ⚠️ Selected but with lower confidence
→ If it's the best option, show it (channel mismatch but good title match)
→ If there's a GothamChess video, prefer that instead
```

### Scenario 3: Channel Match, Different Title ⚠️
```
Gemini: "Endgame Strategies" by GothamChess
YouTube: "How to Win in the Endgame" by GothamChess
Channel Match: YES
Title Similarity: 40%
Views: 125,000
Embeddable: YES
Duration: 600s
Region Restricted: NO

RESULT: ✅ VERIFIED → Show clickable link
(Channel match is priority over title similarity)
```

### Scenario 4: No Exact Match ❌
```
Gemini: "Quantum Chess Theories" by FakeCreator
YouTube: No matching videos found
RESULT: ❌ NOT VERIFIED → Show unverified suggestion (grayed out)
```

### Scenario 5: Found But Region Restricted ❌
```
Gemini: "Opening Principles" by SomeCreator
YouTube: "Opening Principles" by SomeCreator (region-restricted to EU only)
Channel Match: YES
Title Similarity: 100%
Embeddable: YES but restricted
Duration: 420s
Region Restricted: YES

RESULT: ❌ FILTERED OUT → Show unverified suggestion
Reason: Not accessible worldwide
```

### Scenario 6: Found But Too Short ❌
```
Gemini: "Quick Chess Tips" by ChessTutor
YouTube: "Quick Chess Tip #47" by ChessTutor
Channel Match: YES
Title Similarity: 80%
Views: 50,000
Embeddable: YES
Duration: 45s (less than 120s minimum)
Region Restricted: NO

RESULT: ❌ FILTERED OUT → Show unverified suggestion
Reason: Educational content is too short
```

---

## Performance Characteristics

### Time Breakdown
```
Verification Request: 0-100ms
YouTube API Search: 500-2000ms
YouTube API Details: 500-2000ms
Filter & Rank: 10-50ms
UI Update: 100-500ms
─────────────────────────────
Total: 1.5-5 seconds (typical)
```

### Memory Usage
```
Per Video Object: ~1KB (metadata only)
Verification Cache: ~5KB per 5 videos
Total Per Report: ~10-15KB
```

### API Quota Cost
```
Per Verification:
  - Search: 100 units
  - Details: 1 unit per video ID (max 20) = 20 units
  - Total: ~120 units per verification
  
Free Tier: 10,000 units/day = ~83 verifications/day
```

---

## Failure Recovery Strategy

### If Verification Fails
1. Show original Gemini suggestion (non-clickable)
2. Add note: "Could not verify on YouTube"
3. Log details for debugging
4. Don't crash or block other content
5. Allow user to manually search on YouTube

### If API Is Down
1. Fall back to displaying unverified suggestion
2. Show helpful error message
3. Don't retry automatically (preserve quota)
4. Log API error for monitoring

### If Timeout Occurs
1. Verification times out after ~5 seconds
2. Treat as "not found"
3. Show unverified suggestion
4. User can manually search YouTube

---

## Quality Metrics

### Success Rate (Expected)
- Real, widely-known videos: 95-99% verification rate
- Niche videos: 70-85% verification rate
- Hallucinated videos: 0% verification rate

### False Positive Rate (Unwanted)
- Should be < 5% (videos that shouldn't be recommended)
- Filters protect against age-restricted, region-restricted, low-quality

### False Negative Rate (Missed Good Videos)
- ~10-15% of real good videos might not be found
- Due to title variations or search algorithm limitations
- Acceptable tradeoff for quality assurance

---
