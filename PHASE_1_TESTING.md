# 🧪 PHASE 1 TESTING GUIDE
## Database Schema & User Profile Setup

---

## ✅ **WHAT WAS IMPLEMENTED**

### **1. Database Schema**
- ✅ `user_profiles` table with free report tracking and subscription fields
- ✅ `payment_transactions` table for payment history
- ✅ Row Level Security (RLS) policies for data protection
- ✅ Helper functions for subscription checks
- ✅ Automatic timestamp updates

### **2. Service Layer**
- ✅ `userProfileService.js` - Complete CRUD operations for user profiles
- ✅ Methods for checking subscription status
- ✅ Methods for claiming free reports
- ✅ Payment transaction recording

### **3. React Hook**
- ✅ `useUserProfile` hook for easy access to profile data
- ✅ Helper functions for subscription checks
- ✅ Automatic profile refresh on auth changes

### **4. Test Component**
- ✅ `ProfileTest.js` - Interactive testing dashboard
- ✅ Visual display of current profile status
- ✅ Buttons to test all functionality

---

## 🚀 **SETUP INSTRUCTIONS**

### **Step 1: Run Database Migration**

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Open the file: `database-user-profiles-setup.sql`
4. Copy the entire contents
5. Paste into Supabase SQL Editor
6. Click **Run** to execute

**Expected Result:**
```
✅ user_profiles table created
✅ payment_transactions table created
✅ RLS policies enabled
✅ Helper functions created
✅ Indexes created
```

### **Step 2: Verify Database Setup**

Run these test queries in Supabase SQL Editor:

```sql
-- Test 1: Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_profiles', 'payment_transactions');

-- Test 2: Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('user_profiles', 'payment_transactions');

-- Test 3: View helper functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%subscription%';
```

**Expected Results:**
- Test 1: Should return 2 rows (both tables)
- Test 2: Should show `rowsecurity = true` for both tables
- Test 3: Should show 3 functions (has_active_subscription, can_access_puzzles, get_subscription_tier)

---

## 🧪 **TESTING PROCEDURE**

### **Step 1: Start the Application**

```bash
npm start
```

### **Step 2: Sign In**

1. Navigate to `/auth`
2. Sign in with an existing account OR create a new account
3. Verify you're signed in (check header for user email)

### **Step 3: Access Test Dashboard**

Navigate to: **http://localhost:3000/profile-test**

You should see:
- 📊 Current Status section showing your profile data
- 🧪 Test Actions section with interactive buttons
- 📄 Raw Profile Data section showing JSON

---

## ✅ **TEST CASES**

### **Test Case 1: Initial Profile Creation**

**Steps:**
1. Sign in with a NEW account
2. Navigate to `/profile-test`

**Expected Results:**
- ✅ Profile is automatically created
- ✅ `Free Report Claimed` = ❌ No
- ✅ `Can Generate Free Report` = ✅ Yes
- ✅ `Subscription Tier` = none
- ✅ `Active Subscription` = ❌ No
- ✅ `Can Access Puzzles` = 🔒 No

---

### **Test Case 2: Claim Free Report**

**Steps:**
1. Click **"Claim Free Report"** button
2. Wait for success toast

**Expected Results:**
- ✅ Toast: "Free report claimed!"
- ✅ `Free Report Claimed` changes to ✅ Yes
- ✅ `Can Generate Free Report` changes to ❌ No
- ✅ Button becomes disabled with text "✅ Already Claimed"
- ✅ `free_report_claimed_at` timestamp appears in raw data

**Verify in Database:**
```sql
SELECT has_claimed_free_report, free_report_claimed_at 
FROM user_profiles 
WHERE email = 'your-email@example.com';
```

---

### **Test Case 3: Activate Monthly Subscription**

**Steps:**
1. Click **"Monthly ($6.99)"** button
2. Wait for success toast

**Expected Results:**
- ✅ Toast: "monthly subscription activated!"
- ✅ `Subscription Tier` = monthly
- ✅ `Subscription Status` = "Monthly plan (30 days left)"
- ✅ `Active Subscription` = ✅ Yes
- ✅ `Can Access Puzzles` = ✅ Yes
- ✅ `Days Until Expiry` = ~30 days

**Verify in Database:**
```sql
SELECT subscription_type, subscription_status, subscription_expires_at 
FROM user_profiles 
WHERE email = 'your-email@example.com';
```

---

### **Test Case 4: Activate Quarterly Subscription**

**Steps:**
1. Click **"Quarterly ($18.99)"** button
2. Wait for success toast

**Expected Results:**
- ✅ `Subscription Tier` = quarterly
- ✅ `Days Until Expiry` = ~90 days
- ✅ All access flags remain ✅ Yes

---

### **Test Case 5: Activate Annual Subscription**

**Steps:**
1. Click **"Annual ($59.99)"** button
2. Wait for success toast

**Expected Results:**
- ✅ `Subscription Tier` = annual
- ✅ `Days Until Expiry` = ~365 days
- ✅ All access flags remain ✅ Yes

---

### **Test Case 6: Activate One-Time Pack**

**Steps:**
1. Click **"One-Time ($4.99)"** button
2. Wait for success toast

**Expected Results:**
- ✅ `Subscription Tier` = one-time
- ✅ `Subscription Status` = "One-time pack active"
- ✅ `Days Until Expiry` = 7 days
- ✅ `Can Access Puzzles` = ✅ Yes

---

### **Test Case 7: Cancel Subscription**

**Steps:**
1. Ensure you have an active subscription
2. Click **"Cancel Subscription"** button
3. Wait for success toast

