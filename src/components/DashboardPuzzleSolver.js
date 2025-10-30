/**
 * DashboardPuzzleSolver - Modal puzzle solver matching PuzzlePage functionality
 * EXACT REPLICA of SinglePuzzleSolverModal logic for consistency
 * Displays a puzzle in a modal with full interaction capabilities
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Eye, Undo2, RotateCcw } from 'lucide-react';
import { Chess } from 'chess.js';
import toast from 'react-hot-toast';
import Chessboard from './Chessboard';

const DashboardPuzzleSolver = ({ entry, onClose }) => {
  const [puzzle, setPuzzle] = useState(null);
  const [showSolution, setShowSolution] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [moveResult, setMoveResult] = useState(null);
  const [orientation, setOrientation] = useState('white');
  const [isInitialized, setIsInitialized] = useState(false);

  const nextHintMove = useMemo(() => {
    if (!puzzle?.lineUci) return null;
    const tokens = puzzle.lineUci.split(/\s+/).filter(Boolean);
    const index = typeof puzzle?.lineIndex === 'number' ? puzzle.lineIndex : 0;
    const nextUci = tokens[index];
    if (!nextUci) return null;

    try {
      const engine = new Chess(puzzle.position || puzzle.initialPosition || undefined);
      const from = nextUci.slice(0, 2);
      const to = nextUci.slice(2, 4);
      const promotion = nextUci.length > 4 ? nextUci[4] : undefined;
      const move = engine.move({ from, to, promotion });
      return {
        uci: nextUci.toLowerCase(),
        san: move?.san || null
      };
    } catch (err) {
      console.warn('Unable to derive SAN for hint move', err);
      return {
        uci: nextUci.toLowerCase(),
        san: null
      };
    }
  }, [puzzle?.lineUci, puzzle?.lineIndex, puzzle?.position, puzzle?.initialPosition]);

  const hasTextHint = typeof puzzle?.hint === 'string' && puzzle.hint.trim().length > 0;
  const canShowHint = Boolean(nextHintMove) || hasTextHint;

  // Initialize puzzle - MATCHES SinglePuzzleSolverModal logic
  useEffect(() => {
    if (!entry?.puzzle) {
      setIsInitialized(false);
      setPuzzle(null);
      return;
    }

    try {
      // Extract initial FEN
      const initialFen = entry.puzzle.initialPosition || entry.puzzle.fen || entry.puzzle.position || '';
      if (!initialFen) {
        toast.error('Puzzle position not available');
        onClose();
        return;
      }

      // Get the move list
      let movesList = null;
      if (entry.puzzle.lineUci) {
        movesList = (entry.puzzle.lineUci || '').split(/\s+/).filter(Boolean);
      } else if (entry.puzzle.Moves) {
        movesList = (entry.puzzle.Moves || '').split(/\s+/).filter(Boolean);
      }

      // For shard puzzles, autoplay the first move to show the correct orientation
      let puzzlePosition = entry.puzzle.position || entry.puzzle.fen || entry.puzzle.initialPosition;
      let puzzleLineIndex = typeof entry.puzzle.lineIndex === 'number' ? entry.puzzle.lineIndex : 0;
      let startLineIndex = typeof entry.puzzle.startLineIndex === 'number' ? entry.puzzle.startLineIndex : (typeof entry.puzzle.lineIndex === 'number' ? entry.puzzle.lineIndex : 0);

      const category = entry.category || 'tactic';
      if ((category === 'weakness' || category === 'opening') && movesList && movesList.length > 0) {
        try {
          const engine = new Chess(initialFen);
          const firstMove = movesList[0];
          if (/^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(firstMove)) {
            const from = firstMove.slice(0, 2);
            const to = firstMove.slice(2, 4);
            const prom = firstMove.length > 4 ? firstMove[4] : undefined;
            const moveObj = engine.move({ from, to, promotion: prom });
            if (moveObj) {
              puzzlePosition = engine.fen();
              puzzleLineIndex = 1;
              startLineIndex = 1;
            }
          }
        } catch (e) {
          console.warn(`Failed to auto-play first move for ${category} puzzle:`, e);
        }
      }

      // Normalize puzzle data
      const normalizedPuzzle = {
        ...entry.puzzle,
        initialPosition: initialFen,
        position: puzzlePosition,
        lineIndex: puzzleLineIndex,
        startLineIndex: startLineIndex,
        completed: false,
        solution: entry.puzzle.solution || '',
        lineUci: entry.puzzle.lineUci || ''
      };

      setPuzzle(normalizedPuzzle);

      // Set board orientation based on current position
      if (normalizedPuzzle.position) {
        const side = normalizedPuzzle.position.split(' ')[1] === 'b' ? 'black' : 'white';
        setOrientation(side);
      }

      setFeedback('');
      setShowSolution(false);
      setShowHint(false);
      setMoveResult(null);
      setIsInitialized(true);
    } catch (error) {
      console.error('Error initializing puzzle:', error);
      toast.error('Failed to load puzzle');
      onClose();
    }
  }, [entry]);

  // EXACT REPLICA OF SinglePuzzleSolverModal handleResetPuzzle
  const handleResetPuzzle = () => {
    if (!puzzle) return;

    setFeedback('');
    setSolutionText('');
    setShowSolution(false);
    setShowHint(false);

    // Reset to the starting position and lineIndex
    const startLineIdx = typeof puzzle.startLineIndex === 'number' ? puzzle.startLineIndex : 0;
    
    let resetPosition = puzzle.initialPosition;
    
    // If startLineIndex > 0, we need to play moves up to that index
    if (startLineIdx > 0) {
      try {
        const engine = new Chess(puzzle.initialPosition);
        const tokens = (puzzle.lineUci || '').split(/\s+/).filter(Boolean);
        for (let i = 0; i < startLineIdx && i < tokens.length; i++) {
          const u = tokens[i];
          if (!/^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(u)) break;
          const from = u.slice(0, 2);
          const to = u.slice(2, 4);
          const prom = u.length > 4 ? u[4] : undefined;
          const m = engine.move({ from, to, promotion: prom });
          if (!m) break;
        }
        resetPosition = engine.fen();
      } catch (_) {
        resetPosition = puzzle.initialPosition;
      }
    }

    setPuzzle(prev => ({
      ...prev,
      position: resetPosition,
      lineIndex: startLineIdx,
      completed: false
    }));
  };

  // EXACT REPLICA OF SinglePuzzleSolverModal handleStepBack
  const handleStepBack = () => {
    if (!puzzle) return;

    try {
      const tokens = (puzzle.lineUci || '').split(/\s+/).filter(Boolean);
      const startIdx = typeof puzzle.startLineIndex === 'number' ? puzzle.startLineIndex : 0;
      let curIdx = typeof puzzle.lineIndex === 'number' ? puzzle.lineIndex : startIdx;

      if (!tokens.length) return;

      // Calculate the expected position at current lineIndex
      const engine = new Chess(puzzle.initialPosition);
      for (let i = 0; i < curIdx; i++) {
        const u = tokens[i];
        if (!/^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(u)) break;
        const from = u.slice(0, 2);
        const to = u.slice(2, 4);
        const prom = u.length > 4 ? u[4] : undefined;
        const m = engine.move({ from, to, promotion: prom });
        if (!m) break;
      }
      const expectedFen = engine.fen();

      // If board is showing something different, revert it
      if (puzzle.position !== expectedFen) {
        setPuzzle(prev => ({
          ...prev,
          position: expectedFen,
          lineIndex: curIdx,
          completed: false
        }));
        setFeedback('');
        setShowSolution(false);
        setShowHint(false);
        return;
      }

      // If at user's starting position, can't step back further
      if (curIdx <= startIdx) return;

      // Step back one user move
      const prevUserIdx = curIdx - ((curIdx - startIdx) % 2 === 0 ? 2 : 1);
      const targetIdx = Math.max(startIdx, prevUserIdx);

      const engine2 = new Chess(puzzle.initialPosition);
      for (let i = 0; i < targetIdx; i++) {
        const u = tokens[i];
        if (!/^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(u)) break;
        const from = u.slice(0, 2);
        const to = u.slice(2, 4);
        const prom = u.length > 4 ? u[4] : undefined;
        const m = engine2.move({ from, to, promotion: prom });
        if (!m) break;
      }

      const newFen = engine2.fen();

      setFeedback('');
      setShowSolution(false);
      setShowHint(false);
      setPuzzle(prev => ({
        ...prev,
        position: newFen,
        lineIndex: targetIdx,
        completed: false
      }));
    } catch (_) {
      // no-op on failure
    }
  };

  // EXACT REPLICA OF SinglePuzzleSolverModal handleShowSolution
  const handleShowSolution = () => {
    if (!puzzle) return;

    if (showSolution) {
      setShowSolution(false);
      setSolutionText('');
      return;
    }

    if (!puzzle || !puzzle.id) {
      console.error('❌ Puzzle object missing or invalid');
      toast.error('Error: Puzzle data is corrupted. Please reload.');
      return;
    }

    if (!puzzle.solution && !puzzle.lineUci) {
      console.error('❌ Puzzle missing both solution and lineUci');
      toast.error('Error: Solution data not found for this puzzle. Please try another puzzle.');
      return;
    }

    const tokens = (puzzle.lineUci || '').split(/\s+/).filter(Boolean);
    const curIdx = typeof puzzle.lineIndex === 'number' ? puzzle.lineIndex : 0;

    if (!tokens.length || curIdx >= tokens.length) {
      const _exp1 = (puzzle.explanation || '').trim()
        .replace(/\s*(?:—|-)?\s*Puzzle sourced from Lichess data ?set\.?$/i, '')
        .replace(/\s*(?:—|-)?\s*From curated endgame data ?set\.?$/i, '');

      if (!puzzle.solution) {
        console.warn(`⚠️ Puzzle ${puzzle.id} has no solution field`);
        setSolutionText(`Solution: [Unable to determine]${_exp1 ? ' — ' + _exp1 : ''}`);
      } else {
        setSolutionText(`Solution: ${puzzle.solution}${_exp1 ? ' — ' + _exp1 : ''}`);
      }
      setShowSolution(true);
      return;
    }

    try {
      const engine = new Chess(puzzle.position);
      const sans = [];
      for (let i = curIdx; i < tokens.length; i++) {
        const u = tokens[i];
        if (!/^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(u)) break;
        const from = u.slice(0, 2);
        const to = u.slice(2, 4);
        const prom = u.length > 4 ? u[4] : undefined;
        const m = engine.move({ from, to, promotion: prom });
        if (!m) break;
        sans.push(m.san);
      }
      const _exp2 = (puzzle.explanation || '').trim()
        .replace(/\s*(?:—|-)?\s*Puzzle sourced from Lichess data ?set\.?$/i, '')
        .replace(/\s*(?:—|-)?\s*From curated endgame data ?set\.?$/i, '');
      setSolutionText(`Solution: ${sans.join(' ')}${_exp2 ? ' — ' + _exp2 : ''}`);
      setShowSolution(true);
    } catch (err) {
      console.error('❌ Error parsing solution moves', err.message);
      const _exp3 = (puzzle.explanation || '').trim()
        .replace(/\s*(?:—|-)?\s*Puzzle sourced from Lichess data ?set\.?$/i, '')
        .replace(/\s*(?:—|-)?\s*From curated endgame data ?set\.?$/i, '');
      setSolutionText(`Solution: ${puzzle.solution || '[Unable to parse]'}${_exp3 ? ' — ' + _exp3 : ''}`);
      setShowSolution(true);
    }
  };

  // EXACT REPLICA OF SinglePuzzleSolverModal handleMove
  const handleMove = ({ from, to, san, fen }) => {
    if (!puzzle || !isInitialized) {
      toast.error('Puzzle not ready');
      return false;
    }

    const isUci = (s) => /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(s || '');
    const normalizeSan = (s) => (s || '').replace(/[+#?!]/g, '').replace(/=/g, '').trim().toLowerCase();
    const playedSan = normalizeSan(san);
    const target = (puzzle?.solution || '').trim();
    const targetSan = isUci(target) ? '' : normalizeSan(target);
    const playedUci = (() => {
      let u = `${from}${to}`.toLowerCase();
      const promoMatch = (san || '').match(/=([QRBN])/i);
      if (promoMatch) u += promoMatch[1].toLowerCase();
      return u;
    })();
    const targetUci = isUci(target) ? target.toLowerCase() : '';

    const tokens = (puzzle.lineUci || '').split(/\s+/).filter(Boolean);
    const hasLine = tokens.length > 0;
    const curIdx = typeof puzzle.lineIndex === 'number' ? puzzle.lineIndex : 0;

    if (hasLine) {
      // Multi-move puzzle
      const expectedUci = (tokens[curIdx] || '').toLowerCase();
      if (expectedUci && expectedUci === playedUci.toLowerCase()) {
        // ✅ Correct move
        setMoveResult({ square: to, isCorrect: true });
        setTimeout(() => setMoveResult(null), 800);

        try {
          const engine = new Chess(puzzle.position);
          engine.move({ from, to, promotion: (san.match(/=([QRBN])/i)?.[1] || 'q').toLowerCase() });
          let nextIdx = curIdx + 1;

          const positionAfterUserMove = engine.fen();
          setPuzzle(prev => ({
            ...prev,
            position: positionAfterUserMove,
            lineIndex: nextIdx
          }));
          setFeedback(`Good move: ${san}. Keep going!`);

          // Auto-play opponent's reply if available
          const replyUci = tokens[nextIdx];
          if (replyUci && /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(replyUci)) {
            setTimeout(() => {
              try {
                const engine2 = new Chess(positionAfterUserMove);
                const rFrom = replyUci.slice(0, 2);
                const rTo = replyUci.slice(2, 4);
                const rProm = replyUci.length > 4 ? replyUci[4] : undefined;
                engine2.move({ from: rFrom, to: rTo, promotion: rProm });
                const finalFen = engine2.fen();
                const finalIdx = nextIdx + 1;
                const isDone = finalIdx >= tokens.length;
                setPuzzle(prev => ({
                  ...prev,
                  position: finalFen,
                  lineIndex: finalIdx,
                  completed: isDone
                }));
                if (isDone) {
                  setFeedback('🎉 Congratulations! You completed the puzzle.');
                }
              } catch (_) {
                // If auto-move fails, just keep position after user move
              }
            }, 350);
          } else {
            // No more opponent moves
            const isDone = nextIdx >= tokens.length;
            if (isDone) {
              setFeedback('🎉 Congratulations! You completed the puzzle.');
              setPuzzle(prev => ({
                ...prev,
                completed: true
              }));
            }
          }
        } catch (_) {
          // If move fails, do not advance
        }
        return true;
      } else {
        // ❌ Incorrect move - show feedback but KEEP the move visible
        setMoveResult({ square: to, isCorrect: false });
        setTimeout(() => setMoveResult(null), 800);

        setPuzzle(prev => ({
          ...prev,
          position: fen  // Keep the wrong move visible
        }));
        setFeedback(`Not quite. You played ${san}. Try again or show a hint.`);
        return false;
      }
    } else {
      // Single-move puzzle
      // ALWAYS update position FIRST (before checking correctness)
      setPuzzle(prev => ({
        ...prev,
        position: fen,
        completed: false
      }));

      const isSanCorrect = playedSan === targetSan && targetSan;
      const isUciCorrect = playedUci === targetUci && targetUci;
      
      if (isSanCorrect || isUciCorrect) {
        // ✅ Correct move
        setMoveResult({ square: to, isCorrect: true });
        setTimeout(() => setMoveResult(null), 800);

        setFeedback(`Correct! ${san} is the solution.`);
        // Update completed state
        setPuzzle(prev => ({
          ...prev,
          completed: true
        }));
        return true;
      } else {
        // ❌ Incorrect move - position already updated above
        setMoveResult({ square: to, isCorrect: false });
        setTimeout(() => setMoveResult(null), 800);

        setFeedback(`Not quite. You played ${san}. Try again or show a hint.`);
        return false;
      }
    }
  };

  if (!puzzle || !isInitialized) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
        <div className="bg-white dark:bg-zinc-800 rounded-lg p-8">
          <p className="text-gray-600 dark:text-gray-300">Loading puzzle...</p>
        </div>
      </div>
    );
  }

  const sideToMove = puzzle.position.split(' ')[1] === 'w' ? 'White' : 'Black';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border dark:border-zinc-700">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-zinc-800 border-b dark:border-zinc-700 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Puzzle Solver</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Category: <span className="font-semibold capitalize">{entry.category}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition"
            aria-label="Close"
          >
            <X size={24} className="text-gray-600 dark:text-gray-300" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 bg-white dark:bg-zinc-900">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left Side - Chessboard */}
            <div className="lg:col-span-2">
              <div className="bg-gray-50 dark:bg-zinc-800 rounded-lg p-2">
                <Chessboard
                  position={puzzle.position}
                  orientation={orientation}
                  enableArrows
                  preserveDrawingsOnPositionChange={true}
                  moveResult={moveResult}
                  highlightedSquares={showHint && nextHintMove?.uci ? [nextHintMove.uci.slice(0, 2)] : []}
                  onMove={handleMove}
                  disabled={puzzle?.completed}
                />
              </div>
            </div>

            {/* Right Side - Controls & Info */}
            <div className="lg:col-span-1 flex flex-col">
              <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg p-4 space-y-3 flex-1 overflow-y-auto">
                {/* Progress */}
                <div>
                  <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-1 text-sm">Puzzle Info</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    <span className="font-medium">Side to move:</span> {sideToMove}
                  </p>
                </div>

                {/* Objective */}
                <div className="border-t dark:border-zinc-700 pt-4">
                  <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-1 text-sm">Objective:</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Find the best move{puzzle?.explanation && `. ${puzzle.explanation}`}
                  </p>
                </div>

                {/* Feedback */}
                {feedback && (
                  <div className={`p-2 rounded-lg text-xs font-medium border ${
                    feedback.includes('Correct') || feedback.includes('🎉')
                      ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700'
                      : 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                  }`}>
                    {feedback}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-2 pt-4 border-t dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={handleShowSolution}
                    className={`px-2 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center text-xs text-white ${
                      showSolution
                        ? 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600'
                        : 'bg-orange-500 hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700'
                    }`}
                  >
                    <Eye size={14} className="mr-0.5" />
                    {showSolution ? 'Hide' : 'Show'}
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleStepBack}
                    className="px-2 py-1.5 bg-blue-500 dark:bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-600 dark:hover:bg-blue-600 transition-colors flex items-center justify-center text-xs"
                  >
                    <Undo2 size={14} className="mr-0.5" />
                    Step
                  </button>

                  <button
                    type="button"
                    onClick={handleResetPuzzle}
                    className="px-2 py-1.5 bg-green-500 dark:bg-green-700 text-white rounded-lg font-medium hover:bg-green-600 dark:hover:bg-green-600 transition-colors flex items-center justify-center text-xs"
                  >
                    <RotateCcw size={14} className="mr-0.5" />
                    Reset
                  </button>
                </div>

                {/* Hint Button */}
                {canShowHint && (
                  <button
                    type="button"
                    onClick={() => setShowHint(!showHint)}
                    className={`w-full mt-2 px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-center text-xs text-white ${
                      showHint
                        ? 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600'
                        : 'bg-purple-500 hover:bg-purple-600 dark:bg-purple-700 dark:hover:bg-purple-600'
                    }`}
                  >
                    💡 {showHint ? 'Hide Hint' : 'Show Hint'}
                  </button>
                )}

                {/* Hint Display */}
                {showHint && canShowHint && (
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/30 border-2 border-purple-400 dark:border-purple-600 rounded-lg mt-2 shadow-md">
                    <h4 className="text-xs font-semibold text-purple-900 dark:text-purple-200 mb-2 flex items-center">
                      <span className="mr-1">💡</span>
                      Next Move Hint:
                    </h4>
                    {nextHintMove ? (
                      <>
                        <p className="text-xs text-purple-800 dark:text-purple-300 font-mono font-bold">
                          {nextHintMove.san || nextHintMove.uci}
                        </p>
                        {nextHintMove.san && (
                          <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-1">
                            (SAN: {nextHintMove.san})
                          </p>
                        )}
                        <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-1">
                          UCI: {nextHintMove.uci}
                        </p>
                        
                      </>
                    ) : hasTextHint ? (
                      <p className="text-xs text-purple-800 dark:text-purple-300">
                        {puzzle.hint}
                      </p>
                    ) : (
                      <p className="text-xs text-purple-800 dark:text-purple-300">
                        No additional moves remaining.
                      </p>
                    )}
                  </div>
                )}

                {/* Solution Display */}
                {showSolution && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg">
                    <h4 className="text-xs font-semibold text-green-900 dark:text-green-200 mb-1">Solution Moves:</h4>
                    <p className="text-xs text-green-800 dark:text-green-300 font-mono break-words">
                      {solutionText || (puzzle?.lineUci || 'No solution available')}
                    </p>
                  </div>
                )}

                {/* Puzzle Details - Rating & Themes */}
                <div className="pt-4 border-t dark:border-zinc-700">
                  <div className="space-y-3">
                    {puzzle?.rating && (
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Rating:</span> {puzzle.rating}
                      </p>
                    )}
                  </div>
                </div>

                {/* Themes - Display as Badges */}
                {puzzle?.themes && (Array.isArray(puzzle.themes) ? puzzle.themes.length > 0 : puzzle.themes.trim() !== '') && (
                  <div className="pt-4 border-t dark:border-zinc-700">
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Themes:</h4>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        // Handle both array and string formats, splitting each theme by spaces/commas
                        let themeArray = Array.isArray(puzzle.themes) ? puzzle.themes : [puzzle.themes];
                        let allThemes = themeArray
                          .flatMap(t => {
                            const str = typeof t === 'string' ? t : String(t);
                            // Split by commas or spaces
                            return str.split(/[,\s]+/).filter(theme => theme.trim().length > 0);
                          });
                        return allThemes.map((theme, idx) => (
                          <span
                            key={idx}
                            className="inline-block px-3 py-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded-md text-xs font-medium"
                          >
                            {theme.charAt(0).toUpperCase() + theme.slice(1)}
                          </span>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                {/* Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full mt-6 px-4 py-3 bg-gray-800 dark:bg-zinc-700 text-white font-semibold rounded-lg hover:bg-gray-900 dark:hover:bg-zinc-600 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPuzzleSolver;