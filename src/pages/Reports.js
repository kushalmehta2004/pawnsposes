import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, User, Hash, BarChart3, Loader2, Check, CheckCircle, XCircle, Crown, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

import { useNavigate } from 'react-router-dom';
import LoadingScreen from '../components/LoadingScreen';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import userProfileService from '../services/userProfileService';
import { 
  fetchChessComGamesEnhanced, 
  fetchLichessGamesEnhanced, 
  validateUserOnPlatform 
} from '../services/gameDataService';
import {
  extractFenFromPgn,
  extractFenFromLichessMoves,
  selectKeyPositions
} from '../utils/positionAnalysis';
import { 
  performDeepStockfishGeminiAnalysis 
} from '../utils/geminiStockfishAnalysis';
import puzzleDataService from '../services/puzzleDataService';
import mistakeAnalysisService from '../services/mistakeAnalysisService';
import reportService from '../services/reportService';
import puzzlePrefetchService from '../services/puzzlePrefetchService';
import { validateAndEnforceGameDiversity, enhancePromptWithGameDiversity } from '../utils/gameDiversityValidator';

// Calculate dynamic statistics from actual games
const calculateGameStatistics = (gamesData, formData) => {
  // ✅ USE THE SAME LOGIC AS calculateBasicWinRate
  console.log('🔍 calculateGameStatistics called - using fixed win rate logic');
  
  // Check if we have gameContext with record data (most reliable)
  if (gamesData.length > 0 && gamesData[0].gameContext?.record) {
    const record = gamesData[0].gameContext.record;
    const totalGames = record.wins + record.losses + (record.draws || 0);
    const winRate = totalGames > 0 ? ((record.wins / totalGames) * 100).toFixed(1) : 0;
    
    // Calculate accuracy
    let totalAccuracy = 0;
    let accuracyCount = 0;
    gamesData.forEach(game => {
      const isWhite = game.white?.username === formData.username;
      const accuracy = isWhite ? 
        (game.accuracies?.white || game.white_accuracy || game.white?.accuracy) :
        (game.accuracies?.black || game.black_accuracy || game.black?.accuracy);
      
      if (accuracy && accuracy > 0) {
        totalAccuracy += accuracy;
        accuracyCount++;
      }
    });
    
    const averageAccuracy = accuracyCount > 0 ? (totalAccuracy / accuracyCount).toFixed(1) : 'N/A';
    
    return {
      totalGames,
      wins: record.wins,
      losses: record.losses,
      draws: record.draws || 0,
      winRate,
      averageAccuracy
    };
  }
  
  // Fallback: Calculate from individual games (same logic as calculateBasicWinRate)
  let wins = 0, losses = 0, draws = 0;
  let totalAccuracy = 0;
  let accuracyCount = 0;
  
  gamesData.forEach(game => {
    let isUserWin = false;
    let isUserLoss = false;
    let isWhite = false;
    
    // Determine if user is white or black
    if (game.gameInfo?.white === formData.username || game.white === formData.username) {
      isWhite = true;
    } else if (game.gameInfo?.black === formData.username || game.black === formData.username) {
      isWhite = false;
    }
    
    // Get the game result (chess notation like "1-0", "0-1", "1/2-1/2")
    const gameResult = game.gameInfo?.result || game.result;
    
    // Determine if user won/lost based on result and color
    if (gameResult === '1-0' && isWhite) {
      isUserWin = true; // White won and user is white
    } else if (gameResult === '0-1' && !isWhite) {
      isUserWin = true; // Black won and user is black
    } else if (gameResult === '1-0' && !isWhite) {
      isUserLoss = true; // White won and user is black
    } else if (gameResult === '0-1' && isWhite) {
      isUserLoss = true; // Black won and user is white
    } else if (gameResult === '1/2-1/2') {
      draws++;
    }
    
    if (isUserWin) wins++;
    if (isUserLoss) losses++;
    
    // Calculate accuracy
    const accuracy = isWhite ? 
      (game.accuracies?.white || game.white_accuracy || game.white?.accuracy) :
      (game.accuracies?.black || game.black_accuracy || game.black?.accuracy);
    
    if (accuracy && accuracy > 0) {
      totalAccuracy += accuracy;
      accuracyCount++;
    }
  });
  
  const totalGames = wins + losses + draws;
  const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : 0;
  const averageAccuracy = accuracyCount > 0 ? (totalAccuracy / accuracyCount).toFixed(1) : 'N/A';
  
  return {
    totalGames,
    wins,
    losses,
    draws,
    winRate,
    averageAccuracy
  };
};

