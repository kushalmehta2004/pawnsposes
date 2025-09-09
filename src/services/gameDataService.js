/**
 * Enhanced Game Data Fetching Service
 * Provides rigorous quality control and data enhancement for chess games
 * Now integrated with puzzle database for persistent storage
 */

import { Chess } from 'chess.js';
import puzzleDataService from './puzzleDataService.js';

/**
 * Enhanced Chess.com game fetching with quality control
 * @param {string} username - Chess.com username
 * @param {number} numberOfGames - Number of games to fetch
 * @returns {Promise<Array>} - Array of enhanced game objects
 */
export const fetchChessComGamesEnhanced = async (username, numberOfGames) => {
  console.log(`🎯 Enhanced Chess.com fetch for ${username} (${numberOfGames} games)...`);
  
  try {
    // Step 1: Get monthly archives
    const archivesResponse = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
    if (!archivesResponse.ok) {
      throw new Error(`Chess.com user "${username}" not found`);
    }
    
    const archivesData = await archivesResponse.json();
    const archives = archivesData.archives;
    
    if (archives.length === 0) {
      throw new Error('No games found for this player');
    }
    
    console.log(`📚 Found ${archives.length} monthly archives`);
    
    // Step 2: Collect games from recent archives
    let allGames = [];
    const targetGames = Math.ceil(numberOfGames * 2); // Fetch 2x to account for filtering
    
    for (let i = archives.length - 1; i >= 0 && allGames.length < targetGames; i--) {
      console.log(`📥 Fetching archive ${archives.length - i}/${archives.length}...`);
      
      const monthResponse = await fetch(archives[i]);
      if (!monthResponse.ok) continue;
      
      const monthData = await monthResponse.json();
      
      if (monthData.games) {
        // Filter for rapid games only
        const rapidGames = monthData.games
          .filter(game => game.time_class === 'rapid')
          .reverse(); // Most recent first within month
        
        allGames.push(...rapidGames);
        console.log(`  ✅ Added ${rapidGames.length} rapid games (total: ${allGames.length})`);
      }
    }
    
    console.log(`📊 Raw games collected: ${allGames.length}`);
    
    // Step 3: Apply rigorous quality control
    const qualityGames = await applyQualityControl(allGames, 'chess.com');
    
    if (qualityGames.length === 0) {
      throw new Error('No games passed quality control filters');
    }
    
    // Step 4: Take only requested number of quality games
    const selectedGames = qualityGames.slice(0, numberOfGames);
    
    // Step 5: Enhance with accuracy data
    console.log(`📊 Enhancing ${selectedGames.length} games with accuracy data...`);
    const enhancedGames = await enhanceChessComGamesWithAccuracy(selectedGames);
    
    console.log(`✅ Chess.com enhanced fetch complete: ${enhancedGames.length} games ready`);
    
    // Store games in puzzle database for future puzzle generation
    try {
      await puzzleDataService.storeUserGames(enhancedGames, username, 'chess.com');
      console.log(`💾 Games stored in puzzle database`);
    } catch (error) {
      console.warn('Failed to store games in puzzle database:', error);
    }
    
    return enhancedGames;
    
  } catch (error) {
    console.error('Chess.com enhanced fetch error:', error);
    throw new Error(`Chess.com API Error: ${error.message}`);
  }
};

/**
 * Enhanced Lichess game fetching with quality control
 * @param {string} username - Lichess username
 * @param {number} numberOfGames - Number of games to fetch
 * @returns {Promise<Array>} - Array of enhanced game objects
 */
export const fetchLichessGamesEnhanced = async (username, numberOfGames) => {
  console.log(`🎯 Enhanced Lichess fetch for ${username} (${numberOfGames} games)...`);
  
  try {
    // Fetch more games than needed to account for filtering
    const targetGames = Math.ceil(numberOfGames * 2);
    const url = `https://lichess.org/api/games/user/${username}?max=${targetGames}&perfType=rapid&sort=dateDesc&opening=true&format=ndjson`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/x-ndjson'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Lichess user "${username}" not found`);
    }
    
    const text = await response.text();
    const allGames = text.trim().split('\n').map(line => JSON.parse(line));
    
    console.log(`📊 Raw games collected: ${allGames.length}`);
    
    // Apply rigorous quality control
    const qualityGames = await applyQualityControl(allGames, 'lichess');
    
    if (qualityGames.length === 0) {
      throw new Error('No games passed quality control filters');
    }
    
    // Take only requested number of quality games
    const selectedGames = qualityGames.slice(0, numberOfGames);
    
    console.log(`✅ Lichess enhanced fetch complete: ${selectedGames.length} games ready`);
    
    // Store games in puzzle database for future puzzle generation
    try {
      await puzzleDataService.storeUserGames(selectedGames, username, 'lichess');
      console.log(`💾 Games stored in puzzle database`);
    } catch (error) {
      console.warn('Failed to store games in puzzle database:', error);
    }
    
    return selectedGames;
    
  } catch (error) {
    console.error('Lichess enhanced fetch error:', error);
    throw new Error(`Lichess API Error: ${error.message}`);
  }
};

