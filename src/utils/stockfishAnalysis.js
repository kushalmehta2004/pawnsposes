/**
 * Stockfish Analysis Utilities
 * Provides engine-level position analysis for chess positions
 */

// Stockfish Web Worker wrapper for position analysis
class StockfishAnalyzer {
  constructor(config = {}) {
    // Allow overriding engine settings per instance (for concurrency)
    this.config = { hash: 16, ...config };
    this.worker = null;
    this.isReady = false;
    this.analysisQueue = [];
    this.currentAnalysis = null;
    this.analysisTimeout = null;
  }

  // Initialize Stockfish worker
  async initialize() {
    if (this.isReady) return;

    try {
      // Use the local Stockfish file we downloaded
      const stockfishUrl = `${window.location.origin}/stockfish/stockfish.js`;
      
      // Create worker from local file
      this.worker = new Worker(stockfishUrl);
      
      console.log('Stockfish engine initialized from local files');
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Stockfish initialization timeout'));
        }, 10000);

        // Set up message handler for Web Worker
        this.worker.onmessage = (e) => {
          const message = e.data;
          if (message === 'uciok') {
            // After UCI init, configure engine performance options
            const cores = Math.max(1, (navigator.hardwareConcurrency || 2));
            // If a per-instance threads override is passed, use it; otherwise keep within 1..4
            const threads = Math.min(4, Math.max(1, this.config.threads || cores));
            const hash = Math.max(1, this.config.hash || 16);
            try {
              this.worker.postMessage(`setoption name Threads value ${threads}`);
              this.worker.postMessage(`setoption name Hash value ${hash}`);
              this.worker.postMessage('isready');
            } catch (_) {}
            clearTimeout(timeout);
            this.isReady = true;
            console.log('Stockfish initialized successfully');
            resolve();
          }
        };

