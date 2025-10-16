import { useContext } from 'react';
import { PuzzleDataContext } from '../contexts/PuzzleDataContext';

export const usePuzzleData = () => {
  const context = useContext(PuzzleDataContext);
  
  if (!context) {
    throw new Error('usePuzzleData must be used within a PuzzleDataProvider');
  }
  
  return context;
};