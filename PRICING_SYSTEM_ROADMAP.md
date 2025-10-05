# 🗺️ PRICING SYSTEM IMPLEMENTATION ROADMAP

---

## 📋 **OVERVIEW**

This document outlines the complete implementation plan for the new pricing and feature access system for Pawns & Poses.

**Goal:** Transform the app from "free reports + free puzzles" to "1 free report + paid puzzles" with multiple subscription tiers.

---

## 🎯 **BUSINESS MODEL**

### **Current Model (Before)**
- ✅ Free PDF reports
- ✅ Free puzzles
- ❌ No monetization

### **New Model (After)**
- ✅ 1 FREE PDF report per user (trust builder)
- 🔒 Puzzles locked behind paywall (paid product)
- 💰 4 subscription tiers (monetization)
- 🎁 Teasers to convert free users (conversion funnel)

---

## 💰 **PRICING STRUCTURE**

### **Free Tier**
- ✅ 1 free PDF report (once per account)
- ✅ 1 teaser puzzle per weakness section
- 🔒 Full puzzles locked
- 🔒 No weekly updates

### **Monthly Plan - $6.99/month**
- ✅ Weekly personalized puzzles (4 sections/week)
- ✅ Weekly updated reports
- ✅ Full puzzle access
- ✅ Cancel anytime

### **Quarterly Plan - $18.99 (3 months)**
- ✅ 3 months of weekly puzzles
- ✅ 12 updated reports
- ✅ Save $2 vs monthly
- ✅ Full puzzle access

### **Annual Plan - $59.99/year**
- ✅ 12 months of weekly puzzles
- ✅ 52 updated reports
- ✅ Save $24 vs monthly
- ✅ Priority access to new features
- ✅ Best value

### **One-Time Pack - $4.99**
- ✅ 1 week of puzzles from free report
- ✅ No recurring charges
- ✅ Perfect for trying the system
- ❌ No weekly updates

---

## 📅 **IMPLEMENTATION PHASES**

---

### **✅ PHASE 1: Database Schema & User Profile Setup** 
**Status:** COMPLETE - READY FOR TESTING  
**Duration:** 2-3 hours  
**Complexity:** Medium

**Deliverables:**
- ✅ Database tables (`user_profiles`, `payment_transactions`)
- ✅ Row Level Security (RLS) policies
- ✅ Service layer (`userProfileService.js`)
- ✅ React hook (`useUserProfile.js`)
- ✅ Test dashboard (`/profile-test`)

**Testing:**
- Navigate to `/profile-test`
- Test all subscription operations
- Verify database state

**Documentation:**
- `PHASE_1_TESTING.md` - Complete testing guide
- `PHASE_1_COMPLETE.md` - Implementation summary
- `QUICK_START_PHASE_1.md` - Quick start guide

---

### **⏳ PHASE 2: Free Report Tracking System**
**Status:** NOT STARTED  
**Duration:** 2-3 hours  
**Complexity:** Medium

**Goal:** Implement "1 free report per user" logic

**Tasks:**
1. Update `Reports.js` to check free report status
2. Show different UI based on claim status
3. Mark report as claimed after generation
4. Add upgrade prompts for users who claimed free report
5. Prevent multiple free report claims

**Files to Modify:**
- `src/pages/Reports.js`
- `src/pages/ReportDisplay.js`

**Testing:**
- Generate first report (should be free)
- Try to generate second report (should show upgrade prompt)
- Verify database flag is set correctly

**Success Criteria:**
- [ ] Free users can generate 1 report
- [ ] Second report attempt shows upgrade prompt
- [ ] Database tracks claim status correctly
- [ ] UI shows appropriate messaging

---

### **⏳ PHASE 3: Puzzle Access Control & Teasers**
**Status:** NOT STARTED  
**Duration:** 3-4 hours  
**Complexity:** High

**Goal:** Lock puzzles behind paywall, show teasers for free users

**Tasks:**
1. Update `ReportDisplay.js` to show puzzle teasers
2. Update `PuzzlePage.js` to check subscription status
3. Create teaser puzzle component (1 per section)
4. Add "Unlock Puzzles" CTAs throughout
5. Block full puzzle generation for free users

**Files to Modify:**
- `src/pages/ReportDisplay.js`
- `src/pages/PuzzlePage.js`
- `src/components/PuzzleCard.js` (if exists)

