/**
 * Gemini + Stockfish Analysis Service
 * Combines Stockfish engine analysis with Gemini AI explanations
 */

import { interpretStockfishEvaluation, detectMistakes, categorizeMistakes } from './stockfishAnalysis';

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
   - Examples should be formatted like: "Game 16, Move 17 (Kh2): [what went wrong]"
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

// Call Gemini API to explain Stockfish findings
export const explainStockfishFindings = async (mistakes, playerInfo, gameContext) => {
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('Gemini API key not configured. Please add your API key to the .env file.');
  }

  if (mistakes.length === 0) {
    return {
      recurringWeaknesses: [],
      engineInsights: "No significant mistakes detected by Stockfish analysis. Your play appears to be quite solid!",
      improvementRecommendations: "Continue practicing and analyzing your games to maintain this level of play."
    };
  }

  const prompt = createStockfishExplanationPrompt(mistakes, playerInfo, gameContext);
  
  console.log('Sending Stockfish findings to Gemini for explanation...');
  
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
    console.log('Gemini explanation received, length:', analysisText.length);
    
    // Parse the response into structured data
    return parseGeminiStockfishResponse(analysisText, mistakes);
    
  } catch (error) {
    console.error('Error getting Gemini explanation:', error);
    throw error;
  }
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
const parseGeminiStockfishResponse = (analysisText, originalMistakes) => {
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
  const hasSufficientData = (m) => !!(m && m.previousFen && m.move && m.bestMove && computeDisplayedMoveNumber(m));
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

  sections.recurringWeaknesses = sections.recurringWeaknesses.map(w => {
    const shortExplanation = trimToSentences(w.description || '', 3);

    // 1) Try to bind to any AI-provided example reference (Game X, Move Y)
    let representative = null;
    if (Array.isArray(w.examples) && w.examples.length > 0) {
      for (const ex of w.examples) {
        const ref = parseExampleRef(ex);
        if (ref) {
          const m = originalMistakes.find(mk => {
            const sameGame = ref.gameNumber == null || mk.position?.gameNumber === ref.gameNumber;
            const sameMove = computeDisplayedMoveNumber(mk) === ref.moveNumber;
            return sameGame && sameMove;
          });
          if (m && hasSufficientData(m) && !usedUniqueMistakes.has(uniqueKeyForMistake(m))) {
            representative = m;
            break;
          }
        }
      }
    }

    // 2) If none, select best candidate that is unused and has sufficient data
    if (!representative) {
      const candidates = getCandidatesForWeakness(originalMistakes, w);
      representative = candidates.find(m => !usedUniqueMistakes.has(uniqueKeyForMistake(m))) || null;
      // 3) If still none (all used), allow reuse of a candidate to avoid empty example
      if (!representative && candidates.length > 0) {
        representative = candidates[0];
      }
    }

    let opponentContext = null;
    let example = null;

    if (representative) {
      const key = uniqueKeyForMistake(representative);
      usedUniqueMistakes.add(key);

      const opponentName = getOpponentNameFromGameInfo(representative.position?.gameInfo, representative.userColor);
      const moveNum = computeDisplayedMoveNumber(representative);
      const gameKey = `${representative.position?.gameNumber || 'N'}:${moveNum || 'M'}`;
      usedGameMoves.add(gameKey);
      if (representative.position?.gameNumber) usedGames.add(representative.position.gameNumber);
      if (moveNum) usedMoveNumbers.add(moveNum);

      opponentContext = opponentName ? `vs ${opponentName} (Move ${moveNum})` : `(Move ${moveNum})`;
      const scoreDrop = ((representative.scoreDrop || 0) / 100).toFixed(1);
      example = `Game ${representative.position?.gameNumber || 'N/A'}, Move ${moveNum} (${formatPlayedMoveSAN(representative)}): ${representative.mistakeType} losing ${scoreDrop} pawns; best was ${formatBestMoveSAN(representative)}.`;
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

    return {
      ...w,
      description: shortExplanation,
      actionPlan: actionPlanFromAI || generateActionPlanForWeakness(w.title, w.category),
      opponentContext,
      example
    };
  });

  console.log(`✅ Parsed ${sections.recurringWeaknesses.length} weaknesses from enhanced deep analysis`);
  return sections;
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
    const fen = mistakeOrPosition?.previousFen || mistakeOrPosition?.position?.previousFen || mistakeOrPosition?.fen || mistakeOrPosition?.position?.fen;
    const turn = mistakeOrPosition?.turn || mistakeOrPosition?.position?.turn;
    if (fen) {
      const parts = fen.split(' ');
      if (parts.length >= 6) {
        const fullmove = parseInt(parts[5], 10);
        const toMove = turn || parts[1];
        if (!isNaN(fullmove)) {
          // Use previous FEN fullmove as the move just played
          return fullmove;
        }
      }
    }
    return mistakeOrPosition?.moveNumber || mistakeOrPosition?.position?.moveNumber || null;
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