/**
 * Apply rigorous quality control to games
 * @param {Array} games - Raw games array
 * @param {string} platform - Platform ('chess.com' or 'lichess')
 * @returns {Promise<Array>} - Filtered quality games
 */
const applyQualityControl = async (games, platform) => {
  console.log(`🔍 Applying quality control to ${games.length} games...`);
  
  const qualityGames = [];
  let filteredCount = {
    invalidPgn: 0,
    tooShort: 0,
    noMoves: 0,
    invalidFormat: 0,
    passed: 0
  };
  
  for (const game of games) {
    try {
      // Quality Check 1: Valid PGN/moves data
      let hasValidMoves = false;
      let moveCount = 0;
      
      if (platform === 'chess.com') {
        if (!game.pgn || typeof game.pgn !== 'string' || game.pgn.trim().length === 0) {
          filteredCount.invalidPgn++;
          continue;
        }
        
        // Test PGN validity with chess.js
        try {
          const chess = new Chess();
          chess.loadPgn(game.pgn);
          const history = chess.history();
          moveCount = history.length;
          hasValidMoves = moveCount > 0;
        } catch (pgnError) {
          filteredCount.invalidPgn++;
          continue;
        }
      } else if (platform === 'lichess') {
        if (!game.moves || (typeof game.moves === 'string' && game.moves.trim().length === 0)) {
          filteredCount.noMoves++;
          continue;
        }
        
        // Test moves validity
        try {
          const chess = new Chess();
          const movesArray = typeof game.moves === 'string' ? game.moves.split(' ') : game.moves;
          
          for (const move of movesArray) {
            if (move.trim()) {
              chess.move(move.trim());
              moveCount++;
            }
          }
          hasValidMoves = moveCount > 0;
        } catch (moveError) {
          filteredCount.invalidFormat++;
          continue;
        }
      }
      
      // Quality Check 2: Minimum game length (at least 10 moves total)
      if (moveCount < 10) {
        filteredCount.tooShort++;
        continue;
      }
      
      // Quality Check 3: Game must be completed (not abandoned)
      if (platform === 'chess.com') {
        if (!game.white?.result || !game.black?.result) {
          filteredCount.invalidFormat++;
          continue;
        }
      } else if (platform === 'lichess') {
        if (game.status === 'aborted' || game.status === 'noStart') {
          filteredCount.invalidFormat++;
          continue;
        }
      }
      
      // Quality Check 4: Must be rapid time control
      const isRapid = platform === 'chess.com' ? 
        game.time_class === 'rapid' : 
        game.perf === 'rapid';
      
      if (!isRapid) {
        continue; // Skip non-rapid games
      }
      
      // Game passed all quality checks
      qualityGames.push({
        ...game,
        qualityScore: calculateQualityScore(game, platform, moveCount),
        moveCount: moveCount
      });
      filteredCount.passed++;
      
    } catch (error) {
      console.warn(`Quality check error for game:`, error);
      filteredCount.invalidFormat++;
    }
  }
  
  console.log(`📊 Quality control results:`);
  console.log(`  ✅ Passed: ${filteredCount.passed}`);
  console.log(`  ❌ Invalid PGN: ${filteredCount.invalidPgn}`);
  console.log(`  ❌ Too short: ${filteredCount.tooShort}`);
  console.log(`  ❌ No moves: ${filteredCount.noMoves}`);
  console.log(`  ❌ Invalid format: ${filteredCount.invalidFormat}`);
  
  // Sort by quality score (highest first)
  qualityGames.sort((a, b) => b.qualityScore - a.qualityScore);
  
  return qualityGames;
};

/**
 * Calculate quality score for a game
 * @param {Object} game - Game object
 * @param {string} platform - Platform name
 * @param {number} moveCount - Number of moves in game
 * @returns {number} - Quality score (0-100)
 */
const calculateQualityScore = (game, platform, moveCount) => {
  let score = 50; // Base score
  
  // Move count bonus (longer games are generally better for analysis)
  if (moveCount >= 30) score += 20;
  else if (moveCount >= 20) score += 10;
  else if (moveCount >= 15) score += 5;
  
  // Rated game bonus
  if (game.rated) score += 15;
  
  // Time control bonus (longer time controls are better for analysis)
  if (platform === 'chess.com') {
    const timeClass = game.time_class;
    if (timeClass === 'rapid') score += 10;
  } else if (platform === 'lichess') {
    if (game.perf === 'rapid') score += 10;
  }
  
  // Completion bonus (games that ended normally)
  if (platform === 'chess.com') {
    if (game.white?.result && game.black?.result) score += 5;
  } else if (platform === 'lichess') {
    if (game.status === 'mate' || game.status === 'resign' || game.status === 'draw') {
      score += 5;
    }
  }
  
  return Math.min(100, Math.max(0, score));
};