const Reports = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    profile, 
    loading: profileLoading,
    canGenerateFreeReport,
    hasActiveSubscription,
    hasClaimedFreeReport,
    getSubscriptionTier,
    refreshProfile
  } = useUserProfile();
  const [formData, setFormData] = useState({
    platform: '',
    username: '',
    numberOfGames: 20
  });


  const [isLoading, setIsLoading] = useState(false);
  const [games, setGames] = useState([]);
  const [progressStage, setProgressStage] = useState(''); // 'fetching', 'analyzing', 'stockfish', ''
  const [progressPercent, setProgressPercent] = useState(0);
  const [isValidatingUser, setIsValidatingUser] = useState(false);
  const [userValidationStatus, setUserValidationStatus] = useState(null); // null, 'valid', 'invalid'
  const [currentStep, setCurrentStep] = useState(0);
  const [stockfishProgress, setStockfishProgress] = useState('');

  // 🗑️ Clear all IndexedDB data on page load/refresh for fresh analysis
  useEffect(() => {
    const clearDataOnLoad = async () => {
      try {
        console.log('🔄 Page loaded - clearing all stored data for fresh analysis...');
        await puzzleDataService.clearAllData();
        console.log('✅ All stored data cleared - ready for fresh analysis');
      } catch (error) {
        console.warn('⚠️ Failed to clear stored data:', error);
        // Don't show error to user as this is not critical
      }
    };

    clearDataOnLoad();
  }, []); // Empty dependency array = run once on mount

  const platforms = [
    { value: 'lichess', label: 'Lichess.org', icon: '♞' },
    { value: 'chess.com', label: 'Chess.com', icon: '♜' }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Reset validation status when username changes
    if (name === 'username') {
      setUserValidationStatus(null);
    }
  };

  const handlePlatformSelect = (platform) => {
    setFormData(prev => ({
      ...prev,
      platform: platform
    }));
    // Reset validation status when platform changes
    setUserValidationStatus(null);
  };

  const getSubscriptionDescription = () => {
    const tier = (getSubscriptionTier() || '').toLowerCase();
    if (tier.includes('annual')) {
      return 'Weekly puzzle sets all year with automatic reports and priority features';
    }
    if (tier.includes('quarter')) {
      return 'Weekly puzzle sets for twelve weeks with ongoing report downloads';
    }
    if (tier.includes('month')) {
      return 'Weekly puzzle sets refreshed each week with downloadable reports';
    }
    if (tier.includes('one')) {
      return 'One full week of unlocked puzzles linked to your latest report';
    }
    return 'Active subscription benefits enabled';
  };

  // Removed duplicate validation functions - using gameDataService.validateUserOnPlatform instead

  /**
   * Handles username validation button click
   */
  const handleValidateUsername = async () => {
    if (!formData.username.trim()) {
      toast.error('Please enter a username');
      return;
    }

    if (!formData.platform) {
      toast.error('Please select a platform');
      return;
    }

    setIsValidatingUser(true);
    setUserValidationStatus(null);

    try {
      const userData = await validateUserOnPlatform(formData.username, formData.platform);
      
      setUserValidationStatus('valid');
      
      // Show success message with user info
      const displayName = userData.name || userData.username || formData.username;
      toast.success(`User found on ${formData.platform}!`);
      
    } catch (error) {
      setUserValidationStatus('invalid');
      toast.error(error.message);
    } finally {
      setIsValidatingUser(false);
    }
  };

  /**
   * Filters games to remove those missing PGN or moves
   * @param {Array} games - Array of game objects
   * @returns {Array} - Filtered array of valid games
   */
  const filterValidGames = (games) => {
    const validGames = games.filter(game => {
      // Check if game has PGN
      if (!game.pgn || typeof game.pgn !== 'string' || game.pgn.trim().length === 0) {

        return false;
      }

      // Check if PGN contains actual moves (not just headers)
      const pgnContent = game.pgn.trim();
      const hasActualMoves = /\d+\.\s*[a-zA-Z]/.test(pgnContent); // Look for move notation like "1. e4"
      
      if (!hasActualMoves) {

        return false;
      }

      // Additional check for minimum game length (at least 3 moves)
      const moveMatches = pgnContent.match(/\d+\./g);
      if (!moveMatches || moveMatches.length < 3) {

        return false;
      }

      return true;
    });


    return validGames;
  };

  /**
   * Fetches accuracy data for a Chess.com game
   * @param {string} gameId - Chess.com game ID
   * @returns {Promise<Object|null>} - Game analysis data or null if not available
   */
  const fetchChessComAccuracy = async (gameId) => {
    try {
      const response = await fetch(`https://api.chess.com/pub/game/${gameId}/analysis`);
      
      if (response.status === 404) {
        // Analysis not available for this game
        return null;
      }
      
      if (!response.ok) {
        console.warn(`⚠️ Chess.com analysis API error for game ${gameId}: ${response.status}`);
        return null;
      }
      
      const analysisData = await response.json();

      return analysisData;
      
    } catch (error) {
      console.warn(`⚠️ Failed to fetch accuracy data for game ${gameId}:`, error.message);
      return null;
    }
  };

  /**
   * Enhances Chess.com games with accuracy data
   * @param {Array} games - Array of Chess.com game objects
   * @returns {Promise<Array>} - Enhanced games with accuracy data
   */
  const enhanceChessComGamesWithAccuracy = async (games) => {

    
    const enhancedGames = [];
    
    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      
      // Extract game ID from URL
      let gameId = null;
      if (game.url) {
        const urlMatch = game.url.match(/\/game\/(\d+)$/);
        if (urlMatch) {
          gameId = urlMatch[1];
        }
      }
      
      if (gameId) {
        // Fetch accuracy data
        const accuracyData = await fetchChessComAccuracy(gameId);
        
        // Add accuracy data to game object
        const enhancedGame = {
          ...game,
          accuracyData: accuracyData
        };
        
        enhancedGames.push(enhancedGame);
        
        // Small delay to avoid rate limiting
        if (i < games.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } else {
        // Keep game without accuracy data
        enhancedGames.push(game);
      }
    }
    
    const gamesWithAccuracy = enhancedGames.filter(game => game.accuracyData).length;

    
    return enhancedGames;
  };

  /**
   * Validates a FEN string using chess.js
   * @param {string} fen - FEN string to validate
   * @returns {boolean} - True if FEN is valid
   */
  const validateFen = (fen) => {
    try {
      // Try to load the FEN into a new Chess instance
      const chess = new Chess(fen);
      // If no error was thrown, the FEN is valid
      return true;
    } catch (error) {
      console.warn(`⚠️ Invalid FEN: ${fen.substring(0, 50)}... - ${error.message}`);
      return false;
    }
  };



  /**
   * Estimates player skill level based on game data
   * @param {Array} games - Array of game objects
   * @param {string} username - Player's username
   * @param {string} platform - Chess platform
   * @returns {Object} - Skill assessment object
   */
  const estimatePlayerSkill = (games, username, platform) => {
    let totalRating = 0;
    let ratingCount = 0;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    
    games.forEach(game => {
      let playerRating = null;
      let isWin = false;
      let isDraw = false;
      
      if (platform === 'chess.com') {
        if (game.white?.username === username) {
          playerRating = game.white?.rating;
          isWin = game.white?.result === 'win';
          isDraw = game.white?.result === 'draw';
        } else if (game.black?.username === username) {
          playerRating = game.black?.rating;
          isWin = game.black?.result === 'win';
          isDraw = game.black?.result === 'draw';
        }
      } else if (platform === 'lichess') {
        if (game.players?.white?.user?.name === username) {
          playerRating = game.players?.white?.rating;
          isWin = game.winner === 'white';
          isDraw = !game.winner;
        } else if (game.players?.black?.user?.name === username) {
          playerRating = game.players?.black?.rating;
          isWin = game.winner === 'black';
          isDraw = !game.winner;
        }
      }
      
      if (playerRating) {
        totalRating += playerRating;
        ratingCount++;
      }
      
      if (isWin) wins++;
      else if (isDraw) draws++;
      else losses++;
    });
    
    const averageRating = ratingCount > 0 ? Math.round(totalRating / ratingCount) : null;
    const winRate = games.length > 0 ? Math.round((wins / games.length) * 100) : 0;
    
    // Determine skill level
    let skillLevel = 'intermediate';
    if (averageRating) {
      if (averageRating < 1200) skillLevel = 'beginner';
      else if (averageRating < 1600) skillLevel = 'intermediate';
      else if (averageRating < 2000) skillLevel = 'advanced';
      else skillLevel = 'expert';
    }
    
    return {
      averageRating,
      skillLevel,
      winRate,
      gamesAnalyzed: games.length,
      record: { wins, losses, draws }
    };
  };

  /**
   * Generates context-aware prompts for specific positions
   * @param {Object} position - Position object with FEN and metadata
   * @param {Object} gameInfo - Game information
   * @param {Object} playerSkill - Player skill assessment
   * @param {number} gameNumber - Game number in the set
   * @returns {string} - Context-aware prompt
   */
  const generateContextAwarePrompt = (position, gameInfo, playerSkill, gameNumber) => {
    const gamePhase = position.phase || 'middlegame'; // Use phase from position object
    const skillContext = playerSkill.skillLevel;
    const ratingContext = playerSkill.averageRating ? `(~${playerSkill.averageRating} rating)` : '';
    
    let contextPrompt = `
POSITION ANALYSIS REQUEST:
Game ${gameNumber} - Move ${position.moveNumber} (${gamePhase} phase)
Player Level: ${skillContext} ${ratingContext}
Position Context: ${position.reason || 'Strategic position'}
Priority: ${position.priority || 'medium'}

FEN: ${position.fen}

GAME CONTEXT:
- Opening: ${gameInfo.eco || 'Unknown'}
- Time Control: ${gameInfo.timeControl || 'rapid'}
- Result: ${gameInfo.result || 'Unknown'}
- Platform: ${gameInfo.platform || 'Unknown'}
`;

    // Add phase-specific analysis requests
    if (gamePhase === 'opening') {
      contextPrompt += `
OPENING ANALYSIS FOCUS:
- Evaluate opening principles adherence
- Identify development mistakes
- Suggest better piece placement
- Check for tactical opportunities
`;
    } else if (gamePhase === 'middlegame') {
      contextPrompt += `
MIDDLEGAME ANALYSIS FOCUS:
- Assess pawn structure weaknesses
- Identify tactical patterns
- Evaluate piece coordination
- Suggest strategic plans
`;
    } else if (gamePhase === 'endgame') {
      contextPrompt += `
ENDGAME ANALYSIS FOCUS:
- Check for technical accuracy
- Identify conversion techniques
- Evaluate king activity
- Suggest precise moves
`;
    }

    // Add priority-specific requests
    if (position.priority === 'critical') {
      contextPrompt += `
CRITICAL POSITION - DETAILED ANALYSIS REQUIRED:
- This position follows a ${position.judgment || 'mistake'}
- Provide specific move recommendations
- Explain the consequences of the error
- Suggest preventive thinking patterns
`;
    } else if (position.priority === 'high') {
      contextPrompt += `
TRANSITION POINT - STRATEGIC ANALYSIS:
- Analyze the changing nature of the position
- Identify new priorities and plans
- Suggest adaptation strategies
`;
    }

    // Add skill-level appropriate language
    if (playerSkill.skillLevel === 'beginner') {
      contextPrompt += `
EXPLANATION STYLE: Use simple, clear language. Focus on basic principles and fundamental concepts.
`;
    } else if (playerSkill.skillLevel === 'advanced' || playerSkill.skillLevel === 'expert') {
      contextPrompt += `
EXPLANATION STYLE: Use precise chess terminology. Include deep strategic and tactical analysis.
`;
    }

    return contextPrompt.trim();
  };

  /**
   * Creates structured game context for AI analysis
   * @param {Object} game - Game object
   * @param {Object} playerSkill - Player skill assessment
   * @param {string} username - Player username
   * @param {string} platform - Chess platform
   * @returns {Object} - Structured game context
   */
  const createGameContext = (game, playerSkill, username, platform) => {
    const context = {
      platform: platform,
      playerSkill: playerSkill,
      gameInfo: game.gameInfo,
      playerColor: null,
      opponentRating: null,
      timeControl: game.gameInfo?.timeControl || 'rapid',
      gameResult: game.gameInfo?.result || 'Unknown'
    };

    // Determine player color and opponent rating
    if (platform === 'chess.com') {
      if (game.gameInfo?.white === username) {
        context.playerColor = 'white';
        context.opponentRating = game.gameData?.black?.rating;
      } else {
        context.playerColor = 'black';
        context.opponentRating = game.gameData?.white?.rating;
      }
    } else if (platform === 'lichess') {
      if (game.gameInfo?.white === username) {
        context.playerColor = 'white';
        context.opponentRating = game.gameData?.players?.black?.rating;
      } else {
        context.playerColor = 'black';
        context.opponentRating = game.gameData?.players?.white?.rating;
      }
    }

    return context;
  };

  const fetchChessComGames = async (username, numberOfGames) => {
    try {
      console.log(`🎯 Fetching Chess.com games for ${username}...`);
      
      // First, get the list of monthly archives
      const archivesResponse = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
      if (!archivesResponse.ok) {
        throw new Error('Player not found on Chess.com');
      }
      
      const archivesData = await archivesResponse.json();
      const archives = archivesData.archives;
      
      if (archives.length === 0) {
        throw new Error('No games found for this player');
      }
      
      // Collect games from multiple archives if needed
      let allGames = [];
      
      // Filter and collect games until we have enough (starting from most recent archive)
      for (let i = archives.length - 1; i >= 0 && allGames.length < numberOfGames * 1.5; i--) {
        const monthResponse = await fetch(archives[i]);
        const monthData = await monthResponse.json();
        
        if (monthData.games) {
          // Filter only rapid games and reverse to get most recent first
          const rapidGames = monthData.games
            .filter(game => game.time_class === 'rapid')
            .reverse(); // Reverse to get most recent games first within the month
          
          allGames.push(...rapidGames);
        }
      }
      
      console.log(`📥 Raw games fetched: ${allGames.length}`);
      
      // Apply game quality filter
      const validGames = filterValidGames(allGames);
      
      if (validGames.length === 0) {
        throw new Error('No valid games found with complete PGN data');
      }
      
      // Take only the requested number of valid games
      const selectedGames = validGames.slice(0, numberOfGames);
      
      // Enhance Chess.com games with accuracy data

      const enhancedGames = await enhanceChessComGamesWithAccuracy(selectedGames);
      
      console.log(`✅ Chess.com games ready: ${enhancedGames.length} games`);
      return enhancedGames;
      
    } catch (error) {
      throw new Error(`Chess.com API Error: ${error.message}`);
    }
  };

  const fetchLichessGames = async (username, numberOfGames) => {
    try {
      console.log(`🎯 Fetching Lichess games for ${username}...`);
      
      // Build URL to fetch more games than needed to account for filtering
      let url = `https://lichess.org/api/games/user/${username}?max=${Math.ceil(numberOfGames * 1.5)}&format=json&perfType=rapid&sort=dateDesc`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/x-ndjson'
        }
      });
      
      if (!response.ok) {
        throw new Error('Player not found on Lichess');
      }
      
      const text = await response.text();
      const allGames = text.trim().split('\n').map(line => JSON.parse(line));
      
      console.log(`📥 Raw games fetched: ${allGames.length}`);
      
      // Apply game quality filter
      const validGames = filterValidGames(allGames);
      
      if (validGames.length === 0) {
        throw new Error('No valid games found with complete PGN data');
      }
      
      // Take only the requested number of valid games
      const selectedGames = validGames.slice(0, numberOfGames);
      
      console.log(`✅ Lichess games ready: ${selectedGames.length} games`);
      return selectedGames;
      
    } catch (error) {
      throw new Error(`Lichess API Error: ${error.message}`);
    }
  };

  // Helper function to add delay between steps
  const delayedStepUpdate = (stepNumber, delay = 1000) => {
    return new Promise(resolve => {
      setTimeout(() => {
        setCurrentStep(stepNumber);
        resolve();
      }, delay);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.platform || !formData.username || !formData.numberOfGames) {
      toast.error('Please fill in all fields');
      return;
    }

    if (formData.numberOfGames < 20 || formData.numberOfGames > 50) {
      toast.error('Number of games must be between 20 and 50');
      return;
    }

    // Check if user validation is required
    if (userValidationStatus !== 'valid') {
      toast.error('Please validate the username first by clicking "Validate User"');
          return;
    }

    // ✅ PHASE 2: Check authentication
    if (!user) {
      toast.error('Please sign in to generate a report');
      navigate('/auth');
      return;
    }

    // ✅ PHASE 2: Check if user can generate a report
    const canGenerate = canGenerateFreeReport();
    const hasSubscription = hasActiveSubscription();

    if (!canGenerate && !hasSubscription) {
      toast.error('You have already used your free report. Please subscribe to generate more reports.');
      return;
    }

    try {
      const latestReport = await reportService.getLatestUserReport(user.id);
      if (latestReport?.created_at) {
        const lastCreatedAt = new Date(latestReport.created_at);
        const now = new Date();
        const weekInMs = 7 * 24 * 60 * 60 * 1000;
        if (now.getTime() - lastCreatedAt.getTime() < weekInMs) {
          const nextAvailableAt = new Date(lastCreatedAt.getTime() + weekInMs);
          const formattedDate = nextAvailableAt.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          toast.error(`You can generate your next report on ${formattedDate}.`);
          return;
        }
      }
    } catch (availabilityError) {
      console.error('Error checking report availability:', availabilityError);
      toast.error('Unable to verify report availability. Please try again later.');
      return;
    }

    setIsLoading(true);
    
    setProgressStage('fetching');
    setProgressPercent(5);
    setCurrentStep(0);
    
    try {
      // STAGE 0: Username Validation (5% - 15%)
      setProgressPercent(5);
      console.log('🔍 Validating username...');
      
      try {
        await validateUserOnPlatform(formData.username, formData.platform);
        console.log('✅ Username validation successful');
      } catch (validationError) {
        toast.error(validationError.message);
        return;
      }
      
      setProgressPercent(15);
      
      // STAGE 1: Fetch & Filter Games (15% - 40%)
      let fetchedGames = [];
      
      // Show step 0 for at least 1 second
      await delayedStepUpdate(0, 1000);
      
      if (formData.platform === 'chess.com') {
        setProgressPercent(20);

        fetchedGames = await fetchChessComGamesEnhanced(formData.username, formData.numberOfGames);
        setProgressPercent(35);
      } else if (formData.platform === 'lichess') {
        setProgressPercent(20);

        fetchedGames = await fetchLichessGamesEnhanced(formData.username, formData.numberOfGames);
        setProgressPercent(35);
      }
      
      setGames(fetchedGames);
      setProgressPercent(40);
      
      // Show step 1 for at least 1 second
      await delayedStepUpdate(1, 1000);
      
      // STAGE 2: Mistake Analysis & Pattern Detection (40% - 50%)
      setProgressStage('mistake-analysis');
      setProgressPercent(42);
      
      try {
        console.log('🔍 Starting automatic mistake analysis...');
        
        // Run mistake analysis on the stored games
        const mistakeResults = await mistakeAnalysisService.analyzeAllGamesForMistakes(
          formData.username,
          {
            maxGames: fetchedGames.length,
            analysisDepth: 16, // Slightly lower depth for speed while retaining quality
            timeLimit: 800, // ~0.8s per position for faster pass
            onProgress: (progress) => {
              const progressPercent = 42 + (progress.progress * 0.08); // 42% to 50%
              setProgressPercent(progressPercent);
              setStockfishProgress(`Analyzing mistakes: ${progress.message || 'Processing...'}`);
            }
          }
        );
        
        console.log(`✅ Mistake analysis complete: ${mistakeResults.totalMistakes} mistakes found`);
        setProgressPercent(50);
        
      } catch (mistakeError) {
        console.warn('⚠️ Mistake analysis failed:', mistakeError.message);
        // Continue with the flow even if mistake analysis fails
        setProgressPercent(50);
      }
      
      // Show step 2 for at least 1 second
      await delayedStepUpdate(2, 1000);
      
      // STAGE 3: Extract, Validate & Select Key FEN Positions (50% - 60%)
      setProgressStage('analyzing');
      setProgressPercent(52);
      

      
      const allGamesFenData = [];
      
      fetchedGames.forEach((game, gameIndex) => {
        let fenPositions = [];
        
        if (formData.platform === 'chess.com') {
          // Extract from PGN with enhanced metadata
          if (game.pgn) {
            fenPositions = extractFenFromPgn(game.pgn, game, gameIndex);
          }
        } else if (formData.platform === 'lichess') {
          // Extract from moves array with enhanced metadata
          if (game.moves) {
            // Split moves string into array if it's a string
            const movesArray = typeof game.moves === 'string' ? game.moves.split(' ') : game.moves;
            fenPositions = extractFenFromLichessMoves(movesArray, game, gameIndex);
          }
        }
        
        // Apply enhanced FEN validation and intelligent key position selection
        let keyPositions = [];
        if (fenPositions.length > 0) {
          keyPositions = selectKeyPositions(fenPositions, game.accuracyData, {
            maxPositions: 15,
            includeTransitions: true,
            includeCritical: true,
            includeStrategic: true,
            includeEvaluationShifts: true
          });
        }
        
        allGamesFenData.push({
          gameIndex: gameIndex + 1,
          gameData: game,
          fenPositions: fenPositions, // Keep all positions for reference
          keyPositions: keyPositions, // Selected positions for AI analysis
          totalMoves: fenPositions.length - 1 // Subtract 1 for starting position
        });
      });
      

      
      // STAGE 4: Comprehensive AI Analysis with staged loading (60% - 100%)
      setProgressStage('analyzing');
      setProgressPercent(60);
      
      // Show step 3 for at least 1 second
      await delayedStepUpdate(3, 1000);
      

      try {
        setProgressPercent(80);
        
        // Show step 4 for at least 1 second
        await delayedStepUpdate(4, 1000);
        const analysisResult = await performChessAnalysisWithGemini(allGamesFenData, fetchedGames, formData);


         // ✅ PAWNSPOSES AI: Perform comprehensive Pawnsposes AI analysis
        let pawnsposesAIAnalysis = null;
        try {
          console.log('🎯 Starting Pawnsposes AI analysis...');
          setProgressPercent(85);
          pawnsposesAIAnalysis = await performPawnsposesAIAnalysis(fetchedGames, allGamesFenData, formData);
          console.log('✅ Pawnsposes AI analysis completed successfully');
        } catch (pawnsposesError) {
          console.error('❌ Pawnsposes AI analysis failed:', pawnsposesError);
          // Continue without Pawnsposes AI if it fails
        }

        // Add games data and FEN positions to the analysis result
        const completeAnalysisResult = {
          ...analysisResult,
          games: fetchedGames,
          gameData: fetchedGames,
          fenPositions: allGamesFenData.flatMap(game => game.fenPositions),
          allGamesFenData: allGamesFenData, // ✅ Add complete FEN data per game
          username: formData.username, // ✅ Also store the username
          recurringWeaknesses: pawnsposesAIAnalysis?.recurringWeaknesses || [], // ✅ Use Pawnsposes AI weaknesses only
          pawnsposesAI: pawnsposesAIAnalysis // ✅ Add Pawnsposes AI analysis
        };
        
        setProgressPercent(100);
               
        // ✅ PHASE 2: Claim free report if this is the user's first report
        if (user && !hasClaimedFreeReport() && !hasActiveSubscription()) {
          try {
            console.log('📝 Claiming free report for user:', user.id);
            await userProfileService.claimFreeReport(user.id);
            await refreshProfile(); // Refresh profile to update UI
            console.log('✅ Free report claimed successfully');
          } catch (claimError) {
            console.error('❌ Failed to claim free report:', claimError);
            // Don't block navigation if claim fails
          }
        }

        // ✅ Report will be saved when user visits FullReport page (with PDF)
        // This prevents duplicate saves - one without PDF and one with PDF

        // ✅ PUZZLE PRE-FETCH: Start pre-fetching puzzles in the background
        // This ensures puzzles are ready when user navigates to puzzle pages
        // Pre-fetch happens asynchronously and doesn't block navigation
        if (formData.username) {
          console.log('🧩 Starting background puzzle pre-fetch...');
          puzzlePrefetchService.prefetchAllPuzzles(formData.username, completeAnalysisResult)
            .then(result => {
              console.log('✅ Background puzzle pre-fetch completed:', result);
            })
            .catch(error => {
              console.warn('⚠️ Background puzzle pre-fetch failed (non-critical):', error);
              // Don't show error to user - puzzles will be generated on-demand if pre-fetch fails
            });
        }

        // Navigate to the report display page with the complete analysis data
        navigate('/report-display', { 
          state: { 
            analysis: completeAnalysisResult,
            recurringWeaknesses: completeAnalysisResult.recurringWeaknesses
          }
        });
        
      } catch (analysisError) {
        console.error('Analysis error:', analysisError);
        
        // Show detailed error message
        if (analysisError.message.includes('API key not configured')) {
          toast.error('Gemini API key not configured. Please check your .env file.');
        } else {
          toast.error('Failed to analyze games: ' + analysisError.message);
        }
      }
      
    } catch (error) {
      toast.error(error.message);
      console.error('Error fetching games:', error);
    } finally {
      setIsLoading(false);
      setProgressStage('');
      setProgressPercent(0);
      setCurrentStep(0);
    }
  };

  // ✅ NEW: Analyze recurring weaknesses with FEN data using JSON format
  const analyzeRecurringWeaknessesWithGemini = async (fenData, games, formData) => {
    console.log('🚀 Analyzing recurring weaknesses with FEN data...');
    
    try {
      // Prepare FEN data with metadata
      const preparedFenData = prepareFenDataForRecurringWeaknessAnalysis(games, fenData, formData);
      
      // Create the Pawnsposes prompt for recurring weaknesses
      const basePrompt = createRecurringWeaknessPrompt(preparedFenData, formData);
      
      // ✅ ENHANCED: Add game diversity requirements to prompt
      const enhancedPrompt = enhancePromptWithGameDiversity(basePrompt, preparedFenData);
      
      // Call Gemini API with prepared data for validation
      const result = await callGeminiForRecurringWeaknesses(enhancedPrompt, preparedFenData);
      
      console.log('✅ Recurring weaknesses analysis completed');
      return result;
      
    } catch (error) {
      console.error('Error in recurring weaknesses analysis:', error);
      throw error;
    }
  };


  // ✅ UNIFIED: Single comprehensive Gemini analysis function
  const performChessAnalysisWithGemini = async (fenData, games, formData) => {
    console.log('🚀 Performing UNIFIED comprehensive chess analysis with single Gemini call...');
    
    try {
      // Prepare the games data for comprehensive analysis
      const gamesForAnalysis = prepareGamesForGeminiAnalysis(games, fenData, formData);
      
      // ✅ SINGLE CALL: Get all analysis types in one request
      const comprehensiveResult = await callUnifiedGeminiAPI(gamesForAnalysis, formData);
      
            
      // ✅ REMOVED: Old recurring weaknesses analysis - now using Pawnsposes AI only
      // The old analyzeRecurringWeaknessesWithGemini call has been removed
      // All weakness analysis is now handled by performPawnsposesAIAnalysis

      console.log('✅ Complete unified analysis result:', comprehensiveResult);
      return comprehensiveResult;
     
   } catch (error) {
     console.error('Error in unified Gemini analysis:', error);
     throw error;
   }
     };

  // ✅ NEW: Prepare FEN data with game metadata for recurring weaknesses analysis
  const prepareFenDataForRecurringWeaknessAnalysis = (games, fenData, formData) => {
    console.log('🔍 Preparing FEN data with metadata for recurring weakness analysis...');
    
    const preparedData = games.map((game, index) => {
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
          timeControl: game.time_control || 'Unknown'
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
          timeControl: game.speed || 'Unknown'
        };
      }

      // Determine user's color and opponent
      const isUserWhite = gameInfo.white === formData.username;
      const userColor = isUserWhite ? 'white' : 'black';
      const opponent = isUserWhite ? gameInfo.black : gameInfo.white;
      const userRating = isUserWhite ? gameInfo.whiteRating : gameInfo.blackRating;
      const opponentRating = isUserWhite ? gameInfo.blackRating : gameInfo.whiteRating;

      // Process FEN positions with metadata
      const processedPositions = fenPositions.map((position, posIndex) => {
        // Determine game phase
        let phase = 'opening';
        if (position.moveNumber > 15) phase = 'middlegame';
        if (position.moveNumber > 40) phase = 'endgame';

        return {
          gameNumber,
          moveNumber: position.moveNumber,
          fen: position.fen,
          move: position.move,
          phase,
          userColor,
          opponent,
          userRating,
          opponentRating,
          result: gameInfo.result,
          eco: gameInfo.eco,
          timeControl: gameInfo.timeControl
        };
      });

      return {
        gameNumber,
        gameInfo,
        userColor,
        opponent,
        positions: processedPositions
      };
    });

    return preparedData;
 };

  // ✅ ENHANCED: Prepare games with context-aware analysis
  const prepareGamesForGeminiAnalysis = (games, fenData, formData) => {
    console.log('🔍 Preparing context-aware games data for analysis...');
    
    // First, assess player skill level
    const playerSkill = estimatePlayerSkill(games, formData.username, formData.platform);

    
    const gamesData = games.map((game, index) => {
      // ✅ MINIMAL PGN: Only extract essential game info, no full PGN processing
      let gameInfo = {};
      
      if (formData.platform === 'chess.com') {
        gameInfo = {
          white: game.white?.username,
          black: game.black?.username,
          result: game.white?.result === 'win' ? '1-0' : game.black?.result === 'win' ? '0-1' : '1/2-1/2',
          timeControl: game.time_class,
          endTime: new Date(game.end_time * 1000).toISOString(),
          rated: game.rated,
          eco: game.eco || 'Unknown',
          platform: 'chess.com'
        };
      } else if (formData.platform === 'lichess') {
        gameInfo = {
          white: game.players?.white?.user?.name,
          black: game.players?.black?.user?.name,
          result: game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '1/2-1/2',
          timeControl: game.perf,
          endTime: new Date(game.createdAt).toISOString(),
          rated: game.rated,
          eco: game.opening?.eco || 'Unknown',
          platform: 'lichess'
        };
      }
      
      // ✅ FOCUS ON KEY POSITIONS: Use selected key positions for AI analysis
      const allFenPositions = fenData[index]?.fenPositions || [];
      const keyPositions = fenData[index]?.keyPositions || [];
      
      // ✅ ENHANCED: Add context-aware prompts for each key position
      const contextualPositions = keyPositions.map(position => ({
        ...position,
        contextPrompt: generateContextAwarePrompt(position, gameInfo, playerSkill, index + 1)
      }));
      
      console.log(`Game ${index + 1}: Using ${keyPositions.length} key positions out of ${allFenPositions.length} total positions`);
      
      // Create game context
      const gameContext = createGameContext({ gameInfo, gameData: game }, playerSkill, formData.username, formData.platform);
      
      return {
        gameNumber: index + 1,
        gameInfo,
        gameContext,
        fenPositions: contextualPositions, // Use context-aware key positions for AI analysis
        allFenPositions: allFenPositions, // Keep all positions for reference
        totalMoves: allFenPositions.length - 1,
        keyPositionsCount: keyPositions.length,
        playerSkill,
        mistakeCount: 0 // Will be calculated during analysis
      };
    });
    
    const totalKeyPositions = gamesData.reduce((sum, game) => sum + game.fenPositions.length, 0);
    const totalAllPositions = gamesData.reduce((sum, game) => sum + game.allFenPositions.length, 0);
    
    console.log(`✅ Prepared ${gamesData.length} games with ${totalKeyPositions} context-aware key positions selected from ${totalAllPositions} total positions`);
    console.log(`🎯 Position reduction: ${totalAllPositions} → ${totalKeyPositions} (${Math.round((1 - totalKeyPositions/totalAllPositions) * 100)}% reduction)`);
    console.log(`🧠 Player context: ${playerSkill.skillLevel} level (${playerSkill.averageRating || 'unrated'}) with ${playerSkill.winRate}% win rate`);
    
    return gamesData;
  };

  // ✅ REMOVED: PGN reconstruction - No longer needed for FEN-based analysis

  // ✅ REMOVED: callGeminiAPI - Now handled by unified call
  const callGeminiAPI_REMOVED = async (gamesData, formData) => {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      throw new Error('Gemini API key not configured. Please add your API key to the .env file.');
    }
    
    // Construct the prompt based on prompt.txt
    const prompt = constructAnalysisPrompt(gamesData, formData);
    
    console.log('Sending request to Gemini 2.0 Flash API...');
    
    // Use only Gemini 2.0 Flash (free version)
    const model = 'gemini-2.0-flash-exp';
    
    console.log(`Using model: ${model}`);
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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
          maxOutputTokens: 8192,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini 2.0 Flash API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const result = await response.json();
    
    if (!result.candidates || !result.candidates[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid response structure from Gemini 2.0 Flash');
    }
    
    const analysisText = result.candidates[0].content.parts[0].text;
    console.log('Successfully got response from Gemini 2.0 Flash');
    
    // Parse the Gemini response into structured data
    return parseGeminiAnalysisResponse(analysisText, formData);
  };

  // Removed duplicate calculateGameStatistics function - now defined outside component

  // Construct the enhanced context-aware analysis prompt
  const constructAnalysisPrompt = (gamesData, formData) => {
    const stats = calculateGameStatistics(gamesData, formData);
    const playerSkill = gamesData[0]?.playerSkill || { skillLevel: 'intermediate', averageRating: null, winRate: 0 };
    
    let prompt = `You are "Pawnsposes," a world-renowned chess Grandmaster (FIDE 2650+) and elite coach. Your analysis is famous for being insightful, practical, and deeply psychological. You don't just point out tactical mistakes; you uncover the flawed thinking and recurring habits that hold players back. Your tone is encouraging but direct.

**ENHANCED PLAYER CONTEXT**
Player: '${formData.username}' (${formData.platform})
Skill Level: ${playerSkill.skillLevel} ${playerSkill.averageRating ? `(~${playerSkill.averageRating} rating)` : ''}
Performance: ${playerSkill.winRate}% win rate over ${gamesData.length} games

**PLAYER STATISTICS:**
- Total Games: ${stats.totalGames}
- Win Rate: ${stats.winRate}% (${stats.wins}W-${stats.losses}L-${stats.draws}D)
- Average Accuracy: ${stats.averageAccuracy}%

**CONTEXT-AWARE POSITION ANALYSIS:**
The following positions have been carefully selected based on:
- Critical moments (after blunders/inaccuracies)
- Game phase transitions (opening→middlegame→endgame)
- Strategic checkpoints
Each position includes specific context and analysis focus areas.

`;

    gamesData.forEach((game, index) => {
      const gameInfo = game.gameInfo || {};
      const gameContext = game.gameContext || {};
      
      prompt += `
**Game ${index + 1}: ${gameInfo.white} vs ${gameInfo.black}**
Result: ${gameInfo.result} | Time Control: ${gameInfo.timeControl} | ECO: ${gameInfo.eco}
Player Color: ${gameContext.playerColor || 'Unknown'} | Opponent Rating: ${gameContext.opponentRating || 'Unknown'}
Total Moves: ${game.totalMoves} | Key Positions Selected: ${game.fenPositions.length}

**CONTEXT-AWARE KEY POSITIONS:**
${game.fenPositions.map((pos, i) => `
${pos.contextPrompt}

Analysis Focus: ${pos.reason || 'Strategic position'} (Priority: ${pos.priority || 'medium'})
---
`).join('')}

`;
    });

    prompt += `
**ENHANCED ANALYSIS STRUCTURE:**
Use the context-aware position analysis above to provide deeper, more targeted insights.

1. **Executive Summary:** 
   - Summarize the player's style considering their ${playerSkill.skillLevel} level
   - Highlight patterns from the critical positions and phase transitions analyzed
   - Reference specific context from the key positions (opening mistakes, middlegame transitions, endgame technique)

2. **Recurring Weaknesses (3 items):** 
   Focus on patterns revealed by the context-aware position analysis:
   a. Title each weakness clearly (e.g., "Weak Square Control", "Pawn Structure Planning", "Piece Coordination")
   b. Explain why this weakness is particularly relevant for a ${playerSkill.skillLevel} player
   c. Use the context-aware position analysis to provide specific examples:
      - Reference the exact positions with their context (e.g., "In Game 2, Move 15 middlegame transition...")
      - Explain how the position context (phase, priority, reason) reveals the weakness
      - Connect the weakness to the player's skill level and rating range
   d. Provide improvement suggestions appropriate for their level

// 3. **Phase-Specific Analysis:**
//    Based on the game phase contexts in the key positions:
//    a. **Opening Phase:** Analyze development and principle adherence from opening positions
//    b. **Middlegame Transitions:** Focus on positions marked as phase transitions
//    c. **Endgame Technique:** Evaluate technique from endgame positions

// 4. **Critical Moment Analysis:**
//    Focus on positions marked as "critical" priority:
//    - Analyze the blunders/inaccuracies that led to these positions
//    - Explain the thinking patterns that need improvement
//    - Provide specific move recommendations for similar positions

// 5. **Skill-Level Appropriate Improvement Plan:**
//    Customized for ${playerSkill.skillLevel} level (${playerSkill.averageRating ? `~${playerSkill.averageRating} rating` : 'unrated'}):
//    a. 3-step improvement checklist appropriate for their level
//    b. YouTube video recommendation matching their skill level
//    c. Master game suggestion with positions similar to their weaknesses

**IMPORTANT:** Reference the specific context-aware position analysis throughout your response. Use the game phases, priorities, and reasons provided for each position to give targeted, relevant advice.`;

    return prompt;
  };

  // Parse Gemini's response into structured data for the UI
  const parseGeminiAnalysisResponse = (analysisText, formData) => {
    console.log('Parsing Gemini analysis response...');
    
    // This is a simplified parser - you might want to make it more robust
    const sections = {
      executiveSummary: '',
      recurringWeaknesses: [],
      middlegameFocus: '',
      endgameFocus: '',
      actionPlan: {
        checklist: [],
        youtubeVideo: '',
        masterGame: ''
      }
    };
    
    // Extract sections using regex or string parsing
    // For now, let's return the raw text and format it later
    return {
      rawAnalysis: analysisText,
      username: formData.username,
      platform: formData.platform,
      totalGames: formData.numberOfGames,
      analysisDate: new Date().toLocaleDateString(),
      ...sections
    };
  };



  // ✅ NEW: Analyze weaknesses with complete FEN data during initial analysis
  // ✅ REMOVED: analyzeWeaknessesWithGemini - Now handled by unified call
  const analyzeWeaknessesWithGemini_REMOVED = async (gamesForAnalysis, formData) => {
    console.log('🔍 Starting weakness analysis with complete FEN data...');
    
    try {
      // Prepare detailed game data for weakness analysis
      const gameExamples = gamesForAnalysis.slice(0, 10).map((game, index) => {
        const gameInfo = game.gameInfo || {};
        const fenPositions = game.fenPositions || [];
        
        // Extract critical moments (positions with significant evaluation changes)
        const criticalMoments = extractCriticalMoments(fenPositions);
        
        return {
          gameNumber: index + 1,
          white: gameInfo.white,
          black: gameInfo.black,
          result: gameInfo.result,
          fenPositions: fenPositions,
          criticalMoments: criticalMoments,
          totalMoves: fenPositions.length - 1,
          mistakeCount: criticalMoments.length
        };
      });

      // Create comprehensive weakness analysis prompt
      const weaknessPrompt = createWeaknessAnalysisPrompt(gameExamples, formData);
      
      console.log('🤖 Sending weakness analysis to Gemini...');

      
      const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
      
      if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        throw new Error('Gemini API key not configured. Please add your API key to the .env file.');
      }
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: weaknessPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Gemini weakness analysis error:', response.status, errorText);
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        console.error('❌ Invalid Gemini response structure:', data);
        throw new Error('Invalid response structure from Gemini');
      }
      
      const analysisText = data.candidates[0].content.parts[0].text;
      console.log('✅ Gemini weakness analysis response:', analysisText.substring(0, 500));
      
      // Parse the weakness analysis response
      const weaknesses = parseWeaknessAnalysisResponse(analysisText, gameExamples);
      
      console.log('✅ Parsed weaknesses:', weaknesses);
      
      return {
        weaknesses: weaknesses,
        analysisComplete: true,
        analysisTimestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Weakness analysis failed:', error);
      
      // No fallback - re-throw error to force proper handling
      throw new Error(`Weakness analysis failed: ${error.message}`);
    }
  };

  // ✅ NEW: Extract critical moments based on actual mistakes (FEN + Engine Analysis)
  const extractCriticalMoments = (fenPositions) => {
    const criticalMoments = [];
    
    // Analyze each position for potential mistakes
    for (let i = 1; i < fenPositions.length; i++) {
      const currentPosition = fenPositions[i];
      const previousPosition = fenPositions[i - 1];
      
      if (!currentPosition || !previousPosition) continue;
      
      // Check if this position represents a significant mistake
      const mistake = analyzePositionForMistake(previousPosition, currentPosition);
      
      if (mistake.isMistake) {
        criticalMoments.push({
          moveNumber: currentPosition.moveNumber || i,
          move: currentPosition.move || `Move ${i}`,
          fen: previousPosition.fen, // Position BEFORE the mistake
          afterFen: currentPosition.fen, // Position AFTER the mistake
          turn: previousPosition.turn || (i % 2 === 1 ? 'w' : 'b'),
          phase: (currentPosition.moveNumber || i) < 15 ? 'opening' : (currentPosition.moveNumber || i) < 40 ? 'middlegame' : 'endgame',
          // ✅ NEW: Mistake analysis data
          playedMove: currentPosition.move,
          bestMove: mistake.bestMove,
          evaluation: mistake.evaluation,
          mistakeType: mistake.type,
          description: mistake.description,
          impact: mistake.impact
        });
      }
    }
    
    return criticalMoments.slice(0, 10); // Limit to 10 most critical mistakes per game
  };

  // ✅ ENHANCED: Advanced position analysis with engine-style evaluation
  const analyzePositionForMistake = (beforePosition, afterPosition) => {
    const mistake = {
      isMistake: false,
      bestMove: null,
      evaluation: null,
      type: 'positional',
      description: '',
      impact: 'minor',
      centipawnLoss: 0,
      category: 'unknown'
    };
    
    if (!beforePosition.fen || !afterPosition.fen) return mistake;
    
    // ✅ ENHANCED: Multi-layered mistake detection
    const analyses = [
      analyzeTacticalMistakes(beforePosition, afterPosition),
      analyzePositionalMistakes(beforePosition, afterPosition),
      analyzeEndgameMistakes(beforePosition, afterPosition),
      analyzeOpeningMistakes(beforePosition, afterPosition)
    ];
    
    // Find the most significant mistake
    const significantMistake = analyses
      .filter(analysis => analysis.found)
      .sort((a, b) => b.severity - a.severity)[0];
    
    if (significantMistake) {
      mistake.isMistake = true;
      mistake.type = significantMistake.type;
      mistake.description = significantMistake.description;
      mistake.bestMove = significantMistake.betterMove;
      mistake.impact = significantMistake.impact;
      mistake.evaluation = significantMistake.evaluation;
      mistake.centipawnLoss = significantMistake.centipawnLoss || 0;
      mistake.category = significantMistake.category;
    }
    
    return mistake;
  };

  // ✅ ENHANCED: Advanced tactical mistake detection
  const analyzeTacticalMistakes = (beforePos, afterPos) => {
    const result = {
      found: false,
      type: 'tactical',
      description: '',
      betterMove: '',
      impact: 'minor',
      evaluation: '',
      severity: 0,
      centipawnLoss: 0,
      category: 'tactical'
    };
    
    // Material analysis
    const beforeMaterial = calculateAdvancedMaterial(beforePos.fen);
    const afterMaterial = calculateAdvancedMaterial(afterPos.fen);
    const materialDiff = beforeMaterial.total - afterMaterial.total;
    
    // Check for significant material loss
    if (materialDiff > 100) { // Lost more than a pawn (100 centipawns)
      result.found = true;
      result.severity = Math.min(materialDiff / 100, 5);
      result.centipawnLoss = materialDiff;
      result.impact = materialDiff > 300 ? 'major' : materialDiff > 150 ? 'moderate' : 'minor';
      
      // Determine specific tactical pattern
      if (materialDiff > 500) {
        result.description = 'Major piece blunder - lost significant material';
        result.category = 'piece_blunder';
      } else if (materialDiff > 300) {
        result.description = 'Minor piece lost without compensation';
        result.category = 'piece_loss';
      } else {
        result.description = 'Pawn structure damaged or material lost';
        result.category = 'material_loss';
      }
      
      result.betterMove = suggestTacticalImprovement(beforePos, afterPos, materialDiff);
      result.evaluation = `Lost ${Math.round(materialDiff)} centipawns`;
    }
    
    // Check for tactical patterns
    const tacticalPattern = detectTacticalPatterns(beforePos, afterPos);
    if (tacticalPattern.found && !result.found) {
      result.found = true;
      result.severity = tacticalPattern.severity;
      result.description = tacticalPattern.description;
      result.category = tacticalPattern.category;
      result.betterMove = tacticalPattern.betterMove;
      result.impact = tacticalPattern.impact;
      result.centipawnLoss = tacticalPattern.centipawnLoss;
    }
    
    return result;
  };

  // ✅ ENHANCED: Advanced positional mistake detection
  const analyzePositionalMistakes = (beforePos, afterPos) => {
    const result = {
      found: false,
      type: 'positional',
      description: '',
      betterMove: '',
      impact: 'minor',
      evaluation: '',
      severity: 0,
      centipawnLoss: 0,
      category: 'positional'
    };
    
    // King safety analysis
    const kingSafetyChange = analyzeKingSafetyChange(beforePos, afterPos);
    if (kingSafetyChange.significant) {
      result.found = true;
      result.severity = kingSafetyChange.severity;
      result.description = kingSafetyChange.description;
      result.category = 'king_safety';
      result.betterMove = kingSafetyChange.betterMove;
      result.impact = kingSafetyChange.impact;
      result.centipawnLoss = kingSafetyChange.centipawnLoss;
    }
    
    // Pawn structure analysis
    const pawnStructureChange = analyzePawnStructureChange(beforePos, afterPos);
    if (pawnStructureChange.significant && !result.found) {
      result.found = true;
      result.severity = pawnStructureChange.severity;
      result.description = pawnStructureChange.description;
      result.category = 'pawn_structure';
      result.betterMove = pawnStructureChange.betterMove;
      result.impact = pawnStructureChange.impact;
      result.centipawnLoss = pawnStructureChange.centipawnLoss;
    }
    
    // Piece activity analysis
    const pieceActivityChange = analyzePieceActivityChange(beforePos, afterPos);
    if (pieceActivityChange.significant && !result.found) {
      result.found = true;
      result.severity = pieceActivityChange.severity;
      result.description = pieceActivityChange.description;
      result.category = 'piece_activity';
      result.betterMove = pieceActivityChange.betterMove;
      result.impact = pieceActivityChange.impact;
      result.centipawnLoss = pieceActivityChange.centipawnLoss;
    }
    
    return result;
  };

  // ✅ NEW: Endgame mistake detection
  const analyzeEndgameMistakes = (beforePos, afterPos) => {
    const result = {
      found: false,
      type: 'endgame',
      description: '',
      betterMove: '',
      impact: 'minor',
      evaluation: '',
      severity: 0,
      centipawnLoss: 0,
      category: 'endgame'
    };
    
    // Check if we're in endgame (few pieces remaining)
    const beforePieces = countPieces(beforePos.fen);
    const afterPieces = countPieces(afterPos.fen);
    
    if (beforePieces.total <= 12) { // Endgame threshold
      const endgameError = detectEndgameErrors(beforePos, afterPos);
      if (endgameError.found) {
        result.found = true;
        result.severity = endgameError.severity;
        result.description = endgameError.description;
        result.category = endgameError.category;
        result.betterMove = endgameError.betterMove;
        result.impact = endgameError.impact;
        result.centipawnLoss = endgameError.centipawnLoss;
      }
    }
    
    return result;
  };

  // ✅ NEW: Opening mistake detection
  const analyzeOpeningMistakes = (beforePos, afterPos) => {
    const result = {
      found: false,
      type: 'opening',
      description: '',
      betterMove: '',
      impact: 'minor',
      evaluation: '',
      severity: 0,
      centipawnLoss: 0,
      category: 'opening'
    };
    
    // Check if we're in opening (move number < 15)
    const moveNumber = beforePos.moveNumber || 0;
    
    if (moveNumber < 15) {
      const openingError = detectOpeningErrors(beforePos, afterPos);
      if (openingError.found) {
        result.found = true;
        result.severity = openingError.severity;
        result.description = openingError.description;
        result.category = openingError.category;
        result.betterMove = openingError.betterMove;
        result.impact = openingError.impact;
        result.centipawnLoss = openingError.centipawnLoss;
      }
    }
    
    return result;
  };

  // ✅ ENHANCED: Advanced material calculation with positional values
  const calculateAdvancedMaterial = (fen) => {
    if (!fen) return { total: 0, white: 0, black: 0, pieces: {} };
    
    const pieceValues = { 
      'q': 900, 'r': 500, 'b': 330, 'n': 320, 'p': 100,
      'Q': 900, 'R': 500, 'B': 330, 'N': 320, 'P': 100 
    };
    
    const board = fen.split(' ')[0];
    let whiteMaterial = 0, blackMaterial = 0;
    const pieces = { white: {}, black: {} };
    
    for (let char of board) {
      if (pieceValues[char]) {
        const value = pieceValues[char];
        if (char === char.toUpperCase()) {
          whiteMaterial += value;
          pieces.white[char] = (pieces.white[char] || 0) + 1;
        } else {
          blackMaterial += value;
          pieces.black[char] = (pieces.black[char] || 0) + 1;
        }
      }
    }
    
    return {
      total: whiteMaterial + blackMaterial,
      white: whiteMaterial,
      black: blackMaterial,
      pieces: pieces,
      imbalance: Math.abs(whiteMaterial - blackMaterial)
    };
  };

  // ✅ ENHANCED: Advanced king safety analysis
  const analyzeKingSafetyChange = (beforePos, afterPos) => {
    const beforeSafety = evaluateAdvancedKingSafety(beforePos.fen);
    const afterSafety = evaluateAdvancedKingSafety(afterPos.fen);
    const safetyChange = beforeSafety.total - afterSafety.total;
    
    const result = {
      significant: false,
      severity: 0,
      description: '',
      betterMove: '',
      impact: 'minor',
      centipawnLoss: 0
    };
    
    if (safetyChange > 1.5) {
      result.significant = true;
      result.severity = Math.min(safetyChange, 5);
      result.centipawnLoss = Math.round(safetyChange * 50);
      result.impact = safetyChange > 3 ? 'major' : safetyChange > 2 ? 'moderate' : 'minor';
      
      if (beforeSafety.castlingLost && !afterSafety.castlingLost) {
        result.description = 'Lost castling rights without castling';
        result.betterMove = 'Castle early to secure king safety';
      } else if (beforeSafety.kingExposed < afterSafety.kingExposed) {
        result.description = 'King became more exposed to attacks';
        result.betterMove = 'Keep king protected behind pawns';
      } else {
        result.description = 'Weakened king position';
        result.betterMove = 'Maintain king safety';
      }
    }
    
    return result;
  };

  // ✅ NEW: Advanced king safety evaluation
  const evaluateAdvancedKingSafety = (fen) => {
    if (!fen) return { total: 0, castlingLost: false, kingExposed: 0 };
    
    const parts = fen.split(' ');
    const board = parts[0];
    const castling = parts[2] || '-';
    
    let safety = 5; // Base safety
    let kingExposed = 0;
    let castlingLost = castling === '-';
    
    // Castling rights bonus
    if (castling !== '-') {
      safety += castling.length * 0.5;
    }
    
    // King position analysis
    const whiteKingPos = findKingPosition(board, 'K');
    const blackKingPos = findKingPosition(board, 'k');
    
    // Check if kings are in safe positions
    if (whiteKingPos && (whiteKingPos.includes('g1') || whiteKingPos.includes('c1'))) {
      safety += 1; // Castled position
    }
    if (blackKingPos && (blackKingPos.includes('g8') || blackKingPos.includes('c8'))) {
      safety += 1; // Castled position
    }
    
    // Check for exposed kings (center files)
    if (whiteKingPos && ['d', 'e', 'f'].some(file => whiteKingPos.includes(file))) {
      kingExposed += 1;
      safety -= 1;
    }
    if (blackKingPos && ['d', 'e', 'f'].some(file => blackKingPos.includes(file))) {
      kingExposed += 1;
      safety -= 1;
    }
    
    return { total: safety, castlingLost, kingExposed };
  };

  // ✅ NEW: Pawn structure analysis
  const analyzePawnStructureChange = (beforePos, afterPos) => {
    const beforeStructure = evaluatePawnStructure(beforePos.fen);
    const afterStructure = evaluatePawnStructure(afterPos.fen);
    
    const result = {
      significant: false,
      severity: 0,
      description: '',
      betterMove: '',
      impact: 'minor',
      centipawnLoss: 0
    };
    
    // Check for new weaknesses
    const weaknessIncrease = afterStructure.weaknesses - beforeStructure.weaknesses;
    
    if (weaknessIncrease > 0) {
      result.significant = true;
      result.severity = weaknessIncrease;
      result.centipawnLoss = weaknessIncrease * 30;
      result.impact = weaknessIncrease > 2 ? 'major' : weaknessIncrease > 1 ? 'moderate' : 'minor';
      
      if (afterStructure.isolated > beforeStructure.isolated) {
        result.description = 'Created isolated pawn weakness';
        result.betterMove = 'Maintain pawn connections';
      } else if (afterStructure.doubled > beforeStructure.doubled) {
        result.description = 'Created doubled pawn weakness';
        result.betterMove = 'Avoid unnecessary pawn doubling';
      } else if (afterStructure.backward > beforeStructure.backward) {
        result.description = 'Created backward pawn weakness';
        result.betterMove = 'Support pawn advances';
      } else {
        result.description = 'Weakened pawn structure';
        result.betterMove = 'Maintain solid pawn formation';
      }
    }
    
    return result;
  };

  // ✅ NEW: Piece activity analysis
  const analyzePieceActivityChange = (beforePos, afterPos) => {
    const beforeActivity = evaluatePieceActivity(beforePos.fen);
    const afterActivity = evaluatePieceActivity(afterPos.fen);
    const activityChange = beforeActivity.total - afterActivity.total;
    
    const result = {
      significant: false,
      severity: 0,
      description: '',
      betterMove: '',
      impact: 'minor',
      centipawnLoss: 0
    };
    
    if (activityChange > 1) {
      result.significant = true;
      result.severity = Math.min(activityChange, 4);
      result.centipawnLoss = Math.round(activityChange * 25);
      result.impact = activityChange > 2.5 ? 'major' : activityChange > 1.5 ? 'moderate' : 'minor';
      
      if (beforeActivity.centralControl > afterActivity.centralControl) {
        result.description = 'Lost central control';
        result.betterMove = 'Maintain pieces in center';
      } else if (beforeActivity.pieceCoordination > afterActivity.pieceCoordination) {
        result.description = 'Reduced piece coordination';
        result.betterMove = 'Coordinate pieces for common goals';
      } else {
        result.description = 'Decreased piece activity';
        result.betterMove = 'Activate passive pieces';
      }
    }
    
    return result;
  };

  // ✅ Helper functions for advanced analysis
  const findKingPosition = (board, king) => {
    const ranks = board.split('/');
    for (let rank = 0; rank < 8; rank++) {
      const file = ranks[rank].indexOf(king);
      if (file !== -1) {
        return String.fromCharCode(97 + file) + (8 - rank);
      }
    }
    return null;
  };

  const countPieces = (fen) => {
    if (!fen) return { total: 0, white: 0, black: 0 };
    
    const board = fen.split(' ')[0];
    let white = 0, black = 0;
    
    for (let char of board) {
      if (/[KQRBNP]/.test(char)) white++;
      else if (/[kqrbnp]/.test(char)) black++;
    }
    
    return { total: white + black, white, black };
  };

  const evaluatePawnStructure = (fen) => {
    // Simplified pawn structure evaluation
    return {
      weaknesses: Math.floor(Math.random() * 3), // Placeholder
      isolated: Math.floor(Math.random() * 2),
      doubled: Math.floor(Math.random() * 2),
      backward: Math.floor(Math.random() * 2)
    };
  };

  const evaluatePieceActivity = (fen) => {
    // Simplified piece activity evaluation
    return {
      total: 5 + Math.random() * 3,
      centralControl: 3 + Math.random() * 2,
      pieceCoordination: 3 + Math.random() * 2
    };
  };

  // ✅ NEW: Tactical pattern detection
  const detectTacticalPatterns = (beforePos, afterPos) => {
    return {
      found: false,
      severity: 0,
      description: '',
      category: 'tactical',
      betterMove: '',
      impact: 'minor',
      centipawnLoss: 0
    };
  };

  // ✅ NEW: Endgame error detection
  const detectEndgameErrors = (beforePos, afterPos) => {
    return {
      found: false,
      severity: 0,
      description: '',
      category: 'endgame',
      betterMove: '',
      impact: 'minor',
      centipawnLoss: 0
    };
  };

  // ✅ NEW: Opening error detection
  const detectOpeningErrors = (beforePos, afterPos) => {
    return {
      found: false,
      severity: 0,
      description: '',
      category: 'opening',
      betterMove: '',
      impact: 'minor',
      centipawnLoss: 0
    };
  };

  // ✅ NEW: Tactical improvement suggestions
  const suggestTacticalImprovement = (beforePos, afterPos, materialDiff) => {
    if (materialDiff > 500) {
      return 'Look for defensive resources before moving';
    } else if (materialDiff > 300) {
      return 'Calculate all forcing sequences';
    } else {
      return 'Consider piece safety before advancing';
    }
  };

  // Create weakness analysis prompt
  const createWeaknessAnalysisPrompt = (gameExamples, formData) => {
    const prompt = `You are "Pawnsposes," a chess Grandmaster analyzing ${formData.username}'s games. Identify 3 specific recurring weaknesses using precise chess terminology.

GAMES ANALYZED:
${gameExamples.map(game => `
Game ${game.gameNumber}: ${game.white} vs ${game.black} (${game.result})
Critical Mistakes: ${game.criticalMoments.length} identified
${game.criticalMoments.slice(0, 3).map(moment => `
- Move ${moment.moveNumber}: ${moment.playedMove} (${moment.mistakeType})
  Position: ${moment.fen}
  Better: ${moment.bestMove}
  Impact: ${moment.impact}
`).join('')}
`).join('\n')}

**REQUIRED FORMAT (EXACTLY):**
**WEAKNESS_1: [Specific Chess Concept]**
**SUBTITLE:** [One sentence explaining the pattern]
**EXAMPLE_1:** vs. [opponent] (Move [number]) - Mistake: [TWO-LINE JUSTIFICATION explaining exactly why this move was a mistake and what was wrong with the decision-making]
**EXAMPLE_2:** vs. [opponent] (Move [number]) - Mistake: [TWO-LINE JUSTIFICATION explaining exactly why this move was a mistake and what was wrong with the decision-making]  
**EXAMPLE_3:** vs. [opponent] (Move [number]) - Mistake: [TWO-LINE JUSTIFICATION explaining exactly why this move was a mistake and what was wrong with the decision-making]

**WEAKNESS_2: [Different Specific Chess Concept]**
**SUBTITLE:** [One sentence explaining the pattern]
**EXAMPLE_1:** vs. [opponent] (Move [number]) - Mistake: [TWO-LINE JUSTIFICATION explaining exactly why this move was a mistake and what was wrong with the decision-making]
**EXAMPLE_2:** vs. [opponent] (Move [number]) - Mistake: [TWO-LINE JUSTIFICATION explaining exactly why this move was a mistake and what was wrong with the decision-making]  
**EXAMPLE_3:** vs. [opponent] (Move [number]) - Mistake: [TWO-LINE JUSTIFICATION explaining exactly why this move was a mistake and what was wrong with the decision-making]

**WEAKNESS_3: [Third Specific Chess Concept]**
**SUBTITLE:** [One sentence explaining the pattern]
**EXAMPLE_1:** vs. [opponent] (Move [number]) - Mistake: [TWO-LINE JUSTIFICATION explaining exactly why this move was a mistake and what was wrong with the decision-making]
**EXAMPLE_2:** vs. [opponent] (Move [number]) - Mistake: [TWO-LINE JUSTIFICATION explaining exactly why this move was a mistake and what was wrong with the decision-making]  
**EXAMPLE_3:** vs. [opponent] (Move [number]) - Mistake: [TWO-LINE JUSTIFICATION explaining exactly why this move was a mistake and what was wrong with the decision-making]

CRITICAL: For each EXAMPLE, provide EXACTLY 2 lines of explanation after "Mistake:". Each line should be a complete thought.
Line 1: What was the concrete problem with the move?
Line 2: What principle or objective was violated?

Examples of TWO-LINE format:
- "Moved the bishop to an undefended square, allowing it to be captured with tempo. This violated the principle of piece safety and the tactical calculation principle."
- "Played a move that blocked the escape route for the king. The king would be trapped in the center if the opponent attacked with forcing moves."
 

Use specific chess concepts like: "Inefficient Piece Coordination and Prophylactic Thinking", "Backward Pawn Weakness Assessment", "Color Complex Control", "Outpost Creation and Exploitation", "Initiative Maintenance", "Pawn Lever Timing", etc.

Keep examples concise and actionable.`;

    return prompt;
  };

  // Parse weakness analysis response with smart fallback detection
  const parseWeaknessAnalysisResponse = (analysisText, gameExamples) => {
    const weaknesses = [];
    
    try {
      console.log('🔍 Parsing weakness analysis response...');
      console.log('📄 Analysis text length:', analysisText.length);
      console.log('📄 First 500 chars:', analysisText.substring(0, 500));
       
      // No fallback - force AI to provide specific analysis or fail
      console.log('🔍 Analyzing response for specific game references...');
      
      // Split by weakness sections
      const weaknessSections = analysisText.split(/\*\*WEAKNESS_\d+:/);
      console.log('📊 Found', weaknessSections.length - 1, 'weakness sections');
      
      for (let i = 1; i < weaknessSections.length && i <= 3; i++) {
        const section = weaknessSections[i];
        
        // Extract title
        const titleMatch = section.match(/^([^*]+)/);
        const title = titleMatch ? titleMatch[1].trim() : `Weakness ${i}`;
        
        console.log(`🔍 Processing weakness ${i}: "${title}"`);
        console.log(`📝 Section content preview:`, section.substring(0, 200));
        
        // Extract subtitle
        const subtitleMatch = section.match(/\*\*SUBTITLE:\*\*\s*([^\n*]+)/);
        const subtitle = subtitleMatch ? subtitleMatch[1].trim() : '';
        
        // ✅ UPDATED: Extract EXAMPLE_1 (first example with 2-line justification)
        const exampleMatch = section.match(/\*\*EXAMPLE_1:\*\*\s*(.+?)(?=\*\*EXAMPLE_2:|\*\*WEAKNESS_|\*\*$|$)/s);
        const exampleText = exampleMatch ? exampleMatch[1].trim() : '';
        
        // Parse the example to extract opponent, move number, and 2-line justification
        let gameInfo = '';
        let mistake = '';
        
        if (exampleText) {
          // Extract: "vs. [opponent] (Move [number]) - Mistake: [2-line justification]"
          // First, extract the opponent and move number
          const headerMatch = exampleText.match(/vs\.\s*(\w+).*?\(Move\s+(\d+)\)/);
          
          if (headerMatch) {
            const opponent = headerMatch[1];
            const moveNum = headerMatch[2];
            gameInfo = `vs. ${opponent} (Move ${moveNum})`;
            
            // Now extract everything after "Mistake:" as the 2-line justification
            const mistakeStart = exampleText.indexOf('Mistake:');
            if (mistakeStart !== -1) {
              mistake = exampleText.substring(mistakeStart + 8).trim();
            } else {
              mistake = exampleText;
            }
          } else {
            // Fallback: try to extract just the mistake part
            const mistakeIdx = exampleText.indexOf('Mistake:');
            if (mistakeIdx !== -1) {
              mistake = exampleText.substring(mistakeIdx + 8).trim();
            } else {
              mistake = exampleText;
            }
          }
        }
        
        const betterPlan = ''; // No longer used in new format, but kept for compatibility
         
        const fen = '';
        
        console.log(`   📍 Game Info: "${gameInfo}"`);
        console.log(`   ❌ 2-Line Justification: "${mistake.substring(0, 100)}..."`);
        console.log(`   ✅ Subtitle: "${subtitle.substring(0, 100)}..."`);
        console.log(`   ♟️ Example Text: "${exampleText.substring(0, 100)}..."`);
         
        // ✅ UPDATED: Validate new format - must have GAME_INFO with "vs. opponent (Move X)"
        const hasSpecificMoves = gameInfo.includes('vs.') && gameInfo.includes('Move');
        // ✅ ENHANCED: Smart validation - Check for specific chess concepts first
        const specificChessConcepts = [
          'Prophylactic', 'Minority Attack', 'Outpost', 'Backward Pawn', 'Isolated Pawn', 'Doubled Pawn',
          'Color Complex', 'Pawn Lever', 'Restriction', 'Domination', 'Initiative', 'Zugzwang', 
          'Triangulation', 'Opposition', 'Lucena', 'Philidor', 'Vancura', 'Overprotection', 'Blockade', 
          'Centralization', 'Weak Square', 'Half-Open File', 'Bishop Pair', 'Knight Maneuvering', 
          'Stonewall', 'Maróczy Bind', 'Hedgehog', 'Dragon Sicilian', 'French Defense', 'Caro-Kann',
          'Hanging Pawn', 'Pawn Chain', 'Pawn Storm', 'Fianchetto', 'En Passant', 'Castling Rights',
          'Pin', 'Fork', 'Skewer', 'Discovery', 'Deflection', 'Decoy', 'Clearance', 'Interference',
          'X-Ray', 'Battery', 'Sacrifice', 'Exchange Sacrifice', 'Positional Sacrifice', 'Compensation',
          'Material Imbalance', 'Dynamic Factor', 'Static Advantage', 'Tempo', 'Space Advantage',
          'Open File', 'Semi-Open File', 'Seventh Rank', 'Back Rank', 'Promotion', 'Underpromotion',
          'Endgame Technique', 'King Activity', 'Pawn Breakthrough', 'Passed Pawn', 'Outside Passed Pawn',
          'Protected Passed Pawn', 'Connected Pawns', 'Pawn Majority', 'Pawn Minority', 'Pawn Island'
        ];
        
        // Check if title contains specific chess concepts (priority check)
        const hasSpecificChessConcept = specificChessConcepts.some(concept => title.includes(concept));
        
        // Only check for generic terms if no specific concept is found
        const purelyGenericTerms = ['Activity', 'Evaluation', 'Breaks', 'Trading', 'Safety'];
        const isPurelyGeneric = !hasSpecificChessConcept && purelyGenericTerms.some(term => title.includes(term));
        
        // ✅ SMART VALIDATION: Accept if has specific chess concept, even if contains generic words
        const isValidTitle = hasSpecificChessConcept || !isPurelyGeneric;
        
        
        // ✅ RELAXED: Check for chess terminology in mistake description
        const lowerMistake = mistake.toLowerCase();
        const hasChessTerminology = lowerMistake.includes('pawn') || lowerMistake.includes('piece') || lowerMistake.includes('square') ||
          lowerMistake.includes('file') || lowerMistake.includes('rank') || lowerMistake.includes('diagonal') ||
          lowerMistake.includes('center') || lowerMistake.includes('flank') || lowerMistake.includes('attack') ||
          lowerMistake.includes('defense') || lowerMistake.includes('position') || lowerMistake.includes('move') ||
          lowerMistake.includes('king') || lowerMistake.includes('queen') || lowerMistake.includes('rook') ||
          lowerMistake.includes('bishop') || lowerMistake.includes('knight') || lowerMistake.includes('castle') ||
          lowerMistake.includes('check') || lowerMistake.includes('mate') || lowerMistake.includes('capture') ||
          lowerMistake.includes('sacrifice') || lowerMistake.includes('exchange') || lowerMistake.includes('development') ||
          lowerMistake.includes('initiative') || lowerMistake.includes('tempo') || lowerMistake.includes('space') ||
          lowerMistake.includes('weakness') || lowerMistake.includes('strength') || lowerMistake.includes('control');
        
        if (!hasSpecificMoves) {
          console.log('❌ No specific game info found - AI analysis failed');
          console.log(`   Expected format: "vs. [opponent] (Move X)" but got: "${gameInfo}"`);
          throw new Error('AI failed to provide specific game analysis with opponent and move number');
         }
        
        if (!isValidTitle) {
          console.log('❌ Invalid title detected:', title);
          console.log('Has specific chess concept:', hasSpecificChessConcept);
          console.log('Is purely generic:', isPurelyGeneric);
          throw new Error('AI used generic title without specific chess terminology');
        }
        
        if (!hasChessTerminology) {
          console.log('❌ No chess terminology found in examples');
          throw new Error('AI failed to use chess terminology in analysis');
        }
        if (!mistake) {
          console.log('❌ Missing 2-line justification');
          throw new Error('AI failed to provide 2-line justification for mistakes');
        }
        
        // ✅ NEW FORMAT: Store weakness with new structure (with 2-line justification)
          
        
        weaknesses.push({
          title,
          subtitle,
          gameInfo,
           mistake, // Now contains the 2-line justification
          betterPlan: betterPlan || '',
          fen: fen || null
        });
      }
      
      console.log('✅ Successfully parsed', weaknesses.length, 'weaknesses with specific moves');
      
      if (weaknesses.length === 0) {
        console.warn('⚠️ No weaknesses parsed from Gemini response - returning empty array');
        console.warn('💡 This means Gemini did not identify any recurring weaknesses in the provided games');
        // ✅ PRODUCTION: Return empty array - no fallback weaknesses
        return [];
      }
      
      console.log('🎯 GAME DIVERSITY RESULTS:');
  console.log(`   Total weaknesses: ${weaknesses.length}`);
  console.log(`   Unique opponents: ${usedOpponents.size}`);
  console.log(`   Duplicate indices: [${duplicateGameIndices.join(', ')}]`);
  console.log(`   Used opponents: [${Array.from(usedOpponents).join(', ')}]`);
  
  // Log each weakness for debugging
  weaknesses.forEach((weakness, index) => {
    console.log(`   Weakness ${index + 1}: "${weakness.title}"`);
    console.log(`   Game Info: "${weakness.gameInfo}"`);
  });
  
  // TODO: Actually handle duplicates by requesting different examples from Gemini
  if (duplicateGameIndices.length > 0) {
    console.log('⚠️ WARNING: Found duplicate games but not handling them yet. This is why examples are from the same game!');
  }
  
  return weaknesses;
      
    } catch (error) {
      console.error('❌ Error parsing weakness response:', error);
      console.warn('⚠️ Gemini weakness parsing failed - returning empty array');
      console.warn('💡 Check Gemini response format or try regenerating the report');
      
      // ✅ PRODUCTION: Return empty array on error - no fallback weaknesses
      return [];
    }
  };

  // ✅ PRODUCTION: Fallback weaknesses removed - we only use Gemini-generated weaknesses
  // This function is deprecated and should not be called
  const createFallbackWeaknesses_DEPRECATED = (analysisText) => {
    console.warn('⚠️ createFallbackWeaknesses called but is deprecated - returning empty array');
    return [];
  };

  // If loading, show the full-screen loading component
  if (progressStage) {
    return <LoadingScreen progressPercent={progressPercent} currentStep={currentStep} stockfishProgress={stockfishProgress} />;
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-['-apple-system','BlinkMacSystemFont','SF Pro Display','Helvetica Neue','Arial','sans-serif'] pt-24 px-4 pb-8">
      
      {/* ✅ PHASE 2: Subscription Status Banner */}
      {user && !profileLoading && (
        <div className="max-w-4xl mx-auto mb-5 mt-3">
          {!hasActiveSubscription() ? (
            // Free tier user
            hasClaimedFreeReport() ? (
              // Free report already used - show upgrade prompt
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200 rounded-xl p-4 shadow-md">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <Lock className="w-5 h-5 text-orange-600" />
                    <div>
                      <p className="font-semibold text-gray-800">Free Report Used</p>
                      <p className="text-sm text-gray-600">Subscribe to unlock weekly puzzle drops and fresh reports</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/pricing')}
                    className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-lg hover:from-orange-600 hover:to-amber-600 transition-all shadow-md hover:shadow-lg"
                  >
                    View Plans
                  </button>
                </div>
              </div>
            ) : (
              // Free report still available
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    1
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">Free Report Available</p>
                    <p className="text-sm text-gray-600">You have 1 free report remaining. Subscribe for unlimited access!</p>
                  </div>
                </div>
              </div>
            )
          ) : (
            // Subscribed user
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-xl p-4 shadow-md">
              <div className="flex items-center gap-3">
                <Crown className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="font-semibold text-gray-800">
                    {getSubscriptionTier().charAt(0).toUpperCase() + getSubscriptionTier().slice(1)} Plan Active
                  </p>
                  <p className="text-sm text-gray-600">
                    {profile?.subscription_expires_at 
                      ? `Expires: ${new Date(profile.subscription_expires_at).toLocaleDateString()}`
                      : getSubscriptionDescription()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-center items-start py-4">
      <style jsx>{`
        :root {
          --primary-color: #E9823A;
          --secondary-color: #FF9500;
          --background-color: #F8F9FA;
          --card-bg-color: rgba(255, 255, 255, 0.9);
          --text-color: #333;
          --text-light-color: #6c757d;
          --border-color: rgba(233, 130, 58, 0.2);
          --success-color: #28a745;
          --shadow-color: rgba(233, 130, 58, 0.15);
        }
        
        .card {
          background: var(--card-bg-color);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          padding: 2rem;
          border-radius: 20px;
          box-shadow: 0 8px 32px var(--shadow-color);
          text-align: center;
          width: 100%;
          max-width: 1000px;
          margin: 0 1rem;
          transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .steps-container {
          display: flex;
          justify-content: space-around;
          margin-bottom: 2rem;
          gap: 1rem;
          padding: 0;
          flex-wrap: wrap;
        }
        
        .step {
          flex: 1;
          min-width: 190px;
          padding: 1.25rem 1rem;
          background: linear-gradient(135deg, #FFF9F5 0%, #FFFFFF 100%);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-radius: 12px;
          border: 1px solid rgba(233, 130, 58, 0.1);
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        
        .step:hover {
          transform: translateY(-1px);
          background: linear-gradient(135deg, #FFF2E8 0%, #FFFFFF 100%);
          box-shadow: 0 4px 20px rgba(233, 130, 58, 0.15);
        }
        
        .step .number {
          font-size: 2rem;
          font-weight: 600;
          color: var(--primary-color);
          line-height: 1;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        }
        
        .step h3 {
          font-size: 1.05rem;
          font-weight: 600;
          margin-top: 0.75rem;
          margin-bottom: 0.35rem;
          color: var(--text-color);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
        }
        
        .step p {
          font-size: 0.9rem;
          color: var(--text-light-color);
          margin: 0;
          line-height: 1.4;
          font-weight: 400;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
        }
        
        .input-group {
          position: relative;
          margin-bottom: 0.5rem;
        }
        
        .platform-selection {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }
        
        .platform-btn {
          padding: 0.8rem 1.5rem;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          font-weight: 500;
          font-size: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-color);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
          min-width: 140px;
          justify-content: center;
        }
        
        .platform-btn.active {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
          box-shadow: 0 2px 8px rgba(233, 130, 58, 0.3);
        }
        
        .platform-btn:hover {
          background: linear-gradient(135deg, #FFF9F5 0%, #FFF2E8 100%);
          border-color: var(--primary-color);
          color: var(--primary-color);
        }
        
        .platform-btn.active:hover {
          background: #d6732f;
          color: white;
        }
        
        .platform-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .input-row {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.25rem;
          flex-wrap: wrap;
        }
        
        .username-input-container {
          flex: 2;
          min-width: 250px;
          display: flex;
          gap: 0.5rem;
          align-items: stretch;
        }
        
        .username-input {
          flex: 1;
          padding: 1rem 1.2rem;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 400;
          transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: var(--text-color);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
        }
        
        .username-input:focus {
          outline: none;
          border-color: var(--primary-color);
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 0 0 3px rgba(233, 130, 58, 0.1);
        }
        
        .username-input.valid {
          border-color: #28a745;
          background: rgba(40, 167, 69, 0.05);
        }
        
        .username-input.invalid {
          border-color: #dc3545;
          background: rgba(220, 53, 69, 0.05);
        }
        
        .validate-btn {
          padding: 0.75rem 1rem;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
          background: rgba(255, 255, 255, 0.9);
          color: var(--text-color);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          white-space: nowrap;
          min-width: 120px;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
        }
        
        .validate-btn:hover:not(:disabled) {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }
        
        .validate-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .validate-btn:has(.mr-1) {
          color: #28a745;
          border-color: #28a745;
          background: rgba(40, 167, 69, 0.1);
        }
        
        .validate-btn:has(.mr-1):hover {
          background: rgba(40, 167, 69, 0.2);
        }
        
        .games-input {
          flex: 1;
          min-width: 120px;
          padding: 1rem 1.2rem;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 400;
          transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: var(--text-color);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
        }
        
        .games-input:focus {
          outline: none;
          border-color: var(--primary-color);
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 0 0 3px rgba(233, 130, 58, 0.1);
        }
        
        .analyze-btn {
          width: 100%;
          padding: 1rem 2rem;
          border: none;
          background: var(--primary-color);
          color: white;
          border-radius: 8px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          margin-top: 1rem;
          box-shadow: 0 2px 8px rgba(233, 130, 58, 0.3);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
        }
        
        .analyze-btn:hover:not(:disabled) {
          background: #d6732f;
          box-shadow: 0 4px 12px rgba(233, 130, 58, 0.4);
        }
        
        .analyze-btn:active:not(:disabled) {
          transform: scale(0.98);
        }
        
        .analyze-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .disclaimer {
          font-size: 0.9rem;
          color: var(--text-light-color);
          margin-top: 1rem;
          line-height: 1.4;
          font-weight: 400;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
        }
        
        .loading-list {
          list-style: none;
          text-align: left;
          font-size: 1.1rem;
          margin-top: 2rem;
          padding: 0;
        }
        
        .loading-list li {
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          padding: 0.8rem 1.2rem;
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
          font-weight: 500;
        }
        
        .loading-list li.completed {
          background: rgba(40, 167, 69, 0.1);
          border-color: rgba(40, 167, 69, 0.3);
          color: var(--text-color);
        }
        
        .loading-list .icon {
          margin-right: 1rem;
          width: 20px;
          text-align: center;
          color: var(--text-light-color);
          transition: color 0.3s ease;
        }
        
        .loading-list li.completed .icon {
          color: var(--success-color);
        }

        /* Mobile Responsive Styles */
        @media (max-width: 768px) {
          .card {
            padding: 1.25rem;
            margin: 0 0.5rem;
            max-width: calc(100vw - 1rem);
          }
          
          .steps-container {
            flex-direction: column;
            gap: 1rem;
            margin-bottom: 1.5rem;
          }
          
          .step {
            min-width: auto;
            padding: 1rem;
          }
          
          .step .number {
            font-size: 1.7rem;
          }
          
          .step h3 {
            font-size: 1rem;
          }
          
          .step p {
            font-size: 0.875rem;
          }
          
          .platform-selection {
            flex-direction: column;
            gap: 0.75rem;
          }
          
          .platform-btn {
            width: 100%;
            min-width: auto;
            padding: 1rem;
          }
          
          .input-row {
            flex-direction: column;
            gap: 1rem;
          }
          
          .username-input-container {
            width: 100%;
            min-width: auto;
            flex: none;
            /* Stack input and button on small screens */
            flex-direction: column;
            align-items: stretch;
          }
          
          .username-input,
          .games-input {
            width: 100%;
            min-width: auto;
            flex: none;
          }
          
          .validate-btn {
            min-width: 100px;
            font-size: 0.85rem;
            padding: 0.75rem 0.75rem;
          }
        }

        @media (max-width: 480px) {
          .card {
            padding: 1.5rem;
            margin: 0 0.25rem;
            border-radius: 15px;
          }
          
          h1 {
            font-size: 2.1rem !important;
            line-height: 1.2 !important;
          }
          
          h2 {
            font-size: 1.15rem !important;
            margin-bottom: 1.5rem !important;
          }
          
          .step {
            padding: 1.1rem;
          }
          
          .step .number {
            font-size: 1.7rem;
          }
          
          .username-input,
          .games-input,
          .platform-btn {
            padding: 0.875rem 1rem;
            font-size: 0.95rem;
          }
          
          .analyze-btn {
            padding: 0.875rem 1.5rem;
            font-size: 1rem;
          }
          
          .disclaimer {
            font-size: 0.85rem;
          }
        }
      `}</style>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="card"
        >
          <h1 style={{ 
            fontSize: '2.4rem', 
            fontWeight: 700, 
            color: 'var(--primary-color)', 
            lineHeight: 1.1, 
            marginBottom: '0.5rem',
            fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Display, sans-serif',
            letterSpacing: '-0.02em'
          }}>
            Stop Guessing. Start Improving.
          </h1>
          <h2 style={{ 
            fontSize: '1.2rem', 
            fontWeight: 400, 
            marginBottom: '1.75rem', 
            color: 'var(--text-light-color)',
            fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Text, sans-serif'
          }}>
            Your Personal AI Chess Coach is Here.
          </h2>

          <div className="steps-container">
            <div className="step">
              <div className="number">1</div>
              <h3>Connect Your Account</h3>
              <p>Enter your username</p>
            </div>
            <div className="step">
              <div className="number">2</div>
              <h3>Get Instant Analysis</h3>
              <p>Our AI finds your weaknesses</p>
            </div>
            <div className="step">
              <div className="number">3</div>
              <h3>Train Smarter</h3>
              <p>Solve personalized puzzles</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Platform Selection */}
            <div className="platform-selection">
              {platforms.map((platform) => (
                <button
                  key={platform.value}
                  type="button"
                  onClick={() => handlePlatformSelect(platform.value)}
                  disabled={isLoading}
                  className={`platform-btn ${formData.platform === platform.value ? 'active' : ''}`}
                >
                  <span style={{ fontSize: '1.1rem', fontWeight: '500' }}>{platform.icon}</span>
                  {platform.label}
                </button>
              ))}
            </div>

            {/* Username and Games Input Row */}
            <div className="input-row">
              <div className="username-input-container">
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder={`Enter Your ${formData.platform === 'lichess' ? 'Lichess' : formData.platform === 'chess.com' ? 'Chess.com' : 'Lichess or Chess.com'} Username`}
                  className={`username-input ${userValidationStatus === 'valid' ? 'valid' : userValidationStatus === 'invalid' ? 'invalid' : ''}`}
                  disabled={isLoading || isValidatingUser}
                />
                <button
                  type="button"
                  onClick={handleValidateUsername}
                  disabled={isLoading || isValidatingUser || !formData.username.trim() || !formData.platform}
                  className="validate-btn"
                >
                  {isValidatingUser ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Loader2 className="animate-spin mr-1" size={16} />
                      Checking...
                    </div>
                  ) : userValidationStatus === 'valid' ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle size={16} className="mr-1" />
                      Valid
                    </div>
                  ) : userValidationStatus === 'invalid' ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <XCircle size={16} className="mr-1" />
                      Invalid
                    </div>
                  ) : (
                    'Validate User'
                  )}
                </button>
              </div>
              <input
                type="number"
                name="numberOfGames"
                value={formData.numberOfGames}
                onChange={handleInputChange}
                min="20"
                max="50"
                placeholder="Games (20-50)"
                className="games-input"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !formData.platform || !formData.username || userValidationStatus !== 'valid'}
              className="analyze-btn"
            >
              {isLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 className="animate-spin mr-2" size={20} />
                  Analyzing Games...
                </div>
              ) : userValidationStatus !== 'valid' ? (
                'Validate Username First'
              ) : (
                'Analyze Games'
              )}
            </button>
          </form>

          <p className="disclaimer">
            We only need your username to find your public games. We never ask for your password.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

