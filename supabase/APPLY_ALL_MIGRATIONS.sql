-- ============================================================================
-- MWRD SUPABASE DATABASE - COMPLETE MIGRATION SCRIPT
-- Generated: 2026-02-07
-- Purpose: Apply all 30 migrations in strict filename order
-- ============================================================================
-- 
-- INSTRUCTIONS:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard
-- 2. Navigate to: SQL Editor
-- 3. Create a new query
-- 4. Copy and paste this ENTIRE file
-- 5. Click "Run" to execute all migrations
-- 
-- IMPORTANT:
-- - This script is idempotent (safe to run multiple times)
-- - Migrations include IF EXISTS / IF NOT EXISTS checks
-- - Review the output for any errors
-- 
-- ============================================================================

-- Migration tracking table (optional, for audit trail)
CREATE TABLE IF NOT EXISTS public._migration_log (
  id SERIAL PRIMARY KEY,
  migration_name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- MIGRATION: 001_initial_schema.sql
-- ============================================================================

-- MWRD Marketplace Database Schema
-- Initial migration: Create all tables, enums, and functions

-- ============================================================================
-- ENUMS (with idempotent checks)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('GUEST', 'CLIENT', 'SUPPLIER', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'REQUIRES_ATTENTION', 'DEACTIVATED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('VERIFIED', 'IN_REVIEW', 'REJECTED', 'INCOMPLETE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE rfq_status AS ENUM ('OPEN', 'QUOTED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('PENDING_ADMIN', 'SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('In Transit', 'Delivered', 'Cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to generate public IDs for anonymization
CREATE OR REPLACE FUNCTION generate_public_id(prefix TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN prefix || '-' || floor(random() * 9000 + 1000)::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'CLIENT',
  company_name TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  public_id TEXT UNIQUE,
  rating DECIMAL(3, 2) CHECK (rating >= 0 AND rating <= 5),
  status user_status DEFAULT 'PENDING',
  kyc_status kyc_status DEFAULT 'INCOMPLETE',
  date_joined DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  image TEXT NOT NULL,
  status product_status NOT NULL DEFAULT 'PENDING',
  cost_price DECIMAL(10, 2),
  sku TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RFQs (Request for Quote) table
CREATE TABLE rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status rfq_status NOT NULL DEFAULT 'OPEN',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RFQ Items table (line items for each RFQ)
CREATE TABLE rfq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quotes table
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_price DECIMAL(10, 2) NOT NULL CHECK (supplier_price > 0),
  lead_time TEXT NOT NULL,
  margin_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  final_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status quote_status NOT NULL DEFAULT 'PENDING_ADMIN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rfq_id, supplier_id)
);

-- Orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  status order_status NOT NULL DEFAULT 'In Transit',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Margin Settings table (for admin to configure margins)
CREATE TABLE margin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT,
  margin_percent DECIMAL(5, 2) NOT NULL CHECK (margin_percent >= 0),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_public_id ON users(public_id);

CREATE INDEX idx_products_supplier_id ON products(supplier_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_name ON products(name);

CREATE INDEX idx_rfqs_client_id ON rfqs(client_id);
CREATE INDEX idx_rfqs_status ON rfqs(status);
CREATE INDEX idx_rfqs_date ON rfqs(date);

CREATE INDEX idx_rfq_items_rfq_id ON rfq_items(rfq_id);
CREATE INDEX idx_rfq_items_product_id ON rfq_items(product_id);

CREATE INDEX idx_quotes_rfq_id ON quotes(rfq_id);
CREATE INDEX idx_quotes_supplier_id ON quotes(supplier_id);
CREATE INDEX idx_quotes_status ON quotes(status);

CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_supplier_id ON orders(supplier_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(date);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rfqs_updated_at
  BEFORE UPDATE ON rfqs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_margin_settings_updated_at
  BEFORE UPDATE ON margin_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- AUTO-GENERATE PUBLIC ID ON USER INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_generate_public_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_id IS NULL THEN
    CASE NEW.role
      WHEN 'CLIENT' THEN NEW.public_id := generate_public_id('Client');
      WHEN 'SUPPLIER' THEN NEW.public_id := generate_public_id('Supplier');
      WHEN 'ADMIN' THEN NEW.public_id := generate_public_id('Admin');
      ELSE NEW.public_id := generate_public_id('User');
    END CASE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_public_id_trigger
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_public_id();

-- ============================================================================
-- AUTO-CALCULATE FINAL PRICE ON QUOTE UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_final_price()
RETURNS TRIGGER AS $$
BEGIN
  NEW.final_price := NEW.supplier_price * (1 + NEW.margin_percent / 100);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_quote_final_price
  BEFORE INSERT OR UPDATE OF supplier_price, margin_percent ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION calculate_final_price();

-- ============================================================================
-- INSERT DEFAULT MARGIN SETTING
-- ============================================================================

INSERT INTO margin_settings (category, margin_percent, is_default)
VALUES (NULL, 15.00, TRUE);

INSERT INTO public._migration_log (migration_name) VALUES ('001_initial_schema.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 002_row_level_security.sql
-- ============================================================================

-- MWRD Marketplace Row Level Security Policies
-- This migration enables RLS and defines access policies

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTION: Get current user's role
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_text TEXT;
BEGIN
  v_role_text := COALESCE(
    auth.jwt() ->> 'user_role',
    auth.jwt() -> 'app_metadata' ->> 'user_role'
  );

  IF v_role_text IS NULL OR v_role_text = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_role_text::user_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- USERS POLICIES
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can view all users
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Admins can update all users
CREATE POLICY "Admins can update all users"
  ON users FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- Admins can delete users
CREATE POLICY "Admins can delete users"
  ON users FOR DELETE
  USING (get_user_role() = 'ADMIN');

-- Allow insert during registration (handled by trigger)
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- PRODUCTS POLICIES
-- ============================================================================

-- Everyone can view approved products
CREATE POLICY "Anyone can view approved products"
  ON products FOR SELECT
  USING (status = 'APPROVED');

-- Suppliers can view their own products (any status)
CREATE POLICY "Suppliers can view own products"
  ON products FOR SELECT
  USING (auth.uid() = supplier_id);

-- Suppliers can create products
CREATE POLICY "Suppliers can create products"
  ON products FOR INSERT
  WITH CHECK (
    auth.uid() = supplier_id
    AND get_user_role() = 'SUPPLIER'
  );

-- Suppliers can update their own products
CREATE POLICY "Suppliers can update own products"
  ON products FOR UPDATE
  USING (auth.uid() = supplier_id)
  WITH CHECK (auth.uid() = supplier_id);

-- Suppliers can delete their own pending products
CREATE POLICY "Suppliers can delete own pending products"
  ON products FOR DELETE
  USING (
    auth.uid() = supplier_id
    AND status = 'PENDING'
  );

-- Admins can view all products
CREATE POLICY "Admins can view all products"
  ON products FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Admins can update all products (for approval)
CREATE POLICY "Admins can update all products"
  ON products FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- Admins can delete any product
CREATE POLICY "Admins can delete any product"
  ON products FOR DELETE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- RFQS POLICIES
-- ============================================================================

-- Clients can view their own RFQs
CREATE POLICY "Clients can view own RFQs"
  ON rfqs FOR SELECT
  USING (auth.uid() = client_id);

-- Clients can create RFQs
CREATE POLICY "Clients can create RFQs"
  ON rfqs FOR INSERT
  WITH CHECK (
    auth.uid() = client_id
    AND get_user_role() = 'CLIENT'
  );

-- Clients can update their own open RFQs
CREATE POLICY "Clients can update own open RFQs"
  ON rfqs FOR UPDATE
  USING (
    auth.uid() = client_id
    AND status = 'OPEN'
  );

-- Suppliers can view RFQs that contain their products
CREATE POLICY "Suppliers can view relevant RFQs"
  ON rfqs FOR SELECT
  USING (
    get_user_role() = 'SUPPLIER'
    AND EXISTS (
      SELECT 1 FROM rfq_items ri
      JOIN products p ON p.id = ri.product_id
      WHERE ri.rfq_id = rfqs.id
      AND p.supplier_id = auth.uid()
    )
  );

-- Admins can view all RFQs
CREATE POLICY "Admins can view all RFQs"
  ON rfqs FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Admins can update all RFQs
CREATE POLICY "Admins can update all RFQs"
  ON rfqs FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- RFQ ITEMS POLICIES
-- ============================================================================

-- Clients can view their own RFQ items
CREATE POLICY "Clients can view own RFQ items"
  ON rfq_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rfqs WHERE rfqs.id = rfq_items.rfq_id AND rfqs.client_id = auth.uid()
    )
  );

-- Clients can create RFQ items for their RFQs
CREATE POLICY "Clients can create RFQ items"
  ON rfq_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rfqs WHERE rfqs.id = rfq_items.rfq_id AND rfqs.client_id = auth.uid()
    )
  );

-- Suppliers can view RFQ items for their products
CREATE POLICY "Suppliers can view relevant RFQ items"
  ON rfq_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = rfq_items.product_id AND p.supplier_id = auth.uid()
    )
  );

-- Admins can view all RFQ items
CREATE POLICY "Admins can view all RFQ items"
  ON rfq_items FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- QUOTES POLICIES
-- ============================================================================

-- Suppliers can view their own quotes
CREATE POLICY "Suppliers can view own quotes"
  ON quotes FOR SELECT
  USING (auth.uid() = supplier_id);

-- Suppliers can create quotes for RFQs containing their products
CREATE POLICY "Suppliers can create quotes"
  ON quotes FOR INSERT
  WITH CHECK (
    auth.uid() = supplier_id
    AND get_user_role() = 'SUPPLIER'
    AND EXISTS (
      SELECT 1 FROM rfq_items ri
      JOIN products p ON p.id = ri.product_id
      WHERE ri.rfq_id = quotes.rfq_id
      AND p.supplier_id = auth.uid()
    )
  );

-- Suppliers can update their pending quotes
CREATE POLICY "Suppliers can update pending quotes"
  ON quotes FOR UPDATE
  USING (
    auth.uid() = supplier_id
    AND status = 'PENDING_ADMIN'
  );

-- Clients can view quotes sent to them
CREATE POLICY "Clients can view quotes for their RFQs"
  ON quotes FOR SELECT
  USING (
    status IN ('SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED')
    AND EXISTS (
      SELECT 1 FROM rfqs WHERE rfqs.id = quotes.rfq_id AND rfqs.client_id = auth.uid()
    )
  );

-- Clients can update quote status (accept/reject)
CREATE POLICY "Clients can accept/reject quotes"
  ON quotes FOR UPDATE
  USING (
    status = 'SENT_TO_CLIENT'
    AND EXISTS (
      SELECT 1 FROM rfqs WHERE rfqs.id = quotes.rfq_id AND rfqs.client_id = auth.uid()
    )
  );

-- Admins can view all quotes
CREATE POLICY "Admins can view all quotes"
  ON quotes FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Admins can update all quotes (set margins, approve)
CREATE POLICY "Admins can update all quotes"
  ON quotes FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- ORDERS POLICIES
-- ============================================================================

-- Clients can view their own orders
CREATE POLICY "Clients can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = client_id);

-- Suppliers can view orders they're fulfilling
CREATE POLICY "Suppliers can view fulfillment orders"
  ON orders FOR SELECT
  USING (auth.uid() = supplier_id);

-- Orders are created by system (after quote acceptance)
-- Only admins can manually create orders
CREATE POLICY "Admins can create orders"
  ON orders FOR INSERT
  WITH CHECK (get_user_role() = 'ADMIN');

-- Suppliers can update order status
CREATE POLICY "Suppliers can update order status"
  ON orders FOR UPDATE
  USING (auth.uid() = supplier_id);

-- Admins can view all orders
CREATE POLICY "Admins can view all orders"
  ON orders FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Admins can update all orders
CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- MARGIN SETTINGS POLICIES
-- ============================================================================

-- Only admins can view margin settings
CREATE POLICY "Admins can view margin settings"
  ON margin_settings FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Only admins can create margin settings
CREATE POLICY "Admins can create margin settings"
  ON margin_settings FOR INSERT
  WITH CHECK (get_user_role() = 'ADMIN');

-- Only admins can update margin settings
CREATE POLICY "Admins can update margin settings"
  ON margin_settings FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- Only admins can delete margin settings
CREATE POLICY "Admins can delete margin settings"
  ON margin_settings FOR DELETE
  USING (get_user_role() = 'ADMIN');

INSERT INTO public._migration_log (migration_name) VALUES ('002_row_level_security.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 003_seed_data.sql
-- ============================================================================

-- MWRD Marketplace Seed Data
-- This migration inserts initial demo data for testing
-- NOTE: Run this AFTER creating users through Supabase Auth

-- ============================================================================
-- CATEGORIES FOR MARGIN SETTINGS
-- ============================================================================

INSERT INTO margin_settings (category, margin_percent, is_default)
VALUES
  ('Footwear', 12.00, FALSE),
  ('Electronics', 15.00, FALSE),
  ('Furniture', 10.00, FALSE),
  ('Accessories', 18.00, FALSE),
  ('Kitchenware', 14.00, FALSE),
  ('Industrial', 8.00, FALSE),
  ('Safety Gear', 20.00, FALSE),
  ('Electrical', 12.00, FALSE)
ON CONFLICT (category) DO NOTHING;

-- ============================================================================
-- NOTE: User creation must be done through Supabase Auth
-- The following is a reference for the user structure
-- ============================================================================

/*
After creating users through Supabase Auth (signUp), insert their profiles:

Example for creating a test admin user:
1. Create user in Supabase Auth
2. Insert into users table:

INSERT INTO users (id, email, name, role, company_name, verified, status, kyc_status)
VALUES (
  'auth-user-id-here',
  'admin+demo@example.com',
  'Admin Alice',
  'ADMIN',
  'MWRD HQ',
  TRUE,
  'ACTIVE',
  'VERIFIED'
);
*/

-- ============================================================================
-- HELPER FUNCTION: Create demo user profile (call after Auth signup)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_user_profile(
  p_user_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_role user_role,
  p_company_name TEXT,
  p_verified BOOLEAN DEFAULT FALSE,
  p_status user_status DEFAULT 'PENDING',
  p_kyc_status kyc_status DEFAULT 'INCOMPLETE'
)
RETURNS users
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_user users;
BEGIN
  INSERT INTO users (id, email, name, role, company_name, verified, status, kyc_status)
  VALUES (p_user_id, p_email, p_name, p_role, p_company_name, p_verified, p_status, p_kyc_status)
  RETURNING * INTO new_user;

  RETURN new_user;
END;
$$ LANGUAGE plpgsql;

INSERT INTO public._migration_log (migration_name) VALUES ('003_seed_data.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 004_auth_trigger.sql
-- ============================================================================

-- Auto-create user profile when a new user signs up via Supabase Auth
-- This trigger creates a profile in the users table when auth.users gets a new entry

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    name,
    role,
    company_name,
    verified,
    status,
    kyc_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'CLIENT'),
    COALESCE(NEW.raw_user_meta_data->>'companyName', 'Company'),
    FALSE,
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'CLIENT') = 'SUPPLIER' THEN 'PENDING'::user_status
      ELSE 'ACTIVE'::user_status
    END,
    'INCOMPLETE'::kyc_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function on new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON public.users TO supabase_auth_admin;

INSERT INTO public._migration_log (migration_name) VALUES ('004_auth_trigger.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 005_payment_tables.sql
-- ============================================================================

-- ============================================================================
-- MWRD MARKETPLACE - PAYMENT SYSTEM (MOYASAR INTEGRATION)
-- ============================================================================

-- Payment status enum (idempotent)
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'PENDING',
    'AUTHORIZED',
    'CAPTURED',
    'PAID',
    'FAILED',
    'REFUNDED',
    'PARTIALLY_REFUNDED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Payment method enum (idempotent)
DO $$ BEGIN
  CREATE TYPE payment_method_type AS ENUM (
    'CREDITCARD',  -- Visa/Mastercard
    'MADA',        -- Saudi MADA cards
    'APPLEPAY',    -- Apple Pay
    'STC_PAY',     -- STC Pay
    'BANK_TRANSFER' -- Direct bank transfer
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Invoice status enum (idempotent)
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM (
    'DRAFT',
    'SENT',
    'PAID',
    'OVERDUE',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Moyasar details
  moyasar_payment_id TEXT UNIQUE,  -- Moyasar's payment ID
  moyasar_transaction_url TEXT,

  -- Payment information
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'SAR',
  payment_method payment_method_type NOT NULL,
  status payment_status NOT NULL DEFAULT 'PENDING',

  -- Card details (if applicable, stored securely)
  card_last_four TEXT,
  card_brand TEXT,

  -- Metadata
  description TEXT,
  callback_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Status tracking
  authorized_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,

  -- Error handling
  failure_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INVOICES TABLE
-- ============================================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Invoice details
  invoice_number TEXT UNIQUE NOT NULL,

  -- Financial details
  subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
  tax_percent DECIMAL(5, 2) DEFAULT 15.00,  -- Saudi VAT is 15%
  tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount > 0),

  -- Status
  status invoice_status NOT NULL DEFAULT 'DRAFT',

  -- Dates
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  paid_date DATE,

  -- Notes
  notes TEXT,
  terms TEXT,

  -- PDF storage (if generated)
  pdf_url TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- REFUNDS TABLE
-- ============================================================================
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Moyasar details
  moyasar_refund_id TEXT UNIQUE,

  -- Refund information
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status payment_status NOT NULL DEFAULT 'PENDING',

  -- Admin who processed refund
  processed_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Payments indexes
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_client_id ON payments(client_id);
CREATE INDEX idx_payments_moyasar_id ON payments(moyasar_payment_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Invoices indexes
CREATE INDEX idx_invoices_order_id ON invoices(order_id);
CREATE INDEX idx_invoices_payment_id ON invoices(payment_id);
CREATE INDEX idx_invoices_client_id ON invoices(client_id);
CREATE INDEX idx_invoices_supplier_id ON invoices(supplier_id);
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

-- Refunds indexes
CREATE INDEX idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX idx_refunds_order_id ON refunds(order_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate invoice number (format: INV-YYYY-NNNN)
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  invoice_num TEXT;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');

  -- Get the next sequence number for this year
  SELECT COUNT(*) + 1 INTO sequence_num
  FROM invoices
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE);

  invoice_num := 'INV-' || year_part || '-' || LPAD(sequence_num::TEXT, 4, '0');

  RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;

-- Auto-generate invoice number on insert
CREATE OR REPLACE FUNCTION auto_generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_invoice_number_trigger
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_invoice_number();

-- Auto-calculate invoice totals
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate tax amount
  NEW.tax_amount := NEW.subtotal * (NEW.tax_percent / 100);

  -- Calculate total
  NEW.total_amount := NEW.subtotal + NEW.tax_amount - COALESCE(NEW.discount_amount, 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_invoice_totals_trigger
  BEFORE INSERT OR UPDATE OF subtotal, tax_percent, discount_amount ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION calculate_invoice_totals();

-- Update order status when payment is completed
CREATE OR REPLACE FUNCTION update_order_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'PAID' AND OLD.status != 'PAID' THEN
    -- Update payment timestamp
    NEW.paid_at := NOW();

    -- You might want to update order status here
    -- UPDATE orders SET status = 'PROCESSING' WHERE id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_on_payment_trigger
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_order_on_payment();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- PAYMENTS POLICIES
CREATE POLICY "Clients can view own payments" ON payments
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Clients can create payments" ON payments
  FOR INSERT WITH CHECK (auth.uid() = client_id AND get_user_role() = 'CLIENT');

CREATE POLICY "Admins can view all payments" ON payments
  FOR SELECT USING (get_user_role() = 'ADMIN');

CREATE POLICY "Admins can update all payments" ON payments
  FOR UPDATE USING (get_user_role() = 'ADMIN');

CREATE POLICY "System can update payments" ON payments
  FOR UPDATE USING (get_user_role() = 'ADMIN');  -- Keep direct updates admin-only

-- INVOICES POLICIES
CREATE POLICY "Clients can view own invoices" ON invoices
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Suppliers can view their invoices" ON invoices
  FOR SELECT USING (auth.uid() = supplier_id);

CREATE POLICY "Admins can manage all invoices" ON invoices
  FOR ALL USING (get_user_role() = 'ADMIN');

-- REFUNDS POLICIES
CREATE POLICY "Clients can view own refunds" ON refunds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = refunds.payment_id AND p.client_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage refunds" ON refunds
  FOR ALL USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

INSERT INTO public._migration_log (migration_name) VALUES ('005_payment_tables.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 006_bank_transfer_payment.sql
-- ============================================================================

-- ============================================================================
-- MWRD MARKETPLACE - BANK TRANSFER PAYMENT SYSTEM (PHASE ONE)
-- ============================================================================

-- Add PENDING_PAYMENT to order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';

-- ============================================================================
-- BANK DETAILS TABLE (MWRD Company Bank Account)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bank information
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  iban TEXT,
  swift_code TEXT,
  branch_name TEXT,
  branch_code TEXT,

  -- Additional info
  currency TEXT NOT NULL DEFAULT 'SAR',
  notes TEXT,

  -- Active status (only one should be active at a time)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active bank detail at a time
CREATE UNIQUE INDEX idx_bank_details_active ON bank_details(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- UPDATE ORDERS TABLE - Add Payment Tracking
-- ============================================================================

-- Add payment tracking columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payment_reference TEXT,
ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_notes TEXT,
ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT;

-- Add index for payment tracking
CREATE INDEX IF NOT EXISTS idx_orders_payment_confirmed ON orders(payment_confirmed_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_reference ON orders(payment_reference);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_bank_details_updated_at
  BEFORE UPDATE ON bank_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE bank_details ENABLE ROW LEVEL SECURITY;

-- Clients can view active bank details
CREATE POLICY "Clients can view active bank details" ON bank_details
  FOR SELECT USING (is_active = TRUE);

-- Admins can manage all bank details
CREATE POLICY "Admins can view all bank details" ON bank_details
  FOR SELECT USING (get_user_role() = 'ADMIN');

CREATE POLICY "Admins can insert bank details" ON bank_details
  FOR INSERT WITH CHECK (get_user_role() = 'ADMIN');

CREATE POLICY "Admins can update bank details" ON bank_details
  FOR UPDATE USING (get_user_role() = 'ADMIN');

CREATE POLICY "Admins can delete bank details" ON bank_details
  FOR DELETE USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to mark order as paid
CREATE OR REPLACE FUNCTION mark_order_as_paid(
  p_order_id UUID,
  p_admin_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS orders
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order orders;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Verify admin role
  IF (SELECT role FROM users WHERE id = v_caller) != 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can confirm payments';
  END IF;

  -- Update order
  UPDATE orders
  SET
    status = 'IN_TRANSIT',
    payment_confirmed_at = NOW(),
    payment_confirmed_by = v_caller,
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_notes = COALESCE(p_payment_notes, payment_notes),
    updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- Update related invoice status
  UPDATE invoices
  SET
    status = 'PAID',
    paid_date = CURRENT_DATE
  WHERE order_id = p_order_id;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

-- Function to get active bank details
CREATE OR REPLACE FUNCTION get_active_bank_details()
RETURNS bank_details
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bank_details bank_details;
BEGIN
  SELECT * INTO v_bank_details
  FROM bank_details
  WHERE is_active = TRUE
  LIMIT 1;

  RETURN v_bank_details;
END;
$$ LANGUAGE plpgsql;

-- Function to set active bank details (deactivates others)
CREATE OR REPLACE FUNCTION set_active_bank_details(p_bank_details_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Deactivate all
  UPDATE bank_details SET is_active = FALSE;

  -- Activate selected
  UPDATE bank_details SET is_active = TRUE WHERE id = p_bank_details_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED PLACEHOLDER BANK DETAILS
-- SECURITY: Do not commit real bank account information to source control.
-- Update these values via admin UI in each environment.
-- ============================================================================

INSERT INTO bank_details (
  bank_name,
  account_name,
  account_number,
  iban,
  swift_code,
  currency,
  notes,
  is_active
) VALUES (
  'REPLACE_WITH_BANK_NAME',
  'REPLACE_WITH_ACCOUNT_NAME',
  'REPLACE_WITH_ACCOUNT_NUMBER',
  'REPLACE_WITH_IBAN',
  'REPLACE_WITH_SWIFT',
  'SAR',
  'Replace this placeholder record with real bank details in admin settings.',
  FALSE
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'Bank Transfer Payment System Setup Complete!' as message;

SELECT * FROM bank_details WHERE is_active = TRUE;

INSERT INTO public._migration_log (migration_name) VALUES ('006_bank_transfer_payment.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 007_retail_pricing.sql
-- ============================================================================

-- ============================================================================
-- MWRD MARKETPLACE - RETAIL PRICING WITH AUTO-MARGIN CALCULATION
-- ============================================================================

-- Add retail_price field to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS retail_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS margin_percent DECIMAL(5, 2) DEFAULT 15.00;

-- ============================================================================
-- AUTO-CALCULATE RETAIL PRICE TRIGGER
-- ============================================================================

-- Function to calculate retail price based on cost price and margin
CREATE OR REPLACE FUNCTION calculate_retail_price()
RETURNS TRIGGER AS $$
DECLARE
  v_margin_percent DECIMAL(5, 2);
BEGIN
  -- Get margin for this product's category, or use default
  SELECT margin_percent INTO v_margin_percent
  FROM margin_settings
  WHERE category = NEW.category OR (category IS NULL AND is_default = TRUE)
  ORDER BY category NULLS LAST
  LIMIT 1;

  -- If no margin found, use 15% default
  IF v_margin_percent IS NULL THEN
    v_margin_percent := 15.00;
  END IF;

  -- Store the margin used
  NEW.margin_percent := v_margin_percent;

  -- Calculate retail price if cost_price is set
  IF NEW.cost_price IS NOT NULL AND NEW.cost_price > 0 THEN
    NEW.retail_price := NEW.cost_price * (1 + v_margin_percent / 100);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate retail price
DROP TRIGGER IF EXISTS calculate_product_retail_price ON products;
CREATE TRIGGER calculate_product_retail_price
  BEFORE INSERT OR UPDATE OF cost_price, category ON products
  FOR EACH ROW
  EXECUTE FUNCTION calculate_retail_price();

-- ============================================================================
-- UPDATE EXISTING PRODUCTS WITH RETAIL PRICES
-- ============================================================================

-- Apply retail prices to all existing products
UPDATE products
SET cost_price = cost_price -- This triggers the calculation
WHERE cost_price IS NOT NULL;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get product retail price (with fallback)
CREATE OR REPLACE FUNCTION get_product_retail_price(p_product_id UUID)
RETURNS DECIMAL(10, 2) AS $$
DECLARE
  v_retail_price DECIMAL(10, 2);
BEGIN
  SELECT retail_price INTO v_retail_price
  FROM products
  WHERE id = p_product_id;

  RETURN COALESCE(v_retail_price, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to bulk update retail prices for a category
CREATE OR REPLACE FUNCTION update_category_retail_prices(p_category TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE products
  SET cost_price = cost_price -- Triggers recalculation
  WHERE category = p_category AND cost_price IS NOT NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update all retail prices (useful when margins change)
CREATE OR REPLACE FUNCTION refresh_all_retail_prices()
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE products
  SET cost_price = cost_price -- Triggers recalculation
  WHERE cost_price IS NOT NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY UPDATES
-- ============================================================================

-- Update RLS policies to hide cost_price from clients
-- Clients should only see retail_price

-- Drop existing policy if needed
DROP POLICY IF EXISTS "Anyone can view approved products" ON products;

-- Recreate with better column visibility
CREATE POLICY "Clients can view approved products (retail price only)" ON products
  FOR SELECT USING (
    status = 'APPROVED' AND
    (get_user_role() = 'CLIENT' OR get_user_role() IS NULL)
  );

-- Suppliers and admins can see all pricing
CREATE POLICY "Suppliers and admins can view all product details" ON products
  FOR SELECT USING (
    get_user_role() IN ('SUPPLIER', 'ADMIN')
  );

-- ============================================================================
-- CREATE VIEW FOR CLIENT PRODUCT DISPLAY
-- ============================================================================

-- View that shows only retail pricing to clients
CREATE OR REPLACE VIEW client_products AS
SELECT
  id,
  supplier_id,
  name,
  description,
  category,
  image,
  status,
  retail_price,
  margin_percent,
  sku,
  created_at,
  updated_at
FROM products
WHERE status = 'APPROVED';

-- Grant access to authenticated users
GRANT SELECT ON client_products TO authenticated;
GRANT SELECT ON client_products TO anon;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Show products with pricing
SELECT
  name,
  category,
  cost_price as "Cost (Hidden from Clients)",
  margin_percent as "Margin %",
  retail_price as "Retail Price (Client Sees)",
  ROUND(retail_price - cost_price, 2) as "MWRD Profit"
FROM products
WHERE cost_price IS NOT NULL
ORDER BY category, name
LIMIT 10;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

SELECT 'Retail Pricing System Setup Complete!' as message;

INSERT INTO public._migration_log (migration_name) VALUES ('007_retail_pricing.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 008_custom_item_requests.sql
-- ============================================================================

-- ============================================================================
-- MWRD MARKETPLACE - CUSTOM ITEM REQUESTS
-- Allow clients to request items not in the marketplace
-- ============================================================================


-- Custom request status enum (idempotent)
DO $$ BEGIN
  CREATE TYPE custom_request_status AS ENUM (
    'PENDING',        -- Submitted by client, awaiting admin review
    'UNDER_REVIEW',   -- Admin reviewing the request
    'ASSIGNED',       -- Assigned to supplier(s) for quoting
    'QUOTED',         -- Supplier provided quote
    'APPROVED',       -- Client approved quote, order created
    'REJECTED',       -- Request rejected
    'CANCELLED'       -- Client cancelled request
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Request priority enum (idempotent)
DO $$ BEGIN
  CREATE TYPE request_priority AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- CUSTOM ITEM REQUESTS TABLE
-- ============================================================================
CREATE TABLE custom_item_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Client who requested
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Request details
  item_name TEXT NOT NULL,
  description TEXT NOT NULL,
  specifications TEXT,
  category TEXT,

  -- Quantity and pricing
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  target_price DECIMAL(10, 2),  -- Client's budget/target price
  currency TEXT NOT NULL DEFAULT 'SAR',

  -- Additional info
  deadline DATE,  -- When client needs it by
  priority request_priority NOT NULL DEFAULT 'MEDIUM',
  reference_images TEXT[],  -- Array of image URLs
  attachment_urls TEXT[],   -- Documents, specs, etc.

  -- Status tracking
  status custom_request_status NOT NULL DEFAULT 'PENDING',

  -- Admin notes
  admin_notes TEXT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,  -- Assigned supplier
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- Admin who assigned

  -- Response
  supplier_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_custom_requests_client_id ON custom_item_requests(client_id);
CREATE INDEX idx_custom_requests_status ON custom_item_requests(status);
CREATE INDEX idx_custom_requests_assigned_to ON custom_item_requests(assigned_to);
CREATE INDEX idx_custom_requests_created_at ON custom_item_requests(created_at DESC);
CREATE INDEX idx_custom_requests_priority ON custom_item_requests(priority);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_custom_requests_updated_at
  BEFORE UPDATE ON custom_item_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update assigned_at when assigned
CREATE OR REPLACE FUNCTION update_assignment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND OLD.assigned_to IS NULL THEN
    NEW.assigned_at := NOW();
    NEW.status := 'ASSIGNED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_update_assignment
  BEFORE UPDATE OF assigned_to ON custom_item_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_assignment_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE custom_item_requests ENABLE ROW LEVEL SECURITY;

-- Clients can view own requests
CREATE POLICY "Clients can view own requests" ON custom_item_requests
  FOR SELECT USING (auth.uid() = client_id);

-- Clients can create requests
CREATE POLICY "Clients can create requests" ON custom_item_requests
  FOR INSERT WITH CHECK (auth.uid() = client_id AND get_user_role() = 'CLIENT');

-- Clients can update own pending requests
CREATE POLICY "Clients can update own pending requests" ON custom_item_requests
  FOR UPDATE USING (
    auth.uid() = client_id AND
    status IN ('PENDING', 'UNDER_REVIEW')
  );

-- Assigned suppliers can view their requests
CREATE POLICY "Suppliers can view assigned requests" ON custom_item_requests
  FOR SELECT USING (auth.uid() = assigned_to);

-- Admins can view all requests
CREATE POLICY "Admins can view all requests" ON custom_item_requests
  FOR SELECT USING (get_user_role() = 'ADMIN');

-- Admins can update all requests
CREATE POLICY "Admins can update all requests" ON custom_item_requests
  FOR UPDATE USING (get_user_role() = 'ADMIN');

-- Admins can delete requests
CREATE POLICY "Admins can delete requests" ON custom_item_requests
  FOR DELETE USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to assign request to supplier
CREATE OR REPLACE FUNCTION assign_custom_request(
  p_request_id UUID,
  p_supplier_id UUID,
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS custom_item_requests
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request custom_item_requests;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Verify admin role
  IF (SELECT role FROM users WHERE id = v_caller) != 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can assign requests';
  END IF;

  -- Verify supplier role
  IF (SELECT role FROM users WHERE id = p_supplier_id) != 'SUPPLIER' THEN
    RAISE EXCEPTION 'Can only assign to suppliers';
  END IF;

  -- Update request
  UPDATE custom_item_requests
  SET
    assigned_to = p_supplier_id,
    assigned_by = v_caller,
    admin_notes = COALESCE(p_notes, admin_notes),
    status = 'ASSIGNED',
    updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$ LANGUAGE plpgsql;

-- Function to get pending requests count for admin
CREATE OR REPLACE FUNCTION get_pending_requests_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM custom_item_requests
    WHERE status IN ('PENDING', 'UNDER_REVIEW')
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get client's request summary
CREATE OR REPLACE FUNCTION get_client_request_summary(p_client_id UUID)
RETURNS JSON AS $$
DECLARE
  v_summary JSON;
BEGIN
  SELECT json_build_object(
    'total', COUNT(*),
    'pending', COUNT(*) FILTER (WHERE status = 'PENDING'),
    'under_review', COUNT(*) FILTER (WHERE status = 'UNDER_REVIEW'),
    'assigned', COUNT(*) FILTER (WHERE status = 'ASSIGNED'),
    'quoted', COUNT(*) FILTER (WHERE status = 'QUOTED'),
    'approved', COUNT(*) FILTER (WHERE status = 'APPROVED')
  ) INTO v_summary
  FROM custom_item_requests
  WHERE client_id = p_client_id;

  RETURN v_summary;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'Custom Item Requests System Setup Complete!' as message;

-- Show custom request statuses
SELECT
  status,
  COUNT(*) as count
FROM custom_item_requests
GROUP BY status
ORDER BY status;

INSERT INTO public._migration_log (migration_name) VALUES ('008_custom_item_requests.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 009_mvp_refinements.sql
-- ============================================================================

-- ============================================================================
-- 009 MVP Refinements
-- Leads, Master Gallery, Financials, and Enhanced Workflow
-- ============================================================================

-- 1. Leads Table (For Onboarding Interest)
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  account_type TEXT NOT NULL CHECK (account_type IN ('client', 'supplier')),
  notes TEXT,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONTACTED', 'CONVERTED', 'REJECTED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  converted_user_id UUID REFERENCES users(id)
);

-- RLS for Leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'Admin full access to leads') THEN
        CREATE POLICY "Admin full access to leads" ON leads FOR ALL TO authenticated USING (
            EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'ADMIN')
        );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'Anyone can submit leads') THEN
        CREATE POLICY "Anyone can submit leads" ON leads FOR INSERT TO anon, authenticated WITH CHECK (true);
    END IF;
END $$;


-- 2. Master Products Gallery (Standard Items)
CREATE TABLE IF NOT EXISTS master_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  brand TEXT,
  model_number TEXT,
  specifications JSONB, -- Flexible specs (color, size, etc coverage)
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Master Products
ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'master_products' AND policyname = 'Admin full access master_products') THEN
        CREATE POLICY "Admin full access master_products" ON master_products FOR ALL TO authenticated USING (
            EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'ADMIN')
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'master_products' AND policyname = 'Suppliers/Clients view master_products') THEN
        CREATE POLICY "Suppliers/Clients view master_products" ON master_products FOR SELECT TO authenticated USING (true);
    END IF;
END $$;


-- 3. Supplier/Client Financials (Credit & Balance)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'credit_limit') THEN
        ALTER TABLE users ADD COLUMN credit_limit DECIMAL(12, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'current_balance') THEN
        ALTER TABLE users ADD COLUMN current_balance DECIMAL(12, 2) DEFAULT 0; -- Positive means they owe money (credit used)
    END IF;
END $$;


-- 4. Transactions Table (Financial History)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  type TEXT CHECK (type IN ('CREDIT_USAGE', 'PAYMENT', 'REFUND', 'FEE')),
  amount DECIMAL(12, 2) NOT NULL,
  reference_id TEXT, -- e.g. Order ID
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Users view own transactions') THEN
        CREATE POLICY "Users view own transactions" ON transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Admin view all transactions') THEN
        CREATE POLICY "Admin view all transactions" ON transactions FOR SELECT TO authenticated USING (
            EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'ADMIN')
        );
    END IF;
END $$;


-- 5. Product Updates (Inventory, Brand)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'stock_quantity') THEN
        ALTER TABLE products ADD COLUMN stock_quantity INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'brand') THEN
        ALTER TABLE products ADD COLUMN brand TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'master_product_id') THEN
        ALTER TABLE products ADD COLUMN master_product_id UUID REFERENCES master_products(id);
    END IF;
END $$;


-- 6. Order Enhancements (Dual PO)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'client_po_file') THEN
        ALTER TABLE orders ADD COLUMN client_po_file TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'system_po_number') THEN
        ALTER TABLE orders ADD COLUMN system_po_number TEXT;
    END IF;
END $$;


-- 7. Client Margins (Specific Overrides)
CREATE TABLE IF NOT EXISTS client_margins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES users(id) NOT NULL,
  category TEXT NOT NULL,
  margin_percent DECIMAL(5, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, category)
);

ALTER TABLE client_margins ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_margins' AND policyname = 'Admin manage client margins') THEN
        CREATE POLICY "Admin manage client margins" ON client_margins FOR ALL TO authenticated USING (
            EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'ADMIN')
        );
    END IF;
END $$;

-- 8. RFQ Enhancements
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rfq_items' AND column_name = 'allow_alternatives') THEN
        ALTER TABLE rfq_items ADD COLUMN allow_alternatives BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('009_mvp_refinements.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 010_sprint1_quote_comparison.sql
-- ============================================================================

-- Sprint 1: Quote Comparison & Dual PO System
-- Migration: Order Status Enum and PO Documents Table

-- ============================================
-- Part 1: Order Status Enum
-- ============================================

-- Create order status enum
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'DRAFT',
    'OPEN',
    'QUOTED',
    'PENDING_PO',
    'CONFIRMED',
    'IN_TRANSIT',
    'DELIVERED',
    'CANCELLED',
    'CLOSED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create RFQ status enum
DO $$ BEGIN
  CREATE TYPE rfq_status AS ENUM (
    'DRAFT',
    'OPEN',
    'QUOTED',
    'CLOSED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Update orders table to use enum (if status column exists as text)
-- We'll add a new column and migrate data
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_enum order_status;

-- Migrate existing data (convert text to enum)
UPDATE orders 
SET status_enum = 
  CASE 
    WHEN UPPER(status) = 'PENDING' THEN 'OPEN'::order_status
    WHEN UPPER(status) = 'CONFIRMED' THEN 'CONFIRMED'::order_status
    WHEN UPPER(status) = 'DELIVERED' THEN 'DELIVERED'::order_status
    WHEN UPPER(status) = 'CANCELLED' THEN 'CANCELLED'::order_status
    ELSE 'OPEN'::order_status
  END
WHERE status_enum IS NULL;

-- Drop old column and rename new one
ALTER TABLE orders DROP COLUMN IF EXISTS status;
ALTER TABLE orders RENAME COLUMN status_enum TO status;

-- Set default
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'OPEN'::order_status;

-- Same for RFQs
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS status_enum rfq_status;

UPDATE rfqs 
SET status_enum = 
  CASE 
    WHEN UPPER(status) = 'OPEN' THEN 'OPEN'::rfq_status
    WHEN UPPER(status) = 'CLOSED' THEN 'CLOSED'::rfq_status
    WHEN UPPER(status) = 'CANCELLED' THEN 'CANCELLED'::rfq_status
    ELSE 'OPEN'::rfq_status
  END
WHERE status_enum IS NULL;

ALTER TABLE rfqs DROP COLUMN IF EXISTS status;
ALTER TABLE rfqs RENAME COLUMN status_enum TO status;
ALTER TABLE rfqs ALTER COLUMN status SET DEFAULT 'OPEN'::rfq_status;

-- ============================================
-- Part 2: Order Documents Table (PO Storage)
-- ============================================

CREATE TABLE IF NOT EXISTS order_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('SYSTEM_PO', 'CLIENT_PO')),
  file_url TEXT NOT NULL,
  file_name TEXT,
  uploaded_by UUID REFERENCES users(id),
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_order_documents_order_id ON order_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_order_documents_type ON order_documents(document_type);

-- ============================================
-- Part 3: RLS Policies for Order Documents
-- ============================================

ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Clients manage own POs" ON order_documents;
DROP POLICY IF EXISTS "Admins full access to order documents" ON order_documents;
DROP POLICY IF EXISTS "Suppliers view confirmed order POs" ON order_documents;

-- Clients can view and upload POs for their own orders
CREATE POLICY "Clients manage own POs" ON order_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_documents.order_id 
      AND o.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_documents.order_id 
      AND o.client_id = auth.uid()
    )
  );

-- Admins can see and manage all documents
CREATE POLICY "Admins full access to order documents" ON order_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Suppliers can view POs for confirmed orders they're involved in
CREATE POLICY "Suppliers view confirmed order POs" ON order_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN quotes q ON q.id = o.quote_id
      WHERE o.id = order_documents.order_id 
      AND q.supplier_id = auth.uid()
      AND o.status IN ('CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'CLOSED')
    )
  );

-- ============================================
-- Part 4: Update Orders Table
-- ============================================

-- Add columns for PO tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS system_po_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_po_uploaded BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_verified_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_verified_by UUID REFERENCES users(id);

-- ============================================
-- Part 5: Storage Bucket (Run this in Supabase Dashboard if not exists)
-- ============================================

-- NOTE: This SQL can't create storage buckets directly
-- You need to run this in Supabase Dashboard > Storage:
-- 
-- Bucket name: order-documents
-- Public: false
-- Allowed MIME types: application/pdf
-- Max file size: 5MB
--
-- Then add this policy:
-- INSERT: authenticated users can upload
-- SELECT: Based on RLS policies above

COMMENT ON TABLE order_documents IS 'Stores System POs and Client-uploaded POs for orders';
COMMENT ON COLUMN order_documents.document_type IS 'SYSTEM_PO: Generated by platform, CLIENT_PO: Uploaded by client';

INSERT INTO public._migration_log (migration_name) VALUES ('010_sprint1_quote_comparison.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260203_add_order_payment_link.sql
-- ============================================================================

-- ============================================================================
-- Add external payment link fields to orders
-- Date: 2026-02-03
-- Purpose: Allow admins to store a manually generated payment link per order
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_sent_at TIMESTAMPTZ;


INSERT INTO public._migration_log (migration_name) VALUES ('20260203_add_order_payment_link.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260203_add_search_path_security.sql
-- ============================================================================

-- ============================================================================
-- SECURITY FIX: Add search_path to SECURITY DEFINER functions
-- Date: 2026-02-03
-- Purpose: Prevent search_path hijacking attacks on SECURITY DEFINER functions
-- ============================================================================

-- The 'SET search_path = public, pg_temp' clause prevents malicious users from
-- creating objects in their schema that shadow public functions, which could
-- lead to privilege escalation when SECURITY DEFINER functions are called.

-- ============================================================================
-- FIX: handle_new_user() trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- SECURITY: Role is ALWAYS set to CLIENT for new signups
  -- Role can only be changed by an admin through the admin panel
  INSERT INTO public.users (
    id, email, name, role, company_name, verified, status, kyc_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    'CLIENT'::user_role,  -- SECURITY: Always CLIENT, ignoring any client-provided role
    COALESCE(NEW.raw_user_meta_data->>'companyName', 'Company'),
    FALSE,
    'ACTIVE'::user_status,
    'INCOMPLETE'::kyc_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIX: get_user_role() helper function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_text TEXT;
BEGIN
  v_role_text := COALESCE(
    auth.jwt() ->> 'user_role',
    auth.jwt() -> 'app_metadata' ->> 'user_role'
  );

  IF v_role_text IS NULL OR v_role_text = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_role_text::user_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIX: admin_update_user_sensitive_fields() function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_update_user_sensitive_fields(
  target_user_id UUID,
  new_role user_role DEFAULT NULL,
  new_verified BOOLEAN DEFAULT NULL,
  new_status user_status DEFAULT NULL,
  new_kyc_status kyc_status DEFAULT NULL,
  new_rating DECIMAL(3, 2) DEFAULT NULL,
  new_credit_limit DECIMAL(10, 2) DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  admin_role user_role;
BEGIN
  -- Check if caller is an admin
  SELECT role INTO admin_role FROM public.users WHERE id = auth.uid();
  
  IF admin_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can update sensitive user fields';
  END IF;

  -- Update the target user with provided values
  UPDATE public.users
  SET
    role = COALESCE(new_role, role),
    verified = COALESCE(new_verified, verified),
    status = COALESCE(new_status, status),
    kyc_status = COALESCE(new_kyc_status, kyc_status),
    rating = COALESCE(new_rating, rating),
    credit_limit = COALESCE(new_credit_limit, credit_limit),
    updated_at = NOW()
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Verify the functions have the correct settings
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'SECURITY: search_path added to all SECURITY DEFINER functions';
  RAISE NOTICE 'Affected functions: handle_new_user, get_user_role, admin_update_user_sensitive_fields';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260203_add_search_path_security.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260203_lock_down_sensitive_columns.sql
-- ============================================================================

-- ============================================================================
-- SECURITY MIGRATION: Lock Down User Role and Sensitive Columns
-- ============================================================================
-- This migration:
-- 1. Updates the handle_new_user trigger to ALWAYS default to CLIENT role
-- 2. Removes role from accepted user metadata
-- 3. Creates stricter RLS policies that prevent users from modifying sensitive columns
-- 4. Creates an admin-only function for updating sensitive fields
-- ============================================================================

-- ============================================================================
-- PART 1: Update the auth trigger to ignore client-provided role
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- SECURITY: Role is ALWAYS set to CLIENT for new signups
  -- Role can only be changed by an admin through the admin panel
  INSERT INTO public.users (
    id, email, name, role, company_name, verified, status, kyc_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    'CLIENT'::user_role,  -- SECURITY: Always CLIENT, ignoring any client-provided role
    COALESCE(NEW.raw_user_meta_data->>'companyName', 'Company'),
    FALSE,
    'ACTIVE'::user_status,  -- SECURITY: Clients are automatically ACTIVE
    'INCOMPLETE'::kyc_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: Drop existing user update policies and create restricted ones
-- ============================================================================

-- Drop existing update policies for users table
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;

-- Create restricted policy: Users can only update name and company_name
CREATE POLICY "Users can update safe fields only" ON users 
  FOR UPDATE 
  USING (auth.uid() = id) 
  WITH CHECK (
    auth.uid() = id
    -- The following columns must remain unchanged when updated by the user
    AND role = (SELECT role FROM users WHERE id = auth.uid())
    AND verified = (SELECT verified FROM users WHERE id = auth.uid())
    AND status = (SELECT status FROM users WHERE id = auth.uid())
    AND kyc_status = (SELECT kyc_status FROM users WHERE id = auth.uid())
    AND rating = (SELECT rating FROM users WHERE id = auth.uid())
    AND public_id = (SELECT public_id FROM users WHERE id = auth.uid())
    AND date_joined = (SELECT date_joined FROM users WHERE id = auth.uid())
  );

-- Admins retain full update access
CREATE POLICY "Admins can update all user fields" ON users 
  FOR UPDATE 
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- PART 3: Create admin-only function for sensitive field updates
-- ============================================================================

-- Function for admins to update sensitive user fields
CREATE OR REPLACE FUNCTION admin_update_user_sensitive_fields(
  target_user_id UUID,
  new_role user_role DEFAULT NULL,
  new_verified BOOLEAN DEFAULT NULL,
  new_status user_status DEFAULT NULL,
  new_kyc_status kyc_status DEFAULT NULL,
  new_rating DECIMAL(3, 2) DEFAULT NULL,
  new_credit_limit DECIMAL(10, 2) DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  admin_role user_role;
BEGIN
  -- Check if caller is an admin
  SELECT role INTO admin_role FROM users WHERE id = auth.uid();
  
  IF admin_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can update sensitive user fields';
  END IF;

  -- Update the target user with provided values
  UPDATE users
  SET
    role = COALESCE(new_role, role),
    verified = COALESCE(new_verified, verified),
    status = COALESCE(new_status, status),
    kyc_status = COALESCE(new_kyc_status, kyc_status),
    rating = COALESCE(new_rating, rating),
    credit_limit = COALESCE(new_credit_limit, credit_limit),
    updated_at = NOW()
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users (RLS will restrict to admins)
GRANT EXECUTE ON FUNCTION admin_update_user_sensitive_fields TO authenticated;

-- ============================================================================
-- PART 4: Add credit limit columns if they don't exist
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'credit_limit') THEN
    ALTER TABLE users ADD COLUMN credit_limit DECIMAL(10, 2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'credit_used') THEN
    ALTER TABLE users ADD COLUMN credit_used DECIMAL(10, 2) DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- SUMMARY OF CHANGES
-- ============================================================================
-- 
-- 1. handle_new_user trigger: Now ignores client-provided role, always sets CLIENT
-- 
-- 2. User update policy: Users can only update these fields:
--    - name
--    - company_name
--    
-- 3. Protected fields (admin-only via admin_update_user_sensitive_fields):
--    - role (prevents privilege escalation)
--    - verified (trust indicator)
--    - status (account state)
--    - kyc_status (compliance)
--    - rating (integrity)
--    - credit_limit/credit_used (financial)
--    - public_id (identity)
--    - date_joined (audit trail)
--
-- ============================================================================

INSERT INTO public._migration_log (migration_name) VALUES ('20260203_lock_down_sensitive_columns.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260203_payment_link_rls_policy.sql
-- ============================================================================

-- ============================================================================
-- SECURITY: RLS Policy for Payment Link Fields
-- Date: 2026-02-03
-- Purpose: Restrict payment_link_url and payment_link_sent_at updates to ADMIN only
-- ============================================================================

-- Context: Payment links are manually generated by the admin team and sent
-- via email/WhatsApp. Clients and suppliers should NOT be able to update
-- these fields to prevent phishing attacks where they point to malicious URLs.

-- ============================================================================
-- Add columns to orders table (if not already added)
-- ============================================================================
DO $$ 
BEGIN
  -- Add payment_link_url if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'orders' 
    AND column_name = 'payment_link_url'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN payment_link_url TEXT NULL;
  END IF;

  -- Add payment_link_sent_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'orders' 
    AND column_name = 'payment_link_sent_at'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN payment_link_sent_at TIMESTAMPTZ NULL;
  END IF;
END $$;

-- ============================================================================
-- RLS Policy: Only admins can update payment link fields
-- ============================================================================

-- Drop any existing conflicting policies first
DROP POLICY IF EXISTS "Admins can update payment links" ON public.orders;
DROP POLICY IF EXISTS "Only admins can set payment links" ON public.orders;

-- Create a policy that allows admins to update any order
-- This is simpler and covers payment link updates
CREATE POLICY "Admins can update all order fields" ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    -- Only admins can update orders
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
  );

-- Ensure clients and suppliers can still view their own orders
-- (This should already exist, but adding for completeness)
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders" ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = client_id 
    OR auth.uid() = supplier_id 
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
  );

-- ============================================================================
-- Add helpful comment
-- ============================================================================
COMMENT ON COLUMN public.orders.payment_link_url IS 
  'External payment link manually generated by admin team. Only admins can update.';

COMMENT ON COLUMN public.orders.payment_link_sent_at IS 
  'Timestamp when payment link was sent to client via email/WhatsApp. Only admins can update.';

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'SECURITY: Payment link RLS policy created';
  RAISE NOTICE 'Only ADMIN role can update payment_link_url and payment_link_sent_at';
  RAISE NOTICE 'Clients and suppliers can view but not modify these fields';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260203_payment_link_rls_policy.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260203_restrict_supplier_order_updates.sql
-- ============================================================================

-- ============================================================================
-- SECURITY: Restrict suppliers from updating payment link fields
-- Date: 2026-02-03
-- Purpose: Ensure suppliers can only update their order status (not payment links)
-- ============================================================================

-- Drop the permissive policy (if it exists)
DROP POLICY IF EXISTS "Suppliers can update order status" ON public.orders;

-- Recreate with a WITH CHECK clause that blocks payment link changes
CREATE POLICY "Suppliers can update order status"
  ON public.orders FOR UPDATE
  USING (auth.uid() = supplier_id)
  WITH CHECK (
    auth.uid() = supplier_id
    AND payment_link_url IS NOT DISTINCT FROM (
      SELECT o.payment_link_url FROM public.orders o WHERE o.id = id
    )
    AND payment_link_sent_at IS NOT DISTINCT FROM (
      SELECT o.payment_link_sent_at FROM public.orders o WHERE o.id = id
    )
  );


INSERT INTO public._migration_log (migration_name) VALUES ('20260203_restrict_supplier_order_updates.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260205_credit_limit_adjustments.sql
-- ============================================================================

-- ============================================================================
-- CREDIT LIMIT ADJUSTMENTS + AUDIT TRAIL
-- Date: 2026-02-05
-- ============================================================================

-- Persist every admin credit-limit change for audit and client visibility.
CREATE TABLE IF NOT EXISTS public.credit_limit_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('SET', 'INCREASE', 'DECREASE')),
  adjustment_amount DECIMAL(12, 2) NOT NULL CHECK (adjustment_amount >= 0),
  change_amount DECIMAL(12, 2) NOT NULL,
  previous_limit DECIMAL(12, 2) NOT NULL CHECK (previous_limit >= 0),
  new_limit DECIMAL(12, 2) NOT NULL CHECK (new_limit >= 0),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_limit_adjustments_client_created_at
  ON public.credit_limit_adjustments (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_limit_adjustments_admin_created_at
  ON public.credit_limit_adjustments (admin_id, created_at DESC);

ALTER TABLE public.credit_limit_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_limit_adjustments'
      AND policyname = 'Admins can read all credit adjustments'
  ) THEN
    CREATE POLICY "Admins can read all credit adjustments"
      ON public.credit_limit_adjustments
      FOR SELECT
      TO authenticated
      USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_limit_adjustments'
      AND policyname = 'Admins can insert credit adjustments'
  ) THEN
    CREATE POLICY "Admins can insert credit adjustments"
      ON public.credit_limit_adjustments
      FOR INSERT
      TO authenticated
      WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
        AND admin_id = auth.uid()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_limit_adjustments'
      AND policyname = 'Clients can view own credit adjustments'
  ) THEN
    CREATE POLICY "Clients can view own credit adjustments"
      ON public.credit_limit_adjustments
      FOR SELECT
      TO authenticated
      USING (client_id = auth.uid());
  END IF;
END $$;

-- Atomic admin-only credit adjustment with strict validation and audit logging.
CREATE OR REPLACE FUNCTION public.admin_adjust_client_credit_limit(
  p_target_client_id UUID,
  p_adjustment_type TEXT,
  p_adjustment_amount DECIMAL(12, 2),
  p_adjustment_reason TEXT
)
RETURNS TABLE (
  id UUID,
  client_id UUID,
  admin_id UUID,
  adjustment_type TEXT,
  adjustment_amount DECIMAL(12, 2),
  change_amount DECIMAL(12, 2),
  previous_limit DECIMAL(12, 2),
  new_limit DECIMAL(12, 2),
  reason TEXT,
  created_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_role user_role;
  v_target_role user_role;
  v_previous_limit DECIMAL(12, 2);
  v_new_limit DECIMAL(12, 2);
  v_change_amount DECIMAL(12, 2);
  v_adjustment_type TEXT;
  v_reason TEXT;
BEGIN
  SELECT role
  INTO v_admin_role
  FROM public.users
  WHERE id = auth.uid();

  IF v_admin_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can adjust credit limits';
  END IF;

  SELECT role, COALESCE(credit_limit, 0)
  INTO v_target_role, v_previous_limit
  FROM public.users
  WHERE id = p_target_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF v_target_role IS DISTINCT FROM 'CLIENT' THEN
    RAISE EXCEPTION 'Credit limit adjustments are only allowed for clients';
  END IF;

  v_adjustment_type := UPPER(TRIM(COALESCE(p_adjustment_type, '')));
  IF v_adjustment_type NOT IN ('SET', 'INCREASE', 'DECREASE') THEN
    RAISE EXCEPTION 'Invalid adjustment type. Use SET, INCREASE, or DECREASE';
  END IF;

  IF p_adjustment_amount IS NULL OR p_adjustment_amount < 0 THEN
    RAISE EXCEPTION 'Adjustment amount must be a non-negative number';
  END IF;

  IF v_adjustment_type IN ('INCREASE', 'DECREASE') AND p_adjustment_amount = 0 THEN
    RAISE EXCEPTION 'Increase/decrease amount must be greater than zero';
  END IF;

  v_reason := TRIM(COALESCE(p_adjustment_reason, ''));
  IF char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Reason must be at least 5 characters';
  END IF;

  IF v_adjustment_type = 'SET' THEN
    v_new_limit := ROUND(p_adjustment_amount, 2);
  ELSIF v_adjustment_type = 'INCREASE' THEN
    v_new_limit := ROUND(v_previous_limit + p_adjustment_amount, 2);
  ELSE
    IF p_adjustment_amount > v_previous_limit THEN
      RAISE EXCEPTION 'Decrease amount exceeds current credit limit';
    END IF;
    v_new_limit := ROUND(v_previous_limit - p_adjustment_amount, 2);
  END IF;

  v_change_amount := ROUND(v_new_limit - v_previous_limit, 2);

  UPDATE public.users
  SET
    credit_limit = v_new_limit,
    updated_at = NOW()
  WHERE id = p_target_client_id;

  RETURN QUERY
  INSERT INTO public.credit_limit_adjustments (
    client_id,
    admin_id,
    adjustment_type,
    adjustment_amount,
    change_amount,
    previous_limit,
    new_limit,
    reason
  )
  VALUES (
    p_target_client_id,
    auth.uid(),
    v_adjustment_type,
    ROUND(p_adjustment_amount, 2),
    v_change_amount,
    v_previous_limit,
    v_new_limit,
    v_reason
  )
  RETURNING
    credit_limit_adjustments.id,
    credit_limit_adjustments.client_id,
    credit_limit_adjustments.admin_id,
    credit_limit_adjustments.adjustment_type,
    credit_limit_adjustments.adjustment_amount,
    credit_limit_adjustments.change_amount,
    credit_limit_adjustments.previous_limit,
    credit_limit_adjustments.new_limit,
    credit_limit_adjustments.reason,
    credit_limit_adjustments.created_at;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.admin_adjust_client_credit_limit TO authenticated;

INSERT INTO public._migration_log (migration_name) VALUES ('20260205_credit_limit_adjustments.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_atomic_inventory_decrement.sql
-- ============================================================================

-- ============================================================================
-- Atomic inventory decrement to prevent race conditions / overselling
-- Date: 2026-02-07
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrement_stock_atomic(
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS TABLE (
  success BOOLEAN,
  previous_stock INTEGER,
  new_stock INTEGER,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_stock INTEGER;
  v_new_stock INTEGER;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Product ID is required';
    RETURN;
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Quantity must be greater than zero';
    RETURN;
  END IF;

  -- Admin-only when called with user session; service-role (auth.uid() IS NULL) is allowed.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = 'ADMIN'
     ) THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Unauthorized';
    RETURN;
  END IF;

  UPDATE public.products p
  SET
    stock_quantity = COALESCE(p.stock_quantity, 0) - p_quantity,
    updated_at = NOW()
  WHERE p.id = p_product_id
    AND COALESCE(p.stock_quantity, 0) >= p_quantity
  RETURNING
    COALESCE(p.stock_quantity, 0) + p_quantity,
    COALESCE(p.stock_quantity, 0)
  INTO
    v_previous_stock,
    v_new_stock;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, v_previous_stock, v_new_stock, NULL::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(p.stock_quantity, 0)
  INTO v_previous_stock
  FROM public.products p
  WHERE p.id = p_product_id;

  IF v_previous_stock IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Product not found';
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    FALSE,
    v_previous_stock,
    v_previous_stock,
    format('Insufficient stock. Available: %s, Requested: %s', v_previous_stock, p_quantity);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_stock_atomic(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock_atomic(UUID, INTEGER) TO service_role;

INSERT INTO public._migration_log (migration_name) VALUES ('20260207_atomic_inventory_decrement.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_phase1_security_hardening.sql
-- ============================================================================

-- ============================================================================
-- Phase 1 Security Hardening
-- Date: 2026-02-07
-- Focus:
--   1) Remove user-table recursion risk in role helper
--   2) Keep JWT role claims synchronized with public.users.role
--   3) Remove seed helper functions from runtime surface
-- ============================================================================

-- 1) Role helper must not query public.users (avoids RLS recursion paths).
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_text TEXT;
BEGIN
  v_role_text := COALESCE(
    auth.jwt() ->> 'user_role',
    auth.jwt() -> 'app_metadata' ->> 'user_role'
  );

  IF v_role_text IS NULL OR v_role_text = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_role_text::public.user_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2) Sync role claim to auth.users raw_app_meta_data for policy checks.
CREATE OR REPLACE FUNCTION public.sync_auth_user_role_claim(
  p_user_id UUID,
  p_role public.user_role
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR p_role IS NULL THEN
    RETURN;
  END IF;

  UPDATE auth.users
  SET
    raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('user_role', p_role::TEXT),
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.sync_auth_user_role_claim_from_profile()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.sync_auth_user_role_claim(NEW.id, NEW.role);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_auth_user_role_claim ON public.users;
CREATE TRIGGER trg_sync_auth_user_role_claim
AFTER INSERT OR UPDATE OF role ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_auth_user_role_claim_from_profile();

-- Backfill existing users into auth claim metadata.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT u.id, u.role
    FROM public.users u
  LOOP
    PERFORM public.sync_auth_user_role_claim(r.id, r.role);
  END LOOP;
END
$$;

-- 3) Drop seed-only helper functions so they are not callable in runtime.
DROP FUNCTION IF EXISTS public.create_user_profile(
  UUID,
  TEXT,
  TEXT,
  public.user_role,
  TEXT,
  BOOLEAN,
  public.user_status,
  public.kyc_status
);

DROP FUNCTION IF EXISTS public.create_test_user(
  TEXT,
  TEXT,
  TEXT,
  public.user_role,
  TEXT,
  BOOLEAN,
  public.user_status,
  public.kyc_status
);


INSERT INTO public._migration_log (migration_name) VALUES ('20260207_phase1_security_hardening.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_phase2_data_integrity.sql
-- ============================================================================

-- ============================================================================
-- Phase 2 Data Integrity
-- Date: 2026-02-07
-- Focus:
--   1) Transactional RFQ creation (RFQ + items atomically)
--   2) Atomic invoice numbering with sequence
--   3) Canonical status normalization + constraints
--   4) RFQ item uniqueness guard
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Ensure canonical order statuses used by the app are present.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_status TEXT;
  v_statuses TEXT[] := ARRAY[
    'PENDING_PO',
    'CONFIRMED',
    'PENDING_PAYMENT',
    'AWAITING_CONFIRMATION',
    'PAYMENT_CONFIRMED',
    'PROCESSING',
    'READY_FOR_PICKUP',
    'PICKUP_SCHEDULED',
    'OUT_FOR_DELIVERY',
    'SHIPPED',
    'IN_TRANSIT',
    'DELIVERED',
    'CANCELLED'
  ];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'order_status'
  ) THEN
    FOREACH v_status IN ARRAY v_statuses LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'order_status'
          AND e.enumlabel = v_status
      ) THEN
        EXECUTE format('ALTER TYPE public.order_status ADD VALUE %L', v_status);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) Normalize legacy statuses in persisted rows and enforce canonical subsets.
-- ----------------------------------------------------------------------------
UPDATE public.orders
SET status = CASE status::TEXT
  WHEN 'In Transit' THEN 'IN_TRANSIT'::public.order_status
  WHEN 'Delivered' THEN 'DELIVERED'::public.order_status
  WHEN 'Cancelled' THEN 'CANCELLED'::public.order_status
  WHEN 'OPEN' THEN 'PENDING_PO'::public.order_status
  WHEN 'DRAFT' THEN 'PENDING_PO'::public.order_status
  WHEN 'QUOTED' THEN 'PENDING_PO'::public.order_status
  WHEN 'CLOSED' THEN 'DELIVERED'::public.order_status
  ELSE status
END
WHERE status::TEXT IN ('In Transit', 'Delivered', 'Cancelled', 'OPEN', 'DRAFT', 'QUOTED', 'CLOSED');

ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_status_canonical_chk;

ALTER TABLE public.orders
ADD CONSTRAINT orders_status_canonical_chk
CHECK (
  status::TEXT = ANY (
    ARRAY[
      'PENDING_PO',
      'CONFIRMED',
      'PENDING_PAYMENT',
      'AWAITING_CONFIRMATION',
      'PAYMENT_CONFIRMED',
      'PROCESSING',
      'READY_FOR_PICKUP',
      'PICKUP_SCHEDULED',
      'OUT_FOR_DELIVERY',
      'SHIPPED',
      'IN_TRANSIT',
      'DELIVERED',
      'CANCELLED'
    ]
  )
);

