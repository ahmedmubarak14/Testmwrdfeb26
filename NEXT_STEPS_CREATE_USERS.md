# ✅ Connected to New Supabase! - Create Users Now

## 🎉 SUCCESS! Your App is Connected!

**Status:** ✅ Dev server running with NEW Supabase instance
**URL:** http://localhost:3000/
**Supabase Project:** https://rubjxpazgaqheodcaulr.supabase.co

When you open your browser console now, you should see:
```
╔══════════════════════════════════════╗
║   MWRD Application Configuration   ║
╚══════════════════════════════════════╝
🔧 Mode: SUPABASE  ← Now showing SUPABASE!
📊 Database: ENABLED (Supabase)
```

---

## 📋 **IMPORTANT: Have You Run the Database Schema?**

Before creating users, make sure you've set up the database tables!

### If You Haven't Run the Schema Yet:

1. Go to SQL Editor: https://supabase.com/dashboard/project/rubjxpazgaqheodcaulr/sql/new

2. Open the file `supabase-schema.sql` in your project

3. Copy **ALL** the content

4. Paste it into the Supabase SQL Editor

5. Click **RUN** (or Ctrl+Enter)

6. You should see: ✅ **"Database schema created successfully!"**

### If You've Already Run It:
Great! Proceed to create users below 👇

---

## 👥 **CREATE DEMO USERS - Step by Step**

### **METHOD 1: Via Supabase Dashboard (Easier)** ⭐

#### Part A: Create Auth Users

1. Go to Authentication → Users:
   ```
   https://supabase.com/dashboard/project/rubjxpazgaqheodcaulr/auth/users
   ```

2. Click **"Add user"** → Select **"Create new user"**

3. Create **3 users** (do this 3 times):

   **User 1 - Client:**
   ```
   Email: client+demo@example.com
   Password: CHANGE_ME_CLIENT_PASSWORD
   ✅ Check "Auto Confirm User"
   ```
   Click **"Create user"**

   **User 2 - Supplier:**
   ```
   Email: supplier+demo@example.com
   Password: CHANGE_ME_SUPPLIER_PASSWORD
   ✅ Check "Auto Confirm User"
   ```
   Click **"Create user"**

   **User 3 - Admin:**
   ```
   Email: admin+demo@example.com
   Password: CHANGE_ME_ADMIN_PASSWORD
   ✅ Check "Auto Confirm User"
   ```
   Click **"Create user"**

#### Part B: Create User Profiles in Database

1. Go to SQL Editor: https://supabase.com/dashboard/project/rubjxpazgaqheodcaulr/sql/new

2. Copy and paste this SQL:

```sql
-- Create user profiles
INSERT INTO users (email, name, role, company_name, verified, public_id, status, kyc_status, rating) VALUES
('client+demo@example.com', 'John Client', 'CLIENT', 'Tech Solutions Ltd', true, 'Client-8492', 'ACTIVE', 'VERIFIED', NULL),
('supplier+demo@example.com', 'Sarah Supplier', 'SUPPLIER', 'Global Parts Inc', true, 'Supplier-3921', 'APPROVED', 'VERIFIED', 4.8),
('admin+demo@example.com', 'Admin Alice', 'ADMIN', 'mwrd HQ', true, NULL, 'ACTIVE', 'VERIFIED', NULL);
```

3. Click **RUN**

4. You should see: ✅ **"3 rows inserted"**

#### Part C: Link Auth Users to Database Users

1. Still in SQL Editor, run this to get auth user IDs:

```sql
SELECT id, email FROM auth.users ORDER BY created_at;
```

You'll see something like:
```
id                                      email
8a7b6c5d-4e3f-2g1h-0i9j-k8l7m6n5o4p3   client+demo@example.com
9b8c7d6e-5f4g-3h2i-1j0k-l9m8n7o6p5q4   supplier+demo@example.com
0c9d8e7f-6g5h-4i3j-2k1l-m0n9o8p7q6r5   admin+demo@example.com
```