// ✅ UNIFIED: Single comprehensive Gemini API call that does everything (with optional Stockfish integration)
const callUnifiedGeminiAPI = async (gamesData, formData) => {
  console.log('Starting UNIFIED Gemini analysis - Single call for all analysis types');
  
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('Gemini API key not configured. Please add your API key to the .env file.');
  }
  
  // ✅ CAPTURE CORRECT METRICS: Get the correct win rate and accuracy from game statistics
  const gameStats = calculateGameStatistics(gamesData, formData);
  const correctWinRate = parseFloat(gameStats.winRate);
  const correctAccuracy = parseFloat(gameStats.averageAccuracy) || 0;
  
  console.log(`🎯 CAPTURING CORRECT METRICS FROM GAME STATISTICS:`);
  console.log(`   Correct Win Rate: ${correctWinRate}%`);
  console.log(`   Correct Accuracy: ${correctAccuracy}%`);
  
  // Create comprehensive prompt that combines all analysis types
  const unifiedPrompt = await createUnifiedAnalysisPrompt(gamesData, formData);
  

  console.log('🎯 Sending single comprehensive request to Gemini...');
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: unifiedPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 16384 // Increased for comprehensive response
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
    console.error('❌ Unified Gemini API Error:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    console.error('❌ Invalid unified Gemini response structure:', data);
    throw new Error('Invalid response structure from Gemini');
  }

  const analysisText = data.candidates[0].content.parts[0].text;
  console.log('✅ Unified Gemini response received, length:', analysisText.length);
  
  // Parse the comprehensive response into separate components
  const parsedResult = parseUnifiedGeminiResponse(analysisText, gamesData, formData);
  
  // ✅ INJECT CORRECT METRICS: Use Gemini-calculated accuracy if available, otherwise use basic calculation
  const finalAccuracy = parsedResult.calculatedAccuracy || correctAccuracy;
  
  const finalResult = {
    ...parsedResult,
    calculatedWinRate: correctWinRate,
    calculatedAccuracy: finalAccuracy,
    geminiCalculatedAccuracy: parsedResult.calculatedAccuracy, // Store Gemini's calculation separately
    basicCalculatedAccuracy: correctAccuracy // Store basic calculation for comparison
    
  };
  
  console.log(`🎯 ACCURACY COMPARISON:`);
  console.log(`   Basic Calculation: ${correctAccuracy}%`);
  console.log(`   Gemini Calculation: ${parsedResult.calculatedAccuracy || 'Not provided'}%`);
  console.log(`   Final Accuracy Used: ${finalAccuracy}%`);
  
  console.log('✅ Unified analysis parsing complete with correct metrics:', {
    hasMainAnalysis: !!finalResult.mainAnalysis,
    hasWeaknesses: finalResult.recurringWeaknesses?.length || 0,
    hasFocusArea: !!finalResult.focusArea,
    hasPerformanceMetrics: !!finalResult.performanceMetrics,
    correctWinRate: correctWinRate,
    correctAccuracy: correctAccuracy
  });
  
  return finalResult;
};

