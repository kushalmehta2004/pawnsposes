/**
 * Subscription Service
 * Manages tier-based subscriptions and access control for the Dashboard system
 * Integrates with Supabase subscriptions table and database functions
 */

import { supabase } from './supabaseClient';

class SubscriptionService {
  /**
   * Get current user's subscription status
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Subscription details
   */
  async getUserSubscription(userId) {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // If no subscription found, return free tier default
      if (!data) {
        return {
          tier: 'free',
          status: 'active',
          current_period_end: null,
          purchased_week_number: null,
          purchased_year: null
        };
      }

      return data;
    } catch (error) {
      console.error('❌ Failed to get user subscription:', error);
      throw error;
    }
  }

  /**
   * Get subscription status using database function
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Subscription status from DB function
   */
  async getSubscriptionStatus(userId) {
    try {
      const { data, error } = await supabase
        .rpc('get_user_subscription_status', {
          p_user_id: userId
        });

      if (error) throw error;

      return data || {
        tier: 'free',
        status: 'active',
        current_period_end: null,
        purchased_week_number: null,
        purchased_year: null
      };
    } catch (error) {
      console.error('❌ Failed to get subscription status:', error);
      throw error;
    }
  }

  /**
   * Check if user can access a specific puzzle
   * @param {string} userId - User ID
   * @param {string} puzzleId - Puzzle ID (UUID)
   * @returns {Promise<boolean>} - Whether user has access
   */
  async canAccessPuzzle(userId, puzzleId) {
    try {
      const { data, error } = await supabase
        .rpc('can_access_puzzle', {
          p_user_id: userId,
          p_puzzle_id: puzzleId
        });

      if (error) throw error;

      return data === true;
    } catch (error) {
      console.error('❌ Failed to check puzzle access:', error);
      return false;
    }
  }

  /**
   * Create or update subscription (for Stripe webhook integration)
   * @param {Object} subscriptionData - Subscription data from Stripe
   * @returns {Promise<Object>} - Created/updated subscription
   */
  async upsertSubscription(subscriptionData) {
    try {
      const {
        userId,
        tier,
        status,
        stripeCustomerId,
        stripeSubscriptionId,
        stripePriceId,
        currentPeriodStart,
        currentPeriodEnd,
        trialEnd,
        cancelledAt,
        purchasedWeekNumber,
        purchasedYear
      } = subscriptionData;

      const { data, error } = await supabase
        .from('subscriptions')
        .upsert({
          user_id: userId,
          tier,
          status,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          stripe_price_id: stripePriceId,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          trial_end: trialEnd,
          cancelled_at: cancelledAt,
          purchased_week_number: purchasedWeekNumber,
          purchased_year: purchasedYear,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Subscription upserted:', data.id);
      return data;
    } catch (error) {
      console.error('❌ Failed to upsert subscription:', error);
      throw error;
    }
  }

  /**
   * Create one-time pack subscription
   * @param {string} userId - User ID
   * @param {string} paymentId - Stripe payment intent ID
   * @param {number} weekNumber - ISO week number
   * @param {number} year - Year
   * @returns {Promise<Object>} - Created subscription
   */
  async createOneTimePack(userId, paymentId, weekNumber = null, year = null) {
    try {
      // Get current week if not provided
      const currentWeek = weekNumber || this._getCurrentWeek();
      const currentYear = year || new Date().getFullYear();

      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          tier: 'one_time',
          status: 'active',
          stripe_customer_id: null,
          stripe_subscription_id: null,
          stripe_price_id: paymentId, // Store payment ID here for one-time
          purchased_week_number: currentWeek,
          purchased_year: currentYear,
          current_period_start: new Date().toISOString(),
          current_period_end: null // No expiration for one-time packs
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ One-time pack created for week ${currentWeek}/${currentYear}`);
      return data;
    } catch (error) {
      console.error('❌ Failed to create one-time pack:', error);
      throw error;
    }
  }

  /**
   * Create recurring subscription (monthly/quarterly/annual)
   * @param {string} userId - User ID
   * @param {string} tier - Subscription tier
   * @param {Object} stripeData - Stripe subscription data
   * @returns {Promise<Object>} - Created subscription
   */
  async createRecurringSubscription(userId, tier, stripeData) {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          tier,
          status: 'active',
          stripe_customer_id: stripeData.customerId,
          stripe_subscription_id: stripeData.subscriptionId,
          stripe_price_id: stripeData.priceId,
          current_period_start: new Date(stripeData.currentPeriodStart * 1000).toISOString(),
          current_period_end: new Date(stripeData.currentPeriodEnd * 1000).toISOString(),
          trial_end: stripeData.trialEnd ? new Date(stripeData.trialEnd * 1000).toISOString() : null
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ ${tier} subscription created`);
      return data;
    } catch (error) {
      console.error('❌ Failed to create recurring subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription (mark as cancelled but keep active until period end)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Updated subscription
   */
  async cancelSubscription(userId) {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', 'active')
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Subscription cancelled');
      return data;
    } catch (error) {
      console.error('❌ Failed to cancel subscription:', error);
      throw error;
    }
  }

  /**
   * Reactivate cancelled subscription
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Updated subscription
   */
  async reactivateSubscription(userId) {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          cancelled_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', 'cancelled')
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Subscription reactivated');
      return data;
    } catch (error) {
      console.error('❌ Failed to reactivate subscription:', error);
      throw error;
    }
  }

  /**
   * Update subscription period (for Stripe webhook renewals)
   * @param {string} userId - User ID
   * @param {Date} newPeriodEnd - New period end date
   * @returns {Promise<Object>} - Updated subscription
   */
  async updateSubscriptionPeriod(userId, newPeriodEnd) {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          current_period_end: newPeriodEnd.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Subscription period updated');
      return data;
    } catch (error) {
      console.error('❌ Failed to update subscription period:', error);
      throw error;
    }
  }

  /**
   * Get weekly puzzle count for user
   * @param {string} userId - User ID
   * @param {number} weekNumber - ISO week number
   * @param {number} year - Year
   * @returns {Promise<Array>} - Puzzle counts by category
   */
  async getWeeklyPuzzleCount(userId, weekNumber = null, year = null) {
    try {
      const currentWeek = weekNumber || this._getCurrentWeek();
      const currentYear = year || new Date().getFullYear();

      const { data, error } = await supabase
        .rpc('get_weekly_puzzle_count', {
          p_user_id: userId,
          p_week: currentWeek,
          p_year: currentYear
        });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Failed to get weekly puzzle count:', error);
      return [];
    }
  }

  /**
   * Mark puzzles as weekly when report is generated
   * @param {string} reportId - Report ID
   * @returns {Promise<void>}
   */
  async markPuzzlesAsWeekly(reportId) {
    try {
      const { error } = await supabase
        .rpc('mark_puzzles_as_weekly', {
          p_report_id: reportId
        });

      if (error) throw error;

      console.log('✅ Puzzles marked as weekly for report:', reportId);
    } catch (error) {
      console.error('❌ Failed to mark puzzles as weekly:', error);
      throw error;
    }
  }

  /**
   * Get user's accessible puzzles from view
   * @param {string} userId - User ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} - Accessible puzzles
   */
  async getAccessiblePuzzles(userId, filters = {}) {
    try {
      let query = supabase
        .from('user_accessible_puzzles')
        .select('*')
        .eq('user_id', userId)
        .eq('is_accessible', true)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.isWeekly !== undefined) {
        query = query.eq('is_weekly_puzzle', filters.isWeekly);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Failed to get accessible puzzles:', error);
      return [];
    }
  }

  /**
   * Get current week's puzzles for user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Current week puzzles
   */
  async getCurrentWeekPuzzles(userId) {
    try {
      const { data, error } = await supabase
        .from('user_current_week_puzzles')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Failed to get current week puzzles:', error);
      return [];
    }
  }

  /**
   * Get dashboard statistics for user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Dashboard stats by category
   */
  async getDashboardStats(userId) {
    try {
      const { data, error } = await supabase
        .from('user_dashboard_stats')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Failed to get dashboard stats:', error);
      return [];
    }
  }

  /**
   * Increment reports generated counter
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async incrementReportsGenerated(userId) {
    try {
      const { error } = await supabase.rpc('increment', {
        table_name: 'subscriptions',
        row_id: userId,
        column_name: 'reports_generated_this_period'
      });

      if (error) {
        // Fallback to manual increment
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('reports_generated_this_period')
          .eq('user_id', userId)
          .single();

        if (sub) {
          await supabase
            .from('subscriptions')
            .update({
              reports_generated_this_period: (sub.reports_generated_this_period || 0) + 1
            })
            .eq('user_id', userId);
        }
      }

      console.log('✅ Reports generated counter incremented');
    } catch (error) {
      console.error('❌ Failed to increment reports counter:', error);
    }
  }

  /**
   * Increment puzzles unlocked counter
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async incrementPuzzlesUnlocked(userId) {
    try {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('puzzles_unlocked_this_period')
        .eq('user_id', userId)
        .single();

      if (sub) {
        await supabase
          .from('subscriptions')
          .update({
            puzzles_unlocked_this_period: (sub.puzzles_unlocked_this_period || 0) + 1
          })
          .eq('user_id', userId);
      }

      console.log('✅ Puzzles unlocked counter incremented');
    } catch (error) {
      console.error('❌ Failed to increment puzzles counter:', error);
    }
  }

  /**
   * Check if user has reached report generation limit
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Limit status
   */
  async checkReportLimit(userId) {
    try {
      const subscription = await this.getUserSubscription(userId);

      // Define limits per tier
      const limits = {
        free: 1,
        one_time: 1,
        monthly: 4,  // ~1 per week
        quarterly: 12, // ~1 per week for 12 weeks
        annual: 52    // ~1 per week for 52 weeks
      };

      const limit = limits[subscription.tier] || 1;
      const used = subscription.reports_generated_this_period || 0;
      const remaining = Math.max(0, limit - used);

      return {
        tier: subscription.tier,
        limit,
        used,
        remaining,
        canGenerate: remaining > 0
      };
    } catch (error) {
      console.error('❌ Failed to check report limit:', error);
      return {
        tier: 'free',
        limit: 1,
        used: 0,
        remaining: 1,
        canGenerate: true
      };
    }
  }

  /**
   * Get tier display name
   * @param {string} tier - Tier code
   * @returns {string} - Display name
   */
  getTierDisplayName(tier) {
    const names = {
      free: 'Free',
      one_time: 'One-Time Pack',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      annual: 'Annual'
    };
    return names[tier] || 'Free';
  }

  /**
   * Get tier pricing
   * @param {string} tier - Tier code
   * @returns {number} - Price in USD
   */
  getTierPrice(tier) {
    const prices = {
      free: 0,
      one_time: 4.99,
      monthly: 6.99,
      quarterly: 18.99,
      annual: 59.99
    };
    return prices[tier] || 0;
  }

  /**
   * Check if tier is higher than another
   * @param {string} tier1 - First tier
   * @param {string} tier2 - Second tier
   * @returns {boolean} - Whether tier1 > tier2
   */
  isTierHigher(tier1, tier2) {
    const hierarchy = {
      free: 0,
      one_time: 1,
      monthly: 2,
      quarterly: 3,
      annual: 4
    };
    return (hierarchy[tier1] || 0) > (hierarchy[tier2] || 0);
  }

  /**
   * Get current ISO week number
   * @returns {number} - Week number (1-53)
   * @private
   */
  _getCurrentWeek() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    return Math.ceil(diff / oneWeek);
  }
}

// Export singleton instance
const subscriptionService = new SubscriptionService();
export default subscriptionService;