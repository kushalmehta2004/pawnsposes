import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft, Eye, EyeOff, RotateCcw, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Chess } from 'chess.js';
import Chessboard from '../components/Chessboard';
import puzzleGenerationService from '../services/puzzleGenerationService';
import { initializePuzzleDatabase, getPuzzleDatabase } from '../utils/puzzleDatabase';
import { useAuth } from '../contexts/AuthContext';
import userProfileService from '../services/userProfileService';
import UpgradePrompt from '../components/UpgradePrompt';

const PuzzlePage = () => {
  const { puzzleType } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const [currentPuzzle, setCurrentPuzzle] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [showSolution, setShowSolution] = useState(false);
  const [solutionText, setSolutionText] = useState('');

  const [puzzles, setPuzzles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [puzzleMetadata, setPuzzleMetadata] = useState(null);
  const [orientation, setOrientation] = useState('white');
  const [resetCounter, setResetCounter] = useState(0);
  const [difficulty, setDifficulty] = useState('easy');
  const [fullPuzzles, setFullPuzzles] = useState([]);
  const [canAccess, setCanAccess] = useState(true);
  const [showUpgradeNotice, setShowUpgradeNotice] = useState(false);

  // Get analysis data and username from location state
  const analysisData = location.state?.analysis;
  const username = analysisData?.username;

  const puzzle = puzzles[currentPuzzle];

  // Key for caching this user's puzzles for this category
  const getCacheKey = () => {
    const user = username || 'anonymous';
    // Increment version to refresh cached sets when generation rules change
    const version = 'v11-adaptive-4to16plies';  // Updated: Adaptive strategy (4-16 plies)
    const diff = (['fix-weaknesses', 'master-openings', 'sharpen-endgame'].includes(puzzleType)) ? `:${difficulty}` : '';
    return `pawnsposes:puzzles:${user}:${puzzleType}${diff}:${version}`;
  };

  // Load puzzles when component mounts
  const deps = [puzzleType, username];
  if (['fix-weaknesses', 'master-openings', 'sharpen-endgame'].includes(puzzleType)) {
    deps.push(difficulty);
  }
  useEffect(() => {
    const gatedLoad = async () => {
      try {
        if (!user?.id) {
          setCanAccess(false);
        } else {
          const allowed = await userProfileService.canAccessPuzzles(user.id);
          setCanAccess(!!allowed);
        }
      } catch (_) {
        setCanAccess(false);
      }
      await loadPuzzles();
    };
    gatedLoad();
  }, deps);

  // Ensure teaser enforcement after puzzles/canAccess are known
  useEffect(() => {
    if (!canAccess && fullPuzzles && fullPuzzles.length > 0) {
      setPuzzles(fullPuzzles.slice(0, 1));
      setCurrentPuzzle(0);
    }
  }, [canAccess, fullPuzzles]);

  // Keep board orientation in sync with current FEN while puzzle is active
  useEffect(() => {
    if (puzzle?.completed) return; // don't flip after completion
    const fen = puzzle?.position || puzzle?.initialPosition;
    const side = (fen && fen.split(' ')[1] === 'b') ? 'black' : 'white';
    setOrientation(side);
  }, [currentPuzzle, puzzles]);

  // For learn-mistakes, show all puzzles without difficulty filtering
  useEffect(() => {
    if (puzzleType === 'learn-mistakes' && fullPuzzles.length > 0) {
      setPuzzles(fullPuzzles);
      setCurrentPuzzle(0);
    }
  }, [fullPuzzles, puzzleType]);

  const loadPuzzles = async () => {
    if (!username) {
      toast.error('No user data found. Please generate a report first.');
      navigate('/reports');
      return;
    }

    setIsLoading(true);
    
    try {
      console.log(`🧩 Loading ${puzzleType} puzzles for ${username}...`);
      
      // 1) Try to reuse cached puzzles for this user+category
      const cacheKey = getCacheKey();
      let cached = null;
      // Disable IndexedDB cache for fix-weaknesses (always fetch from shards)
      if (puzzleType !== 'fix-weaknesses') {
        await initializePuzzleDatabase();
        const db = getPuzzleDatabase();
        cached = await db.getSetting(cacheKey, null);
      }
      if (cached && Array.isArray(cached.puzzles) && cached.puzzles.length > 0) {
        console.log('♻️ Reusing cached puzzles for this session:', cacheKey);
        const initialized = cached.puzzles.map(p => {
          // Base fields
          let initialPosition = p.initialPosition || p.position;
          let position = p.position || p.initialPosition || initialPosition;
          let lineIndex = typeof p.lineIndex === 'number' ? p.lineIndex : (typeof p.startLineIndex === 'number' ? p.startLineIndex : 0);
          let startLineIndex = typeof p.startLineIndex === 'number' ? p.startLineIndex : 0;
          let sideToMove = p.sideToMove || ((position || '').split(' ')[1] === 'b' ? 'black' : 'white');

          // POV alignment for Learn From Mistakes so the USER moves first
          try {
            if (puzzleType === 'learn-mistakes' && (p?.source === 'user_mistake' || p?.source === 'user_game')) {
              const tokens = (p.lineUci || '').split(/\s+/).filter(Boolean);
              if (tokens.length > 0) {
                const eng = new Chess(initialPosition);
                const isUci = (s) => /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(s || '');
                const normalizeSan = (s) => (s || '').replace(/[+#?!]/g, '').replace(/=/g, '').trim();
                const sol = p.solution || '';
                // Test if the provided solution is legal from the current position (indicates user to move)
                let legalFromHere = false;
                try {
                  if (isUci(sol)) {
                    const from = sol.slice(0, 2).toLowerCase();
                    const to = sol.slice(2, 4).toLowerCase();
                    const prom = sol.length > 4 ? sol[4].toLowerCase() : undefined;
                    const test1 = new Chess(initialPosition);
                    legalFromHere = !!test1.move({ from, to, promotion: prom });
                  } else if (sol) {
                    const test2 = new Chess(initialPosition);
                    legalFromHere = !!test2.move(normalizeSan(sol));
                  }
                } catch (_) { /* ignore */ }

                // If solution is NOT legal from this position, but the first PV move is,
                // pre-apply the first PV move so the user plays next
                if (!legalFromHere) {
                  const first = tokens[0];
                  if (isUci(first)) {
                    const e = new Chess(initialPosition);
                    const from = first.slice(0, 2);
                    const to = first.slice(2, 4);
                    const prom = first.length > 4 ? first[4] : undefined;
                    const m = e.move({ from, to, promotion: prom });
                    if (m) {
                      initialPosition = e.fen();
                      position = initialPosition;
                      startLineIndex = 1;
                      lineIndex = 1;
                      sideToMove = initialPosition.split(' ')[1] === 'b' ? 'black' : 'white';
                    }
                  }
                }
              }
            }
          } catch (_) { /* no-op */ }

          return {
            ...p,
            initialPosition,
            position,
            lineIndex,
            startLineIndex,
            sideToMove
          };
        });
        setPuzzles(initialized);
        setFullPuzzles(initialized);
        setPuzzleMetadata(cached.metadata || {});
        setCurrentPuzzle(0); // Reset to first puzzle
        const firstFen = initialized[0]?.position || initialized[0]?.initialPosition;
        const firstSide = (firstFen && firstFen.split(' ')[1] === 'b') ? 'black' : 'white';
        setOrientation(firstSide);
        setIsLoading(false);
        return;
      }
      
      let generatedPuzzles = [];
      let metadata = {};

      switch (puzzleType) {
        case 'fix-weaknesses':
          generatedPuzzles = await puzzleGenerationService.generateWeaknessPuzzles(username, { maxPuzzles: 10, difficulty });
          metadata = {
            title: 'Fix My Weaknesses',
            subtitle: 'Puzzles targeting your recurring mistake patterns',
            description: 'These puzzles are generated from your most common mistakes to help you improve.'
          };
          break;

        case 'learn-mistakes': {
          // Generate directly from user mistakes to ensure distinct set
          generatedPuzzles = await puzzleGenerationService.generateMistakePuzzles(username, { maxPuzzles: 20 });
          metadata = {
            title: 'Learn From My Mistakes',
            subtitle: 'Puzzles from your mistakes',
            description: 'Practice positions created from your own mistakes.'
          };
          break;
        }

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
            { maxPuzzles: 10, difficulty, preferredFamilies: singleTop }
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
          generatedPuzzles = await puzzleGenerationService.generateEndgamePuzzles({ maxPuzzles: 10, difficulty });
          metadata = {
            title: 'Sharpen My Endgame',
            subtitle: 'Essential endgame techniques ',
            description: 'Master fundamental endgame positions and techniques.'
          };
          break;
          
        default:
          toast.error('Invalid puzzle type');
          navigate('/report-display');
          return;
      }

      // Deduplicate puzzles based on position to avoid repeats
      const seen = new Set();
      generatedPuzzles = generatedPuzzles.filter(p => {
        const key = p.position || p.initialPosition;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (generatedPuzzles.length === 0) {
        const msg = puzzleType === 'master-openings'
          ? 'No opening puzzles found for your top openings yet. Play more games or try again later.'
          : 'No puzzles could be generated. Please try again later.';
        toast.error(msg);
        navigate('/report-display');
        return;
      }

      // Initialize per-puzzle line tracking
      // For opening puzzles, advance one move if the line starts before the tactical moment
      const initialized = generatedPuzzles.map(p => {
        const tokens = (p.lineUci || '').split(/\s+/).filter(Boolean);
        let initialPosition = p.position;
        let initialLineIndex = 0;
        let sideToMove = p.sideToMove;
        try {
          // Ensure POV alignment for Learn From Mistakes too: user should move first
          if (puzzleType === 'learn-mistakes' && tokens.length > 0 && (p?.source === 'user_mistake' || p?.source === 'user_game')) {
            const first = tokens[0];
            if (/^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(first)) {
              // If the provided solution isn't legal from the current FEN, pre-apply first PV move
              const isUci = (s) => /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(s || '');
              const normalizeSan = (s) => (s || '').replace(/[+#?!]/g, '').replace(/=/g, '').trim();
              const sol = p.solution || '';
              let legalFromHere = false;
              try {
                if (isUci(sol)) {
                  const test = new Chess(initialPosition);
                  const from = sol.slice(0, 2).toLowerCase();
                  const to = sol.slice(2, 4).toLowerCase();
                  const prom = sol.length > 4 ? sol[4].toLowerCase() : undefined;
                  legalFromHere = !!test.move({ from, to, promotion: prom });
                } else if (sol) {
                  const test = new Chess(initialPosition);
                  legalFromHere = !!test.move(normalizeSan(sol));
                }
              } catch (_) {}
              if (!legalFromHere) {
                const engine = new Chess(initialPosition);
                const from = first.slice(0, 2);
                const to = first.slice(2, 4);
                const prom = first.length > 4 ? first[4] : undefined;
                const m = engine.move({ from, to, promotion: prom });
                if (m) {
                  initialPosition = engine.fen();
                  initialLineIndex = 1;
                  sideToMove = initialPosition.split(' ')[1] === 'b' ? 'black' : 'white';
                }
              }
            }
          }

          if (puzzleType === 'master-openings' && tokens.length > 0) {
            const first = tokens[0];
            if (/^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(first)) {
              const engine = new Chess(initialPosition);
              const from = first.slice(0, 2);
              const to = first.slice(2, 4);
              const prom = first.length > 4 ? first[4] : undefined;
              const m = engine.move({ from, to, promotion: prom });
              if (m) {
                initialPosition = engine.fen();
                initialLineIndex = 1; // start expecting the next move in the sequence
                sideToMove = initialPosition.split(' ')[1] === 'b' ? 'black' : 'white';
                // Also shift displayed single-move solution if present
                if (p.solution && tokens.length > 1) {
                  p = { ...p, solution: tokens[1] };
                }
              }
            }
          }
        } catch (_) {}
        return {
          ...p,
          initialPosition,
          position: initialPosition,
          lineIndex: initialLineIndex,
          startLineIndex: initialLineIndex,
          sideToMove
        };
      });

      // 2) Persist snapshot for this user+category to keep puzzles stable across navigation
      if (puzzleType !== 'fix-weaknesses') {
        try {
          const db = getPuzzleDatabase();
          await db.saveSetting(cacheKey, { puzzles: initialized, metadata, savedAt: Date.now() });
        } catch (e) {
          console.warn('⚠️ Failed to persist puzzle snapshot; proceeding without cache.', e);
        }
      }

      // For free users: show only 1 teaser puzzle on this page
      if (!canAccess) {
        setPuzzles(initialized.slice(0, 1));
        setFullPuzzles(initialized);
      } else {
        setPuzzles(initialized);
        setFullPuzzles(initialized);
      }
      setPuzzleMetadata(metadata);
      setCurrentPuzzle(0); // Reset to first puzzle when regenerating
      // Set board orientation based on starting FEN of first puzzle
      const firstFen = initialized[0]?.position || initialized[0]?.initialPosition;
      const firstSide = (firstFen && firstFen.split(' ')[1] === 'b') ? 'black' : 'white';
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
    if (!canAccess) {
      setShowUpgradeNotice(true);
      return;
    }
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
    // Reset current puzzle to its initial FEN and its original starting line index
    setPuzzles(prev => prev.map((pz, i) => i === currentPuzzle ? { ...pz, position: pz.initialPosition, lineIndex: (typeof pz.startLineIndex === 'number' ? pz.startLineIndex : 0), completed: false } : pz));
    // Orientation from the reset position
    const side = (puzzles[currentPuzzle]?.initialPosition || puzzles[currentPuzzle]?.position || '').split(' ')[1] === 'b' ? 'black' : 'white';
    setOrientation(side);
    // Force Chessboard to re-mount by changing a key
    setResetCounter((c) => c + 1);
  };

  // Step back exactly one user turn (rewind to previous user move in the PV)
  const handleStepBack = () => {
    try {
      const pz = puzzles[currentPuzzle];
      const tokens = (pz?.lineUci || '').split(/\s+/).filter(Boolean);
      const startIdx = typeof pz?.startLineIndex === 'number' ? pz.startLineIndex : 0;
      let curIdx = typeof pz?.lineIndex === 'number' ? pz.lineIndex : startIdx;

      // If no line or at the very start, nothing to step back
      if (!tokens.length || curIdx <= startIdx) return;

      // We want to end on a state where it's the user's turn to move next.
      // The onMove advances: user move (idx), maybe engine reply (idx+1). So user turns are at even offsets from startIdx.
      // Compute previous user index boundary.
      const prevUserIdx = curIdx - ((curIdx - startIdx) % 2 === 0 ? 2 : 1);
      const targetIdx = Math.max(startIdx, prevUserIdx);

      // Rebuild position from initialPosition up to targetIdx moves applied
      const engine = new Chess(pz.initialPosition || pz.position);
      for (let i = startIdx; i < targetIdx; i++) {
        const u = tokens[i];
        if (!/^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(u)) break;
        const from = u.slice(0, 2);
        const to = u.slice(2, 4);
        const prom = u.length > 4 ? u[4] : undefined;
        const m = engine.move({ from, to, promotion: prom });
        if (!m) break;
      }

      const newFen = engine.fen();
      const side = newFen.split(' ')[1] === 'b' ? 'black' : 'white';

      setFeedback('');
      setShowSolution(false);
      setPuzzles(prev => prev.map((pz2, i) => i === currentPuzzle ? { ...pz2, position: newFen, lineIndex: targetIdx, completed: false } : pz2));
      setOrientation(side);
      // Force re-mount to clear any drag state
      setResetCounter((c) => c + 1);
    } catch (_) {
      // no-op on failure
    }
  };

  const handleShowSolution = () => {
    // Toggle: if visible, hide and clear
    if (showSolution) {
      setShowSolution(false);
      setSolutionText('');
      return;
    }

    // Prepare remaining solution from the CURRENT position and current line index
    const tokens = (puzzle?.lineUci || '').split(/\s+/).filter(Boolean);
    const curIdx = typeof puzzle?.lineIndex === 'number' ? puzzle.lineIndex : 0;
    if (!tokens.length || curIdx >= tokens.length) {
      const _exp1 = (puzzle?.explanation || '').trim()
        .replace(/\s*(?:—|-)?\s*Puzzle sourced from Lichess data ?set\.?$/i, '')
        .replace(/\s*(?:—|-)?\s*From curated endgame data ?set\.?$/i, '');
      setSolutionText(`Solution: ${puzzle?.solution}${_exp1 ? ' — ' + _exp1 : ''}`);
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
      const _exp2 = (puzzle?.explanation || '').trim()
        .replace(/\s*(?:—|-)?\s*Puzzle sourced from Lichess data ?set\.?$/i, '')
        .replace(/\s*(?:—|-)?\s*From curated endgame data ?set\.?$/i, '');
      setSolutionText(`Solution: ${sans.join(' ')}${_exp2 ? ' — ' + _exp2 : ''}`);
      setShowSolution(true);
    } catch (_) {
      const _exp3 = (puzzle?.explanation || '').trim()
        .replace(/\s*(?:—|-)?\s*Puzzle sourced from Lichess data ?set\.?$/i, '')
        .replace(/\s*(?:—|-)?\s*From curated endgame data ?set\.?$/i, '');
      setSolutionText(`Solution: ${puzzle?.solution}${_exp3 ? ' — ' + _exp3 : ''}`);
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
              {(puzzleType === 'fix-weaknesses' || puzzleType === 'master-openings' || puzzleType === 'sharpen-endgame') && (
                <div className="mt-3">
                  <label htmlFor="difficulty-select" className="block text-sm font-medium text-gray-700 mb-1">
                    Difficulty Level
                  </label>
                  <select
                    id="difficulty-select"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="easy">Easy </option>
                    <option value="medium">Medium </option>
                    <option value="hard">Hard </option>
                  </select>
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">
                Puzzle {currentPuzzle + 1} of {puzzles.length}
              </div>
              {!canAccess && (
                <div className="text-xs text-amber-700 mt-1">
                  Free teaser: showing 1 of {fullPuzzles?.length || puzzles.length}. Unlock the rest below.
                </div>
              )}
              {puzzle?.source && (
                <div className={`puzzle-source-badge text-xs mt-1 px-2 py-1 rounded-full inline-block ${
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
                enableArrows
                preserveDrawingsOnPositionChange={true}
                onDrawChange={({ arrows, circles }) => {
                  // Optional: could be used to offer "try this line" or hints
                  // console.log('drawings', arrows, circles);
                }}
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
                        const isDone = nextIdx >= tokens.length;
                        setPuzzles(prev => prev.map((pz, i) => i === currentPuzzle ? { ...pz, position: newFen, lineIndex: nextIdx, completed: isDone } : pz));
                        if (!isDone) {
                          const side = newFen.split(' ')[1] === 'b' ? 'black' : 'white';
                          setOrientation(side);
                        }
                        if (isDone) {
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
                  Side to move: <span className="font-semibold">{orientation === 'black' ? 'Black' : 'White'}</span>
                </div>
                {puzzleType === 'learn-mistakes' && puzzle?.playerMove && (
                  <div className="text-xs text-gray-600 mb-2">
                    In your game, you played: <span className="font-semibold">{puzzle.playerMove}</span>
                  </div>
                )}
                {puzzleType !== 'learn-mistakes' && puzzle?.gameInfo && (
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
                    disabled={!canAccess || currentPuzzle === puzzles.length - 1}
                    className="px-4 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400 text-sm font-semibold flex items-center justify-center shadow-md"
                  >
                    Next →
                  </button>
                </div>
                
                {/* Action Buttons - Bottom Row */}
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={handleShowSolution}
                    className="px-4 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-semibold flex items-center justify-center shadow-md"
                  >
                    {showSolution ? (
                      <>
                        <EyeOff size={16} className="mr-2" />
                        Hide Solution
                      </>
                    ) : (
                      <>
                        <Eye size={16} className="mr-2" />
                        Show Solution
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleStepBack}
                    disabled={!puzzle?.lineUci || (typeof puzzle?.lineIndex === 'number' ? puzzle.lineIndex : (typeof puzzle?.startLineIndex === 'number' ? puzzle.startLineIndex : 0)) <= (typeof puzzle?.startLineIndex === 'number' ? puzzle.startLineIndex : 0)}
                    className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-semibold flex items-center justify-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Undo2 size={16} className="mr-2" />
                    Step Back
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

              {/* Inline notice when free user tries Next */}
              {!canAccess && showUpgradeNotice && (
                <div className="mt-4 p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm">
                  You are on the free plan. Subscribe or buy a one-time pack to access the remaining puzzles in this section.
                </div>
              )}

              {/* Upgrade prompt inline for free users */}
              {!canAccess && (
                <div className="mt-6">
                  <UpgradePrompt title="Unlock All Puzzles in This Set" description="Subscribe or buy a one-time pack to access the full personalized puzzle set generated from your games." />
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