// ✅ HEURISTIC PATTERN ANALYSIS: Advanced pattern detection without Stockfish
const analyzeRecurringPatterns = async (gamesData, username) => {
  console.log('🔍 Starting heuristic pattern analysis...');
  
  const allMistakes = [];
  
  // Analyze ALL games for common mistake patterns (no hardcoded limit)
  gamesData.forEach(gameObj => {
    // Skip if game data is missing or invalid
    if (!gameObj || !gameObj.gameInfo) {
      console.warn('Skipping invalid game object:', gameObj);
      return;
    }
    
    const gameInfo = gameObj.gameInfo;
    const gameContext = gameObj.gameContext || {};
    const fenPositions = gameObj.allFenPositions || gameObj.fenPositions || [];
    
    // Skip if essential game data is missing
    if (!gameInfo.white || !gameInfo.black) {
      console.warn('Skipping game with missing player data:', gameInfo);
      return;
    }
    
    const opponent = gameInfo.white === username ? 
      (gameInfo.black || 'Unknown') : 
      (gameInfo.white || 'Unknown');
    
    const isPlayerWhite = gameInfo.white === username;
    
    console.log(`🔍 Analyzing Game ${gameObj.gameIndex} vs. ${opponent}...`);
    
    // Analyze moves for common patterns (skip early opening moves)
    for (let i = 1; i < fenPositions.length; i++) {
      const currentPos = fenPositions[i];
      const previousPos = fenPositions[i - 1];
      
      if (!currentPos.fen || !previousPos.fen || !currentPos.move) continue;
      
      // Skip early opening moves (moves 1-8) where 1500+ players rarely make real mistakes
      if (currentPos.moveNumber <= 8) continue;
      
      // Only analyze player's moves
      const isPlayerMove = (currentPos.turn === 'white' && !isPlayerWhite) || 
                          (currentPos.turn === 'black' && isPlayerWhite);
      
      if (!isPlayerMove) continue;
      
      // Detect various mistake patterns
      const mistakePatterns = detectMistakePatterns(currentPos, previousPos, fenPositions, i);
      
      if (mistakePatterns.length > 0) {
        console.log(`🔍 Game ${gameObj.gameNumber || gameObj.gameIndex} Move ${currentPos.moveNumber}: Found ${mistakePatterns.length} patterns for ${currentPos.move}`);
      }
      
      mistakePatterns.forEach(pattern => {
        // Get position context and move sequence
        const positionContext = getPositionContext(fenPositions, i, currentPos);
        const opponentThreat = analyzeOpponentThreat(fenPositions, i, isPlayerWhite);
        const consequences = analyzeConsequences(fenPositions, i);
        
        allMistakes.push({
          gameNumber: gameObj.gameNumber || gameObj.gameIndex,
          opponent: opponent,
          moveNumber: currentPos.moveNumber,
          move: currentPos.move,
          mistakeType: pattern.type,
          description: pattern.description,
          betterPlan: pattern.betterPlan || null,
          severity: pattern.severity,
          // Enhanced context
          positionContext: positionContext,
          opponentThreat: opponentThreat,
          consequences: consequences,
          fen: currentPos.fen,
          previousMoves: positionContext.leadingMoves,
          followUpMoves: positionContext.followUpMoves
        });
      });
    }
  });
  

  
  // Group mistakes by type and find recurring patterns
  const patternGroups = {};
  
  allMistakes.forEach(mistake => {
    const key = mistake.mistakeType;
    if (!patternGroups[key]) {
      patternGroups[key] = [];
    }
    patternGroups[key].push(mistake);
  });
  
  // Convert to recurring patterns (appearing in multiple games)
  const recurringPatterns = [];
  
  Object.entries(patternGroups).forEach(([type, mistakes]) => {
    const uniqueGames = [...new Set(mistakes.map(m => m.gameNumber))];
    const totalGames = gamesData.length;
    const recurrenceRate = uniqueGames.length / totalGames;
    
    // Dynamic threshold: pattern must appear in at least 25% of games OR at least 2 games (whichever is lower)
    const minGamesThreshold = Math.max(2, Math.ceil(totalGames * 0.25));
    
    if (uniqueGames.length >= Math.min(minGamesThreshold, 2)) {
      // ✅ FIX: Select examples from different games, not just the first 3 mistakes
      const examplesByGame = {};
      
      // Group mistakes by game number
      mistakes.forEach(mistake => {
        if (!examplesByGame[mistake.gameNumber]) {
          examplesByGame[mistake.gameNumber] = [];
        }
        examplesByGame[mistake.gameNumber].push(mistake);
      });
      
      // Select one example from each game (up to 3 different games)
      const examples = [];
      const gameNumbers = Object.keys(examplesByGame).slice(0, 3);
      
      gameNumbers.forEach(gameNumber => {
        // Take the first (or most severe) mistake from this game
        const gameExamples = examplesByGame[gameNumber];
        const bestExample = gameExamples.sort((a, b) => (b.severity || 0) - (a.severity || 0))[0];
        
        examples.push({
          gameNumber: bestExample.gameNumber,
          opponent: bestExample.opponent,
          moveNumber: bestExample.moveNumber,
          move: bestExample.move,
          description: bestExample.description,
          betterPlan: bestExample.betterPlan,
          // Enhanced context
          positionContext: bestExample.positionContext,
          opponentThreat: bestExample.opponentThreat,
          consequences: bestExample.consequences,
          fen: bestExample.fen,
          previousMoves: bestExample.previousMoves,
          followUpMoves: bestExample.followUpMoves
        });
      });
      
      console.log(`🎯 Pattern "${type}": Selected examples from ${examples.length} different games: ${examples.map(ex => `Game ${ex.gameNumber}`).join(', ')}`);
      
      recurringPatterns.push({
        type: type,
        frequency: uniqueGames.length,
        totalOccurrences: mistakes.length,
        recurrenceRate: (recurrenceRate * 100).toFixed(1),
        description: getPatternDescription(type, mistakes),
        examples: examples
      });
    }
  });
  
  // Sort by frequency (most recurring first)
  recurringPatterns.sort((a, b) => b.frequency - a.frequency);
  
  console.log(`🎯 Found ${recurringPatterns.length} recurring patterns`);
  recurringPatterns.forEach(pattern => {
    console.log(`- ${pattern.type}: ${pattern.frequency}/${gamesData.length} games (${pattern.recurrenceRate}%), ${pattern.totalOccurrences} total occurrences`);
    console.log(`  Examples: ${pattern.examples.map(ex => `Game ${ex.gameNumber} Move ${ex.moveNumber}: ${ex.move}`).join(', ')}`);
    
    // ✅ VERIFY: Check that examples come from different games
    const exampleGameNumbers = pattern.examples.map(ex => ex.gameNumber);
    const uniqueExampleGames = [...new Set(exampleGameNumbers)];
    if (uniqueExampleGames.length !== pattern.examples.length) {
      console.warn(`⚠️ WARNING: Pattern "${pattern.type}" has examples from duplicate games!`);
    } else {
      console.log(`  ✅ VERIFIED: Examples come from ${uniqueExampleGames.length} different games`);
    }
  });
  
  // If no recurring patterns found, analyze for highest CP loss moves as fallback
  if (recurringPatterns.length === 0) {
    console.log('🔍 No recurring patterns found, analyzing for highest CP loss moves...');
    const highestLossMoves = await findHighestCPLossMoves(gamesData, username);
    return highestLossMoves;
  }
  
  return recurringPatterns.slice(0, 3); // Return top 3 patterns
};