        // Initialize UCI protocol
        this.worker.postMessage('uci');
      });
    } catch (error) {
      console.error('Failed to initialize Stockfish:', error);
      throw error;
    }
  }

  // Enhanced deep analysis of a single position (minimum 18-move depth)
  async analyzePositionDeep(fen, depth = 20, timeLimit = 5000) {
    if (!this.isReady) {
      await this.initialize();
    }

    // Ensure minimum depth for production-level analysis
    const actualDepth = Math.max(depth, 18);

    return new Promise((resolve, reject) => {
      let bestMove = null;
      let evaluation = null;
      let principalVariation = [];
      let alternativeMoves = [];
      let currentDepth = 0;
      let analysisComplete = false;
      let nodeCount = 0;
      let nps = 0; // Nodes per second
      let timeSpent = 0;

      const timeout = setTimeout(() => {
        if (!analysisComplete) {
          this.worker.postMessage('stop');
          reject(new Error(`Deep analysis timeout after ${timeLimit}ms`));
        }
      }, timeLimit + 2000);

      const messageHandler = (e) => {
        const message = e.data;
        
        // Parse UCI info messages for comprehensive analysis
        if (message.startsWith('info')) {
          const parts = message.split(' ');
          
          // Extract current depth
          const depthIndex = parts.indexOf('depth');
          if (depthIndex !== -1 && depthIndex + 1 < parts.length) {
            currentDepth = parseInt(parts[depthIndex + 1]);
          }
          
          // Extract node count
          const nodesIndex = parts.indexOf('nodes');
          if (nodesIndex !== -1 && nodesIndex + 1 < parts.length) {
            nodeCount = parseInt(parts[nodesIndex + 1]);
          }
          
          // Extract nodes per second
          const npsIndex = parts.indexOf('nps');
          if (npsIndex !== -1 && npsIndex + 1 < parts.length) {
            nps = parseInt(parts[npsIndex + 1]);
          }
          
          // Extract time spent
          const timeIndex = parts.indexOf('time');
          if (timeIndex !== -1 && timeIndex + 1 < parts.length) {
            timeSpent = parseInt(parts[timeIndex + 1]);
          }
          
          // Extract evaluation
          const cpIndex = parts.indexOf('cp');
          const mateIndex = parts.indexOf('mate');
          
          if (cpIndex !== -1 && cpIndex + 1 < parts.length) {
            evaluation = {
              type: 'cp',
              value: parseInt(parts[cpIndex + 1]),
              depth: currentDepth
            };
          } else if (mateIndex !== -1 && mateIndex + 1 < parts.length) {
            evaluation = {
              type: 'mate',
              value: parseInt(parts[mateIndex + 1]),
              depth: currentDepth
            };
          }

          // Extract principal variation (best line)
          const pvIndex = parts.indexOf('pv');
          if (pvIndex !== -1) {
            principalVariation = parts.slice(pvIndex + 1);
          }
          
          // Store alternative moves data (multipv support would go here)
          if (currentDepth >= actualDepth - 2 && principalVariation.length > 0) {
            const moveExists = alternativeMoves.find(alt => alt.move === principalVariation[0]);
            if (!moveExists) {
              alternativeMoves.push({
                move: principalVariation[0],
                evaluation: evaluation ? { ...evaluation } : null,
                pv: [...principalVariation],
                depth: currentDepth
              });
            }
          }
        }
        
        // Get final best move
        if (message.startsWith('bestmove')) {
          const parts = message.split(' ');
          bestMove = parts[1];
          
          analysisComplete = true;
          clearTimeout(timeout);
          this.worker.onmessage = null;
          
          // Ensure we have alternative moves (at least the best move)
          if (alternativeMoves.length === 0 && bestMove && evaluation) {
            alternativeMoves.push({
              move: bestMove,
              evaluation: evaluation,
              pv: principalVariation,
              depth: currentDepth
            });
          }
          
          const analysisResult = {
            fen,
            bestMove,
            evaluation,
            principalVariation,
            alternativeMoves: alternativeMoves.slice(0, 5), // Top 5 alternatives
            analysisDepth: currentDepth,
            targetDepth: actualDepth,
            nodeCount,
            nps,
            timeSpent,
            analysisQuality: calculateAnalysisQuality(currentDepth, actualDepth, nodeCount)
          };
          
          resolve(analysisResult);
        }
      };

      this.worker.onmessage = messageHandler;

      // Set position and start deep analysis
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${actualDepth} movetime ${timeLimit}`);
    });
  }

  // Legacy method for backward compatibility
  async analyzePosition(fen, depth = 15, timeLimit = 3000) {
    // For backward compatibility, redirect to deep analysis with minimum depth
    const actualDepth = Math.max(depth, 18);
    return this.analyzePositionDeep(fen, actualDepth, timeLimit);
  }

  // Enhanced deep analysis of multiple key positions
  async analyzePositions(fenPositions, options = {}) {
    const {
      depth = 20, // Increased default depth for production-level analysis
      timeLimit = 5000, // Increased time limit for deeper analysis
      onProgress = () => {},
      maxPositions = fenPositions.length,
      prioritizeKeyPositions = true,
      concurrency = 1 // NEW: light concurrency support
    } = options;

    // Ensure minimum depth for production analysis
    const actualDepth = Math.max(depth, 18);
    const actualMaxPositions = Math.min(fenPositions.length, maxPositions);
    const poolSize = Math.max(1, Math.min(2, concurrency));
    
    console.log(`🎯 Starting deep Stockfish analysis (depth ${actualDepth})...`);
    console.log(`📊 Analyzing ${actualMaxPositions} key positions from ${fenPositions.length} total`);
    console.log(`🧵 Concurrency: ${poolSize}`);
    
    // Prioritize positions by importance if they have priority/category data
    let positionsToAnalyze = fenPositions.slice(0, actualMaxPositions);
    if (prioritizeKeyPositions) {
      positionsToAnalyze = prioritizePositionsForAnalysis(fenPositions, actualMaxPositions);
    }
    
    const results = [];
    const startTime = Date.now();

    // Sequential path (existing behavior)
    const runSequential = async () => {
      for (let i = 0; i < positionsToAnalyze.length; i++) {
        const position = positionsToAnalyze[i];
        await analyzeOne(i, position);
      }
    };

    // Helper to analyze one position and push result
    const analyzeOne = async (index, position) => {
      try {
        onProgress({
          current: index + 1,
          total: positionsToAnalyze.length,
          position: position,
          stage: 'deep_analysis',
          message: `Deep analysis: Move ${position.moveNumber} (${position.category || 'position'})`
        });

        const analysis = await this.analyzePositionDeep(position.fen, actualDepth, timeLimit);

        const enhancedResult = {
          ...position,
          stockfishAnalysis: analysis,
          analysisMetadata: {
            analysisDepth: analysis.analysisDepth,
            analysisQuality: analysis.analysisQuality,
            nodeCount: analysis.nodeCount,
            timeSpent: analysis.timeSpent,
            analysisTimestamp: new Date().toISOString()
          }
        };

        results[index] = enhancedResult;

        if (index % 10 === 0 || index === positionsToAnalyze.length - 1) {
          const done = results.filter(Boolean);
          const avgQuality = done.length ? done.reduce((sum, r) => sum + (r.analysisMetadata?.analysisQuality || 0), 0) / done.length : 0;
          console.log(`📊 Deep analysis progress: ${index + 1}/${positionsToAnalyze.length} | Quality: ${avgQuality.toFixed(1)}/100`);
        }
      } catch (error) {
        console.warn(`❌ Failed to analyze position ${index + 1} (Move ${position.moveNumber}):`, error.message);
        results[index] = {
          ...position,
          stockfishAnalysis: null,
          analysisError: error.message,
          analysisMetadata: {
            analysisTimestamp: new Date().toISOString(),
            failed: true
          }
        };
      }
    };

    if (poolSize === 1) {
      await runSequential();
    } else {
      // Light concurrency pool (size 2)
      const total = positionsToAnalyze.length;

      // Create a second lightweight analyzer instance with adjusted threads
      const cores = Math.max(1, (navigator.hardwareConcurrency || 2));
      const perWorkerThreads = Math.max(1, Math.floor(Math.min(4, cores) / poolSize));

      // Lazy import class to spawn a sibling instance
      const { StockfishAnalyzer } = await import('./stockfishAnalysis');
      const sibling = new StockfishAnalyzer({ threads: perWorkerThreads, hash: this.config?.hash || 16 });
      await sibling.initialize();

      // Current instance: also adjust threads to avoid oversubscription
      this.config.threads = perWorkerThreads;

      // Pointer that dispatches next index atomically
      let next = 0;
      const getNext = () => (next < total ? next++ : -1);

      // Worker loop for an analyzer
      const workerLoop = async (analyzer, label) => {
        for (;;) {
          const i = getNext();
          if (i === -1) break;
          const position = positionsToAnalyze[i];
          try {
            onProgress({ current: i + 1, total, position, stage: 'deep_analysis', message: `(${label}) Move ${position.moveNumber}` });
            const analysis = await analyzer.analyzePositionDeep(position.fen, actualDepth, timeLimit);
            results[i] = {
              ...position,
              stockfishAnalysis: analysis,
              analysisMetadata: {
                analysisDepth: analysis.analysisDepth,
                analysisQuality: analysis.analysisQuality,
                nodeCount: analysis.nodeCount,
                timeSpent: analysis.timeSpent,
                analysisTimestamp: new Date().toISOString(),
                worker: label
              }
            };
          } catch (error) {
            results[i] = { ...position, stockfishAnalysis: null, analysisError: error.message, analysisMetadata: { analysisTimestamp: new Date().toISOString(), failed: true, worker: label } };
          }
        }
      };

      // Start both loops in parallel
      await Promise.all([
        workerLoop(this, 'A'),
        workerLoop(sibling, 'B')
      ]);

      // Cleanup sibling worker
      sibling.terminate();
    }

    const totalTime = (Date.now() - startTime) / 1000;
    const done = results.filter(Boolean);
    const avgQuality = done.length ? done.reduce((sum, r) => sum + (r.analysisMetadata?.analysisQuality || 0), 0) / done.length : 0;
    const successRate = (done.filter(r => r.stockfishAnalysis).length / done.length) * 100;

    console.log(`✅ Deep Stockfish analysis complete:`);
    console.log(`   📊 ${done.length} positions analyzed in ${totalTime.toFixed(1)}s`);
    console.log(`   🎯 Average analysis quality: ${avgQuality.toFixed(1)}/100`);
    console.log(`   ✅ Success rate: ${successRate.toFixed(1)}%`);
    console.log(`   🔍 Analysis depth: ${actualDepth} moves`);

    return results;
  }

  // Clean up resources
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }
  }
}

// Helper function to calculate analysis quality score
const calculateAnalysisQuality = (actualDepth, targetDepth, nodeCount) => {
  let quality = 0;
  
  // Depth quality (40% weight)
  const depthRatio = actualDepth / Math.max(targetDepth, 18);
  quality += Math.min(depthRatio, 1) * 40;
  
  // Node count quality (30% weight)
  // Good analysis should have at least 10,000 nodes for depth 18+
  const expectedNodes = Math.max(10000, targetDepth * 500);
  const nodeRatio = nodeCount / expectedNodes;
  quality += Math.min(nodeRatio, 1) * 30;
  
  // Completion bonus (30% weight)
  if (actualDepth >= targetDepth) {
    quality += 30;
  } else if (actualDepth >= targetDepth - 2) {
    quality += 20;
  } else if (actualDepth >= targetDepth - 5) {
    quality += 10;
  }
  
  return Math.round(Math.min(quality, 100));
};

// Helper function to prioritize positions for analysis
const prioritizePositionsForAnalysis = (positions, maxPositions) => {
  // Sort positions by priority and importance
  const prioritized = [...positions].sort((a, b) => {
    // Priority order: critical > high > medium > low
    const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
    const aPriority = priorityOrder[a.priority] || 0;
    const bPriority = priorityOrder[b.priority] || 0;
    
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }
    
    // Secondary sort by category importance
    const categoryOrder = { 'mistake': 4, 'transition': 3, 'evaluation': 2, 'strategic': 1 };
    const aCategoryPriority = categoryOrder[a.category] || 0;
    const bCategoryPriority = categoryOrder[b.category] || 0;
    
    if (aCategoryPriority !== bCategoryPriority) {
      return bCategoryPriority - aCategoryPriority;
    }
    
    // Final sort by move number (earlier moves first for equal priority)
    return a.moveNumber - b.moveNumber;
  });
  
  // Take the top positions up to maxPositions
  const selected = prioritized.slice(0, maxPositions);
  
  return selected;
};

// Utility functions for analysis interpretation
export const interpretStockfishEvaluation = (evaluation) => {
  if (!evaluation) return { score: 0, description: 'Unknown' };

  if (evaluation.type === 'mate') {
    const moves = Math.abs(evaluation.value);
    const winner = evaluation.value > 0 ? 'White' : 'Black';
    return {
      score: evaluation.value > 0 ? 9999 : -9999,
      description: `${winner} mates in ${moves}`,
      isMate: true,
      movesToMate: moves
    };
  }

  if (evaluation.type === 'cp') {
    const centipawns = evaluation.value;
    const pawns = centipawns / 100;
    
    let description;
    if (Math.abs(pawns) < 0.5) {
      description = 'Equal position';
    } else if (Math.abs(pawns) < 1.5) {
      description = pawns > 0 ? 'Slight advantage for White' : 'Slight advantage for Black';
    } else if (Math.abs(pawns) < 3) {
      description = pawns > 0 ? 'Clear advantage for White' : 'Clear advantage for Black';
    } else {
      description = pawns > 0 ? 'Winning for White' : 'Winning for Black';
    }

    return {
      score: centipawns,
      pawns: pawns,
      description: description,
      isMate: false
    };
  }

  return { score: 0, description: 'Unknown evaluation' };
};

// Detect blunders and mistakes by comparing evaluations (only for the specified user)
export const detectMistakes = (analyzedPositions, userInfo = null) => {
  const mistakes = [];
  
  for (let i = 1; i < analyzedPositions.length; i++) {
    const current = analyzedPositions[i];
    const previous = analyzedPositions[i - 1];
    
    if (!current.stockfishAnalysis || !previous.stockfishAnalysis) continue;
    
    // Skip if we have user info and this move wasn't made by the user
    if (userInfo && !isUserMove(current, userInfo)) {
      continue;
    }
    
    const currentEval = interpretStockfishEvaluation(current.stockfishAnalysis.evaluation);
    const previousEval = interpretStockfishEvaluation(previous.stockfishAnalysis.evaluation);
    
    // Adjust evaluation based on whose turn it is
    const currentScore = current.turn === 'white' ? currentEval.score : -currentEval.score;
    const previousScore = previous.turn === 'white' ? previousEval.score : -previousEval.score;
    
    const scoreDrop = previousScore - currentScore;
    
    // Adjust thresholds based on player rating
    const rating = userInfo?.averageRating || 1200;
    let blunderThreshold, mistakeThreshold, inaccuracyThreshold;
    
    if (rating >= 2000) {
      // Expert/Master level - stricter thresholds
      blunderThreshold = 200; // 2 pawns
      mistakeThreshold = 100; // 1 pawn
      inaccuracyThreshold = 50; // 0.5 pawns
    } else if (rating >= 1600) {
      // Advanced level - moderate thresholds
      blunderThreshold = 250; // 2.5 pawns
      mistakeThreshold = 125; // 1.25 pawns
      inaccuracyThreshold = 60; // 0.6 pawns
    } else if (rating >= 1200) {
      // Intermediate level - standard thresholds
      blunderThreshold = 300; // 3 pawns
      mistakeThreshold = 150; // 1.5 pawns
      inaccuracyThreshold = 75; // 0.75 pawns
    } else {
      // Beginner level - more lenient thresholds
      blunderThreshold = 400; // 4 pawns
      mistakeThreshold = 200; // 2 pawns
      inaccuracyThreshold = 100; // 1 pawn
    }
    
    let mistakeType = null;
    if (scoreDrop > blunderThreshold) {
      mistakeType = 'blunder';
    } else if (scoreDrop > mistakeThreshold) {
      mistakeType = 'mistake';
    } else if (scoreDrop > inaccuracyThreshold) {
      mistakeType = 'inaccuracy';
    }
    
    if (mistakeType) {
      // Compute accurate move number from the previous position's FEN
      let displayMoveNumber = current.moveNumber;
      try {
        const parts = (previous.fen || '').split(' ');
        if (parts.length >= 6) {
          const fullmove = parseInt(parts[5], 10);
          if (!isNaN(fullmove)) displayMoveNumber = fullmove;
        }
      } catch {}

      mistakes.push({
        position: current,
        mistakeType,
        scoreDrop,
        move: current.move,
        moveNumber: displayMoveNumber,
        turn: current.turn,
        evaluation: currentEval,
        previousEvaluation: previousEval,
        bestMove: previous.stockfishAnalysis.bestMove,
        principalVariation: previous.stockfishAnalysis.principalVariation,
        previousFen: previous.fen,
        userColor: getUserColor(current, userInfo),
        gamePhase: determineGamePhase(displayMoveNumber, current.fen),
        mistakeCategory: categorizeMistakeByContext(current, previous, rating)
      });
    }
  }
  
  return mistakes;
};

// Helper function to determine if a move was made by the user
const isUserMove = (position, userInfo) => {
  if (!userInfo || !position.gameInfo) return true; // If no user info, analyze all moves

  const { username, platform } = userInfo;
  const gameInfo = position.gameInfo;
  const usernameLower = String(username).toLowerCase();

  // The current position's 'turn' indicates who is to move NOW.
  // The move we are evaluating is the one that JUST HAPPENED (the opposite color).
  const lastMoverColor = position.turn === 'white' ? 'black' : 'white';

  // For Chess.com games
  if (platform === 'chess.com') {
    const whitePlayer = gameInfo.white?.username?.toLowerCase();
    const blackPlayer = gameInfo.black?.username?.toLowerCase();
    if (lastMoverColor === 'white') return whitePlayer === usernameLower;
    return blackPlayer === usernameLower;
  }

  // For Lichess games
  if (platform === 'lichess') {
    // Lichess can have user.id or user.name depending on source
    const whiteId = gameInfo.players?.white?.user?.id?.toLowerCase();
    const blackId = gameInfo.players?.black?.user?.id?.toLowerCase();
    const whiteName = gameInfo.players?.white?.user?.name?.toLowerCase();
    const blackName = gameInfo.players?.black?.user?.name?.toLowerCase();

    const whiteMatch = (whiteId && whiteId === usernameLower) || (whiteName && whiteName === usernameLower);
    const blackMatch = (blackId && blackId === usernameLower) || (blackName && blackName === usernameLower);

    if (lastMoverColor === 'white') return !!whiteMatch;
    return !!blackMatch;
  }

  return true; // Default to analyzing all moves if platform not recognized
};

// Helper function to get the user's color in a specific game
const getUserColor = (position, userInfo) => {
  if (!userInfo || !position.gameInfo) return null;
  
  const { username, platform } = userInfo;
  const gameInfo = position.gameInfo;
  const usernameLower = String(username).toLowerCase();
  
  // For Chess.com games
  if (platform === 'chess.com') {
    const whitePlayer = gameInfo.white?.username?.toLowerCase();
    const blackPlayer = gameInfo.black?.username?.toLowerCase();
    if (whitePlayer === usernameLower) return 'white';
    if (blackPlayer === usernameLower) return 'black';
  }
  
  // For Lichess games
  if (platform === 'lichess') {
    const whiteId = gameInfo.players?.white?.user?.id?.toLowerCase();
    const blackId = gameInfo.players?.black?.user?.id?.toLowerCase();
    const whiteName = gameInfo.players?.white?.user?.name?.toLowerCase();
    const blackName = gameInfo.players?.black?.user?.name?.toLowerCase();

    const whiteMatch = (whiteId && whiteId === usernameLower) || (whiteName && whiteName === usernameLower);
    const blackMatch = (blackId && blackId === usernameLower) || (blackName && blackName === usernameLower);
    if (whiteMatch) return 'white';
    if (blackMatch) return 'black';
  }
  
  return null;
};

// Helper function to determine game phase
const determineGamePhase = (moveNumber, fen) => {
  if (moveNumber <= 15) {
    return 'opening';
  } else if (moveNumber <= 40) {
    // Count pieces to determine if it's still middlegame
    const pieces = fen.split(' ')[0];
    const pieceCount = pieces.replace(/[^a-zA-Z]/g, '').length;
    return pieceCount > 12 ? 'middlegame' : 'endgame';
  } else {
    return 'endgame';
  }
};

// Helper function to categorize mistakes by context for higher-rated players
const categorizeMistakeByContext = (current, previous, rating) => {
  const gamePhase = determineGamePhase(current.moveNumber, current.fen);
  
  if (rating >= 1500) {
    // Advanced categorization for higher-rated players
    if (gamePhase === 'opening') {
      return 'opening_preparation'; // Not basic principles
    } else if (gamePhase === 'middlegame') {
      // Analyze if it's tactical or positional
      const scoreDrop = Math.abs(current.stockfishAnalysis?.evaluation?.value || 0) - 
                       Math.abs(previous.stockfishAnalysis?.evaluation?.value || 0);
      return Math.abs(scoreDrop) > 200 ? 'tactical_calculation' : 'positional_judgment';
    } else {
      return 'endgame_technique';
    }
  } else {
    // Basic categorization for lower-rated players
    if (gamePhase === 'opening') {
      return 'opening_principles';
    } else if (gamePhase === 'middlegame') {
      return 'tactical_awareness';
    } else {
      return 'endgame_basics';
    }
  }
};

// Categorize mistakes by type
export const categorizeMistakes = (mistakes) => {
  const categories = {
    tactical: [],
    positional: [],
    endgame: [],
    opening: [],
    timeManagement: []
  };
  
  mistakes.forEach(mistake => {
    // Simple categorization based on move number and mistake type
    if (mistake.moveNumber <= 15) {
      categories.opening.push(mistake);
    } else if (mistake.moveNumber >= 40) {
      categories.endgame.push(mistake);
    } else if (mistake.mistakeType === 'blunder') {
      categories.tactical.push(mistake);
    } else {
      categories.positional.push(mistake);
    }
  });
  
  return categories;
};

// Create singleton instance
const stockfishAnalyzer = new StockfishAnalyzer();

export default stockfishAnalyzer;
export { StockfishAnalyzer };