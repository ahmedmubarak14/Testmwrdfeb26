-- =============================================================================
-- MWRD COMPLETE DATABASE SETUP
-- =============================================================================
-- Run this script in your Supabase SQL Editor to set up the complete database
-- Go to: Supabase Dashboard > SQL Editor > New Query
-- =============================================================================

-- ============================================================================
-- PART 1: ENUMS
-- ============================================================================

CREATE TYPE user_role AS ENUM ('GUEST', 'CLIENT', 'SUPPLIER', 'ADMIN');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'REQUIRES_ATTENTION', 'DEACTIVATED');
CREATE TYPE kyc_status AS ENUM ('VERIFIED', 'IN_REVIEW', 'REJECTED', 'INCOMPLETE');
CREATE TYPE product_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE rfq_status AS ENUM ('OPEN', 'QUOTED', 'CLOSED');
CREATE TYPE quote_status AS ENUM ('PENDING_ADMIN', 'SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED');
CREATE TYPE order_status AS ENUM ('In Transit', 'Delivered', 'Cancelled');

-- ============================================================================
-- PART 2: HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_public_id(prefix TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN prefix || '-' || floor(random() * 9000 + 1000)::TEXT;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: TABLES
-- ============================================================================

-- Users table
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

-- RFQs table
CREATE TABLE rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status rfq_status NOT NULL DEFAULT 'OPEN',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RFQ Items table
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

-- Margin Settings table
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
-- PART 4: INDEXES
-- ============================================================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_public_id ON users(public_id);
CREATE INDEX idx_products_supplier_id ON products(supplier_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_rfqs_client_id ON rfqs(client_id);
CREATE INDEX idx_rfqs_status ON rfqs(status);
CREATE INDEX idx_quotes_rfq_id ON quotes(rfq_id);
CREATE INDEX idx_quotes_supplier_id ON quotes(supplier_id);
CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_supplier_id ON orders(supplier_id);

-- ============================================================================
-- PART 5: TRIGGERS
-- ============================================================================

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rfqs_updated_at BEFORE UPDATE ON rfqs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_margin_settings_updated_at BEFORE UPDATE ON margin_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate public ID
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

CREATE TRIGGER auto_public_id_trigger BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION auto_generate_public_id();

-- Auto-calculate final price
CREATE OR REPLACE FUNCTION calculate_final_price()
RETURNS TRIGGER AS $$
BEGIN
  NEW.final_price := NEW.supplier_price * (1 + NEW.margin_percent / 100);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_quote_final_price BEFORE INSERT OR UPDATE OF supplier_price, margin_percent ON quotes FOR EACH ROW EXECUTE FUNCTION calculate_final_price();

-- Default margin setting
INSERT INTO margin_settings (category, margin_percent, is_default) VALUES (NULL, 15.00, TRUE);

-- ============================================================================
-- PART 6: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_settings ENABLE ROW LEVEL SECURITY;

-- Helper function for user role
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

-- Users policies
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can view all users" ON users FOR SELECT USING (get_user_role() = 'ADMIN');
CREATE POLICY "Admins can update all users" ON users FOR UPDATE USING (get_user_role() = 'ADMIN');
CREATE POLICY "Admins can delete users" ON users FOR DELETE USING (get_user_role() = 'ADMIN');
CREATE POLICY "Users can insert own profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Products policies
CREATE POLICY "Anyone can view approved products" ON products FOR SELECT USING (status = 'APPROVED');
CREATE POLICY "Suppliers can view own products" ON products FOR SELECT USING (auth.uid() = supplier_id);
CREATE POLICY "Suppliers can create products" ON products FOR INSERT WITH CHECK (auth.uid() = supplier_id AND get_user_role() = 'SUPPLIER');
CREATE POLICY "Suppliers can update own products" ON products FOR UPDATE USING (auth.uid() = supplier_id) WITH CHECK (auth.uid() = supplier_id);
CREATE POLICY "Admins can view all products" ON products FOR SELECT USING (get_user_role() = 'ADMIN');
CREATE POLICY "Admins can update all products" ON products FOR UPDATE USING (get_user_role() = 'ADMIN');
CREATE POLICY "Admins can delete any product" ON products FOR DELETE USING (get_user_role() = 'ADMIN');

-- RFQs policies
CREATE POLICY "Clients can view own RFQs" ON rfqs FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "Clients can create RFQs" ON rfqs FOR INSERT WITH CHECK (auth.uid() = client_id AND get_user_role() = 'CLIENT');
CREATE POLICY "Admins can view all RFQs" ON rfqs FOR SELECT USING (get_user_role() = 'ADMIN');
CREATE POLICY "Admins can update all RFQs" ON rfqs FOR UPDATE USING (get_user_role() = 'ADMIN');

-- RFQ Items policies
CREATE POLICY "Clients can view own RFQ items" ON rfq_items FOR SELECT USING (EXISTS (SELECT 1 FROM rfqs WHERE rfqs.id = rfq_items.rfq_id AND rfqs.client_id = auth.uid()));
CREATE POLICY "Clients can create RFQ items" ON rfq_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM rfqs WHERE rfqs.id = rfq_items.rfq_id AND rfqs.client_id = auth.uid()));
CREATE POLICY "Admins can view all RFQ items" ON rfq_items FOR SELECT USING (get_user_role() = 'ADMIN');

-- Quotes policies
CREATE POLICY "Suppliers can view own quotes" ON quotes FOR SELECT USING (auth.uid() = supplier_id);
CREATE POLICY "Clients can view quotes for their RFQs" ON quotes FOR SELECT USING (status IN ('SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED') AND EXISTS (SELECT 1 FROM rfqs WHERE rfqs.id = quotes.rfq_id AND rfqs.client_id = auth.uid()));
CREATE POLICY "Admins can view all quotes" ON quotes FOR SELECT USING (get_user_role() = 'ADMIN');
CREATE POLICY "Admins can update all quotes" ON quotes FOR UPDATE USING (get_user_role() = 'ADMIN');

-- Orders policies
CREATE POLICY "Clients can view own orders" ON orders FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "Suppliers can view fulfillment orders" ON orders FOR SELECT USING (auth.uid() = supplier_id);
CREATE POLICY "Admins can view all orders" ON orders FOR SELECT USING (get_user_role() = 'ADMIN');
CREATE POLICY "Admins can update all orders" ON orders FOR UPDATE USING (get_user_role() = 'ADMIN');
CREATE POLICY "Admins can create orders" ON orders FOR INSERT WITH CHECK (get_user_role() = 'ADMIN');

-- Margin settings policies
CREATE POLICY "Admins can view margin settings" ON margin_settings FOR SELECT USING (get_user_role() = 'ADMIN');
CREATE POLICY "Admins can create margin settings" ON margin_settings FOR INSERT WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Admins can update margin settings" ON margin_settings FOR UPDATE USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- PART 7: AUTH TRIGGER (Auto-create user profile on signup)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, company_name, verified, status, kyc_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    'CLIENT'::user_role,
    COALESCE(NEW.raw_user_meta_data->>'companyName', 'Company'),
    FALSE,
    'ACTIVE'::user_status,
    'INCOMPLETE'::kyc_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON public.users TO supabase_auth_admin;

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
-- Now go to Authentication > Users and create your users manually, or use the
-- Supabase client to sign up users programmatically.
-- ============================================================================
