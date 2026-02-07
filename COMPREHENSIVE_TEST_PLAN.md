# 🧪 Comprehensive Pre-Deployment Test Plan

## ⚠️ CRITICAL: Apply RLS Fix First!

**Before testing, you MUST apply the RLS fix to prevent infinite recursion error:**

1. Go to: https://supabase.com/dashboard/project/rubjxpazgaqheodcaulr/sql/new
2. Copy and paste the SQL from `fix-rls-recursion.sql`
3. Click **RUN**
4. Verify: ✅ Success (no errors)

**Without this fix, all logins will fail with "User profile not found" error.**

---

## 🚀 Testing Checklist

### Phase 1: Environment & Configuration ✅

- [ ] **.env.local exists** with Supabase credentials
- [ ] **Dev server starts** without errors (`npm run dev`)
- [ ] **Browser console shows** "Mode: SUPABASE" (not MOCK)
- [ ] **No console errors** on page load

**Test:**
```bash
# Start dev server
npm run dev

# Open: http://localhost:3000/
# Check console (F12) for:
# 🔧 Mode: SUPABASE
# 📊 Database: ENABLED (Supabase)
```

---

### Phase 2: Authentication Testing 🔐

#### Test 2.1: Client Login
- [ ] Navigate to http://localhost:3000/
- [ ] Click "Get Started"
- [ ] Enter credentials:
  - Email: `client+demo@example.com`
  - Password: `CHANGE_ME_CLIENT_PASSWORD`
- [ ] Click "Sign In"
- [ ] **Expected:** Redirects to Client Portal
- [ ] **Verify console shows:**
  ```
  ✅ Supabase authentication successful
  ✅ Complete authentication successful
  User: John Client (CLIENT)
  ```

#### Test 2.2: Supplier Login
- [ ] Logout (if logged in)
- [ ] Login with:
  - Email: `supplier+demo@example.com`
  - Password: `CHANGE_ME_SUPPLIER_PASSWORD`
- [ ] **Expected:** Redirects to Supplier Portal
- [ ] **Verify:** Can see supplier dashboard

#### Test 2.3: Admin Login
- [ ] Logout (if logged in)
- [ ] Login with:
  - Email: `admin+demo@example.com`
  - Password: `CHANGE_ME_ADMIN_PASSWORD`
- [ ] **Expected:** Redirects to Admin Portal
- [ ] **Verify:** Can see admin dashboard

#### Test 2.4: Invalid Credentials
- [ ] Try login with wrong password
- [ ] **Expected:** Shows "Invalid credentials" error
- [ ] **Verify:** Does not crash or freeze

---

### Phase 3: Client Portal Features 👤

**Login as:** `client+demo@example.com`

- [ ] **Dashboard loads** without errors
- [ ] **Profile displays** correct name and email
- [ ] **Can view RFQs** (if any exist)
- [ ] **Can create new RFQ**
- [ ] **Can browse products** (if any exist)
- [ ] **Navigation works** (sidebar/header links)
- [ ] **Logout works** and returns to login page

---

### Phase 4: Supplier Portal Features 🏭

**Login as:** `supplier+demo@example.com`

- [ ] **Dashboard loads** without errors
- [ ] **Profile displays** correct name and company
- [ ] **Can view products** (if any exist)
- [ ] **Can add new product** (test form)
- [ ] **Can view RFQs/quotes** (if any exist)
- [ ] **Can submit quotes** (test functionality)
- [ ] **Rating displays** (should show 4.8)
- [ ] **Logout works**

---

### Phase 5: Admin Portal Features ⚙️

**Login as:** `admin+demo@example.com`

- [ ] **Dashboard loads** without errors
- [ ] **Can view all users** (should see 3 users)
- [ ] **Can view all products** (if any exist)
- [ ] **Can view all RFQs** (if any exist)
- [ ] **Can view margins** settings
- [ ] **Can approve/reject items** (if any pending)
- [ ] **Platform stats display** correctly
- [ ] **Logout works**

---

### Phase 6: Database Integration 🗄️

**Verify in Supabase Dashboard:**

- [ ] Auth users exist (3 users)
- [ ] Database users exist and IDs match
- [ ] RLS policies are correct (non-recursive)
- [ ] No errors in Supabase logs

**SQL Verification:**
```sql
-- Should return 3 matching records
SELECT
  a.id as auth_id,
  u.id as user_id,
  a.email,
  u.name,
  u.role
FROM auth.users a
JOIN users u ON a.id = u.id
ORDER BY u.role;
```

---

### Phase 7: Error Handling 🐛

- [ ] **Network offline:** App shows appropriate error
- [ ] **Invalid session:** Redirects to login
- [ ] **Expired token:** Refreshes or redirects to login
- [ ] **Console has no critical errors** during normal use
- [ ] **No infinite loops** or recursion errors
- [ ] **Forms validate** input properly

---

### Phase 8: Performance & UX 🚄

- [ ] **Pages load quickly** (< 2 seconds)
- [ ] **No flickering** during auth check
- [ ] **Smooth transitions** between pages
- [ ] **Responsive on mobile** (test different screen sizes)
- [ ] **Images load** properly (if any)
- [ ] **No memory leaks** (check dev tools performance)

---

## 🔴 Critical Issues to Watch For

### 1. Infinite Recursion Error
**Symptom:** "infinite recursion detected in policy for relation 'users'"
**Fix:** Apply `fix-rls-recursion.sql`

### 2. Invalid Credentials (Auth Success but Profile Fetch Fails)
**Symptom:** Auth succeeds but shows "User profile not found"
**Cause:** ID mismatch or RLS blocking
**Fix:** Verify IDs match between auth.users and users table

### 3. Blank Screen
**Symptom:** White screen, no errors
**Cause:** Environment variables not loaded
**Fix:** Restart dev server, clear browser cache

### 4. Mode Shows MOCK Instead of SUPABASE
**Symptom:** Console shows "Mode: MOCK"
**Cause:** .env.local not loaded
**Fix:** Verify .env.local exists, restart dev server

---

## ✅ Success Criteria

**All tests pass when:**

✅ All 3 user types can login successfully
✅ Each portal loads without errors
✅ User data displays correctly
✅ Navigation works smoothly
✅ Console has no critical errors
✅ Logout works for all user types
✅ Forms and interactions work as expected
✅ No infinite recursion or RLS errors

---

## 📊 Test Results Template

Copy this and fill in your results:

```
=== Test Results ===
Date: [DATE]
Tester: [NAME]

Environment:
- Dev server: [ ] Running
- Mode: [ ] SUPABASE / [ ] MOCK
- RLS Fix Applied: [ ] Yes / [ ] No

Authentication:
- Client login: [ ] ✅ / [ ] ❌
- Supplier login: [ ] ✅ / [ ] ❌
- Admin login: [ ] ✅ / [ ] ❌

Portals:
- Client portal: [ ] ✅ / [ ] ❌
- Supplier portal: [ ] ✅ / [ ] ❌
- Admin portal: [ ] ✅ / [ ] ❌

Critical Issues: [List any]

Minor Issues: [List any]

Overall Status: [ ] READY TO DEPLOY / [ ] NEEDS FIXES
```

---

## 🚀 Ready to Deploy?

**If all tests pass:**
1. Create PR to main branch
2. Review changes one more time
3. Merge to main
4. Deploy to production

**If tests fail:**
1. Note which tests failed
2. Check console for errors
3. Review DEBUG_AUTH_ISSUE.md for fixes
4. Apply fixes and re-test
