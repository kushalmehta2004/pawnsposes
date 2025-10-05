/**
 * Profile Test Component
 * Tests user profile functionality and displays current status
 */

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import userProfileService from '../services/userProfileService';
import toast from 'react-hot-toast';

const ProfileTest = () => {
  const { user } = useAuth();
  const { 
    profile, 
    loading, 
    error,
    refreshProfile,
    hasClaimedFreeReport,
    hasActiveSubscription,
    canAccessPuzzles,
    getSubscriptionTier,
    canGenerateFreeReport,
    getDaysUntilExpiry,
    getSubscriptionStatusText
  } = useUserProfile();

  const [testLoading, setTestLoading] = useState(false);

  // Test: Claim free report
  const handleClaimFreeReport = async () => {
    if (!user) {
      toast.error('Please sign in first');
      return;
    }

    try {
      setTestLoading(true);
      await userProfileService.claimFreeReport(user.id);
      await refreshProfile();
      toast.success('Free report claimed!');
    } catch (err) {
      toast.error('Failed to claim free report: ' + err.message);
    } finally {
      setTestLoading(false);
    }
  };

  // Test: Activate subscription
  const handleActivateSubscription = async (type) => {
    if (!user) {
      toast.error('Please sign in first');
      return;
    }

    try {
      setTestLoading(true);
      
      // Calculate expiry date based on type
      let expiresAt = new Date();
      switch (type) {
        case 'monthly':
          expiresAt.setMonth(expiresAt.getMonth() + 1);
          break;
        case 'quarterly':
          expiresAt.setMonth(expiresAt.getMonth() + 3);
          break;
        case 'annual':
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
          break;
        case 'one-time':
          expiresAt.setDate(expiresAt.getDate() + 7);
          break;
        default:
          expiresAt = null;
      }

      await userProfileService.updateSubscription(user.id, {
        subscription_type: type,
        subscription_status: 'active',
        subscription_started_at: new Date().toISOString(),
        subscription_expires_at: expiresAt?.toISOString()
      });

      await refreshProfile();
      toast.success(`${type} subscription activated!`);
    } catch (err) {
      toast.error('Failed to activate subscription: ' + err.message);
    } finally {
      setTestLoading(false);
    }
  };

  // Test: Deactivate subscription
  const handleDeactivateSubscription = async () => {
    if (!user) {
      toast.error('Please sign in first');
      return;
    }

    try {
      setTestLoading(true);
      await userProfileService.updateSubscription(user.id, {
        subscription_status: 'cancelled'
      });
      await refreshProfile();
      toast.success('Subscription cancelled!');
    } catch (err) {
      toast.error('Failed to cancel subscription: ' + err.message);
    } finally {
      setTestLoading(false);
    }
  };

  // Test: Reset profile
  const handleResetProfile = async () => {
    if (!user) {
      toast.error('Please sign in first');
      return;
    }

    try {
      setTestLoading(true);
      await userProfileService.updateSubscription(user.id, {
        has_claimed_free_report: false,
        free_report_claimed_at: null,
        subscription_type: 'none',
        subscription_status: 'inactive',
        subscription_started_at: null,
        subscription_expires_at: null
      });
      await refreshProfile();
      toast.success('Profile reset!');
    } catch (err) {
      toast.error('Failed to reset profile: ' + err.message);
    } finally {
      setTestLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-yellow-800 mb-2">
            ⚠️ Not Signed In
          </h2>
          <p className="text-yellow-700">
            Please sign in to test user profile functionality.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-800 mb-2">
            ❌ Error Loading Profile
          </h2>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">🧪 User Profile Test Dashboard</h1>

      {/* Current Status */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-2xl font-bold mb-4">📊 Current Status</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm text-gray-600">User ID</p>
            <p className="font-mono text-sm">{user.id}</p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm text-gray-600">Email</p>
            <p className="font-mono text-sm">{user.email}</p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm text-gray-600">Free Report Claimed</p>
            <p className="text-lg font-bold">
              {hasClaimedFreeReport() ? '✅ Yes' : '❌ No'}
            </p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm text-gray-600">Can Generate Free Report</p>
            <p className="text-lg font-bold">
              {canGenerateFreeReport() ? '✅ Yes' : '❌ No'}
            </p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm text-gray-600">Subscription Tier</p>
            <p className="text-lg font-bold capitalize">{getSubscriptionTier()}</p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm text-gray-600">Subscription Status</p>
            <p className="text-lg font-bold">{getSubscriptionStatusText()}</p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm text-gray-600">Active Subscription</p>
            <p className="text-lg font-bold">
              {hasActiveSubscription() ? '✅ Yes' : '❌ No'}
            </p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm text-gray-600">Can Access Puzzles</p>
            <p className="text-lg font-bold">
              {canAccessPuzzles() ? '✅ Yes' : '🔒 No'}
            </p>
          </div>
          
          {getDaysUntilExpiry() !== null && (
            <div className="bg-gray-50 p-4 rounded">
              <p className="text-sm text-gray-600">Days Until Expiry</p>
              <p className="text-lg font-bold">{getDaysUntilExpiry()} days</p>
            </div>
          )}
        </div>
      </div>

      {/* Test Actions */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-2xl font-bold mb-4">🧪 Test Actions</h2>
        
        <div className="space-y-4">
          {/* Free Report Test */}
          <div className="border-b pb-4">
            <h3 className="font-bold mb-2">Free Report Test</h3>
            <button
              onClick={handleClaimFreeReport}
              disabled={testLoading || hasClaimedFreeReport()}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {hasClaimedFreeReport() ? '✅ Already Claimed' : 'Claim Free Report'}
            </button>
          </div>

          {/* Subscription Tests */}
          <div className="border-b pb-4">
            <h3 className="font-bold mb-2">Activate Subscription</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleActivateSubscription('monthly')}
                disabled={testLoading}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                Monthly ($6.99)
              </button>
              <button
                onClick={() => handleActivateSubscription('quarterly')}
                disabled={testLoading}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                Quarterly ($18.99)
              </button>
              <button
                onClick={() => handleActivateSubscription('annual')}
                disabled={testLoading}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                Annual ($59.99)
              </button>
              <button
                onClick={() => handleActivateSubscription('one-time')}
                disabled={testLoading}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                One-Time ($4.99)
              </button>
            </div>
          </div>

          {/* Deactivate Subscription */}
          <div className="border-b pb-4">
            <h3 className="font-bold mb-2">Deactivate Subscription</h3>
            <button
              onClick={handleDeactivateSubscription}
              disabled={testLoading || !hasActiveSubscription()}
              className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Cancel Subscription
            </button>
          </div>

          {/* Reset Profile */}
          <div>
            <h3 className="font-bold mb-2">Reset Profile</h3>
            <button
              onClick={handleResetProfile}
              disabled={testLoading}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:bg-gray-400"
            >
              🔄 Reset to Default
            </button>
            <p className="text-sm text-gray-600 mt-2">
              Resets free report claim and subscription status
            </p>
          </div>
        </div>
      </div>

      {/* Raw Profile Data */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4">📄 Raw Profile Data</h2>
        <pre className="bg-gray-50 p-4 rounded overflow-auto text-sm">
          {JSON.stringify(profile, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default ProfileTest;