/**
 * Puzzle Database Test Component
 * Simple component to test database functionality
 */

import React, { useState, useEffect } from 'react';
import puzzleDataService from '../services/puzzleDataService.js';
import { PUZZLE_CATEGORIES, PuzzleModel } from '../utils/dataModels.js';

const PuzzleDataTest = () => {
  const [status, setStatus] = useState('Initializing...');
  const [stats, setStats] = useState(null);
  const [testResults, setTestResults] = useState([]);

  useEffect(() => {
    initializeAndTest();
  }, []);

  const initializeAndTest = async () => {
    try {
      setStatus('Initializing database...');
      await puzzleDataService.initialize();
      
      setStatus('Running tests...');
      await runTests();
      
      setStatus('Getting statistics...');
      const currentStats = await puzzleDataService.getStorageStats();
      setStats(currentStats);
      
      setStatus('Tests completed successfully!');
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      console.error('Test error:', error);
    }
  };

  const runTests = async () => {
    const results = [];

    try {
      // Test 1: Create and store a sample puzzle
      results.push('Test 1: Creating sample puzzle...');
      const samplePuzzle = new PuzzleModel({
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        solution: 'e5',
        category: PUZZLE_CATEGORIES.MASTER_OPENINGS,
        theme: 'center_control',
        difficulty: 2,
        objective: 'Black to move. Respond to 1.e4 with the classical defense.',
        hint: 'Control the center with a pawn move.',
        explanation: 'e5 is the classical response, fighting for central control.',
        sourceGameId: 'test_game_1',
        moveNumber: 1
      });

      const storedPuzzles = await puzzleDataService.storePuzzles([samplePuzzle]);
      results.push(`✅ Stored ${storedPuzzles.length} puzzle(s)`);

      // Test 2: Retrieve puzzles by category
      results.push('Test 2: Retrieving puzzles by category...');
      const categoryPuzzles = await puzzleDataService.getPuzzlesByCategory(PUZZLE_CATEGORIES.MASTER_OPENINGS);
      results.push(`✅ Retrieved ${categoryPuzzles.length} puzzle(s) for Master Openings`);

      // Test 3: Test puzzle generation status
      results.push('Test 3: Checking puzzle generation status...');
      const generationStatus = await puzzleDataService.getPuzzleGenerationStatus();
      results.push(`✅ Generation status: ${JSON.stringify(generationStatus, null, 2)}`);

      // Test 4: Record a puzzle attempt
      if (storedPuzzles.length > 0) {
        results.push('Test 4: Recording puzzle attempt...');
        await puzzleDataService.recordPuzzleAttempt(
          storedPuzzles[0].id,
          PUZZLE_CATEGORIES.MASTER_OPENINGS,
          true, // correct
          5000, // 5 seconds
          0 // no hints
        );
        results.push('✅ Puzzle attempt recorded');
      }

      // Test 5: Get progress stats
      results.push('Test 5: Getting progress statistics...');
      const progressStats = await puzzleDataService.getProgressStats(PUZZLE_CATEGORIES.MASTER_OPENINGS);
      results.push(`✅ Progress stats: ${JSON.stringify(progressStats, null, 2)}`);

    } catch (error) {
      results.push(`❌ Test failed: ${error.message}`);
    }

    setTestResults(results);
  };

  const clearData = async () => {
    try {
      setStatus('Clearing all data...');
      await puzzleDataService.clearAllData();
      
      const newStats = await puzzleDataService.getStorageStats();
      setStats(newStats);
      setTestResults([]);
      
      setStatus('Data cleared successfully!');
    } catch (error) {
      setStatus(`Error clearing data: ${error.message}`);
    }
  };

  const runTestsAgain = () => {
    setTestResults([]);
    initializeAndTest();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Puzzle Database Test</h2>
      
      {/* Status */}
      <div className="mb-4 p-3 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-800">Status:</h3>
        <p className="text-blue-700">{status}</p>
      </div>

      {/* Controls */}
      <div className="mb-6 space-x-4">
        <button
          onClick={runTestsAgain}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Run Tests Again
        </button>
        <button
          onClick={clearData}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Clear All Data
        </button>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">Database Statistics:</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium">Games:</span> {stats.user_games || 0}
            </div>
            <div>
              <span className="font-medium">Puzzles:</span> {stats.puzzles || 0}
            </div>
            <div>
              <span className="font-medium">Mistakes:</span> {stats.user_mistakes || 0}
            </div>
            <div>
              <span className="font-medium">Progress:</span> {stats.user_progress || 0}
            </div>
            <div>
              <span className="font-medium">Openings:</span> {stats.opening_deviations || 0}
            </div>
          </div>
        </div>
      )}

      {/* Test Results */}
      {testResults.length > 0 && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">Test Results:</h3>
          <div className="space-y-1 text-sm font-mono">
            {testResults.map((result, index) => (
              <div 
                key={index} 
                className={`p-2 rounded ${
                  result.includes('✅') ? 'bg-green-100 text-green-800' :
                  result.includes('❌') ? 'bg-red-100 text-red-800' :
                  'bg-blue-100 text-blue-800'
                }`}
              >
                {result}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PuzzleDataTest;