/**
 * Advanced Position Analysis & Selection Module
 * Intelligently selects key positions from chess games for analysis
 */

import { Chess } from 'chess.js';

/**
 * Extract FEN positions from PGN with enhanced metadata
 * @param {string} pgnString - PGN string
 * @param {Object} gameInfo - Game metadata
 * @param {number} gameIndex - Game index in the set
 * @returns {Array} - Array of enhanced FEN position objects
 */
export const extractFenFromPgn = (pgnString, gameInfo = {}, gameIndex = 0) => {
  try {
    const chess = new Chess();
    const fenPositions = [];
    
    // Add initial position with enhanced metadata
    fenPositions.push({
      moveNumber: 0,
      move: 'Starting position',
      fen: chess.fen(),
      gameIndex: gameIndex,
      gameInfo: gameInfo,
      phase: 'opening',
      turn: 'white',
      timeTaken: null,
      precedingMove: null,
      accuracyScore: null
    });

    // Load the PGN
    chess.loadPgn(pgnString);
    
    // Get the history of moves with detailed information
    const history = chess.history({ verbose: true });
    
    // Reset the game and replay each move to get FEN positions
    chess.reset();
    
    history.forEach((move, index) => {
      chess.move(move.san);
      
      const moveNumber = Math.floor(index / 2) + 1;
      const turn = index % 2 === 0 ? 'black' : 'white'; // after applying a move, the opposite side is to move
      const phase = determineGamePhase(moveNumber, chess.fen());
      
      fenPositions.push({
        moveNumber: moveNumber,
        move: move.san,
        fen: chess.fen(),
        gameIndex: gameIndex,
        gameInfo: gameInfo,
        phase: phase,
        turn: turn,
        timeTaken: extractTimeFromMove(move),
        precedingMove: index > 0 ? history[index - 1].san : null,
        accuracyScore: null, // Will be filled later if accuracy data available
        moveDetails: {
          from: move.from,
          to: move.to,
          piece: move.piece,
          captured: move.captured || null,
          promotion: move.promotion || null,
          flags: move.flags
        }
      });
    });

    return fenPositions;
    
  } catch (error) {
    console.error('Error extracting FEN from PGN:', error);
    return [];
  }
};

/**
 * Extract FEN positions from Lichess moves with enhanced metadata
 * @param {Array|string} moves - Moves array or string
 * @param {Object} gameInfo - Game metadata
 * @param {number} gameIndex - Game index in the set
 * @returns {Array} - Array of enhanced FEN position objects
 */
export const extractFenFromLichessMoves = (moves, gameInfo = {}, gameIndex = 0) => {
  try {
    const chess = new Chess();
    const fenPositions = [];
    
    // Add initial position with enhanced metadata
    fenPositions.push({
      moveNumber: 0,
      move: 'Starting position',
      fen: chess.fen(),
      gameIndex: gameIndex,
      gameInfo: gameInfo,
      phase: 'opening',
      turn: 'white',
      timeTaken: null,
      precedingMove: null,
      accuracyScore: null
    });

    // Process moves
    const movesArray = typeof moves === 'string' ? moves.split(' ') : moves;
    
    movesArray.forEach((move, index) => {
      if (move.trim()) {
        try {
          const moveObj = chess.move(move.trim());
          const moveNumber = Math.floor(index / 2) + 1;
          const turn = index % 2 === 0 ? 'black' : 'white'; // after applying a move, the opposite side is to move
          const phase = determineGamePhase(moveNumber, chess.fen());
          
          fenPositions.push({
            moveNumber: moveNumber,
            move: move.trim(),
            fen: chess.fen(),
            gameIndex: gameIndex,
            gameInfo: gameInfo,
            phase: phase,
            turn: turn,
            timeTaken: null, // Lichess doesn't provide individual move times in this format
            precedingMove: index > 0 ? movesArray[index - 1] : null,
            accuracyScore: null,
            moveDetails: moveObj ? {
              from: moveObj.from,
              to: moveObj.to,
              piece: moveObj.piece,
              captured: moveObj.captured || null,
              promotion: moveObj.promotion || null,
              flags: moveObj.flags
            } : null
          });
        } catch (moveError) {
          console.warn(`Invalid move at index ${index}: ${move}`);
        }
      }
    });

    return fenPositions;
    
  } catch (error) {
    console.error('Error extracting FEN from Lichess moves:', error);
    return [];
  }
};

/**
 * Intelligent key position selection with advanced criteria
 * @param {Array} fenPositions - Array of all FEN positions
 * @param {Object} accuracyData - Optional Chess.com accuracy data
 * @param {Object} options - Selection options
 * @returns {Array} - Array of selected key positions
 */