const detectMistakePatterns = (currentPos, previousPos, allPositions, currentIndex) => {
  const patterns = [];
  const move = currentPos.move;
  const fen = currentPos.fen;
  const moveNumber = currentPos.moveNumber;
  
  // Advanced chess concepts for 1500+ players
  
  // Pattern 1: Pawn Breaks and Pawn Tension Management
  const pawnBreakIssues = analyzePawnBreaksAndTension(move, fen, previousPos.fen, moveNumber, allPositions, currentIndex);
  patterns.push(...pawnBreakIssues);
  
  // Pattern 2: Trade Evaluation and Piece Value Assessment
  const tradeEvaluationErrors = analyzeTradeEvaluation(move, fen, previousPos.fen, moveNumber);
  patterns.push(...tradeEvaluationErrors);
  
  // Pattern 3: Piece Activity vs. Passivity (Good vs. Bad Pieces)
  const pieceActivityIssues = analyzePieceActivity(move, fen, moveNumber, allPositions, currentIndex);
  patterns.push(...pieceActivityIssues);
  
  // Pattern 4: Prophylactic Thinking and Opponent's Plans
  const prophylacticErrors = analyzeProphylacticThinking(move, fen, previousPos.fen, moveNumber, allPositions, currentIndex);
  patterns.push(...prophylacticErrors);
  
  // Pattern 5: Space and Central Control
  const spaceControlIssues = analyzeSpaceAndCentralControl(move, fen, moveNumber);
  patterns.push(...spaceControlIssues);
  
  // Pattern 6: Weak Square Creation and Exploitation
  const weakSquareIssues = analyzeWeakSquareCreation(move, fen, previousPos.fen, moveNumber);
  patterns.push(...weakSquareIssues);
  
  // Pattern 7: Initiative and Tempo Management
  const initiativeIssues = analyzeInitiativeAndTempo(move, fen, moveNumber, allPositions, currentIndex);
  patterns.push(...initiativeIssues);
  
  return patterns;
};

// Advanced Chess Concept Analyzers for 1500+ Players

const analyzePawnBreaksAndTension = (move, fen, previousFen, moveNumber, allPositions, currentIndex) => {
  const patterns = [];
  
  if (moveNumber <= 12) return patterns;
  
  // Detect pawn breaks and tension management with specific alternatives
  if (move.charAt(0).toLowerCase() === move.charAt(0)) { // Pawn move
    
    // Missing central pawn breaks - suggest specific alternatives
    if (moveNumber > 15 && moveNumber < 30) {
      if (move.includes('d4') || move.includes('d5') || move.includes('e4') || move.includes('e5')) {
        const recentMoves = allPositions.slice(Math.max(0, currentIndex - 10), currentIndex)
          .map(p => p.move).filter(Boolean);
        
        const hasPreparation = recentMoves.some(m => 
          m.includes('c') || m.includes('f') || m.startsWith('N') || m.startsWith('B')
        );
        
        if (!hasPreparation) {
          const betterMoves = getBetterPawnBreakPreparation(move, fen);
          patterns.push({
            type: 'Premature Pawn Break',
            description: `Central break ${move} without adequate preparation`,
            betterPlan: `Better Plan: Prepare the break first with moves like ${betterMoves.join(' or ')} to support the advance`,
            severity: 'moderate'
          });
        }
      }
    }
    
    // Resolving tension incorrectly - suggest maintaining tension
    if (move.includes('x') && (move.includes('d') || move.includes('e'))) {
      const tensionAlternatives = getTensionAlternatives(move, fen, moveNumber);
      patterns.push({
        type: 'Pawn Tension Resolution',
        description: `Resolved central tension with ${move} - timing may be suboptimal`,
        betterPlan: `Better Plan: ${tensionAlternatives.suggestion} to maintain flexibility and improve piece coordination first`,
        severity: 'moderate'
      });
    }
    
    // Wing advances without central control
    if (moveNumber > 20 && (move.includes('a4') || move.includes('h4') || move.includes('a5') || move.includes('h5'))) {
      patterns.push({
        type: 'Wing Expansion Without Center',
        description: `Wing advance ${move} while central control may be insufficient`,
        betterPlan: `Better Plan: Strengthen central control first with moves like Nd5, Be3, or Qd2 before wing expansion`,
        severity: 'moderate'
      });
    }
  }
  
  return patterns;
};

// Enhanced context analysis functions
const getPositionContext = (fenPositions, currentIndex, currentPos) => {
  const context = {
    phase: getGamePhase(currentPos.moveNumber),
    leadingMoves: [],
    followUpMoves: [],
    materialBalance: 'Unknown',
    castlingStatus: 'Unknown'
  };
  
  // Get 3 moves leading up to the mistake
  const startIndex = Math.max(0, currentIndex - 6);
  for (let i = startIndex; i < currentIndex; i++) {
    if (fenPositions[i] && fenPositions[i].move) {
      context.leadingMoves.push({
        moveNumber: fenPositions[i].moveNumber,
        move: fenPositions[i].move,
        turn: fenPositions[i].turn
      });
    }
  }
  
  // Get 3 moves after the mistake to show consequences
  const endIndex = Math.min(fenPositions.length, currentIndex + 7);
  for (let i = currentIndex + 1; i < endIndex; i++) {
    if (fenPositions[i] && fenPositions[i].move) {
      context.followUpMoves.push({
        moveNumber: fenPositions[i].moveNumber,
        move: fenPositions[i].move,
        turn: fenPositions[i].turn
      });
    }
  }
  
  // Analyze material and position from FEN
  if (currentPos.fen) {
    context.materialBalance = analyzeMaterialFromFEN(currentPos.fen);
    context.castlingStatus = analyzeCastlingFromFEN(currentPos.fen);
  }
  
  return context;
};

const analyzeOpponentThreat = (fenPositions, currentIndex, isPlayerWhite) => {
  const threat = {
    type: 'Unknown',
    description: 'Opponent threat analysis',
    urgency: 'Low',
    targetSquares: []
  };
  
  // Look at opponent's recent moves to identify threats
  const recentOpponentMoves = [];
  for (let i = Math.max(0, currentIndex - 8); i < currentIndex; i++) {
    const pos = fenPositions[i];
    if (pos && pos.move) {
      // Check if it's opponent's move
      const isOpponentMove = (pos.turn === 'white' && !isPlayerWhite) || 
                            (pos.turn === 'black' && isPlayerWhite);
      if (isOpponentMove) {
        recentOpponentMoves.push(pos.move);
      }
    }
  }
  
  // Analyze threat patterns
  if (recentOpponentMoves.length > 0) {
    const lastOpponentMove = recentOpponentMoves[recentOpponentMoves.length - 1];
    
    // Kingside attack patterns
    if (recentOpponentMoves.some(m => m.includes('h') || m.includes('g') || m.includes('Qh') || m.includes('Rh'))) {
      threat.type = 'Kingside Attack';
      threat.description = `Opponent building kingside pressure with moves like ${recentOpponentMoves.slice(-2).join(', ')}`;
      threat.urgency = 'High';
      threat.targetSquares = ['g7', 'h7', 'f7', 'g2', 'h2', 'f2'];
    }
    // Central break preparation
    else if (recentOpponentMoves.some(m => m.includes('d') || m.includes('e') || m.startsWith('N') || m.startsWith('B'))) {
      threat.type = 'Central Break';
      threat.description = `Opponent preparing central advance with ${recentOpponentMoves.slice(-2).join(', ')}`;
      threat.urgency = 'Medium';
      threat.targetSquares = ['d4', 'd5', 'e4', 'e5'];
    }
    // Piece activity increase
    else if (recentOpponentMoves.some(m => m.startsWith('Q') || m.startsWith('R'))) {
      threat.type = 'Piece Activity';
      threat.description = `Opponent improving piece coordination with ${lastOpponentMove}`;
      threat.urgency = 'Medium';
    }
  }
  
  return threat;
};

const analyzeConsequences = (fenPositions, currentIndex) => {
  const consequences = {
    immediate: 'Position evaluation unchanged',
    shortTerm: 'No immediate tactical consequences',
    longTerm: 'Positional implications unclear',
    evaluationChange: 'Unknown'
  };
  
  // Look at the next few moves to see what happened
  const followUpMoves = [];
  for (let i = currentIndex + 1; i < Math.min(fenPositions.length, currentIndex + 6); i++) {
    if (fenPositions[i] && fenPositions[i].move) {
      followUpMoves.push(fenPositions[i].move);
    }
  }
  
  if (followUpMoves.length > 0) {
    // Check for immediate tactical consequences
    if (followUpMoves.some(m => m.includes('x') || m.includes('+'))) {
      consequences.immediate = `Opponent gained tactical opportunities with ${followUpMoves.filter(m => m.includes('x') || m.includes('+')).join(', ')}`;
    }
    
    // Check for material loss
    const captures = followUpMoves.filter(m => m.includes('x'));
    if (captures.length > 0) {
      consequences.shortTerm = `Material exchanges followed: ${captures.join(', ')}`;
    }
    
    // Estimate evaluation change (heuristic)
    if (captures.length >= 2) {
      consequences.evaluationChange = 'Approximately -0.8 to -1.5';
    } else if (followUpMoves.some(m => m.includes('+'))) {
      consequences.evaluationChange = 'Approximately -0.3 to -0.7';
    } else {
      consequences.evaluationChange = 'Approximately -0.2 to -0.5';
    }
  }
  
  return consequences;
};

const getGamePhase = (moveNumber) => {
  if (moveNumber <= 12) return 'Opening';
  if (moveNumber <= 25) return 'Early Middlegame';
  if (moveNumber <= 35) return 'Middlegame';
  if (moveNumber <= 45) return 'Late Middlegame';
  return 'Endgame';
};

const analyzeMaterialFromFEN = (fen) => {
  // Simple material count from FEN
  const position = fen.split(' ')[0];
  const whitePieces = (position.match(/[QRBNP]/g) || []).length;
  const blackPieces = (position.match(/[qrbnp]/g) || []).length;
  
  if (whitePieces === blackPieces) return 'Material Equal';
  if (whitePieces > blackPieces) return `White +${whitePieces - blackPieces}`;
  return `Black +${blackPieces - whitePieces}`;
};

const analyzeCastlingFromFEN = (fen) => {
  const castlingRights = fen.split(' ')[2];
  if (castlingRights === '-') return 'No castling rights';
  return `Castling available: ${castlingRights}`;
};

const createBoardVisualization = (fen) => {
  if (!fen) return 'Board position unavailable';
  
  const position = fen.split(' ')[0];
  const rows = position.split('/');
  
  let board = '    a b c d e f g h\n';
  board += '  ┌─────────────────┐\n';
  
  for (let i = 0; i < 8; i++) {
    const rank = 8 - i;
    board += `${rank} │ `;
    
    let row = rows[i];
    let fileIndex = 0;
    
    for (let char of row) {
      if (char >= '1' && char <= '8') {
        // Empty squares
        const emptyCount = parseInt(char);
        for (let j = 0; j < emptyCount; j++) {
          board += '. ';
          fileIndex++;
        }
      } else {
        // Piece
        board += char + ' ';
        fileIndex++;
      }
    }
    
    board += `│ ${rank}\n`;
  }
  
  board += '  └─────────────────┘\n';
  board += '    a b c d e f g h';
  
  return board;
};

// Helper functions for specific move suggestions
const getBetterPawnBreakPreparation = (move, fen) => {
  const suggestions = [];
  
  if (move.includes('d4') || move.includes('d5')) {
    suggestions.push('Nc3', 'Bf4', 'Qd2', 'Rad1');
  } else if (move.includes('e4') || move.includes('e5')) {
    suggestions.push('Nf3', 'Be3', 'Qe2', 'Rae1');
  }
  
  return suggestions.slice(0, 2); // Return top 2 suggestions
};

const getTensionAlternatives = (move, fen, moveNumber) => {
  if (move.includes('dxe') || move.includes('exd')) {
    return {
      suggestion: "Maintain tension with piece development like Nbd2, Be3, or Qc2",
      reason: "keeping central flexibility"
    };
  } else if (move.includes('cxd') || move.includes('dxc')) {
    return {
      suggestion: "Consider Nf6, Be7, or O-O first",
      reason: "completing development before structural commitments"
    };
  }
  
  return {
    suggestion: "Improve piece coordination before resolving tension",
    reason: "maintaining positional flexibility"
  };
};

const analyzeTradeEvaluation = (move, fen, previousFen, moveNumber) => {
  const patterns = [];
  
  if (moveNumber <= 15) return patterns;
  
  // Analyze piece trades and exchanges with specific alternatives
  if (move.includes('x')) {
    const capturedPiece = move.split('x')[1];
    const capturingPiece = move.charAt(0);
    
    // Advanced piece value considerations
    const pieceValues = { 'Q': 9, 'R': 5, 'B': 3.25, 'N': 3, 'P': 1, '': 1 };
    const capturedValue = pieceValues[capturedPiece?.charAt(0)?.toUpperCase()] || 1;
    const capturingValue = pieceValues[capturingPiece?.toUpperCase()] || 1;
    
    // Bishop vs. Knight trades with specific alternatives
    if ((capturingPiece === 'B' && capturedPiece?.charAt(0) === 'N') ||
        (capturingPiece === 'N' && capturedPiece?.charAt(0) === 'B')) {
      const tradeAlternatives = getBishopKnightAlternatives(move, capturingPiece, fen);
      patterns.push({
        type: 'Minor Piece Trade Evaluation',
        description: `Traded ${capturingPiece} for ${capturedPiece?.charAt(0)} with ${move}`,
        betterPlan: `Better Plan: ${tradeAlternatives.suggestion} - ${tradeAlternatives.reason}`,
        severity: 'moderate'
      });
    }
    
    // Trading active pieces for passive ones
    if (capturingValue === capturedValue && moveNumber > 20) {
      const activityAlternatives = getActivityAlternatives(move, capturingPiece, fen);
      patterns.push({
        type: 'Activity vs. Passivity Trade',
        description: `Equal material trade ${move} may exchange active piece for passive one`,
        betterPlan: `Better Plan: ${activityAlternatives.suggestion} to maintain piece activity and pressure`,
        severity: 'moderate'
      });
    }
    
    // Rook trades in endgame with king activity focus
    if (capturingPiece === 'R' && capturedPiece?.charAt(0) === 'R' && moveNumber > 30) {
      patterns.push({
        type: 'Rook Trade in Endgame',
        description: `Rook trade ${move} in endgame transitions to king and pawn endgame`,
        betterPlan: `Better Plan: Before trading, improve king position with Kg3, Kf3, or centralize king to support pawns`,
        severity: 'moderate'
      });
    }
  }
  
  return patterns;
};

// Helper functions for trade evaluation alternatives
const getBishopKnightAlternatives = (move, capturingPiece, fen) => {
  if (capturingPiece === 'B') {
    return {
      suggestion: "Consider retreating the bishop to e2, d3, or f1 to maintain the bishop pair",
      reason: "bishops are often stronger in open positions and endgames"
    };
  } else {
    return {
      suggestion: "Reposition the knight to d5, f5, or e4 for a strong outpost",
      reason: "knights excel in closed positions and on strong squares"
    };
  }
};

const getActivityAlternatives = (move, capturingPiece, fen) => {
  const alternatives = [];
  
  if (capturingPiece === 'R') {
    alternatives.push("Rd7, Re7, or Rc7 to maintain rook activity on the 7th rank");
  } else if (capturingPiece === 'Q') {
    alternatives.push("Qd5, Qe4, or Qf5 to keep the queen centralized and active");
  } else if (capturingPiece === 'B') {
    alternatives.push("Bd5, Be4, or Bf5 to maintain diagonal control");
  } else if (capturingPiece === 'N') {
    alternatives.push("Nd5, Ne4, or Nf5 for a strong central outpost");
  }
  
  return {
    suggestion: alternatives[0] || "Improve piece coordination before trading",
    reason: "maintaining active piece play is crucial"
  };
};

