# 🔧 Fix RLS Infinite Recursion Error

## ✅ Root Cause Identified!

**Error:** `infinite recursion detected in policy for relation "users"` (Code 42P17)

**Cause:** The RLS policy "Admins can view all users" tries to check if a user is an admin by querying the users table, which triggers the same policy again, creating an infinite loop.

---

## 🚀 **APPLY THE FIX NOW - 2 Minutes**

### Step 1: Open Supabase SQL Editor

Go to: **https://supabase.com/dashboard/project/rubjxpazgaqheodcaulr/sql/new**

### Step 2: Run the Fix SQL

Copy the contents of `fix-rls-recursion.sql` and paste it into the SQL Editor.

Or copy this SQL directly:

```sql
-- Fix RLS Infinite Recursion Issue
-- Drop the problematic policies
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Create simple, non-recursive policies
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Allow all authenticated reads"
  ON users FOR SELECT
  USING (auth.role() = 'authenticated');
```

### Step 3: Click **RUN** (or press Ctrl+Enter)

You should see: ✅ **Success**

---

## 🧪 **TEST LOGIN NOW**

1. Go to: **http://localhost:3000/**

2. Open browser console (F12)

3. Click "Get Started"

4. Login with:
   ```
   Email: client+demo@example.com
   Password: CHANGE_ME_CLIENT_PASSWORD
   ```

5. Watch the console - you should now see:
   ```
   ✅ Supabase authentication successful
   ✅ Complete authentication successful
   ```

6. You should be redirected to the **Client Portal**! 🎉

---

## 📊 **What Changed?**

**Before (Problematic):**
- Policy checked "Is user an admin?" by querying users table → Infinite recursion

**After (Fixed):**
- Policy 1: Users can view their own profile (using auth.uid())
- Policy 2: All authenticated users can read users table (simple role check)
- No recursion because we use `auth.uid()` and `auth.role()` which don't query the table

---

## ✅ **Success Checklist**

- [ ] Ran fix SQL in Supabase
- [ ] No errors from SQL execution
- [ ] Opened http://localhost:3000/
- [ ] Logged in with client+demo@example.com
- [ ] No infinite recursion error in console
- [ ] Redirected to Client Portal
- [ ] Can see user profile data

---

## 🎯 **If It Works:**

Try logging in with the other accounts too:

**Supplier:**
```
Email: supplier+demo@example.com
Password: CHANGE_ME_SUPPLIER_PASSWORD
```

**Admin:**
```
Email: admin+demo@example.com
Password: CHANGE_ME_ADMIN_PASSWORD
```

All should work now! 💪