UPDATE public.quotes
SET status = CASE status::TEXT
  WHEN 'PENDING' THEN 'PENDING_ADMIN'::public.quote_status
  WHEN 'SENT' THEN 'SENT_TO_CLIENT'::public.quote_status
  WHEN 'DECLINED' THEN 'REJECTED'::public.quote_status
  ELSE status
END
WHERE status::TEXT IN ('PENDING', 'SENT', 'DECLINED');

ALTER TABLE public.quotes
DROP CONSTRAINT IF EXISTS quotes_status_canonical_chk;

ALTER TABLE public.quotes
ADD CONSTRAINT quotes_status_canonical_chk
CHECK (status::TEXT = ANY (ARRAY['PENDING_ADMIN', 'SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED']));

UPDATE public.rfqs
SET status = CASE status::TEXT
  WHEN 'DRAFT' THEN 'OPEN'::public.rfq_status
  WHEN 'CANCELLED' THEN 'CLOSED'::public.rfq_status
  ELSE status
END
WHERE status::TEXT IN ('DRAFT', 'CANCELLED');

ALTER TABLE public.rfqs
DROP CONSTRAINT IF EXISTS rfqs_status_canonical_chk;

ALTER TABLE public.rfqs
ADD CONSTRAINT rfqs_status_canonical_chk
CHECK (status::TEXT = ANY (ARRAY['OPEN', 'QUOTED', 'CLOSED']));

