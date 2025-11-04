import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

import { Loader2, ArrowLeft, Eye, EyeOff, RotateCcw, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Chess } from 'chess.js';
import Chessboard from '../components/Chessboard';
import { useAuth } from '../contexts/AuthContext';
import { PuzzleDataContext } from '../contexts/PuzzleDataContext';
import userProfileService from '../services/userProfileService';
import puzzleGenerationService from '../services/puzzleGenerationService';
import puzzleAccessService from '../services/puzzleAccessService';
import UpgradePrompt from '../components/UpgradePrompt';
import { initializePuzzleDatabase, getPuzzleDatabase } from '../utils/puzzleDatabase';

const PuzzlePage = () => {
  const { puzzleType } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const puzzleContext = useContext(PuzzleDataContext);
  
  const [currentPuzzle, setCurrentPuzzle] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [showSolution, setShowSolution] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [showHint, setShowHint] = useState(false);

  const [puzzles, setPuzzles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [puzzleMetadata, setPuzzleMetadata] = useState(null);
  const [orientation, setOrientation] = useState('white');
  const [difficulty, setDifficulty] = useState('easy');
  const [fullPuzzles, setFullPuzzles] = useState([]);
  const [puzzlesByDifficulty, setPuzzlesByDifficulty] = useState({
    easy: [],
    medium: [],
    hard: []
  });
  const [canAccess, setCanAccess] = useState(true);
  const [showUpgradeNotice, setShowUpgradeNotice] = useState(false);
  const [moveResult, setMoveResult] = useState(null); // { square, isCorrect }
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  
  // Auto-stepback feature for incorrect moves
  const [autoStepbackCountdown, setAutoStepbackCountdown] = useState(null); // null or { remaining: number, toastId: string }
  const [isStepbackAnimating, setIsStepbackAnimating] = useState(false); // Smooth animation when stepback occurs
  const autoStepbackTimeoutRef = React.useRef(null);
  const autoStepbackToastIdRef = React.useRef(null);
  const autoStepbackPreMovePositionRef = React.useRef(null); // Store position before the wrong move

  const puzzle = puzzles[currentPuzzle];

  const nextHintMove = useMemo(() => {
    if (!puzzle || !puzzle.lineUci) return null;
    const tokens = puzzle.lineUci.split(/\s+/).filter(Boolean);
    const index = typeof puzzle?.lineIndex === 'number' ? puzzle.lineIndex : 0;
    const nextUci = tokens[index];
    if (!nextUci) return null;

    const from = nextUci.slice(0, 2);
    const to = nextUci.slice(2, 4);
    const promotion = nextUci.length > 4 ? nextUci[4] : undefined;

    try {
      // Use current position (after auto-play), fallback to initial position
      const engine = new Chess(puzzle.position || puzzle.initialPosition);
      const move = engine.move({ from, to, promotion });
      if (!move) return null;
      return {
        from,
        to,
        uci: nextUci,
        san: move.san
      };
    } catch (_) {
      return null;
    }
  }, [puzzle?.lineUci, puzzle?.lineIndex, puzzle?.position, puzzle?.initialPosition]);

  const hasTextHint = typeof puzzle?.hint === 'string' && puzzle.hint.trim().length > 0;

  const getHintMove = () => {
    if (!puzzle || !puzzle.lineUci) return null;
    const tokens = puzzle.lineUci.split(/\s+/).filter(Boolean);
    const index = typeof puzzle?.lineIndex === 'number' ? puzzle.lineIndex : 0;
    const hintUci = tokens[index];
    
    if (!hintUci || !/^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(hintUci)) return null;
    
    try {
      const engine = new Chess(puzzle.position);
      const from = hintUci.slice(0, 2);
      const to = hintUci.slice(2, 4);
      const promotion = hintUci.length > 4 ? hintUci[4] : undefined;
      const move = engine.move({ from, to, promotion });
      if (!move) return null;
      return `${move.san} (${hintUci})`;
    } catch (_) {
      return hintUci;
    }
  };

  // Cleanup auto-stepback timer on component unmount
  useEffect(() => {
    return () => {
      if (autoStepbackTimeoutRef.current) {
        clearTimeout(autoStepbackTimeoutRef.current);
      }
      if (autoStepbackToastIdRef.current) {
        toast.dismiss(autoStepbackToastIdRef.current);
      }
    };
  }, []);

  // Cancel auto-stepback when puzzle changes
  useEffect(() => {
    if (autoStepbackTimeoutRef.current) {
      clearTimeout(autoStepbackTimeoutRef.current);
      autoStepbackTimeoutRef.current = null;
    }
    if (autoStepbackToastIdRef.current) {
      toast.dismiss(autoStepbackToastIdRef.current);
      autoStepbackToastIdRef.current = null;
    }
    setAutoStepbackCountdown(null);
  }, [currentPuzzle]);

  // Load streak data from localStorage on mount
  useEffect(() => {
    const streakKey = `pawnsposes:streak:${puzzleType}`;
    const savedBestStreak = localStorage.getItem(streakKey);
    if (savedBestStreak) {
      setBestStreak(parseInt(savedBestStreak, 10));
    }
    setCurrentStreak(0); // Reset current streak on page load
  }, [puzzleType]);

  // Access check on mount
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
  }, [puzzleType, user?.id]);

  // Enforce teaser for free users - removed this effect, will handle in difficulty partitioning below
  // useEffect(() => {
  //   if (!canAccess && fullPuzzles && fullPuzzles.length > 0) {
  //     setPuzzles(fullPuzzles.slice(0, 1));
  //     setCurrentPuzzle(0);
  //   }
  // }, [canAccess, fullPuzzles]);

  // Partition puzzles by difficulty level based on RATING
  // Easy: 700-1500 (10 puzzles), Medium: 1500-2000 (10 puzzles), Hard: 2000+ (10 puzzles)
  // Total: 30 puzzles per page
  // NOTE: learn-mistakes uses dynamically generated puzzles with pre-assigned difficulties, so skip this
  useEffect(() => {
    if (fullPuzzles.length > 0 && puzzleType !== 'learn-mistakes') {
      const easyPuzzles = fullPuzzles.filter(p => {
        const rating = p.rating || 0;
        return rating >= 700 && rating < 1500;
      }).slice(0, 10);
      
      const mediumPuzzles = fullPuzzles.filter(p => {
        const rating = p.rating || 0;
        return rating >= 1500 && rating < 2000;
      }).slice(0, 10);
      
      const hardPuzzles = fullPuzzles.filter(p => {
        const rating = p.rating || 0;
        return rating >= 2000;
      }).slice(0, 10);
      
      setPuzzlesByDifficulty({
        easy: easyPuzzles,
        medium: mediumPuzzles,
        hard: hardPuzzles
      });
      
      console.log(`📊 Difficulty Distribution - Easy: ${easyPuzzles.length}/10, Medium: ${mediumPuzzles.length}/10, Hard: ${hardPuzzles.length}/10 (Total: 30 puzzles per page)`);
      
      // For free users with teaser: show 1 puzzle from each difficulty section
      if (!canAccess) {
        const teaserPuzzles = [
          ...(easyPuzzles.length > 0 ? easyPuzzles.slice(0, 1) : []),
          ...(mediumPuzzles.length > 0 ? mediumPuzzles.slice(0, 1) : []),
          ...(hardPuzzles.length > 0 ? hardPuzzles.slice(0, 1) : [])
        ];
        setPuzzles(teaserPuzzles);
        console.log(`🎯 Free tier teaser: showing ${teaserPuzzles.length} puzzles (1 from each difficulty level)`);
      } else {
        setPuzzles(easyPuzzles);
      }
      setCurrentPuzzle(0);
      setDifficulty('easy');
    }
  }, [fullPuzzles, canAccess, puzzleType]);

  // For learn-mistakes, show all puzzles without difficulty filtering
  // For free users, limit to 1 puzzle as teaser
  useEffect(() => {
    if (puzzleType === 'learn-mistakes' && fullPuzzles.length > 0) {
      if (!canAccess) {
        // Free tier teaser: show only 1 puzzle from learn-mistakes
        setPuzzles(fullPuzzles.slice(0, 1));
        console.log(`🎯 Free tier teaser: showing 1 Learn From Mistakes puzzle`);
      } else {
        setPuzzles(fullPuzzles);
      }
      setCurrentPuzzle(0);
    }
  }, [fullPuzzles, puzzleType, canAccess]);

  // Set board orientation based on current puzzle's FEN (after auto-play)
  // Only runs when puzzle changes, NOT during moves
  useEffect(() => {
    if (!puzzle) return;

    // Clear move result feedback when puzzle changes
    setMoveResult(null);

    // Use current position (after first move auto-play) to determine user's color
    // Fall back to initialPosition if position is not available
    // Set once and keep it fixed - don't change during gameplay
    const fenToCheck = puzzle.position || puzzle.initialPosition;
    if (fenToCheck) {
      try {
        const turnIndicator = fenToCheck.split(' ')[1];
        const side = turnIndicator === 'b' ? 'black' : 'white';
        setOrientation(side);
      } catch (e) {
        console.warn('⚠️ Error extracting turn from FEN, defaulting to white');
        setOrientation('white');
      }
    }

    if (!puzzle.id) {
      console.error(`❌ Puzzle at index ${currentPuzzle} has no ID`, puzzle);
    }
    
    if (!puzzle.solution && !puzzle.lineUci) {
      console.error(`❌ Puzzle ${puzzle.id || `(index ${currentPuzzle})`} missing solution/lineUci`);
    }
  }, [currentPuzzle]);

  /**
   * PRODUCTION-LEVEL PUZZLE LOADER - Loads directly from public shard files
   * Source of Truth: JSON files in /public/tactics, /public/openings, /public/endgames
   * Uses caching to ensure same puzzles are shown on subsequent visits
   */
  const loadPuzzles = async () => {
    setIsLoading(true);
    
    try {
      // Check if puzzles are already cached for this type
      // NOTE: learn-mistakes uses dynamic generation, so don't cache it
      let cachedPuzzles = null;
      
      if (puzzleType === 'fix-weaknesses' && puzzleContext.weaknessPuzzles.length > 0) {
        console.log(`📦 Using cached weakness puzzles...`);
        cachedPuzzles = puzzleContext.weaknessPuzzles;
      } else if (puzzleType === 'master-openings' && puzzleContext.openingPuzzles.length > 0) {
        console.log(`📦 Using cached opening puzzles...`);
        cachedPuzzles = puzzleContext.openingPuzzles;
      } else if (puzzleType === 'sharpen-endgame' && puzzleContext.endgamePuzzles.length > 0) {
        console.log(`📦 Using cached endgame puzzles...`);
        cachedPuzzles = puzzleContext.endgamePuzzles;
      }

      // If we have cached puzzles, use them
      if (cachedPuzzles && cachedPuzzles.length > 0) {
        setFullPuzzles(cachedPuzzles);
        let metadata = {};
        
        switch (puzzleType) {
          case 'fix-weaknesses':
            metadata = {
              title: 'Fix My Weaknesses',
              subtitle: 'Address common tactical blindspots',
              description: 'Master the tactical patterns you need to improve.'
            };
            break;
          case 'master-openings':
            metadata = {
              title: 'Master My Openings',
              subtitle: 'Strengthen your opening repertoire',
              description: 'Improve your understanding of key opening positions.'
            };
            break;
          case 'sharpen-endgame':
            metadata = {
              title: 'Sharpen My Endgame',
              subtitle: 'Essential endgame techniques',
              description: 'Master fundamental endgame positions and techniques.'
            };
            break;
        }
        
        setPuzzleMetadata(metadata);
        setCurrentPuzzle(0);
        const firstFen = cachedPuzzles[0]?.position;
        const firstSide = firstFen ? (firstFen.split(' ')[1] === 'b' ? 'black' : 'white') : 'white';
        setOrientation(firstSide);
        console.log(`✅ Successfully loaded ${cachedPuzzles.length} cached puzzles (Type: ${puzzleType})`);
        setIsLoading(false);
        return;
      }

      // Load fresh puzzles if not cached
      console.log(`🧩 Loading ${puzzleType} puzzles...`);
      
      let allPuzzles = [];
      let metadata = {};

      switch (puzzleType) {
        case 'fix-weaknesses':
          allPuzzles = await loadAllTacticsPuzzles('fix-weaknesses');
          metadata = {
            title: 'Fix My Weaknesses',
            subtitle: 'Address common tactical blindspots',
            description: 'Master the tactical patterns you need to improve.'
          };
          break;

        case 'learn-mistakes': {
          const analysisData = location.state?.analysis;
          const username = analysisData?.username || analysisData?.rawAnalysis?.username || analysisData?.formData?.username;

          if (!username) {
            console.error('❌ Missing username for learn-mistakes puzzles.');
            toast.error('Please regenerate your report before loading these puzzles.');
            navigate('/report-display');
            return;
          }

          console.log(`📚 Loading Learn From Mistakes puzzles for ${username}...`);

          let cachedData = null;
          let generatedPuzzles = [];

          try {
            await initializePuzzleDatabase();
            const db = getPuzzleDatabase();
            const cacheKey = `pawnsposes:puzzles:${username}:learn-mistakes:v11-adaptive-4to16plies`;
            cachedData = await db.getSetting(cacheKey, null);

            if (cachedData?.puzzles?.length) {
              console.log(`✅ Loaded ${cachedData.puzzles.length} cached Learn From Mistakes puzzles.`);
              generatedPuzzles = cachedData.puzzles;
            }
          } catch (cacheError) {
            console.warn('⚠️ Failed to load Learn From Mistakes puzzles from cache:', cacheError);
          }

          if (!generatedPuzzles.length) {
            try {
              generatedPuzzles = await puzzleGenerationService.generateMistakePuzzles(username, { maxPuzzles: 20 });
              console.log(`🛠️ Generated ${generatedPuzzles.length} Learn From Mistakes puzzles on demand.`);
              try {
                const db = getPuzzleDatabase();
                await db.saveSetting(
                  `pawnsposes:puzzles:${username}:learn-mistakes:v11-adaptive-4to16plies`,
                  {
                    puzzles: generatedPuzzles,
                    metadata: {
                      title: 'Learn From My Mistakes',
                      subtitle: 'Puzzles from your mistakes',
                      description: 'Practice positions created from your own mistakes.'
                    },
                    savedAt: Date.now()
                  }
                );
              } catch (saveError) {
                console.warn('⚠️ Failed to persist Learn From Mistakes puzzles to cache:', saveError);
              }
            } catch (generationError) {
              console.error('❌ Failed to generate Learn From Mistakes puzzles:', generationError);
              toast.error('Puzzles are still being prepared. Please return to the report and try again soon.');
              navigate('/report-display');
              return;
            }
          }

          if (!generatedPuzzles.length) {
            console.warn('⚠️ No Learn From Mistakes puzzles available after generation/cache attempts.');
            toast.error('No puzzles available right now. Please return to the report and try again in a moment.');
            navigate('/report-display');
            return;
          }

          // Normalize generated puzzles (ensure FEN + orientation + line indices)
          const initialized = generatedPuzzles.map(p => {
            const tokens = (p.lineUci || '').split(/\s+/).filter(Boolean);
            let initialPosition = p.initialPosition || p.position || p.fen || '';
            let lineIndex = typeof p.startLineIndex === 'number' ? p.startLineIndex : 0;
            let startLineIndex = lineIndex;
            let sideToMove = p.sideToMove || (initialPosition.split(' ')[1] === 'b' ? 'black' : 'white');

            try {
              if (tokens.length > 0 && (p.source === 'user_mistake' || p.source === 'user_game')) {
                const first = tokens[0];
                const solutionMove = p.solution || '';
                const isUci = move => /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(move || '');

                let solutionLegalFromCurrent = false;
                if (solutionMove) {
                  const engine = new Chess(initialPosition);
                  try {
                    if (isUci(solutionMove)) {
                      const from = solutionMove.slice(0, 2).toLowerCase();
                      const to = solutionMove.slice(2, 4).toLowerCase();
                      const promotion = solutionMove.length > 4 ? solutionMove[4].toLowerCase() : undefined;
                      solutionLegalFromCurrent = !!engine.move({ from, to, promotion });
                    } else {
                      solutionLegalFromCurrent = !!engine.move(solutionMove);
                    }
                  } catch (_) {}
                }

                if (!solutionLegalFromCurrent && isUci(first)) {
                  const engine = new Chess(initialPosition);
                  const from = first.slice(0, 2);
                  const to = first.slice(2, 4);
                  const promotion = first.length > 4 ? first[4] : undefined;
                  const move = engine.move({ from, to, promotion });
                  if (move) {
                    initialPosition = engine.fen();
                    lineIndex = 1;
                    startLineIndex = 1;
                    sideToMove = initialPosition.split(' ')[1] === 'b' ? 'black' : 'white';
                  }
                }
              }
            } catch (_) {
              // no-op if normalization fails
            }

            if (!initialPosition || initialPosition.split(' ').length < 2) {
              console.warn('⚠️ Puzzle missing valid FEN, skipping normalization:', p);
            }

            return {
              ...p,
              initialPosition,
              position: initialPosition,
              lineIndex,
              startLineIndex,
              sideToMove,
              source: p.source || 'user_game'
            };
          });

          allPuzzles = initialized;

          metadata = {
            title: 'Learn From My Mistakes',
            subtitle: 'Puzzles from your mistakes',
            description: 'Practice positions created from your own mistakes.'
          };
          break;
        }

        case 'master-openings':
          allPuzzles = await loadAllOpeningsPuzzles();
          metadata = {
            title: 'Master My Openings',
            subtitle: 'Strengthen your opening repertoire',
            description: 'Improve your understanding of key opening positions.'
          };
          break;

        case 'sharpen-endgame':
          allPuzzles = await loadAllEndgamePuzzles();
          metadata = {
            title: 'Sharpen My Endgame',
            subtitle: 'Essential endgame techniques',
            description: 'Master fundamental endgame positions and techniques.'
          };
          break;

        default:
          toast.error('Invalid puzzle type');
          navigate('/report-display');
          return;
      }

      // Validate puzzles loaded
      if (!allPuzzles || allPuzzles.length === 0) {
        if (puzzleType === 'learn-mistakes') {
          console.error(`❌ No puzzles found in cache for Learn From Mistakes.`);
          toast.error('Puzzles are being generated in the background. Please go back to the report and try again in a moment.', {
            duration: 4000
          });
        } else {
          console.error(`❌ No puzzles loaded from ${puzzleType} shards`);
          toast.error('No puzzles available. Please try again later.');
        }
        navigate('/report-display');
        return;
      }

      // SHUFFLE PUZZLES RANDOMLY and load more to ensure good rating distribution
      // Load up to 100 puzzles to ensure we have puzzles in all difficulty ranges
      // ✅ CRITICAL FIX: Shuffle first, then select - ensures balanced mix from all categories
      const maxPuzzles = Math.min(100, allPuzzles.length);
      const shuffledPuzzles = allPuzzles
        .sort(() => Math.random() - 0.5)  // Shuffle ALL puzzles first
        .slice(0, maxPuzzles);             // Then take first 100
      console.log(`📦 Selected and shuffled ${shuffledPuzzles.length} puzzles from ${allPuzzles.length} available (randomly ordered)`);

      // Normalize and transform puzzle data for display
      const normalized = shuffledPuzzles.map((p, idx) => {
        // Check if this is a generated puzzle (from generateMistakePuzzles) or a shard puzzle
        const isGenerated = puzzleType === 'learn-mistakes' && p.source === 'user_game';
        
        let fen, moves, solutionMove, lineUci, position, lineIndex, id;
        
        if (isGenerated) {
          // Generated puzzle structure
          fen = p.initialPosition || p.fen || '';
          lineUci = p.lineUci || '';
          const tokens = lineUci.split(/\s+/).filter(Boolean);
          solutionMove = tokens[0] || '';
          position = p.position || fen;
          lineIndex = p.startLineIndex || 0;
          id = p.id;
        } else {
          // Shard puzzle structure
          fen = p.Fen || p.position || '';
          moves = (p.Moves || '').trim();
          const tokens = moves.split(/\s+/).filter(Boolean);
          solutionMove = tokens[0] || '';
          lineUci = moves;
          position = fen;
          lineIndex = 0;
          id = p.PuzzleId || `PUZZLE_${idx + 1}`;
          
          // AUTO-PLAY the first move for shard puzzles so user starts from the second move
          if (solutionMove && /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(solutionMove)) {
            try {
              const engine = new Chess(fen);
              const from = solutionMove.slice(0, 2);
              const to = solutionMove.slice(2, 4);
              const prom = solutionMove.length > 4 ? solutionMove[4] : undefined;
              const moveObj = engine.move({ from, to, promotion: prom });
              
              if (moveObj) {
                position = engine.fen();
                lineIndex = 1; // User's turn starts from move 2
                console.log(`🎯 Auto-played first move: ${solutionMove} for puzzle ${id}`);
              } else {
                console.warn(`⚠️ Invalid first move ${solutionMove} for puzzle ${id}`);
              }
            } catch (err) {
              console.warn(`⚠️ Error auto-playing first move for puzzle ${id}:`, err.message);
            }
          }
        }
        
        if (!fen) {
          console.warn(`⚠️ Puzzle at index ${idx} missing FEN, skipping`);
          return null;
        }

        return {
          id: id,
          position: position,
          initialPosition: fen,
          solution: solutionMove,
          lineUci: lineUci,
          fen: fen,
          rating: p.rating || p.Rating,
          popularity: p.Popularity,
          themes: p.Themes || p.themes || '',
          explanation: p.Explanation || p.explanation || '',
          lineIndex: lineIndex,
          startLineIndex: lineIndex,
          completed: false,
          difficulty: p.difficulty
        };
      }).filter(Boolean);

      // ✅ VERIFICATION: Show category distribution for weakness puzzles
      if (puzzleType === 'fix-weaknesses' && normalized.length > 0) {
        const categoryCount = {};
        normalized.forEach(p => {
          const theme = p.themes || '';
          const mainTheme = Array.isArray(theme) ? theme[0] : theme.split(',')[0];
          categoryCount[mainTheme] = (categoryCount[mainTheme] || 0) + 1;
        });
        console.log(`📊 Category distribution in selected puzzles:`, categoryCount);
      }

      if (normalized.length === 0) {
        console.error('❌ No valid puzzles after normalization');
        toast.error('Error processing puzzles. Please try again.');
        navigate('/report-display');
        return;
      }

      // Filter out puzzles that have already been used in other puzzle types
      let filteredPuzzles;

      if (puzzleType === 'learn-mistakes') {
        filteredPuzzles = normalized;
      } else {
        filteredPuzzles = normalized.filter(p => {
          const isUsed = puzzleContext.isPuzzleUsed(p.id);
          if (isUsed) {
            console.warn(`⚠️ Puzzle ${p.id} already used in another puzzle type, filtering out`);
          }
          return !isUsed;
        });

        if (filteredPuzzles.length === 0) {
          console.error('❌ No unique puzzles available (all have been used in other puzzle types)');
          toast.error('All available puzzles have been used. Please try another puzzle type.');
          navigate('/report-display');
          return;
        }

        console.log(`✅ Filtered puzzles: ${filteredPuzzles.length} unique puzzles (removed ${normalized.length - filteredPuzzles.length} duplicates)`);

        // Mark these puzzles as used for future puzzle page loads
        const usedIds = filteredPuzzles.map(p => p.id);
        puzzleContext.markPuzzlesAsUsed(usedIds);
      }

      // 🔴 PRODUCTION FIX: Store the exact puzzles being displayed to Supabase
      // This ensures Dashboard will fetch the same puzzles the user is seeing
      // CRITICAL: Store puzzles organized by difficulty so Dashboard shows easy/medium/hard correctly
      if (user?.id && (puzzleType === 'fix-weaknesses' || puzzleType === 'master-openings' || puzzleType === 'sharpen-endgame')) {
        try {
          console.log(`💾 Storing displayed puzzles to Supabase for ${puzzleType}...`);
          
          // Get the most recent report ID for this user
          const reportId = await puzzleAccessService.getMostRecentReportId(user.id);
          
          if (reportId) {
            // Map puzzle type to category name
            const categoryMap = {
              'fix-weaknesses': 'weakness',
              'master-openings': 'opening',
              'sharpen-endgame': 'endgame'
            };
            const category = categoryMap[puzzleType];
            
            // 🎯 CRITICAL FIX: Partition puzzles by difficulty BEFORE storing
            // This ensures Dashboard gets the same easy/medium/hard split
            let puzzlesToStore = filteredPuzzles;
            
            if (puzzleType !== 'learn-mistakes') {
              // Partition puzzles by rating to match UI display
              // Easy: 700-1500, Medium: 1500-2000, Hard: 2000+ (no gap!)
              const easyPuzzles = filteredPuzzles.filter(p => {
                const rating = p.rating || 0;
                return rating >= 700 && rating < 1500;
              }).slice(0, 10);
              
              const mediumPuzzles = filteredPuzzles.filter(p => {
                const rating = p.rating || 0;
                return rating >= 1500 && rating < 2000;
              }).slice(0, 10);
              
              const hardPuzzles = filteredPuzzles.filter(p => {
                const rating = p.rating || 0;
                return rating >= 2000;
              }).slice(0, 10);
              
              // Combine in order: easy, then medium, then hard (as they appear in UI tabs)
              puzzlesToStore = [...easyPuzzles, ...mediumPuzzles, ...hardPuzzles];
              
              console.log(`📊 Partitioned puzzles for storage: Easy=${easyPuzzles.length}, Medium=${mediumPuzzles.length}, Hard=${hardPuzzles.length}, Total=${puzzlesToStore.length}`);
            }
            
            // ✅ CRITICAL FIX: Store ALL puzzles to Supabase, don't limit for free users
            // The teaser restriction should be applied on DISPLAY, not on STORAGE
            // This ensures free users still see 1 puzzle from each difficulty on subsequent visits
            // If we store only 1 puzzle, free users will never see the teaser from other difficulties
            
            // Store the puzzles to Supabase
            const storedCount = await puzzleAccessService.storePuzzlesToSupabase(
              user.id,
              puzzlesToStore,
              category,
              reportId
            );
            
            console.log(`✅ Stored ${storedCount} puzzles to Supabase for Dashboard synchronization`);
          } else {
            console.warn('⚠️ Could not find report ID. Puzzles will not be stored to Supabase.');
            console.warn('   This might happen if user navigated directly to puzzle page without generating a report.');
          }
        } catch (storeError) {
          console.error('❌ Failed to store puzzles to Supabase:', storeError);
          // Don't block the UI - let user see puzzles even if storage failed
          console.warn('   Puzzles will still be displayed, but Dashboard synchronization may be affected.');
        }
      }

      // For free users: show only 1 teaser puzzle
      if (!canAccess) {
        setPuzzles(filteredPuzzles.slice(0, 1));
        setFullPuzzles(filteredPuzzles);
      } else {
        setPuzzles(filteredPuzzles);
        setFullPuzzles(filteredPuzzles);
      }

      // Cache the filtered puzzles in context for future visits
      // NOTE: learn-mistakes uses dynamic generation, so don't cache it
      if (puzzleType === 'fix-weaknesses') {
        // Find existing data and update only this puzzle type
        if (puzzleContext.mistakePuzzles.length > 0 || puzzleContext.openingPuzzles.length > 0 || puzzleContext.endgamePuzzles.length > 0) {
          // Already have some cache, update just this one
          puzzleContext.updatePuzzleData(user?.id, filteredPuzzles, puzzleContext.mistakePuzzles, puzzleContext.openingPuzzles, puzzleContext.endgamePuzzles);
        } else {
          puzzleContext.updatePuzzleData(user?.id, filteredPuzzles, [], [], []);
        }
      } else if (puzzleType === 'master-openings') {
        if (puzzleContext.weaknessPuzzles.length > 0 || puzzleContext.mistakePuzzles.length > 0 || puzzleContext.endgamePuzzles.length > 0) {
          puzzleContext.updatePuzzleData(user?.id, puzzleContext.weaknessPuzzles, puzzleContext.mistakePuzzles, filteredPuzzles, puzzleContext.endgamePuzzles);
        } else {
          puzzleContext.updatePuzzleData(user?.id, [], [], filteredPuzzles, []);
        }
      } else if (puzzleType === 'sharpen-endgame') {
        if (puzzleContext.weaknessPuzzles.length > 0 || puzzleContext.mistakePuzzles.length > 0 || puzzleContext.openingPuzzles.length > 0) {
          puzzleContext.updatePuzzleData(user?.id, puzzleContext.weaknessPuzzles, puzzleContext.mistakePuzzles, puzzleContext.openingPuzzles, filteredPuzzles);
        } else {
          puzzleContext.updatePuzzleData(user?.id, [], [], [], filteredPuzzles);
        }
      }

      setPuzzleMetadata(metadata);
      setCurrentPuzzle(0);

      const firstFen = filteredPuzzles[0]?.position;
      const firstSide = firstFen ? (firstFen.split(' ')[1] === 'b' ? 'black' : 'white') : 'white';
      setOrientation(firstSide);

      const source = puzzleType === 'learn-mistakes' ? 'generated from user games' : 'shards';
      console.log(`✅ Successfully loaded ${filteredPuzzles.length} unique puzzles ${source} (Type: ${puzzleType})`);

    } catch (error) {
      console.error('❌ Error loading puzzles from shards:', error);
      toast.error('Failed to load puzzles. Please try again.');
      navigate('/report-display');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Load tactics puzzles from specific categories (from shard files)
   * Only used for 'fix-weaknesses' now
   * 'learn-mistakes' uses dynamic generation from user games
   */
  const loadAllTacticsPuzzles = async (puzzleTypeCategory = 'fix-weaknesses') => {
    // Tactic categories for fix-weaknesses (excluding fork, mate-in-1, mate-in-2, mate-in-3)
    const weaknessesTactics = ['pin', 'trapped-piece', 'hanging-piece', 'weak-king', 'back-rank-mate', 'discovered-attack', 'skewer', 'x-ray'];
    let tacticCategories = weaknessesTactics;
    
    // For backward compatibility, if 'all' is requested
    if (puzzleTypeCategory === 'all') {
      const allTactics = ['back-rank-mate', 'discovered-attack', 'skewer', 'smothered-mate', 'x-ray'];
    
      tacticCategories = [...weaknessesTactics, ...allTactics];
    }

    let allPuzzles = [];
    for (const category of tacticCategories) {
      try {
        const response = await fetch(`/tactics/${category}.json`);
        if (!response.ok) {
          console.warn(`⚠️ Could not load /tactics/${category}.json`);
          continue;
        }
        const puzzles = await response.json();
        if (Array.isArray(puzzles)) {
          allPuzzles = allPuzzles.concat(puzzles);
          console.log(`📦 Loaded ${puzzles.length} puzzles from ${category}`);
        }
      } catch (err) {
        console.warn(`⚠️ Error loading ${category}:`, err.message);
      }
    }
    return allPuzzles;
  };

  /**
   * Load all opening puzzles from shard files
   * Concatenates all JSON files in /public/openings folder
   */
  const loadAllOpeningsPuzzles = async () => {
    let allPuzzles = [];
    const openingFiles = [
      'alekhine-defense-alekhine-defense-balogh-variation',
      'benko-gambit-accepted-benko-gambit-accepted-dlugy-variation',
      'caro-kann-defense-caro-kann-defense-advance-variation',
      'french-defense-french-defense-advance-variation',
      'ruy-lopez-ruy-lopez-open-variation',
      'sicilian-defense-sicilian-defense-najdorf-variation'
    ];

    for (const openingFile of openingFiles) {
      try {
        const response = await fetch(`/openings/${openingFile}.json`);
        if (!response.ok) continue;
        const puzzles = await response.json();
        if (Array.isArray(puzzles)) {
          allPuzzles = allPuzzles.concat(puzzles);
          console.log(`📦 Loaded ${puzzles.length} puzzles from ${openingFile}`);
        }
      } catch (err) {
        console.warn(`⚠️ Error loading opening ${openingFile}:`, err.message);
      }
    }
    return allPuzzles;
  };

  /**
   * Load all endgame puzzles from shard files
   * Concatenates all JSON files in /public/endgames folder
   */
  const loadAllEndgamePuzzles = async () => {
    const endgameCategories = [
      'endgame', 'bishop-endgame', 'knight-endgame', 'pawn-endgame',
      'queen-endgame', 'queen-rook-endgame', 'rook-endgame', 'zugzwang',
      'mate-in-1', 'mate-in-2', 'mate-in-3'
    ];

    let allPuzzles = [];
    for (const category of endgameCategories) {
      try {
        const response = await fetch(`/endgames/${category}.json`);
        if (!response.ok) {
          console.warn(`⚠️ Could not load /endgames/${category}.json`);
          continue;
        }
        const puzzles = await response.json();
        if (Array.isArray(puzzles)) {
          allPuzzles = allPuzzles.concat(puzzles);
          console.log(`📦 Loaded ${puzzles.length} puzzles from ${category}`);
        }
      } catch (err) {
        console.warn(`⚠️ Error loading ${category}:`, err.message);
      }
    }
    return allPuzzles;
  };

  const handleSquareClick = (square) => {
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
      const nextIdx = currentPuzzle + 1;
      const nextPuzzle = puzzles[nextIdx];
      
      if (!nextPuzzle?.id || (!nextPuzzle?.solution && !nextPuzzle?.lineUci)) {
        console.warn(`⚠️ Next puzzle at index ${nextIdx} has missing data`, nextPuzzle);
        toast.error('Error: Next puzzle data is incomplete. Please try again.');
        return;
      }
      
      setCurrentPuzzle(nextIdx);
      setFeedback('');
      setShowSolution(false);
    } else {
      setFeedback('🎉 You\'ve completed all puzzles in this category! Great job!');
      toast.success('All puzzles completed!');
    }
  };

  const handlePreviousPuzzle = () => {
    if (currentPuzzle > 0) {
      const prevIdx = currentPuzzle - 1;
      const prevPuzzle = puzzles[prevIdx];
      
      if (!prevPuzzle?.id || (!prevPuzzle?.solution && !prevPuzzle?.lineUci)) {
        console.warn(`⚠️ Previous puzzle at index ${prevIdx} has missing data`, prevPuzzle);
        toast.error('Error: Previous puzzle data is incomplete. Please try again.');
        return;
      }
      
      setCurrentPuzzle(prevIdx);
      setFeedback('');
      setShowSolution(false);
    }
  };

  const handleResetPuzzle = () => {
    // Cancel any pending auto-stepback
    if (autoStepbackTimeoutRef.current) {
      clearTimeout(autoStepbackTimeoutRef.current);
      autoStepbackTimeoutRef.current = null;
    }
    if (autoStepbackToastIdRef.current) {
      toast.dismiss(autoStepbackToastIdRef.current);
      autoStepbackToastIdRef.current = null;
    }
    setAutoStepbackCountdown(null);

    setFeedback('');
    setSolutionText('');
    setShowSolution(false);
    setMoveResult(null); // Clear the persistent cross mark
    
    // Reset to the position AFTER the first auto-played move (not the original puzzle position)
    // This means resetting to when the user's turn begins
    const pz = puzzles[currentPuzzle];
    
    // Recalculate the position after first move
    let resetPosition = pz?.initialPosition;
    let resetLineIdx = 0;
    
    const moves = (pz?.lineUci || '').trim();
    const tokens = moves.split(/\s+/).filter(Boolean);
    const firstMove = tokens[0];
    
    if (firstMove && /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(firstMove)) {
      try {
        const engine = new Chess(pz?.initialPosition);
        const from = firstMove.slice(0, 2);
        const to = firstMove.slice(2, 4);
        const prom = firstMove.length > 4 ? firstMove[4] : undefined;
        const moveObj = engine.move({ from, to, promotion: prom });
        if (moveObj) {
          resetPosition = engine.fen();
          resetLineIdx = 1;
        }
      } catch (_) {
        // If calculation fails, fallback to initial position
        resetPosition = pz?.initialPosition;
        resetLineIdx = 0;
      }
    }
    
    setPuzzles(prev => prev.map((pz2, i) => i === currentPuzzle ? { ...pz2, position: resetPosition, lineIndex: resetLineIdx, completed: false } : pz2));
    // Keep board orientation fixed - don't flip when resetting
  };

  const handleStepBack = () => {
    // Cancel any pending auto-stepback
    if (autoStepbackTimeoutRef.current) {
      clearTimeout(autoStepbackTimeoutRef.current);
      autoStepbackTimeoutRef.current = null;
    }
    if (autoStepbackToastIdRef.current) {
      toast.dismiss(autoStepbackToastIdRef.current);
      autoStepbackToastIdRef.current = null;
    }
    setAutoStepbackCountdown(null);

    try {
      const pz = puzzles[currentPuzzle];
      const tokens = (pz?.lineUci || '').split(/\s+/).filter(Boolean);
      const startIdx = typeof pz?.startLineIndex === 'number' ? pz.startLineIndex : 0;
      let curIdx = typeof pz?.lineIndex === 'number' ? pz.lineIndex : startIdx;

      if (!tokens.length) return;

      // Calculate the expected position at current lineIndex
      const engine = new Chess(pz.initialPosition);
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

      // If board is showing something different, it's a pending/rejected move - revert it
      if (pz.position !== expectedFen) {
        setPuzzles(prev => prev.map((pz2, i) => i === currentPuzzle ? { ...pz2, position: expectedFen, lineIndex: curIdx, completed: false } : pz2));
        setFeedback('');
        setShowSolution(false);
        setMoveResult(null); // Clear the persistent cross mark
        return;
      }

      // If at user's starting position, can't step back further
      if (curIdx <= startIdx) return;

      // Otherwise, step back one user move (undoing either 2 moves or 1, depending on context)
      const prevUserIdx = curIdx - ((curIdx - startIdx) % 2 === 0 ? 2 : 1);
      const targetIdx = Math.max(startIdx, prevUserIdx);

      const engine2 = new Chess(pz.initialPosition);
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
      setPuzzles(prev => prev.map((pz2, i) => i === currentPuzzle ? { ...pz2, position: newFen, lineIndex: targetIdx, completed: false } : pz2));
      // Keep board orientation fixed - don't flip when stepping back
    } catch (_) {
      // no-op on failure
    }
  };

  // Start auto-stepback timer for incorrect moves
  const startAutoStepback = () => {
    // Cancel any existing timer
    if (autoStepbackTimeoutRef.current) {
      clearTimeout(autoStepbackTimeoutRef.current);
    }
    if (autoStepbackToastIdRef.current) {
      toast.dismiss(autoStepbackToastIdRef.current);
    }

    const STEPBACK_DELAY = 5000; // 5 seconds
    let remainingTime = 5;
    
    // Capture the position BEFORE the wrong move was made (saved in the ref)
    const preMovePosition = autoStepbackPreMovePositionRef.current;
    const capturedPuzzleIndex = currentPuzzle;
    
    if (!preMovePosition) {
      console.warn('❌ No pre-move position saved for auto-stepback');
      return;
    }
    
    console.log('🔄 Auto-stepback initialized. Will revert to pre-move position:', preMovePosition);
    
    // Show initial toast notification - simple notification
    autoStepbackToastIdRef.current = toast.custom(
      (t) => (
        <div className="bg-red-500 rounded-lg px-4 py-3 shadow text-center">
          <div className="text-sm font-medium text-white">
            ❌ Resetting in {remainingTime}s…
          </div>
        </div>
      ),
      {
        duration: Infinity,
        position: 'top-center',
        style: {
          zIndex: 9999,
          marginTop: '10px'
        }
      }
    );
    
    // Set up countdown timer
    autoStepbackTimeoutRef.current = setTimeout(() => {
      console.log('⏱️ Auto-stepback timer complete. Reverting puzzle:', capturedPuzzleIndex);
      
      // Timer complete - perform auto stepback
      if (autoStepbackToastIdRef.current) {
        toast.dismiss(autoStepbackToastIdRef.current);
        autoStepbackToastIdRef.current = null;
      }
      setAutoStepbackCountdown(null);
      
      // Revert to the pre-move position directly
      try {
        console.log('✅ Reverting to pre-move position:', preMovePosition);
        
        // Enable smooth animation for the stepback
        setIsStepbackAnimating(true);
        
        // Simply restore the position from before the wrong move
        setPuzzles(prev => prev.map((pz, i) => i === capturedPuzzleIndex ? { ...pz, position: preMovePosition, completed: false } : pz));
        setMoveResult(null);
        
        // Show success toast
        toast.custom(
          (t) => (
            <div className="bg-green-500 rounded-lg px-4 py-3 shadow text-center">
              <div className="text-sm font-medium text-white">
                ✅ Position reset
              </div>
            </div>
          ),
          {
            duration: 2000,
            position: 'top-center',
            style: {
              zIndex: 9999,
              marginTop: '10px'
            }
          }
        );
      } catch (error) {
        console.error('❌ Error during auto-stepback:', error);
      }
      
      autoStepbackTimeoutRef.current = null;
      autoStepbackPreMovePositionRef.current = null; // Clear the saved position
    }, STEPBACK_DELAY);
    
    setAutoStepbackCountdown({ remaining: remainingTime });
  };

  const handleShowSolution = () => {
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
      console.error('❌ Puzzle missing both solution and lineUci', { puzzleId: puzzle.id, currentPuzzleIdx: currentPuzzle });
      toast.error('Error: Solution data not found for this puzzle. Please try another puzzle.');
      return;
    }

    const tokens = (puzzle?.lineUci || '').split(/\s+/).filter(Boolean);
    const curIdx = typeof puzzle?.lineIndex === 'number' ? puzzle.lineIndex : 0;
    
    if (!tokens.length || curIdx >= tokens.length) {
      const _exp1 = (puzzle?.explanation || '').trim()
        .replace(/\s*(?:—|-)?\s*Puzzle sourced from Lichess data ?set\.?$/i, '')
        .replace(/\s*(?:—|-)?\s*From curated endgame data ?set\.?$/i, '');
      
      if (!puzzle.solution) {
        console.warn(`⚠️ Puzzle ${puzzle.id} has no solution field`, puzzle);
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
      const _exp2 = (puzzle?.explanation || '').trim()
        .replace(/\s*(?:—|-)?\s*Puzzle sourced from Lichess data ?set\.?$/i, '')
        .replace(/\s*(?:—|-)?\s*From curated endgame data ?set\.?$/i, '');
      setSolutionText(`Solution: ${sans.join(' ')}${_exp2 ? ' — ' + _exp2 : ''}`);
      setShowSolution(true);
    } catch (err) {
      console.error('❌ Error parsing solution moves', { puzzleId: puzzle.id, error: err.message });
      const _exp3 = (puzzle?.explanation || '').trim()
        .replace(/\s*(?:—|-)?\s*Puzzle sourced from Lichess data ?set\.?$/i, '')
        .replace(/\s*(?:—|-)?\s*From curated endgame data ?set\.?$/i, '');
      setSolutionText(`Solution: ${puzzle?.solution || '[Unable to parse]'}${_exp3 ? ' — ' + _exp3 : ''}`);
      setShowSolution(true);
    }
  };

  const handleDifficultyChange = (newDifficulty) => {
    // Allow switching to any difficulty that has puzzles available
    // Free tier: 1 teaser per difficulty, Paid tier: 10 per difficulty
    const selectedPuzzles = puzzlesByDifficulty[newDifficulty];
    if (!selectedPuzzles || selectedPuzzles.length === 0) {
      setShowUpgradeNotice(true);
      return;
    }
    
    setDifficulty(newDifficulty);
    setPuzzles(selectedPuzzles);
    setCurrentPuzzle(0);
    setFeedback('');
    setShowSolution(false);
    toast.success(`Switched to ${newDifficulty.charAt(0).toUpperCase() + newDifficulty.slice(1)} puzzles`);
  };

  const handleBackToReport = () => {
    const analysisData = location.state?.analysis;
    navigate('/report-display', { state: { analysis: analysisData } });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ paddingTop: '80px' }}>
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4" size={48} />
          <h2 className="text-xl font-semibold mb-2">Loading Puzzles...</h2>
          <p className="text-gray-600">Preparing your puzzle training session</p>
        </div>
      </div>
    );
  }

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
              {/* Difficulty Selector Dropdown */}
              {puzzleType !== 'learn-mistakes' && (
                <div className="mt-4 flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Difficulty Level:</label>
                  <select
                    value={difficulty}
                    onChange={(e) => handleDifficultyChange(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
                  >
                    <option value="easy">Easy</option>
                    {puzzlesByDifficulty.medium.length > 0 && <option value="medium">Medium</option>}
                    {puzzlesByDifficulty.hard.length > 0 && <option value="hard">Hard</option>}
                  </select>
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">
                <div>Puzzle {currentPuzzle + 1} of {puzzles.length}</div>
                {/* Side to Move Badge - Only show when it's user's turn */}
                {puzzle?.position && (() => {
                  const sideToMove = puzzle.position.split(' ')[1] === 'w' ? 'white' : 'black';
                  // The user's side is determined by the board orientation
                  // If orientation is 'white', user plays white; if 'black', user plays black
                  // Only show badge when it matches user's side (user's turn to move)
                  if ((orientation === 'white' && sideToMove === 'white') || 
                      (orientation === 'black' && sideToMove === 'black')) {
                    return (
                      <div className="mt-2">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold text-white ${
                          sideToMove === 'white' 
                            ? 'bg-gray-700' 
                            : 'bg-gray-900'
                        }`}>
                          {sideToMove === 'white' ? '⚪ White to Move' : '⚫ Black to Move'}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              {!canAccess && (
                <div className="text-xs text-amber-700 mt-1">
                  Free teaser
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Side - Chessboard */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <Chessboard 
                position={puzzle.position}
                orientation={orientation}
                enableArrows
                preserveDrawingsOnPositionChange={true}
                moveResult={moveResult}
                highlightedSquares={showHint && nextHintMove?.from ? [nextHintMove.from] : []}
                isStepback={isStepbackAnimating}
                onMove={({ from, to, san, fen }) => {
                  // Prevent moves if puzzle is already completed
                  if (puzzle.completed) return;
                  
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
                    const expectedUci = (tokens[curIdx] || '').toLowerCase();
                    if (expectedUci && expectedUci === playedUci.toLowerCase()) {
                      // Correct move - show green checkmark and cancel any pending auto-stepback
                      if (autoStepbackTimeoutRef.current) {
                        clearTimeout(autoStepbackTimeoutRef.current);
                        autoStepbackTimeoutRef.current = null;
                      }
                      if (autoStepbackToastIdRef.current) {
                        toast.dismiss(autoStepbackToastIdRef.current);
                        autoStepbackToastIdRef.current = null;
                      }
                      setAutoStepbackCountdown(null);
                      
                      setMoveResult({ square: to, isCorrect: true });
                      
                      try {
                        const engine = new Chess(puzzle.position);
                        engine.move({ from, to, promotion: (san.match(/=([QRBN])/i)?.[1] || 'q').toLowerCase() });
                        let nextIdx = curIdx + 1;
                        
                        const positionAfterUserMove = engine.fen();
                        setPuzzles(prev => prev.map((pz, i) => i === currentPuzzle ? { ...pz, position: positionAfterUserMove, lineIndex: nextIdx } : pz));
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
                              setPuzzles(prev => prev.map((pz, i) => i === currentPuzzle ? { ...pz, position: finalFen, lineIndex: finalIdx, completed: isDone } : pz));
                              if (isDone) {
                                setFeedback('🎉 Congratulations! You completed the puzzle.');
                                // Increment streak on puzzle completion
                                const newStreak = currentStreak + 1;
                                setCurrentStreak(newStreak);
                                if (newStreak > bestStreak) {
                                  setBestStreak(newStreak);
                                  localStorage.setItem(`pawnsposes:streak:${puzzleType}`, newStreak.toString());
                                }
                              } else {
                                // Only clear checkmark if puzzle is not complete
                                setTimeout(() => setMoveResult(null), 800);
                              }
                            } catch (_) {
                              // If auto-move fails, just keep the position after user move
                            }
                          }, 350);
                        } else {
                          const isDone = nextIdx >= tokens.length;
                          if (isDone) {
                            setFeedback('🎉 Congratulations! You completed the puzzle.');
                            setPuzzles(prev => prev.map((pz, i) => i === currentPuzzle ? { ...pz, completed: true } : pz));
                            // Increment streak on puzzle completion
                            const newStreak = currentStreak + 1;
                            setCurrentStreak(newStreak);
                            if (newStreak > bestStreak) {
                              setBestStreak(newStreak);
                              localStorage.setItem(`pawnsposes:streak:${puzzleType}`, newStreak.toString());
                            }
                          }
                        }
                      } catch (_) {
                        // If anything fails, do not advance
                      }
                    } else {
                      // Incorrect move - show red X and start auto-stepback
                      setMoveResult({ square: to, isCorrect: false });
                      
                      // Save the position BEFORE the wrong move for auto-stepback
                      autoStepbackPreMovePositionRef.current = puzzle.position;
                      
                      setPuzzles(prev => prev.map((pz, i) => i === currentPuzzle ? { ...pz, position: fen } : pz));
                      setFeedback(`Not quite. You played ${san}. Try again or show a hint.`);
                      // Reset streak on incorrect move
                      setCurrentStreak(0);
                      
                      // Start 5-second countdown before auto-stepback
                      startAutoStepback();
                    }
                  } else {
                    setPuzzles(prev => prev.map((pz, i) => i === currentPuzzle ? { ...pz, position: fen, completed: false } : pz));

                    const isSanCorrect = playedSan === targetSan && targetSan;
                    const isUciCorrect = playedUci === targetUci && targetUci;
                    if (isSanCorrect || isUciCorrect) {
                      // Correct move - show green checkmark and cancel any pending auto-stepback
                      if (autoStepbackTimeoutRef.current) {
                        clearTimeout(autoStepbackTimeoutRef.current);
                        autoStepbackTimeoutRef.current = null;
                      }
                      if (autoStepbackToastIdRef.current) {
                        toast.dismiss(autoStepbackToastIdRef.current);
                        autoStepbackToastIdRef.current = null;
                      }
                      setAutoStepbackCountdown(null);
                      
                      setMoveResult({ square: to, isCorrect: true });
                      
                      setFeedback(`Correct! ${san} is the solution.`);
                      setPuzzles(prev => prev.map((pz, i) => i === currentPuzzle ? { ...pz, completed: true } : pz));
                      // Increment streak on puzzle completion
                      const newStreak = currentStreak + 1;
                      setCurrentStreak(newStreak);
                      if (newStreak > bestStreak) {
                        setBestStreak(newStreak);
                        localStorage.setItem(`pawnsposes:streak:${puzzleType}`, newStreak.toString());
                      }
                    } else {
                      // Incorrect move - show red X and start auto-stepback
                      setMoveResult({ square: to, isCorrect: false });
                      
                      // Save the position BEFORE the wrong move for auto-stepback
                      autoStepbackPreMovePositionRef.current = puzzle.position;
                      
                      setFeedback(`Not quite. You played ${san}. Try again or show a hint.`);
                      // Reset streak on incorrect move
                      setCurrentStreak(0);
                      
                      // Start 5-second countdown before auto-stepback
                      startAutoStepback();
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* Right Side - Controls & Info */}
          <div className="lg:col-span-1 flex flex-col gap-0">
            <div className="bg-white rounded-lg shadow p-6">
              {/* Puzzle Title */}
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Puzzle {currentPuzzle + 1}</h2>
              
              {/* Progress Bar */}
              <div className="mb-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentPuzzle + 1) / puzzles.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Streak Display */}
              <div className="mb-3 flex gap-2">
                <div className="flex-1 rounded border border-orange-200 bg-orange-50 px-3 py-2">
                  <p className="text-xs font-medium text-orange-600">Streak 🔥</p>
                  <p className="mt-1 text-lg font-bold text-orange-700">{currentStreak}</p>
                </div>
                <div className="flex-1 rounded border border-purple-200 bg-purple-50 px-3 py-2">
                  <p className="text-xs font-medium text-purple-600">Best ⭐</p>
                  <p className="mt-1 text-lg font-bold text-purple-700">{bestStreak}</p>
                </div>
              </div>

              {/* Puzzle Highlights */}
              {(puzzle?.position || puzzle?.rating) && (
                <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {puzzle?.position && (() => {
                    const sideToMove = puzzle.position.split(' ')[1] === 'w' ? 'White' : 'Black';
                    return (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 shadow-sm">
                        <p className="text-sm uppercase tracking-wide text-gray-500">Side to Move</p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">{sideToMove}</p>
                      </div>
                    );
                  })()}

                  {puzzle?.rating && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 shadow-sm">
                      <p className="text-sm uppercase tracking-wide text-gray-500">Puzzle Rating</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{puzzle.rating}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Objective Section */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-800 mb-2">Objective:</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Find the best move{puzzle?.explanation && `. ${puzzle.explanation}`}
                </p>
              </div>

              {/* Feedback Message */}
              {feedback && (
                <div className={`p-4 rounded-lg mb-4 font-medium ${
                  feedback.includes('🎉')
                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-900 border-2 border-green-400 text-lg leading-relaxed shadow-md'
                    : feedback.includes('Correct')
                    ? 'bg-green-50 text-green-800 border border-green-200 text-base'
                    : 'bg-blue-50 text-blue-800 border border-blue-200 text-sm'
                }`}>
                  {feedback}
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex gap-3 mb-4">
                <button
                  onClick={handlePreviousPuzzle}
                  disabled={currentPuzzle === 0}
                  className="flex-1 px-4 py-2.5 bg-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  ← Previous
                </button>
                <button
                  onClick={handleNextPuzzle}
                  className="flex-1 px-4 py-2.5 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center justify-center"
                >
                  Next →
                </button>
              </div>

              {/* Action Buttons */}
              <div className="mb-4 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleStepBack}
                    className="flex-1 px-4 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center justify-center"
                  >
                    <Undo2 size={16} className="mr-1" />
                    Step
                  </button>

                  <button
                    onClick={handleResetPuzzle}
                    className="flex-1 px-4 py-2.5 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors flex items-center justify-center"
                  >
                    <RotateCcw size={16} className="mr-1" />
                    Reset
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => setShowHint(prev => !prev)}
                    className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center text-white ${
                      showHint
                        ? 'bg-purple-600 hover:bg-purple-700'
                        : 'bg-purple-500 hover:bg-purple-600'
                    }`}
                  >
                    💡 {showHint ? 'Hide' : 'Hint'}
                  </button>

                  <button
                    onClick={handleShowSolution}
                    className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center text-white ${
                      showSolution
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-orange-500 hover:bg-orange-600'
                    }`}
                  >
                    <Eye size={16} className="mr-1" />
                    Show
                  </button>
                </div>
              </div>

              {/* Hint Display */}
              {showHint && (
                <div className="mb-4 p-4 bg-purple-50 border-2 border-purple-400 rounded-lg shadow-md">
                  <h4 className="text-sm font-semibold text-purple-900 mb-3 flex items-center">
                    <span className="mr-2">💡</span>
                    Next Move Hint:
                  </h4>
                  <p className="text-sm text-purple-800 mb-2">
                    <span className="font-bold text-lg text-purple-900">{getHintMove() || 'No move'}</span>
                  </p>
                  
                </div>
              )}

              {/* Solution Display */}
              {showSolution && (
                <div className="mb-4 p-4 bg-green-50 border border-green-300 rounded-lg animate-in fade-in-50 duration-200">
                  <h4 className="text-sm font-semibold text-green-900 mb-2">Solution Moves:</h4>
                  <p className="text-sm text-green-800 font-mono break-words">
                    {solutionText || (puzzle?.lineUci || 'No solution available')}
                  </p>
                </div>
              )}

              

              {/* Themes - Display as Badges */}
              {puzzle?.themes && (Array.isArray(puzzle.themes) ? puzzle.themes.length > 0 : puzzle.themes.trim() !== '') && (
                <div className="border-t border-gray-200 pt-4">
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

              {/* Licensing Attribution */}
              <div className="border-t border-gray-200 mt-4 pt-3">
                <p className="text-xs text-gray-500">
                  Some puzzles are generated using open data from 
                  <a href="https://lichess.org" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-800 transition-colors ml-1 underline">
                    lichess.org
                  </a>
                  <span className="ml-1">(CC BY SA 3.0)</span>
                </p>
              </div>
            </div>

            {showUpgradeNotice && (
              <div className="mt-4">
                <UpgradePrompt />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PuzzlePage;