export const selectKeyPositions = (fenPositions, accuracyData = null, options = {}) => {
  const {
    maxPositions = 15,
    includeTransitions = true,
    includeCritical = true,
    includeStrategic = true,
    includeEvaluationShifts = true
  } = options;
  
  // First, validate all FENs and filter out invalid ones
  const validFenPositions = fenPositions.filter(fenData => {
    const isValid = validateFen(fenData.fen);
    return isValid;
  });
  
  if (validFenPositions.length === 0) {
    console.warn('⚠️ No valid FEN positions found');
    return [];
  }
  
  const keyPositions = [];
  
  // 1. Phase Transition Points (opening→middlegame, middlegame→endgame)
  if (includeTransitions) {
    const transitionPoints = findPhaseTransitions(validFenPositions);
    transitionPoints.forEach(transition => {
      keyPositions.push({
        ...validFenPositions[transition.index],
        reason: `Phase transition: ${transition.from} → ${transition.to}`,
        priority: 'high',
        category: 'transition',
        analysisType: 'strategic'
      });
    });

  }
  
  // 2. Critical Positions (after blunders/inaccuracies from accuracy data)
  if (includeCritical && accuracyData) {
    const criticalPositions = findCriticalPositions(validFenPositions, accuracyData);
    criticalPositions.forEach(critical => {
      keyPositions.push({
        ...validFenPositions[critical.index],
        reason: `After ${critical.judgment}`,
        priority: 'critical',
        category: 'mistake',
        analysisType: 'tactical',
        judgment: critical.judgment,
        evaluation: critical.evaluation
      });
    });

  }
  
  // 3. Significant Evaluation Shifts (simulated for now, will be enhanced with Stockfish)
  if (includeEvaluationShifts) {
    const evaluationShifts = findEvaluationShifts(validFenPositions);
    evaluationShifts.forEach(shift => {
      keyPositions.push({
        ...validFenPositions[shift.index],
        reason: `Significant evaluation change`,
        priority: 'medium',
        category: 'evaluation',
        analysisType: 'positional',
        evaluationChange: shift.change
      });
    });

  }
  
  // 4. Strategic Checkpoints (every 10 moves, key opening/endgame moments)
  if (includeStrategic) {
    const strategicPositions = findStrategicCheckpoints(validFenPositions, keyPositions.length);
    strategicPositions.forEach(strategic => {
      keyPositions.push({
        ...strategic,
        reason: strategic.reason,
        priority: 'medium',
        category: 'strategic',
        analysisType: 'positional'
      });
    });

  }
  
  // Remove duplicates and sort by move number
  const uniqueKeyPositions = keyPositions
    .filter((position, index, array) => 
      array.findIndex(p => p.fen === position.fen) === index
    )
    .sort((a, b) => a.moveNumber - b.moveNumber);
  
  // Limit to maxPositions, prioritizing critical and high priority positions
  const finalPositions = prioritizePositions(uniqueKeyPositions, maxPositions);
  
  console.log(`🎯 Step 2: Selected ${finalPositions.length} key positions for analysis`);
  
  return finalPositions;
};

/**
 * Find phase transition points in the game
 * @param {Array} fenPositions - Array of FEN positions
 * @returns {Array} - Array of transition point objects
 */
const findPhaseTransitions = (fenPositions) => {
  const transitionPoints = [];
  let currentPhase = null;
  
  fenPositions.forEach((fenData, index) => {
    const phase = determineGamePhase(fenData.moveNumber, fenData.fen);
    
    if (currentPhase && currentPhase !== phase) {
      // Phase transition detected
      transitionPoints.push({
        index: index,
        from: currentPhase,
        to: phase,
        moveNumber: fenData.moveNumber,
        fen: fenData.fen
      });

    }
    
    currentPhase = phase;
  });
  
  return transitionPoints;
};

/**
 * Find critical positions from Chess.com accuracy data
 * @param {Array} fenPositions - Array of FEN positions
 * @param {Object} accuracyData - Chess.com accuracy data
 * @returns {Array} - Array of critical position objects
 */
const findCriticalPositions = (fenPositions, accuracyData) => {
  const criticalPositions = [];
  
  if (!accuracyData || !accuracyData.analysis) {
    return criticalPositions;
  }
  
  // Look for moves marked as blunders or inaccuracies
  accuracyData.analysis.forEach((moveAnalysis, index) => {
    if (moveAnalysis && (moveAnalysis.judgment === 'blunder' || moveAnalysis.judgment === 'inaccuracy')) {
      // Find corresponding FEN position (after the blunder/inaccuracy)
      const correspondingFenIndex = fenPositions.findIndex(fenData => 
        fenData.moveNumber === Math.floor(index / 2) + 1 && 
        fenData.turn === (index % 2 === 0 ? 'white' : 'black')
      );
      
      if (correspondingFenIndex !== -1) {
        criticalPositions.push({
          index: correspondingFenIndex,
          moveNumber: fenPositions[correspondingFenIndex].moveNumber,
          fen: fenPositions[correspondingFenIndex].fen,
          judgment: moveAnalysis.judgment,
          evaluation: moveAnalysis.evaluation
        });

      }
    }
  });
  
  return criticalPositions;
};

/**
 * Find positions with significant evaluation shifts (placeholder for Stockfish integration)
 * @param {Array} fenPositions - Array of FEN positions
 * @returns {Array} - Array of evaluation shift objects
 */