-- ----------------------------------------------------------------------------
-- 3) Enforce unique product lines per RFQ.
-- ----------------------------------------------------------------------------
WITH duplicates AS (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY rfq_id, product_id
        ORDER BY created_at, id
      ) AS rn
    FROM public.rfq_items
  ) ranked
  WHERE ranked.rn > 1
)
DELETE FROM public.rfq_items i
USING duplicates d
WHERE i.id = d.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rfq_items_unique_product'
      AND conrelid = 'public.rfq_items'::regclass
  ) THEN
    ALTER TABLE public.rfq_items
      ADD CONSTRAINT rfq_items_unique_product UNIQUE (rfq_id, product_id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4) Transactional RFQ creation RPC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_rfq_with_items(
  p_client_id UUID,
  p_items JSONB,
  p_status TEXT DEFAULT 'OPEN',
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.rfqs
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rfq public.rfqs;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_client_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'RFQ must include at least one item';
  END IF;

  v_status := UPPER(COALESCE(NULLIF(TRIM(p_status), ''), 'OPEN'));
  IF v_status NOT IN ('OPEN', 'QUOTED', 'CLOSED') THEN
    RAISE EXCEPTION 'Invalid RFQ status';
  END IF;

  INSERT INTO public.rfqs (client_id, status, date)
  VALUES (p_client_id, v_status::public.rfq_status, COALESCE(p_date, CURRENT_DATE))
  RETURNING * INTO v_rfq;

  INSERT INTO public.rfq_items (rfq_id, product_id, quantity, notes)
  SELECT
    v_rfq.id,
    COALESCE((elem->>'product_id')::UUID, (elem->>'productId')::UUID),
    (elem->>'quantity')::INTEGER,
    NULLIF(COALESCE(elem->>'notes', elem->>'note'), '')
  FROM jsonb_array_elements(p_items) AS elem;

  RETURN v_rfq;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.create_rfq_with_items(UUID, JSONB, TEXT, DATE) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5) Atomic invoice number generation using a sequence.
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq
  INCREMENT BY 1
  MINVALUE 1
  START WITH 1;

