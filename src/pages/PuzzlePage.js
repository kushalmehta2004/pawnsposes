import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft, Eye, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Chess } from 'chess.js';
import Chessboard from '../components/Chessboard';
import puzzleGenerationService from '../services/puzzleGenerationService';

const PuzzlePage = () => {
  const { puzzleType } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [currentPuzzle, setCurrentPuzzle] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [showSolution, setShowSolution] = useState(false);
  const [solutionText, setSolutionText] = useState('');

  const [puzzles, setPuzzles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [puzzleMetadata, setPuzzleMetadata] = useState(null);
  const [orientation, setOrientation] = useState('white');
  const [resetCounter, setResetCounter] = useState(0);

  // Get analysis data and username from location state
  const analysisData = location.state?.analysis;
  const username = analysisData?.username;

  const puzzle = puzzles[currentPuzzle];

  // Load puzzles when component mounts
  useEffect(() => {
    loadPuzzles();
  }, [puzzleType, username]);

  // Keep board orientation in sync with current puzzle and solution view
  useEffect(() => {
    const side = puzzle?.sideToMove === 'black' ? 'black' : 'white';
    setOrientation(side);
  }, [currentPuzzle, puzzles]);

  const loadPuzzles = async () => {
    if (!username) {
      toast.error('No user data found. Please generate a report first.');
      navigate('/reports');
      return;
    }

    setIsLoading(true);
    
    try {
      console.log(`🧩 Loading ${puzzleType} puzzles for ${username}...`);
      
      let generatedPuzzles = [];
      let metadata = {};

      switch (puzzleType) {
        case 'fix-weaknesses':
          generatedPuzzles = await puzzleGenerationService.generateWeaknessPuzzles(username, { maxPuzzles: 20 });
          metadata = {
            title: 'Fix My Weaknesses',
            subtitle: 'Puzzles targeting your recurring mistake patterns',
            description: 'These puzzles are generated from your most common mistakes to help you improve.'
          };
          break;
          
        case 'learn-mistakes':
          generatedPuzzles = await puzzleGenerationService.generateMistakePuzzles(username, { maxPuzzles: 20 });
          metadata = {
            title: 'Learn From My Mistakes',
            subtitle: 'Positions where you missed the best move',
            description: 'Practice the exact positions where you made mistakes in your games.'
          };
          break;
          
        case 'master-openings': {
          // Prefer SINGLE highest-frequency opening family from analysis state
          let topFamilies = location.state?.topOpeningFamilies 
            || location.state?.analysis?.performanceMetrics?.topOpeningFamilies;

          // If a frequency map is available, derive the single best family
          const freq = location.state?.analysis?.performanceMetrics?.openingFrequencies 
            || location.state?.openingFrequencies;
          if ((!Array.isArray(topFamilies) || topFamilies.length === 0) && freq && typeof freq === 'object') {
            const best = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
            if (best) topFamilies = [best];
          }

          // Fallback: compute from games if nothing present
          try {
            if (!Array.isArray(topFamilies) || topFamilies.length === 0) {
              const { default: openingPuzzleService } = await import('../services/openingPuzzleService');
              const fromGames = await openingPuzzleService.getUserTopOpenings(username, 3);
              topFamilies = Array.isArray(fromGames) && fromGames.length ? [fromGames[0]] : [];
            }
          } catch (_) {
            topFamilies = [];
          }

          // Normalize family names to known base families so shards resolve correctly
          const normalizeFamily = (name) => {
            const n = String(name || '').replace(/’/g, "'").trim();
            // Common families + synonyms + typos
            if (/king'?s\s*pawn/i.test(n)) return "King's Pawn Game";
            if (/french/i.test(n)) return 'French Defense';
            if (/scotch|scoth/i.test(n)) return 'Scotch Game';
            if (/english(\s+opening)?/i.test(n)) return 'English Opening';
            if (/caro[-\s]?kann/i.test(n)) return 'Caro-Kann Defense';
            if (/queen'?s\s+gambit/i.test(n)) return "Queen's Gambit";
            if (/sicilian/i.test(n)) return 'Sicilian Defense';
            if (/ruy\s+lopez/i.test(n)) return 'Ruy Lopez';
            if (/four\s+knights/i.test(n)) return 'Four Knights Game';
            if (/queen'?s\s+pawn/i.test(n)) return "Queen's Pawn Game";
            if (/italian\s+game/i.test(n)) return 'Italian Game';
            return n;
          };
          const normalizedFamilies = Array.isArray(topFamilies) ? topFamilies.map(normalizeFamily) : [];
          const singleTop = normalizedFamilies.length ? [normalizedFamilies[0]] : [];

          generatedPuzzles = await puzzleGenerationService.generateOpeningPuzzles(
            username,
            { maxPuzzles: 10, preferredFamilies: singleTop }
          );
          const sub = (singleTop && singleTop.length)
            ? `Puzzles from your most played opening: ${singleTop[0]}`
            : 'Key positions from your opening repertoire';
          metadata = {
            title: 'Master My Openings',
            subtitle: sub,
            description: 'Improve your understanding of your favorite openings.'
          };
          break;
        }
          
        case 'sharpen-endgame':
          generatedPuzzles = await puzzleGenerationService.generateEndgamePuzzles({ maxPuzzles: 12 });
          metadata = {
            title: 'Sharpen My Endgame',
            subtitle: 'Essential endgame techniques (K+P, rook endings, opposition, zugzwang)',
            description: 'Master fundamental endgame positions and techniques. Auto-replies and multi-step validation enabled.'
          };
          break;
          
        default:
          toast.error('Invalid puzzle type');
          navigate('/report-display');
          return;
      }

      if (generatedPuzzles.length === 0) {
        const msg = puzzleType === 'master-openings'
          ? 'No opening puzzles found for your top openings yet. Play more games or try again later.'
          : 'No puzzles could be generated. Please try again later.';
        toast.error(msg);
        navigate('/report-display');
        return;
      }

      // Initialize per-puzzle line tracking
      const initialized = generatedPuzzles.map(p => ({
        ...p,
        initialPosition: p.position,
        lineIndex: 0 // next expected token index in lineUci
      }));
      setPuzzles(initialized);
      setPuzzleMetadata(metadata);
      // Set board orientation based on side to move for first puzzle
      const firstSide = initialized[0]?.sideToMove === 'black' ? 'black' : 'white';
      setOrientation(firstSide);
      console.log(`✅ Loaded ${initialized.length} puzzles:`, initialized.map(p => ({
        id: p.id,
        source: p.source,
        mistakeType: p.mistakeType,
        sideToMove: p.sideToMove,
        hasPosition: !!p.position,
        debugInfo: p.debugInfo
      })));
      
    } catch (error) {
      console.error('❌ Error loading puzzles:', error);
      toast.error('Failed to load puzzles. Please try again.');
      navigate('/report-display');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSquareClick = (square) => {
    // Simple placeholder logic for move validation
    if (!showSolution) {
      const isCorrectMove = square.toLowerCase().includes(puzzle?.solution?.toLowerCase().slice(-2));
      if (isCorrectMove) {
        setFeedback('Correct! Well done!');
      } else {
        setFeedback('Not quite right. Try again or use a hint.');
      }
    }
  };

  const handleNextPuzzle = () => {
    if (currentPuzzle < puzzles.length - 1) {
      setCurrentPuzzle(currentPuzzle + 1);
      setFeedback('');
      setShowSolution(false);
    } else {
      setFeedback('🎉 You\'ve completed all puzzles in this category! Great job!');
      toast.success('All puzzles completed!');
    }
  };

  const handlePreviousPuzzle = () => {
    if (currentPuzzle > 0) {
      setCurrentPuzzle(currentPuzzle - 1);
      setFeedback('');
      setShowSolution(false);
    }
  };

  const handleResetPuzzle = () => {
    setFeedback('');
    setSolutionText('');
    setShowSolution(false);
    // Reset current puzzle to its initial FEN and line index
    setPuzzles(prev => prev.map((pz, i) => i === currentPuzzle ? { ...pz, position: pz.initialPosition, lineIndex: 0 } : pz));
    setOrientation((puzzles[currentPuzzle]?.sideToMove === 'black') ? 'black' : 'white');
    // Force Chessboard to re-mount by changing a key
    setResetCounter((c) => c + 1);
  };

  const handleShowSolution = () => {
    // Prepare full solution text without changing the board
    const tokens = (puzzle?.lineUci || '').split(/\s+/).filter(Boolean);
    if (!tokens.length) {
      setSolutionText(`Solution: ${puzzle?.solution}${puzzle?.explanation ? ' — ' + puzzle.explanation : ''}`);
      setShowSolution(true);
      return;
    }

    try {
      const engine = new Chess(puzzle.initialPosition || puzzle.position);
      const sans = [];
      for (let i = 0; i < tokens.length; i++) {
        const u = tokens[i];
        if (!/^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(u)) break;
        const from = u.slice(0, 2);
        const to = u.slice(2, 4);
        const prom = u.length > 4 ? u[4] : undefined;
        const m = engine.move({ from, to, promotion: prom });
        if (!m) break;
        sans.push(m.san);
      }
      setSolutionText(`Solution: ${sans.join(' ')}${puzzle?.explanation ? ' — ' + puzzle.explanation : ''}`);
      setShowSolution(true);
    } catch (_) {
      setSolutionText(`Solution: ${puzzle?.solution}${puzzle?.explanation ? ' — ' + puzzle.explanation : ''}`);
      setShowSolution(true);
    }
  };



  const handleBackToReport = () => {
    const analysisData = location.state?.analysis;
    navigate('/report-display', { state: { analysis: analysisData } });
  };

  // Show loading screen while puzzles are being generated
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ paddingTop: '80px' }}>
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4" size={48} />
          <h2 className="text-xl font-semibold mb-2">Generating Your Puzzles...</h2>
          <p className="text-gray-600">Creating personalized puzzles based on your games</p>
        </div>
      </div>
    );
  }

  // Show error if no puzzles loaded
  if (!puzzles.length || !puzzle) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ paddingTop: '80px' }}>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Puzzle not found</h2>
          <button 
            onClick={handleBackToReport}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Back to Report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ paddingTop: '80px' }}>
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button 
                onClick={handleBackToReport}
                className="text-gray-600 hover:text-gray-800 mb-2 flex items-center"
              >
                <ArrowLeft size={16} className="mr-1" />
                Back to Report
              </button>
              <h1 className="text-2xl font-bold text-gray-800">{puzzleMetadata?.title}</h1>
              <p className="text-gray-600">{puzzleMetadata?.subtitle}</p>
              {puzzle?.opening && (
                <div className="text-xs text-purple-700 mt-1">
                  Opening: <span className="font-semibold">{puzzle.opening || ''}</span>
                </div>
              )}
              {puzzleMetadata?.description && (
                <p className="text-sm text-gray-500 mt-1">{puzzleMetadata.description}</p>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">
                Puzzle {currentPuzzle + 1} of {puzzles.length}
              </div>
              {puzzle?.source && (
                <div className={`text-xs mt-1 px-2 py-1 rounded-full inline-block ${
                  puzzle.source === 'user_game' ? 'bg-green-100 text-green-700' :
                  puzzle.source === 'user_mistake' ? 'bg-blue-100 text-blue-700' :
                  puzzle.source === 'opening_repertoire' ? 'bg-purple-100 text-purple-700' :
                  puzzle.source === 'fallback' ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {puzzle.source === 'user_game' ? '🎯 From Your Game' : 
                   puzzle.source === 'user_mistake' ? '🔍 From Your Mistakes' : 
                   puzzle.source === 'opening_repertoire' ? `📚 From Your Openings${puzzle?.opening ? ` • ${puzzle.opening}` : ''}` :
                   puzzle.source === 'lichess_dataset' ? `📚 Opening${puzzle?.opening ? ` • ${puzzle.opening}` : ''}` :
                   puzzle.source === 'fallback' ? '⚠️ Sample Puzzle' : '📝 Curated'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Side - Chessboard (60-70% width on desktop) */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="bg-white rounded-lg shadow-lg p-6"
            >
              <Chessboard 
                key={`${currentPuzzle}-${resetCounter}`}
                position={puzzle.position}
                orientation={orientation}
                onMove={({ from, to, san, fen }) => {
                  // Compare both SAN and UCI to handle Lichess dataset moves
                  const isUci = (s) => /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(s || '');
                  const normalizeSan = (s) => (s || '').replace(/[+#?!]/g, '').replace(/=/g, '').trim().toLowerCase();
                  const playedSan = normalizeSan(san);
                  const target = (puzzle?.solution || '').trim();
                  const targetSan = isUci(target) ? '' : normalizeSan(target);
                  const playedUci = (() => {
                    // Derive UCI from from/to, append promotion if SAN shows one
                    let u = `${from}${to}`.toLowerCase();
                    const promoMatch = (san || '').match(/=([QRBN])/i);
                    if (promoMatch) u += promoMatch[1].toLowerCase();
                    return u;
                  })();
                  const targetUci = isUci(target) ? target.toLowerCase() : '';

           // Prefer line-based validation when a line exists; fallback to single-move solution otherwise
                         const tokens = (puzzle.lineUci || '').split(/\s+/).filter(Boolean);
                  const hasLine = tokens.length > 0;
                  const curIdx = typeof puzzle.lineIndex === 'number' ? puzzle.lineIndex : 0;

           if (hasLine) {
                           const expectedUci = (tokens[curIdx] || '').toLowerCase();
                    if (expectedUci && expectedUci === playedUci.toLowerCase()) {
                      try {
                        const engine = new Chess(puzzle.position);
                        // Apply the user's correct move
                        engine.move({ from, to, promotion: (san.match(/=([QRBN])/i)?.[1] || 'q').toLowerCase() });
                        let nextIdx = curIdx + 1;
                        // Auto-play opponent reply if present
                        const replyUci = tokens[nextIdx];
                        if (replyUci && /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(replyUci)) {
                          const rFrom = replyUci.slice(0, 2);
                          const rTo = replyUci.slice(2, 4);
                          const rProm = replyUci.length > 4 ? replyUci[4] : undefined;
                          engine.move({ from: rFrom, to: rTo, promotion: rProm });
                          nextIdx += 1;
                        }
                        const newFen = engine.fen();
                        setPuzzles(prev => prev.map((pz, i) => i === currentPuzzle ? { ...pz, position: newFen, lineIndex: nextIdx } : pz));
                        const side = newFen.split(' ')[1] === 'b' ? 'black' : 'white';
                        setOrientation(side);
                        if (nextIdx >= tokens.length) {
                          setFeedback('🎉 Congratulations! You completed the puzzle.');
                        } else {
                          setFeedback(`Good move: ${san}. Keep going!`);
                        }
                      } catch (_) {
                        // If anything fails, do not advance
                      }
                    } else {
                      setFeedback(`Not quite. You played ${san}. Try again or show a hint.`);
                    }
                  } else {
                    // Fallback: single-move correctness based on provided solution
                    const correct = (targetSan && playedSan === targetSan) || (targetUci && playedUci === targetUci);
                    if (correct) {
                      setFeedback(`Correct! ${san} is the best move.`);
                    } else if (targetSan || targetUci) {
                      setFeedback(`Not quite. You played ${san}. Try again or show a hint.`);
                    } else {
                      setFeedback(`Move played: ${san}`);
                    }
                  }
                }}
                showCoordinates
              />
            </motion.div>
          </div>

          {/* Right Side - Analysis Panel (30-40% width on desktop) */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-white rounded-lg shadow-lg p-6 h-fit"
            >
              {/* Title */}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-2">
                  Puzzle {currentPuzzle + 1}
                </h2>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                  <div 
                    className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentPuzzle + 1) / puzzles.length) * 100}%` }}
                  ></div>
                </div>
                {puzzle?.mistakeType && (
                  <div className="text-xs text-gray-500 mb-2">
                    Focus: {puzzle.mistakeType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </div>
                )}
                {puzzle?.opening && (
                  <div className="text-xs text-purple-700 mb-2">
                    Opening: <span className="font-semibold">{puzzle.opening || ''}</span>
                  </div>
                )}
                <div className="text-xs text-gray-600 mb-2">
                  Side to move: <span className="font-semibold">{puzzle.sideToMove === 'black' ? 'Black' : 'White'}</span>
                </div>
                {puzzleType === 'learn-mistakes' && puzzle?.playerMove && (
                  <div className="text-xs text-gray-600 mb-2">
                    In your game, you played: <span className="font-semibold">{puzzle.playerMove}</span>
                  </div>
                )}
                {puzzle?.gameInfo && (
                  <div className="text-xs text-blue-600 mb-2">
                    {puzzle.gameInfo}
                  </div>
                )}
                {puzzle?.debugInfo && (
                  <div className="text-xs text-orange-600 mb-2 bg-orange-50 p-2 rounded">
                    ℹ️ Debug: {puzzle.debugInfo}
                  </div>
                )}
              </div>

              {/* Puzzle Description */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-700 mb-2">Objective:</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {puzzle.objective}
                </p>
              </div>

              {/* Control Buttons */}
              <div className="space-y-3 mb-6">
                {/* Navigation Buttons - Top Row */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handlePreviousPuzzle}
                    disabled={currentPuzzle === 0}
                    className="px-4 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400 text-sm font-semibold flex items-center justify-center shadow-md"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={handleNextPuzzle}
                    disabled={currentPuzzle === puzzles.length - 1}
                    className="px-4 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400 text-sm font-semibold flex items-center justify-center shadow-md"
                  >
                    Next →
                  </button>
                </div>
                
                {/* Action Buttons - Bottom Row */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleShowSolution}
                    className="px-4 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-semibold flex items-center justify-center shadow-md"
                  >
                    <Eye size={16} className="mr-2" />
                    Show Solution
                  </button>
                  <button
                    onClick={handleResetPuzzle}
                    className="px-4 py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-semibold flex items-center justify-center shadow-md"
                  >
                    <RotateCcw size={16} className="mr-2" />
                    Reset
                  </button>
                </div>
              </div>

              {/* Solution Area (text only) */}
              {showSolution && solutionText && (
                <div className="p-4 rounded-lg text-sm bg-blue-100 text-blue-800 border border-blue-200">
                  {solutionText}
                </div>
              )}

              {/* Feedback Area */}
              {feedback && !showSolution && (
                <div className={`p-4 rounded-lg text-sm ${
                  feedback.includes('Correct') 
                    ? 'bg-green-100 text-green-800 border border-green-200' 
                    : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                }`}>
                  {feedback}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PuzzlePage;