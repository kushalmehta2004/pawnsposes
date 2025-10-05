/**
 * User Profile Service
 * Handles user profile operations including subscription status and free report tracking
 */

import { supabase } from './supabaseClient';

const userProfileService = {
  /**
   * Get user profile by user ID
   * @param {string} userId - User's UUID
   * @returns {Promise<Object|null>} User profile or null
   */
  async getUserProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // If profile doesn't exist, create it
        if (error.code === 'PGRST116') {
          console.log('📝 Profile not found, creating new profile for user:', userId);
          return await this.createUserProfile(userId);
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Error fetching user profile:', error);
      throw error;
    }
  },

  /**
   * Create a new user profile
   * @param {string} userId - User's UUID
   * @returns {Promise<Object>} Created user profile
   */
  async createUserProfile(userId) {
    try {
      // Get user email from auth
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || user.id !== userId) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          email: user.email,
          has_claimed_free_report: false,
          subscription_type: 'none',
          subscription_status: 'inactive'
        })
        .select()
        .single();

      if (error) throw error;

      console.log('✅ User profile created:', data);
      return data;
    } catch (error) {
      console.error('❌ Error creating user profile:', error);
      throw error;
    }
  },

  /**
   * Check if user has claimed their free report
   * @param {string} userId - User's UUID
   * @returns {Promise<boolean>} True if free report has been claimed
   */
  async hasClaimedFreeReport(userId) {
    try {
      const profile = await this.getUserProfile(userId);
      return profile?.has_claimed_free_report || false;
    } catch (error) {
      console.error('❌ Error checking free report status:', error);
      return false;
    }
  },

  /**
   * Mark free report as claimed
   * @param {string} userId - User's UUID
   * @returns {Promise<Object>} Updated profile
   */
  async claimFreeReport(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update({
          has_claimed_free_report: true,
          free_report_claimed_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Free report claimed for user:', userId);
      return data;
    } catch (error) {
      console.error('❌ Error claiming free report:', error);
      throw error;
    }
  },

  /**
   * Check if user has active subscription
   * @param {string} userId - User's UUID
   * @returns {Promise<boolean>} True if subscription is active
   */
  async hasActiveSubscription(userId) {
    try {
      const profile = await this.getUserProfile(userId);
      
      if (!profile) return false;

      // Check if subscription is active and not expired
      const isActive = profile.subscription_status === 'active';
      const notExpired = !profile.subscription_expires_at || 
                        new Date(profile.subscription_expires_at) > new Date();

      return isActive && notExpired;
    } catch (error) {
      console.error('❌ Error checking subscription status:', error);
      return false;
    }
  },

  /**
   * Check if user can access puzzles
   * @param {string} userId - User's UUID
   * @returns {Promise<boolean>} True if user can access puzzles
   */
  async canAccessPuzzles(userId) {
    try {
      return await this.hasActiveSubscription(userId);
    } catch (error) {
      console.error('❌ Error checking puzzle access:', error);
      return false;
    }
  },

  /**
   * Get user's subscription tier
   * @param {string} userId - User's UUID
   * @returns {Promise<string>} Subscription tier (none, monthly, quarterly, annual, one-time)
   */
  async getSubscriptionTier(userId) {
    try {
      const profile = await this.getUserProfile(userId);
      
      if (!profile) return 'none';

      // Check if subscription is active
      const isActive = await this.hasActiveSubscription(userId);
      
      return isActive ? profile.subscription_type : 'none';
    } catch (error) {
      console.error('❌ Error getting subscription tier:', error);
      return 'none';
    }
  },

  /**
   * Update user's subscription
   * @param {string} userId - User's UUID
   * @param {Object} subscriptionData - Subscription data to update
   * @returns {Promise<Object>} Updated profile
   */
  async updateSubscription(userId, subscriptionData) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update(subscriptionData)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Subscription updated for user:', userId);
      return data;
    } catch (error) {
      console.error('❌ Error updating subscription:', error);
      throw error;
    }
  },

  /**
   * Get user's payment history
   * @param {string} userId - User's UUID
   * @returns {Promise<Array>} Array of payment transactions
   */
  async getPaymentHistory(userId) {
    try {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Error fetching payment history:', error);
      return [];
    }
  },

  /**
   * Record a payment transaction
   * @param {Object} transactionData - Transaction data
   * @returns {Promise<Object>} Created transaction
   */
  async recordTransaction(transactionData) {
    try {
      const { data, error } = await supabase
        .from('payment_transactions')
        .insert(transactionData)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Payment transaction recorded:', data);
      return data;
    } catch (error) {
      console.error('❌ Error recording transaction:', error);
      throw error;
    }
  },

  /**
   * Check subscription expiry and update status if needed
   * @param {string} userId - User's UUID
   * @returns {Promise<Object>} Updated profile if changed
   */
  async checkAndUpdateExpiry(userId) {
    try {
      const profile = await this.getUserProfile(userId);
      
      if (!profile) return null;

      // Check if subscription has expired
      if (profile.subscription_expires_at && 
          new Date(profile.subscription_expires_at) < new Date() &&
          profile.subscription_status === 'active') {
        
        console.log('⏰ Subscription expired for user:', userId);
        
        return await this.updateSubscription(userId, {
          subscription_status: 'expired'
        });
      }

      return profile;
    } catch (error) {
      console.error('❌ Error checking subscription expiry:', error);
      return null;
    }
  }
};

export default userProfileService;