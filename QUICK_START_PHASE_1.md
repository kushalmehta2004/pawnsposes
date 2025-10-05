# ⚡ QUICK START - Phase 1 Testing

---

## 🚀 **5-MINUTE SETUP**

### **Step 1: Database Setup (2 minutes)**

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `database-user-profiles-setup.sql`
3. Paste and click **Run**
4. Wait for "Success" message

✅ **Done!** Database is ready.

---

### **Step 2: Start Application (1 minute)**

```bash
npm start
```

✅ **Done!** App is running at http://localhost:3000

---

### **Step 3: Sign In (1 minute)**

1. Navigate to http://localhost:3000/auth
2. Sign in with existing account OR create new account
3. Verify you see your email in the header

✅ **Done!** You're authenticated.

---

### **Step 4: Test Dashboard (1 minute)**

1. Navigate to http://localhost:3000/profile-test
2. You should see:
   - 📊 Current Status section
   - 🧪 Test Actions section
   - 📄 Raw Profile Data section

✅ **Done!** Test dashboard is working.

---

## 🧪 **QUICK TESTS**

### **Test 1: Claim Free Report**
1. Click **"Claim Free Report"** button
2. See toast: "Free report claimed!"
3. Verify `Free Report Claimed` = ✅ Yes

### **Test 2: Activate Subscription**
1. Click **"Monthly ($6.99)"** button
2. See toast: "monthly subscription activated!"
3. Verify `Can Access Puzzles` = ✅ Yes

### **Test 3: Cancel Subscription**
1. Click **"Cancel Subscription"** button
2. See toast: "Subscription cancelled!"
3. Verify `Can Access Puzzles` = 🔒 No

### **Test 4: Reset Profile**
1. Click **"🔄 Reset to Default"** button
2. See toast: "Profile reset!"
3. Verify all values return to initial state

---

## ✅ **SUCCESS CHECKLIST**

- [ ] Database migration ran successfully
- [ ] App starts without errors
- [ ] Can sign in successfully
- [ ] Test dashboard loads at `/profile-test`
- [ ] Can claim free report
- [ ] Can activate subscription
- [ ] Can cancel subscription
- [ ] Can reset profile
- [ ] Profile persists after page refresh

---

## 🐛 **TROUBLESHOOTING**

### **Issue: Database migration fails**
- Check if you're using the correct Supabase project
- Verify you have admin access
- Try running the SQL in smaller chunks

### **Issue: Test dashboard shows errors**
- Check browser console for errors
- Verify you're signed in
- Try refreshing the page
- Check Supabase connection

### **Issue: Profile doesn't update**
- Check browser console for errors
- Verify database connection
- Try clicking "🔄 Reset to Default" and test again

---

## 📚 **FULL DOCUMENTATION**

For detailed testing instructions, see:
- `PHASE_1_TESTING.md` - Complete testing guide
- `PHASE_1_COMPLETE.md` - Implementation summary

---

## 🎯 **NEXT STEPS**

Once all tests pass:
✅ Phase 1 Complete → Move to Phase 2

Phase 2 will integrate this into the actual report generation flow.

---

**Estimated Time:** 5 minutes setup + 5 minutes testing = **10 minutes total**