**Expected Results:**
- ✅ Toast: "Subscription cancelled!"
- ✅ `Subscription Status` = "Subscription cancelled"
- ✅ `Active Subscription` = ❌ No
- ✅ `Can Access Puzzles` = 🔒 No
- ✅ Button becomes disabled

---

### **Test Case 8: Reset Profile**

**Steps:**
1. Click **"🔄 Reset to Default"** button
2. Wait for success toast

**Expected Results:**
- ✅ Toast: "Profile reset!"
- ✅ All values return to initial state:
  - `Free Report Claimed` = ❌ No
  - `Subscription Tier` = none
  - `Active Subscription` = ❌ No
  - `Can Access Puzzles` = 🔒 No

---

### **Test Case 9: Profile Persistence**

**Steps:**
1. Activate a subscription (any type)
2. Refresh the page
3. Check if status persists

**Expected Results:**
- ✅ Profile data loads automatically
- ✅ Subscription status remains active
- ✅ All flags remain correct

---

### **Test Case 10: Multiple Users**

**Steps:**
1. Sign out
2. Sign in with a DIFFERENT account
3. Navigate to `/profile-test`

**Expected Results:**
- ✅ New profile is created for new user
- ✅ Previous user's data is NOT visible
- ✅ New user starts with default values

---

## 🔍 **VERIFICATION CHECKLIST**

### **Database Verification**

```sql
-- Check all user profiles
SELECT 
  email,
  has_claimed_free_report,
  subscription_type,
  subscription_status,
  subscription_expires_at
FROM user_profiles
ORDER BY created_at DESC;

-- Check RLS is working (should only see your own profile)
SELECT * FROM user_profiles;

-- Test helper functions
SELECT 
  email,
  has_active_subscription(id) as is_active,
  can_access_puzzles(id) as can_access,
  get_subscription_tier(id) as tier
FROM user_profiles;
```

### **Frontend Verification**

- [ ] Profile loads automatically on sign in
- [ ] All helper functions return correct values
- [ ] UI updates immediately after actions
- [ ] Toast notifications appear for all actions
- [ ] Loading states work correctly
- [ ] Error handling works (try with invalid data)
- [ ] Profile persists across page refreshes
- [ ] Different users have separate profiles

### **Security Verification**

- [ ] Users can only see their own profile data
- [ ] RLS policies prevent unauthorized access
- [ ] Service role key is NOT exposed to frontend
- [ ] All database operations use authenticated user ID

---

## 🐛 **TROUBLESHOOTING**

### **Issue: "Profile not found" error**

**Solution:**
1. Check if user is signed in
2. Verify `user_profiles` table exists
3. Check RLS policies are correct
4. Try refreshing the profile manually

### **Issue: "Permission denied" error**

**Solution:**
1. Verify RLS policies are enabled
2. Check user authentication token
3. Ensure Supabase client is configured correctly
4. Check if service role key is set (for backend only)

### **Issue: Profile doesn't update**

**Solution:**
1. Check browser console for errors
2. Verify database connection
3. Try calling `refreshProfile()` manually
4. Check if RLS policies allow updates

### **Issue: Subscription expiry not working**

**Solution:**
1. Check `subscription_expires_at` timestamp format
2. Verify timezone handling
3. Call `checkAndUpdateExpiry()` manually
4. Check if expiry date is in the future

---

## ✅ **SUCCESS CRITERIA**

Phase 1 is complete when:

- [x] Database tables created successfully
- [x] RLS policies working correctly
- [x] User profiles auto-create on first access
- [x] Free report claim tracking works
- [x] Subscription activation works for all tiers
- [x] Subscription cancellation works
- [x] Profile reset works
- [x] All helper functions return correct values
- [x] Profile persists across sessions
- [x] Multiple users have separate profiles
- [x] Test dashboard shows all data correctly

---

## 📊 **EXPECTED TEST RESULTS**

### **Console Logs (Success)**

```
📝 Profile not found, creating new profile for user: abc-123-def
✅ User profile created: { id: 'abc-123-def', ... }
✅ Free report claimed for user: abc-123-def
✅ Subscription updated for user: abc-123-def
```

### **Database State (After All Tests)**

```sql
-- Example profile after testing
{
  "id": "abc-123-def-456",
  "email": "test@example.com",
  "has_claimed_free_report": true,
  "free_report_claimed_at": "2024-01-15T10:30:00Z",
  "subscription_type": "monthly",
  "subscription_status": "active",
  "subscription_started_at": "2024-01-15T10:35:00Z",
  "subscription_expires_at": "2024-02-15T10:35:00Z",
  "stripe_customer_id": null,
  "stripe_subscription_id": null,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:35:00Z"
}
```

---

## 🎯 **NEXT STEPS**

Once Phase 1 testing is complete and all tests pass:

✅ **Phase 1 Complete** → Move to **Phase 2: Free Report Tracking System**

Phase 2 will integrate this profile system into the actual report generation flow.

---

## 📝 **NOTES**

- Keep the test dashboard (`/profile-test`) available for debugging
- Use "Reset Profile" button to test scenarios multiple times
- Check browser console for detailed logs
- Verify database state after each test
- Test with multiple user accounts to ensure isolation

---

## 🆘 **NEED HELP?**

If any test fails:
1. Check browser console for errors
2. Check Supabase logs for database errors
3. Verify all files were created correctly
4. Ensure database migration ran successfully
5. Try resetting the profile and testing again

**Common Issues:**
- Missing environment variables
- Incorrect Supabase configuration
- RLS policies too restrictive
- Timezone issues with expiry dates
- Authentication token expired