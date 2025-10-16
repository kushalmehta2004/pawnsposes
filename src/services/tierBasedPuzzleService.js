/**
 * Tier-Based Puzzle Service
 * Manages puzzle access based on subscription tier
 * Integrates with subscriptionService to determine user's puzzle access rights
 */

import { supabase } from './supabaseClient';
import subscriptionService from './subscriptionService';

class TierBasedPuzzleService {
  /**
   * Tier configuration - defines what each tier can access
   */
  TIER_CONFIG = {
    free: {
      name: 'Free',
      teaserCount: 1, // 1 teaser per category
      allowedPuzzles: 'teaser_only', // Only teasers
      maxWeeks: null,
      price: 0
    },
    one_time: {
      name: 'One-Time Pack',
      teaserCount: 1,
      allowedPuzzles: 'weekly', // 1 week of puzzles
      maxWeeks: 1,
      price: 4.99
    },
    monthly: {
      name: 'Monthly',
      teaserCount: 1,
      allowedPuzzles: 'weekly', // Weekly puzzles
      maxWeeks: 4, // ~1 month
      price: 6.99
    },
    quarterly: {
      name: 'Quarterly',
      teaserCount: 1,
      allowedPuzzles: 'weekly', // Weekly puzzles
      maxWeeks: 12, // 3 months
      price: 18.99
    },
    annual: {
      name: 'Annual',
      teaserCount: 1,
      allowedPuzzles: 'weekly', // All weekly puzzles
      maxWeeks: 52, // Full year
      price: 59.99
    }
  };

  /**
   * Determine which puzzles user can access based on their tier
   * @param {string} userId - User ID
   * @param {Array} puzzles - Array of puzzle records from Supabase
   * @returns {Promise<Object>} - { accessible: [], locked: [], teasers: [] }
   */
  async filterPuzzlesByTier(userId, puzzles) {
    try {
      // Get user's subscription
      const subscription = await subscriptionService.getSubscriptionStatus(userId);
      const tier = subscription?.tier || 'free';

      console.log(`🎯 Filtering puzzles for user with tier: ${tier}`);

      // Separate puzzles by type
      const accessible = [];
      const locked = [];
      const teasers = [];
      
      // For free users: automatically mark first puzzle as teaser
      let isFirstPuzzle = tier === 'free';

      for (const puzzle of puzzles) {
        // Teasers are always accessible
        if (puzzle.is_teaser) {
          teasers.push({
            ...puzzle,
            accessLevel: 'teaser',
            canAccess: true
          });
          continue;
        }

        // For free users: first puzzle becomes a teaser
        if (isFirstPuzzle && tier === 'free') {
          isFirstPuzzle = false;
          teasers.push({
            ...puzzle,
            is_teaser: true,
            accessLevel: 'teaser',
            canAccess: true,
            isTeaserPromo: true // Flag to distinguish from explicit teasers
          });
          continue;
        }

        // Check if user's tier can access non-teaser puzzles
        const canAccess = this._canAccessPuzzle(tier, puzzle, subscription);

        if (canAccess) {
          accessible.push({
            ...puzzle,
            accessLevel: tier,
            canAccess: true
          });
        } else {
          locked.push({
            ...puzzle,
            accessLevel: this._getRequiredTier(puzzle),
            canAccess: false
          });
        }
      }

      return {
        accessible: [...teasers, ...accessible],
        locked,
        teasers,
        tierInfo: {
          tier,
          tierConfig: this.TIER_CONFIG[tier],
          subscription
        }
      };
    } catch (error) {
      console.error('❌ Error filtering puzzles by tier:', error);
      throw error;
    }
  }

  /**
   * Check if user can access a specific puzzle
   * @param {string} userId - User ID
   * @param {Object} puzzle - Puzzle record
   * @returns {Promise<boolean>} - Whether user can access
   */
  async canUserAccessPuzzle(userId, puzzle) {
    try {
      // Teasers are always accessible
      if (puzzle.is_teaser) return true;

      // Get subscription
      const subscription = await subscriptionService.getSubscriptionStatus(userId);
      const tier = subscription?.tier || 'free';

      return this._canAccessPuzzle(tier, puzzle, subscription);
    } catch (error) {
      console.error('❌ Error checking puzzle access:', error);
      return false;
    }
  }

  /**
   * Get unlock cost for a puzzle or report
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - { mustUpgrade: boolean, suggestedTier: string, price: number }
   */
  async getUnlockInfo(userId) {
    try {
      const subscription = await subscriptionService.getSubscriptionStatus(userId);
      const tier = subscription?.tier || 'free';

      if (tier === 'free') {
        return {
          mustUpgrade: true,
          suggestedTier: 'monthly',
          suggestedTierPrice: this.TIER_CONFIG.monthly.price,
          alternativeTiers: ['one_time', 'quarterly', 'annual']
        };
      }

      return {
        mustUpgrade: false,
        currentTier: tier,
        tierInfo: this.TIER_CONFIG[tier]
      };
    } catch (error) {
      console.error('❌ Error getting unlock info:', error);
      return { mustUpgrade: true };
    }
  }