DO $$
DECLARE
  v_max BIGINT;
BEGIN
  SELECT COALESCE(MAX((regexp_match(invoice_number, '([0-9]+)$'))[1]::BIGINT), 0)
  INTO v_max
  FROM public.invoices
  WHERE invoice_number IS NOT NULL
    AND invoice_number ~ '[0-9]+$';

  IF v_max > 0 THEN
    PERFORM setval('public.invoice_number_seq', v_max, TRUE);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_seq := nextval('public.invoice_number_seq');
  RETURN 'INV-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.auto_generate_invoice_number()
RETURNS TRIGGER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := public.generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


INSERT INTO public._migration_log (migration_name) VALUES ('20260207_phase2_data_integrity.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_phase3_payment_audit.sql
-- ============================================================================

-- ============================================================================
-- Phase 3 Bank Transfer Audit Trail
-- Date: 2026-02-07
-- Focus:
--   1) Persistent payment audit log for bank-transfer lifecycle
--   2) RLS policies for admin/client visibility and controlled inserts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role public.user_role,
  action TEXT NOT NULL CHECK (
    action IN (
      'REFERENCE_SUBMITTED',
      'REFERENCE_RESUBMITTED',
      'PAYMENT_CONFIRMED',
      'PAYMENT_REJECTED'
    )
  ),
  from_status public.order_status,
  to_status public.order_status,
  payment_reference TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_order_created_at
  ON public.payment_audit_logs (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_created_at
  ON public.payment_audit_logs (created_at DESC);

ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_audit_logs'
      AND policyname = 'Admins can read all payment audit logs'
  ) THEN
    CREATE POLICY "Admins can read all payment audit logs"
      ON public.payment_audit_logs
      FOR SELECT
      TO authenticated
      USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_audit_logs'
      AND policyname = 'Clients can read own payment audit logs'
  ) THEN
    CREATE POLICY "Clients can read own payment audit logs"
      ON public.payment_audit_logs
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = payment_audit_logs.order_id
            AND o.client_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_audit_logs'
      AND policyname = 'Admins can insert payment audit logs'
  ) THEN
    CREATE POLICY "Admins can insert payment audit logs"
      ON public.payment_audit_logs
      FOR INSERT
      TO authenticated
      WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
        AND actor_user_id = auth.uid()
        AND action IN ('PAYMENT_CONFIRMED', 'PAYMENT_REJECTED')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_audit_logs'
      AND policyname = 'Clients can insert own payment submission audit logs'
  ) THEN
    CREATE POLICY "Clients can insert own payment submission audit logs"
      ON public.payment_audit_logs
      FOR INSERT
      TO authenticated
      WITH CHECK (
        actor_user_id = auth.uid()
        AND action IN ('REFERENCE_SUBMITTED', 'REFERENCE_RESUBMITTED')
        AND EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = payment_audit_logs.order_id
            AND o.client_id = auth.uid()
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT ON public.payment_audit_logs TO authenticated;

INSERT INTO public._migration_log (migration_name) VALUES ('20260207_phase3_payment_audit.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_phase4_rpc_hardening_and_invoice_sequence.sql
-- ============================================================================

-- ============================================================================
-- Phase 4: RPC hardening + atomic invoice numbers
-- Date: 2026-02-07
-- Focus:
--   1) Remove caller-supplied admin identifiers from SECURITY DEFINER RPCs
--   2) Make invoice number generation atomic under concurrency
-- ============================================================================

