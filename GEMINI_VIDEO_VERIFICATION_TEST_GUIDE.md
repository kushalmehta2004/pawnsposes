# Testing Guide: Gemini Video Verification System

## Quick Start Testing

### Prerequisites
- Application running locally with `npm start`
- Valid `REACT_APP_YOUTUBE_API_KEY` in `.env`
- Browser developer console open (F12)

## Test Scenarios

### Test 1: Valid Video Verification ✅
**Objective:** Verify that real, accessible videos are found and linked correctly

**Steps:**
1. Navigate to a chess game analysis that triggers full report generation
2. Wait for the report to load
3. In the console, you should see:
   ```
   🔍 Verifying Gemini video suggestion: "..."
   ```
4. Within a few seconds, should see:
   ```
   ✅ Verified Gemini video: "..." by ...
      URL: https://www.youtube.com/watch?v=...
   ```

**Success Criteria:**
- ✅ Green "Verified" badge appears next to video title
- ✅ Video title becomes a clickable link
- ✅ View count and duration are displayed
- ✅ Clicking the link opens the YouTube video

**Example Output:**
```
AI-Powered Video Suggestion
✓ Verified
📚 Sicilian Defense Basics Tutorial
Channel: GothamChess • 245,000 views • 7 min
[Clickable link to YouTube]
```

---

### Test 2: Non-existent Video ❌
**Objective:** Verify graceful handling when Gemini suggests a video that doesn't exist

**Steps:**
1. Manually edit the analysis object to include a fake video suggestion:
   ```javascript
   analysis.pawnsposesAI.improvementPlan.youtubeVideo = {
     title: "This Video Definitely Does Not Exist On YouTube At All",
     creator: "FakeCreatorName123"
   }
   ```
2. Observe the console and UI

**Success Criteria:**
- ✅ No crash or error
- ✅ Console shows verification attempt
- ✅ Console shows: `❌ No videos found for: ...`
- ✅ UI shows non-clickable original suggestion with gray text
- ✅ Message: "Could not verify video availability on YouTube"

**Example Output:**
```
AI-Powered Video Suggestion
📚 This Video Definitely Does Not Exist On YouTube At All
Channel: FakeCreatorName123
[Gray text, not clickable]
Could not verify video availability on YouTube
```

---

### Test 3: Loading State ⏳
**Objective:** Verify the loading badge appears while verification is in progress

**Steps:**
1. Open browser dev tools Network tab
2. Throttle network to "Slow 3G"
3. Trigger analysis
4. Watch the Full Report load
5. Observe the video suggestion section loading state

**Success Criteria:**
- ✅ "⏳ Verifying..." badge appears
- ✅ Badge disappears after verification completes
- ✅ Either shows verified video or fallback message

---

### Test 4: Region Restrictions Handling 🌍
**Objective:** Verify that region-restricted videos are rejected

**Steps:**
1. Check console during verification
2. Look for any warnings about region restrictions

**Success Criteria:**
- ✅ Videos with region restrictions are rejected
- ✅ Console shows: `⚠️ Video "..." has region restrictions`
- ✅ Falls back to showing unverified suggestion

---

### Test 5: Title Similarity Matching 📋
**Objective:** Verify that close title matches are accepted

**Steps:**
1. Monitor console during verification
2. Look for the "Title Similarity" percentage

**Success Criteria:**
- ✅ Shows title similarity percentage (e.g., 75%)
- ✅ Verified video title differs slightly from Gemini suggestion but is still accepted
- ✅ Best matching video is selected from results

**Example Console Output:**
```
✅ Verified Gemini video: "Sicilian Defense COMPLETELY Explained (Part 1)" by GothamChess
   URL: https://www.youtube.com/watch?v=... | Views: 245000 | Duration: 458s
   Channel Match: true | Title Similarity: 80%
```

---

### Test 6: YouTube API Failure Handling 🚫
**Objective:** Verify graceful handling when YouTube API is unavailable