const findEvaluationShifts = (fenPositions) => {
  const evaluationShifts = [];
  
  // This is a placeholder implementation
  // In the next step, this will be enhanced with actual Stockfish evaluations
  
  // For now, identify positions where material balance changes significantly
  for (let i = 1; i < fenPositions.length; i++) {
    const current = fenPositions[i];
    const previous = fenPositions[i - 1];
    
    const currentMaterial = calculateMaterialBalance(current.fen);
    const previousMaterial = calculateMaterialBalance(previous.fen);
    
    const materialChange = Math.abs(currentMaterial - previousMaterial);
    
    // Significant material change (more than a pawn)
    if (materialChange > 1) {
      evaluationShifts.push({
        index: i,
        moveNumber: current.moveNumber,
        fen: current.fen,
        change: materialChange
      });
    }
  }
  
  return evaluationShifts.slice(0, 3); // Limit to 3 most significant
};

/**
 * Find strategic checkpoint positions
 * @param {Array} fenPositions - Array of FEN positions
 * @param {number} existingCount - Number of already selected positions
 * @returns {Array} - Array of strategic position objects
 */
const findStrategicCheckpoints = (fenPositions, existingCount) => {
  const strategicPositions = [];
  const targetCount = Math.max(5 - existingCount, 2); // Ensure minimum coverage
  
  // Key opening moments (moves 8-15)
  const openingPositions = fenPositions.filter(pos => 
    pos.moveNumber >= 8 && pos.moveNumber <= 15 && pos.phase === 'opening'
  );
  
  if (openingPositions.length > 0) {
    const midOpening = openingPositions[Math.floor(openingPositions.length / 2)];
    strategicPositions.push({
      ...midOpening,
      reason: `Opening development checkpoint (move ${midOpening.moveNumber})`
    });
  }
  
  // Middlegame strategic moments (every 10 moves)
  const middlegamePositions = fenPositions.filter(pos => 
    pos.phase === 'middlegame' && pos.moveNumber % 10 === 0
  );
  
  middlegamePositions.slice(0, 2).forEach(pos => {
    strategicPositions.push({
      ...pos,
      reason: `Middlegame strategic checkpoint (move ${pos.moveNumber})`
    });
  });
  
  // Endgame entry point
  const endgamePositions = fenPositions.filter(pos => pos.phase === 'endgame');
  if (endgamePositions.length > 0) {
    strategicPositions.push({
      ...endgamePositions[0],
      reason: `Endgame entry point (move ${endgamePositions[0].moveNumber})`
    });
  }
  
  return strategicPositions.slice(0, targetCount);
};

/**
 * Prioritize positions based on importance
 * @param {Array} positions - Array of positions
 * @param {number} maxPositions - Maximum number of positions to return
 * @returns {Array} - Prioritized positions
 */
const prioritizePositions = (positions, maxPositions) => {
  // Sort by priority: critical > high > medium
  const priorityOrder = { 'critical': 3, 'high': 2, 'medium': 1 };
  
  const sortedPositions = positions.sort((a, b) => {
    const aPriority = priorityOrder[a.priority] || 0;
    const bPriority = priorityOrder[b.priority] || 0;
    
    if (aPriority !== bPriority) {
      return bPriority - aPriority; // Higher priority first
    }
    
    // If same priority, sort by move number
    return a.moveNumber - b.moveNumber;
  });
  
  return sortedPositions.slice(0, maxPositions);
};

/**
 * Determine game phase based on move number and position
 * @param {number} moveNumber - Current move number
 * @param {string} fen - Current position FEN
 * @returns {string} - 'opening', 'middlegame', or 'endgame'
 */
const determineGamePhase = (moveNumber, fen) => {
  // Opening: moves 1-15
  if (moveNumber <= 15) {
    return 'opening';
  }
  
  // Count pieces to help determine middlegame vs endgame
  const pieces = fen.split(' ')[0];
  const pieceCount = pieces.replace(/[^a-zA-Z]/g, '').length;
  
  // Endgame: fewer than 12 pieces total (excluding kings)
  if (pieceCount <= 12) {
    return 'endgame';
  }
  
  // Middlegame: everything else
  return 'middlegame';
};

/**
 * Calculate material balance from FEN
 * @param {string} fen - FEN string
 * @returns {number} - Material balance (positive = white advantage)
 */
const calculateMaterialBalance = (fen) => {
  const pieces = fen.split(' ')[0];
  const pieceValues = {
    'P': 1, 'p': -1,
    'N': 3, 'n': -3,
    'B': 3, 'b': -3,
    'R': 5, 'r': -5,
    'Q': 9, 'q': -9,
    'K': 0, 'k': 0
  };
  
  let balance = 0;
  for (const char of pieces) {
    if (pieceValues[char] !== undefined) {
      balance += pieceValues[char];
    }
  }
  
  return balance;
};

/**
 * Validate a FEN string using chess.js
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
 * Extract time information from move object (placeholder)
 * @param {Object} move - Move object
 * @returns {number|null} - Time taken for move in seconds
 */
const extractTimeFromMove = (move) => {
  // This is a placeholder - Chess.com PGN doesn't include individual move times
  // This could be enhanced if time data becomes available
  return null;
};