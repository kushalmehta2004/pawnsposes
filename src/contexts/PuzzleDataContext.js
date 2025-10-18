import React, { createContext, useState, useCallback } from 'react';

export const PuzzleDataContext = createContext();

export const PuzzleDataProvider = ({ children }) => {
  // Cache for puzzle data
  const [weaknessPuzzles, setWeaknessPuzzles] = useState([]);
  const [mistakePuzzles, setMistakePuzzles] = useState([]);
  const [openingPuzzles, setOpeningPuzzles] = useState([]);
  const [endgamePuzzles, setEndgamePuzzles] = useState([]);
  
  // Track if data has been loaded for this user
  const [loadedForUserId, setLoadedForUserId] = useState(null);
  const [puzzlesLoading, setPuzzlesLoading] = useState(false);
  
  // Track all used puzzle IDs to prevent duplicates across puzzle types
  const [usedPuzzleIds, setUsedPuzzleIds] = useState({
    global: [],
    learnMistakesSessions: {}
  });

  // Check if we already have puzzles cached for this user
  const hasCachedPuzzles = useCallback((userId) => {
    return loadedForUserId === userId && 
           (weaknessPuzzles.length > 0 || 
            mistakePuzzles.length > 0 || 
            openingPuzzles.length > 0 || 
            endgamePuzzles.length > 0);
  }, [loadedForUserId, weaknessPuzzles, mistakePuzzles, openingPuzzles, endgamePuzzles]);

  // Clear cache (useful when user logs out)
  const clearPuzzleCache = useCallback(() => {
    setWeaknessPuzzles([]);
    setMistakePuzzles([]);
    setOpeningPuzzles([]);
    setEndgamePuzzles([]);
    setLoadedForUserId(null);
    setUsedPuzzleIds({
      global: [],
      learnMistakesSessions: {}
    });
  }, []);

  // Add puzzle IDs to the used list (avoid duplicates)
  const markPuzzlesAsUsed = useCallback((puzzleIds) => {
    setUsedPuzzleIds(prev => {
      const updatedGlobal = Array.from(new Set([...(prev.global || []), ...puzzleIds]));

      return {
        global: updatedGlobal,
        learnMistakesSessions: prev.learnMistakesSessions || {}
      };
    });
  }, []);

  const markLearnMistakeSessionAsUsed = useCallback((sessionKey, puzzleIds) => {
    setUsedPuzzleIds(prev => {
      const updatedSessionIds = Array.from(new Set([...(prev.learnMistakesSessions?.[sessionKey] || []), ...puzzleIds]));

      return {
        global: prev.global || [],
        learnMistakesSessions: {
          ...(prev.learnMistakesSessions || {}),
          [sessionKey]: updatedSessionIds
        }
      };
    });
  }, []);

  const clearLearnMistakeSession = useCallback((sessionKey) => {
    if (!sessionKey) return;

    setUsedPuzzleIds(prev => {
      if (!prev.learnMistakesSessions?.[sessionKey]) return prev;

      const { [sessionKey]: _removed, ...rest } = prev.learnMistakesSessions;
      return {
        global: prev.global || [],
        learnMistakesSessions: rest
      };
    });
  }, []);

  const isPuzzleUsed = useCallback((puzzleId, options = {}) => {
    const { sessionKey, skipGlobal } = options;

    if (!skipGlobal && (usedPuzzleIds.global || []).includes(puzzleId)) {
      return true;
    }

    if (sessionKey) {
      return (usedPuzzleIds.learnMistakesSessions?.[sessionKey] || []).includes(puzzleId);
    }

    return false;
  }, [usedPuzzleIds]);

  // Update all puzzle data at once
  const updatePuzzleData = useCallback((userId, weakness, mistake, opening, endgame) => {
    setWeaknessPuzzles(weakness);
    setMistakePuzzles(mistake);
    setOpeningPuzzles(opening);
    setEndgamePuzzles(endgame);
    setLoadedForUserId(userId);
  }, []);

  const value = {
    weaknessPuzzles,
    mistakePuzzles,
    openingPuzzles,
    endgamePuzzles,
    puzzlesLoading,
    setPuzzlesLoading,
    hasCachedPuzzles,
    clearPuzzleCache,
    updatePuzzleData,
    usedPuzzleIds,
    markPuzzlesAsUsed,
    isPuzzleUsed,
    markLearnMistakeSessionAsUsed,
    clearLearnMistakeSession
  };

  return (
    <PuzzleDataContext.Provider value={value}>
      {children}
    </PuzzleDataContext.Provider>
  );
};