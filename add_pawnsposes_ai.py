import re

# Read the file
with open(r'c:\pawnsposes\src\pages\Reports.js', 'r', encoding='utf-8') as f:
    content = f.read()

# New code to add
new_code = '''
// ========================================
// 🆕 PAWNSPOSES AI COMPLETE ANALYSIS
// ========================================

/**
 * Prepare games data with FEN + moves for Pawnsposes AI analysis
 */
const prepareGamesForPawnsposesAI = (games, fenData, formData) => {
  console.log('🎯 Preparing games for Pawnsposes AI analysis...');
  
  return games.map((game, index) => {
    const gameNumber = index + 1;
    const fenPositions = fenData[index]?.fenPositions || [];
    
    // Extract game metadata
    let gameInfo = {};
    if (formData.platform === 'chess.com') {
      gameInfo = {
        white: game.white?.username || 'Unknown',
        black: game.black?.username || 'Unknown',
        whiteRating: game.white?.rating || 0,
        blackRating: game.black?.rating || 0,
        result: game.white?.result === 'win' ? '1-0' : 
                game.black?.result === 'win' ? '0-1' : 
                game.white?.result === 'draw' ? '1/2-1/2' : 'Unknown',
        eco: game.eco || 'Unknown',
        timeControl: game.time_control || 'Unknown',
        url: game.url || ''
      };
    } else if (formData.platform === 'lichess') {
      gameInfo = {
        white: game.players?.white?.user?.name || 'Unknown',
        black: game.players?.black?.user?.name || 'Unknown',
        whiteRating: game.players?.white?.rating || 0,
        blackRating: game.players?.black?.rating || 0,
        result: game.winner === 'white' ? '1-0' : 
                game.winner === 'black' ? '0-1' : 
                !game.winner ? '1/2-1/2' : 'Unknown',
        eco: game.opening?.eco || 'Unknown',
        timeControl: game.speed || 'Unknown',
        url: game.url || ''
      };
    }

    // Determine user's color
    const isUserWhite = gameInfo.white === formData.username;
    const userColor = isUserWhite ? 'white' : 'black';
    const opponent = isUserWhite ? gameInfo.black : gameInfo.white;

    // Build moves list with FEN positions
    const movesWithFen = fenPositions.map(pos => ({
      moveNumber: pos.moveNumber,
      move: pos.move,
      fen: pos.fen
    }));

    return {
      gameNumber,
      white: gameInfo.white,
      black: gameInfo.black,
      whiteRating: gameInfo.whiteRating,
      blackRating: gameInfo.blackRating,
      result: gameInfo.result,
      eco: gameInfo.eco,
      timeControl: gameInfo.timeControl,
      url: gameInfo.url,
      userColor,
      opponent,
      moves: movesWithFen
    };
  });
};

/**
 * Create the Pawnsposes AI prompt
 */
const createPawnsposesAIPrompt = (gamesData, formData) => {
  const username = formData.username;
  const gamesText = gamesData.map(game => {
    const movesText = game.moves.map(m => 
      `Move ${m.moveNumber}: ${m.move} (FEN: ${m.fen})`
    ).join('\\n');
    
    return `
**GAME ${game.gameNumber}**
White: ${game.white} (${game.whiteRating})
Black: ${game.black} (${game.blackRating})
Result: ${game.result}
ECO: ${game.eco}
Time Control: ${game.timeControl}
User Color: ${game.userColor}
Opponent: ${game.opponent}

Moves:
${movesText}
`;
  }).join('\\n\\n---\\n\\n');

  return `You are "Pawnsposes," a world-renowned chess Grandmaster (FIDE 2650+) and elite coach. Your analysis is famous for being insightful, practical, and deeply psychological. You don't just point out tactical mistakes; you uncover the flawed thinking and recurring habits that hold players back. Your tone is encouraging but direct.

**USER PROMPT**
Analyze the games of the user '${username}'. The games are provided below with FEN positions and moves.

**GAMES DATA:**
${gamesText}

**ANALYSIS STRUCTURE:**

Return your analysis in the following JSON format:

{
  "executiveSummary": "A brief, encouraging but blunt paragraph summarizing the player's overall style and the key theme of this report.",
  
  "recurringWeaknesses": [
    {
      "title": "Clear, descriptive title (e.g., 'Weak Square Awareness', 'Pawn Break Timing', 'Trading Pieces Ineffectively')",
      "explanation": "Detailed explanation of why this is a weakness, explaining the long-term positional or strategic consequences.",
      "examples": [
        {
          "gameNumber": 1,
          "moveNumber": 15,
          "move": "15...g5?",
          "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          "whyMistake": "Explanation of why this move was a strategic mistake in this specific position.",
          "betterPlan": "Suggest the superior plan and explain the future idea (e.g., 'Exchange the bishop to permanently weaken dark squares')"
        }
      ]
    }
  ],
  
  "middlegameMastery": {
    "analysis": "Analyze the player's typical middlegame plans. Are they coherent? Do they correctly identify which side of the board to play on?",
    "keyConceptToStudy": "One key middlegame concept they need to study (e.g., 'Outposts and Weak Squares', 'Pawn Breaks and Tension', 'Trading Good vs Bad Pieces', etc.)"
  },
  
  "endgameTechnique": {
    "assessment": "Assess the player's technique in the endgame phases. Are they confident in converting advantages? Do they defend well in difficult endgames?",
    "skillToPractice": "One specific endgame skill to practice (e.g., 'Rook and Pawn Endgames', 'Calculating King Activity', 'The Principle of Two Weaknesses')"
  },
  
  "improvementPlan": {
    "threeStepChecklist": [
      "Step 1: Concrete action for next 10 games",
      "Step 2: Concrete action for next 10 games",
      "Step 3: Concrete action for next 10 games"
    ],
    "youtubeVideo": {
      "title": "Exact video title",
      "creator": "Channel name"
    },
    "masterGame": "Classic master game that illustrates a concept they need to learn (e.g., 'Kasparov vs Karpov, 1985 - Weak Square Exploitation')"
  }
}

**IMPORTANT REQUIREMENTS:**
1. Provide exactly 3 recurring weaknesses
2. Each weakness must have 3 concrete examples from DIFFERENT games
3. Examples must be STRATEGIC mistakes, not tactical blunders
4. Focus on positional chess concepts that players above 1300-2600 struggle with
5. Concepts to consider: outposts/weak squares, pawn breaks/pawn tension, trading good vs bad pieces, exchange sacrifices, counterattack, static and dynamic weaknesses, blockade or restriction, space advantage, minority attacks, isolated queen pawn, passed pawns, position evaluation, improving pieces, candidate moves, deep tactical visualization (3-4 moves)
6. Return ONLY valid JSON, no additional text

Begin your analysis now.`;
};

/**
 * Call Gemini API with Pawnsposes AI prompt
 */
const callPawnsposesAI = async (gamesData, formData) => {
  console.log('🤖 Calling Pawnsposes AI (Gemini)...');
  
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const model = 'gemini-2.0-flash-exp';
  const prompt = createPawnsposesAIPrompt(gamesData, formData);
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192, // Increased for comprehensive analysis
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
      throw new Error('Invalid response structure from Gemini API');
    }

    const analysisText = result.candidates[0].content.parts[0].text;
    console.log('📝 Raw Pawnsposes AI response:', analysisText.substring(0, 500) + '...');
    
    // Parse JSON response
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonText = analysisText;
      const jsonMatch = analysisText.match(/```json\\s*([\\s\\S]*?)\\s*```/) || 
                       analysisText.match(/```\\s*([\\s\\S]*?)\\s*```/) ||
                       analysisText.match(/\\{[\\s\\S]*\\}/);
      
      if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[0];
      }
      
      const jsonResult = JSON.parse(jsonText);
      
      // Validate structure
      if (!jsonResult.executiveSummary || !jsonResult.recurringWeaknesses || !Array.isArray(jsonResult.recurringWeaknesses)) {
        throw new Error('Invalid JSON structure from Pawnsposes AI');
      }
      
      console.log('✅ Pawnsposes AI analysis parsed successfully');
      console.log('📊 Found', jsonResult.recurringWeaknesses.length, 'recurring weaknesses');
      
      return jsonResult;
      
    } catch (parseError) {
      console.error('❌ Failed to parse Pawnsposes AI JSON response:', parseError);
      console.error('Raw response:', analysisText);
      throw new Error('Failed to parse JSON response from Pawnsposes AI: ' + parseError.message);
    }
    
  } catch (error) {
    console.error('❌ Error calling Pawnsposes AI:', error);
    throw error;
  }
};

/**
 * Main function to perform Pawnsposes AI analysis
 */
const performPawnsposesAIAnalysis = async (games, fenData, formData) => {
  console.log('🚀 Starting Pawnsposes AI Complete Analysis...');
  
  try {
    // Prepare games data
    const gamesData = prepareGamesForPawnsposesAI(games, fenData, formData);
    console.log('✅ Prepared', gamesData.length, 'games for analysis');
    
    // Call Pawnsposes AI
    const analysis = await callPawnsposesAI(gamesData, formData);
    
    console.log('✅ Pawnsposes AI analysis completed successfully');
    return analysis;
    
  } catch (error) {
    console.error('❌ Pawnsposes AI analysis failed:', error);
    throw error;
  }
};

'''

# Find the export statement and add code before it
if 'export default Reports;' in content:
    new_content = content.replace('export default Reports;', new_code + '\nexport default Reports;')
    
    # Write back
    with open(r'c:\pawnsposes\src\pages\Reports.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print("✅ Successfully added Pawnsposes AI functions")
    print(f"📊 Added {len(new_code)} characters of new code")
else:
    print("❌ Could not find export statement")