/**
 * Mistake Analysis Test Component
 * Test component to verify mistake analysis is working
 */

import React, { useState } from 'react';
import mistakeAnalysisService from '../services/mistakeAnalysisService';
import puzzleDataService from '../services/puzzleDataService';

const MistakeAnalysisTest = () => {
  const [testResults, setTestResults] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [username, setUsername] = useState('');

  const runTest = async () => {
    if (!username.trim()) {
      alert('Please enter a username');
      return;
    }

    setIsRunning(true);
    setTestResults(null);

    try {
      console.log('🧪 Starting mistake analysis test...');
      
      // 1. Check if user has games
      const games = await puzzleDataService.getUserGames(username, 5);
      console.log(`📊 Found ${games?.length || 0} games for ${username}`);

      // 2. Run mistake analysis
      const results = await mistakeAnalysisService.analyzeAllGamesForMistakes(username, {
        maxGames: 3,
        analysisDepth: 15,
        timeLimit: 2000,
        onProgress: (progress) => {
          console.log('Progress:', progress);
        }
      });

      // 3. Check stored mistakes
      const mistakes = await puzzleDataService.getUserMistakes(username);
      console.log(`🎯 Found ${mistakes?.length || 0} stored mistakes`);

      setTestResults({
        gamesFound: games?.length || 0,
        analysisResults: results,
        mistakesStored: mistakes?.length || 0,
        sampleMistakes: mistakes?.slice(0, 3) || []
      });

    } catch (error) {
      console.error('❌ Test failed:', error);
      setTestResults({
        error: error.message
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6">🧪 Mistake Analysis Test</h2>
      
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Username to test:
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={runTest}
            disabled={isRunning}
            className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Run Test'}
          </button>
        </div>
      </div>

      {testResults && (
        <div className="space-y-4">
          {testResults.error ? (
            <div className="p-4 bg-red-100 border border-red-300 rounded-md">
              <h3 className="font-bold text-red-800">❌ Test Failed</h3>
              <p className="text-red-700">{testResults.error}</p>
            </div>
          ) : (
            <>
              <div className="p-4 bg-green-100 border border-green-300 rounded-md">
                <h3 className="font-bold text-green-800">✅ Test Results</h3>
                <ul className="mt-2 space-y-1 text-green-700">
                  <li>• Games found: {testResults.gamesFound}</li>
                  <li>• Mistakes analyzed: {testResults.analysisResults?.totalMistakes || 0}</li>
                  <li>• Mistakes stored: {testResults.mistakesStored}</li>
                </ul>
              </div>

              {testResults.sampleMistakes.length > 0 && (
                <div className="p-4 bg-blue-100 border border-blue-300 rounded-md">
                  <h3 className="font-bold text-blue-800">🎯 Sample Mistakes</h3>
                  <div className="mt-2 space-y-2">
                    {testResults.sampleMistakes.map((mistake, index) => (
                      <div key={index} className="p-2 bg-white rounded text-sm">
                        <div><strong>Type:</strong> {mistake.mistakeType || 'unknown'}</div>
                        <div><strong>Best Move:</strong> {mistake.bestMove || 'N/A'}</div>
                        <div><strong>Has Position:</strong> {mistake.position?.fen ? '✅' : '❌'}</div>
                        <div><strong>Game ID:</strong> {mistake.gameId || 'N/A'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-6 p-4 bg-gray-100 rounded-md">
        <h3 className="font-bold text-gray-800 mb-2">📋 How to Use This Test</h3>
        <ol className="text-sm text-gray-700 space-y-1">
          <li>1. First, generate a report for a user (this stores games in the database)</li>
          <li>2. Enter the same username here and click "Run Test"</li>
          <li>3. Check the results to see if mistakes were found and stored</li>
          <li>4. Open browser console to see detailed logs</li>
          <li>5. Try generating puzzles to see if they use the stored mistakes</li>
        </ol>
      </div>
    </div>
  );
};

export default MistakeAnalysisTest;