-- 1) Harden assign_custom_request(): rely on auth.uid() only.
DROP FUNCTION IF EXISTS public.assign_custom_request(UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.assign_custom_request(
  p_request_id UUID,
  p_supplier_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.custom_item_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.custom_item_requests;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can assign requests';
  END IF;

  IF (SELECT role FROM public.users WHERE id = p_supplier_id) <> 'SUPPLIER' THEN
    RAISE EXCEPTION 'Can only assign to suppliers';
  END IF;

  UPDATE public.custom_item_requests
  SET
    assigned_to = p_supplier_id,
    assigned_by = v_caller,
    admin_notes = COALESCE(p_notes, admin_notes),
    status = 'ASSIGNED',
    updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Custom request not found';
  END IF;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_custom_request(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_custom_request(UUID, UUID, TEXT) TO authenticated;

-- 2) Harden mark_order_as_paid(): rely on auth.uid() only.
DROP FUNCTION IF EXISTS public.mark_order_as_paid(UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can confirm payments';
  END IF;

  UPDATE public.orders
  SET
    status = 'PAYMENT_CONFIRMED',
    payment_confirmed_at = NOW(),
    payment_confirmed_by = v_caller,
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_notes = COALESCE(p_payment_notes, payment_notes),
    updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  UPDATE public.invoices
  SET
    status = 'PAID',
    paid_date = CURRENT_DATE
  WHERE order_id = p_order_id;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) TO authenticated;

-- 3) Atomic invoice number generation (sequence-backed).
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq AS BIGINT;

DO $$
DECLARE
  v_max BIGINT;
BEGIN
  SELECT COALESCE(
    MAX((regexp_match(invoice_number, '^INV-[0-9]{4}-([0-9]+)$'))[1]::BIGINT),
    0
  )
  INTO v_max
  FROM public.invoices;

  IF v_max > 0 THEN
    PERFORM setval('public.invoice_number_seq', v_max, true);
  ELSE
    PERFORM setval('public.invoice_number_seq', 1, false);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year TEXT;
  v_sequence BIGINT;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_sequence := nextval('public.invoice_number_seq');

  RETURN 'INV-' || v_year || '-' || LPAD(v_sequence::TEXT, 6, '0');
END;
$$;

GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO service_role;

-- 4) Enforce margin bounds at the database layer.
UPDATE public.users
SET client_margin = LEAST(GREATEST(client_margin, 0), 100)
WHERE client_margin IS NOT NULL;

UPDATE public.quotes
SET margin_percent = LEAST(GREATEST(margin_percent, 0), 100);

