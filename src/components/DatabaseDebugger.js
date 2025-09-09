/**
 * Database Debugger Component
 * Shows what data is stored in IndexedDB for debugging
 */

import React, { useState, useEffect } from 'react';
import puzzleDataService from '../services/puzzleDataService';

const DatabaseDebugger = ({ username }) => {
  const [dbStats, setDbStats] = useState(null);
  const [mistakes, setMistakes] = useState([]);
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadDebugData = async () => {
    if (!username) return;
    
    setIsLoading(true);
    try {
      // Get storage stats
      const stats = await puzzleDataService.getStorageStats();
      setDbStats(stats);

      // Get user mistakes
      const userMistakes = await puzzleDataService.getUserMistakes(username);
      setMistakes(userMistakes || []);

      // Get user games
      const userGames = await puzzleDataService.getUserGames(username, 5);
      setGames(userGames || []);

      console.log('🔍 Debug Data:', { stats, userMistakes, userGames });
    } catch (error) {
      console.error('❌ Error loading debug data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDebugData();
  }, [username]);

  if (!username) {
    return (
      <div className="bg-gray-100 p-4 rounded-lg">
        <h3 className="font-bold text-gray-700 mb-2">🔍 Database Debug</h3>
        <p className="text-sm text-gray-600">No username provided</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-700">🔍 Database Debug</h3>
        <button 
          onClick={loadDebugData}
          disabled={isLoading}
          className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="space-y-3 text-sm">
        {/* Storage Stats */}
        <div>
          <h4 className="font-semibold text-gray-600">📊 Storage Stats:</h4>
          {dbStats ? (
            <ul className="text-xs text-gray-600 ml-2">
              <li>• Games: {dbStats.user_games || 0}</li>
              <li>• Mistakes: {dbStats.user_mistakes || 0}</li>
              <li>• Opening Deviations: {dbStats.opening_deviations || 0}</li>
              <li>• Progress Records: {dbStats.user_progress || 0}</li>
            </ul>
          ) : (
            <p className="text-xs text-gray-500 ml-2">Loading...</p>
          )}
        </div>

        {/* User Mistakes */}
        <div>
          <h4 className="font-semibold text-gray-600">🎯 Your Mistakes ({mistakes.length}):</h4>
          {mistakes.length > 0 ? (
            <div className="text-xs text-gray-600 ml-2 max-h-32 overflow-y-auto">
              {mistakes.slice(0, 5).map((mistake, index) => (
                <div key={index} className="mb-1 p-1 bg-white rounded">
                  <div>Type: {mistake.mistakeType || 'unknown'}</div>
                  <div>Move: {mistake.correctMove || 'N/A'}</div>
                  <div>Position: {mistake.fen ? '✅' : '❌'}</div>
                </div>
              ))}
              {mistakes.length > 5 && (
                <div className="text-gray-400">...and {mistakes.length - 5} more</div>
              )}
            </div>
          ) : (
            <p className="text-xs text-red-500 ml-2">❌ No mistakes found</p>
          )}
        </div>

        {/* User Games */}
        <div>
          <h4 className="font-semibold text-gray-600">♟️ Your Games ({games.length}):</h4>
          {games.length > 0 ? (
            <div className="text-xs text-gray-600 ml-2">
              {games.slice(0, 3).map((game, index) => (
                <div key={index} className="mb-1">
                  • vs {game.opponent || 'Unknown'} ({game.result || 'N/A'})
                </div>
              ))}
              {games.length > 3 && (
                <div className="text-gray-400">...and {games.length - 3} more</div>
              )}
            </div>
          ) : (
            <p className="text-xs text-red-500 ml-2">❌ No games found</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DatabaseDebugger;