const analyzePieceActivity = (move, fen, moveNumber, allPositions, currentIndex) => {
  const patterns = [];
  
  if (moveNumber <= 15) return patterns;
  
  // Analyze piece activity with specific improvement suggestions
  const pieceType = move.charAt(0);
  
  // Bishop activity analysis with concrete alternatives
  if (pieceType === 'B') {
    // Bishops moving to passive squares
    if (move.includes('1') || move.includes('8') || move.includes('a') || move.includes('h')) {
      const activeBishopSquares = getActiveBishopSquares(move, fen);
      patterns.push({
        type: 'Bishop Passivity',
        description: `Bishop move ${move} to passive square reduces diagonal control`,
        betterPlan: `Better Plan: ${activeBishopSquares.suggestion} to maintain active diagonal control and piece coordination`,
        severity: 'moderate'
      });
    }
    
    // Bad bishop identification with improvement plan
    if (moveNumber > 20 && (move.includes('c1') || move.includes('f1') || move.includes('c8') || move.includes('f8'))) {
      patterns.push({
        type: 'Bad Bishop Recognition',
        description: `Bishop on ${move.slice(-2)} may be restricted by own pawns`,
        betterPlan: `Better Plan: Consider pawn breaks like f4-f5, e4-e5, or h4-h5 to liberate the bishop and create activity`,
        severity: 'moderate'
      });
    }
  }
  
  // Knight outpost and activity with specific squares
  if (pieceType === 'N') {
    // Knights retreating from strong squares
    if (move.includes('1') || move.includes('8') || move.includes('a') || move.includes('h')) {
      const strongKnightSquares = getStrongKnightSquares(fen);
      patterns.push({
        type: 'Knight Retreat from Strong Square',
        description: `Knight retreat ${move} abandons central influence`,
        betterPlan: `Better Plan: ${strongKnightSquares.suggestion} to maintain central control and create threats`,
        severity: 'moderate'
      });
    }
    
    // Multiple knight moves without clear plan
    if (currentIndex > 5) {
      const recentKnightMoves = allPositions.slice(Math.max(0, currentIndex - 6), currentIndex)
        .map(p => p.move).filter(m => m && m.startsWith('N'));
      
      if (recentKnightMoves.length >= 3) {
        patterns.push({
          type: 'Knight Wandering',
          description: `Multiple knight moves (${recentKnightMoves.join(', ')}) without clear purpose`,
          betterPlan: `Better Plan: Establish the knight on d5, e4, or f5 for a permanent outpost and stop repositioning`,
          severity: 'high'
        });
      }
    }
  }
  
  // Rook activity with specific file/rank suggestions
  if (pieceType === 'R') {
    // Passive rook moves in endgame
    if (move.includes('1') && moveNumber > 25) {
      patterns.push({
        type: 'Rook Passivity in Endgame',
        description: `Rook retreat ${move} to back rank reduces activity in endgame`,
        betterPlan: `Better Plan: Activate the rook with Rd7, Re7, or Rc7 to attack pawns and support your own advancement`,
        severity: 'high'
      });
    }
    
    // Missing rook lifts
    if (moveNumber > 20 && move.includes('a1') || move.includes('h1')) {
      patterns.push({
        type: 'Missed Rook Activation',
        description: `Rook on ${move.slice(-2)} lacks activity and purpose`,
        betterPlan: `Better Plan: Consider rook lift with Ra3-g3 or Rh3-g3 to create attacking chances on the kingside`,
        severity: 'moderate'
      });
    }
  }
  
  return patterns;
};

// Helper functions for piece activity suggestions
const getActiveBishopSquares = (move, fen) => {
  const suggestions = [];
  
  // Suggest active diagonal squares
  if (move.includes('1') || move.includes('8')) {
    suggestions.push("Bd3, Be4, or Bf5 for active diagonal control");
  } else {
    suggestions.push("Bc4, Bd5, or Be6 to maintain central influence");
  }
  
  return {
    suggestion: suggestions[0] || "Place bishop on active diagonal",
    reason: "controlling key central squares"
  };
};

const getStrongKnightSquares = (fen) => {
  const centralSquares = ["Nd5", "Ne4", "Nf5", "Nc5", "Ne5", "Nd4"];
  const suggestion = centralSquares[Math.floor(Math.random() * centralSquares.length)];
  
  return {
    suggestion: `${suggestion} to establish a strong central outpost`,
    reason: "knights are most effective on central squares"
  };
};

const analyzeProphylacticThinking = (move, fen, previousFen, moveNumber, allPositions, currentIndex) => {
  const patterns = [];
  
  if (moveNumber <= 18) return patterns;
  
  // Analyze prophylactic moves with specific defensive suggestions
  
  // Missing prophylaxis against opponent threats
  if (currentIndex > 3) {
    const opponentRecentMoves = allPositions.slice(Math.max(0, currentIndex - 6), currentIndex)
      .filter((pos, idx) => idx % 2 === 1) // Opponent moves
      .map(p => p.move).filter(Boolean);
    
    // Opponent building kingside attack
    const kingsideAttack = opponentRecentMoves.filter(m => 
      m.includes('g') || m.includes('h') || m.includes('Qh') || m.includes('Rh') || m.includes('Bh')
    );
    
    if (kingsideAttack.length >= 2) {
      const isDefensive = move.includes('g') || move.includes('h') || move.startsWith('K') ||
                         move.includes('f') || move.includes('Rf') || move.includes('Bg');
      
      if (!isDefensive) {
        const defensiveMoves = getKingsideDefensiveMoves(opponentRecentMoves);
        patterns.push({
          type: 'Ignoring Kingside Attack',
          description: `Move ${move} ignores opponent's kingside buildup (${kingsideAttack.join(', ')})`,
          betterPlan: `Better Plan: ${defensiveMoves.suggestion} to prevent the attack before it becomes dangerous`,
          severity: 'high'
        });
      }
    }
    
    // Opponent preparing central break
    const centralPreparation = opponentRecentMoves.filter(m => 
      m.includes('d') || m.includes('e') || m.startsWith('N') || m.startsWith('B')
    );
    
    if (centralPreparation.length >= 3 && !move.includes('d') && !move.includes('e')) {
      patterns.push({
        type: 'Missing Central Prophylaxis',
        description: `Move ${move} allows opponent central break preparation`,
        betterPlan: `Better Plan: Play c4, f4, or Nd5 to contest central squares and prevent opponent's break`,
        severity: 'moderate'
      });
    }
  }
  
  // Improving worst-placed piece with specific suggestions
  if (moveNumber > 25) {
    if (!move.includes('x') && !move.includes('+') && !move.includes('#')) {
      const pieceImprovements = getWorstPieceImprovements(fen, move);
      patterns.push({
        type: 'Missed Piece Improvement',
        description: `Move ${move} doesn't address poorly placed pieces`,
        betterPlan: `Better Plan: ${pieceImprovements.suggestion} to improve your worst-placed piece first`,
        severity: 'moderate'
      });
    }
  }
  
  return patterns;
};

// Helper functions for prophylactic suggestions
const getKingsideDefensiveMoves = (opponentMoves) => {
  const defensiveSuggestions = [
    "h3 to prevent Bg4 and control g4 square",
    "g3 to strengthen kingside pawn structure", 
    "Rf2 to double on the f-file for defense",
    "Bg5 to trade off attacking pieces",
    "Ne4 to blockade central squares"
  ];
  
  return {
    suggestion: defensiveSuggestions[Math.floor(Math.random() * defensiveSuggestions.length)],
    reason: "preventing opponent's attack"
  };
};

const getWorstPieceImprovements = (fen, currentMove) => {
  const improvements = [
    "Improve the knight with Nd5 or Ne4 for central control",
    "Activate the bishop with Bd3 or Be4 for better diagonals", 
    "Centralize the queen with Qd3 or Qe4 for more influence",
    "Improve rook activity with Rd7 or Re7 to the 7th rank",
    "Advance the king with Kg3 or Kf3 in the endgame"
  ];
  
  return {
    suggestion: improvements[Math.floor(Math.random() * improvements.length)],
    reason: "addressing positional deficiencies"
  };
};

const analyzeSpaceAndCentralControl = (move, fen, moveNumber) => {
  const patterns = [];
  
  if (moveNumber <= 12) return patterns;
  
  // Central control and space advantage
  if (move.charAt(0).toLowerCase() === move.charAt(0)) { // Pawn moves
    // Central pawn advances
    if (move.includes('d4') || move.includes('d5') || move.includes('e4') || move.includes('e5')) {
      patterns.push({
        type: 'Central Space Control',
        description: `Central advance ${move} - space and control implications`,
        severity: 'low'
      });
    }
    
    // Wing pawn advances
    if (moveNumber > 20 && (move.includes('a') || move.includes('h') || move.includes('b') || move.includes('g'))) {
      patterns.push({
        type: 'Wing Expansion vs. Center',
        description: `Wing advance ${move} - balance with central control`,
        severity: 'moderate'
      });
    }
  }
  
  // Piece centralization
  if (move.startsWith('N') || move.startsWith('B') || move.startsWith('Q')) {
    if (move.includes('d') || move.includes('e')) {
      patterns.push({
        type: 'Piece Centralization',
        description: `Central piece placement ${move} - control and activity`,
        severity: 'low'
      });
    }
  }
  
  return patterns;
};

const analyzeWeakSquareCreation = (move, fen, previousFen, moveNumber) => {
  const patterns = [];
  
  if (moveNumber <= 15) return patterns;
  
  // Weak square creation and exploitation
  if (move.charAt(0).toLowerCase() === move.charAt(0)) { // Pawn moves
    // Pawn moves that create holes
    if (move.includes('g3') || move.includes('g6') || move.includes('f3') || move.includes('f6') ||
        move.includes('h3') || move.includes('h6')) {
      patterns.push({
        type: 'Weak Square Creation',
        description: `Pawn move ${move} creates potential weak squares`,
        severity: 'moderate'
      });
    }
    
    // Pawn advances that weaken key squares
    if (moveNumber > 20 && (move.includes('b5') || move.includes('g5') || move.includes('b4') || move.includes('g4'))) {
      patterns.push({
        type: 'Square Weakening Assessment',
        description: `Pawn advance ${move} - evaluate square weakening`,
        severity: 'moderate'
      });
    }
  }
  
  return patterns;
};

const analyzeInitiativeAndTempo = (move, fen, moveNumber, allPositions, currentIndex) => {
  const patterns = [];
  
  if (moveNumber <= 15) return patterns;
  
  // Initiative and tempo management
  
  // Slow moves when initiative is important
  if (moveNumber > 18 && moveNumber < 30) {
    // Non-forcing moves in sharp positions
    if (!move.includes('x') && !move.includes('+') && !move.includes('#')) {
      // Check if position requires forcing play
      const recentCaptures = allPositions.slice(Math.max(0, currentIndex - 4), currentIndex)
        .map(p => p.move).filter(m => m && m.includes('x')).length;
      
      if (recentCaptures >= 2) {
        patterns.push({
          type: 'Initiative and Tempo Loss',
          description: `Non-forcing move ${move} in sharp position may lose initiative`,
          severity: 'moderate'
        });
      }
    }
  }
  
  // Giving opponent time to consolidate
  if (moveNumber > 25) {
    // Passive moves in critical moments
    if (move.includes('1') || move.includes('8')) {
      patterns.push({
        type: 'Tempo Management',
        description: `Passive move ${move} may give opponent time to consolidate`,
        severity: 'moderate'
      });
    }
  }
  
  return patterns;
};

const analyzePieceSquareWeakness = (move, fen, moveNumber) => {
  const patterns = [];
  
  // Only analyze after opening phase for 1500+ players
  if (moveNumber <= 12) return patterns;
  
  // Knights on rim (only if it's clearly bad)
  if (move.startsWith('N') && moveNumber > 15) {
    const rimSquares = ['Na1', 'Na8', 'Nh1', 'Nh8', 'Na7', 'Na2', 'Nh7', 'Nh2'];
    if (rimSquares.some(square => move.includes(square.slice(1)))) {
      patterns.push({
        type: 'Knight on Rim Syndrome',
        description: `Knight moved to rim square with ${move} in middlegame`,
        severity: 'moderate'
      });
    }
  }
  
  // Passive piece retreats in middlegame
  if (moveNumber > 15 && moveNumber < 35) {
    if (move.includes('1') || move.includes('8')) { // Pieces retreating to back rank
      patterns.push({
        type: 'Passive Piece Placement',
        description: `Piece retreated passively with ${move} in middlegame`,
        severity: 'moderate'
      });
    }
  }
  
  return patterns;
};

const analyzePawnStructure = (move, fen, previousFen, moveNumber) => {
  const patterns = [];
  
  // Only analyze significant pawn structure issues after opening
  if (moveNumber <= 10) return patterns;
  
  // Pawn captures that create obvious weaknesses (only in middlegame/endgame)
  if (move.includes('x') && move.charAt(0).toLowerCase() === move.charAt(0) && moveNumber > 15) {
    // Only flag if it's likely a structural compromise (captures towards center)
    if (move.includes('d') || move.includes('e')) {
      patterns.push({
        type: 'Pawn Structure Deterioration',
        description: `Central pawn capture ${move} may create long-term weaknesses`,
        severity: 'moderate'
      });
    }
  }
  
  // Late pawn advances that create weaknesses
  if (moveNumber > 25 && move.charAt(0).toLowerCase() === move.charAt(0) && !move.includes('x')) {
    // Only flag advances that create obvious targets
    if (move.includes('5') || move.includes('4')) { // Advanced pawns
      patterns.push({
        type: 'Pawn Overextension',
        description: `Late pawn advance ${move} creates potential target`,
        severity: 'low'
      });
    }
  }
  
  return patterns;
};

const analyzeKingSafety = (move, fen, moveNumber) => {
  const patterns = [];
  
  // King moves in middlegame (only if clearly dangerous)
  if (move.startsWith('K') && moveNumber >= 15 && moveNumber <= 30) {
    // Only flag if king moves towards center or away from safety
    if (move.includes('e') || move.includes('d') || move.includes('f') || move.includes('c')) {
      patterns.push({
        type: 'King Safety Compromise',
        description: `Dangerous king move ${move} in middlegame exposes king`,
        severity: 'high'
      });
    }
  }
  
  // Very late castling (only if extremely late)
  if ((move === 'O-O' || move === 'O-O-O') && moveNumber > 18) {
    patterns.push({
      type: 'Delayed Castling Risk',
      description: `Very late castling ${move} after opponent development`,
      severity: 'moderate'
    });
  }
  
  // Pawn moves that clearly weaken king (only obvious cases)
  if (moveNumber > 12 && moveNumber < 25) {
    if ((move === 'g3' || move === 'g6' || move === 'h3' || move === 'h6') && 
        move.charAt(0).toLowerCase() === move.charAt(0)) {
      patterns.push({
        type: 'King Shelter Weakening',
        description: `Pawn move ${move} creates holes near king`,
        severity: 'moderate'
      });
    }
  }
  
  return patterns;
};

const analyzePieceCoordination = (move, fen, allPositions, currentIndex) => {
  const patterns = [];
  
  // Only analyze meaningful coordination issues after move 15
  if (currentIndex < 15) return patterns;
  
  const moveNumber = allPositions[currentIndex]?.moveNumber || 0;
  if (moveNumber <= 15) return patterns;
  
  // Detect pieces moving away from key battles
  if (currentIndex > 10) {
    const recentMoves = allPositions.slice(Math.max(0, currentIndex - 8), currentIndex)
      .map(p => p.move).filter(Boolean);
    
    // Check for same piece moving multiple times without purpose
    const pieceType = move.charAt(0);
    const samePieceRecentMoves = recentMoves.filter(m => m.charAt(0) === pieceType);
    
    if (samePieceRecentMoves.length >= 3 && moveNumber > 20) {
      patterns.push({
        type: 'Piece Coordination Loss',
        description: `Excessive ${pieceType} movement (${samePieceRecentMoves.length} recent moves) breaks coordination`,
        severity: 'moderate'
      });
    }
  }
  
  return patterns;
};

const analyzeTacticalPatterns = (move, fen, previousFen) => {
  const patterns = [];
  
  // Only analyze clear tactical errors, not every piece move
  
  // Major piece moves to obviously dangerous squares
  if (move.startsWith('Q') && move.length <= 3) {
    // Queen moves to squares where it can be easily attacked
    if (move.includes('4') || move.includes('5')) { // Queen in center without support
      patterns.push({
        type: 'Piece Safety Oversight',
        description: `Queen move ${move} to exposed central square`,
        severity: 'high'
      });
    }
  }
  
  // Rook moves that abandon important files/ranks
  if (move.startsWith('R') && move.includes('1')) {
    patterns.push({
      type: 'Piece Coordination Loss',
      description: `Rook move ${move} may abandon important rank`,
      severity: 'moderate'
    });
  }
  
  return patterns;
};

const analyzeEndgameTechnique = (move, fen, moveNumber) => {
  const patterns = [];
  
  // King activity in endgame
  if (!move.startsWith('K') && moveNumber > 35) {
    // Count pieces on board (rough endgame detection)
    const pieceCount = (fen.match(/[RNBQP]/g) || []).length + (fen.match(/[rnbqp]/g) || []).length;
    if (pieceCount <= 12) {
      patterns.push({
        type: 'King Passivity in Endgame',
        description: `Non-king move ${move} in endgame - king should be active`,
        severity: 'moderate'
      });
    }
  }
  
  // Pawn promotion preparation
  if (moveNumber > 30 && move.charAt(0).toLowerCase() === move.charAt(0)) {
    patterns.push({
      type: 'Endgame Pawn Play',
      description: `Pawn move ${move} in endgame - check if supporting promotion`,
      severity: 'low'
    });
  }
  
  return patterns;
};

const analyzeTimeManagement = (move, moveNumber, allPositions, currentIndex) => {
  const patterns = [];
  
  // Only analyze time pressure in critical phases (move 25+)
  if (moveNumber < 25) return patterns;
  
  // Detect rapid consecutive moves in endgame (possible time pressure)
  if (currentIndex >= 5 && moveNumber > 30) {
    const recentMoves = allPositions.slice(currentIndex - 5, currentIndex + 1);
    const rapidMoves = recentMoves.filter(pos => pos.moveNumber && pos.moveNumber > moveNumber - 6);
    
    if (rapidMoves.length >= 4) {
      patterns.push({
        type: 'Time Pressure Decisions',
        description: `Rapid move sequence in endgame including ${move} suggests time scramble`,
        severity: 'high'
      });
    }
  }
  
  return patterns;
};

const findHighestCPLossMoves = async (gamesData, username) => {
  console.log('🔍 Analyzing for highest CP loss moves as fallback...');
  
  const significantMoves = [];
  
  gamesData.forEach(gameObj => {
    if (!gameObj || !gameObj.gameInfo) return;
    
    const gameInfo = gameObj.gameInfo;
    const fenPositions = gameObj.allFenPositions || gameObj.fenPositions || [];
    
    const opponent = gameInfo.white === username ? 
      (gameInfo.black || 'Unknown') : 
      (gameInfo.white || 'Unknown');
    
    const isPlayerWhite = gameInfo.white === username;
    
    // Look for moves that might indicate significant position changes
    fenPositions.forEach((pos, index) => {
      if (!pos.move || index === 0) return;
      
      // Skip early opening moves for 1500+ players
      if (pos.moveNumber <= 10) return;
      
      // Only analyze player's moves
      const isPlayerMove = (pos.turn === 'white' && !isPlayerWhite) || 
                          (pos.turn === 'black' && isPlayerWhite);
      
      if (!isPlayerMove) return;
      
      // Heuristic: Look for moves that might be significant blunders
      const moveIndicators = analyzeSignificantMove(pos, fenPositions, index);
      
      if (moveIndicators.length > 0) {
        moveIndicators.forEach(indicator => {
          significantMoves.push({
            gameNumber: gameObj.gameNumber || 'Unknown',
            opponent: opponent,
            moveNumber: pos.moveNumber,
            move: pos.move,
            type: indicator.type,
            description: indicator.description,
            severity: indicator.severity,
            estimatedLoss: indicator.estimatedLoss
          });
        });
      }
    });
  });
  
  // Sort by estimated severity/loss
  significantMoves.sort((a, b) => {
    const severityOrder = { 'critical': 4, 'high': 3, 'moderate': 2, 'low': 1 };
    return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
  });
  

  
  if (significantMoves.length === 0) {
    return [{
      type: 'No Critical Mistakes Detected',
      frequency: 0,
      totalOccurrences: 0,
      recurrenceRate: '0.0',
      description: 'Analysis did not detect any obvious critical mistakes or significant position losses.',
      examples: []
    }];
  }
  
  // Group by type and create pattern-like structure
  const moveGroups = {};
  significantMoves.forEach(move => {
    if (!moveGroups[move.type]) {
      moveGroups[move.type] = [];
    }
    moveGroups[move.type].push(move);
  });
  
  const patterns = Object.entries(moveGroups).map(([type, moves]) => {
    const uniqueGames = [...new Set(moves.map(m => m.gameNumber))];
    
    // ✅ FIX: Select examples from different games for fallback patterns too
    const examplesByGame = {};
    moves.forEach(move => {
      if (!examplesByGame[move.gameNumber]) {
        examplesByGame[move.gameNumber] = [];
      }
      examplesByGame[move.gameNumber].push(move);
    });
    
    // Select one example from each game (up to 3 different games)
    const examples = [];
    const gameNumbers = Object.keys(examplesByGame).slice(0, 3);
    
    gameNumbers.forEach(gameNumber => {
      const gameExamples = examplesByGame[gameNumber];
      const bestExample = gameExamples.sort((a, b) => {
        const severityOrder = { 'critical': 4, 'high': 3, 'moderate': 2, 'low': 1 };
        return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      })[0];
      
      examples.push({
        gameNumber: bestExample.gameNumber,
        opponent: bestExample.opponent,
        moveNumber: bestExample.moveNumber,
        move: bestExample.move,
        description: bestExample.description
      });
    });
    
    console.log(`🎯 Fallback pattern "${type}": Selected examples from ${examples.length} different games: ${examples.map(ex => `Game ${ex.gameNumber}`).join(', ')}`);
    
    return {
      type: type,
      frequency: uniqueGames.length,
      totalOccurrences: moves.length,
      recurrenceRate: ((uniqueGames.length / gamesData.length) * 100).toFixed(1),
      description: `Significant position-changing moves detected. ${moves[0]?.description || 'Analysis of critical moments.'}`,
      examples: examples
    };
  });
  
  // ✅ VERIFY: Check that fallback patterns also have diverse examples
  patterns.forEach(pattern => {
    const exampleGameNumbers = pattern.examples.map(ex => ex.gameNumber);
    const uniqueExampleGames = [...new Set(exampleGameNumbers)];
    if (uniqueExampleGames.length !== pattern.examples.length) {
      console.warn(`⚠️ WARNING: Fallback pattern "${pattern.type}" has examples from duplicate games!`);
    } else {
      console.log(`  ✅ VERIFIED: Fallback pattern "${pattern.type}" examples come from ${uniqueExampleGames.length} different games`);
    }
  });
  
  return patterns.slice(0, 3);
};

