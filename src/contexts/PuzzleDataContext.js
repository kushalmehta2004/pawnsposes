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
  }, []);

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
    updatePuzzleData
  };

  return (
    <PuzzleDataContext.Provider value={value}>
      {children}
    </PuzzleDataContext.Provider>
  );
};