**New Components:**
- `src/components/PuzzleTeaser.js`
- `src/components/UpgradePrompt.js`

**Testing:**
- View report as free user (see teasers)
- View report as paid user (see all puzzles)
- Try to access puzzle page as free user (blocked)
- Verify upgrade prompts appear

**Success Criteria:**
- [ ] Free users see 1 teaser per section
- [ ] Paid users see all puzzles
- [ ] Upgrade prompts appear in correct places
- [ ] Puzzle generation blocked for free users

---

### **⏳ PHASE 4: Pricing Page & Plan Selection**
**Status:** NOT STARTED  
**Duration:** 2-3 hours  
**Complexity:** Low

**Goal:** Create pricing page with all 4 plans

**Tasks:**
1. Create `Pricing.js` page component
2. Design plan comparison UI
3. Add plan selection buttons
4. Add route to pricing page
5. Link from upgrade prompts

**New Files:**
- `src/pages/Pricing.js`

**Files to Modify:**
- `src/App.js` (add route)
- `src/components/Layout/Header.js` (add nav link)

**Testing:**
- Navigate to pricing page
- View all 4 plans
- Click plan buttons (should prepare checkout)
- Verify responsive design

**Success Criteria:**
- [ ] Pricing page displays all 4 plans
- [ ] Plan comparison is clear
- [ ] Buttons work correctly
- [ ] Page is responsive
- [ ] Links from upgrade prompts work

---

### **⏳ PHASE 5: Payment Integration & Subscription Activation**
**Status:** NOT STARTED  
**Duration:** 4-5 hours  
**Complexity:** High

**Goal:** Connect Stripe payments to unlock puzzle access

**Tasks:**
1. Update `server/index.js` to handle new plan types
2. Create Stripe products for all 4 plans
3. Update webhook handlers to activate puzzle access
4. Create subscription verification logic
5. Test complete payment flow

**Files to Modify:**
- `server/index.js`
- `src/pages/Pricing.js`
- `src/services/stripeService.js` (if exists)

**Stripe Setup:**
- Create 4 products in Stripe Dashboard
- Get Price IDs for each plan
- Configure webhook endpoint
- Test with Stripe test cards

**Testing:**
- Complete purchase flow for each plan
- Verify subscription activation
- Test puzzle unlock after payment
- Verify webhook processing
- Test payment failure scenarios

**Success Criteria:**
- [ ] All 4 plans available in Stripe
- [ ] Checkout flow works for each plan
- [ ] Webhooks activate subscriptions correctly
- [ ] Puzzles unlock after payment
- [ ] Payment history recorded
- [ ] Error handling works

---

### **⏳ PHASE 6: Weekly Puzzle Generation & Report Updates**
**Status:** NOT STARTED  
**Duration:** 3-4 hours  
**Complexity:** High

**Goal:** Implement recurring puzzle generation for active subscribers

**Tasks:**
1. Create scheduled puzzle generation logic
2. Implement report refresh functionality
3. Add subscription expiry handling
4. Create notification system for new puzzles
5. Test weekly generation flow

**New Files:**
- `src/services/weeklyPuzzleService.js`
- `src/components/NewPuzzlesNotification.js`

**Files to Modify:**
- `src/pages/MyReports.js`
- `src/services/puzzleGenerationService.js`

**Testing:**
- Simulate weekly puzzle generation
- Test report refresh
- Verify subscription expiry handling
- Test notification system

**Success Criteria:**
- [ ] Weekly puzzles generate automatically
- [ ] Reports refresh with new data
- [ ] Expired subscriptions handled correctly
- [ ] Notifications work
- [ ] Performance is acceptable

---

## 📊 **PROGRESS TRACKING**

### **Overall Progress**
```
Phase 1: ████████████████████████ 100% ✅ COMPLETE
Phase 2: ░░░░░░░░░░░░░░░░░░░░░░░░   0% ⏳ NOT STARTED
Phase 3: ░░░░░░░░░░░░░░░░░░░░░░░░   0% ⏳ NOT STARTED
Phase 4: ░░░░░░░░░░░░░░░░░░░░░░░░   0% ⏳ NOT STARTED
Phase 5: ░░░░░░░░░░░░░░░░░░░░░░░░   0% ⏳ NOT STARTED
Phase 6: ░░░░░░░░░░░░░░░░░░░░░░░░   0% ⏳ NOT STARTED

Total: ████░░░░░░░░░░░░░░░░░░░░ 16.7% (1/6 phases)
```