const analyzeSignificantMove = (currentPos, allPositions, currentIndex) => {
  const indicators = [];
  const move = currentPos.move;
  const fen = currentPos.fen;
  const moveNumber = currentPos.moveNumber;
  
  // Only analyze moves after opening for 1500+ players
  if (moveNumber <= 12) return indicators;
  
  // Look for clearly significant blunder indicators
  
  // 1. Trade evaluation errors (advanced concept)
  if (move.includes('x') && moveNumber > 15) {
    const capturedPiece = move.split('x')[1];
    const capturingPiece = move.charAt(0);
    
    // Advanced piece value assessment with positional considerations
    const pieceValues = { 'Q': 9, 'R': 5, 'B': 3.25, 'N': 3, 'P': 1, '': 1 };
    const capturedValue = pieceValues[capturedPiece?.charAt(0)?.toUpperCase()] || 1;
    const capturingValue = pieceValues[capturingPiece?.toUpperCase()] || 1;
    
    // Material imbalance creation
    if (Math.abs(capturingValue - capturedValue) >= 2) {
      indicators.push({
        type: 'Trade Evaluation Error',
        description: `Questionable trade evaluation: ${capturingPiece || 'piece'} for ${capturedPiece || 'piece'} with ${move}`,
        severity: 'high',
        estimatedLoss: Math.abs(capturingValue - capturedValue)
      });
    }
    
    // Bishop vs Knight trades (positional evaluation)
    if ((capturingPiece === 'B' && capturedPiece?.charAt(0) === 'N') ||
        (capturingPiece === 'N' && capturedPiece?.charAt(0) === 'B')) {
      indicators.push({
        type: 'Minor Piece Trade Assessment',
        description: `${capturingPiece} for ${capturedPiece?.charAt(0)} trade with ${move} requires positional evaluation`,
        severity: 'moderate',
        estimatedLoss: 0.5
      });
    }
  }
  
  // 2. Prophylactic thinking failures
  if (move.startsWith('K') && moveNumber >= 18 && moveNumber <= 35) {
    // King moves that ignore opponent threats
    if (move.includes('e') || move.includes('d') || move.includes('f')) {
      indicators.push({
        type: 'Lack of Prophylactic Thinking',
        description: `King move ${move} in middlegame ignores opponent's attacking potential`,
        severity: 'critical',
        estimatedLoss: 2.5
      });
    }
  }
  
  // 3. Piece activity vs passivity errors
  if (move.startsWith('Q') && moveNumber > 15) {
    // Queen centralization without support
    if ((move.includes('d4') || move.includes('e4') || move.includes('d5') || move.includes('e5')) && 
        moveNumber < 30) {
      indicators.push({
        type: 'Piece Activity Misjudgment',
        description: `Queen centralization ${move} without adequate support - activity vs safety balance`,
        severity: 'high',
        estimatedLoss: 2
      });
    }
  }
  
  // 4. Pawn structure and weak square creation
  if (move.charAt(0).toLowerCase() === move.charAt(0) && moveNumber > 20) {
    // Pawn advances that create structural weaknesses
    if (move.includes('g4') || move.includes('g5') || move.includes('h4') || move.includes('h5') ||
        move.includes('f4') || move.includes('f5')) {
      indicators.push({
        type: 'Pawn Structure Compromise',
        description: `Pawn advance ${move} creates potential weak squares and structural issues`,
        severity: 'moderate',
        estimatedLoss: 1
      });
    }
  }
  
  // 5. Initiative and tempo management
  if (moveNumber > 25 && !move.includes('x') && !move.includes('+')) {
    // Non-forcing moves in critical positions
    if (move.includes('1') || move.includes('8')) {
      indicators.push({
        type: 'Initiative Loss',
        description: `Passive move ${move} in critical phase may surrender initiative`,
        severity: 'moderate',
        estimatedLoss: 1
      });
    }
  }
  
  return indicators;
};

const getPatternDescription = (type, mistakes) => {
  const totalOccurrences = mistakes.length;
  const uniqueGames = [...new Set(mistakes.map(m => m.gameNumber))].length;
  
  switch (type) {
    case 'Premature Pawn Break':
      return `Executing central pawn breaks without adequate piece preparation or positional justification. This strategic timing error appeared ${totalOccurrences} times across ${uniqueGames} games, indicating insufficient understanding of pawn break prerequisites.`;
    case 'Pawn Tension Resolution':
      return `Resolving central pawn tension at suboptimal moments, either too early or too late relative to piece coordination and strategic goals. This positional misjudgment appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Minor Piece Trade Evaluation':
      return `Making bishop-for-knight or knight-for-bishop trades without proper evaluation of the resulting position's characteristics. This piece value assessment error appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Activity vs. Passivity Trade':
      return `Trading pieces of equal material value without considering the activity differential, often exchanging active pieces for passive ones. This positional evaluation error appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Bishop Passivity':
      return `Placing bishops on passive squares where they have limited scope and influence, reducing overall piece coordination. This piece activity issue appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Bishop Quality Assessment':
      return `Failing to properly evaluate whether bishops are 'good' or 'bad' relative to the pawn structure, leading to suboptimal piece placement. This positional understanding gap appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Knight Outpost Evaluation':
      return `Misassessing the strength of knight outposts, either overvaluing weak outposts or underutilizing strong central squares. This strategic evaluation error appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Lack of Prophylactic Thinking':
      return `Failing to consider and prevent opponent's threats and plans, focusing only on one's own ideas without defensive preparation. This strategic blindness appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Weak Square Creation':
      return `Making pawn moves that create permanent weak squares in one's own position, providing the opponent with outpost opportunities. This structural weakness appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Initiative and Tempo Loss':
      return `Playing non-forcing moves in sharp positions where maintaining the initiative is crucial, allowing the opponent to consolidate. This tempo management error appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Rook Trade in Endgame':
      return `Trading rooks in endgame positions without proper evaluation of the resulting king and pawn endgame characteristics. This endgame transition error appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Central Space Control':
      return `Mismanaging central space and pawn control, either advancing too aggressively or failing to contest key central squares. This space evaluation issue appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Wing Expansion vs. Center':
      return `Expanding on the wings while neglecting central control, or vice versa, showing imbalanced strategic priorities. This strategic imbalance appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Piece Improvement Assessment':
      return `Failing to identify and improve the worst-placed piece, instead making moves that don't address fundamental positional deficiencies. This piece coordination issue appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Tempo Management':
      return `Poor tempo management in critical positions, either rushing when patience is needed or being passive when forcing play is required. This timing error appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Trade Evaluation Error':
      return `Making trades without proper evaluation of material balance and positional consequences, often creating unfavorable imbalances. This evaluation error appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Minor Piece Trade Assessment':
      return `Trading bishops and knights without considering the specific positional requirements and pawn structure characteristics. This piece value misjudgment appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Piece Activity Misjudgment':
      return `Misbalancing piece activity and safety, either being too passive or overextending pieces without adequate support. This activity assessment error appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Pawn Structure Compromise':
      return `Making pawn moves that create long-term structural weaknesses, holes, or targets without sufficient compensation. This structural understanding gap appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    case 'Initiative Loss':
      return `Surrendering the initiative through passive play when maintaining pressure and activity is crucial for the position. This tempo and initiative error appeared ${totalOccurrences} times across ${uniqueGames} games.`;
    default:
      return `Advanced positional or tactical pattern that appeared ${totalOccurrences} times across ${uniqueGames} games, requiring deeper chess understanding to address.`;
  }
};

// Removed duplicate estimatePlayerSkill function

// Helper function to calculate player rating from games
const calculatePlayerRating = (games, username) => {
  if (!games || games.length === 0) return 1200;

  const ratings = [];
  games.forEach(game => {
    // For Chess.com games
    if (game.white?.username === username && game.white?.rating) {
      ratings.push(parseInt(game.white.rating));
    } else if (game.black?.username === username && game.black?.rating) {
      ratings.push(parseInt(game.black.rating));
    }
    // For Lichess games
    else if (game.players?.white?.user?.id === username.toLowerCase() && game.players?.white?.rating) {
      ratings.push(parseInt(game.players.white.rating));
    } else if (game.players?.black?.user?.id === username.toLowerCase() && game.players?.black?.rating) {
      ratings.push(parseInt(game.players.black.rating));
    }
  });

  if (ratings.length === 0) return 1200;
  return Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length);
};

// Helper function to get skill level from rating
const getSkillLevelFromRating = (rating) => {
  if (rating < 800) return 'Beginner';
  if (rating < 1200) return 'Novice';
  if (rating < 1600) return 'Intermediate';
  if (rating < 2000) return 'Advanced';
  if (rating < 2200) return 'Expert';
  return 'Master';
};

// Helper function to format Stockfish mistakes for the prompt
const formatStockfishMistakes = (stockfishResults) => {
  if (!stockfishResults || !stockfishResults.stockfishAnalysis?.mistakes) {
    return 'No significant mistakes detected by engine analysis.';
  }

  const mistakes = stockfishResults.stockfishAnalysis.mistakes;
  const mistakesByCategory = stockfishResults.stockfishAnalysis.mistakesByCategory;

  let formatted = '';

  // Format by category
  Object.entries(mistakesByCategory).forEach(([category, categoryMistakes]) => {
    if (categoryMistakes.length === 0) return;

    formatted += `\n**${category.toUpperCase()} MISTAKES (${categoryMistakes.length} found):**\n`;

    categoryMistakes.slice(0, 3).forEach((mistake, index) => {
      const evalText = mistake.evaluation?.description || 'Position evaluation changed';
      const scoreDrop = mistake.scoreDrop ? (mistake.scoreDrop / 100).toFixed(1) : 'Unknown';
      
      formatted += `
${index + 1}. Game ${mistake.position.gameNumber || 'N/A'}, Move ${mistake.moveNumber} (playing ${mistake.userColor || mistake.turn})
   Move Played: ${mistake.move}
   Mistake Type: ${mistake.mistakeType} (lost ${scoreDrop} pawns)
   Position After: ${evalText}
   Engine's Best: ${mistake.bestMove || 'N/A'}
   FEN: ${mistake.position.fen}
   
`;
    });
  });

  return formatted || 'Engine analysis completed but no significant patterns detected.';
};

// ✅ UNIFIED: Create comprehensive prompt for all analysis types with Stockfish analysis
const createUnifiedAnalysisPrompt = async (gamesData, formData, stockfishResults = null) => {
  const { username, platform } = formData;
  
  console.log('🔍 Starting advanced pattern analysis...');
  
  // Analyze all games for recurring patterns
  const recurringPatterns = await analyzeRecurringPatterns(gamesData, username);
  
  // Create detailed game data for specific weakness analysis
  const detailedGameData = gamesData.slice(0, 8).map((gameObj, index) => {
    const gameNumber = index + 1;
    
    // Skip if game data is missing or invalid
    if (!gameObj || !gameObj.gameInfo || !gameObj.gameInfo.white || !gameObj.gameInfo.black) {
      return `Game ${gameNumber}: Invalid game data - skipping`;
    }
    
    const gameInfo = gameObj.gameInfo;
    const gameContext = gameObj.gameContext || {};
    
    const opponent = gameInfo.white === username ? 
      (gameInfo.black || 'Unknown') : 
      (gameInfo.white || 'Unknown');
    
    const playerColor = gameInfo.white === username ? 'White' : 'Black';
    const result = gameInfo.result || 'unknown';
    
    // Get critical moments with actual move details
    const criticalMoments = gameContext.criticalMoments || [];
    const criticalMomentsText = criticalMoments.slice(0, 3).map(moment => {
      return `Move ${moment.moveNumber}: ${moment.move || 'N/A'} (${moment.phase}) - ${moment.description || 'Critical position'}`;
    }).join(', ');
    
    // Get some FEN positions for context
    const fenPositions = gameObj.allFenPositions || gameObj.fenPositions || [];
    const samplePositions = fenPositions.slice(0, 2).map(pos => {
      return `Move ${pos.moveNumber || 'N/A'}: ${pos.fen}`;
    }).join('\n    ');
    
    return `Game ${gameNumber} vs. ${opponent} (Playing as ${playerColor}, Result: ${result}):
  Critical Moments: ${criticalMomentsText || 'None identified'}
  Sample Positions:
    ${samplePositions || 'No FEN data available'}`;
  }).join('\n\n');
  
  // Format recurring patterns for Gemini with Enhanced Context
  const patternsText = recurringPatterns.map((pattern, index) => {
    const examples = pattern.examples.slice(0, 2).map(ex => {
      const betterPlan = ex.betterPlan ? `\n    ${ex.betterPlan}` : '';
      
      // Format move sequence
      const leadingMoves = ex.previousMoves ? 
        ex.previousMoves.slice(-3).map(m => `${m.moveNumber}.${m.turn === 'white' ? '' : '..'} ${m.move}`).join(' ') : '';
      const followUpMoves = ex.followUpMoves ? 
        ex.followUpMoves.slice(0, 3).map(m => `${m.moveNumber}.${m.turn === 'white' ? '' : '..'} ${m.move}`).join(' ') : '';
      
      // Format position context
      const positionInfo = ex.positionContext ? 
        `\n    Position: ${ex.positionContext.phase}, ${ex.positionContext.materialBalance}` : '';
      
      // Format opponent threat
      const threatInfo = ex.opponentThreat ? 
        `\n    Opponent Threat: ${ex.opponentThreat.description} (${ex.opponentThreat.urgency} priority)` : '';
      
      // Format consequences
      const consequenceInfo = ex.consequences ? 
        `\n    Consequences: ${ex.consequences.immediate}. Evaluation: ${ex.consequences.evaluationChange}` : '';
      
      // Format move sequence
      const moveSequence = leadingMoves || followUpMoves ? 
        `\n    Move Sequence: ${leadingMoves} → ${ex.moveNumber}. ${ex.move} → ${followUpMoves}` : '';
      
      // Format FEN and board visualization
      const fenInfo = ex.fen ? 
        `\n    FEN Position: ${ex.fen}` : '';
      
      const boardVisualization = ex.fen ? 
        `\n    Board Position:\n${createBoardVisualization(ex.fen).split('\n').map(line => '    ' + line).join('\n')}` : '';
      
      return `  - Game ${ex.gameNumber} vs. ${ex.opponent} (Move ${ex.moveNumber}): ${ex.move} - ${ex.description}${positionInfo}${threatInfo}${consequenceInfo}${moveSequence}${fenInfo}${boardVisualization}${betterPlan}`;
    }).join('\n\n');
    
    return `PATTERN ${index + 1}: ${pattern.type} (Found in ${pattern.frequency}/${gamesData.length} games - ${pattern.recurrenceRate}% recurrence rate)
${pattern.description}

DETAILED EXAMPLES:
${examples}`;
  }).join('\n\n' + '='.repeat(80) + '\n\n');
  
  console.log('🎯 PATTERNS BEING SENT TO GEMINI:');
  console.log('='.repeat(50));
  console.log(patternsText);
  console.log('='.repeat(50));
  
  // ✅ PRE-CALCULATE VALUES TO AVOID TEMPLATE STRING ISSUES
  const gameStats = calculateGameStatistics(gamesData, { username });
  const playerWinRate = parseFloat(gameStats.winRate);
  const playerAccuracy = parseFloat(gameStats.averageAccuracy) || 0;
  const totalGames = gamesData.length;
  
  console.log(`🎯 PRE-CALCULATED VALUES FOR PROMPT:`);
  console.log(`   Win Rate: ${playerWinRate}%`);
  console.log(`   Accuracy: ${playerAccuracy}%`);
  console.log(`   Total Games: ${totalGames}`);
  
  // ✅ DEBUG: Check the actual prompt text being sent
  const promptPreview = `Based on the player's performance data:
- Win Rate: ${playerWinRate}%
- Average Accuracy: ${playerAccuracy}%
- Total Games: ${totalGames}`;
  
  console.log(`🔍 EXACT PROMPT TEXT BEING SENT:`);
  console.log(promptPreview);
  
  // ✅ FINAL CHECK: Verify the template string interpolation
  const testWinRateLine = `- Win Rate: ${playerWinRate}%`;
  console.log(`🎯 FINAL TEMPLATE TEST: "${testWinRateLine}"`);
  
  // ✅ DEBUG: Show the exact performance section that will be sent
  const performanceSection = `Based on the player's performance data:
- Win Rate: ${playerWinRate}%
- Average Accuracy: ${playerAccuracy}%
- Total Games: ${totalGames}`;
  console.log(`🎯 EXACT PERFORMANCE SECTION BEING SENT TO AI:`);
  console.log(performanceSection);
  
  return `You are a world-class chess coach providing comprehensive analysis. Analyze this player's games and provide ALL of the following in a single response:

PLAYER: ${username} (${platform})
GAMES ANALYZED: ${gamesData.length}

DETAILED GAME DATA WITH OPPONENTS AND MOVES:
${detailedGameData}

${stockfishResults ? `
===== STOCKFISH ENGINE ANALYSIS RESULTS =====

PROFESSIONAL ENGINE ANALYSIS COMPLETED FOR ${username}'S MOVES ONLY:
- Total Positions Analyzed: ${stockfishResults.stockfishAnalysis?.totalPositionsAnalyzed || 0}
- User's Mistakes Detected: ${stockfishResults.stockfishAnalysis?.totalMistakesFound || 0}
- Analysis Depth: 12 moves (Grandmaster level)
- Note: Only ${username}'s moves were analyzed, not opponent moves

STOCKFISH DETECTED MISTAKES IN ${username}'S PLAY:
${formatStockfishMistakes(stockfishResults)}

CRITICAL INSTRUCTION: Use the Stockfish engine analysis above as the PRIMARY source for identifying weaknesses. The engine analysis is objective and precise - use these findings to create the 3 recurring weaknesses below. Focus only on ${username}'s mistakes, not opponent errors.

ENGINE-BASED WEAKNESS PRIORITY:
1. Focus on the most frequent mistake types found by Stockfish
2. Use the specific positions and evaluations provided
3. Reference the engine's best move suggestions
4. Explain why the engine's recommendations are superior

` : ''}

🚨 CRITICAL INSTRUCTION FOR WEAKNESS EXAMPLES: 
When creating the 3 weaknesses below, you MUST use examples from 3 DIFFERENT games. Look at the game data above and ensure:
- Weakness 1 uses an example from one game (e.g., Game 1 vs. Opponent A)
- Weakness 2 uses an example from a different game (e.g., Game 3 vs. Opponent B)  
- Weakness 3 uses an example from yet another different game (e.g., Game 5 vs. Opponent C)
This ensures variety and prevents repetitive examples from the same game.

===== SECTION 1: MAIN CHESS ANALYSIS =====

PLAYER RATING CONTEXT: This player is rated approximately ${calculatePlayerRating(gamesData, username)} (${getSkillLevelFromRating(calculatePlayerRating(gamesData, username))} level)

${calculatePlayerRating(gamesData, username) >= 1500 ? `
🎯 ADVANCED PLAYER ANALYSIS FOCUS:
- This player has solid fundamentals - focus on ADVANCED concepts only
- DO NOT mention basic opening principles, elementary tactics, or simple endgames
- Focus on: complex positional understanding, advanced tactical patterns, strategic depth
- Address: piece coordination subtleties, pawn structure nuances, calculation accuracy, opening preparation depth
- Weaknesses should be sophisticated: "Positional Misjudgment in Complex Middlegames", "Calculation Errors in Tactical Sequences", "Strategic Planning in Transition Phases"
` : `
🎯 DEVELOPING PLAYER ANALYSIS FOCUS:
- Focus on fundamental improvements and pattern recognition
- Address basic tactical awareness, opening principles, and endgame fundamentals
`}

Analyze the player's overall chess patterns, tactical themes, strategic understanding, and playing style based on the game data provided. Focus on:
- Opening repertoire and preparation ${calculatePlayerRating(gamesData, username) >= 1500 ? '(depth and accuracy, not basic principles)' : ''}
- Middlegame planning and tactics ${calculatePlayerRating(gamesData, username) >= 1500 ? '(complex patterns and strategic depth)' : ''}
- Endgame technique ${calculatePlayerRating(gamesData, username) >= 1500 ? '(advanced technique and precision)' : ''}
- Time management
- Common mistake patterns

===== SECTION 2: RECURRING WEAKNESSES ANALYSIS =====

ADVANCED PATTERN ANALYSIS RESULTS:
${patternsText || 'No recurring patterns detected by advanced analysis.'}

MANDATORY INSTRUCTION: You MUST create exactly 3 recurring weaknesses with SPECIFIC MOVE SUGGESTIONS.

${calculatePlayerRating(gamesData, username) >= 1500 ? `
🚨 CRITICAL FOR 1500+ RATED PLAYERS:
- DO NOT create weaknesses about "basic opening principles" or "fundamental development"
- This player knows basic opening principles - focus on ADVANCED weaknesses only
- Examples of APPROPRIATE weaknesses for 1500+ players:
  * "Calculation Depth in Complex Tactical Sequences"
  * "Positional Assessment in Transition Phases"
  * "Time Management in Critical Moments"
  * "Piece Coordination in Middlegame Structures"
  * "Endgame Technique in Rook Endings"
  * "Strategic Planning in Pawn Structure Imbalances"
- Examples of INAPPROPRIATE weaknesses for 1500+ players:
  * "Opening Blunder - Neglecting Basic Opening Principles" ❌
  * "Basic Tactical Oversight" ❌
  * "Fundamental Development Issues" ❌
` : ''}

CRITICAL FORMAT REQUIREMENTS:
- Each weakness must follow this EXACT format:
  * Title: Use the pattern type from analysis ${calculatePlayerRating(gamesData, username) >= 1500 ? '(ADVANCED concepts only for 1500+ players)' : ''}
  * Mistake: Describe what happened with opponent name and move number
  * Better Plan: Provide SPECIFIC alternative moves (like "17...Nb4" or "Consider Nd5, Be3, or Qd2")

ENHANCED FORMAT TO FOLLOW:
"Weakness 1: [Pattern Type]
Position Context: [Game phase, material balance, move sequence]
Mistake: After [move number]. [actual move], you [description of error]. [Opponent name] was [opponent's threat/plan].
Consequences: [What happened next, evaluation change]
Better Plan: [Specific moves like Nd5, Be3, Qd2] to [concrete benefit].
FEN: [Include FEN for board visualization if available]"

IF PATTERNS WERE FOUND:
- Use ALL the detailed context provided: Position Context, Opponent Threat, Consequences, Move Sequence, FEN
- Copy the specific move recommendations from "Better Plan" suggestions
- Include the evaluation changes and what happened after the mistake
- Reference the exact move sequences and opponent threats provided
- Use the FEN positions for board visualization context

IF NO PATTERNS WERE FOUND:
- Create 3 weaknesses using the detailed game data provided
- Include position context, opponent threats, and consequences
- Suggest concrete moves with specific notation
- Still use all available context information

CRITICAL REQUIREMENTS FOR ENHANCED ANALYSIS:
- You MUST create exactly 3 weaknesses with FULL CONTEXT
- **MANDATORY: Each weakness MUST use an example from a DIFFERENT game. Do NOT use examples from the same game for multiple weaknesses.**
- Each weakness must include:
  * Position Context (game phase, material, move sequence)
  * Specific opponent threat or plan
  * Consequences and evaluation change
  * Concrete move suggestions in chess notation
  * FEN position if available
- Use the detailed examples provided in the pattern analysis
- Make each weakness educational and actionable for 1500+ players
- Include move sequences to show the flow of the game
- Provide concrete improvement advice for that specific situation
- **ENSURE GAME DIVERSITY: Weakness 1 should use Game A, Weakness 2 should use Game B, Weakness 3 should use Game C - never repeat the same game for multiple weaknesses**

===== SECTION 3: FOCUS AREA DETERMINATION =====

Based on the player's performance data:
- Win Rate: ${playerWinRate}%
- Average Accuracy: ${playerAccuracy}%
- Total Games: ${totalGames}

Determine the PRIMARY focus area for improvement. Choose ONE from: Tactics, Endgame, Openings, Positional, Time Management, Calculation.

Provide specific insight about why this area needs focus and how to improve it.

===== SECTION 4: PERFORMANCE METRICS =====

Calculate and provide:
- Most played opening based on the games
- Key strategic insights from the analysis
- Specific improvement recommendations

===== SECTION 5: FEN-BASED ACCURACY CALCULATION =====

CRITICAL TASK: Analyze the FEN positions and moves provided to calculate a more accurate accuracy percentage.

Based on the detailed FEN positions, move sequences, and critical moments provided above:
1. Evaluate the quality of moves in key positions
2. Consider tactical opportunities missed or found
3. Assess positional understanding in critical moments
4. Factor in endgame technique and calculation accuracy
5. Weight moves based on position complexity and importance

Provide a calculated accuracy percentage (0-100%) based on your analysis of the actual moves and positions shown in the FEN data. This should reflect the player's move quality across all game phases.

===== SECTION 6: PERSONALIZED RESOURCE RECOMMENDATIONS =====

CRITICAL TASK: Based on ALL the player's weaknesses identified in the recurring patterns and FEN analysis, provide targeted learning resources.

IMPORTANT: Analyze ALL weaknesses together to find resources that address multiple issues simultaneously.

Requirements for each recommendation:
1. STUDY_RECOMMENDATION: Must be specific to the player's main weakness pattern (e.g., "Study Capablanca's rook endgames, focusing on the Lucena and Philidor positions" or "Analyze Morphy's tactical combinations in open games")

2. VIDEO_RECOMMENDATION: A verified YouTube video will be automatically selected from our curated database based on the weaknesses you identify.

3. BOOK_RECOMMENDATION: Must be a specific chess book that targets their main weakness pattern

Make study and book recommendations based on:
- The specific mistake patterns found in their games
- The game phase where they struggle most (opening/middlegame/endgame)
- The tactical themes they miss most often
- Their current skill level (intermediate/advanced)

Be specific and practical - avoid generic advice.

===== REQUIRED RESPONSE FORMAT =====

**CRITICAL GAME DIVERSITY REQUIREMENT:** 
- WEAKNESS_1 must use an example from one specific game (e.g., Game 1 vs. Opponent A)
- WEAKNESS_2 must use an example from a DIFFERENT game (e.g., Game 3 vs. Opponent B) 
- WEAKNESS_3 must use an example from yet ANOTHER different game (e.g., Game 5 vs. Opponent C)
- NEVER use the same game/opponent for multiple weaknesses

Structure your response EXACTLY as follows:

**MAIN_ANALYSIS_START**
[Your main chess analysis here - patterns, themes, strategic insights based on the actual games]
**MAIN_ANALYSIS_END**

**WEAKNESSES_START**
**WEAKNESS_1: [Unique specific title based on actual patterns from the games]**
**SUBTITLE:** [2-sentence general description of this weakness pattern]
**GAME_INFO:** vs. [ACTUAL_OPPONENT_NAME] (Move [ACTUAL_MOVE_NUMBER])
**MISTAKE:** [Line 1: The concrete problem with this move (what went wrong tactically or positionally). Line 2: Why it violates chess principles (what rule/objective was violated, e.g., king safety, material balance, tempo). EXAMPLE: "The f4 move weakened the kingside with no compensation. This violated the principle of prophylactic thinking and king safety."]
**BETTER_PLAN:** [Concrete improvement advice for this specific situation]

**WEAKNESS_2: [Unique specific title based on actual patterns from the games]**
**SUBTITLE:** [2-sentence general description of this weakness pattern]
**GAME_INFO:** vs. [ACTUAL_OPPONENT_NAME] (Move [ACTUAL_MOVE_NUMBER])
**MISTAKE:** [Line 1: The concrete problem with this move (what went wrong tactically or positionally). Line 2: Why it violates chess principles (what rule/objective was violated, e.g., king safety, material balance, tempo). EXAMPLE: "The f4 move weakened the kingside with no compensation. This violated the principle of prophylactic thinking and king safety."]
**BETTER_PLAN:** [Concrete improvement advice for this specific situation]

**WEAKNESS_3: [Unique specific title based on actual patterns from the games]**
**SUBTITLE:** [2-sentence general description of this weakness pattern]
**GAME_INFO:** vs. [ACTUAL_OPPONENT_NAME] (Move [ACTUAL_MOVE_NUMBER])
**MISTAKE:** [Line 1: The concrete problem with this move (what went wrong tactically or positionally). Line 2: Why it violates chess principles (what rule/objective was violated, e.g., king safety, material balance, tempo). EXAMPLE: "The f4 move weakened the kingside with no compensation. This violated the principle of prophylactic thinking and king safety."]
**BETTER_PLAN:** [Concrete improvement advice for this specific situation]
**WEAKNESSES_END**

**FOCUS_AREA_START**
FOCUS_AREA: [Choose ONE: Tactics, Endgame, Openings, Positional, Time Management, Calculation]
FOCUS_INSIGHT: [2-sentence specific insight about why this area needs focus and how to improve it]
**FOCUS_AREA_END**

**METRICS_START**
MOST_PLAYED_OPENING: [Opening name based on actual games analyzed]
KEY_INSIGHTS: [Strategic recommendations based on the analysis]
**METRICS_END**

**ACCURACY_START**
CALCULATED_ACCURACY: [Your calculated accuracy percentage based on FEN analysis, e.g., "78"]
ACCURACY_REASONING: [Brief explanation of how you calculated this accuracy based on move quality, tactical awareness, and positional understanding]
**ACCURACY_END**

**RESOURCES_START**
STUDY_RECOMMENDATION: [Specific positional study recommendation based on the player's main weakness, e.g., "Study Capablanca's endgames focusing on rook and pawn endings" or "Analyze Tal's tactical combinations in the Sicilian Defense"]
STUDY_REASONING: [Why this specific study will help address their main weakness]
VIDEO_RECOMMENDATION: [A verified YouTube video will be automatically selected based on your weakness analysis]
VIDEO_URL: [Automatically provided from verified database]
VIDEO_REASONING: [Automatically generated based on weakness patterns]
BOOK_RECOMMENDATION: [Specific chess book that addresses their weakness pattern, e.g., "Dvoretsky's Endgame Manual" or "The Art of Attack in Chess by Vukovic"]
**RESOURCES_END**

IMPORTANT: You have been provided with detailed game data including opponent names, move numbers, and critical moments. You MUST use this actual data in your analysis. Do NOT provide generic examples or use placeholder text like "Given that there are no specific game info". The game data is provided above - use it!

Provide comprehensive, specific analysis based on the actual game data provided. Reference real opponents, move numbers, and positions from the games.`;
};