UPDATE public.margin_settings
SET margin_percent = LEAST(GREATEST(margin_percent, 0), 100);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_client_margin_bounds'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT users_client_margin_bounds;
  END IF;

  ALTER TABLE public.users
    ADD CONSTRAINT users_client_margin_bounds
    CHECK (client_margin IS NULL OR (client_margin >= 0 AND client_margin <= 100));
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quotes_margin_percent_bounds'
      AND conrelid = 'public.quotes'::regclass
  ) THEN
    ALTER TABLE public.quotes DROP CONSTRAINT quotes_margin_percent_bounds;
  END IF;

  ALTER TABLE public.quotes
    ADD CONSTRAINT quotes_margin_percent_bounds
    CHECK (margin_percent >= 0 AND margin_percent <= 100);
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'margin_settings_margin_percent_bounds'
      AND conrelid = 'public.margin_settings'::regclass
  ) THEN
    ALTER TABLE public.margin_settings DROP CONSTRAINT margin_settings_margin_percent_bounds;
  END IF;

  ALTER TABLE public.margin_settings
    ADD CONSTRAINT margin_settings_margin_percent_bounds
    CHECK (margin_percent >= 0 AND margin_percent <= 100);
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'client_margins'
      AND relkind = 'r'
  ) THEN
    EXECUTE 'UPDATE public.client_margins
             SET margin_percent = LEAST(GREATEST(margin_percent, 0), 100)';

    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'client_margins_margin_percent_bounds'
        AND conrelid = 'public.client_margins'::regclass
    ) THEN
      EXECUTE 'ALTER TABLE public.client_margins
               DROP CONSTRAINT client_margins_margin_percent_bounds';
    END IF;

    EXECUTE 'ALTER TABLE public.client_margins
             ADD CONSTRAINT client_margins_margin_percent_bounds
             CHECK (margin_percent >= 0 AND margin_percent <= 100)';
  END IF;
END
$$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260207_phase4_rpc_hardening_and_invoice_sequence.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_security_and_quote_acceptance.sql
-- ============================================================================

-- ============================================================================
-- SECURITY + CORE FLOW HARDENING
-- Date: 2026-02-07
-- ============================================================================

-- 1) Remove permissive payment update policy.
DROP POLICY IF EXISTS "System can update payments" ON public.payments;

-- 2) Ensure credit columns exist before using atomic quote acceptance.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'client_margin'
  ) THEN
    ALTER TABLE public.users ADD COLUMN client_margin DECIMAL(5, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'credit_limit'
  ) THEN
    ALTER TABLE public.users ADD COLUMN credit_limit DECIMAL(12, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'credit_used'
  ) THEN
    ALTER TABLE public.users ADD COLUMN credit_used DECIMAL(12, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'current_balance'
  ) THEN
    ALTER TABLE public.users ADD COLUMN current_balance DECIMAL(12, 2) DEFAULT 0;
  END IF;
END $$;

-- 3) Backfill order_status enum values used by the application.
DO $$
DECLARE
  v_status TEXT;
  v_statuses TEXT[] := ARRAY[
    'PENDING_PO',
    'CONFIRMED',
    'PENDING_PAYMENT',
    'AWAITING_CONFIRMATION',
    'PAYMENT_CONFIRMED',
    'PROCESSING',
    'READY_FOR_PICKUP',
    'PICKUP_SCHEDULED',
    'OUT_FOR_DELIVERY',
    'SHIPPED',
    'IN_TRANSIT',
    'DELIVERED',
    'CANCELLED'
  ];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'order_status'
  ) THEN
    FOREACH v_status IN ARRAY v_statuses LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'order_status'
          AND e.enumlabel = v_status
      ) THEN
        EXECUTE format('ALTER TYPE public.order_status ADD VALUE %L', v_status);
      END IF;
    END LOOP;
  END IF;
END $$;

-- 4) Atomic quote acceptance + credit deduction + order creation.
CREATE OR REPLACE FUNCTION public.accept_quote_and_deduct_credit(p_quote_id UUID)
RETURNS public.orders
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote RECORD;
  v_order public.orders;
  v_total_amount DECIMAL(12, 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    q.id,
    q.rfq_id,
    q.supplier_id,
    q.status,
    COALESCE(q.final_price, 0)::DECIMAL(12, 2) AS final_price,
    r.client_id
  INTO v_quote
  FROM public.quotes q
  JOIN public.rfqs r ON r.id = q.rfq_id
  WHERE q.id = p_quote_id
  FOR UPDATE OF q, r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_quote.client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Idempotency guard: if already accepted and order exists, return it.
  IF v_quote.status = 'ACCEPTED' THEN
    SELECT *
    INTO v_order
    FROM public.orders
    WHERE quote_id = p_quote_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN v_order;
    END IF;
  END IF;

  IF v_quote.status NOT IN ('SENT_TO_CLIENT', 'PENDING_ADMIN', 'ACCEPTED') THEN
    RAISE EXCEPTION 'Quote is not available for acceptance';
  END IF;

  v_total_amount := GREATEST(v_quote.final_price, 0);
  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid quote amount';
  END IF;

  UPDATE public.users
  SET
    credit_limit = ROUND(COALESCE(credit_limit, 0) - v_total_amount, 2),
    credit_used = ROUND(COALESCE(credit_used, 0) + v_total_amount, 2),
    current_balance = ROUND(COALESCE(current_balance, 0) + v_total_amount, 2),
    updated_at = NOW()
  WHERE id = v_quote.client_id
    AND COALESCE(credit_limit, 0) >= v_total_amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient credit';
  END IF;

  UPDATE public.quotes
  SET status = 'ACCEPTED', updated_at = NOW()
  WHERE id = p_quote_id;

  UPDATE public.rfqs
  SET status = 'CLOSED', updated_at = NOW()
  WHERE id = v_quote.rfq_id;

  INSERT INTO public.orders (
    quote_id,
    client_id,
    supplier_id,
    amount,
    status,
    date
  )
  VALUES (
    v_quote.id,
    v_quote.client_id,
    v_quote.supplier_id,
    v_total_amount,
    'PENDING_PAYMENT',
    CURRENT_DATE
  )
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.accept_quote_and_deduct_credit(UUID) TO authenticated;

-- 5) Harden mark_order_as_paid by binding admin identity to auth.uid().
CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_admin_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can confirm payments';
  END IF;

  UPDATE public.orders
  SET
    status = 'IN_TRANSIT',
    payment_confirmed_at = NOW(),
    payment_confirmed_by = v_caller,
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_notes = COALESCE(p_payment_notes, payment_notes),
    updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  UPDATE public.invoices
  SET
    status = 'PAID',
    paid_date = CURRENT_DATE
  WHERE order_id = p_order_id;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

