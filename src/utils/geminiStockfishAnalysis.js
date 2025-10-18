/**
 * Gemini + Stockfish Analysis Service
 * Combines Stockfish engine analysis with Gemini AI explanations
 */

import { interpretStockfishEvaluation, detectMistakes, categorizeMistakes } from './stockfishAnalysis';
import puzzleDataService from '../services/puzzleDataService';

// Ask Gemini for dynamic Phase Review statistics based on user's games
export const generatePhaseReviewFromGames = async (gamesSummary, playerInfo = {}) => {
  try {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') return null;
    if (!Array.isArray(gamesSummary) || gamesSummary.length === 0) return null;

    // Keep payload compact: take up to 12 games with minimal fields
    const compact = gamesSummary.slice(0, 12).map(g => ({
      gameNumber: g?.gameNumber,
      color: g?.color,
      result: g?.result,
      accuracy: typeof g?.accuracy === 'number' ? Math.round(g.accuracy) : undefined,
      moves: typeof g?.moves === 'number' ? g.moves : undefined,
      opening: g?.opening ? (g.opening.name || g.opening.eco || '') : (g?.eco || ''),
      phaseDrops: g?.phaseDrops // optional precomputed eval drops by phase if available
    }));

    const username = playerInfo?.username || 'the player';
    const skillLevel = playerInfo?.skillLevel || 'Unknown level';
    const averageRating = playerInfo?.averageRating;

    const prompt = `You are a world-class chess coach analyzing a player's recent games. Using the compact summary below, compute dynamic Phase Review statistics strictly from the player's games (not the opponent).
Return ONLY a strict JSON object with this schema and no extra text:
{
  "middlegame": {
    "overall": number, // 0-10
    "metrics": [
      { "label": "Positional Understanding", "score": number },
      { "label": "Tactical Awareness", "score": number },
      { "label": "Plan Formation", "score": number },
      { "label": "Piece Coordination", "score": number }
    ]
  },
  "endgame": {
    "overall": number, // 0-10
    "details": [
      { "label": string, "sample": string, "score": number } // e.g., "Pawn Endgames (N games, X% success)"
    ],
    "notes": string // brief, <= 140 chars
  }
}
Requirements:
- Base scores on patterns across the provided games: accuracy, results by phase, evaluation drops if available, and opening/phase transitions.
- If phaseDrops is present, weigh it strongly. Otherwise infer from accuracy, results, and typical phase complexity (openings leading to middlegames, long games into endgames).
- Scale scores 0-10. Keep labels exactly as specified for middlegame metrics. Keep endgame.details concise (3-4 items max).
- Audience: ${skillLevel}${averageRating ? ` (~${averageRating})` : ''}.
Player: ${username}
Games Summary: ${JSON.stringify(compact)}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 600 } })
    });
    if (!response.ok) return null;

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse strict JSON block
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(text.slice(start, end + 1));

    // Basic validation & clamping
    const clamp01 = v => Math.max(0, Math.min(10, Math.round(Number(v) || 0)));
    if (parsed?.middlegame) {
      parsed.middlegame.overall = clamp01(parsed.middlegame.overall);
      if (Array.isArray(parsed.middlegame.metrics)) {
        parsed.middlegame.metrics = parsed.middlegame.metrics.map(m => ({
          label: m?.label || '',
          score: clamp01(m?.score)
        }));
      }
    }
    if (parsed?.endgame) {
      parsed.endgame.overall = clamp01(parsed.endgame.overall);
      if (Array.isArray(parsed.endgame.details)) {
        parsed.endgame.details = parsed.endgame.details.slice(0, 4).map(d => ({
          label: d?.label || '',
          sample: (d?.sample || '').toString().slice(0, 80),
          score: clamp01(d?.score)
        }));
      }
      if (parsed.endgame.notes && typeof parsed.endgame.notes === 'string') {
        parsed.endgame.notes = parsed.endgame.notes.trim();
        if (parsed.endgame.notes.length > 140) parsed.endgame.notes = parsed.endgame.notes.slice(0, 140).trim() + '…';
      }
    }

    return parsed;
  } catch (e) {
    console.warn('Gemini phase review generation failed:', e.message);
    return null;
  }
};

// Generate Gemini prompt for explaining Stockfish findings
const createStockfishExplanationPrompt = (mistakes, playerInfo, gameContext) => {
  const { username, skillLevel, averageRating, platform } = playerInfo;
  
  let prompt = `You are "Pawnsposes," a world-renowned chess Grandmaster and elite coach. You have just received detailed Stockfish engine analysis of ${username}'s chess games. Your task is to explain the engine findings in a way that helps the player improve.

**PLAYER CONTEXT:**
- Player: ${username} (${platform})
- Skill Level: ${skillLevel} ${averageRating ? `(~${averageRating} rating)` : ''}
- Games Analyzed: ${gameContext.totalGames}

**STOCKFISH ENGINE FINDINGS:**
IMPORTANT: The analysis below focuses ONLY on moves played by ${username}. Opponent moves are not analyzed.

The following mistakes were detected by Stockfish engine analysis of ${username}'s moves:

`;

  // Group mistakes by type
  const categorized = categorizeMistakes(mistakes);
  
  Object.entries(categorized).forEach(([category, categoryMistakes]) => {
    if (categoryMistakes.length === 0) return;
    
    prompt += `\n**${category.toUpperCase()} MISTAKES (${categoryMistakes.length} found):**\n`;
    
    categoryMistakes.slice(0, 3).forEach((mistake, index) => {
      const evalText = mistake.evaluation.description;
      const scoreDrop = (mistake.scoreDrop / 100).toFixed(1);
      
      prompt += `
${index + 1}. Game ${mistake.position.gameNumber || 'N/A'}, Move ${mistake.moveNumber} (${username} playing ${mistake.userColor || mistake.turn})
   Move Played: ${mistake.move}
   Mistake Type: ${mistake.mistakeType} (lost ${scoreDrop} pawns)
   Position After: ${evalText}
   Engine's Best: ${mistake.bestMove || 'N/A'}
   FEN: ${mistake.position.fen}
   
`;
    });
  });

  prompt += `
**YOUR ANALYSIS TASK:**
Based on these Stockfish engine findings, provide a comprehensive analysis in the following structure:

**RATING-APPROPRIATE ANALYSIS GUIDELINES:**
${averageRating >= 1500 ? `
- This is a ${skillLevel} player (${averageRating} rating) - focus on ADVANCED concepts
- Avoid basic opening principles, fundamental tactics, or elementary endgames
- Focus on: positional understanding, complex tactical patterns, strategic planning, calculation depth
- Weaknesses should address: piece coordination, pawn structure nuances, time management, opening preparation depth
` : `
- This is a ${skillLevel} player - focus on fundamental improvements
- Address basic tactical awareness, opening principles, and endgame fundamentals
- Focus on: pattern recognition, basic strategy, fundamental tactics
`}

1. **RECURRING WEAKNESS PATTERNS** (3 main weaknesses):
   For each weakness:
   - Give it a clear title appropriate for ${skillLevel} level (${averageRating ? `${averageRating} rating` : 'rating unknown'})
   - Titles must be conceptual (e.g., "Inefficient Piece Coordination"), not move/game references
   - Do NOT start weakness titles with "Game", "Move", or include parentheses like "(b3)"
   - Explain WHY this pattern keeps occurring based on the engine analysis
   - Provide 1–3 concise bullet examples in a separate "Examples" sublist under each weakness
   - Examples should be formatted like: "Game [number], Move [number] ([move played]): [what went wrong]"
   - ENSURE DIVERSITY: Select examples from different move numbers (early, middle, late game) and both colors (white and black games)
   - AVOID REPETITION: Do not use the same move number or similar examples for different weaknesses
   - Provide concrete improvement advice appropriate for ${skillLevel} level
   - Include an explicit "Action Plan:" line (1–2 lines, max ~220 chars) with concrete practice/checklist steps tailored to this weakness
 

2. **ENGINE-BASED INSIGHTS:**
   - What does the engine analysis reveal about the player's calculation depth?
   - Which game phases show the most evaluation drops?
   - Are mistakes more frequent in tactical or positional situations?

3. **IMPROVEMENT RECOMMENDATIONS:**
   Based on the engine findings, suggest:
   - Specific training methods to address the identified weaknesses
   - Calculation exercises for the most common mistake types
   - Study materials (openings, endgames, tactics) relevant to the findings

**EXPLANATION STYLE:**
- Use clear, encouraging language appropriate for ${skillLevel} level
- Reference the specific Stockfish evaluations and best moves
- Focus on patterns rather than individual mistakes
- Provide actionable advice that addresses the root causes

Remember: The engine doesn't lie. These evaluations show exactly where improvements are needed. Help the player understand not just WHAT went wrong, but WHY it went wrong and HOW to fix it.`;

  return prompt;
};

// Call Gemini API for recurring weaknesses — Gemini-only, one example per weakness
export const explainStockfishFindings = async (_mistakes, playerInfo, gameContext) => {
  console.log('🎯 explainStockfishFindings called - starting Gemini analysis');
  // Always use full-games Gemini flow for recurring weaknesses
  const result = await generateReportFromGeminiFullGames(playerInfo, gameContext);
  if (!result) throw new Error('Gemini full-games analysis failed');
  console.log('✅ explainStockfishFindings completed, returning weaknesses');
  return result.geminiFullReport.recurringWeaknessesSection;
};

// Suggest a master game for positional study based on calculated weaknesses
export const suggestMasterGameForWeaknesses = async (weaknesses) => {
  try {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') return null;
    if (!Array.isArray(weaknesses) || weaknesses.length === 0) return null;

    // Reduce payload: only pass top 2 weaknesses (title + short desc)
    const compact = weaknesses.slice(0, 2).map(w => ({
      title: w?.title || '',
      description: (w?.description || '').slice(0, 400)
    }));

    const prompt = `You are a world-class chess coach. Based on these player weaknesses, suggest ONE famous master game for positional study that best addresses the main issues.
Return ONLY a compact JSON object with these fields and no extra text:
{
  "title": string,             // Game title (e.g., "Karpov vs. Unzicker, Nice 1974")
  "players": string,           // "White vs Black"
  "event": string,             // Event or source
  "year": number,              // Year
  "eco": string,               // Opening code or family (optional)
  "reason": string,            // Why this game is ideal for the weaknesses (ULTRA-CONCISE: single sentence, <= 140 characters)
  "link": string               // A public study or game URL (e.g., lichess.org study or chessgames.com game)
}
Critically: Choose a game that directly targets the listed weaknesses. Do NOT default to generic classics.
Explicitly avoid suggesting "Karpov vs. Spassky" unless it is clearly the best match for the weaknesses.
Keep the "reason" VERY SHORT so it fits nicely in a report card.
Weaknesses: ${JSON.stringify(compact)}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 300 } })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Try to parse JSON directly; fallback to lenient parsing
    const tryParse = (t) => {
      try {
        const start = t.indexOf('{');
        const end = t.lastIndexOf('}');
        if (start >= 0 && end > start) {
          return JSON.parse(t.slice(start, end + 1));
        }
        return null;
      } catch {
        return null;
      }
    };

    const parsed = tryParse(text);
    if (parsed && (parsed.title || parsed.players || parsed.link)) {
      if (parsed.reason && typeof parsed.reason === 'string') {
        parsed.reason = parsed.reason.trim();
        if (parsed.reason.length > 140) parsed.reason = parsed.reason.slice(0, 140).trim() + '…';
      }
      return parsed;
    }

    // No fallback parsing: require valid structured JSON
    return null;
  } catch (e) {
    console.warn('Gemini positional study suggestion failed:', e.message);
    return null;
  }
};

// Generate a personalized, weakness-aware actionable improvement plan
export const generateActionPlanFromWeaknesses = async (weaknesses, playerInfo = {}) => {
  try {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') return null;
    if (!Array.isArray(weaknesses) || weaknesses.length === 0) return null;

    // Compact payload: top 5 weaknesses (title + short description)
    const compact = weaknesses.slice(0, 5).map(w => ({
      title: (w?.title || '').toString().slice(0, 80),
      description: (w?.description || w?.subtitle || w?.recommendation || '').toString().slice(0, 400)
    }));

    const { username, skillLevel, averageRating } = playerInfo || {};

    const prompt = `You are a world-class chess coach. Based on the player's weaknesses, create a 3-step mental checklist they can use BEFORE and DURING every game.

Return ONLY strict JSON with this schema and nothing else:
{
  "items": [
    {
      "title": string, // A catchy rule name (e.g., "The Pawn Shield Rule", "The 10-Second Blunder Check")
      "plan": string   // The actionable mental rule (2-3 sentences, <= 280 chars; concrete, specific, easy to remember)
    }
  ]
}

Rules:
- Return EXACTLY 3 items (3-step mental checklist).
- Each item should be a MENTAL RULE or HABIT the player can apply in every game.
- Make each rule SPECIFIC and ACTIONABLE (not generic advice).
- Base the rules on the player's actual weaknesses: ${compact.map(w => w.title).join(', ')}.
- Use directive, memorable language (e.g., "Before pushing a pawn near your king, state out loud what threat it stops. If you can't, don't push it.")
- Tailor depth to ${skillLevel || 'Unknown level'}${averageRating ? ` (~${averageRating})` : ''}.
- Each rule should be something they can CHECK or DO during a game (not study advice).
- Make titles catchy and memorable (use quotes like "The X Rule" or "The Y Principle").

Examples of good mental checklist items:
- "The Pawn Shield Rule": Before pushing a pawn on the f, g, or h-file, you must state out loud the concrete piece it supports or the specific threat it neutralizes. If you can't, don't push it.
- "The 10-Second Blunder Check": Before making any move in a sharp position, pause for a full 10 seconds and ONLY look for your opponent's checks, captures, and threats.
- "The Consolidate First Principle": After your opponent makes a huge blunder, your next move's goal is not to attack more. It's to find a quiet move that improves your king safety or your worst piece.

Weaknesses: ${JSON.stringify(compact)}
Player: ${username || 'the player'}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 600 } })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;

    let parsed;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }

    // Normalize and validate
    if (!parsed || !Array.isArray(parsed.items)) return null;

    const clampText = (s, n) => (s || '').toString().trim().slice(0, n);
    const removeQuotes = (s) => s.replace(/^["']|["']$/g, ''); // Remove leading/trailing quotes

    // Extract exactly 3 mental checklist items
    const items = parsed.items.slice(0, 3).map(item => ({
      title: removeQuotes(clampText(item.title || '', 100)),
      plan: clampText(item.plan || item.advice || item.summary || '', 280)
    })).filter(i => i.title && i.plan);

    if (items.length === 0) return null;
    return { items };
  } catch (e) {
    console.warn('Gemini action plan generation failed:', e.message);
    return null;
  }
};

