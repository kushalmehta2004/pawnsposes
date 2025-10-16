# Gemini Move Hallucination Fix

## Problem
Gemini was suggesting impossible/illegal chess moves in the "Better Plan" explanations. For example, it would suggest moves that weren't legal in the given position, causing confusion for users.

## Root Cause
The Gemini prompt was asking it to explain Stockfish's best move, but Gemini was:
1. Not constrained to only explain concepts
2. Hallucinating additional follow-up moves that may not be legal
3. Using too high temperature (0.6) which increased creativity/hallucination

## Solution Implemented

### 1. Enhanced Prompt Constraints
Added explicit rules to the Gemini prompt in `enhanceExampleWithStockfishAndGemini()`:

```
CRITICAL RULES:
- DO NOT suggest any additional moves beyond ${example.betterMove}
- DO NOT use chess notation like Nf3, Qd5, etc. in your explanation EXCEPT when referring to ${example.betterMove} itself
- Focus on CONCEPTS: "controls the center", "activates the rook", "improves piece coordination", "prevents counterplay"
- Reference squares by name (e.g., "d5", "the kingside") but DO NOT suggest moves
- Examples of GOOD explanations: "controls the critical d5 square", "activates the rook along the third rank"
- Examples of BAD explanations: "followed by Nf3 and Qd2" (suggesting additional moves)
```

### 2. Reduced Temperature
Changed generation parameters to reduce hallucination:
- **Temperature**: 0.6 → 0.3 (more focused, less creative)
- **topP**: 0.9 → 0.8 (narrower token selection)
- **maxOutputTokens**: 512 → 400 (more concise responses)

## Expected Behavior After Fix

### Before (Hallucinating):
```
Better Plan: Nf3 (Develops the knight and prepares to castle. Follow up with Qd2 and O-O-O for a strong attack.)
```
❌ Problem: Qd2 and O-O-O might not be legal in the position

### After (Concept-Focused):
```
Better Plan: Nf3 (Develops the knight to a central square, controls e5 and d4, and prepares kingside castling for improved king safety.)
```
✅ Solution: Only explains the strategic ideas behind Nf3, no additional moves suggested

## Files Modified
- `src/utils/geminiStockfishAnalysis.js` (lines 1807-1850)
  - Enhanced prompt with explicit constraints
  - Reduced temperature and token limits

## Testing Checklist
- [ ] Generate a new report with multiple weaknesses
- [ ] Check each "Better Plan" explanation
- [ ] Verify no illegal moves are suggested
- [ ] Confirm explanations focus on strategic concepts
- [ ] Ensure explanations are still helpful and insightful

## Technical Details

### Function: `enhanceExampleWithStockfishAndGemini()`
**Location**: `src/utils/geminiStockfishAnalysis.js:1789-1875`

**Purpose**: Takes a weakness example with Stockfish's best move and asks Gemini to explain WHY that move is best.

**Key Changes**:
1. Added "CRITICAL RULES" section to prompt
2. Provided examples of good vs bad explanations
3. Reduced temperature from 0.6 to 0.3
4. Reduced maxOutputTokens from 512 to 400

### Why This Works
- **Explicit Constraints**: Gemini is explicitly told NOT to suggest additional moves
- **Examples**: Showing good/bad examples helps Gemini understand the desired format
- **Lower Temperature**: Reduces randomness and hallucination
- **Concept Focus**: Shifts focus from move sequences to strategic ideas

## Rollback Instructions
If this causes issues, revert the changes:

```bash
git diff src/utils/geminiStockfishAnalysis.js
git checkout src/utils/geminiStockfishAnalysis.js
```

Or manually change:
1. Temperature back to 0.6
2. Remove the "CRITICAL RULES" section from the prompt

## Future Improvements
Consider these enhancements:
1. **Validate Moves**: Use chess.js to validate any moves Gemini suggests
2. **Post-Processing**: Strip out any chess notation (Nf3, Qd5, etc.) from responses
3. **Few-Shot Learning**: Provide actual example responses in the prompt
4. **Structured Output**: Use Gemini's structured output feature (if available) to enforce format