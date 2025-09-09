/**
 * Phase 2 Summary Component
 * Comprehensive test and summary of all Phase 2 analysis services
 */

import React, { useState, useEffect } from 'react';
import mistakeAnalysisService from '../services/mistakeAnalysisService.js';
import openingAnalysisService from '../services/openingAnalysisService.js';
import tacticalAnalysisService from '../services/tacticalAnalysisService.js';
import puzzleDataService from '../services/puzzleDataService.js';

const Phase2Summary = () => {
  const [status, setStatus] = useState('Ready');
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState({
    mistakes: null,
    openings: null,
    tactical: null
  });
  const [username, setUsername] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [gameStats, setGameStats] = useState(null);

  useEffect(() => {
    loadGameStats();
  }, []);

  const loadGameStats = async () => {
    try {
      const stats = await puzzleDataService.getStorageStats();
      const generationStatus = await puzzleDataService.getPuzzleGenerationStatus();
      setGameStats({ ...stats, ...generationStatus });
      
      // Try to get a sample username
      if (stats.user_games > 0) {
        const sampleGames = await puzzleDataService.getUserGames('', 5);
        if (sampleGames.length > 0) {
          setUsername(sampleGames[0].username);
        }
      }
    } catch (error) {
      console.error('Failed to load game stats:', error);
    }
  };

  const runFullAnalysis = async () => {
    if (!username.trim()) {
      setStatus('Please enter a username');
      return;
    }

    if (isAnalyzing) {
      setStatus('Analysis already in progress');
      return;
    }

    setIsAnalyzing(true);
    setStatus('Starting comprehensive analysis...');
    setProgress({ stage: 'initializing', current: 0, total: 3 });
    setResults({ mistakes: null, openings: null, tactical: null });

    try {
      // Step 1: Mistake Analysis
      setStatus('Phase 2.1: Analyzing mistakes...');
      setProgress({ stage: 'mistake_analysis', current: 1, total: 3 });
      
      const mistakeResults = await mistakeAnalysisService.analyzeAllGamesForMistakes(
        username.trim(),
        {
          maxGames: 5, // Limit for testing
          analysisDepth: 16, // Slightly reduced for speed
          timeLimit: 2000,
          onProgress: (progressInfo) => {
            setStatus(`Mistake Analysis: ${progressInfo.message || 'Analyzing...'}`);
          }
        }
      );

      setResults(prev => ({ ...prev, mistakes: mistakeResults }));

      // Step 2: Opening Analysis
      setStatus('Phase 2.2: Analyzing openings...');
      setProgress({ stage: 'opening_analysis', current: 2, total: 3 });
      
      const openingResults = await openingAnalysisService.analyzeAllGamesForOpenings(
        username.trim(),
        {
          maxGames: 10,
          onProgress: (progressInfo) => {
            setStatus(`Opening Analysis: ${progressInfo.message || 'Analyzing...'}`);
          }
        }
      );

      setResults(prev => ({ ...prev, openings: openingResults }));

      // Step 3: Tactical Analysis Summary
      setStatus('Phase 2.3: Summarizing tactical patterns...');
      setProgress({ stage: 'tactical_summary', current: 3, total: 3 });
      
      // Create a summary of tactical patterns found
      const tacticalSummary = {
        totalPositionsAnalyzed: mistakeResults.positionsAnalyzed,
        tacticalMistakes: Object.entries(mistakeResults.mistakesByType)
          .filter(([type]) => type.includes('tactic') || type.includes('missed'))
          .reduce((sum, [, mistakes]) => sum + mistakes.length, 0),
        commonTacticalThemes: mistakeResults.patterns?.tacticalWeaknesses || {},
        readyForPuzzleGeneration: mistakeResults.totalMistakes > 0
      };

      setResults(prev => ({ ...prev, tactical: tacticalSummary }));

      setStatus('Phase 2 analysis completed successfully!');
      setProgress(null);

    } catch (error) {
      setStatus(`Analysis failed: ${error.message}`);
      console.error('Phase 2 analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getProgressPercentage = () => {
    if (!progress) return 100;
    return Math.round((progress.current / progress.total) * 100);
  };

  const canRunAnalysis = () => {
    return gameStats?.hasEnoughGames && username.trim() && !isAnalyzing;
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold mb-6 text-center">Phase 2: Game Analysis Pipeline</h2>
      
      {/* Status */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-800 mb-2">Analysis Status:</h3>
        <p className="text-blue-700">{status}</p>
        
        {progress && (
          <div className="mt-3">
            <div className="flex justify-between text-sm text-blue-600 mb-1">
              <span className="capitalize">{progress.stage.replace('_', ' ')}: {progress.current}/{progress.total}</span>
              <span>{getProgressPercentage()}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-3">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${getProgressPercentage()}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Prerequisites Check */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold mb-3">Prerequisites Check:</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className={`p-3 rounded ${gameStats?.hasGames ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            <div className="font-medium">Games Available</div>
            <div>{gameStats?.gameCount || 0} games</div>
            <div className="text-xs">{gameStats?.hasGames ? '✅ Ready' : '❌ Need games'}</div>
          </div>
          <div className={`p-3 rounded ${gameStats?.hasEnoughGames ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
            <div className="font-medium">Sufficient Data</div>
            <div>Min 5 games needed</div>
            <div className="text-xs">{gameStats?.hasEnoughGames ? '✅ Ready' : '⚠️ Need more'}</div>
          </div>
          <div className={`p-3 rounded ${username.trim() ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
            <div className="font-medium">Username Set</div>
            <div>{username || 'Not set'}</div>
            <div className="text-xs">{username.trim() ? '✅ Ready' : '⚠️ Required'}</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Username to analyze:
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter username"
            disabled={isAnalyzing}
          />
        </div>
        
        <button
          onClick={runFullAnalysis}
          disabled={!canRunAnalysis()}
          className={`w-full px-6 py-3 rounded-lg font-medium text-lg ${
            canRunAnalysis()
              ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700'
              : 'bg-gray-400 text-gray-700 cursor-not-allowed'
          }`}
        >
          {isAnalyzing ? 'Running Analysis...' : 'Run Complete Phase 2 Analysis'}
        </button>
      </div>

      {/* Results */}
      {(results.mistakes || results.openings || results.tactical) && (
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-center text-green-800">Analysis Results</h3>

          {/* Mistake Analysis Results */}
          {results.mistakes && (
            <div className="p-4 bg-red-50 rounded-lg">
              <h4 className="font-semibold text-red-800 mb-3">🎯 Mistake Analysis Results</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{results.mistakes.totalMistakes}</div>
                  <div className="text-sm text-red-700">Mistakes Found</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{results.mistakes.positionsAnalyzed}</div>
                  <div className="text-sm text-blue-700">Positions Analyzed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{results.mistakes.totalGames}</div>
                  <div className="text-sm text-green-700">Games Analyzed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{results.mistakes.averageMistakesPerGame}</div>
                  <div className="text-sm text-orange-700">Avg/Game</div>
                </div>
              </div>
              
              {Object.keys(results.mistakes.mistakesByType).length > 0 && (
                <div>
                  <h5 className="font-medium text-red-700 mb-2">Most Common Mistake Types:</h5>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(results.mistakes.mistakesByType)
                      .sort(([,a], [,b]) => b.length - a.length)
                      .slice(0, 5)
                      .map(([type, mistakes]) => (
                        <span key={type} className="bg-red-200 text-red-800 px-3 py-1 rounded-full text-sm">
                          {type.replace('_', ' ')}: {mistakes.length}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Opening Analysis Results */}
          {results.openings && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-800 mb-3">📖 Opening Analysis Results</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{results.openings.totalDeviations}</div>
                  <div className="text-sm text-blue-700">Opening Deviations</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{results.openings.totalGames}</div>
                  <div className="text-sm text-green-700">Games Analyzed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{results.openings.averageDeviationsPerGame}</div>
                  <div className="text-sm text-purple-700">Avg/Game</div>
                </div>
              </div>
              
              {results.openings.mostCommonDeviations.length > 0 && (
                <div>
                  <h5 className="font-medium text-blue-700 mb-2">Most Common Deviations:</h5>
                  <div className="space-y-1">
                    {results.openings.mostCommonDeviations.slice(0, 3).map((deviation, index) => (
                      <div key={index} className="bg-blue-100 p-2 rounded text-sm">
                        <span className="font-medium">{deviation.deviation}</span>
                        <span className="text-blue-600 ml-2">({deviation.count}x)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tactical Analysis Summary */}
          {results.tactical && (
            <div className="p-4 bg-yellow-50 rounded-lg">
              <h4 className="font-semibold text-yellow-800 mb-3">⚔️ Tactical Analysis Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{results.tactical.tacticalMistakes}</div>
                  <div className="text-sm text-yellow-700">Tactical Mistakes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{Object.keys(results.tactical.commonTacticalThemes).length}</div>
                  <div className="text-sm text-orange-700">Tactical Themes</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${results.tactical.readyForPuzzleGeneration ? 'text-green-600' : 'text-red-600'}`}>
                    {results.tactical.readyForPuzzleGeneration ? '✅' : '❌'}
                  </div>
                  <div className="text-sm text-gray-700">Ready for Puzzles</div>
                </div>
              </div>
              
              {Object.keys(results.tactical.commonTacticalThemes).length > 0 && (
                <div>
                  <h5 className="font-medium text-yellow-700 mb-2">Tactical Weaknesses:</h5>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(results.tactical.commonTacticalThemes)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 5)
                      .map(([theme, count]) => (
                        <span key={theme} className="bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full text-sm">
                          {theme.replace('_', ' ')}: {count}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Phase 3 Readiness */}
          <div className="p-4 bg-green-50 rounded-lg border-2 border-green-200">
            <h4 className="font-semibold text-green-800 mb-3">🚀 Phase 3 Readiness Check</h4>
            <div className="space-y-2">
              <div className={`flex items-center ${results.mistakes ? 'text-green-700' : 'text-gray-500'}`}>
                <span className="mr-2">{results.mistakes ? '✅' : '⏳'}</span>
                <span>Mistake patterns identified: {results.mistakes?.totalMistakes || 0} mistakes</span>
              </div>
              <div className={`flex items-center ${results.openings ? 'text-green-700' : 'text-gray-500'}`}>
                <span className="mr-2">{results.openings ? '✅' : '⏳'}</span>
                <span>Opening deviations found: {results.openings?.totalDeviations || 0} deviations</span>
              </div>
              <div className={`flex items-center ${results.tactical?.readyForPuzzleGeneration ? 'text-green-700' : 'text-gray-500'}`}>
                <span className="mr-2">{results.tactical?.readyForPuzzleGeneration ? '✅' : '⏳'}</span>
                <span>Tactical patterns ready for puzzle generation</span>
              </div>
            </div>
            
            {results.mistakes && results.openings && results.tactical && (
              <div className="mt-4 p-3 bg-green-100 rounded">
                <p className="text-green-800 font-medium">
                  🎉 Phase 2 Complete! Ready to proceed to Phase 3: Puzzle Generation
                </p>
                <p className="text-green-700 text-sm mt-1">
                  Found {results.mistakes.totalMistakes} mistakes and {results.openings.totalDeviations} opening deviations 
                  that can be converted into personalized puzzles.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No Games Warning */}
      {!gameStats?.hasGames && (
        <div className="p-4 bg-yellow-50 rounded-lg">
          <h3 className="font-semibold text-yellow-800 mb-2">No Games Available</h3>
          <p className="text-yellow-700 text-sm">
            Please fetch some games first using the Reports page before running Phase 2 analysis.
          </p>
        </div>
      )}
    </div>
  );
};

export default Phase2Summary;