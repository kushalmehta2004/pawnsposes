/**
 * DashboardPuzzleSolver - Modal puzzle solver matching PuzzlePage functionality
 * Displays a puzzle in a modal with full interaction capabilities
 */

import React, { useState, useEffect } from 'react';
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
  const [puzzleState, setPuzzleState] = useState(null);

  // Initialize puzzle
  useEffect(() => {
    console.log('🎯 [DASHBOARDPUZZLESOLVER] Received entry:', {
      id: entry?.puzzle?.id,
      themes: entry?.puzzle?.themes,
      themesType: Array.isArray(entry?.puzzle?.themes) ? 'array' : typeof entry?.puzzle?.themes,
      rating: entry?.puzzle?.rating,
      hint: entry?.puzzle?.hint,
      hasFullPuzzle: !!entry?.puzzle?.fullPuzzle
    });

    if (!entry?.puzzle) {
      console.error('❌ Invalid puzzle entry:', entry);
      toast.error('Invalid puzzle data');
      onClose();
      return;
    }

    const fen = entry.puzzle.position || entry.puzzle.fen;
    if (!fen) {
      toast.error('Puzzle position not available');
      onClose();
      return;
    }

    const normalizedPuzzle = {
      ...entry.puzzle,
      id: entry.puzzle.id || entry.puzzle.supabaseId,
      position: fen,
      fen: fen,
      initialPosition: fen,
      lineUci: entry.puzzle.lineUci || entry.puzzle.solution || entry.puzzle.moves || '',
      solution: entry.puzzle.solution || (entry.puzzle.lineUci ? entry.puzzle.lineUci.split(' ')[0] : ''),
      lineIndex: 0,
      startLineIndex: 0,
      completed: false,
      // Use the themes and rating that were already extracted in Dashboard.js
      themes: entry.puzzle.themes || [],
      rating: entry.puzzle.rating || 1500,
      hint: entry.puzzle.hint || ''
    };

    // Auto-play first move only for shard puzzles (not Supabase user-generated puzzles)
    let initialPosition = normalizedPuzzle.position;
    let lineIndex = 0;
    let startLineIndex = 0;

    const isSupabasePuzzle = normalizedPuzzle.source === 'supabase';
    const tokens = (normalizedPuzzle.lineUci || '').split(/\s+/).filter(Boolean);
    const firstMove = tokens[0];

    // Only auto-play for shard puzzles, not for Supabase puzzles
    if (!isSupabasePuzzle && firstMove && /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(firstMove)) {
      try {
        const engine = new Chess(normalizedPuzzle.fen);
        const from = firstMove.slice(0, 2);
        const to = firstMove.slice(2, 4);
        const prom = firstMove.length > 4 ? firstMove[4] : undefined;
        const moveObj = engine.move({ from, to, promotion: prom });
        
        if (moveObj) {
          initialPosition = engine.fen();
          lineIndex = 1;
          startLineIndex = 1;
          console.log(`🎯 Auto-played first move: ${firstMove}`);
        }
      } catch (err) {
        console.warn(`⚠️ Error auto-playing first move:`, err.message);
      }
    }

    const updatedPuzzle = {
      ...normalizedPuzzle,
      position: initialPosition,
      lineIndex,
      startLineIndex
    };

    setPuzzle(updatedPuzzle);
    setPuzzleState(updatedPuzzle);

    // Set orientation to match whose turn it is
    // If black to move, show black at bottom (black's perspective)
    // If white to move, show white at bottom (white's perspective)
    const side = initialPosition.split(' ')[1] === 'b' ? 'black' : 'white';
    setOrientation(side);

    setShowSolution(false);
    setSolutionText('');
    setFeedback('');
    setMoveResult(null);
  }, [entry, onClose]);

  const handleMove = ({ from, to, san, fen }) => {
    if (!puzzle || !puzzleState) return false;

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
    const curIdx = typeof puzzleState.lineIndex === 'number' ? puzzleState.lineIndex : 0;

    if (hasLine) {
      const expectedUci = (tokens[curIdx] || '').toLowerCase();
      if (expectedUci && expectedUci === playedUci.toLowerCase()) {
        // Correct move - show green checkmark
        setMoveResult({ square: to, isCorrect: true });
        setTimeout(() => setMoveResult(null), 800);
        
        try {
          const engine = new Chess(puzzleState.position);
          engine.move({ from, to, promotion: (san.match(/=([QRBN])/i)?.[1] || 'q').toLowerCase() });
          let nextIdx = curIdx + 1;
          
          const positionAfterUserMove = engine.fen();
          const newState = { ...puzzleState, position: positionAfterUserMove, lineIndex: nextIdx };
          setPuzzleState(newState);
          setFeedback(`Good move: ${san}. Keep going!`);
          
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
                const finalState = { ...newState, position: finalFen, lineIndex: finalIdx, completed: isDone };
                setPuzzleState(finalState);
                if (isDone) {
                  setFeedback('🎉 Congratulations! You completed the puzzle.');
                }
              } catch (_) {
                // If auto-move fails, just keep the position after user move
              }
            }, 350);
          } else {
            const isDone = nextIdx >= tokens.length;
            if (isDone) {
              setFeedback('🎉 Congratulations! You completed the puzzle.');
              setPuzzleState({ ...newState, completed: true });
            }
          }
        } catch (_) {
          // If anything fails, do not advance
        }
        return true;
      } else {
        // Incorrect move - show red X
        setMoveResult({ square: to, isCorrect: false });
        setTimeout(() => setMoveResult(null), 800);
        
        setPuzzleState({ ...puzzleState, position: fen });
        setFeedback(`Not quite. You played ${san}. Try again or show a hint.`);
        return false;
      }
    } else {
      setPuzzleState({ ...puzzleState, position: fen, completed: false });

      const isSanCorrect = playedSan === targetSan && targetSan;
      const isUciCorrect = playedUci === targetUci && targetUci;
      if (isSanCorrect || isUciCorrect) {
        // Correct move - show green checkmark
        setMoveResult({ square: to, isCorrect: true });
        setTimeout(() => setMoveResult(null), 800);
        
        setFeedback(`Correct! ${san} is the solution.`);
        setPuzzleState({ ...puzzleState, position: fen, completed: true });
        return true;
      } else {
        // Incorrect move - show red X
        setMoveResult({ square: to, isCorrect: false });
        setTimeout(() => setMoveResult(null), 800);
        
        setFeedback(`Not quite. You played ${san}. Try again or show a hint.`);
        return false;
      }
    }
  };

  const handleResetPuzzle = () => {
    if (!puzzle) return;

    setFeedback('');
    setSolutionText('');
    setShowSolution(false);

    // For Supabase puzzles, reset to the initial position as-is
    // For shard puzzles, reset to the position AFTER the first auto-played move
    const isSupabasePuzzle = puzzle.source === 'supabase';
    let resetPosition = puzzle.initialPosition;
    let resetLineIdx = 0;

    if (!isSupabasePuzzle) {
      // Only auto-play first move for shard puzzles
      const moves = (puzzle?.lineUci || '').trim();
      const tokens = moves.split(/\s+/).filter(Boolean);
      const firstMove = tokens[0];

      if (firstMove && /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(firstMove)) {
        try {
          const engine = new Chess(puzzle?.initialPosition);
          const from = firstMove.slice(0, 2);
          const to = firstMove.slice(2, 4);
          const prom = firstMove.length > 4 ? firstMove[4] : undefined;
          const moveObj = engine.move({ from, to, promotion: prom });
          if (moveObj) {
            resetPosition = engine.fen();
            resetLineIdx = 1;
          }
        } catch (_) {
          resetPosition = puzzle?.initialPosition;
          resetLineIdx = 0;
        }
      }
    }

    const newState = {
      ...puzzleState,
      position: resetPosition,
      lineIndex: resetLineIdx,
      completed: false
    };
    setPuzzleState(newState);
  };

  const handleStepBack = () => {
    try {
      if (!puzzle || !puzzleState) return;

      const tokens = (puzzle?.lineUci || '').split(/\s+/).filter(Boolean);
      const startIdx = typeof puzzle?.startLineIndex === 'number' ? puzzle.startLineIndex : 0;
      let curIdx = typeof puzzleState?.lineIndex === 'number' ? puzzleState.lineIndex : startIdx;

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
      if (puzzleState.position !== expectedFen) {
        setPuzzleState({ ...puzzleState, position: expectedFen, lineIndex: curIdx, completed: false });
        setFeedback('');
        setShowSolution(false);
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
      setPuzzleState({ ...puzzleState, position: newFen, lineIndex: targetIdx, completed: false });
    } catch (_) {
      // no-op on failure
    }
  };

  const handleShowSolution = () => {
    if (!puzzle) return;

    if (showSolution) {
      setShowSolution(false);
      setSolutionText('');
      return;
    }

    if (!puzzle.id) {
      console.error('❌ Puzzle object missing or invalid');
      toast.error('Error: Puzzle data is corrupted. Please reload.');
      return;
    }

    if (!puzzle.solution && !puzzle.lineUci) {
      console.error('❌ Puzzle missing both solution and lineUci');
      toast.error('Error: Solution data not found for this puzzle.');
      return;
    }

    const tokens = (puzzle?.lineUci || '').split(/\s+/).filter(Boolean);
    const curIdx = typeof puzzleState?.lineIndex === 'number' ? puzzleState.lineIndex : 0;

    if (!tokens.length || curIdx >= tokens.length) {
      const _exp1 = (puzzle?.explanation || '').trim()
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
      const engine = new Chess(puzzleState?.position || puzzle.position);
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
      const _exp2 = (puzzle?.explanation || '').trim()
        .replace(/\s*(?:—|-)?\s*Puzzle sourced from Lichess data ?set\.?$/i, '')
        .replace(/\s*(?:—|-)?\s*From curated endgame data ?set\.?$/i, '');
      setSolutionText(`Solution: ${sans.join(' ')}${_exp2 ? ' — ' + _exp2 : ''}`);
      setShowSolution(true);
    } catch (err) {
      console.error('❌ Error parsing solution moves', err.message);
      const _exp3 = (puzzle?.explanation || '').trim()
        .replace(/\s*(?:—|-)?\s*Puzzle sourced from Lichess data ?set\.?$/i, '')
        .replace(/\s*(?:—|-)?\s*From curated endgame data ?set\.?$/i, '');
      setSolutionText(`Solution: ${puzzle?.solution || '[Unable to parse]'}${_exp3 ? ' — ' + _exp3 : ''}`);
      setShowSolution(true);
    }
  };

  if (!puzzle || !puzzleState) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <p className="text-gray-600">Loading puzzle...</p>
        </div>
      </div>
    );
  }

  const sideToMove = puzzleState.position.split(' ')[1] === 'w' ? 'White' : 'Black';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Puzzle Solver</h2>
            <p className="text-xs text-gray-600 mt-1">
              Category: <span className="font-semibold capitalize">{entry.category}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            aria-label="Close"
          >
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left Side - Chessboard */}
            <div className="lg:col-span-2">
              <div className="bg-gray-50 rounded-lg p-2">
                <Chessboard
                  position={puzzleState.position}
                  orientation={orientation}
                  enableArrows
                  preserveDrawingsOnPositionChange={true}
                  moveResult={moveResult}
                  onMove={handleMove}
                  disabled={puzzleState?.completed}
                />
              </div>
            </div>

            {/* Right Side - Controls & Info */}
            <div className="lg:col-span-1 flex flex-col">
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 flex-1 overflow-y-auto">
                {/* Progress */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-1 text-sm">Puzzle Info</h3>
                  <p className="text-xs text-gray-600 mb-2">
                    <span className="font-medium">Side to move:</span> {sideToMove}
                  </p>
                </div>

                {/* Objective */}
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-700 mb-1 text-sm">Objective:</h3>
                  <p className="text-xs text-gray-600">
                    Find the best move{puzzle?.explanation && `. ${puzzle.explanation}`}
                  </p>
                </div>

                {/* Feedback */}
                {feedback && (
                  <div className={`p-2 rounded-lg text-xs font-medium border ${
                    feedback.includes('Correct') || feedback.includes('🎉')
                      ? 'bg-green-50 text-green-800 border-green-200'
                      : 'bg-blue-50 text-blue-800 border-blue-200'
                  }`}>
                    {feedback}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-2 pt-4 border-t">
                  <button
                    onClick={handleShowSolution}
                    className={`px-2 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center text-xs text-white ${
                      showSolution
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-orange-500 hover:bg-orange-600'
                    }`}
                  >
                    <Eye size={14} className="mr-0.5" />
                    Show
                  </button>
                  
                  <button
                    onClick={handleStepBack}
                    className="px-2 py-1.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center justify-center text-xs"
                  >
                    <Undo2 size={14} className="mr-0.5" />
                    Step
                  </button>

                  <button
                    onClick={handleResetPuzzle}
                    className="px-2 py-1.5 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors flex items-center justify-center text-xs"
                  >
                    <RotateCcw size={14} className="mr-0.5" />
                    Reset
                  </button>
                </div>

                {/* Hint Button */}
                {puzzle?.hint && (
                  <button
                    onClick={() => setShowHint(!showHint)}
                    className={`w-full mt-2 px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-center text-xs text-white ${
                      showHint
                        ? 'bg-purple-600 hover:bg-purple-700'
                        : 'bg-purple-500 hover:bg-purple-600'
                    }`}
                  >
                    💡 {showHint ? 'Hide Hint' : 'Show Hint'}
                  </button>
                )}

                {/* Hint Display */}
                {showHint && puzzle?.hint && (
                  <div className="p-3 bg-purple-50 border border-purple-300 rounded-lg mt-2">
                    <h4 className="text-xs font-semibold text-purple-900 mb-1">Hint:</h4>
                    <p className="text-xs text-purple-800">{puzzle.hint}</p>
                  </div>
                )}

                {/* Solution Display */}
                {showSolution && (
                  <div className="p-3 bg-green-50 border border-green-300 rounded-lg">
                    <h4 className="text-xs font-semibold text-green-900 mb-1">Solution Moves:</h4>
                    <p className="text-xs text-green-800 font-mono break-words">
                      {solutionText || (puzzle?.lineUci || 'No solution available')}
                    </p>
                  </div>
                )}

                {/* Puzzle Details - Rating & Themes */}
                <div className="pt-4 border-t">
                  <div className="space-y-3">
                    {puzzle?.rating && (
                      <p className="text-xs text-gray-600">
                        <span className="font-medium">Rating:</span> {puzzle.rating}
                      </p>
                    )}
                  </div>
                </div>

                {/* Themes - Display as Badges */}
                {puzzle?.themes && (Array.isArray(puzzle.themes) ? puzzle.themes.length > 0 : puzzle.themes.trim() !== '') && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-semibold text-gray-800 mb-3">Themes:</h4>
                    <div className="flex flex-wrap gap-2">
                      {(Array.isArray(puzzle.themes) ? puzzle.themes : puzzle.themes.split(/,\s*|\s+/)).map((theme, idx) => (
                        (typeof theme === 'string' ? theme.trim() : theme) && (
                          <span
                            key={idx}
                            className="inline-block px-3 py-1.5 bg-blue-100 text-blue-700 border border-blue-300 rounded-md text-xs font-medium"
                          >
                            {typeof theme === 'string' 
                              ? theme.charAt(0).toUpperCase() + theme.slice(1)
                              : theme}
                          </span>
                        )
                      ))}
                    </div>
                  </div>
                )}

                {/* Close Button */}
                <button
                  onClick={onClose}
                  className="w-full mt-6 px-4 py-3 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-900 transition"
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