// Recommend a YouTube video that addresses the player's weaknesses as directly as possible
export const recommendYouTubeForWeaknesses = async (weaknesses, playerInfo = {}) => {
  try {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') return null;
    if (!Array.isArray(weaknesses) || weaknesses.length === 0) return null;

    // Reduce payload: ONLY the first (primary) weakness
    const compact = weaknesses.slice(0, 1).map(w => ({
      title: (w?.title || '').toString().slice(0, 80),
      description: (w?.description || w?.subtitle || w?.betterPlan || '').toString().slice(0, 300)
    }));

    const { username, skillLevel, averageRating } = playerInfo || {};

    const prompt = `You are a world-class chess coach and librarian. Recommend ONE YouTube video that best addresses the player's weaknesses.
Return ONLY strict JSON in this schema and nothing else:
{
  "primary": {
    "title": string,                     // Video title
    "url": string,                       // Official watch URL, e.g., https://www.youtube.com/watch?v=XXXXXXXXXXX
    "channel": string,                   // Channel name
    "reason": string,                    // <= 140 chars, why this video fits the weaknesses
    "coveredWeaknesses": string[],       // Weakness topics this video directly covers
    "coverageScore": number              // 0-100 how broadly it covers listed weaknesses
  },
  "alternates": [                        // Up to 2 safe fallbacks
    {
      "title": string,
      "url": string,
      "channel": string,
      "reason": string,
      "coveredWeaknesses": string[],
      "coverageScore": number
    }
  ]
}
Rules:
- ALWAYS search with the term "chess" appended to each weakness topic (e.g., "${compact[0]?.title || 'weakness'} chess").
- The video MUST be chess-related. Reject any non-chess content.
The target AUDIENCE is 1500+ rated players; avoid beginner/intro content.
- Prefer videos labelled intermediate/advanced or covering deeper concepts (strategic plans, calculation depth, typical middlegame/endgame structures for the topic).
- The video MUST be publicly available on YouTube now (avoid private/unlisted/removed).
- Prefer reliable chess channels (GothamChess, Hanging Pawns, ChessNetwork, Chessable, ChessBase India, Agadmator, John Bartholomew) when relevant.
- Choose a video that covers as many of the listed weaknesses as possible without being generic.
- Language: English. Length target 8-40 minutes. Avoid clickbait; prioritize structured lessons.
- Tailor depth: ${skillLevel || 'Unknown level'}${averageRating ? ` (~${averageRating})` : ''}.
- Output strictly valid JSON with the exact keys above. No extra commentary.
Weaknesses: ${JSON.stringify(compact)}
Player: ${username || 'the player'}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 600 }
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Strict JSON extraction
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    let parsed;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }

    // Validate candidates
    const isValidYouTubeUrl = (url) => {
      if (!url || typeof url !== 'string') return false;
      const m = url.match(/^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[&#?].*)?$/);
      return !!m;
    };

    const normalize = (c) => {
      if (!c) return null;
      const item = {
        title: (c.title || '').toString().trim().slice(0, 160),
        url: (c.url || '').toString().trim(),
        channel: (c.channel || '').toString().trim().slice(0, 100),
        reason: (c.reason || '').toString().trim().slice(0, 140),
        coveredWeaknesses: Array.isArray(c.coveredWeaknesses) ? c.coveredWeaknesses.map(s => s.toString().slice(0, 60)).slice(0, 6) : [],
        coverageScore: Math.max(0, Math.min(100, Number(c.coverageScore) || 0)),
        durationSeconds: Number(c.durationSeconds) || null,
        isShort: Boolean(c.isShort)
      };
      // Reject non-standard URLs, Shorts, and videos outside 8–40 minutes
      if (!isValidYouTubeUrl(item.url)) return null;
      const minSec = 8 * 60, maxSec = 40 * 60;
      if (item.isShort) return null;
      if (item.durationSeconds && (item.durationSeconds < minSec || item.durationSeconds > maxSec)) return null;
      return item;
    };

    const candidates = [];
    const primary = normalize(parsed?.primary);
    if (primary) candidates.push(primary);
    const alts = Array.isArray(parsed?.alternates) ? parsed.alternates.map(normalize).filter(Boolean) : [];
    candidates.push(...alts);

    if (candidates.length === 0) return null;

    const preferredChannels = new Set(['GothamChess','Hanging Pawns','ChessNetwork','Chessable','ChessBase India','agadmator','John Bartholomew','Chess Talk']);

    // Score: coverageScore + small boost for preferred channels
    candidates.sort((a, b) => {
      const aBoost = preferredChannels.has(a.channel) ? 5 : 0;
      const bBoost = preferredChannels.has(b.channel) ? 5 : 0;
      return (b.coverageScore + bBoost) - (a.coverageScore + aBoost);
    });

    return { candidates };
  } catch (e) {
    console.warn('Gemini YouTube recommendation failed:', e.message);
    return null;
  }
};

// Simple: ask Gemini to return the FIRST YouTube result for the first weakness
export const recommendFirstYouTubeResultForWeakness = async (weaknesses) => {
  try {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') return null;
    if (!Array.isArray(weaknesses) || weaknesses.length === 0) return null;

    const topic = (weaknesses?.[0]?.title || '').toString().slice(0, 80);

    const prompt = `Perform a YouTube search for: "${topic} chess".
Return ONLY strict JSON with the first organic, non-Shorts, educational video result (not ad, not Shorts, not playlist, not channel):
{"title": string, "url": "https://www.youtube.com/watch?v=VIDEO_ID"}
- URL must be an official watch URL with a valid 11-character video ID.
- Reject Shorts and any video under 8 minutes.
- No extra text.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 120 } })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(text.slice(start, end + 1));

    const url = (parsed?.url || '').toString().trim();
    const title = (parsed?.title || '').toString().trim();
    const m = url.match(/^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})(?:[&#?].*)?$/);
    if (!m) return null;

    return { title: title || 'Recommended Video', url };
  } catch (e) {
    console.warn('recommendFirstYouTubeResultForWeakness failed:', e.message);
    return null;
  }
};

// Analyze user's games with Gemini to determine most played opening and key insights
export const geminiMostPlayedOpeningAndInsights = async (games, playerInfo = {}) => {
  try {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') return null;
    if (!Array.isArray(games) || games.length === 0) return null;

    const username = (playerInfo?.username || '').toString();

    // Local normalization to reduce "Unknown" cases and give Gemini clear stats
    const getBaseOpeningName = (fullName) => {
      if (!fullName || typeof fullName !== 'string') return 'Unknown';
      const s = fullName;
      if (s.includes('Queens Gambit')) return 'Queens Gambit';
      if (s.includes('Italian Game') || s.includes('Giuoco Piano') || s.includes('Guioco Piano')) return 'Italian Game';
      if (s.includes('Sicilian')) return 'Sicilian Defense';
      if (s.includes('Ruy Lopez') || s.includes('Spanish Game')) return 'Ruy Lopez';
      if (s.includes('French Defense') || s.includes('French Defence')) return 'French Defense';
      if (s.includes('Caro') && s.includes('Kann')) return 'Caro-Kann Defense';
      if (s.includes('Scandinavian')) return 'Scandinavian Defense';
      if (s.includes('London')) return 'London System';
      if (s.includes("King's Indian") || s.includes('Kings Indian')) return "King's Indian Defense";
      if (s.includes("Queen's Indian") || s.includes('Queens Indian')) return "Queen's Indian Defense";
      if (s.includes('Nimzo') && s.includes('Indian')) return 'Nimzo-Indian Defense';
      if (s.includes('English Opening') || s.includes('English')) return 'English Opening';
      if (s.includes('Four Knights')) return 'Four Knights Game';
      if (s.includes('Scotch')) return 'Scotch Game';
      if (s.includes('Vienna')) return 'Vienna Game';
      if (s.includes("King's Pawn") || s.includes('Kings Pawn') || s.includes('e4')) return "King's Pawn Game";
      if (s.includes("Queen's Pawn") || s.includes('Queens Pawn') || s.includes('d4')) return "Queen's Pawn Game";
      if (s.includes('Indian Game')) return 'Indian Game';
      if (s.includes('Center Game')) return 'Center Game';
      if (s.includes("Bishop's Opening") || s.includes('Bishops Opening')) return "Bishop's Opening";
      // default: first 2 words
      const words = s.split(' ');
      return words.length >= 2 ? words.slice(0, 2).join(' ') : s;
    };

    // Build compact + precomputed stats to guide Gemini
    const compact = games.slice(0, 100).map((g) => {
      const pgn = typeof g.pgn === 'string' ? g.pgn : '';
      const openingHeader = pgn ? (pgn.match(/\[Opening "([^"]+)"\]/)?.[1] || null) : null;
      const ecoHeader = pgn ? (pgn.match(/\[ECO "([^"]+)"\]/)?.[1] || null) : null;
      const ecoUrl = typeof g.eco === 'string' ? g.eco : null;
      const ecoFromUrl = ecoUrl ? ecoUrl.replace(/.*\/openings\//, '').replace(/-/g, ' ').replace(/\+/g, ' ').replace(/\?.*$/, '') : null;
      const rawOpening = openingHeader || ecoFromUrl || ecoHeader || '';
      const normalizedOpening = getBaseOpeningName(rawOpening);
      const moveCount = pgn ? Math.max(0, (pgn.match(/\d+\./g) || []).length) : (g.moveCount || null);
      const isWhite = username ? ((g.white?.username === username) || (g.gameInfo?.white === username)) : null;
      const isBlack = username ? ((g.black?.username === username) || (g.gameInfo?.black === username)) : null;
      const color = isWhite ? 'white' : (isBlack ? 'black' : null);
      const result = g.gameInfo?.result || g.result || (isWhite ? (g.white?.result || null) : (isBlack ? (g.black?.result || null) : null));
      const timeClass = g.time_class || g.timeClass || null;
      const userAcc = isWhite
        ? (g.accuracies?.white || g.white_accuracy || g.white?.accuracy || null)
        : (isBlack ? (g.accuracies?.black || g.black_accuracy || g.black?.accuracy || null) : null);
      return {
        openingHeader,
        ecoCode: ecoHeader,
        ecoUrl,
        normalizedOpening,
        color,
        result,
        moveCount,
        timeClass,
        accuracy: typeof userAcc === 'number' ? Math.round(userAcc) : null
      };
    });

    const openingCounts = compact.reduce((m, g) => {
      const k = g.normalizedOpening || 'Unknown';
      m[k] = (m[k] || 0) + 1;
      return m;
    }, {});

    const colorStats = compact.reduce((m, g) => {
      if (g.color) m[g.color] = (m[g.color] || 0) + 1;
      return m;
    }, {});

    const avgMoves = (() => {
      const arr = compact.map(g => g.moveCount).filter(n => typeof n === 'number' && n > 0);
      return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    })();

    // Extra quantitative stats to enable specific, professional insights
    const winRateByColor = (() => {
      const out = { white: null, black: null };
      ['white','black'].forEach(c => {
        const gamesC = compact.filter(g => g.color === c);
        const total = gamesC.length;
        if (!total) return;
        const wins = gamesC.filter(g => (g.result || '').toLowerCase() === 'win').length;
        out[c] = Math.round((wins / total) * 100);
      });
      return out;
    })();

    const winRateByTimeClass = (() => {
      const buckets = {};
      compact.forEach(g => {
        const t = g.timeClass || 'unknown';
        buckets[t] = buckets[t] || { w: 0, n: 0 };
        buckets[t].n += 1;
        if ((g.result || '').toLowerCase() === 'win') buckets[t].w += 1;
      });
      const out = {};
      Object.entries(buckets).forEach(([k, v]) => {
        out[k] = v.n ? Math.round((v.w / v.n) * 100) : null;
      });
      return out;
    })();

    const avgAccuracy = (() => {
      const arr = compact.map(g => g.accuracy).filter(n => typeof n === 'number');
      return arr.length ? Math.round(arr.reduce((a,b)=>a+b,0) / arr.length) : null;
    })();

    const topOpenings = (() => {
      return Object.entries(openingCounts)
        .filter(([k]) => k && k !== 'Unknown')
        .sort((a,b) => b[1]-a[1])
        .slice(0,3)
        .map(([k,v]) => `${k} (${v})`);
    })();

    // Strongly guided prompt with explicit requirements for professional, quantified insights (1500+ audience)
    const prompt = `You are a world-class chess coach.
Using the provided stats, determine the player's MOST PLAYED OPENING FAMILY and produce EXACTLY 3 concise, professional insights about their gameplay and style.

RETURN STRICT JSON ONLY (no prose):
{
  "mostPlayedOpening": string,  // opening family, e.g., "Italian Game", "Sicilian Defense", "Queen's Gambit"
  "keyInsights": string[]       // exactly 3 concise bullets, each <= 140 chars
}

Rules (professional, 1500+ audience):
- Produce EXACTLY 3 insights in the following tone/style (do not copy wording; adapt to player data):
  - Tends to drift in closed or positional middlegames; needs to proactively create plans.
  - Can be overly aggressive in the opening, sacrificing material without always calculating fully.
  - Shows promise in recognizing tactical patterns but needs to deepen calculation ability.
- Insights MUST be conceptual and professional; avoid generic phrasing.
- Do NOT mention raw metrics (no percentages, win rates, accuracies, move counts, or color preferences).
- Avoid references to time controls unless essential to the concept.
- Tie insights to opening families and phase tendencies when visible.
- Avoid beginner framing; assume intermediate/advanced understanding.
- Do not repeat the same idea; each bullet should target a distinct aspect (planning in closed middlegames, opening risk/calculation discipline, tactical recognition vs depth).
- If data is insufficient for a claim, omit that claim rather than being vague.

Data:
openingCounts: ${JSON.stringify(openingCounts)}
colorStats: ${JSON.stringify(colorStats)}
winRateByColor: ${JSON.stringify(winRateByColor)}
winRateByTimeClass: ${JSON.stringify(winRateByTimeClass)}
avgAccuracy: ${JSON.stringify(avgAccuracy)}
avgMoves: ${JSON.stringify(avgMoves)}
topOpenings: ${JSON.stringify(topOpenings)}
sampleGames: ${JSON.stringify(compact.slice(0, 40))}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.15, maxOutputTokens: 400 } })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;

    let parsed;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }

    const mostPlayedOpening = (parsed?.mostPlayedOpening || '').toString().trim() ||
      (Object.entries(openingCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || 'Unknown');

    // Start with model output, then enforce conceptual style and exactly 3 bullets
    let keyInsights = Array.isArray(parsed?.keyInsights) ? parsed.keyInsights : [];
    keyInsights = keyInsights
      .map(s => s?.toString().trim())
      .filter(Boolean);

    // Filter out metric-heavy statements (percentages, win rate, accuracy, move counts, color prefs, time controls)
    const metricPatterns = [
      /%/,
      /\bwin rate\b/i,
      /\baccuracy\b/i,
      /\bmoves?\b/i,
      /\b(as )?white\b/i,
      /\b(as )?black\b/i,
      /\bblitz\b/i,
      /\brapid\b/i,
      /\bbullet\b/i,
      /\b\d{2,}\b/
    ];
    keyInsights = keyInsights.filter(s => !metricPatterns.some(rx => rx.test(s)));

    // Deduplicate (case-insensitive)
    const seen = new Set();
    keyInsights = keyInsights.filter(s => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Normalize length and cap to 3
    keyInsights = keyInsights
      .map(s => s.length > 140 ? s.slice(0, 137) + '…' : s)
      .slice(0, 3);

    // Fallbacks to ensure exactly 3 conceptual insights in desired style
    const fallbacks = [
      'Tends to drift in closed or positional middlegames; needs to proactively create plans.',
      'Can be overly aggressive in the opening, sacrificing material without always calculating fully.',
      'Shows promise in recognizing tactical patterns but needs to deepen calculation ability.'
    ];
    let fi = 0;
    while (keyInsights.length < 3 && fi < fallbacks.length) {
      const f = fallbacks[fi++];
      if (!keyInsights.find(s => s.toLowerCase() === f.toLowerCase())) keyInsights.push(f);
    }

    return { mostPlayedOpening, keyInsights };
  } catch (e) {
    console.warn('geminiMostPlayedOpeningAndInsights failed:', e.message);
    return null;
  }
};

// Parse Gemini's enhanced deep analysis response
const parseGeminiStockfishResponse = async (analysisText, originalMistakes) => {
  console.log('🔥 FINAL BOSS MODE: Bulletproof parsing activated!');
  
  const sections = {
    recurringWeaknesses: [],
    engineInsights: '',
    improvementRecommendations: '',
    rawAnalysis: analysisText
  };

  // FINAL BOSS DEBUG: Show ALL section headers in the response
  console.log('🔍 SCANNING FOR ALL SECTION HEADERS:');
  const allHeaders = analysisText.match(/\*\*[^*]+\*\*/g);
  if (allHeaders) {
    allHeaders.forEach((header, i) => console.log(`  [${i}] ${header}`));
  }
  
  // FINAL BOSS DEBUG: Show first weakness pattern 
  const firstWeaknessPattern = analysisText.match(/\*\s*\*\*[^*]+\*\*/);
  console.log('🔍 FIRST WEAKNESS PATTERN FOUND:', firstWeaknessPattern ? firstWeaknessPattern[0] : 'NONE');

  try {
    // FINAL BOSS: Try EVERY possible weakness section format
    let weaknessSection = null;
    let sectionFound = false;
    
    // Pattern 1: **1. RECURRING WEAKNESS PATTERNS:**
    weaknessSection = analysisText.match(/\*\*1\.\s*RECURRING WEAKNESS PATTERNS?:[^]*?(?=\*\*2\.\s*DEEP ENGINE|\*\*3\.\s*TARGETED|$)/i);
    if (weaknessSection) { console.log('✅ Found weakness section: Pattern 1'); sectionFound = true; }
    
    // Pattern 2: **RECURRING WEAKNESS PATTERNS:**
    if (!sectionFound) {
      weaknessSection = analysisText.match(/\*\*RECURRING WEAKNESS PATTERNS?:[^]*?(?=\*\*DEEP ENGINE|\*\*TARGETED|$)/i);
      if (weaknessSection) { console.log('✅ Found weakness section: Pattern 2'); sectionFound = true; }
    }
    
    // Pattern 3: **1. RECURRING WEAKNESS PATTERNS**
    if (!sectionFound) {
      weaknessSection = analysisText.match(/\*\*1\.\s*RECURRING WEAKNESS PATTERNS?\*\*[^]*?(?=\*\*2\.|\*\*DEEP ENGINE|\*\*TARGETED|$)/i);
      if (weaknessSection) { console.log('✅ Found weakness section: Pattern 3'); sectionFound = true; }
    }
    
    // Pattern 4: Any section containing "WEAKNESS" and "PATTERN"
    if (!sectionFound) {
      weaknessSection = analysisText.match(/\*\*[^*]*WEAKNESS[^*]*PATTERN[^*]*\*\*[^]*?(?=\*\*[^*]*ENGINE[^*]*\*\*|\*\*[^*]*IMPROVEMENT[^*]*\*\*|$)/i);
      if (weaknessSection) { console.log('✅ Found weakness section: Pattern 4 (fallback)'); sectionFound = true; }
    }

    if (sectionFound && weaknessSection) {
      console.log('🔥 WEAKNESS SECTION FOUND! Length:', weaknessSection[0].length);
      console.log('🔍 Section preview:', weaknessSection[0].substring(0, 300) + '...');
      
      // FINAL BOSS: Try EVERY possible weakness item pattern
      let weaknessMatches = null;
      
      // Pattern A: *   **a) Title: Description**
      weaknessMatches = weaknessSection[0].match(/\*\s*\*\*[a-c]\)\s*Title:\s*([^*]+)\*\*[^]*?(?=\*\s*\*\*[a-c]\)\s*Title:|$)/g);
      if (weaknessMatches) console.log('✅ Found weaknesses: Pattern A (a) Title:)');
      
      // Pattern B: *   **Weakness 1: Description**
      if (!weaknessMatches) {
        weaknessMatches = weaknessSection[0].match(/\*\s*\*\*Weakness\s+\d+:\s*([^*]+)\*\*[^]*?(?=\*\s*\*\*Weakness\s+\d+:|$)/g);
        if (weaknessMatches) console.log('✅ Found weaknesses: Pattern B (Weakness N:)');
      }
      
      // Pattern C: *   **Any Title**
      if (!weaknessMatches) {
        weaknessMatches = weaknessSection[0].match(/\*\s*\*\*([^*]+)\*\*[^]*?(?=\*\s*\*\*[^*]+\*\*|$)/g);
        if (weaknessMatches) console.log('✅ Found weaknesses: Pattern C (Any **)');
      }
      
      // Pattern D: Look for ANY bullet points with bold text
      if (!weaknessMatches) {
        weaknessMatches = weaknessSection[0].match(/\*[^*]*\*\*[^*]+\*\*[^]*?(?=\*[^*]*\*\*|$)/g);
        if (weaknessMatches) console.log('✅ Found weaknesses: Pattern D (Any bullet + bold)');
      }
      
      if (weaknessMatches && weaknessMatches.length > 0) {
        console.log(`🎯 FINAL SUCCESS: Found ${weaknessMatches.length} weakness matches!`);
        sections.recurringWeaknesses = weaknessMatches.slice(0, 3).map((match, index) => {
          // FINAL BOSS: Extract title from ANY format
          let title = `Weakness ${index + 1}`;
          
          // Try multiple title extraction patterns
          const patterns = [
            /\*\*[a-c]\)\s*Title:\s*([^*]+)\*\*/,
            /\*\*Weakness\s+\d+:\s*([^*]+)\*\*/,
            /\*\*([^*]+)\*\*/
          ];
          
          for (const pattern of patterns) {
            const titleMatch = match.match(pattern);
            if (titleMatch) {
              title = titleMatch[1].trim();
              break;
            }
          }
          
          // Clean description by removing all title patterns
          let description = match
            .replace(/\*\s*\*\*[a-c]\)\s*Title:[^*]+\*\*/, '')
            .replace(/\*\s*\*\*Weakness\s+\d+:[^*]+\*\*/, '')
            .replace(/\*\s*\*\*[^*]+\*\*/, '')
            .trim();
            
          return {
            title,
            description,
            category: categorizeWeaknessByContent(description),
            severity: calculateSeverityFromMistakes(originalMistakes, title),
            examples: extractExamplesFromDescription(description)
          };
        });
      } else {
        console.log('❌ NO WEAKNESS ITEMS FOUND in section!');
      }
    } else {
      console.log('💀 FINAL BOSS FAILURE: NO WEAKNESS SECTION FOUND WITH ANY PATTERN!');
    }

    // Fallback: if no structured sections found, try legacy format
    if (sections.recurringWeaknesses.length === 0) {
      console.log('Enhanced format not found, trying legacy weakness parsing...');
      const legacyWeaknesses = analysisText.match(/\d+\.\s*\*\*([^*]+)\*\*([^]*?)(?=\d+\.\s*\*\*|$)/g);
      if (legacyWeaknesses) {
        sections.recurringWeaknesses = legacyWeaknesses.slice(0, 3).map((match, index) => {
          const titleMatch = match.match(/\*\*([^*]+)\*\*/);
          const title = titleMatch ? titleMatch[1].trim() : `Weakness ${index + 1}`;
          const description = match.replace(/\d+\.\s*\*\*[^*]+\*\*/, '').trim();
          
          return {
            title,
            description,
            category: categorizeWeaknessByContent(description),
            severity: calculateSeverityFromMistakes(originalMistakes, title),
            examples: extractExamplesFromDescription(description)
          };
        });
      }
    }

    // Parse DEEP ENGINE INSIGHTS section (flexible matching)
    const insightsSection = analysisText.match(/\*\*2\.\s*DEEP ENGINE INSIGHTS?\*\*:?\s*([^]*?)(?=\*\*3\.\s*TARGETED|$)/i);
    if (insightsSection) {
      console.log('✅ Found DEEP ENGINE INSIGHTS section');
      sections.engineInsights = insightsSection[1].trim();
    } else {
      // Try alternative format without numbers
      const altInsightsSection = analysisText.match(/\*\*DEEP ENGINE INSIGHTS?\*\*:?\s*([^]*?)(?=\*\*TARGETED|$)/i);
      if (altInsightsSection) {
        sections.engineInsights = altInsightsSection[1].trim();
      } else {
        // Fallback to legacy format
        const legacyInsights = analysisText.match(/ENGINE-BASED INSIGHTS[:\s]*([^]*?)(?=IMPROVEMENT RECOMMENDATIONS|$)/i);
        if (legacyInsights) {
          sections.engineInsights = legacyInsights[1].trim();
        }
      }
    }

    // Parse TARGETED IMPROVEMENT RECOMMENDATIONS section (flexible matching)
    const recommendationsSection = analysisText.match(/\*\*3\.\s*TARGETED IMPROVEMENT RECOMMENDATIONS?\*\*:?\s*([^]*?)$/i);
    if (recommendationsSection) {
      console.log('✅ Found TARGETED IMPROVEMENT RECOMMENDATIONS section');
      sections.improvementRecommendations = recommendationsSection[1].trim();
    } else {
      // Try alternative format without numbers
      const altRecommendationsSection = analysisText.match(/\*\*TARGETED IMPROVEMENT RECOMMENDATIONS?\*\*:?\s*([^]*?)$/i);
      if (altRecommendationsSection) {
        sections.improvementRecommendations = altRecommendationsSection[1].trim();
      } else {
        // Fallback to legacy format
        const legacyRecommendations = analysisText.match(/IMPROVEMENT RECOMMENDATIONS[:\s]*([^]*?)$/i);
        if (legacyRecommendations) {
          sections.improvementRecommendations = legacyRecommendations[1].trim();
        }
      }
    }

  } catch (parseError) {
    console.warn('Error parsing Gemini response, using raw text:', parseError);
    sections.engineInsights = analysisText;
  }

  // Filter out generic section headings and example-like titles
  const blacklist = [
    'why this happens',
    'why this occurs',
    'why it happens',
    'why it occurs',
    'specific examples',
    'examples',
    'summary',
    'conclusion'
  ];
  sections.recurringWeaknesses = sections.recurringWeaknesses.filter(w => {
    const t = (w.title || '').toLowerCase().replace(/[:]+$/, '').trim();
    const isExampleLike = /\bgame\s+\d+/.test(t) || /\bmove\s+\d+/.test(t) || /^\d+\s*\./.test(t);
    return t && !blacklist.includes(t) && !isExampleLike;
  });

  // Enrich weaknesses with opponent context and concise explanation
  // Ensure diverse, real-game justification by using unique game:move per weakness
  const usedGameMoves = new Set();
  const usedGames = new Set();
  const usedMoveNumbers = new Set();
  const usedUniqueMistakes = new Set(); // guards against identical examples

  const parseExampleRef = (txt) => {
    if (!txt) return null;
    const m = txt.match(/Game\s+(\d+)[^,]*,\s*Move\s+(\d+)/i);
    if (m) return { gameNumber: parseInt(m[1], 10), moveNumber: parseInt(m[2], 10) };
    const m2 = txt.match(/Move\s+(\d+)/i);
    if (m2) return { gameNumber: null, moveNumber: parseInt(m2[1], 10) };
    return null;
  };

  const uniqueKeyForMistake = (m) => {
    const g = m.position?.gameNumber ?? 'N';
    const n = computeDisplayedMoveNumber(m) ?? 'M';
    const mv = m.move || 'U';
    return `${g}:${n}:${mv}`;
  };

  // Helper to ensure the selected mistake can produce a concrete example
  // Relaxed: allow missing bestMove/previousFen so we can diversify move numbers; we will fall back to UCI and omit SAN if needed
  const hasSufficientData = (m) => !!(m && m.move && computeDisplayedMoveNumber(m));
  const scoreMistakeForWeakness = (m, title) => (
    (title.includes('tactic') && (m.mistakeType === 'blunder' || m.mistakeCategory === 'tactical') ? 3 : 0) +
    (title.includes('opening') && m.mistakeCategory === 'opening' ? 2 : 0) +
    (title.includes('endgame') && m.mistakeCategory === 'endgame' ? 2 : 0) +
    (title.includes('positional') && (m.mistakeType === 'mistake' || m.mistakeCategory === 'positional') ? 2 : 0) +
    ((m.scoreDrop || 0) / 200)
  );
  const getCandidatesForWeakness = (mistakes, weakness) => {
    const title = (weakness.title || '').toLowerCase();
    return [...mistakes]
      .filter(m => hasSufficientData(m))
      .map(m => ({ m, s: scoreMistakeForWeakness(m, title) }))
      .sort((a, b) => b.s - a.s)
      .map(x => x.m);
  };

  // Build a compact prompt for Gemini to justify a specific mistake
  const buildMistakeJustificationPrompt = (m, { mv, userMoveColor, playedSAN, bestSAN, opponentName }) => {
    const beforeFEN = m.previousFen || '';
    const afterFEN = m.position?.fen || '';
    const pv = Array.isArray(m.principalVariation) ? m.principalVariation.slice(0, 6).join(' ') : '';

    // Signed evals from player's perspective
    const toPawns = (cp, color) => {
      if (typeof cp !== 'number') return '+0.0';
      const s = color === 'black' ? -cp : cp;
      const p = s / 100;
      return p >= 0 ? `+${p.toFixed(1)}` : p.toFixed(1);
    };
    const evalNow = toPawns(m.evaluation?.score, userMoveColor);
    const evalBefore = toPawns(m.previousEvaluation?.score, userMoveColor);

    // Move prefix like 16... for black, 16. for white
    const movePrefix = mv != null ? `${mv}${userMoveColor === 'black' ? '...' : '.'}` : '';

    // Clear instruction to return only the two labeled sentences in one line
    const instructions = `You are a strong chess coach. Justify why the player's move is a mistake using the position context and propose the better plan.
Return EXACTLY one line in this format (no extra text):
Mistake: ${movePrefix}${playedSAN || '...'} ?! (${evalNow}) <one concise sentence explaining why it was a mistake>. Better Plan: ${movePrefix}${bestSAN || '...'}! (${evalBefore}) <one concise sentence explaining why this plan is better>.`;

    const context = {
      moveNumber: mv,
      userMoveColor,
      opponent: opponentName || null,
      playedSAN: playedSAN || m.move,
      bestSAN: bestSAN || m.bestMove,
      evalNow,
      evalBefore,
      uciPlayed: m.move,
      uciBest: m.bestMove,
      principalVariation: pv
    };

    return `${instructions}

Context:
- FEN before: ${beforeFEN}
- FEN after: ${afterFEN}
- UCI played: ${m.move}
- UCI best: ${m.bestMove}
- PV: ${pv}`;
  };

  // Send one representative mistake to Gemini to obtain a refined justification line
  const refineMistakeExampleWithGemini = async (m, meta) => {
    try {
      const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
      if (!apiKey || apiKey === 'your_gemini_api_key_here') return null;

      const prompt = buildMistakeJustificationPrompt(m, meta);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 256 }
        })
      });
      if (!response.ok) return null;
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) return null;

      // Must contain both labels; keep it single line
      if (/^Mistake:\s*/i.test(text) && /\bBetter\s*Plan:\s*/i.test(text)) {
        return text.replace(/\s+/g, ' ').trim();
      }
      return null;
    } catch (_) {
      return null;
    }
  };

  // Rebuild recurring weaknesses with a diversity-first selector that mirrors the PDF style
  const buildRecurringWeaknessesFinal = async () => {
    const result = [];

    // Helper: more resilient displayed move number: recompute from FEN first to avoid stale values
    const displayedMove = (m) => {
      // First, derive from FEN/turn to avoid stale cached values
      const derived = computeDisplayedMoveNumber(m);
      if (derived != null && !isNaN(derived)) return derived;
      // Fallback: use stored numbers if present
      const stored = (typeof m?.moveNumber === 'number' && !isNaN(m.moveNumber))
        ? m.moveNumber
        : (typeof m?.position?.moveNumber === 'number' && !isNaN(m.position.moveNumber))
          ? m.position.moveNumber
          : null;
      return stored != null ? stored : null;
    };

    // Phase buckets to spread examples across the game (Early/Mid/Late)
    const bucketFor = (mv) => {
      if (!mv || isNaN(mv)) return 1; // default to mid
      if (mv <= 12) return 0;        // early
      if (mv <= 24) return 1;        // mid
      return 2;                       // late
    };

    // Scoring for candidates with diversity and relevance
    const scoreCandidate = (m, weakness, targetBucket) => {
      const mv = displayedMove(m) ?? 0;
      const b = bucketFor(mv);
      const bucketBonus = 2 - Math.min(2, Math.abs(b - targetBucket)); // prefer closer bucket
      const title = (weakness.title || '').toLowerCase();
      const relevance = (
        (title.includes('tactic') && (m.mistakeType === 'blunder' || m.mistakeCategory === 'tactical') ? 3 : 0) +
        (title.includes('opening') && m.mistakeCategory === 'opening' ? 2 : 0) +
        (title.includes('endgame') && m.mistakeCategory === 'endgame' ? 2 : 0) +
        (title.includes('positional') && (m.mistakeType === 'mistake' || m.mistakeCategory === 'positional') ? 2 : 0)
      );
      const drop = (m.scoreDrop || 0) / 200; // magnitude of error
      return bucketBonus * 3 + relevance + drop;
    };

    // Build context + example lines to match the requested PDF-like style
    const buildContextAndExample = (m) => {
      const mv = displayedMove(m);
      const opponentName = getOpponentNameFromGameInfo(m.position?.gameInfo, m.userColor);
      const colorPlayed = m.userColor ? (m.userColor.charAt(0).toUpperCase() + m.userColor.slice(1)) : null;
      const playedSAN = formatPlayedMoveSAN(m);
      const bestSAN = formatBestMoveSAN(m);

      // Determine user's move color (who just moved)
      const userMoveColor = m.userColor || (m.turn === 'white' ? 'black' : 'white');

      // Helper: map mistake type to annotation
      const annotateMistake = (type) => {
        switch ((type || '').toLowerCase()) {
          case 'blunder': return '??';
          case 'mistake': return '?';
          case 'inaccuracy': return '?!';
          case 'missed_win': return '??';
          default: return '?';
        }
      };

      // Helper: evaluation shown from the player's perspective, in pawns with sign
      const formatUserEval = (evaluation, color) => {
        if (!evaluation || typeof evaluation.score !== 'number') return '+0.0';
        const cp = color === 'black' ? -evaluation.score : evaluation.score; // flip for black
        const pawns = cp / 100;
        return pawns >= 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
      };

      const mistakeEval = formatUserEval(m.evaluation, userMoveColor);
      const bestEval = formatUserEval(m.previousEvaluation, userMoveColor);
      const evalText = m.evaluation?.description || '';
      const bestEvalText = m.previousEvaluation?.description || '';

      const opponentContext = opponentName
        ? `vs. ${opponentName} (Move ${mv})${colorPlayed ? ` \nYou played: ${colorPlayed}` : ''}`
        : `(Move ${mv})${colorPlayed ? ` \nYou played: ${colorPlayed}` : ''}`;

      const movePrefix = mv != null ? `${mv}${userMoveColor === 'black' ? '...' : '.'}` : '';
      const mistakeLine = `${movePrefix}${playedSAN || '...'}${annotateMistake(m.mistakeType)} (${mistakeEval})${evalText ? ` ${evalText}` : ''}`;
      const betterPlanLine = `${movePrefix}${bestSAN || '...'}! (${bestEval})${bestEvalText ? ` ${bestEvalText}` : ''}`;

      const example = `Mistake: ${mistakeLine}\nBetter Plan: ${betterPlanLine}`;
      return { opponentContext, example };
    };

    // Prepare global trackers
    const usedGameMoves = new Set(); // "game:move" pairs
    const usedGames = new Set();
    const usedMoveNumbers = new Set();
    const usedUniqueMistakes = new Set();
    const usedUserColors = new Set();

    const weaknessCount = Math.min(sections.recurringWeaknesses.length, 3);
    const buckets = weaknessCount === 1 ? [1] : (weaknessCount === 2 ? [0, 2] : [0, 1, 2]);

    for (let i = 0; i < weaknessCount; i++) {
      const w = sections.recurringWeaknesses[i];
      const shortExplanation = trimToSentences(w.description || '', 3);
      const targetBucket = buckets[i] ?? 1;

      // Build ranked candidate list for this weakness
      const baseCandidates = getCandidatesForWeakness(originalMistakes, w).filter(m => !!(m && m.move && displayedMove(m)));

      // Try to map AI explicit references first
      const referenced = [];
      if (Array.isArray(w.examples) && w.examples.length > 0) {
        for (const ex of w.examples) {
          const ref = parseExampleRef(ex);
          if (!ref) continue;
          const m = originalMistakes.find(mk => {
            const sameGame = ref.gameNumber == null || mk.position?.gameNumber === ref.gameNumber;
            const sameMove = (displayedMove(mk) === ref.moveNumber);
            return sameGame && sameMove;
          });
          if (m && !usedUniqueMistakes.has(uniqueKeyForMistake(m)) && !!(m.move && displayedMove(m))) {
            referenced.push(m);
          }
        }
      }

      // Decide desired color to enforce alternation if possible
      const desiredColor = (() => {
        if (usedUserColors.size === 0) return null; // no preference for the first pick
        if (usedUserColors.has('white') && !usedUserColors.has('black')) return 'black';
        if (usedUserColors.has('black') && !usedUserColors.has('white')) return 'white';
        return null;
      })();

      const combined = [...new Set([...(referenced || []), ...baseCandidates])];
      // Rank with diversity-aware score and strongly penalize previously used move numbers/games
      const ranked = combined
        .map(m => {
          const mvn = displayedMove(m);
          const gm = m.position?.gameNumber;
          const key = `${gm ?? 'N'}:${mvn ?? 'M'}`;
          const color = m.userColor || null; // rely only on actual user color when known
          let score = scoreCandidate(m, w, targetBucket);
          // Strongly discourage reusing the same move number across weaknesses
          if (usedMoveNumbers.has(mvn)) score -= 1000;
          // Discourage exact game:move reuse and same-game reuse
          if (usedGameMoves.has(key)) score -= 600;
          if (usedGames.has(gm)) score -= 250;
          // Strongly discourage reusing same user color; prefer alternation when desiredColor exists
          if (color && usedUserColors.has(color)) score -= 500;
          if (desiredColor && color && color === desiredColor) score += 200;
          return { m, s: score };
        })
        .sort((a, b) => b.s - a.s)
        .map(x => x.m);

      // Selection function honoring uniqueness
      const select = () => {
        // Pass 1: unused move, game, and user color; enforce desiredColor if set
        const p1 = ranked.find(m => {
          const mv = displayedMove(m);
          const gm = m.position?.gameNumber;
          const key = `${gm ?? 'N'}:${mv ?? 'M'}`;
          const color = m.userColor || null;
          const colorOk = desiredColor ? (color && color === desiredColor) : (!color || !usedUserColors.has(color));
          return !usedUniqueMistakes.has(uniqueKeyForMistake(m)) && !usedMoveNumbers.has(mv) && !usedGames.has(gm) && !usedGameMoves.has(key) && colorOk;
        });
        if (p1) return p1;
        // Pass 2: unused move number and color (even if game was used); enforce desiredColor if set
        const p2 = ranked.find(m => {
          const mv = displayedMove(m);
          const key = `${m.position?.gameNumber ?? 'N'}:${mv ?? 'M'}`;
          const color = m.userColor || null;
          const colorOk = desiredColor ? (color && color === desiredColor) : (!color || !usedUserColors.has(color));
          return !usedUniqueMistakes.has(uniqueKeyForMistake(m)) && !usedMoveNumbers.has(mv) && !usedGameMoves.has(key) && colorOk;
        });
        if (p2) return p2;
        // Pass 3: prefer a different move number even if other constraints are violated
        const p3 = ranked.find(m => {
          const mv = displayedMove(m);
          return !usedMoveNumbers.has(mv);
        });
        if (p3) return p3;
        // Pass 4: any unused mistake
        const p4 = ranked.find(m => !usedUniqueMistakes.has(uniqueKeyForMistake(m)));
        if (p4) return p4;
        // Fallback: first available
        return ranked[0] || null;
      };

      const representative = select();

      // Build final object
      let opponentContext = null;
      let example = null;
      if (representative) {
        const mv = displayedMove(representative);
        const gm = representative.position?.gameNumber;
        const gameKey = `${gm ?? 'N'}:${mv ?? 'M'}`;
        const color = representative.userColor || null; // only track actual user color for diversity
        usedUniqueMistakes.add(uniqueKeyForMistake(representative));
        if (gm != null) usedGames.add(gm);
        if (mv != null) usedMoveNumbers.add(mv);
        if (color) usedUserColors.add(color);
        usedGameMoves.add(gameKey);

        // Local formatting first (fallback)
        const built = buildContextAndExample(representative);
        opponentContext = built.opponentContext;
        example = built.example;

        // Try Gemini refinement for a single-line enhanced justification
        const meta = {
          mv,
          userMoveColor: representative.userColor || (representative.turn === 'white' ? 'black' : 'white'),
          playedSAN: formatPlayedMoveSAN(representative),
          bestSAN: formatBestMoveSAN(representative),
          opponentName: getOpponentNameFromGameInfo(representative.position?.gameInfo, representative.userColor)
        };
        // Note: executed asynchronously but awaited within this build to keep API contained here
        // If the call fails or key is missing, we keep the original example
        try {
          // eslint-disable-next-line no-undef
          if (typeof fetch === 'function') {
            // Await so the final object includes refined example when available
            const refined = await refineMistakeExampleWithGemini(representative, meta);
            if (refined && /^Mistake:/i.test(refined)) {
              // Preserve our opponentContext; keep UI contract by inserting a newline before "Better Plan:"
              const formatted = refined.replace(/\s*Better\s*Plan:\s*/i, "\nBetter Plan: ");
              example = formatted;
            }
          }
        } catch (_) {}
      }

      // Extract Action Plan from AI text when present; fallback to local generator
      const extractActionPlan = (txt) => {
        if (!txt) return null;
        const m = txt.match(/Action\s*Plan:\s*([^\n]+)(?:\n|$)/i);
        if (m && m[1]) return m[1].trim();
        const firstLines = txt.split(/\n+/).slice(0, 3).map(s => s.trim());
        const cand = firstLines.find(s => /^(Practice|Identify|Before|Use|Adopt|Run|Evaluate|Prepare|Activate|Choose|Write|Count)\b/i.test(s));
        return cand || null;
      };

      const actionPlanFromAI = extractActionPlan(w.description);

      result.push({
        ...w,
        description: shortExplanation,
        actionPlan: actionPlanFromAI || generateActionPlanForWeakness(w.title, w.category),
        opponentContext,
        example
      });
    }

    return result;
  };

  sections.recurringWeaknesses = await buildRecurringWeaknessesFinal();

  console.log(`✅ Parsed ${sections.recurringWeaknesses.length} weaknesses from enhanced deep analysis`);
  return sections;
};

// ================= New: Full-game Gemini-driven report (no Stockfish example picking) =================
export const generateReportFromGeminiFullGames = async (playerInfo, gameContext, options = {}) => {
  console.log('🚀 generateReportFromGeminiFullGames called with:', { playerInfo, gameContext, options });
  
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.error('❌ Gemini API key not configured');
    throw new Error('Gemini API key not configured. Please add your API key to the .env file.');
  }
  
  console.log('✅ Gemini API key found, proceeding with analysis');

  const { username, platform, averageRating, skillLevel } = playerInfo || {};

  // 1) Load user games from local DB (do not change existing fetch/store flow)
  const games = await puzzleDataService.getUserGames(username, options.maxGames || 25);
  if (!Array.isArray(games) || games.length === 0) {
    throw new Error('No stored user games found for Gemini analysis. Fetch and store games first.');
  }

  // Also load stored user mistakes to ground examples if needed
  let userMistakes = [];
  try {
    userMistakes = await puzzleDataService.getUserMistakes(username, 500);
  } catch (e) {
    console.warn('Could not load user mistakes, will rely on games only:', e?.message);
  }

  // 2) Build compact payload of all games: meta + key positions already available
  // We avoid re-running Stockfish; we forward positions, moves, openings, and results
  const compactGames = games.map((g, idx) => ({
    gameNumber: idx + 1,
    gameId: g.gameId || g.url || `game-${idx + 1}`,
    result: g.result || g.outcome || null,
    playerColor: g.playerColor || null,
    player: username,
    opponent: g.opponent || g.opponentUsername || null,
    playerRating: g.playerRating || null,
    opponentRating: g.opponentRating || null,
    eco: g.eco || g.opening?.eco || null,
    opening: g.opening?.name || g.openingName || null,
    pgn: g.pgn || null,
    moves: g.moves || g.pgn || null,
    accuracyData: g.accuracyData ? {
      white: g.accuracyData.white || null,
      black: g.accuracyData.black || null,
      analysis: Array.isArray(g.accuracyData.analysis) ? g.accuracyData.analysis.slice(0, 60) : undefined
    } : undefined,
    // If you already store key FENs/positions in your pipeline, include them; otherwise Gemini can derive from moves
    keyPositions: g.keyPositions || undefined
  }));

  // Helper: parse PGN/moves and build user move index with FENs
  const buildGameIndex = () => {
    const index = new Map();
    for (const cg of compactGames) {
      const chess = new Chess();
      let loaded = false;
      if (cg.pgn) {
        try { loaded = chess.loadPgn(cg.pgn, { sloppy: true }); } catch {}
      }
      if (!loaded && cg.moves && typeof cg.moves === 'string') {
        // Attempt to treat moves string as SAN tokens
        chess.reset();
        const tokens = cg.moves.split(/\s+/).filter(Boolean);
        for (const tok of tokens) {
          try { chess.move(tok, { sloppy: true }); } catch { /* ignore parse errors */ }
        }
      }
      // Replay to collect per-halfmove snapshots
      const replay = new Chess();
      if (cg.pgn) {
        try { replay.loadPgn(cg.pgn, { sloppy: true }); } catch {}
      } else {
        // If we couldn't load, use history from the previous attempt
        const h2 = chess.history({ verbose: true });
        replay.reset();
        for (const m of h2) replay.move(m, { sloppy: true });
      }
      // Now traverse again from start to collect SAN and FEN before/after each move
      const traversal = new Chess();
      const history = replay.history({ verbose: true });
      const entries = [];
      let fullmove = 1;
      let ply = 1;
      for (const mv of history) {
        const color = mv.color === 'w' ? 'white' : 'black';
        const fenBefore = traversal.fen();
        traversal.move(mv, { sloppy: true });
        const fenAfter = traversal.fen();
        entries.push({
          color,
          fullmove,
          ply,
          san: mv.san,
          fenBefore,
          fenAfter,
        });
        if (color === 'black') fullmove += 1; // fullmove increments after black
        ply += 1;
      }
      index.set(cg.gameNumber, {
        playerColor: cg.playerColor,
        entries,
        gameId: cg.gameId,
      });
    }
    return index;
  };

  const gameIndex = buildGameIndex();

  // Attach detailed move snapshots with FEN data to each compact game for Gemini grounding
  compactGames.forEach((game) => {
    const info = gameIndex.get(game.gameNumber);
    if (info && Array.isArray(info.entries)) {
      game.playerColor = game.playerColor || info.playerColor;
      game.movesWithFen = info.entries.map((entry) => ({
        color: entry.color,
        moveNumber: entry.fullmove,
        ply: entry.ply,
        san: entry.san,
        fenBefore: entry.fenBefore,
        fenAfter: entry.fenAfter,
      }));
    }
  });

  // 3) Compose strict JSON-only prompt modeled after prompt.txt
  const safeName = username || 'Player';
  const skill = skillLevel || 'Unknown';
  const ratingText = averageRating ? ` (~${averageRating})` : '';

  const prompt = `Give me analysis like Pawnsposes AI for these games.\n\n` +
`You are \"Pawnsposes,\" a world-renowned chess Grandmaster (FIDE 2650+) and elite coach. Your analysis is insightful, practical, and deeply psychological. You uncover flawed thinking patterns behind positional mistakes and help players build resilient plans.\n` +
`Base every conclusion ONLY on the provided JSON payload. It contains full PGNs plus per-move FEN snapshots in \\\"movesWithFen\\\" (fenBefore/fenAfter). Do not fabricate moves, evaluations, or outcomes.\n\n` +
`USER CONTEXT: ${safeName} on ${platform || 'unknown'}${ratingText}, Skill: ${skill}.\n\n` +
`OUTPUT REQUIREMENTS: Return STRICT JSON only (no Markdown, no commentary) using this schema:\n` +
`{\n` +
`  \"recurringWeaknesses\": [\n` +
`    {\n` +
`      \"title\": string,\n` +
`      \"description\": string,\n` +
`      \"examples\": [\n` +
`        {\n` +
`          \"gameNumber\": number,\n` +
`          \"moveNumber\": number,\n` +
`          \"played\": string,\n` +
`          \"fen\": string,\n` +
`          \"justification\": string,\n` +
`          \"betterPlan\": string,\n` +
`          \"betterMove\": string\n` +
`        }\n` +
`      ]\n` +
`    }\n` +
`  ],\n` +
`  \"engineInsights\": string,\n` +
`  \"improvementRecommendations\": string\n` +
`}\n\n` +
`ANALYSIS STRUCTURE:\n` +
`- Provide EXACTLY 3 recurringWeaknesses. Titles must be conceptual and descriptive (e.g., outposts/weak squares, pawn breaks & pawn tension, trading good vs. bad pieces, exchange sacrifices, counter-attacking instincts, static vs. dynamic evaluation, space advantage handling, minority attacks, isolated queen pawn play, passed pawn conversion, evaluating critical positions, improving worst-placed piece, candidate-move generation & 3-4 move visualization).\n` +
`- Each weakness needs a detailed explanation of WHY it recurs, highlighting strategic/psychological habits rather than tactical blunders.\n` +
`- For every weakness, include 1 example. All examples must be strategic (no simple piece blunders) and reference the user's move at moveNumber >= 16.\n` +
`- CRITICAL: Use ONLY moves played by ${safeName}. Look at movesWithFen array and filter by playerColor to identify which moves belong to ${safeName}. NEVER use opponent moves.\n` +
`- CRITICAL: Always use fenBefore for the FEN field. The position must show the board BEFORE the user made their move, so they can see where they should have played the better move. Never use fenAfter.\n` +
`- CRITICAL: The "played" field must contain the EXACT SAN move that ${safeName} actually played (from movesWithFen where color matches playerColor). Verify this is the user's move, not the opponent's.\n` +
`- CRITICAL: The "betterMove" field will be replaced with Stockfish's top engine recommendation during post-processing. You can suggest a move, but it will be overridden with the actual Stockfish analysis. Focus on making the justification and betterPlan accurate.\n` +
`- CRITICAL: Do NOT generate hypothetical or impossible moves. All moves in the "played" field must be actual moves from the game data. The system will validate and correct the betterMove field with Stockfish's analysis.\n` +
`- Each example must include: gameNumber, moveNumber (the full move number where ${safeName} played), the SAN move played (the actual move ${safeName} played), a concise justification of the strategic error with specific square names and piece references, a betterPlan describing the correct strategic approach, and a single betterMove suggestion (will be replaced with Stockfish's top move).\n` +
`- Strict game diversity: do not reuse a gameNumber across different weaknesses. If there are insufficient games, reduce the number of examples instead.\n` +
`- Make examples concrete and specific: reference actual piece positions (e.g., "knight on f6", "bishop on c4"), square names (e.g., "d5", "e4"), and clear strategic concepts. Avoid vague descriptions like "poor piece placement" - instead say "knight misplaced on a5 instead of the superior outpost on d5".\n\n` +
`ENGINE INSIGHTS:\n` +
`- Summarize how the user's evaluations shift across middlegame/endgame phases, their calculation depth, and whether their problems arise in tactical or positional settings. Reference recurring themes you saw in the games.\n\n` +
`IMPROVEMENT RECOMMENDATIONS:\n` +
`- Deliver concrete training advice (study plans, exercises, model games) tailored to the identified weaknesses. Keep it actionable, encouraging, and professional.\n\n` +
`STYLE CONSTRAINTS:\n` +
`- Tone: encouraging but direct, professional coach addressing a 1300-2600 audience.\n` +
`- Stay concise. No bullet markers beyond the JSON structure. No extra prose outside the JSON object.\n\n` +
`GAMES JSON:\n
**CRITICAL LANGUAGE REQUIREMENTS:**
1. Use SOPHISTICATED, HIGH-LEVEL chess terminology throughout
2. Weakness titles must be DESCRIPTIVE and capture the PSYCHOLOGICAL/STRATEGIC essence
3. Examples: "Impulsive Pawn Pushes That Weaken King Safety", "Critical Lapses in Tactical Vision Under Pressure", "Premature Commitments Before Securing Central Control", "Neglecting Prophylactic Measures in Sharp Positions"
4. Avoid generic titles like "Pawn Structure Issues" or "Bad Piece Placement"
5. Use advanced concepts: prophylaxis, zugzwang, weak color complexes, pawn tension, piece coordination, strategic imbalances, space advantage conversion, blockade strategy, minority attacks, etc.
6. Write explanations that reveal DEEP UNDERSTANDING of positional chess
7. Focus on the THOUGHT PROCESS failure, not just the move itself

**CONTENT REQUIREMENTS:**
1. Provide exactly 3 recurring weaknesses
2. Each weakness must have 1 concrete example from DIFFERENT games
3. Examples must be STRATEGIC mistakes, not simple tactical blunders
4. Focus on positional chess concepts that players rated 2000-2600 struggle with
5. Concepts to emphasize: weak squares/outposts, prophylactic thinking, pawn breaks and tension, piece coordination, space advantage, minority attacks, color complex weaknesses, converting advantages, defensive resources, king safety in complex positions
6. Return ONLY valid JSON, no additional text

Begin your analysis now.` + JSON.stringify(compactGames);

  // 4) Call Gemini
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, topP: 0.9, maxOutputTokens: 4096 }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Gemini returned no JSON');

  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new Error('Failed to parse Gemini JSON response');
  }

  // 5) Ground examples against actual user moves
  const gameIdToNumber = new Map(compactGames.map(g => [g.gameId, g.gameNumber]));
  const mistakesByGameNumber = new Map();
  for (const m of (userMistakes || [])) {
    const gnum = gameIdToNumber.get(m.gameId);
    if (!gnum) continue;
    if (!mistakesByGameNumber.has(gnum)) mistakesByGameNumber.set(gnum, []);
    mistakesByGameNumber.get(gnum).push(m);
  }

  const getUserMoveAt = (gnum, moveNumber) => {
    const gi = gameIndex.get(gnum);
    if (!gi || !gi.playerColor) return null;
    
    // Find the move entry for the user at the specified move number
    const entry = gi.entries.find(e => e.fullmove === Number(moveNumber) && e.color === gi.playerColor);
    
    // If not found, also try looking for half-moves (in case moveNumber refers to half-moves)
    if (!entry) {
      // For debugging: log available moves for this game
      console.log(`Debug: Game ${gnum}, looking for move ${moveNumber}, player color: ${gi.playerColor}`);
      console.log(`Available moves:`, gi.entries.map(e => `${e.fullmove}${e.color === 'white' ? '' : '...'} ${e.san}`));
    }
    
    return entry || null;
  };

  const groundExamples = (w, usedGames = new Set()) => {
    console.log(`\n=== Grounding examples for weakness: "${w.title}" ===`);
    console.log(`Used games so far:`, Array.from(usedGames));
    
    const raw = Array.isArray(w.examples) ? w.examples : [];
    console.log(`Raw examples from Gemini:`, raw.map(ex => `Game ${ex.gameNumber}, Move ${ex.moveNumber}`));
    
    const filtered = raw.filter(ex => Number(ex?.moveNumber) >= 16);
    const src = filtered.length ? filtered : raw;
    const out = [];

    // First pass: prioritize examples from unused games with valid user moves
    console.log(`\n--- First pass: Looking for unused games with valid user moves ---`);
    for (const ex of src) {
      const gnum = Number(ex?.gameNumber);
      const mv = Number(ex?.moveNumber);
      
      console.log(`Checking example: Game ${gnum}, Move ${mv}`);
      
      if (!gnum || !mv) {
        console.log(`  -> Skipped: Invalid game number or move number`);
        continue;
      }
      
      if (usedGames.has(gnum)) {
        console.log(`  -> Skipped: Game ${gnum} already used`);
        continue;
      }
      
      const userMove = getUserMoveAt(gnum, mv);
      if (userMove) {
        console.log(`  -> ✓ Valid user move found: ${userMove.san}`);
        
        // Find the corresponding mistake to get Stockfish's best move
        const mistakes = mistakesByGameNumber.get(gnum) || [];
        const matchingMistake = mistakes.find(m => Number(m.moveNumber) === mv);
        
        // CRITICAL: Always use Stockfish's best move, never Gemini's suggestion
        const stockfishBestMove = matchingMistake?.bestMove || '';
        
        // Validate that the best move is not empty
        if (!stockfishBestMove) {
          console.log(`  -> Warning: No Stockfish best move found for Game ${gnum}, Move ${mv}`);
        } else {
          console.log(`  -> ✓ Stockfish best move: ${stockfishBestMove}`);
        }
        
        // Validate that the played move matches what Gemini suggested (for accuracy check)
        if (ex.played && ex.played !== userMove.san) {
          console.log(`  -> ⚠️ Gemini suggested wrong move: "${ex.played}" vs actual: "${userMove.san}"`);
        }
        
        out.push({
          gameNumber: gnum,
          moveNumber: mv,
          played: userMove.san, // enforce real played SAN (user's actual move)
          fen: userMove.fenBefore, // CRITICAL: Use fenBefore to show position before the move
          justification: ex.justification || '',
          betterPlan: ex.betterPlan || '',
          betterMove: stockfishBestMove, // CRITICAL: Use ONLY Stockfish's top recommendation
          playerColor: gameIndex.get(gnum)?.playerColor || 'unknown',
          centipawnLoss: matchingMistake?.scoreDrop || 0
        });
        usedGames.add(gnum); // Mark this game as used
        console.log(`  -> Game ${gnum} marked as used. Used games now:`, Array.from(usedGames));
        if (out.length >= 3) break; // Limit to 3 examples per weakness
      } else {
        console.log(`  -> Skipped: No valid user move found at Game ${gnum}, Move ${mv}`);
      }
    }

    // Second pass: if we need more examples, use mistakes from unused games
    console.log(`\n--- Second pass: Looking for mistakes from unused games (current count: ${out.length}) ---`);
    if (out.length < 2) {
      for (const [gnum, mistakes] of mistakesByGameNumber.entries()) {
        if (usedGames.has(gnum)) {
          console.log(`  -> Skipped Game ${gnum}: already used`);
          continue;
        }
        
        const m = mistakes.find(mm => Number(mm.moveNumber) >= 16);
        if (m) {
          console.log(`  -> ✓ Found mistake in Game ${gnum}, Move ${m.moveNumber}: ${m.move || m.playerMove}`);
          
          // Get the user's actual move from the game index
          const userMove = getUserMoveAt(gnum, m.moveNumber);
          const playedMove = userMove?.san || m.move || m.playerMove;
          const fenToUse = userMove?.fenBefore || m.previousFen || m.fen;
          
          // CRITICAL: Use Stockfish's best move from the mistake data
          const stockfishBestMove = m.bestMove || '';
          
          if (!stockfishBestMove) {
            console.log(`  -> Warning: No Stockfish best move in mistake data for Game ${gnum}, Move ${m.moveNumber}`);
          } else {
            console.log(`  -> ✓ Stockfish best move: ${stockfishBestMove}`);
          }
          
          out.push({
            gameNumber: gnum,
            moveNumber: m.moveNumber,
            played: playedMove, // User's actual move in SAN
            fen: fenToUse, // Position BEFORE the user's move
            justification: w.description ? w.description.slice(0, 120) : 'From user mistake record',
            betterPlan: '',
            betterMove: stockfishBestMove, // CRITICAL: Use ONLY Stockfish's top recommendation
            playerColor: gameIndex.get(gnum)?.playerColor || 'unknown',
            centipawnLoss: m.scoreDrop || 0
          });
          usedGames.add(gnum);
          console.log(`  -> Game ${gnum} marked as used. Used games now:`, Array.from(usedGames));
          if (out.length >= 3) break;
        }
      }
    }

    // Third pass: if still no examples, allow reuse but prioritize user moves
    console.log(`\n--- Third pass: Fallback with game reuse if needed (current count: ${out.length}) ---`);
    if (out.length === 0) {
      for (const ex of src) {
        const gnum = Number(ex?.gameNumber);
        const mv = Number(ex?.moveNumber);
        if (!gnum || !mv) continue;
        
        const userMove = getUserMoveAt(gnum, mv);
        if (userMove) {
          console.log(`  -> ✓ Fallback: Using Game ${gnum}, Move ${mv}: ${userMove.san}`);
          
          // Find the corresponding mistake to get Stockfish's best move
          const mistakes = mistakesByGameNumber.get(gnum) || [];
          const matchingMistake = mistakes.find(m => Number(m.moveNumber) === mv);
          
          // CRITICAL: Use Stockfish's best move, never Gemini's suggestion
          const stockfishBestMove = matchingMistake?.bestMove || '';
          
          if (!stockfishBestMove) {
            console.log(`  -> Warning: No Stockfish best move found for fallback Game ${gnum}, Move ${mv}`);
          } else {
            console.log(`  -> ✓ Stockfish best move: ${stockfishBestMove}`);
          }
          
          out.push({
            gameNumber: gnum,
            moveNumber: mv,
            played: userMove.san, // User's actual move
            fen: userMove.fenBefore, // Position BEFORE the user's move
            justification: ex.justification || '',
            betterPlan: ex.betterPlan || '',
            betterMove: stockfishBestMove, // CRITICAL: Use ONLY Stockfish's top recommendation
            playerColor: gameIndex.get(gnum)?.playerColor || 'unknown',
            centipawnLoss: matchingMistake?.scoreDrop || 0
          });
          if (out.length >= 2) break;
        }
      }
    }

    // Ensure uniqueness by game:move and validate user moves
    const seen = new Set();
    const uniq = out.filter(ex => {
      const key = `${ex.gameNumber}:${ex.moveNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      
      // Validate that this is actually a user move
      const userMove = getUserMoveAt(ex.gameNumber, ex.moveNumber);
      return userMove !== null;
    });

    console.log(`\n--- Final result for "${w.title}": ${uniq.length} examples ---`);
    uniq.forEach((ex, i) => {
      console.log(`  ${i + 1}. Game ${ex.gameNumber}, Move ${ex.moveNumber}: ${ex.played} (${ex.playerColor})`);
    });
    console.log(`=== End grounding for "${w.title}" ===\n`);

    return uniq.slice(0, 3);
  };

  // NEW: Enhance examples with Stockfish analysis + Gemini explanations
  const enhanceExampleWithStockfishAndGemini = async (example, weaknessTitle) => {
    try {
      console.log(`\n🔍 Enhancing example: Game ${example.gameNumber}, Move ${example.moveNumber}`);
      
      // If we already have a betterMove from Stockfish, use it
      if (!example.betterMove || !example.fen) {
        console.log(`  ⚠️ Skipping: Missing betterMove or FEN`);
        return example;
      }

      // Now ask Gemini to explain WHY this Stockfish move is best
      const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
      if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        console.log(`  ⚠️ Skipping: No Gemini API key`);
        return example;
      }

      const prompt = `You are a world-class chess coach explaining a specific mistake to a student.

CONTEXT:
- Weakness being addressed: "${weaknessTitle}"
- Position (FEN): ${example.fen}
- Player's color: ${example.playerColor}
- Move played by student: ${example.played}
- Stockfish's best move: ${example.betterMove}
- Move number: ${example.moveNumber}

CRITICAL TASK - PROVIDE EXACTLY 2 LINES:
You must provide exactly 2 lines explaining why "${example.played}" was a bad move in this position.

Line 1: Describe what went wrong with the played move (what tactical/strategic idea was missed or what weakness it created)
Line 2: Explain the immediate consequence or what it allows the opponent to do

Return ONLY a JSON object with this exact structure:
{
  "justification": "Exactly 2 lines explaining why the move ${example.played} was bad. Line 1: [specific tactical/strategic flaw]. Line 2: [immediate consequence]. Reference specific squares and pieces. Example: 'This move fails to control the critical d5 square, allowing White's attack to build. It also weakens the f6 square and abandons defense of the kingside.'",
  "betterPlan": "Why ${example.betterMove} is superior: [specific strategic/tactical benefit with exact squares or pieces involved]"
}

ABSOLUTE REQUIREMENTS:
- justification MUST be exactly 2 sentences/lines
- Reference SPECIFIC squares (e.g., d5, f6, e4) and SPECIFIC pieces (e.g., the rook, the knight)
- DO NOT suggest additional moves beyond ${example.betterMove}
- DO NOT use chess notation like Nf3, Qd5 EXCEPT when unavoidable for clarity
- Be concrete and specific, not vague
- Each line should be substantial and meaningful

STYLE GUIDELINES:
- Use sophisticated chess terminology (weak square, tempo, compensation, initiative, etc.)
- Reference specific board areas (kingside, queenside, center, long diagonal, etc.)
- Explain the CONCEPT and WHY it matters
- Make it educational and precise

Return ONLY valid JSON, no additional text.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, topP: 0.8, maxOutputTokens: 400 }
        })
      });

      if (!response.ok) {
        console.log(`  ❌ Gemini API error: ${response.status}`);
        return example;
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      
      if (start < 0 || end <= start) {
        console.log(`  ❌ No JSON in Gemini response`);
        return example;
      }

      const parsed = JSON.parse(text.slice(start, end + 1));
      
      console.log(`  ✅ Enhanced with Gemini explanation`);
      
      return {
        ...example,
        justification: parsed.justification || example.justification,
        betterPlan: parsed.betterPlan || example.betterPlan
      };
      
    } catch (error) {
      console.error(`  ❌ Failed to enhance example:`, error.message);
      return example; // Return original if enhancement fails
    }
  };

  // 6) Map parsed JSON to your existing UI contract, using grounded examples
  const recurringWeaknesses = Array.isArray(parsed.recurringWeaknesses) ? parsed.recurringWeaknesses.slice(0, 3) : [];

  // Track used games across all weaknesses to ensure diversity
  const globalUsedGames = new Set();
  
  console.log(`\n🎯 STARTING EXAMPLE GROUNDING FOR ${recurringWeaknesses.length} WEAKNESSES`);
  console.log(`Available games:`, compactGames.map(g => g.gameNumber));
  
  // Process weaknesses and enhance examples with Stockfish + Gemini
  const recurringWeaknessesSection = [];
  for (let index = 0; index < recurringWeaknesses.length; index++) {
    const w = recurringWeaknesses[index];
    console.log(`\n📋 Processing weakness ${index + 1}: "${w.title}"`);
    const grounded = groundExamples(w, globalUsedGames);
    
    // Enhance each example with Gemini explanations of Stockfish's best moves
    console.log(`\n🚀 Enhancing ${grounded.length} examples with Stockfish + Gemini explanations...`);
    const enhancedExamples = [];
    for (const ex of grounded) {
      const enhanced = await enhanceExampleWithStockfishAndGemini(ex, w.title);
      enhancedExamples.push(enhanced);
    }
    
    const top = enhancedExamples[0];
    
    const result = {
      title: w.title || 'Weakness',
      description: w.description || '',
      category: categorizeWeaknessByContent(w.description || w.title || ''),
      opponentContext: null,
      example: top ? `Mistake: ${top.played || ''} (${top.justification || ''})\nBetter Plan: ${top.betterMove || ''} (${top.betterPlan || ''})` : null,
      examples: enhancedExamples.map(ex => ({
        gameNumber: ex.gameNumber,
        moveNumber: ex.moveNumber,
        played: ex.played,
        move: ex.played, // For backward compatibility
        fen: ex.fen,
        justification: ex.justification,
        explanation: ex.justification, // Map to UI's expected field name
        betterPlan: ex.betterPlan,
        superiorPlan: ex.betterPlan, // Map to UI's expected field name
        betterMove: ex.betterMove,
        playerColor: ex.playerColor
      })),
      // Add superiorPlan at weakness level for backward compatibility
      superiorPlan: enhancedExamples.length > 0 ? enhancedExamples[0].betterPlan : null,
      explanation: w.description, // Map description to explanation for UI
      actionPlan: generateActionPlanForWeakness(w.title, categorizeWeaknessByContent(w.description || w.title || ''))
    };
    
    console.log(`✅ Weakness "${w.title}" processed with ${enhancedExamples.length} enhanced examples`);
    recurringWeaknessesSection.push(result);
  }
  
  // Final validation: ensure no game is used in multiple weaknesses
  console.log(`\n🔍 FINAL VALIDATION: Checking for game diversity across weaknesses`);
  const allUsedGames = new Set();
  let hasDuplicates = false;
  
  recurringWeaknessesSection.forEach((weakness, wIndex) => {
    console.log(`\nWeakness ${wIndex + 1}: "${weakness.title}"`);
    weakness.examples.forEach((ex, eIndex) => {
      const gameKey = ex.gameNumber;
      console.log(`  Example ${eIndex + 1}: Game ${gameKey}, Move ${ex.moveNumber} (${ex.played})`);
      
      if (allUsedGames.has(gameKey)) {
        console.warn(`  ⚠️  DUPLICATE GAME DETECTED: Game ${gameKey} used in multiple weaknesses!`);
        hasDuplicates = true;
      } else {
        allUsedGames.add(gameKey);
      }
    });
  });
  
  if (hasDuplicates) {
    console.warn(`\n❌ GAME DIVERSITY ISSUE DETECTED - Some games are used in multiple weaknesses`);
  } else {
    console.log(`\n✅ GAME DIVERSITY VALIDATED - All examples use different games across weaknesses`);
  }
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`- Total weaknesses: ${recurringWeaknessesSection.length}`);
  console.log(`- Total examples: ${recurringWeaknessesSection.reduce((sum, w) => sum + w.examples.length, 0)}`);
  console.log(`- Unique games used: ${allUsedGames.size}`);
  console.log(`- Games available: ${compactGames.length}`);
  console.log(`🎯 EXAMPLE GROUNDING COMPLETE\n`);

  const result = {
    geminiFullReport: {
      raw: parsed,
      recurringWeaknessesSection,
      engineInsights: parsed.engineInsights || '',
      improvementRecommendations: parsed.improvementRecommendations || ''
    }
  };

  return result;
};

