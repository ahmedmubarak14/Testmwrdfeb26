# Your New Supabase Setup - Ready to Complete!

## ✅ Project Created!

**Your Project URL:** `https://rubjxpazgaqheodcaulr.supabase.co`
**Project ID:** `rubjxpazgaqheodcaulr`

---

## 📋 **NEXT STEPS - DO THESE NOW**

### Step 1: Get Your Anon Key 🔑

1. Go to your project dashboard:
   ```
   https://supabase.com/dashboard/project/rubjxpazgaqheodcaulr
   ```

2. Click **Settings** (gear icon in left sidebar)

3. Click **API** in the settings menu

4. You'll see a section called **Project API keys**

5. Find the **anon public** key (NOT the service_role key!)
   - It's a long string starting with `eyJ...`
   - Click the copy icon next to it

6. **COPY THIS KEY** - You'll paste it in the next step

---

### Step 2: Set Up Database Schema 🗄️

1. In your Supabase dashboard, click **SQL Editor** (in left sidebar)

2. Click the **"New query"** button

3. I've created a file called `supabase-schema.sql` in your project

4. **Copy ALL the content** from that file

5. **Paste it** into the SQL Editor

6. Click the **RUN** button (or press Ctrl+Enter)

7. Wait for it to complete (should take a few seconds)

8. You should see: **"Database schema created successfully!"**

This creates:
- ✅ Users table
- ✅ Products table
- ✅ RFQs table
- ✅ Quotes table
- ✅ Orders table
- ✅ All indexes
- ✅ Row Level Security policies
- ✅ Triggers and functions

---

### Step 3: Update Your App Configuration 📝

I'll update your `.env.local` file for you now.

**Just tell me:**
- ✅ You've copied your anon key
- ✅ Paste it here, and I'll update the config file automatically

Or you can manually update it:

1. Open `.env.local` in your project
2. Replace the content with:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://rubjxpazgaqheodcaulr.supabase.co
VITE_SUPABASE_ANON_KEY=paste_your_anon_key_here

# Optional: Gemini API Key for AI features
# GEMINI_API_KEY=your_gemini_api_key_here

# Moyasar Payment Gateway Configuration
# VITE_MOYASAR_API_KEY=your_moyasar_secret_key_here
# VITE_MOYASAR_PUBLISHABLE_KEY=your_moyasar_publishable_key_here
```

3. Replace `paste_your_anon_key_here` with your actual anon key
4. Save the file

---

### Step 4: Restart Your Dev Server 🔄

```bash
# Stop the current server (if running)
# Then start it again
npm run dev
```

You should see:
```
╔══════════════════════════════════════╗
║   MWRD Application Configuration   ║
╚══════════════════════════════════════╝
🔧 Mode: SUPABASE  ← Should say SUPABASE now!
📊 Database: ENABLED (Supabase)
```

---

### Step 5: Create Demo Users 👥

Now you need to create auth users in Supabase:

**Option A: Via Supabase Dashboard (Recommended)**

1. Go to **Authentication** → **Users** in your Supabase dashboard
   ```
   https://supabase.com/dashboard/project/rubjxpazgaqheodcaulr/auth/users
   ```

2. Click **"Add user"** button → Select **"Create new user"**

3. Create these three users (one at a time):

   **User 1 - Client:**
   ```
   Email: client+demo@example.com
   Password: CHANGE_ME_CLIENT_PASSWORD
   ✅ Check "Auto Confirm User"
   ```

   **User 2 - Supplier:**
   ```
   Email: supplier+demo@example.com
   Password: CHANGE_ME_SUPPLIER_PASSWORD
   ✅ Check "Auto Confirm User"
   ```

   **User 3 - Admin:**
   ```
   Email: admin+demo@example.com
   Password: CHANGE_ME_ADMIN_PASSWORD
   ✅ Check "Auto Confirm User"
   ```

4. After creating all three auth users, go back to **SQL Editor**

5. Run this SQL to create the user profiles:

```sql
-- Insert user profiles
INSERT INTO users (email, name, role, company_name, verified, public_id, status, kyc_status, rating) VALUES
('client+demo@example.com', 'John Client', 'CLIENT', 'Tech Solutions Ltd', true, 'Client-8492', 'ACTIVE', 'VERIFIED', NULL),
('supplier+demo@example.com', 'Sarah Supplier', 'SUPPLIER', 'Global Parts Inc', true, 'Supplier-3921', 'APPROVED', 'VERIFIED', 4.8),
('admin+demo@example.com', 'Admin Alice', 'ADMIN', 'mwrd HQ', true, NULL, 'ACTIVE', 'VERIFIED', NULL);
```

6. Now link the auth users to database users. First, get the auth user IDs:

```sql
-- Get auth user IDs
SELECT id, email FROM auth.users ORDER BY created_at;
```

You'll see something like:
```
id                                      email
---------------------------------------- -------------------
abc123-456-789...                       client+demo@example.com
def456-789-012...                       supplier+demo@example.com
ghi789-012-345...                       admin+demo@example.com
```

7. Copy each ID and update the users table (replace the placeholders):

```sql
-- Update with actual auth user IDs
UPDATE users SET id = 'abc123-456-789...' WHERE email = 'client+demo@example.com';
UPDATE users SET id = 'def456-789-012...' WHERE email = 'supplier+demo@example.com';
UPDATE users SET id = 'ghi789-012-345...' WHERE email = 'admin+demo@example.com';
```

---

### Step 6: Test Login! 🎉

1. Go to http://localhost:3000/
2. Open browser console (F12)
3. You should see:
   ```
   🔧 Mode: SUPABASE
   📊 Database: ENABLED (Supabase)
   🔄 Initializing authentication...
   ```

4. Click "Get Started"
5. Login with: `client+demo@example.com` / `CHANGE_ME_CLIENT_PASSWORD`
6. Watch the console - you should see Supabase authentication messages
7. You should be logged in and see the Client Portal!

---

## ✅ Verification Checklist

Check these off as you complete them:

- [ ] Got anon key from Supabase dashboard
- [ ] Ran supabase-schema.sql in SQL Editor
- [ ] Saw "Database schema created successfully!"
- [ ] Updated .env.local with new URL and anon key
- [ ] Restarted dev server
- [ ] Console shows "Mode: SUPABASE"
- [ ] Created 3 auth users (client, supplier, admin)
- [ ] Inserted user profiles with SQL
- [ ] Linked auth users to database users
- [ ] Successfully logged in with client+demo@example.com
- [ ] Can see Client Portal with data from database

---

## 🚨 Common Issues & Solutions

### "Invalid API key"
→ Make sure you copied the **anon public** key (not service_role)
→ Check there are no extra spaces in .env.local

### "User not found" or "Profile not found"
→ Make sure you created the auth user first
→ Check user is confirmed (green checkmark in Auth > Users)
→ Verify user IDs match between auth.users and public.users

### Console still shows "Mode: MOCK"
→ .env.local must have UNCOMMENTED lines for URL and KEY
→ Restart dev server completely
→ Clear browser localStorage: `localStorage.clear()`

### "Row Level Security policy violation"
→ User IDs must match exactly between auth.users and public.users
→ Check user role is correct in users table
→ If still issues, can temporarily disable RLS:
  ```sql
  ALTER TABLE users DISABLE ROW LEVEL SECURITY;
  ```

---

## 📞 Ready to Update?

**Just paste your anon key here and I'll:**
1. ✅ Update your .env.local file
2. ✅ Restart your dev server
3. ✅ Verify the connection

**Or follow the manual steps above!**

Either way, you're just a few minutes away from being on the new Supabase instance! 🚀
