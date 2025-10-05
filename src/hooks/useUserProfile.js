/**
 * useUserProfile Hook
 * Provides user profile data and subscription status throughout the app
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import userProfileService from '../services/userProfileService';

export const useUserProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch user profile when user changes
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch profile and check expiry
        const userProfile = await userProfileService.getUserProfile(user.id);
        await userProfileService.checkAndUpdateExpiry(user.id);
        
        setProfile(userProfile);
      } catch (err) {
        console.error('❌ Error fetching user profile:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  // Refresh profile data
  const refreshProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const userProfile = await userProfileService.getUserProfile(user.id);
      await userProfileService.checkAndUpdateExpiry(user.id);
      setProfile(userProfile);
    } catch (err) {
      console.error('❌ Error refreshing profile:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper functions
  const hasClaimedFreeReport = () => {
    return profile?.has_claimed_free_report || false;
  };

  const hasActiveSubscription = () => {
    if (!profile) return false;
    
    const isActive = profile.subscription_status === 'active';
    const notExpired = !profile.subscription_expires_at || 
                      new Date(profile.subscription_expires_at) > new Date();
    
    return isActive && notExpired;
  };

  const canAccessPuzzles = () => {
    return hasActiveSubscription();
  };

  const getSubscriptionTier = () => {
    if (!profile) return 'none';
    return hasActiveSubscription() ? profile.subscription_type : 'none';
  };

  const isFreeTier = () => {
    return !hasActiveSubscription();
  };

  const canGenerateFreeReport = () => {
    return !hasClaimedFreeReport();
  };

  const getDaysUntilExpiry = () => {
    if (!profile?.subscription_expires_at) return null;
    
    const expiryDate = new Date(profile.subscription_expires_at);
    const today = new Date();
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays : 0;
  };

  const getSubscriptionStatusText = () => {
    if (!profile) return 'No subscription';
    
    if (hasActiveSubscription()) {
      const tier = profile.subscription_type;
      const daysLeft = getDaysUntilExpiry();
      
      if (tier === 'one-time') {
        return 'One-time pack active';
      }
      
      if (daysLeft !== null) {
        return `${tier.charAt(0).toUpperCase() + tier.slice(1)} plan (${daysLeft} days left)`;
      }
      
      return `${tier.charAt(0).toUpperCase() + tier.slice(1)} plan`;
    }
    
    if (profile.subscription_status === 'expired') {
      return 'Subscription expired';
    }
    
    if (profile.subscription_status === 'cancelled') {
      return 'Subscription cancelled';
    }
    
    return 'No active subscription';
  };

  return {
    profile,
    loading,
    error,
    refreshProfile,
    
    // Helper functions
    hasClaimedFreeReport,
    hasActiveSubscription,
    canAccessPuzzles,
    getSubscriptionTier,
    isFreeTier,
    canGenerateFreeReport,
    getDaysUntilExpiry,
    getSubscriptionStatusText
  };
};

export default useUserProfile;