// Convenience: return sections object that matches existing UI expectations
export const generateFullReportSectionsFromGames = async (playerInfo, gameContext, options = {}) => {
  const full = await generateReportFromGeminiFullGames(playerInfo, gameContext, options);
  const rw = full.geminiFullReport.recurringWeaknessesSection || [];
  return {
    recurringWeaknesses: rw,
    engineInsights: full.geminiFullReport.engineInsights,
    improvementRecommendations: full.geminiFullReport.improvementRecommendations
  };
};

// Helper functions for parsing
const categorizeWeaknessByContent = (description) => {
  const lowerDesc = description.toLowerCase();
  
  if (lowerDesc.includes('tactical') || lowerDesc.includes('combination') || lowerDesc.includes('tactic')) {
    return 'tactical';
  } else if (lowerDesc.includes('endgame') || lowerDesc.includes('ending')) {
    return 'endgame';
  } else if (lowerDesc.includes('opening') || lowerDesc.includes('development')) {
    return 'opening';
  } else if (lowerDesc.includes('positional') || lowerDesc.includes('structure') || lowerDesc.includes('plan')) {
    return 'positional';
  } else {
    return 'general';
  }
};

function generateActionPlanForWeakness(title, category) {
  const t = (title || '').toLowerCase();
  const c = (category || '').toLowerCase();

  if (/prophylactic|prophylaxis|preventive/.test(t)) {
    return "Before each move, list 3 opponent threats and choose a move that neutralizes the most dangerous; recheck after your top 2 candidates.";
  }
  if (/trade|exchange|swap/.test(t)) {
    return "Before any exchange, evaluate pawn structure, piece activity, king safety, and imbalances; ask: 'Am I trading an active piece for a passive one?'";
  }
  if (/passed pawn|passer|outside passer|pawn race/.test(t)) {
    return "When a passed pawn exists, apply 'blockade–stop–push–support'; count tempi to queening and place the rook behind the passer.";
  }
  if (/piece activity|inactive|passive piece|coordination/.test(t) || c === 'positional') {
    return "During calculation, run an activity scan: in each line, identify which piece improves/worsens; prefer lines that activate your worst piece.";
  }
  if (/calculation|calc|depth|visualization|blunder[- ]?check/.test(t)) {
    return "Use candidates×3 and a blunder-check: calculate 3 plies deeper than comfort and verify all forcing replies before moving.";
  }
  if (/king safety|king exposure|attack readiness/.test(t)) {
    return "Before attacking, run a king-safety check: pawn cover, defenders, and opponent counterplay; avoid weakening pawn pushes without compensation.";
  }
  if (/pawn break|breakthrough|pawn lever|pawn push/.test(t) || (/pawn/.test(t) && c === 'positional')) {
    return "In every position, identify all pawn breaks for both sides in the next 2–3 moves; choose one to prepare with 2 supporting improving moves.";
  }
  if (/endgame|ending|technique/.test(t) || c === 'endgame') {
    return "In simplified positions, activate the king first and improve piece activity; practice opposition and converting an extra pawn in K+P endings.";
  }
  if (/opening|prep|preparation|development/.test(t) || c === 'opening') {
    return "Prepare the first 10 moves and plans in your 2 most common openings; study 3 model games noting typical breaks and piece placements.";
  }
  if (/time|clock|zeitnot|time trouble|time management/.test(t)) {
    return "Adopt a 10/30/60 rule: ~10s in known lines, ~30s typical, ~60s critical; commit after checking 2–3 candidates to avoid time sinks.";
  }
  if (/tactic|tactical|tactics/.test(t) || c === 'tactical') {
    return "Daily 20 puzzles with spaced repetition; before each move, run 'checks, captures, threats'; annotate missed motifs and review weekly.";
  }
  if (/plan|planning|strategy|strategic/.test(t)) {
    return "Use a plan framework: evaluate structure, worst piece, targets; choose a plan and write a 2–3 step sequence that improves the worst piece.";
  }

  return "Convert this theme into a routine: pick 2–3 candidates, write a 2–3 step plan, and verify your worst piece improves in the chosen line.";
}