  /**
   * Mark puzzles with tier information (for display)
   * @param {Array} puzzles - Array of puzzles
   * @param {string} userTier - Current user's tier
   * @returns {Array} - Puzzles with tier metadata
   */
  addTierMetadata(puzzles, userTier) {
    return puzzles.map(puzzle => ({
      ...puzzle,
      tierLocked: !this._isAccessibleByTier(userTier, puzzle),
      requiredTier: this._getRequiredTier(puzzle),
      isTeaser: puzzle.is_teaser,
      lockReason: this._getLockReason(userTier, puzzle)
    }));
  }

  /**
   * Get all available subscription tiers for display
   * @returns {Array} - Tier options
   */
  getTierOptions() {
    return [
      {
        tier: 'free',
        name: 'Free',
        price: 0,
        period: 'Forever',
        features: [
          '1 Free Full Report (first time)',
          '1 Teaser Puzzle per Category',
          'Basic Chess Analysis'
        ],
        cta: 'Get Started'
      },
      {
        tier: 'one_time',
        name: 'One-Time Pack',
        price: 4.99,
        period: 'One-Time',
        features: [
          '1 Week of Puzzles',
          'All 4 Categories Unlocked',
          'No Recurring Charges',
          'Perfect for Testing'
        ],
        cta: 'Try for $4.99'
      },
      {
        tier: 'monthly',
        name: 'Monthly',
        price: 6.99,
        period: 'per month',
        features: [
          'Weekly Puzzle Updates',
          'All 4 Categories',
          'Updated PDF Reports',
          'Cancel Anytime'
        ],
        cta: 'Subscribe $6.99/mo',
        popular: true
      },
      {
        tier: 'quarterly',
        name: 'Quarterly',
        price: 18.99,
        period: '3 months',
        features: [
          '12 Weeks of Puzzles',
          'All Categories Unlocked',
          'Updated Reports Every Week',
          'Save vs Monthly (10%)'
        ],
        cta: 'Subscribe $18.99/3mo'
      },
      {
        tier: 'annual',
        name: 'Annual',
        price: 59.99,
        period: 'per year',
        features: [
          '52 Weeks of Puzzles',
          'Full Year Access',
          'Weekly Reports & Updates',
          'Priority New Features',
          'Best Value (40% savings)'
        ],
        cta: 'Subscribe $59.99/yr',
        bestValue: true
      }
    ];
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Internal: Check if tier can access puzzle
   */
  _canAccessPuzzle(tier, puzzle, subscription) {
    // Teasers accessible to all
    if (puzzle.is_teaser) return true;

    // Free tier: only teasers
    if (tier === 'free') return false;

    // For weekly puzzles, check if within access window
    if (tier === 'one_time' || tier === 'monthly' || tier === 'quarterly' || tier === 'annual') {
      return this._isWithinAccessWindow(tier, puzzle, subscription);
    }

    return false;
  }

  /**
   * Check if puzzle is within user's access window
   */
  _isWithinAccessWindow(tier, puzzle, subscription) {
    const tierConfig = this.TIER_CONFIG[tier];
    if (!tierConfig || !tierConfig.maxWeeks) return false;

    // If puzzle has week_number and year, check if within allowed range
    if (puzzle.week_number && puzzle.year) {
      const puzzleDate = this._getWeekStartDate(puzzle.year, puzzle.week_number);
      const subscriptionStart = subscription?.current_period_start 
        ? new Date(subscription.current_period_start) 
        : new Date();
      
      // Calculate max allowed week based on subscription start
      const maxWeeksFromStart = tierConfig.maxWeeks;
      const cutoffDate = new Date(subscriptionStart);
      cutoffDate.setDate(cutoffDate.getDate() + (maxWeeksFromStart * 7));

      return puzzleDate >= subscriptionStart && puzzleDate <= cutoffDate;
    }

    // If no week info, assume it's accessible for paid tiers
    return tier !== 'free';
  }

  /**
   * Get required tier to access puzzle
   */
  _getRequiredTier(puzzle) {
    if (puzzle.is_teaser) return 'free';
    return puzzle.unlock_tier || 'monthly';
  }

  /**
   * Check if tier can access puzzle type
   */
  _isAccessibleByTier(tier, puzzle) {
    if (puzzle.is_teaser) return true;
    if (tier === 'free') return false;
    return true;
  }

  /**
   * Get lock reason for display
   */
  _getLockReason(userTier, puzzle) {
    if (puzzle.is_teaser) return null;
    if (userTier === 'free') return 'Unlock with a paid plan';
    if (userTier === 'one_time') return 'Expired: Subscribe for ongoing access';
    return null;
  }

  /**
   * Helper: Get start date of ISO week
   */
  _getWeekStartDate(year, weekNumber) {
    const simple = new Date(year, 0, 1 + (weekNumber - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4)
      ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else
      ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    return ISOweekStart;
  }
}

export default new TierBasedPuzzleService();