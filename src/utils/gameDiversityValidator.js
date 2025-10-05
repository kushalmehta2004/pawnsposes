/**
 * Game Diversity Validation Utility
 * Ensures weakness examples come from different games
 */

// ✅ NEW: Validate and enforce game diversity in weakness examples
export const validateAndEnforceGameDiversity = (jsonResult, preparedFenData) => {
  console.log('🔍 Validating game diversity in weakness examples...');
  
  if (!preparedFenData || !Array.isArray(preparedFenData)) {
    console.warn('⚠️ No prepared FEN data available for game diversity validation');
    return jsonResult;
  }
  
  const weaknesses = jsonResult.weaknesses || [];
  const usedGameNumbers = new Set();
  const availableGames = preparedFenData.map(game => game.gameNumber);
  
  console.log('Available games for examples:', availableGames);
  
  // Track and fix duplicate game usage
  const validatedWeaknesses = weaknesses.map((weakness, index) => {
    const example = weakness.example || {};
    let gameNumber = example.gameNumber;
    
    // If game number is already used or invalid, find an alternative
    if (!gameNumber || usedGameNumbers.has(gameNumber) || !availableGames.includes(gameNumber)) {
      console.log(`⚠️ Game ${gameNumber} already used or invalid for weakness ${index + 1}, finding alternative...`);
      
      // Find an unused game
      const unusedGame = availableGames.find(gNum => !usedGameNumbers.has(gNum));
      if (unusedGame) {
        gameNumber = unusedGame;
        console.log(`✅ Reassigned weakness ${index + 1} to game ${gameNumber}`);
        
        // Find a suitable position from this game
        const gameData = preparedFenData.find(g => g.gameNumber === gameNumber);
        if (gameData && gameData.positions.length > 0) {
          // ✅ IMPROVED: Select position from middle/late game (avoid early opening moves)
          // Filter positions to exclude early opening (move < 10)
          const middleToLatePositions = gameData.positions.filter(pos => pos.moveNumber >= 10);
          
          let selectedPosition;
          if (middleToLatePositions.length > 0) {
            // Select from middle 60% of filtered positions (avoid very end too)
            const startIdx = Math.floor(middleToLatePositions.length * 0.2);
            const endIdx = Math.floor(middleToLatePositions.length * 0.8);
            const rangeLength = endIdx - startIdx;
            const randomOffset = rangeLength > 0 ? Math.floor(Math.random() * rangeLength) : 0;
            const positionIndex = startIdx + randomOffset;
            selectedPosition = middleToLatePositions[positionIndex];
          } else {
            // Fallback: if game is very short, use the last available position
            selectedPosition = gameData.positions[gameData.positions.length - 1];
          }
          
          // Update the example with real game data
          weakness.example = {
            gameNumber: gameNumber,
            moveNumber: selectedPosition.moveNumber,
            move: selectedPosition.move || `${selectedPosition.moveNumber}...`,
            fen: selectedPosition.fen,
            explanation: example.explanation || `Move from game ${gameNumber} vs. ${selectedPosition.opponent}`,
            betterMove: example.betterMove || "Better alternative needed"
          };
          
          console.log(`✅ Updated example for weakness ${index + 1}:`, {
            game: gameNumber,
            move: selectedPosition.moveNumber,
            opponent: selectedPosition.opponent
          });
        }
      } else {
        console.warn(`⚠️ No unused games available for weakness ${index + 1}`);
      }
    }
    
    // Mark this game as used
    if (gameNumber) {
      usedGameNumbers.add(gameNumber);
    }
    
    return weakness;
  });
  
  console.log('✅ Game diversity validation completed. Used games:', Array.from(usedGameNumbers));
  
  return {
    ...jsonResult,
    weaknesses: validatedWeaknesses
  };
};

// ✅ NEW: Enhanced prompt with explicit game diversity requirements
export const enhancePromptWithGameDiversity = (basePrompt, preparedFenData) => {
  if (!preparedFenData || !Array.isArray(preparedFenData)) {
    return basePrompt;
  }

  const availableGames = preparedFenData.map(game => ({
    gameNumber: game.gameNumber,
    opponent: game.opponent,
    userColor: game.userColor,
    positionCount: game.positions.length
  }));

  const gameListText = availableGames.map(g => 
    `Game ${g.gameNumber}: vs. ${g.opponent} (playing as ${g.userColor}, ${g.positionCount} positions)`
  ).join('\n');

  return basePrompt + `

CRITICAL GAME DIVERSITY REQUIREMENTS:
Available games for examples:
${gameListText}

MANDATORY RULES:
1. Each weakness MUST use a different game number
2. Use games: ${availableGames.slice(0, 3).map(g => g.gameNumber).join(', ')} for the 3 weaknesses
3. Vary the colors (mix white and black games)
4. Use actual FEN positions and moves from the provided data
5. NO HALLUCINATED EXAMPLES - only use real game data provided above
6. ⚠️ CRITICAL: Select examples from MIDDLE or LATE game positions (move 10+)
   - For 1800+ rated players, mistakes rarely occur in early opening (moves 1-9)
   - Focus on middlegame (moves 10-30) or endgame (moves 30+) positions
   - Avoid using moves 0-9 unless absolutely necessary

VALIDATION: The system will automatically verify game diversity and reassign examples if duplicates are detected.`;
};