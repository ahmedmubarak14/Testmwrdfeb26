# Supabase Migration Guide - Step by Step

## 🎯 Overview

This guide will help you:
1. Create a new Supabase project
2. Set up the database schema
3. Update your app configuration
4. Test the connection
5. Migrate from mock mode to database mode

---

## 📋 **STEP 1: Create New Supabase Project**

### 1.1 Go to Supabase Dashboard
```
https://supabase.com/dashboard
```

### 1.2 Create New Project
1. Click **"New Project"**
2. Choose your organization
3. Fill in project details:
   - **Name**: `mwrd-marketplace` (or your preferred name)
   - **Database Password**: Choose a strong password (SAVE THIS!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is fine to start

4. Click **"Create new project"**
5. Wait 2-3 minutes for setup to complete

### 1.3 Get Your Credentials

Once the project is ready:

1. Go to **Settings** (gear icon in sidebar)
2. Click **API** in the settings menu
3. You'll see:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)

**COPY BOTH OF THESE - YOU'LL NEED THEM!**

---

## 📋 **STEP 2: Set Up Database Schema**

### 2.1 Go to SQL Editor

1. In your Supabase dashboard, click **SQL Editor** (in sidebar)
2. Click **"New Query"**

### 2.2 Run the Schema Creation Script

Copy and paste this entire script, then click **RUN**:

```sql
-- ============================================
-- MWRD B2B Marketplace Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('CLIENT', 'SUPPLIER', 'ADMIN')),
  company_name TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  public_id TEXT UNIQUE,
  rating DECIMAL(2,1),
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'APPROVED', 'REJECTED', 'DEACTIVATED', 'REQUIRES_ATTENTION')),
  kyc_status TEXT DEFAULT 'INCOMPLETE' CHECK (kyc_status IN ('INCOMPLETE', 'IN_REVIEW', 'VERIFIED', 'REJECTED')),
  date_joined TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-generate public_id on insert
CREATE OR REPLACE FUNCTION generate_public_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'CLIENT' THEN
    NEW.public_id := 'Client-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  ELSIF NEW.role = 'SUPPLIER' THEN
    NEW.public_id := 'Supplier-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_public_id
  BEFORE INSERT ON users
  FOR EACH ROW
  WHEN (NEW.public_id IS NULL)
  EXECUTE FUNCTION generate_public_id();

-- ============================================
-- PRODUCTS TABLE
-- ============================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  image TEXT,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  cost_price DECIMAL(10,2) NOT NULL,
  sku TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RFQS (Request for Quotes) TABLE
-- ============================================
CREATE TABLE rfqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  items JSONB NOT NULL, -- Array of {productId, quantity, notes}
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'QUOTED', 'CLOSED')),
  date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- QUOTES TABLE
-- ============================================
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_price DECIMAL(10,2) NOT NULL,
  lead_time TEXT NOT NULL,
  margin_percent DECIMAL(5,2),
  final_price DECIMAL(10,2),
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ORDERS TABLE
-- ============================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'In Transit' CHECK (status IN ('In Transit', 'Delivered', 'Cancelled')),
  date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES for Performance
-- ============================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_products_supplier ON products(supplier_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_rfqs_client ON rfqs(client_id);
CREATE INDEX idx_rfqs_status ON rfqs(status);
CREATE INDEX idx_quotes_rfq ON quotes(rfq_id);
CREATE INDEX idx_quotes_supplier ON quotes(supplier_id);
CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_supplier ON orders(supplier_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Admins can view all users
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Products: Approved products visible to all authenticated users
CREATE POLICY "Approved products visible to authenticated"
  ON products FOR SELECT
  USING (status = 'APPROVED' OR supplier_id = auth.uid());

-- Suppliers can manage their own products
CREATE POLICY "Suppliers can manage own products"
  ON products FOR ALL
  USING (supplier_id = auth.uid());

-- RFQs: Clients can manage their own
CREATE POLICY "Clients can manage own RFQs"
  ON rfqs FOR ALL
  USING (client_id = auth.uid());

-- Suppliers can view RFQs to quote on
CREATE POLICY "Suppliers can view RFQs"
  ON rfqs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'SUPPLIER'
    )
  );

-- Quotes: Suppliers can manage their own
CREATE POLICY "Suppliers can manage own quotes"
  ON quotes FOR ALL
  USING (supplier_id = auth.uid());

-- Clients can view quotes for their RFQs
CREATE POLICY "Clients can view quotes for their RFQs"
  ON quotes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rfqs
      WHERE rfqs.id = quotes.rfq_id AND rfqs.client_id = auth.uid()
    )
  );

-- Admins can manage all quotes
CREATE POLICY "Admins can manage all quotes"
  ON quotes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Orders: Clients and suppliers can view their own
CREATE POLICY "Clients can view own orders"
  ON orders FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "Suppliers can view own orders"
  ON orders FOR SELECT
  USING (supplier_id = auth.uid());

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for all tables
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rfqs_updated_at
  BEFORE UPDATE ON rfqs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT 'Database schema created successfully!' AS message;
```

You should see: **"Database schema created successfully!"**

---

## 📋 **STEP 3: Insert Demo Data (Optional)**

If you want to test with the same demo data from mock mode:

```sql
-- Insert demo users (passwords will be set via Supabase Auth)
INSERT INTO users (email, name, role, company_name, verified, public_id, status, kyc_status, rating) VALUES
('client+demo@example.com', 'John Client', 'CLIENT', 'Tech Solutions Ltd', true, 'Client-8492', 'ACTIVE', 'VERIFIED', NULL),
('supplier+demo@example.com', 'Sarah Supplier', 'SUPPLIER', 'Global Parts Inc', true, 'Supplier-3921', 'APPROVED', 'VERIFIED', 4.8),
('admin+demo@example.com', 'Admin Alice', 'ADMIN', 'mwrd HQ', true, NULL, 'ACTIVE', 'VERIFIED', NULL);

-- You'll need to create these users via Supabase Auth separately
SELECT 'Demo users inserted!' AS message;
```

**Note**: You'll need to create these auth users through Supabase Auth UI or API separately.

---

## 📋 **STEP 4: Update App Configuration**

### 4.1 Update .env.local

In your project, edit `/home/user/MARKETPLACE---MWRD/.env.local`:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key_here

# Optional: Gemini API Key for AI features
# GEMINI_API_KEY=your_gemini_api_key_here

# Moyasar Payment Gateway Configuration
# VITE_MOYASAR_API_KEY=your_moyasar_secret_key_here
# VITE_MOYASAR_PUBLISHABLE_KEY=your_moyasar_publishable_key_here
```

**Replace:**
- `YOUR_PROJECT_ID` with your actual project ID
- `your_anon_public_key_here` with your actual anon key

### 4.2 Restart Dev Server

```bash
# Stop current server (Ctrl+C if running in terminal)
# Or kill the process

# Start fresh
npm run dev
```

You should see:
```
╔══════════════════════════════════════╗
║   MWRD Application Configuration   ║
╚══════════════════════════════════════╝
🔧 Mode: SUPABASE
📊 Database: ENABLED (Supabase)
```

---

## 📋 **STEP 5: Create Test Users in Supabase**

### 5.1 Via Supabase Dashboard

1. Go to **Authentication** in sidebar
2. Click **Users** tab
3. Click **"Add user"** → **"Create new user"**
4. Create each demo user:

**User 1 - Client:**
```
Email: client+demo@example.com
Password: CHANGE_ME_CLIENT_PASSWORD
Auto Confirm User: YES
```

**User 2 - Supplier:**
```
Email: supplier+demo@example.com
Password: CHANGE_ME_SUPPLIER_PASSWORD
Auto Confirm User: YES
```

**User 3 - Admin:**
```
Email: admin+demo@example.com
Password: CHANGE_ME_ADMIN_PASSWORD
Auto Confirm User: YES
```

### 5.2 Link Auth Users to Database Users

After creating auth users, run this SQL to link them:

```sql
-- This ensures auth.uid() matches the users table
-- You'll need to replace the UUIDs with actual auth user IDs

-- Get auth user IDs first:
SELECT id, email FROM auth.users;

-- Then update your users table (replace the UUIDs):
UPDATE users SET id = 'auth-user-id-from-above' WHERE email = 'client+demo@example.com';
UPDATE users SET id = 'auth-user-id-from-above' WHERE email = 'supplier+demo@example.com';
UPDATE users SET id = 'auth-user-id-from-above' WHERE email = 'admin+demo@example.com';
```

---

## 📋 **STEP 6: Test the Connection**

### 6.1 Check Console

When you load the app, you should see:
```
🔧 Mode: SUPABASE
📊 Database: ENABLED (Supabase)
🔄 Initializing authentication...
   Checking for existing Supabase session...
```

### 6.2 Test Login

1. Go to http://localhost:3000/
2. Click "Get Started"
3. Login with: `client+demo@example.com` / `CHANGE_ME_CLIENT_PASSWORD`
4. You should see database connection in console
5. User profile loaded from database

---

## 🔧 **Troubleshooting**

### Issue: "Invalid API key"
- Double-check you copied the **anon public** key (not the service role key)
- Make sure there are no extra spaces in .env.local
- Restart dev server after changing .env.local

### Issue: "User not found"
- Make sure you created the user in Supabase Auth
- Check that the email matches exactly
- Verify user is confirmed (green checkmark in Auth > Users)

### Issue: "Row Level Security policy violation"
- The RLS policies might be too restrictive
- You can temporarily disable RLS for testing:
  ```sql
  ALTER TABLE users DISABLE ROW LEVEL SECURITY;
  ```
- Or adjust the policies as needed

### Issue: Console still shows "Mode: MOCK"
- Make sure .env.local has uncommented VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
- Restart the dev server completely
- Clear browser cache and localStorage

---

## 📚 **Next Steps After Migration**

1. **Test all features** with database backend
2. **Migrate mock data** if needed (products, RFQs, etc.)
3. **Set up email templates** in Supabase Auth
4. **Configure storage** for product images
5. **Set up backup strategy**
6. **Configure production environment variables**

---

## 🎯 **Quick Reference**

### Supabase Dashboard URLs
- **Main Dashboard**: https://supabase.com/dashboard
- **SQL Editor**: https://supabase.com/dashboard/project/YOUR_PROJECT/sql
- **Auth Users**: https://supabase.com/dashboard/project/YOUR_PROJECT/auth/users
- **Table Editor**: https://supabase.com/dashboard/project/YOUR_PROJECT/editor

### Important Commands
```bash
# Restart dev server
npm run dev

# Check environment variables
cat .env.local

# Clear localStorage (in browser console)
localStorage.clear()
```

---

## ✅ **Verification Checklist**

- [ ] New Supabase project created
- [ ] Database schema installed (all tables)
- [ ] .env.local updated with new credentials
- [ ] Dev server restarted
- [ ] Console shows "Mode: SUPABASE"
- [ ] Demo users created in Auth
- [ ] Users table linked to auth users
- [ ] Login works with database
- [ ] User data loads from database
- [ ] All portals accessible

---

**Once you complete these steps, your app will be running on the new Supabase instance!**

Let me know when you:
1. Create the new project and get your credentials
2. Need help with any of the steps
3. Are ready to test the connection