/**
 * Enhanced Chess.com accuracy data fetching
 * @param {Array} games - Array of Chess.com games
 * @returns {Promise<Array>} - Games enhanced with accuracy data
 */
const enhanceChessComGamesWithAccuracy = async (games) => {
  console.log(`📊 Enhancing ${games.length} Chess.com games with accuracy data...`);
  
  const enhancedGames = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    
    try {
      // Extract game ID from URL
      let gameId = null;
      if (game.url) {
        const urlMatch = game.url.match(/\/game\/(\d+)$/);
        if (urlMatch) {
          gameId = urlMatch[1];
        }
      }
      
      let accuracyData = null;
      if (gameId) {
        accuracyData = await fetchChessComAccuracyData(gameId);
        if (accuracyData) {
          successCount++;
        } else {
          failCount++;
        }
      } else {
        failCount++;
      }
      
      enhancedGames.push({
        ...game,
        accuracyData: accuracyData,
        gameId: gameId
      });
      
      // Rate limiting - small delay between requests
      if (i < games.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      
    } catch (error) {
      console.warn(`Failed to enhance game ${i + 1}:`, error);
      enhancedGames.push({
        ...game,
        accuracyData: null,
        enhancementError: error.message
      });
      failCount++;
    }
  }
  
  console.log(`📊 Accuracy enhancement complete:`);
  console.log(`  ✅ Enhanced: ${successCount}/${games.length}`);
  console.log(`  ❌ Failed: ${failCount}/${games.length}`);
  
  return enhancedGames;
};

/**
 * Fetch accuracy data for a specific Chess.com game
 * @param {string} gameId - Chess.com game ID
 * @returns {Promise<Object|null>} - Accuracy data or null
 */
const fetchChessComAccuracyData = async (gameId) => {
  try {
    const response = await fetch(`https://api.chess.com/pub/game/${gameId}/analysis`);
    
    if (response.status === 404) {
      // Analysis not available for this game
      return null;
    }
    
    if (!response.ok) {
      console.warn(`Chess.com analysis API error for game ${gameId}: ${response.status}`);
      return null;
    }
    
    const analysisData = await response.json();
    
    // Validate accuracy data structure
    if (!analysisData.analysis || !Array.isArray(analysisData.analysis)) {
      console.warn(`Invalid accuracy data structure for game ${gameId}`);
      return null;
    }
    
    console.log(`📊 Fetched accuracy data for game ${gameId}: ${analysisData.analysis.length} moves analyzed`);
    return analysisData;
    
  } catch (error) {
    console.warn(`Failed to fetch accuracy data for game ${gameId}:`, error.message);
    return null;
  }
};

/**
 * Validate username on specified platform
 * @param {string} username - Username to validate
 * @param {string} platform - Platform ('chess.com' or 'lichess')
 * @returns {Promise<Object>} - User data if valid
 */
export const validateUserOnPlatform = async (username, platform) => {
  if (!username.trim()) {
    throw new Error('Please enter a username');
  }

  if (platform === 'chess.com') {
    return await validateChessComUser(username.trim());
  } else if (platform === 'lichess') {
    return await validateLichessUser(username.trim());
  } else {
    throw new Error('Please select a platform');
  }
};

/**
 * Validate Chess.com user
 * @param {string} username - Chess.com username
 * @returns {Promise<Object>} - User data
 */
const validateChessComUser = async (username) => {
  const response = await fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}`);
  
  if (response.status === 404) {
    throw new Error(`Chess.com user "${username}" not found. Please check the username and try again.`);
  }
  
  if (!response.ok) {
    throw new Error(`Chess.com API error: ${response.status}. Please try again later.`);
  }
  
  const userData = await response.json();
  return userData;
};

/**
 * Validate Lichess user
 * @param {string} username - Lichess username
 * @returns {Promise<Object>} - User data
 */
const validateLichessUser = async (username) => {
  const response = await fetch(`https://lichess.org/api/user/${username.toLowerCase()}`);
  
  if (response.status === 404) {
    throw new Error(`Lichess user "${username}" not found. Please check the username and try again.`);
  }
  
  if (!response.ok) {
    throw new Error(`Lichess API error: ${response.status}. Please try again later.`);
  }
  
  const userData = await response.json();
  return userData;
};