const calculateSeverityFromMistakes = (mistakes, weaknessTitle) => {
  const lower = weaknessTitle.toLowerCase();
  const relatedMistakes = mistakes.filter(m => {
    if (lower.includes('tactic')) return m.mistakeType === 'blunder' || m.mistakeType === 'missed_tactic';
    if (lower.includes('opening')) return m.mistakeCategory === 'opening';
    if (lower.includes('endgame')) return m.mistakeCategory === 'endgame';
    if (lower.includes('positional') || lower.includes('structure') || lower.includes('plan')) return m.mistakeType === 'mistake' || m.mistakeCategory === 'positional';
    return true;
  });
  const blunders = relatedMistakes.filter(m => m.mistakeType === 'blunder').length;
  const mistakesCount = relatedMistakes.filter(m => m.mistakeType === 'mistake').length;
  if (blunders > 2) return 'high';
  if (blunders > 0 || mistakesCount > 3) return 'medium';
  return 'low';
};

const extractExamplesFromDescription = (description) => {
  // Extract move references like "Move 15", "17. Kh2", etc. Prefer SAN pattern
  const moveMatches = description.match(/(?:Game\s+\d+.*?Move\s+\d+\s*\([^)]+\)|\d+\.\s*[A-Za-z][a-z0-9+#=]*)/g);
  return moveMatches ? moveMatches.slice(0, 3) : [];
};

// Helpers to format weakness blocks with opponent context and sample
const trimToSentences = (text, maxSentences = 3) => {
  if (!text) return '';
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, maxSentences).join(' ');
};

const selectRepresentativeMistakeForWeakness = (mistakes, weakness, usedGameMoves = new Set(), usedGames = new Set(), usedMoveNumbers = new Set()) => {
  if (!Array.isArray(mistakes) || mistakes.length === 0) return null;
  const title = (weakness.title || '').toLowerCase();

  // Prefer mistakes from games not yet used
  const byGameUnused = mistakes.filter(m => !usedGames.has(m.position?.gameNumber));

  // Then enforce unique game:move pairs and unique move numbers across weaknesses
  const filterByMoveUnused = (arr) => arr.filter(m => {
    const moveNum = computeDisplayedMoveNumber(m);
    const key = `${m.position?.gameNumber || 'N'}:${moveNum || 'M'}`;
    return !usedGameMoves.has(key) && !usedMoveNumbers.has(moveNum);
  });

  let pool = filterByMoveUnused(byGameUnused);
  if (pool.length === 0) {
    const allByMoveUnused = filterByMoveUnused(mistakes);
    pool = allByMoveUnused.length > 0 ? allByMoveUnused : mistakes; // final fallback
  }

  const scored = pool.map(m => ({
    m,
    score: (
      (title.includes('tactic') && (m.mistakeType === 'blunder' || m.mistakeCategory === 'tactical') ? 3 : 0) +
      (title.includes('opening') && m.mistakeCategory === 'opening' ? 2 : 0) +
      (title.includes('endgame') && m.mistakeCategory === 'endgame' ? 2 : 0) +
      (title.includes('positional') && (m.mistakeType === 'mistake' || m.mistakeCategory === 'positional') ? 2 : 0) +
      (m.scoreDrop || 0) / 200 // prioritize larger eval drops
    )
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.m || null;
};

const getOpponentNameFromGameInfo = (gameInfo, userColor) => {
  if (!gameInfo) return null;
  // chess.com shape
  const white = gameInfo.white?.username || gameInfo.players?.white?.user?.id;
  const black = gameInfo.black?.username || gameInfo.players?.black?.user?.id;
  if (!white && !black) return null;
  if (userColor === 'white') return black || null;
  if (userColor === 'black') return white || null;
  // Fallback: prefer black as opponent name if exists
  return black || white || null;
};

// Compute accurate displayed move number from FEN and turn
const computeDisplayedMoveNumber = (mistakeOrPosition) => {
  try {
    const prevFen = mistakeOrPosition?.previousFen || mistakeOrPosition?.position?.previousFen;
    const currFen = mistakeOrPosition?.fen || mistakeOrPosition?.position?.fen;
    const turn = mistakeOrPosition?.turn || mistakeOrPosition?.position?.turn;
    const parseFullmove = (fen) => {
      const parts = (fen || '').split(' ');
      if (parts.length >= 6) {
        const n = parseInt(parts[5], 10);
        return isNaN(n) ? null : n;
      }
      return null;
    };

    // Preferred: use previous position's fullmove (represents the move being played)
    const prevFull = parseFullmove(prevFen);
    if (prevFull != null) return prevFull;

    // Fallback: derive from current FEN and side to move
    const currFull = parseFullmove(currFen);
    if (currFull != null) {
      const toMove = turn || (currFen ? currFen.split(' ')[1] : null);
      if (toMove === 'white') return Math.max(1, currFull - 1); // black just moved
      if (toMove === 'black') return currFull; // white just moved
      return currFull;
    }

    // Final fallback: stored moveNumber
    const mv = mistakeOrPosition?.moveNumber ?? mistakeOrPosition?.position?.moveNumber ?? null;
    return mv ?? null;
  } catch {
    return mistakeOrPosition?.moveNumber || mistakeOrPosition?.position?.moveNumber || null;
  }
};

// Convert moves to SAN for professional display
import { Chess } from 'chess.js';

const safeToSAN = (fenBefore, uciMove) => {
  if (!fenBefore || !uciMove) return null;
  try {
    const game = new Chess();
    game.load(fenBefore);
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove.length > 4 ? uciMove[4] : undefined;
    const moveObj = game.move({ from, to, promotion });
    return moveObj ? moveObj.san : null;
  } catch {
    return null;
  }
};

const formatPlayedMoveSAN = (mistake) => {
  // The move that was played led to current position; we need SAN of that move applied to previous FEN
  const san = safeToSAN(mistake.previousFen, mistake.move);
  return san || mistake.move || 'N/A';
};

const formatBestMoveSAN = (mistake) => {
  const san = safeToSAN(mistake.previousFen, mistake.bestMove);
  return san || mistake.bestMove || 'N/A';
};

// Enhanced main function for deep Stockfish + Gemini analysis
export const performDeepStockfishGeminiAnalysis = async (keyPositions, playerInfo, gameContext, options = {}) => {
  return legacyPerformDeepStockfishGeminiAnalysis(keyPositions, playerInfo, gameContext, options);
};

// Legacy kept for backwards compatibility; the original implementation moved below under this alias
const legacyPerformDeepStockfishGeminiAnalysis = async (keyPositions, playerInfo, gameContext, options = {}) => {
  const {
    maxPositions = 15,
    analysisDepth = 20, // Increased default depth for production-level analysis
    timePerPosition = 5000, // Increased time for deeper analysis
    onProgress = () => {},
    prioritizeKeyPositions = true
  } = options;

  // Ensure minimum depth for production analysis
  const actualDepth = Math.max(analysisDepth, 18);
  console.log(`🚀 Starting deep analysis (${actualDepth} moves depth) on ${Math.min(keyPositions.length, maxPositions)} key positions`);
  
  try {
    // Step 1: Import and initialize enhanced Stockfish analyzer
    const { default: stockfishAnalyzer } = await import('./stockfishAnalysis');
    
    onProgress({ 
      stage: 'initializing', 
      message: 'Initializing enhanced Stockfish engine...',
      progress: 5
    });
    
    await stockfishAnalyzer.initialize();
    
    // Step 2: Perform deep analysis on key positions
    onProgress({ 
      stage: 'deep_analyzing', 
      message: `Starting deep analysis (${actualDepth} moves depth)...`,
      progress: 10
    });
    
    const analyzedPositions = await stockfishAnalyzer.analyzePositions(keyPositions, {
      depth: actualDepth,
      timeLimit: timePerPosition,
      maxPositions,
      prioritizeKeyPositions,
      concurrency: 2, // Light concurrency: two engine workers
      onProgress: (progress) => {
        onProgress({
          stage: 'deep_analyzing',
          message: `Deep analysis: ${progress.message || `Position ${progress.current}/${progress.total}`}`,
          progress: 10 + (progress.current / progress.total) * 50 // 10-60% for deep Stockfish
        });
      }
    });

    // Step 3: Enhanced mistake detection with deep analysis data
    onProgress({ 
      stage: 'pattern_detection', 
      message: 'Detecting patterns with deep analysis data...',
      progress: 65
    });
    
    const mistakes = detectMistakes(analyzedPositions, playerInfo);
    const enhancedPatterns = analyzeDeepPatterns(analyzedPositions, mistakes, actualDepth);
    
    const qualityMetrics = calculateAnalysisQualityMetrics(analyzedPositions);
    console.log(`✅ Deep analysis: ${mistakes.length} mistakes found | Quality: ${qualityMetrics.avgQuality.toFixed(1)}/100 | Depth: ${qualityMetrics.avgDepth.toFixed(1)} moves`);

    // Step 4: Enhanced Gemini explanation with deep analysis context
    onProgress({ 
      stage: 'ai_explanation', 
      message: 'Getting enhanced AI explanation...',
      progress: 75
    });
    
    const geminiAnalysis = await explainDeepStockfishFindings(
      mistakes, 
      enhancedPatterns,
      analyzedPositions,
      qualityMetrics,
      playerInfo, 
      gameContext,
      { analysisDepth: actualDepth }
    );

    // Step 5: Compile comprehensive results
    onProgress({ 
      stage: 'finalizing', 
      message: 'Finalizing comprehensive analysis...',
      progress: 95
    });

    const finalResult = {
      deepStockfishAnalysis: {
        analyzedPositions,
        mistakes,
        enhancedPatterns,
        mistakesByCategory: categorizeMistakes(mistakes),
        totalPositionsAnalyzed: analyzedPositions.length,
        totalMistakesFound: mistakes.length,
        qualityMetrics
      },
      geminiExplanation: geminiAnalysis,
      recurringWeaknesses: geminiAnalysis.recurringWeaknesses,
      engineInsights: geminiAnalysis.engineInsights,
      improvementRecommendations: geminiAnalysis.improvementRecommendations,
      analysisMetadata: {
        analysisDate: new Date().toISOString(),
        engineDepth: actualDepth,
        positionsAnalyzed: analyzedPositions.length,
        averageAnalysisQuality: qualityMetrics.avgQuality,
        totalNodesAnalyzed: qualityMetrics.totalNodes,
        analysisVersion: '2.0-deep',
        playerInfo
      }
    };

    // Clean up Stockfish worker
    stockfishAnalyzer.terminate();

    onProgress({ stage: 'complete', message: 'Deep analysis complete!', progress: 100 });
    console.log('🎉 Deep analysis complete');
    
    return finalResult;

  } catch (error) {
    console.error('❌ Error in enhanced deep Stockfish + Gemini analysis:', error);
    throw error;
  }
};

// Legacy function for backward compatibility
export const performStockfishGeminiAnalysis = async (fenPositions, playerInfo, gameContext, options = {}) => {
  console.log('🔄 Redirecting to enhanced deep analysis...');
  return performDeepStockfishGeminiAnalysis(fenPositions, playerInfo, gameContext, {
    ...options,
    analysisDepth: Math.max(options.analysisDepth || 12, 18) // Ensure minimum depth
  });
};

// Enhanced pattern analysis using deep engine data
const analyzeDeepPatterns = (analyzedPositions, mistakes, analysisDepth) => {
  
  const patterns = {
    tacticalMissedOpportunities: [],
    evaluationSwings: [],
    timeManagementIssues: [],
    positionalMisjudgments: [],
    kingSafetyLapses: []
  };
  
  // Analyze each position with its deep analysis data
  analyzedPositions.forEach((position, index) => {
    if (!position.stockfishAnalysis) return;
    
    const analysis = position.stockfishAnalysis;
    const evaluation = analysis.evaluation;
    
    // Look for tactical opportunities based on depth and alternatives
    if (analysis.alternativeMoves && analysis.alternativeMoves.length > 1) {
      const bestEval = analysis.alternativeMoves[0].evaluation;
      const secondBest = analysis.alternativeMoves[1].evaluation;
      
      if (bestEval && secondBest) {
        const evalDiff = Math.abs((bestEval.value || 0) - (secondBest.value || 0));
        
        // Large evaluation difference suggests tactical opportunities
        if (evalDiff > 150) { // 1.5 pawns difference
          patterns.tacticalMissedOpportunities.push({
            position,
            evaluationDifference: evalDiff,
            bestMove: analysis.alternativeMoves[0].move,
            actualMove: position.move,
            depth: analysis.analysisDepth,
            reason: 'Significant tactical opportunity detected by deep analysis'
          });
        }
      }
    }
    
    // Analyze evaluation swings (significant changes in position evaluation)
    if (index > 0) {
      const prevPosition = analyzedPositions[index - 1];
      if (prevPosition.stockfishAnalysis?.evaluation && evaluation) {
        const currentScore = evaluation.value || 0;
        const prevScore = prevPosition.stockfishAnalysis.evaluation.value || 0;
        const swing = Math.abs(currentScore - prevScore);
        
        if (swing > 200) { // 2 pawns swing
          patterns.evaluationSwings.push({
            position,
            previousPosition: prevPosition,
            evaluationSwing: swing,
            depth: analysis.analysisDepth,
            reason: `Large evaluation swing detected: ${(swing / 100).toFixed(1)} pawns`
          });
        }
      }
    }
    
    // Analyze positional factors based on deep engine understanding
    if (analysis.principalVariation && analysis.principalVariation.length > 3) {
      // Look for positions where engine suggests complex maneuvers
      const complexManeuver = analysis.principalVariation.length > 6 && analysis.analysisDepth >= 18;
      
      if (complexManeuver && position.phase === 'middlegame') {
        patterns.positionalMisjudgments.push({
          position,
          reason: 'Deep analysis suggests complex positional play was needed',
          enginePlan: analysis.principalVariation.slice(0, 6),
          depth: analysis.analysisDepth
        });
      }
    }
    
    // King safety analysis (look for positions where king safety is critical)
    if (evaluation && Math.abs(evaluation.value || 0) > 100 && position.phase !== 'endgame') {
      // Check if the evaluation suggests king safety concerns
      const kingSafetyCritical = Math.abs(evaluation.value || 0) > 300 && analysis.analysisDepth >= 18;
      
      if (kingSafetyCritical) {
        patterns.kingSafetyLapses.push({
          position,
          evaluation: evaluation,
          reason: 'Deep analysis indicates critical king safety position',
          depth: analysis.analysisDepth
        });
      }
    }
  });
  

  
  return patterns;
};

// Calculate comprehensive analysis quality metrics
const calculateAnalysisQualityMetrics = (analyzedPositions) => {
  const metrics = {
    avgDepth: 0,
    avgQuality: 0,
    totalNodes: 0,
    avgNodesPerPosition: 0,
    depthConsistency: 0,
    positionsWithFullDepth: 0
  };
  
  if (analyzedPositions.length === 0) return metrics;
  
  let totalDepth = 0;
  let totalQuality = 0;
  let totalNodes = 0;
  let validAnalyses = 0;
  let depthVariance = 0;
  
  analyzedPositions.forEach(position => {
    if (position.stockfishAnalysis && position.analysisMetadata) {
      const depth = position.analysisMetadata.analysisDepth || 0;
      const quality = position.analysisMetadata.analysisQuality || 0;
      const nodes = position.analysisMetadata.nodeCount || 0;
      
      totalDepth += depth;
      totalQuality += quality;
      totalNodes += nodes;
      validAnalyses++;
      
      if (depth >= 18) {
        metrics.positionsWithFullDepth++;
      }
    }
  });
  
  if (validAnalyses > 0) {
    metrics.avgDepth = totalDepth / validAnalyses;
    metrics.avgQuality = totalQuality / validAnalyses;
    metrics.avgNodesPerPosition = totalNodes / validAnalyses;
  }
  
  metrics.totalNodes = totalNodes;
  metrics.depthConsistency = (metrics.positionsWithFullDepth / validAnalyses) * 100;
  
  return metrics;
};

// Enhanced Gemini explanation function that incorporates deep analysis data
const explainDeepStockfishFindings = async (mistakes, enhancedPatterns, analyzedPositions, qualityMetrics, playerInfo, gameContext, analysisOptions = {}) => {
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('Gemini API key not configured. Please add your API key to the .env file.');
  }

  if (mistakes.length === 0 && Object.values(enhancedPatterns).every(arr => arr.length === 0)) {
    return {
      recurringWeaknesses: [],
      engineInsights: "Deep analysis shows excellent play with no significant patterns of weakness detected.",
      improvementRecommendations: "Continue practicing and analyzing your games. Consider challenging yourself with stronger opponents or more complex positions."
    };
  }

  const prompt = createDeepAnalysisPrompt(mistakes, enhancedPatterns, analyzedPositions, qualityMetrics, playerInfo, gameContext, analysisOptions);
  
  console.log('🚀 Sending deep Stockfish findings to Gemini for enhanced explanation...');
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response structure from Gemini');
    }

    const analysisText = data.candidates[0].content.parts[0].text;
    console.log('✅ Enhanced Gemini explanation received, length:', analysisText.length);
    
    // Parse the enhanced response
    return parseGeminiStockfishResponse(analysisText, mistakes);
    
  } catch (error) {
    console.error('❌ Error getting enhanced Gemini explanation:', error);
    throw error;
  }
};

// Create enhanced prompt incorporating deep analysis data
const createDeepAnalysisPrompt = (mistakes, enhancedPatterns, analyzedPositions, qualityMetrics, playerInfo, gameContext, analysisOptions) => {
  const { username, skillLevel, averageRating, platform } = playerInfo;
  const { analysisDepth } = analysisOptions;
  
  let prompt = `You are "Pawnsposes," a world-renowned chess Grandmaster and elite coach. You have just received DEEP ENGINE ANALYSIS (${analysisDepth}-move depth) of ${username}'s chess games using advanced Stockfish analysis. This analysis goes far beyond surface-level pattern recognition.

**PLAYER CONTEXT:**
- Player: ${username} (${platform})
- Skill Level: ${skillLevel} ${averageRating ? `(~${averageRating} rating)` : ''}
- Games Analyzed: ${gameContext.totalGames}

**DEEP ANALYSIS QUALITY METRICS:**
- Average Analysis Depth: ${qualityMetrics.avgDepth.toFixed(1)} moves
- Analysis Quality Score: ${qualityMetrics.avgQuality.toFixed(1)}/100
- Total Nodes Analyzed: ${qualityMetrics.totalNodes.toLocaleString()}
- Positions with Full Depth: ${qualityMetrics.depthConsistency.toFixed(1)}%

**STOCKFISH DEEP ENGINE FINDINGS:**
The following analysis is based on ${analysisDepth}-move deep engine evaluation of key positions:

`;

  // Add traditional mistakes
  if (mistakes.length > 0) {
    const categorized = categorizeMistakes(mistakes);
    
    Object.entries(categorized).forEach(([category, categoryMistakes]) => {
      if (categoryMistakes.length === 0) return;
      
      prompt += `\n**${category.toUpperCase()} MISTAKES (${categoryMistakes.length} found):**\n`;
      
      categoryMistakes.slice(0, 3).forEach((mistake, index) => {
        const evalText = mistake.evaluation.description;
        const scoreDrop = (mistake.scoreDrop / 100).toFixed(1);
        
        prompt += `
${index + 1}. Game ${mistake.position.gameNumber || 'N/A'}, Move ${mistake.moveNumber} (${username} playing ${mistake.userColor || mistake.turn})
   Move Played: ${mistake.move}
   Mistake Type: ${mistake.mistakeType} (lost ${scoreDrop} pawns)
   Position After: ${evalText}
   Engine's Best: ${mistake.bestMove || 'N/A'}
   Analysis Depth: ${mistake.position.analysisMetadata?.analysisDepth || 'N/A'} moves
   
`;
      });
    });
  }

  // Add enhanced pattern findings
  prompt += `\n**DEEP PATTERN ANALYSIS:**\n`;
  
  if (enhancedPatterns.tacticalMissedOpportunities.length > 0) {
    prompt += `\nTactical Opportunities Missed (${enhancedPatterns.tacticalMissedOpportunities.length}):\n`;
    enhancedPatterns.tacticalMissedOpportunities.slice(0, 2).forEach((pattern, i) => {
      prompt += `${i + 1}. Move ${pattern.position.moveNumber}: Missed ${(pattern.evaluationDifference/100).toFixed(1)} pawn advantage\n`;
      prompt += `   Best: ${pattern.bestMove}, Played: ${pattern.actualMove} (Depth: ${pattern.depth})\n`;
    });
  }
  
  if (enhancedPatterns.evaluationSwings.length > 0) {
    prompt += `\nLarge Evaluation Swings (${enhancedPatterns.evaluationSwings.length}):\n`;
    enhancedPatterns.evaluationSwings.slice(0, 2).forEach((pattern, i) => {
      prompt += `${i + 1}. Move ${pattern.position.moveNumber}: ${(pattern.evaluationSwing/100).toFixed(1)} pawn swing\n`;
    });
  }

  prompt += `
**YOUR ENHANCED ANALYSIS TASK:**
Based on this DEEP ENGINE ANALYSIS (${analysisDepth}-move depth), provide a comprehensive analysis:

**RATING-APPROPRIATE ANALYSIS GUIDELINES:**
${averageRating >= 1500 ? `
- This is a ${skillLevel} player (${averageRating} rating) - focus on ADVANCED concepts revealed by deep analysis
- The ${analysisDepth}-move depth analysis reveals sophisticated patterns invisible to shorter analysis
- Focus on: deep calculation errors, complex positional misjudgments, advanced tactical patterns
- Address: calculation depth limitations, positional understanding gaps, strategic planning deficiencies
` : `
- This is a ${skillLevel} player - focus on fundamental improvements revealed by deep analysis
- The deep analysis confirms which basic concepts need reinforcement
- Focus on: pattern recognition improvement, fundamental tactical awareness, basic strategic understanding
`}

1. **RECURRING WEAKNESS PATTERNS** (exactly 3 weaknesses):
   Based on the ${analysisDepth}-move deep analysis, identify the 3 most critical recurring patterns.
   OUTPUT EXACTLY 3 ITEMS, NO MORE, NO LESS.
   For each weakness, USE THIS EXACT STRUCTURE:
   * **Weakness {i}: <Concise Title>**
     Description: 2–4 sentences explaining why this pattern occurs based on deep engine findings (do not use separate headings like "WHY it Occurs")
     Examples:
       - Game <number>, Move <number> (<SAN>): brief mistake summary; best was <SAN>
     Improvement Advice: 1–2 sentences of concrete training guidance tailored to ${skillLevel}
   RULES:
   - Titles must be conceptual (no "Game/Move" or numeric-only titles, no "WHY it Occurs" headings)
   - Each weakness must reference at least one concrete example from the analyzed games/patterns
   - Keep content concise and coach-like; avoid filler

2. **DEEP ENGINE INSIGHTS:**
   - What does the ${analysisDepth}-move analysis reveal about calculation depth?
   - Which complex patterns does the player consistently miss?
   - How do the deep analysis findings differ from surface-level observations?
   - What advanced concepts need development based on the engine's deep understanding?

3. **TARGETED IMPROVEMENT RECOMMENDATIONS:**
   Based on the deep analysis findings:
   - Specific training methods to address the deep-analysis-revealed weaknesses
   - Advanced calculation exercises based on the missed opportunities
   - Study recommendations targeting the sophisticated patterns identified

**EXPLANATION STYLE:**
- Emphasize insights that ONLY deep analysis could reveal
- Reference the analysis depth and quality metrics
- Focus on patterns that require ${analysisDepth}-move understanding
- Provide actionable advice based on the engine's deepest insights

The deep engine analysis provides unprecedented insight into the player's chess understanding. Use this data to provide coaching that goes beyond surface observations.`;

  return prompt;
};