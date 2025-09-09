import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Chess } from 'chess.js';
import { 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Play, 
  Pause, 
  Settings,
  Lightbulb,
  Eye,
  SkipForward,
  SkipBack,
  FastForward,
  Rewind
} from 'lucide-react';

const FixMyWeaknesses = ({ recurringWeaknesses, onClose }) => {
  // Chess game state
  const [chess] = useState(new Chess());
  const [board, setBoard] = useState([]);
  const [gameHistory, setGameHistory] = useState([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  
  // Puzzle state
  const [currentPuzzle, setCurrentPuzzle] = useState(null);
  const [puzzles, setPuzzles] = useState([]);
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [puzzleStatus, setPuzzleStatus] = useState('solving'); // 'solving', 'solved', 'analysis'
  const [solutionMoveIndex, setSolutionMoveIndex] = useState(0);
  
  // Engine state
  const [engine, setEngine] = useState(null);
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [engineDepth, setEngineDepth] = useState(15);
  const [currentEvaluation, setCurrentEvaluation] = useState(0);
  const [bestMove, setBestMove] = useState(null);
  const [engineLines, setEngineLines] = useState([]);
  
  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [boardOrientation, setBoardOrientation] = useState('white');
  const [showExplanation, setShowExplanation] = useState(false);
  
  const engineRef = useRef(null);

  useEffect(() => {
    generateWeaknessPuzzles();
  }, [recurringWeaknesses]);

  const generateWeaknessPuzzles = () => {
    console.log('Generating puzzles for weaknesses:', recurringWeaknesses);
    
    if (!recurringWeaknesses || !Array.isArray(recurringWeaknesses) || recurringWeaknesses.length === 0) {
      console.log('No recurring weaknesses found, using default puzzles');
      const defaultPuzzles = getDefaultTacticalPuzzles();
      setPuzzles(defaultPuzzles);
      if (defaultPuzzles.length > 0) {
        setCurrentPuzzle(defaultPuzzles[0]);
      }
      return;
    }

    // Generate puzzles based on user's actual weaknesses
    const generatedPuzzles = [];

    recurringWeaknesses.forEach((weakness, index) => {
      try {
        // Create puzzles based on weakness type
        const puzzleType = identifyPuzzleType(weakness);
        const puzzle = createPuzzleFromWeakness(weakness, puzzleType, index);
        if (puzzle) {
          generatedPuzzles.push(puzzle);
        }
      } catch (error) {
        console.error('Error creating puzzle for weakness:', weakness, error);
      }
    });

    // Add some default tactical puzzles if no specific weaknesses found
    if (generatedPuzzles.length === 0) {
      generatedPuzzles.push(...getDefaultTacticalPuzzles());
    }

    setPuzzles(generatedPuzzles);
    if (generatedPuzzles.length > 0) {
      setCurrentPuzzle(generatedPuzzles[0]);
    }
    console.log('Generated puzzles:', generatedPuzzles);
  };

  const identifyPuzzleType = (weakness) => {
    // Handle different weakness data structures
    let weaknessText = '';
    
    if (typeof weakness === 'string') {
      weaknessText = weakness.toLowerCase();
    } else if (weakness && typeof weakness === 'object') {
      weaknessText = (
        weakness.pattern || 
        weakness.description || 
        weakness.type || 
        weakness.category ||
        weakness.weakness ||
        JSON.stringify(weakness)
      ).toLowerCase();
    }
    
    console.log('Analyzing weakness text:', weaknessText);
    
    if (weaknessText.includes('tactical') || weaknessText.includes('tactic')) {
      if (weaknessText.includes('pin')) return 'pin';
      if (weaknessText.includes('fork')) return 'fork';
      if (weaknessText.includes('skewer')) return 'skewer';
      if (weaknessText.includes('discovery')) return 'discovery';
      if (weaknessText.includes('mate')) return 'mate';
      return 'tactical';
    }
    
    if (weaknessText.includes('endgame')) return 'endgame';
    if (weaknessText.includes('opening')) return 'opening';
    if (weaknessText.includes('positional')) return 'positional';
    if (weaknessText.includes('blunder')) return 'tactical';
    if (weaknessText.includes('hanging')) return 'tactical';
    if (weaknessText.includes('piece')) return 'tactical';
    
    return 'tactical'; // Default to tactical
  };

  const createPuzzleFromWeakness = (weakness, puzzleType, index) => {
    // Enhanced puzzle generation based on actual user weaknesses
    console.log('Creating puzzle for weakness:', weakness);
    
    const puzzleTemplates = {
      tactical: [
        {
          fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5",
          solution: ["Bxf7+", "Kxf7", "Ng5+", "Kg8", "Qh5"],
          question: "White to move - Find the winning tactical sequence!",
          hint1: "Look for a forcing sacrifice that exposes the king",
          hint2: "After the sacrifice, coordinate queen and knight for mate threats",
          explanation: "This classic tactical motif addresses your pattern recognition weakness. The bishop sacrifice on f7 is a common theme that 1500+ players should master."
        },
        {
          fen: "r2qkb1r/ppp2ppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 0 7",
          solution: ["Nxd5", "exd5", "cxd5", "Nb4", "Bb5+"],
          question: "White to move - Find the best continuation!",
          hint1: "Look for a central breakthrough",
          hint2: "After the knight sacrifice, how can you maintain the initiative?",
          explanation: "This puzzle focuses on central pawn breaks and piece activity - key concepts for improving tactical awareness in the center."
        },
        {
          fen: "r1bq1rk1/ppp2ppp/2n1pn2/3p4/1bPP4/2N1PN2/PP2BPPP/R1BQK2R w KQ - 0 8",
          solution: ["d5", "exd5", "cxd5", "Ne7+", "Kh8", "Nxd5"],
          question: "White to move - Break through in the center!",
          hint1: "Central pawn advances can be very powerful",
          hint2: "Look for knight forks after the pawn break",
          explanation: "This addresses your weakness in recognizing central breakthroughs and the tactical opportunities they create."
        }
      ],
      pin: [
        {
          fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 4",
          solution: ["Ng5", "d6", "Nxf7", "Kxf7", "Qh5+"],
          question: "White to move - Exploit the pinned piece!",
          hint1: "The knight on f6 is pinned to the king",
          hint2: "How can you attack the pinned piece?",
          explanation: "This puzzle teaches you to recognize and exploit pins - a crucial tactical skill you need to develop."
        },
        {
          fen: "r2qkb1r/ppp1pppp/2n2n2/3p1b2/3P4/2N1PN2/PPP2PPP/R1BQKB1R w KQkq - 0 6",
          solution: ["Bb5", "Bd7", "Nxd5", "Nxd5", "Bxd7+"],
          question: "White to move - Use the pin to win material!",
          hint1: "Pin the knight to the king first",
          hint2: "Then attack the pinned piece",
          explanation: "This demonstrates how to create pins and then exploit them - addressing your tactical pattern recognition weakness."
        }
      ],
      fork: [
        {
          fen: "rnbqkb1r/ppp2ppp/3p1n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5",
          solution: ["Ng5", "d6", "Nxf7", "Kxf7", "Qh5+", "Kg8", "Qxe5"],
          question: "White to move - Set up a devastating fork!",
          hint1: "Attack the weak f7 square",
          hint2: "After the sacrifice, look for a queen fork",
          explanation: "This puzzle focuses on knight and queen forks - tactical motifs you need to spot more consistently."
        },
        {
          fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 4",
          solution: ["Nd4", "Nxd4", "exd4", "Ne7", "Bxe7"],
          question: "White to move - Find the knight fork!",
          hint1: "Centralize your knight with tempo",
          hint2: "Look for a fork on the next move",
          explanation: "This teaches you to recognize knight fork patterns and how to set them up - addressing your tactical blindness."
        }
      ],
      endgame: [
        {
          fen: "8/8/8/8/8/3K4/3P4/3k4 w - - 0 1",
          solution: ["Kd4", "Kd2", "Ke5", "Ke3", "d4", "Kd3", "Kf6"],
          question: "White to move and win - Master the opposition!",
          hint1: "The king must support the pawn's advance",
          hint2: "Opposition is key - keep your king in front",
          explanation: "This fundamental pawn endgame teaches opposition and king activity - essential for 1500+ players."
        },
        {
          fen: "8/8/8/8/8/8/5PPP/4R1K1 w - - 0 1",
          solution: ["Re8+", "Kf7", "Re7+", "Kf6", "Rxb7"],
          question: "White to move - Activate your rook!",
          hint1: "Use checks to improve your rook's position",
          hint2: "Get to the 7th rank",
          explanation: "This demonstrates rook activity in the endgame - a key concept you need to master for better endgame play."
        },
        {
          fen: "8/1p6/8/8/8/8/6PP/6K1 w - - 0 1",
          solution: ["Kf2", "b5", "Ke3", "b4", "Kd4", "b3", "Kc3"],
          question: "White to move and draw - Stop the pawn!",
          hint1: "Your king must catch the pawn",
          hint2: "Calculate if you can reach the queening square in time",
          explanation: "This teaches pawn race calculations and king activity - crucial endgame skills for your rating level."
        }
      ]
    };

    const templates = puzzleTemplates[puzzleType] || puzzleTemplates.tactical;
    const template = templates[index % templates.length];

    return {
      id: `weakness_${index}`,
      ...template,
      weaknessType: puzzleType,
      relatedWeakness: typeof weakness === 'string' ? weakness : (weakness.pattern || weakness.description || weakness.type || 'Tactical pattern'),
      difficulty: 'intermediate' // Appropriate for 1500+ players
    };
  };

  const getDefaultTacticalPuzzles = () => {
    return [
      {
        id: 'default_1',
        fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 4",
        solution: ["Bxf7+", "Kxf7", "Ng5+"],
        question: "White to move - Find the best continuation!",
        hint1: "Look for a forcing sacrifice",
        hint2: "After the sacrifice, find the knight fork",
        explanation: "A classic tactical motif - sacrifice to expose the king, then fork with the knight.",
        weaknessType: 'tactical',
        difficulty: 'intermediate'
      }
    ];
  };

  const handleMove = (move) => {
    if (!currentPuzzle || puzzleStatus !== 'solving') return;

    setUserMove(move);
    setAttempts(attempts + 1);

    console.log('User move:', move);
    console.log('Expected move:', currentPuzzle.solution[0]);

    // Check if the move is correct (handle different notation formats)
    const correctMove = currentPuzzle.solution[0];
    const isCorrect = isMovesEqual(move, correctMove);

    if (isCorrect) {
      setPuzzleStatus('correct');
      setTimeout(() => {
        nextPuzzle();
      }, 2000);
    } else {
      setPuzzleStatus('incorrect');
      // Don't automatically reset - let user choose to retry with the button
    }
  };

  const isMovesEqual = (move1, move2) => {
    // Handle different move formats (e.g., "e2e4" vs "e4", "Nf3" vs "nf3")
    const normalize = (move) => move.toLowerCase().replace(/[+#]/g, '');
    return normalize(move1) === normalize(move2) || 
           normalize(move1).includes(normalize(move2)) ||
           normalize(move2).includes(normalize(move1));
  };

  const nextPuzzle = () => {
    if (currentPuzzleIndex < puzzles.length - 1) {
      const nextIndex = currentPuzzleIndex + 1;
      setCurrentPuzzleIndex(nextIndex);
      setCurrentPuzzle(puzzles[nextIndex]);
      setPuzzleStatus('solving');
      setUserMove(null);
      setShowHint(false);
      setAttempts(0);
      setShowAnalysis(false);
    } else {
      setPuzzleStatus('completed');
    }
  };

  const previousPuzzle = () => {
    if (currentPuzzleIndex > 0) {
      const prevIndex = currentPuzzleIndex - 1;
      setCurrentPuzzleIndex(prevIndex);
      setCurrentPuzzle(puzzles[prevIndex]);
      setPuzzleStatus('solving');
      setUserMove(null);
      setShowHint(false);
      setAttempts(0);
      setShowAnalysis(false);
    }
  };

  const toggleHint = () => {
    setShowHint(!showHint);
  };

  const resetCurrentPuzzle = () => {
    // Reset the current puzzle to its initial state
    setPuzzleStatus('solving');
    setUserMove(null);
    setShowHint(false);
    setAttempts(0);
    
    // Reset the chess board to the original position
    if (currentPuzzle && currentPuzzle.fen) {
      // The ChessBoard component will automatically reset when the FEN changes
      // We can force a re-render by updating a key or state
      console.log('Resetting puzzle to FEN:', currentPuzzle.fen);
    }
  };

  const showSolution = () => {
    // Show the solution and mark as completed
    setPuzzleStatus('solution');
    setShowHint(true);
    console.log('Solution:', currentPuzzle.solution);
  };

  const toggleAnalysis = () => {
    setShowAnalysis(!showAnalysis);
  };

  if (!currentPuzzle) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: '1.125rem', color: '#6b7280', marginBottom: '1rem' }}>
          Generating puzzles based on your weaknesses...
        </div>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (puzzleStatus === 'completed') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ textAlign: 'center', padding: '2rem' }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎉</div>
        <h3 style={{ fontSize: '1.5rem', color: '#059669', marginBottom: '1rem' }}>
          Congratulations!
        </h3>
        <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
          You've completed all weakness-based puzzles. Keep practicing to strengthen these areas!
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            onClick={() => {
              setCurrentPuzzleIndex(0);
              setCurrentPuzzle(puzzles[0]);
              setPuzzleStatus('solving');
              setUserMove(null);
              setShowHint(false);
              setAttempts(0);
            }}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Practice Again
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Back to Report
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Left Panel - Chess Board */}
      <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
              🎯 Fix My Weaknesses
            </h1>
            <p style={{ color: '#6b7280', fontSize: '1rem' }}>
              Puzzle {currentPuzzleIndex + 1} of {puzzles.length} • {currentPuzzle.weaknessType} • {currentPuzzle.difficulty}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              color: '#374151',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <i className="fas fa-arrow-left"></i>
            Back to Report
          </button>
        </div>

        {/* Question */}
        <div style={{ 
          backgroundColor: '#eff6ff', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          marginBottom: '1rem',
          border: '1px solid #bfdbfe'
        }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#1e40af', marginBottom: '0.5rem' }}>
            {currentPuzzle.question}
          </h3>
          <p style={{ color: '#3730a3', fontSize: '0.875rem' }}>
            Related to: {currentPuzzle.relatedWeakness}
          </p>
        </div>

        {/* Chess Board */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <ChessBoard
            key={`puzzle-${currentPuzzleIndex}-${puzzleStatus}`}
            fen={currentPuzzle.fen}
            onMove={handleMove}
            disabled={puzzleStatus !== 'solving'}
            highlightLastMove={userMove}
            orientation="white"
          />
        </div>

        {/* Status Messages */}
        {puzzleStatus === 'correct' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              backgroundColor: '#dcfce7',
              padding: '1rem',
              borderRadius: '0.5rem',
              border: '1px solid #bbf7d0',
              marginTop: '1rem',
              textAlign: 'center'
            }}
          >
            <div style={{ color: '#059669', fontWeight: '600', fontSize: '1.125rem' }}>
              ✅ Correct! Well done!
            </div>
            <p style={{ color: '#047857', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {currentPuzzle.explanation}
            </p>
          </motion.div>
        )}

        {puzzleStatus === 'incorrect' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              backgroundColor: '#fef2f2',
              padding: '1rem',
              borderRadius: '0.5rem',
              border: '1px solid #fecaca',
              marginTop: '1rem',
              textAlign: 'center'
            }}
          >
            <div style={{ color: '#dc2626', fontWeight: '600', fontSize: '1.125rem' }}>
              ❌ Not quite right!
            </div>
            <p style={{ color: '#b91c1c', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Attempts: {attempts} • Use the "Reset Puzzle" button to try again
            </p>
            {attempts >= 3 && (
              <p style={{ color: '#b91c1c', fontSize: '0.875rem', marginTop: '0.25rem', fontStyle: 'italic' }}>
                💡 Try using the hint button for help!
              </p>
            )}
          </motion.div>
        )}

        {puzzleStatus === 'solution' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              backgroundColor: '#f0f9ff',
              padding: '1rem',
              borderRadius: '0.5rem',
              border: '1px solid #bae6fd',
              marginTop: '1rem',
              textAlign: 'center'
            }}
          >
            <div style={{ color: '#0369a1', fontWeight: '600', fontSize: '1.125rem' }}>
              💡 Solution Revealed
            </div>
            <p style={{ color: '#0c4a6e', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              The correct move was: <strong>{currentPuzzle.solution[0]}</strong>
            </p>
            <p style={{ color: '#0c4a6e', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {currentPuzzle.explanation}
            </p>
          </motion.div>
        )}
      </div>

      {/* Right Panel - Controls and Analysis */}
      <div style={{ 
        width: '350px', 
        backgroundColor: 'white', 
        borderLeft: '1px solid #e5e7eb',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            onClick={previousPuzzle}
            disabled={currentPuzzleIndex === 0}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: currentPuzzleIndex === 0 ? '#f3f4f6' : '#3b82f6',
              color: currentPuzzleIndex === 0 ? '#9ca3af' : 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: currentPuzzleIndex === 0 ? 'not-allowed' : 'pointer',
              fontWeight: '500'
            }}
          >
            <i className="fas fa-chevron-left"></i> Previous
          </button>
          <button
            onClick={nextPuzzle}
            disabled={currentPuzzleIndex === puzzles.length - 1}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: currentPuzzleIndex === puzzles.length - 1 ? '#f3f4f6' : '#3b82f6',
              color: currentPuzzleIndex === puzzles.length - 1 ? '#9ca3af' : 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: currentPuzzleIndex === puzzles.length - 1 ? 'not-allowed' : 'pointer',
              fontWeight: '500'
            }}
          >
            Next <i className="fas fa-chevron-right"></i>
          </button>
        </div>

        {/* Continue Button - Show when solution is revealed */}
        {puzzleStatus === 'solution' && (
          <div style={{ marginBottom: '1rem' }}>
            <button
              onClick={nextPuzzle}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              <i className="fas fa-arrow-right"></i> Continue to Next Puzzle
            </button>
          </div>
        )}

        {/* Retry Button - Show when user made incorrect move */}
        {puzzleStatus === 'incorrect' && (
          <div style={{ marginBottom: '1rem' }}>
            <button
              onClick={resetCurrentPuzzle}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                marginBottom: attempts >= 5 ? '0.5rem' : '0'
              }}
            >
              <i className="fas fa-redo"></i> Reset Puzzle & Try Again
            </button>
            
            {/* Show Solution button after 5 failed attempts */}
            {attempts >= 5 && (
              <button
                onClick={showSolution}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                <i className="fas fa-eye"></i> Show Solution
              </button>
            )}
          </div>
        )}

        {/* Hint Section */}
        <div style={{ marginBottom: '1rem' }}>
          <button
            onClick={toggleHint}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: showHint ? '#fbbf24' : '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: '500',
              marginBottom: '0.5rem'
            }}
          >
            <i className="fas fa-lightbulb"></i> {showHint ? 'Hide Hint' : 'Show Hint'}
          </button>
          
          {showHint && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              style={{
                backgroundColor: '#fef3c7',
                padding: '0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #fcd34d'
              }}
            >
              <p style={{ color: '#92400e', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                <strong>Hint 1:</strong> {currentPuzzle.hint1}
              </p>
              {attempts > 2 && (
                <p style={{ color: '#92400e', fontSize: '0.875rem' }}>
                  <strong>Hint 2:</strong> {currentPuzzle.hint2}
                </p>
              )}
            </motion.div>
          )}
        </div>

        {/* Analysis Toggle */}
        <button
          onClick={toggleAnalysis}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: showAnalysis ? '#6366f1' : '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontWeight: '500',
            marginBottom: '1rem'
          }}
        >
          <i className="fas fa-chart-line"></i> {showAnalysis ? 'Hide Analysis' : 'Show Analysis'}
        </button>

        {/* Analysis Panel */}
        {showAnalysis && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            style={{
              backgroundColor: '#f8fafc',
              padding: '1rem',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0',
              flex: 1
            }}
          >
            <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', marginBottom: '0.75rem' }}>
              Solution Analysis
            </h4>
            
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '0.5rem' }}>
                <strong>Best Move:</strong> {currentPuzzle.solution[0]}
              </p>
              <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '0.5rem' }}>
                <strong>Continuation:</strong> {currentPuzzle.solution.join(' ')}
              </p>
            </div>

            <div style={{ 
              backgroundColor: '#e0f2fe', 
              padding: '0.75rem', 
              borderRadius: '0.375rem',
              border: '1px solid #b3e5fc'
            }}>
              <p style={{ fontSize: '0.875rem', color: '#0277bd' }}>
                {currentPuzzle.explanation}
              </p>
            </div>
          </motion.div>
        )}

        {/* Progress */}
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Progress</span>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              {currentPuzzleIndex + 1}/{puzzles.length}
            </span>
          </div>
          <div style={{ 
            width: '100%', 
            height: '8px', 
            backgroundColor: '#e5e7eb', 
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${((currentPuzzleIndex + 1) / puzzles.length) * 100}%`,
              height: '100%',
              backgroundColor: '#3b82f6',
              transition: 'width 0.3s ease'
            }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FixMyWeaknesses;