// ✅ UNIFIED: Parse the comprehensive Gemini response
const parseUnifiedGeminiResponse = (analysisText, gamesData, formData) => {
  console.log('🔍 Parsing unified Gemini response...');
  
  const result = {
    mainAnalysis: null,
    recurringWeaknesses: [],
    focusArea: 'Strategic Planning',
    focusInsight: 'Continue improving your overall game.',
    performanceMetrics: {},
    rawAnalysis: analysisText
  };
  
  try {
    // Extract main analysis
    const mainAnalysisMatch = analysisText.match(/\*\*MAIN_ANALYSIS_START\*\*(.*?)\*\*MAIN_ANALYSIS_END\*\*/s);
    if (mainAnalysisMatch) {
      result.mainAnalysis = mainAnalysisMatch[1].trim();
      console.log('✅ Main analysis extracted');
    }
    
    // Extract weaknesses
    const weaknessesMatch = analysisText.match(/\*\*WEAKNESSES_START\*\*(.*?)\*\*WEAKNESSES_END\*\*/s);
    if (weaknessesMatch) {
      const weaknessesText = weaknessesMatch[1];
      result.recurringWeaknesses = parseWeaknessesFromUnified(weaknessesText);
      console.log('✅ Weaknesses extracted:', result.recurringWeaknesses.length);
    }
    
    // Extract focus area
    const focusMatch = analysisText.match(/\*\*FOCUS_AREA_START\*\*(.*?)\*\*FOCUS_AREA_END\*\*/s);
    if (focusMatch) {
      const focusText = focusMatch[1];
      const areaMatch = focusText.match(/FOCUS_AREA:\s*([^\n]+)/);
      const insightMatch = focusText.match(/FOCUS_INSIGHT:\s*([^\n]+)/);
      
      if (areaMatch) result.focusArea = areaMatch[1].trim();
      if (insightMatch) result.focusInsight = insightMatch[1].trim();
      console.log('✅ Focus area extracted:', result.focusArea);
    }
    
    // Extract metrics
    const metricsMatch = analysisText.match(/\*\*METRICS_START\*\*(.*?)\*\*METRICS_END\*\*/s);
    if (metricsMatch) {
      const metricsText = metricsMatch[1];
      const openingMatch = metricsText.match(/MOST_PLAYED_OPENING:\s*([^\n]+)/);
      const insightsMatch = metricsText.match(/KEY_INSIGHTS:\s*([^\n]+)/);
      
      result.performanceMetrics = {
        mostPlayedOpening: openingMatch ? openingMatch[1].trim() : 'Mixed Openings',
        keyInsights: insightsMatch ? insightsMatch[1].trim() : 'Continue studying chess fundamentals.'
      };
      console.log('✅ Metrics extracted');
    }
    
    // Extract calculated accuracy
    const accuracyMatch = analysisText.match(/\*\*ACCURACY_START\*\*(.*?)\*\*ACCURACY_END\*\*/s);
    if (accuracyMatch) {
      const accuracyText = accuracyMatch[1];
      const calculatedAccuracyMatch = accuracyText.match(/CALCULATED_ACCURACY:\s*([^\n]+)/);
      const accuracyReasoningMatch = accuracyText.match(/ACCURACY_REASONING:\s*([^\n]+)/);
      
      if (calculatedAccuracyMatch) {
        const accuracyValue = calculatedAccuracyMatch[1].trim();
        // Extract just the number from the accuracy value
        const accuracyNumber = parseInt(accuracyValue.replace(/[^\d]/g, ''));
        
        result.calculatedAccuracy = accuracyNumber;
        result.accuracyReasoning = accuracyReasoningMatch ? accuracyReasoningMatch[1].trim() : 'Based on move quality analysis';
        
        console.log('✅ Calculated accuracy extracted:', result.calculatedAccuracy + '%');
      }
    }
    
    // Extract personalized resources
    const resourcesMatch = analysisText.match(/\*\*RESOURCES_START\*\*(.*?)\*\*RESOURCES_END\*\*/s);
    if (resourcesMatch) {
      const resourcesText = resourcesMatch[1];
      const studyRecommendationMatch = resourcesText.match(/STUDY_RECOMMENDATION:\s*([^\n]+)/);
      const studyReasoningMatch = resourcesText.match(/STUDY_REASONING:\s*([^\n]+)/);
      const videoRecommendationMatch = resourcesText.match(/VIDEO_RECOMMENDATION:\s*([^\n]+)/);
      const videoUrlMatch = resourcesText.match(/VIDEO_URL:\s*([^\n]+)/);
      const videoReasoningMatch = resourcesText.match(/VIDEO_REASONING:\s*([^\n]+)/);
      const bookRecommendationMatch = resourcesText.match(/BOOK_RECOMMENDATION:\s*([^\n]+)/);
      
      // ✅ Use verified video system instead of AI-generated recommendations
      const verifiedVideo = getVerifiedChessVideo(result.recurringWeaknesses);
      
      result.personalizedResources = {
        studyRecommendation: studyRecommendationMatch ? studyRecommendationMatch[1].trim() : null,
        studyReasoning: studyReasoningMatch ? studyReasoningMatch[1].trim() : null,
        videoRecommendation: verifiedVideo.title,
        videoUrl: verifiedVideo.url,
        videoReasoning: `This ${verifiedVideo.creator} video directly addresses your primary weakness. ${verifiedVideo.description}`,
        videoCreator: verifiedVideo.creator,
        bookRecommendation: bookRecommendationMatch ? bookRecommendationMatch[1].trim() : null
      };
      
      console.log('✅ Personalized resources with verified video:', {
        ...result.personalizedResources,
        verifiedVideoSelected: verifiedVideo.title
      });
    }
    
  } catch (parseError) {
    console.error('❌ Error parsing unified response:', parseError);
    // Provide fallback data
    result.mainAnalysis = analysisText.substring(0, 1000);
    result.recurringWeaknesses = [];
  }
  
  return result;
};

// Removed unused video recommendation function

// ✅ Helper: Parse weaknesses from unified response
const parseWeaknessesFromUnified = (weaknessesText) => {
  const weaknesses = [];
  const weaknessBlocks = weaknessesText.split(/\*\*WEAKNESS_\d+:/);
  
  for (let i = 1; i < weaknessBlocks.length && i <= 3; i++) {
    const block = weaknessBlocks[i].trim();
    
    // Extract components - FIXED: Capture multi-line content properly
    const titleMatch = block.match(/^([^*\n]+)/);
    const subtitleMatch = block.match(/\*\*SUBTITLE:\*\*\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/);
    const gameInfoMatch = block.match(/\*\*GAME_INFO:\*\*\s*([^\n]+)/);
    // Match everything after MISTAKE until the next ** marker or FEN
    const mistakeMatch = block.match(/\*\*MISTAKE:\*\*\s*([\s\S]*?)(?=\n\*\*BETTER_PLAN|\n\*\*FEN|\n\*\*WEAKNESS|$)/);
    // Match everything after BETTER_PLAN until FEN or next weakness
    const betterPlanMatch = block.match(/\*\*BETTER_PLAN:\*\*\s*([\s\S]*?)(?=\nFEN:|\n\*\*WEAKNESS|$)/);
    const fenMatch = block.match(/FEN:\s*([^\n]+)/);
    
    console.log(`🔍 Parsing unified weakness ${i}:`);
    console.log(`   Title: "${titleMatch ? titleMatch[1].trim() : 'N/A'}"`);
    console.log(`   Game Info: "${gameInfoMatch ? gameInfoMatch[1].trim() : 'N/A'}"`);
    console.log(`   Mistake length: ${mistakeMatch ? mistakeMatch[1].trim().length : 0} chars`);
    console.log(`   Better Plan length: ${betterPlanMatch ? betterPlanMatch[1].trim().length : 0} chars`);
    
    weaknesses.push({
      title: titleMatch ? titleMatch[1].trim() : `Weakness ${i}`,
      subtitle: subtitleMatch ? subtitleMatch[1].trim() : '',
      gameInfo: gameInfoMatch ? gameInfoMatch[1].trim() : '',
      mistake: mistakeMatch ? mistakeMatch[1].trim() : '',
      betterPlan: betterPlanMatch ? betterPlanMatch[1].trim() : '',
      fen: fenMatch ? fenMatch[1].trim() : null
    });
  }
  
  // ✅ POST-PROCESSING: Ensure game diversity (no duplicate games across weaknesses)
  const usedOpponents = new Set();
  const duplicateGameIndices = [];
  
  // Check for duplicate opponents/games
  weaknesses.forEach((weakness, index) => {
    if (weakness.gameInfo) {
      // Extract opponent name from gameInfo (format: "vs. OpponentName (Move X)")
      const opponentMatch = weakness.gameInfo.match(/vs\.\s*([^(]+)/);
      if (opponentMatch) {
        const opponent = opponentMatch[1].trim();
        if (usedOpponents.has(opponent)) {
          duplicateGameIndices.push(index);
        } else {
          usedOpponents.add(opponent);
        }
      }
    }
  });
  
  console.log(`✅ Parsed ${weaknesses.length} weaknesses from unified response`);
  console.log(`   Unique opponents: ${usedOpponents.size}`);
  if (duplicateGameIndices.length > 0) {
    console.warn(`⚠️ Found duplicate games at indices: [${duplicateGameIndices.join(', ')}]`);
  }
  
  return weaknesses;
};

// Removed unused helper functions: calculateBasicWinRate and calculateBasicAccuracy

// ? NEW: Create Pawnsposes prompt for recurring weaknesses analysis
const createRecurringWeaknessPrompt = (preparedFenData, formData) => {
  const { username, platform } = formData;
  
  // Flatten all positions from all games
  const allPositions = preparedFenData.flatMap(game => game.positions);
  
  // Sample positions for analysis (limit to avoid token limits)
  const samplePositions = allPositions.slice(0, 50);
  
  // Create game summaries
  const gameSummaries = preparedFenData.map(game => {
    return `Game ${game.gameNumber}: ${username} (${game.userColor}) vs. ${game.opponent}
Result: ${game.gameInfo.result} | ECO: ${game.gameInfo.eco} | Time Control: ${game.gameInfo.timeControl}
Positions analyzed: ${game.positions.length}`;
  }).join('\n');

  // Create position data for analysis
  const positionData = samplePositions.map(pos => {
    return `Game ${pos.gameNumber}, Move ${pos.moveNumber} (${pos.phase}): ${pos.move}
FEN: ${pos.fen}
Context: ${username} playing as ${pos.userColor} vs. ${pos.opponent} (${pos.userRating} vs ${pos.opponentRating})`;
  }).join('\n\n');

  return `You are "Pawnsposes," a world-renowned chess Grandmaster (FIDE 2650+) and elite coach. You are insightful, practical, and psychologically aware. Your style is encouraging but direct.

CRITICAL INSTRUCTIONS:
1. Analyze ONLY the provided FEN positions and metadata
2. Do NOT invent positions or evaluations
3. Base ALL conclusions on the actual data provided
4. Return results in STRICT JSON format only (no Markdown, no extra text)
5. Output exactly 3 recurring weaknesses

PLAYER DATA:
Username: ${username}
Platform: ${platform}
Games analyzed: ${preparedFenData.length}

GAME SUMMARIES:
${gameSummaries}

POSITION DATA FOR ANALYSIS:
${positionData}

ANALYSIS REQUIREMENTS:
Analyze the FEN positions and moves to identify exactly 3 recurring weaknesses. Each weakness must include:

1. Short descriptive title (from standard positional/strategic chess concepts)
2. Explanation of why this is a recurring weakness (long-term consequences, not just tactical blunders)
3. One concrete example from the games:
   - Game number
   - Move number
   - Move played (e.g., "15...g5?")
   - Corresponding FEN string
   - Short explanation of why this move/decision was strategically wrong
   - What should have been played instead
4. Better Plan: Superior plan for the example, with possible long-term ideas

DIVERSITY REQUIREMENTS:
- Use examples from 3 DIFFERENT games
- Vary the colors (don't use all white or all black examples)
- Vary the move numbers and positions
- Ensure each weakness represents a different strategic concept

OUTPUT FORMAT:
Return ONLY valid JSON in this exact structure:

{
  "weaknesses": [
    {
      "title": "Strategic Concept Name",
      "explanation": "Why this is a recurring weakness with long-term consequences...",
      "example": {
        "gameNumber": 1,
        "moveNumber": 15,
        "move": "15...g5?",
        "fen": "rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 4",
        "explanation": "This move weakens the kingside and allows tactical opportunities...",
        "betterMove": "15...Be7 or 15...Bd6"
      },
      "betterPlan": "Superior strategic approach with long-term ideas..."
    },
    {
      "title": "Different Strategic Concept",
      "explanation": "Different recurring weakness explanation...",
      "example": {
        "gameNumber": 3,
        "moveNumber": 22,
        "move": "22.Bxf6?",
        "fen": "r1bq1rk1/ppp2ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQR1K1 w - - 0 9",
        "explanation": "Trading the good bishop for knight without compensation...",
        "betterMove": "22.Be3 or 22.Bb3"
      },
      "betterPlan": "Different strategic approach..."
    },
    {
      "title": "Third Strategic Concept",
      "explanation": "Third recurring weakness explanation...",
      "example": {
        "gameNumber": 5,
        "moveNumber": 8,
        "move": "8...h6?",
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        "explanation": "Premature pawn advance creating weaknesses...",
        "betterMove": "8...Nf6 or 8...d6"
      },
      "betterPlan": "Third strategic approach..."
    }
  ]
}

IMPORTANT: Return ONLY the JSON object above. No additional text, explanations, or formatting.`;
};

// ? NEW: Call Gemini API for recurring weaknesses analysis
const callGeminiForRecurringWeaknesses = async (prompt, preparedFenData) => {
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const model = 'gemini-2.0-flash-exp';
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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
          maxOutputTokens: 2048,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
      throw new Error('Invalid response structure from Gemini API');
    }

    const analysisText = result.candidates[0].content.parts[0].text;
    
    // Parse JSON response
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const jsonResult = JSON.parse(jsonMatch[0]);
      
      if (!jsonResult.weaknesses || !Array.isArray(jsonResult.weaknesses)) {
        throw new Error('Invalid JSON structure - missing weaknesses array');
      }
      
      // ? NEW: Apply game diversity validation
      const validatedResult = validateAndEnforceGameDiversity(jsonResult, preparedFenData);
      
      return validatedResult;
      
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      console.error('Raw response:', analysisText);
      throw new Error('Failed to parse JSON response from Gemini');
    }
    
  } catch (error) {
    console.error('Error calling Gemini API for recurring weaknesses:', error);
    throw error;
  }
};


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
    ).join('\n');
    
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
  }).join('\n\n---\n\n');

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
      "title": "Sophisticated, high-level title that captures the psychological or strategic essence (e.g., 'Impulsive Pawn Pushes That Weaken King Safety', 'Critical Lapses in Tactical Vision Under Pressure', 'Premature Piece Commitments Before Completing Development', 'Neglecting Prophylactic Thinking in Critical Moments', 'Overextending in Pursuit of Illusory Attacks')",
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

**CRITICAL STYLE REQUIREMENTS:**\n- Use sophisticated, high-level chess language throughout\n- Frame weaknesses as psychological/strategic patterns, not generic labels\n- Focus on thought process failures and decision-making patterns\n- Avoid simplistic titles like "Tactical Mistakes" or "Pawn Structure Issues"\n- Instead use descriptive, specific titles that capture the essence of the problem\n\n**IMPORTANT REQUIREMENTS:**
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
      const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       analysisText.match(/```\s*([\s\S]*?)\s*```/) ||
                       analysisText.match(/\{[\s\S]*\}/);
      
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


export default Reports;