**Steps:**
1. Temporarily change `REACT_APP_YOUTUBE_API_KEY` to invalid value
2. Trigger analysis
3. Observe console and UI

**Success Criteria:**
- ✅ No crash
- ✅ Console shows warning: `REACT_APP_YOUTUBE_API_KEY is missing`
- ✅ UI shows unverified suggestion
- ✅ Error message is helpful

---

## Console Output Reference

### During Verification
```
🔍 Verifying Gemini video suggestion: "Video Title Here" by CreatorName
```

### Success
```
✅ Verified Gemini video: "Actual YouTube Title" by Actual Creator
   URL: https://www.youtube.com/watch?v=abc123def456 | Views: 15000 | Duration: 420s
   Channel Match: true | Title Similarity: 85%
✅ Gemini video verified and accessible
```

### Not Found
```
❌ No videos found for: "Video Title" by CreatorName
⚠️ Gemini video could not be verified on YouTube
```

### Region Restricted
```
⚠️ Video "Title" has region restrictions
```

### Too Short
```
⚠️ Video "Title" is too short (45s)
```

### Too Few Views
```
⚠️ Video "Title" has low view count (500)
```

### Not Embeddable
```
⚠️ Video "Title" is not embeddable (restricted)
```

---

## Performance Expectations

| Metric | Expected |
|--------|----------|
| Verification Time | 2-5 seconds |
| API Calls Per Video | 2 (search + details) |
| API Units Consumed | 2-3 per video |
| Network Requests | 2 requests to YouTube API |

---

## Debugging Tips

### Check If Gemini Data Exists
1. Open DevTools Console
2. Type: `document.__debugData?.analysis?.pawnsposesAI?.improvementPlan?.youtubeVideo`
3. Should show `{ title: "...", creator: "..." }` if available

### Monitor Verification in Real Time
1. Filter console by `verifyGemini` keyword
2. All logs related to verification will appear
3. Shows success/failure for each verification attempt

### Inspect Verified Video Object
1. Add breakpoint in verification useEffect
2. Check `verifiedGeminiVideo` state variable
3. Should contain: `{ title, creator, url, viewCount, duration, verified: true }`

### Check for Race Conditions
1. Rapidly switch between reports
2. Verify no ghost state updates
3. Look for "cancelled" messages in console

---

## Common Issues & Solutions

### Issue: Verification takes too long
**Solution:** 
- Check network connection
- Verify YouTube API key is valid
- Try disabling network throttling in DevTools

### Issue: Videos are verified but links don't work
**Solution:**
- Check if video is actually available in your region
- Verify YouTube API key has correct permissions
- Clear browser cache

### Issue: All videos show as unverified
**Solution:**
- Check `REACT_APP_YOUTUBE_API_KEY` in `.env`
- Verify API key is enabled for YouTube Data API v3
- Check API quota hasn't been exceeded
- Monitor console for error messages

### Issue: Verification crashes the page
**Solution:**
- Check browser console for errors
- Verify dynamic import is working
- Check that `youtubeSearchService.js` exports `verifyGeminiVideoSuggestion`

---

## What to Verify

- [ ] Valid videos show as clickable links with metadata
- [ ] Invalid videos show as unverified suggestions
- [ ] Loading badge appears during verification
- [ ] Verified badge shows on success
- [ ] Console logs are clear and helpful
- [ ] No memory leaks (cancel cleanup works)
- [ ] Works across different analyses
- [ ] Network errors handled gracefully
- [ ] Videos are actually accessible on YouTube
- [ ] Region-restricted content is properly rejected

---

## Next Steps After Testing

1. **If all tests pass:** Video verification system is working correctly
2. **If some fail:** Check console logs and adjust criteria if needed
3. **If verification is too strict:** Lower view count threshold (currently 1000)
4. **If verification is too lenient:** Add more filters (e.g., minimum subscribers)