2. Copy each ID and run these UPDATE statements (replace the IDs):

```sql
-- Replace 'ID-HERE' with actual IDs from the query above
UPDATE users SET id = '8a7b6c5d-4e3f-2g1h-0i9j-k8l7m6n5o4p3' WHERE email = 'client+demo@example.com';
UPDATE users SET id = '9b8c7d6e-5f4g-3h2i-1j0k-l9m8n7o6p5q4' WHERE email = 'supplier+demo@example.com';
UPDATE users SET id = '0c9d8e7f-6g5h-4i3j-2k1l-m0n9o8p7q6r5' WHERE email = 'admin+demo@example.com';
```

3. Click **RUN**

4. You should see: ✅ **"3 rows updated"**

---

## 🧪 **TEST YOUR LOGIN**

1. Open your browser: http://localhost:3000/

2. Open browser console (F12) - you should see:
   ```
   🔧 Mode: SUPABASE
   📊 Database: ENABLED (Supabase)
   🔄 Initializing authentication...
   ```

3. Click **"Get Started"**

4. Try logging in:
   ```
   Email: client+demo@example.com
   Password: CHANGE_ME_CLIENT_PASSWORD
   ```

5. Watch the console - you should see:
   ```
   🔐 Attempting Supabase authentication...
   ✅ Supabase authentication successful
   ```

6. You should be redirected to the **Client Portal**!

---

## ✅ **SUCCESS CHECKLIST**

Mark these off as you complete them:

- [ ] Database schema created (ran supabase-schema.sql)
- [ ] Created 3 auth users in Supabase Auth
- [ ] Inserted 3 user profiles in database
- [ ] Linked auth users to database users (UPDATE statements)
- [ ] Opened http://localhost:3000/
- [ ] Console shows "Mode: SUPABASE"
- [ ] Successfully logged in with client+demo@example.com
- [ ] Can see Client Portal with user data

---

## 🐛 **TROUBLESHOOTING**

### "User not found" or "Profile not found"
→ Make sure you created the user in Supabase Auth first
→ Check user is confirmed (green checkmark in Auth → Users)
→ Verify you ran the INSERT INTO users statement
→ Verify you ran the UPDATE statements to link IDs

### "Invalid credentials"
→ Check email is exactly: `client+demo@example.com`
→ Check password is exactly: `CHANGE_ME_CLIENT_PASSWORD`
→ Make sure user is confirmed in Auth

### "Row Level Security policy violation"
→ User IDs must match between auth.users and public.users
→ Run this to check:
  ```sql
  -- Check if IDs match
  SELECT
    a.id as auth_id,
    a.email,
    u.id as user_id,
    u.role
  FROM auth.users a
  LEFT JOIN users u ON a.email = u.email;
  ```
→ If they don't match, run the UPDATE statements again

### Console still shows "Mode: MOCK"
→ Clear browser cache and localStorage
→ Hard reload (Ctrl+Shift+R)
→ Check .env.local has uncommented VITE_SUPABASE_URL and KEY
→ Restart dev server

---

## 🎯 **AFTER SUCCESSFUL LOGIN**

Once you can login, you can:

1. **Add Products** (as Supplier)
   - Go to supplier+demo@example.com
   - Add products from Supplier Portal

2. **Create RFQs** (as Client)
   - Go to client+demo@example.com
   - Browse products and create requests

3. **Manage Platform** (as Admin)
   - Go to admin+demo@example.com
   - Approve products, set margins, manage users

4. **Add More Users**
   - Create more clients/suppliers as needed
   - Follow the same process above

---

## 🚀 **YOU'RE ALMOST THERE!**

Just follow the steps above to create the demo users, and you'll have a fully functional platform running on your new Supabase instance!

**Questions?** Just ask! I'm here to help. 💪
