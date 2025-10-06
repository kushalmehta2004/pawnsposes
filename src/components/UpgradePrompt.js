import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const UpgradePrompt = ({ title = 'Unlock Personalized Puzzles', description = 'Subscribe to access full weekly puzzle sets tailored to your games. Your first PDF report is free.' }) => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="bg-white border border-amber-300 rounded-xl p-6 shadow-sm">
      <h3 className="text-xl font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-gray-700">{description}</p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => navigate('/pricing', { state: { reportId: location.state?.analysis?.reportId } })}
          className="w-full px-4 py-3 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white"
        >
          See Plans
        </button>
        <button
          onClick={() => navigate('/pricing', { state: { reportId: location.state?.analysis?.reportId } })}
          className="w-full px-4 py-3 rounded-lg font-semibold bg-gray-900 hover:bg-black text-white"
        >
          Buy One-Time Pack ($4.99)
        </button>
      </div>
      <p className="mt-3 text-xs text-gray-500">Monthly $6.99 • Quarterly $18.99 • Annual $59.99</p>
    </div>
  );
};

export default UpgradePrompt;

