# 🔍 Authentication Debug Guide

## ✅ Enhanced Logging is Now Active!

I've added comprehensive error logging to trace exactly what's happening during authentication.

---

## 🎯 **TEST NOW - Follow These Steps:**

### **Step 1: Open the App**
Go to: **http://localhost:3000/**

### **Step 2: Open Browser Console** (F12)
You should see the app configuration:
```
╔══════════════════════════════════════╗
║   MWRD Application Configuration   ║
╚══════════════════════════════════════╝
🔧 Mode: SUPABASE  ← Should say SUPABASE
📊 Database: ENABLED (Supabase)
```

**If you see "Mode: MOCK"** → Environment variables didn't load. Clear cache and reload.

### **Step 3: Try to Login**
1. Click "Get Started"
2. Enter:
   ```
   Email: client+demo@example.com
   Password: CHANGE_ME_CLIENT_PASSWORD
   ```
3. Click "Sign In"

### **Step 4: Watch the Console Output**

You'll see detailed logs showing exactly where the issue is:

**Expected flow:**
```
═══════════════════════════════════
🔐 LOGIN ATTEMPT
   Email: client+demo@example.com
   Mode: SUPABASE
═══════════════════════════════════
→ Using Supabase authentication
🔐 Attempting Supabase authentication...
   Email: client+demo@example.com
   Supabase URL: https://rubjxpazgaqheodcaulr.supabase.co
📡 Supabase auth response received
   Error: [will show error message if any]
   User: [will show user email if successful]
```

---

## 📊 **POSSIBLE ERROR SCENARIOS:**

### **Scenario A: "Invalid login credentials"**
```
❌ Supabase auth error: Invalid login credentials
```
**Cause:** Password is wrong in Supabase Auth

**Fix:**
1. Go to: https://supabase.com/dashboard/project/rubjxpazgaqheodcaulr/auth/users
2. Find the user (client+demo@example.com)
3. Click the three dots → "Edit User"
4. Reset password to: `CHANGE_ME_CLIENT_PASSWORD`
5. Try again

---

### **Scenario B: "User profile not found" or RLS Policy Error**
```
✅ Supabase authentication successful
   User ID: d1170655-2d28-49e7-964b-2a52f6e7deee
   Fetching user profile from database...
❌ Error fetching user profile: [RLS error or not found]
```

**Cause:** User IDs don't match or RLS policy blocking

**Fix - Check ID Matching:**
Run this SQL:
```sql
SELECT
  a.id as auth_id,
  a.email as auth_email,
  u.id as user_id,
  u.email as user_email,
  u.role
FROM auth.users a
LEFT JOIN users u ON a.email = u.email;
```

If IDs don't match, run:
```sql
UPDATE users SET id = 'd1170655-2d28-49e7-964b-2a52f6e7deee' WHERE email = 'client+demo@example.com';
UPDATE users SET id = '0e10340a-63e9-426d-984e-99771c5f2248' WHERE email = 'supplier+demo@example.com';
UPDATE users SET id = '36ec96b2-7b81-438d-b892-3d7e4e5cd5c2' WHERE email = 'admin+demo@example.com';
```

**Fix - Disable RLS Temporarily (for testing):**
```sql
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
```

---

### **Scenario C: Still in MOCK mode**
```
🔧 Mode: MOCK
```

**Cause:** Environment variables not loaded

**Fix:**
1. Check .env.local exists and has content
2. Restart dev server completely
3. Clear browser cache (Ctrl+Shift+Delete)
4. Hard reload (Ctrl+Shift+R)

---

## 🚨 **PASTE THE CONSOLE OUTPUT HERE**

Once you try to login, copy and paste the console output here and I'll tell you exactly what's wrong and how to fix it!

---

## 🔧 **Quick Verification Checklist:**

Run these in Supabase SQL Editor to verify everything:

### **1. Check Auth Users Exist:**
```sql
SELECT id, email, created_at FROM auth.users;
```

Should show all 3 users.

### **2. Check Database Users Exist:**
```sql
SELECT id, email, name, role FROM users;
```

Should show all 3 user profiles.

### **3. Check IDs Match:**
```sql
SELECT
  a.id as auth_id,
  u.id as user_id,
  a.email,
  u.name,
  u.role
FROM auth.users a
JOIN users u ON a.email = u.email;
```

The auth_id and user_id should be EXACTLY the same for each user.

### **4. Test Supabase Auth Directly:**
Run this in SQL Editor to test if auth is working:
```sql
SELECT * FROM auth.users WHERE email = 'client+demo@example.com';
```

Should return the user record.

---

## 💡 **Most Likely Fixes:**

Based on common issues:

1. **Password mismatch** → Reset password in Supabase Auth UI
2. **IDs don't match** → Run the UPDATE statements above
3. **RLS blocking** → Temporarily disable RLS for testing
4. **Email not confirmed** → Check user has green checkmark in Auth UI

---

**Try logging in now and paste the console output!** 🔍