-- 6) Harden assign_custom_request by binding admin identity to auth.uid().
CREATE OR REPLACE FUNCTION public.assign_custom_request(
  p_request_id UUID,
  p_supplier_id UUID,
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.custom_item_requests
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.custom_item_requests;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can assign requests';
  END IF;

  IF (SELECT role FROM public.users WHERE id = p_supplier_id) <> 'SUPPLIER' THEN
    RAISE EXCEPTION 'Can only assign to suppliers';
  END IF;

  UPDATE public.custom_item_requests
  SET
    assigned_to = p_supplier_id,
    assigned_by = v_caller,
    admin_notes = COALESCE(p_notes, admin_notes),
    status = 'ASSIGNED',
    updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$ LANGUAGE plpgsql;

INSERT INTO public._migration_log (migration_name) VALUES ('20260207_security_and_quote_acceptance.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_verify_client_po_atomic.sql
-- ============================================================================

-- ============================================================================
-- Atomic client PO verification
-- Verifies document + decrements inventory + confirms order in one transaction.
-- Date: 2026-02-07
-- ============================================================================

-- Ensure orders.items exists for inventory item tracking (fallback to RFQ items if empty).
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS items JSONB;

CREATE OR REPLACE FUNCTION public.verify_client_po_and_confirm_order(
  p_document_id UUID
)
RETURNS public.orders
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID;
  v_doc public.order_documents;
  v_order public.orders;
  v_quote_rfq_id UUID;
  v_item RECORD;
  v_stock_result RECORD;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can verify client POs';
  END IF;

  SELECT *
  INTO v_doc
  FROM public.order_documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_doc.document_type <> 'CLIENT_PO' THEN
    RAISE EXCEPTION 'Only CLIENT_PO documents can be verified';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = v_doc.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Idempotent exit: already verified, do not decrement inventory twice.
  IF v_doc.verified_at IS NOT NULL AND v_order.admin_verified THEN
    RETURN v_order;
  END IF;

  IF v_order.status <> 'PENDING_PO' THEN
    RAISE EXCEPTION 'Order must be in PENDING_PO status for verification';
  END IF;

  -- Prefer explicit order items payload when present.
  IF jsonb_typeof(COALESCE(v_order.items, '[]'::jsonb)) = 'array'
     AND jsonb_array_length(COALESCE(v_order.items, '[]'::jsonb)) > 0 THEN
    FOR v_item IN
      SELECT
        COALESCE(value->>'productId', value->>'product_id')::UUID AS product_id,
        GREATEST(COALESCE((value->>'quantity')::INTEGER, 0), 0) AS quantity
      FROM jsonb_array_elements(v_order.items) AS value
    LOOP
      IF v_item.product_id IS NULL OR v_item.quantity <= 0 THEN
        CONTINUE;
      END IF;

      SELECT *
      INTO v_stock_result
      FROM public.decrement_stock_atomic(v_item.product_id, v_item.quantity);

      IF NOT COALESCE(v_stock_result.success, FALSE) THEN
        RAISE EXCEPTION '%', COALESCE(
          v_stock_result.error,
          format('Failed to decrement stock for product %s', v_item.product_id)
        );
      END IF;
    END LOOP;
  ELSIF v_order.quote_id IS NOT NULL THEN
    SELECT q.rfq_id
    INTO v_quote_rfq_id
    FROM public.quotes q
    WHERE q.id = v_order.quote_id;

    IF v_quote_rfq_id IS NOT NULL THEN
      FOR v_item IN
        SELECT product_id, quantity
        FROM public.rfq_items
        WHERE rfq_id = v_quote_rfq_id
      LOOP
        SELECT *
        INTO v_stock_result
        FROM public.decrement_stock_atomic(v_item.product_id, v_item.quantity);

        IF NOT COALESCE(v_stock_result.success, FALSE) THEN
          RAISE EXCEPTION '%', COALESCE(
            v_stock_result.error,
            format('Failed to decrement stock for product %s', v_item.product_id)
          );
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.order_documents
  SET
    verified_by = v_caller,
    verified_at = NOW(),
    updated_at = NOW()
  WHERE id = v_doc.id;

  UPDATE public.orders
  SET
    status = 'CONFIRMED',
    admin_verified = TRUE,
    admin_verified_by = v_caller,
    admin_verified_at = NOW(),
    updated_at = NOW()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.verify_client_po_and_confirm_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_client_po_and_confirm_order(UUID) TO service_role;

INSERT INTO public._migration_log (migration_name) VALUES ('20260207_verify_client_po_atomic.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase5_po_verification_payment_transition.sql
-- ============================================================================

-- ============================================================================
-- Phase 5: PO verification should transition to payment stage
-- Bank transfer is the primary MVP payment path.
-- Date: 2026-02-07
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_client_po_and_confirm_order(
  p_document_id UUID
)
RETURNS public.orders
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID;
  v_doc public.order_documents;
  v_order public.orders;
  v_quote_rfq_id UUID;
  v_item RECORD;
  v_stock_result RECORD;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can verify client POs';
  END IF;

  SELECT *
  INTO v_doc
  FROM public.order_documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_doc.document_type <> 'CLIENT_PO' THEN
    RAISE EXCEPTION 'Only CLIENT_PO documents can be verified';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = v_doc.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Idempotent exit: already verified and order already past PO stage.
  IF v_doc.verified_at IS NOT NULL
     AND v_order.admin_verified
     AND v_order.status <> 'PENDING_PO' THEN
    RETURN v_order;
  END IF;

  IF v_order.status <> 'PENDING_PO' THEN
    RAISE EXCEPTION 'Order must be in PENDING_PO status for verification';
  END IF;

  -- Prefer explicit order items payload when present.
  IF jsonb_typeof(COALESCE(v_order.items, '[]'::jsonb)) = 'array'
     AND jsonb_array_length(COALESCE(v_order.items, '[]'::jsonb)) > 0 THEN
    FOR v_item IN
      SELECT
        COALESCE(value->>'productId', value->>'product_id')::UUID AS product_id,
        GREATEST(COALESCE((value->>'quantity')::INTEGER, 0), 0) AS quantity
      FROM jsonb_array_elements(v_order.items) AS value
    LOOP
      IF v_item.product_id IS NULL OR v_item.quantity <= 0 THEN
        CONTINUE;
      END IF;

      SELECT *
      INTO v_stock_result
      FROM public.decrement_stock_atomic(v_item.product_id, v_item.quantity);

      IF NOT COALESCE(v_stock_result.success, FALSE) THEN
        RAISE EXCEPTION '%', COALESCE(
          v_stock_result.error,
          format('Failed to decrement stock for product %s', v_item.product_id)
        );
      END IF;
    END LOOP;
  ELSIF v_order.quote_id IS NOT NULL THEN
    SELECT q.rfq_id
    INTO v_quote_rfq_id
    FROM public.quotes q
    WHERE q.id = v_order.quote_id;

    IF v_quote_rfq_id IS NOT NULL THEN
      FOR v_item IN
        SELECT product_id, quantity
        FROM public.rfq_items
        WHERE rfq_id = v_quote_rfq_id
      LOOP
        SELECT *
        INTO v_stock_result
        FROM public.decrement_stock_atomic(v_item.product_id, v_item.quantity);

        IF NOT COALESCE(v_stock_result.success, FALSE) THEN
          RAISE EXCEPTION '%', COALESCE(
            v_stock_result.error,
            format('Failed to decrement stock for product %s', v_item.product_id)
          );
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.order_documents
  SET
    verified_by = v_caller,
    verified_at = NOW(),
    updated_at = NOW()
  WHERE id = v_doc.id;

  UPDATE public.orders
  SET
    status = 'PENDING_PAYMENT',
    admin_verified = TRUE,
    admin_verified_by = v_caller,
    admin_verified_at = NOW(),
    updated_at = NOW()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.verify_client_po_and_confirm_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_client_po_and_confirm_order(UUID) TO service_role;

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase5_po_verification_payment_transition.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase6_order_status_transition_guard.sql
-- ============================================================================

-- ============================================================================
-- Phase 6: Enforce valid order status transitions at the database layer.
-- Prevents invalid direct updates from any client path.
-- Date: 2026-02-07
-- ============================================================================

CREATE OR REPLACE FUNCTION public.order_status_transition_is_valid(
  p_from public.order_status,
  p_to public.order_status
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from TEXT;
  v_to TEXT;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RETURN FALSE;
  END IF;

  v_from := p_from::TEXT;
  v_to := p_to::TEXT;

  IF p_from = p_to THEN
    RETURN TRUE;
  END IF;

  CASE v_from
    WHEN 'DRAFT', 'OPEN', 'QUOTED' THEN
      RETURN v_to IN ('PENDING_PO', 'CONFIRMED', 'CANCELLED', 'CLOSED');
    WHEN 'PENDING_PO' THEN
      RETURN v_to IN ('CONFIRMED', 'PENDING_PAYMENT', 'CANCELLED');
    WHEN 'CONFIRMED' THEN
      RETURN v_to IN ('PENDING_PAYMENT', 'CANCELLED');
    WHEN 'PENDING_PAYMENT' THEN
      RETURN v_to IN ('PENDING_PO', 'AWAITING_CONFIRMATION', 'PAYMENT_CONFIRMED', 'CANCELLED');
    WHEN 'AWAITING_CONFIRMATION' THEN
      RETURN v_to IN ('PENDING_PO', 'PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'CANCELLED');
    WHEN 'PAYMENT_CONFIRMED' THEN
      RETURN v_to IN (
        'PROCESSING',
        'READY_FOR_PICKUP',
        'PICKUP_SCHEDULED',
        'OUT_FOR_DELIVERY',
        'IN_TRANSIT',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED'
      );
    WHEN 'PROCESSING' THEN
      RETURN v_to IN (
        'READY_FOR_PICKUP',
        'PICKUP_SCHEDULED',
        'OUT_FOR_DELIVERY',
        'IN_TRANSIT',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED'
      );
    WHEN 'READY_FOR_PICKUP' THEN
      RETURN v_to IN ('PICKUP_SCHEDULED', 'OUT_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    WHEN 'PICKUP_SCHEDULED' THEN
      RETURN v_to IN ('OUT_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    WHEN 'OUT_FOR_DELIVERY' THEN
      RETURN v_to IN ('IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    WHEN 'SHIPPED' THEN
      RETURN v_to IN ('IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    WHEN 'IN_TRANSIT' THEN
      RETURN v_to IN ('DELIVERED', 'CANCELLED');
    WHEN 'DELIVERED' THEN
      RETURN FALSE;
    WHEN 'CLOSED' THEN
      RETURN FALSE;
    WHEN 'CANCELLED' THEN
      RETURN FALSE;
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.order_status_transition_is_valid(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_status_transition ON public.orders;

CREATE TRIGGER trg_enforce_order_status_transition
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_status_transition();

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase6_order_status_transition_guard.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase7_mark_order_as_paid_consistency.sql
-- ============================================================================

-- ============================================================================
-- Phase 7: Normalize mark_order_as_paid RPC behavior/signature after prior
-- migration redefinitions.
-- Date: 2026-02-08
-- ============================================================================

-- Backward-compatible 4-arg signature (legacy callers)
CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_admin_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can confirm payments';
  END IF;

  UPDATE public.orders
  SET
    status = 'PAYMENT_CONFIRMED',
    payment_confirmed_at = NOW(),
    payment_confirmed_by = v_caller,
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_notes = COALESCE(p_payment_notes, payment_notes),
    updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  UPDATE public.invoices
  SET
    status = 'PAID',
    paid_date = CURRENT_DATE
  WHERE order_id = p_order_id;

  RETURN v_order;
END;
$$;

-- Preferred 3-arg signature (auth-bound)
CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.mark_order_as_paid(
    p_order_id,
    auth.uid(),
    p_payment_reference,
    p_payment_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) TO authenticated;

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase7_mark_order_as_paid_consistency.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase8_reject_payment_submission_rpc.sql
-- ============================================================================

-- ============================================================================
-- Phase 8: Admin payment rejection RPC (auth-bound + atomic audit logging)
-- Date: 2026-02-08
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reject_payment_submission(
  p_order_id UUID,
  p_reason TEXT
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
  v_reason TEXT;
  v_admin_note TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can reject payment submissions';
  END IF;

  v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  v_admin_note := format('[Admin Action] Payment reference rejected: %s', v_reason);

  UPDATE public.orders
  SET
    status = 'PENDING_PAYMENT',
    payment_notes = CASE
      WHEN payment_notes IS NULL OR BTRIM(payment_notes) = '' THEN v_admin_note
      ELSE payment_notes || E'\n' || v_admin_note
    END,
    payment_confirmed_at = NULL,
    payment_confirmed_by = NULL,
    payment_submitted_at = NULL,
    updated_at = NOW()
  WHERE id = p_order_id
    AND status = 'AWAITING_CONFIRMATION'
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
      RAISE EXCEPTION 'Order is not awaiting confirmation';
    END IF;
    RAISE EXCEPTION 'Order not found';
  END IF;

  INSERT INTO public.payment_audit_logs (
    order_id,
    actor_user_id,
    actor_role,
    action,
    from_status,
    to_status,
    payment_reference,
    notes,
    metadata
  ) VALUES (
    v_order.id,
    v_caller,
    'ADMIN',
    'PAYMENT_REJECTED',
    'AWAITING_CONFIRMATION',
    'PENDING_PAYMENT',
    v_order.payment_reference,
    v_reason,
    jsonb_build_object(
      'source', 'rpc.reject_payment_submission'
    )
  );

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_payment_submission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_payment_submission(UUID, TEXT) TO authenticated;

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase8_reject_payment_submission_rpc.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: create_leads_and_custom_requests.sql
-- ============================================================================

-- ============================================================================
-- LEADS TABLE - Stores GetStarted/Contact Request submissions
-- ============================================================================

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  account_type TEXT NOT NULL CHECK (account_type IN ('client', 'supplier')),
  notes TEXT,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONTACTED', 'CONVERTED', 'REJECTED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  converted_user_id UUID REFERENCES users(id)
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Admin can do everything with leads
CREATE POLICY "Admin full access to leads" ON leads
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'ADMIN'
    )
  );

-- Allow inserting leads without authentication (public form)
CREATE POLICY "Anyone can submit leads" ON leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- ============================================================================
-- CUSTOM ITEM REQUESTS TABLE - For clients requesting non-catalog items
-- ============================================================================

CREATE TABLE IF NOT EXISTS custom_item_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id),
  item_name TEXT NOT NULL,
  description TEXT NOT NULL,
  specifications TEXT,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  target_price DECIMAL(12, 2),
  currency TEXT DEFAULT 'SAR',
  deadline DATE,
  priority TEXT DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  reference_images TEXT[],
  attachment_urls TEXT[],
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'ASSIGNED', 'QUOTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  admin_notes TEXT,
  assigned_to UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES users(id),
  supplier_quote_id UUID REFERENCES quotes(id),
  responded_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_custom_requests_client ON custom_item_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_custom_requests_status ON custom_item_requests(status);
CREATE INDEX IF NOT EXISTS idx_custom_requests_assigned ON custom_item_requests(assigned_to);

-- Enable RLS
ALTER TABLE custom_item_requests ENABLE ROW LEVEL SECURITY;

-- Clients can see their own requests
CREATE POLICY "Clients can view own requests" ON custom_item_requests
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Clients can create requests
CREATE POLICY "Clients can create requests" ON custom_item_requests
  FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid());

-- Clients can update their own pending requests
CREATE POLICY "Clients can update own pending requests" ON custom_item_requests
  FOR UPDATE TO authenticated
  USING (client_id = auth.uid() AND status = 'PENDING');

-- Admin can do everything
CREATE POLICY "Admin full access to custom requests" ON custom_item_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'ADMIN'
    )
  );

-- Suppliers can see requests assigned to them
CREATE POLICY "Suppliers can view assigned requests" ON custom_item_requests
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());

INSERT INTO public._migration_log (migration_name) VALUES ('create_leads_and_custom_requests.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase9_decimal_precision_standardization.sql
-- Purpose: Standardize all monetary columns to DECIMAL(12,2)
-- ============================================================================

-- Users table monetary columns
ALTER TABLE users
  ALTER COLUMN credit_limit TYPE DECIMAL(12, 2),
  ALTER COLUMN credit_used  TYPE DECIMAL(12, 2);

-- Products table monetary columns
ALTER TABLE products
  ALTER COLUMN cost_price     TYPE DECIMAL(12, 2),
  ALTER COLUMN retail_price   TYPE DECIMAL(12, 2),
  ALTER COLUMN stock_quantity TYPE INTEGER;

-- Quotes table monetary columns
ALTER TABLE quotes
  ALTER COLUMN unit_price    TYPE DECIMAL(12, 2),
  ALTER COLUMN total_price   TYPE DECIMAL(12, 2),
  ALTER COLUMN final_price   TYPE DECIMAL(12, 2),
  ALTER COLUMN shipping_cost TYPE DECIMAL(12, 2);

-- Orders table monetary columns
ALTER TABLE orders
  ALTER COLUMN total_amount TYPE DECIMAL(12, 2);

-- Standardize rating columns
ALTER TABLE users ALTER COLUMN rating TYPE DECIMAL(3, 2);

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase9_decimal_precision_standardization.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase10_admin_audit_log.sql
-- Purpose: General admin audit trail with automatic triggers
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin_id ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON admin_audit_log(created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies - admins can read all
CREATE POLICY "admins_can_read_audit_log"
  ON admin_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- No direct INSERT from client — only via RPC
CREATE POLICY "no_direct_write_audit_log"
  ON admin_audit_log FOR INSERT
  WITH CHECK (false);

-- RPC function to log admin actions (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION log_admin_action(
  p_action TEXT,
  p_target_type TEXT,
  p_target_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_details);
END;
$$;

-- Trigger: Log user role/status/credit changes
CREATE OR REPLACE FUNCTION audit_user_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN') THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(), 'USER_ROLE_CHANGED', 'user', NEW.id,
        jsonb_build_object('old_role', OLD.role::text, 'new_role', NEW.role::text)
      );
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(), 'USER_STATUS_CHANGED', 'user', NEW.id,
        jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text)
      );
    END IF;

    IF OLD.credit_limit IS DISTINCT FROM NEW.credit_limit THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(), 'CREDIT_LIMIT_CHANGED', 'user', NEW.id,
        jsonb_build_object('old_limit', OLD.credit_limit, 'new_limit', NEW.credit_limit)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_user_changes ON users;
CREATE TRIGGER trg_audit_user_changes
  AFTER UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION audit_user_changes();

-- Trigger: Log product approval/rejection
CREATE OR REPLACE FUNCTION audit_product_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN') THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(),
        CASE NEW.status::text
          WHEN 'APPROVED' THEN 'PRODUCT_APPROVED'
          WHEN 'REJECTED' THEN 'PRODUCT_REJECTED'
          ELSE 'PRODUCT_STATUS_CHANGED'
        END,
        'product', NEW.id,
        jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text, 'product_name', NEW.name)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_product_changes ON products;
CREATE TRIGGER trg_audit_product_changes
  AFTER UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION audit_product_changes();

-- Trigger: Log order status changes by admins
CREATE OR REPLACE FUNCTION audit_order_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN') THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(), 'ORDER_STATUS_CHANGED', 'order', NEW.id,
        jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_order_changes ON orders;
CREATE TRIGGER trg_audit_order_changes
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION audit_order_changes();

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase10_admin_audit_log.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase11_login_attempts_table.sql
-- Purpose: Login attempts tracking for auth rate limiting
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(attempted_at DESC);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup function
CREATE OR REPLACE FUNCTION prune_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '1 hour';
END;
$$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase11_login_attempts_table.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- END OF CONSOLIDATED MIGRATIONS
-- Total: 31 migrations
-- ============================================================================
