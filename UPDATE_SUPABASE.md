# Quick Supabase Update Guide

## 🚀 Super Quick Start (5 Minutes)

Follow these steps in order:

### Step 1: Create New Supabase Project
1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Name it: `mwrd-marketplace`
4. Set a strong database password (SAVE IT!)
5. Choose region closest to you
6. Click "Create new project"
7. **Wait 2-3 minutes** for project to be ready

### Step 2: Get Your Credentials
1. Once ready, click **Settings** (gear icon)
2. Click **API**
3. Copy these two values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbG...` (long string)

### Step 3: Set Up Database
1. Click **SQL Editor** in sidebar
2. Click **"New Query"**
3. Copy **ALL** the content from `supabase-schema.sql` file
4. Paste it in the query editor
5. Click **RUN** button
6. You should see: "Database schema created successfully!"

### Step 4: Update Your App
1. Open `.env.local` file in your project
2. Update these lines (uncomment and replace):
   ```
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```
3. Save the file

### Step 5: Restart Server
```bash
# Stop current server (Ctrl+C)
# Start again
npm run dev
```

You should see:
```
🔧 Mode: SUPABASE
📊 Database: ENABLED (Supabase)
```

### Step 6: Create Demo Users

**Option A: Via Dashboard (Easier)**
1. Go to **Authentication** → **Users**
2. Click **"Add user"** → **"Create new user"**
3. Create these users:

**Client:**
- Email: `client+demo@example.com`
- Password: `CHANGE_ME_CLIENT_PASSWORD`
- Check "Auto Confirm User"

**Supplier:**
- Email: `supplier+demo@example.com`
- Password: `CHANGE_ME_SUPPLIER_PASSWORD`
- Check "Auto Confirm User"

**Admin:**
- Email: `admin+demo@example.com`
- Password: `CHANGE_ME_ADMIN_PASSWORD`
- Check "Auto Confirm User"

4. After creating auth users, link them to database:

Go to SQL Editor and run:

```sql
-- First, insert user profiles
INSERT INTO users (email, name, role, company_name, verified, public_id, status, kyc_status, rating) VALUES
('client+demo@example.com', 'John Client', 'CLIENT', 'Tech Solutions Ltd', true, 'Client-8492', 'ACTIVE', 'VERIFIED', NULL),
('supplier+demo@example.com', 'Sarah Supplier', 'SUPPLIER', 'Global Parts Inc', true, 'Supplier-3921', 'APPROVED', 'VERIFIED', 4.8),
('admin+demo@example.com', 'Admin Alice', 'ADMIN', 'mwrd HQ', true, NULL, 'ACTIVE', 'VERIFIED', NULL);

-- Then link auth users to database users
-- Get auth user IDs
SELECT id, email FROM auth.users ORDER BY created_at;

-- Copy each user's ID and update (replace 'auth-user-id' with actual IDs):
UPDATE users SET id = 'auth-user-id-for-client' WHERE email = 'client+demo@example.com';
UPDATE users SET id = 'auth-user-id-for-supplier' WHERE email = 'supplier+demo@example.com';
UPDATE users SET id = 'auth-user-id-for-admin' WHERE email = 'admin+demo@example.com';
```

### Step 7: Test Login
1. Go to http://localhost:3000/
2. Click "Get Started"
3. Login: `client+demo@example.com` / `CHANGE_ME_CLIENT_PASSWORD`
4. Should work! ✅

---

## 🔧 Troubleshooting

### "Invalid API key"
- Make sure you copied the **anon public** key (not service_role)
- Check for extra spaces in .env.local
- Restart dev server

### "User not found"
- Create user in Supabase Auth first
- Make sure email is confirmed
- Link auth user to database users table

### Still seeing "Mode: MOCK"
- Check .env.local has uncommented VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
- Restart dev server completely
- Clear browser cache

### "RLS policy violation"
- Make sure user IDs match between auth.users and public.users
- Check that user role is set correctly in users table

---

## 📞 Need Help?

Check these files for more details:
- `SUPABASE_MIGRATION_GUIDE.md` - Complete step-by-step guide
- `supabase-schema.sql` - Database schema to copy/paste
- `AUTH_ANALYSIS.md` - How authentication works

---

## ✅ Success Checklist

- [ ] New Supabase project created
- [ ] Got Project URL and anon key
- [ ] Ran schema SQL (all tables created)
- [ ] Updated .env.local
- [ ] Restarted dev server
- [ ] See "Mode: SUPABASE" in console
- [ ] Created demo users in Auth
- [ ] Linked users to database
- [ ] Can login successfully

---

**Once complete, you're on the new Supabase instance!** 🎉