### **Estimated Timeline**
- Phase 1: ✅ Complete (2-3 hours)
- Phase 2: ⏳ 2-3 hours
- Phase 3: ⏳ 3-4 hours
- Phase 4: ⏳ 2-3 hours
- Phase 5: ⏳ 4-5 hours
- Phase 6: ⏳ 3-4 hours

**Total Estimated Time:** 16-22 hours

---

## 🎯 **SUCCESS METRICS**

### **Technical Metrics**
- [ ] All database tables created
- [ ] All RLS policies working
- [ ] All service methods working
- [ ] All React hooks working
- [ ] All payment flows working
- [ ] All tests passing

### **Business Metrics**
- [ ] Free report conversion rate tracked
- [ ] Puzzle teaser click-through rate tracked
- [ ] Subscription purchase rate tracked
- [ ] Subscription retention rate tracked
- [ ] Revenue per user tracked

### **User Experience Metrics**
- [ ] Free report generation < 3 minutes
- [ ] Checkout flow < 2 minutes
- [ ] Puzzle unlock instant after payment
- [ ] Weekly puzzles generate on schedule
- [ ] No errors in production

---

## 🔐 **SECURITY CHECKLIST**

- [x] RLS policies enabled on all tables
- [x] Users can only access their own data
- [x] Service role key not exposed to frontend
- [ ] Stripe webhook signatures verified
- [ ] Payment data encrypted
- [ ] PCI compliance maintained
- [ ] GDPR compliance maintained
- [ ] User data deletion handled

---

## 📚 **DOCUMENTATION**

### **Phase 1 (Complete)**
- ✅ `database-user-profiles-setup.sql` - Database schema
- ✅ `PHASE_1_TESTING.md` - Testing guide
- ✅ `PHASE_1_COMPLETE.md` - Implementation summary
- ✅ `QUICK_START_PHASE_1.md` - Quick start guide
- ✅ `PRICING_SYSTEM_ROADMAP.md` - This document

### **Phase 2-6 (To Be Created)**
- ⏳ `PHASE_2_TESTING.md`
- ⏳ `PHASE_3_TESTING.md`
- ⏳ `PHASE_4_TESTING.md`
- ⏳ `PHASE_5_TESTING.md`
- ⏳ `PHASE_6_TESTING.md`
- ⏳ `FINAL_DEPLOYMENT_GUIDE.md`

---

## 🚀 **DEPLOYMENT PLAN**

### **Development Environment**
1. Complete all 6 phases
2. Test each phase thoroughly
3. Fix all bugs
4. Optimize performance

### **Staging Environment**
1. Deploy to staging server
2. Run full test suite
3. Test with real Stripe test mode
4. Get user feedback

### **Production Environment**
1. Create production Stripe products
2. Configure production webhooks
3. Deploy to production
4. Monitor for errors
5. Track metrics

---

## 🆘 **SUPPORT & TROUBLESHOOTING**

### **Phase 1 Issues**
See `PHASE_1_TESTING.md` for troubleshooting guide

### **General Issues**
1. Check browser console for errors
2. Check Supabase logs
3. Check Stripe logs (for payment issues)
4. Verify environment variables
5. Check RLS policies

### **Common Issues**
- **Database connection errors:** Check Supabase credentials
- **Authentication errors:** Check auth token validity
- **Payment errors:** Check Stripe configuration
- **RLS errors:** Check policy definitions

---

## 📞 **CONTACT**

For questions or issues:
1. Check relevant testing guide
2. Check browser/server console
3. Check database logs
4. Review implementation summary

---

## 🎉 **CURRENT STATUS**

**Phase 1:** ✅ **COMPLETE - READY FOR TESTING**

**Next Steps:**
1. Test Phase 1 using `/profile-test`
2. Verify all test cases pass
3. Proceed to Phase 2 implementation

**Estimated Time to Complete All Phases:** 16-22 hours

---

**Last Updated:** Phase 1 Complete  
**Next Milestone:** Phase 2 - Free Report Tracking System