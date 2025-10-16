/**
 * Subscription Service Test
 * Quick test to verify subscription service integration
 * 
 * To run this test:
 * 1. Import this in your console or a test component
 * 2. Call testSubscriptionService(userId) with your user ID
 */

import subscriptionService from './subscriptionService';
import puzzleAccessService from './puzzleAccessService';

/**
 * Test subscription service methods
 * @param {string} userId - Your user ID from Supabase auth
 */
export async function testSubscriptionService(userId) {
  console.log('🧪 Testing Subscription Service...\n');

  try {
    // Test 1: Get user subscription
    console.log('Test 1: Get User Subscription');
    const subscription = await subscriptionService.getUserSubscription(userId);
    console.log('✅ Subscription:', subscription);
    console.log('   Tier:', subscription.tier);
    console.log('   Status:', subscription.status);
    console.log('');

    // Test 2: Get subscription status (using DB function)
    console.log('Test 2: Get Subscription Status (DB Function)');
    const status = await subscriptionService.getSubscriptionStatus(userId);
    console.log('✅ Status:', status);
    console.log('');

    // Test 3: Get dashboard stats
    console.log('Test 3: Get Dashboard Stats');
    const stats = await subscriptionService.getDashboardStats(userId);
    console.log('✅ Dashboard Stats:', stats);
    console.log('');

    // Test 4: Check report limit
    console.log('Test 4: Check Report Limit');
    const limit = await subscriptionService.checkReportLimit(userId);
    console.log('✅ Report Limit:', limit);
    console.log('   Can Generate:', limit.canGenerate);
    console.log('   Remaining:', limit.remaining);
    console.log('');

    // Test 5: Get tier info
    console.log('Test 5: Get Tier Info');
    const tierName = subscriptionService.getTierDisplayName(subscription.tier);
    const tierPrice = subscriptionService.getTierPrice(subscription.tier);
    console.log('✅ Tier Display Name:', tierName);
    console.log('✅ Tier Price:', `$${tierPrice}`);
    console.log('');

    // Test 6: Get puzzles by category
    console.log('Test 6: Get Puzzles by Category');
    const categories = ['tactical', 'positional', 'opening', 'endgame'];
    for (const category of categories) {
      const puzzles = await puzzleAccessService.getPuzzlesByCategory(userId, category, 1);
      console.log(`✅ ${category}:`, puzzles.length > 0 ? 'Found' : 'None');
    }
    console.log('');

    console.log('🎉 All tests completed successfully!');
    return {
      success: true,
      subscription,
      status,
      stats,
      limit
    };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Test puzzle access for a specific puzzle
 * @param {string} userId - User ID
 * @param {string} puzzleId - Puzzle ID (UUID)
 */
export async function testPuzzleAccess(userId, puzzleId) {
  console.log('🧪 Testing Puzzle Access...\n');

  try {
    const hasAccess = await subscriptionService.canAccessPuzzle(userId, puzzleId);
    console.log('✅ Can Access Puzzle:', hasAccess);
    return hasAccess;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

/**
 * Test weekly puzzle functions
 * @param {string} userId - User ID
 */
export async function testWeeklyPuzzles(userId) {
  console.log('🧪 Testing Weekly Puzzles...\n');

  try {
    // Get current week puzzles
    const currentWeek = await subscriptionService.getCurrentWeekPuzzles(userId);
    console.log('✅ Current Week Puzzles:', currentWeek.length);

    // Get weekly puzzle count
    const weeklyCount = await subscriptionService.getWeeklyPuzzleCount(userId);
    console.log('✅ Weekly Puzzle Count:', weeklyCount);

    return {
      currentWeek,
      weeklyCount
    };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return null;
  }
}

export default {
  testSubscriptionService,
  testPuzzleAccess,
  testWeeklyPuzzles
};