-- ============================================
-- MWRD B2B Marketplace Database Schema
-- Complete schema for Supabase migration
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

-- Admins can update all users
CREATE POLICY "Admins can update all users"
  ON users FOR UPDATE
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

-- Suppliers can insert their own products
CREATE POLICY "Suppliers can insert own products"
  ON products FOR INSERT
  WITH CHECK (supplier_id = auth.uid());

-- Suppliers can update their own products
CREATE POLICY "Suppliers can update own products"
  ON products FOR UPDATE
  USING (supplier_id = auth.uid());

-- Admins can update all products (for approval)
CREATE POLICY "Admins can update all products"
  ON products FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Suppliers can delete their own products
CREATE POLICY "Suppliers can delete own products"
  ON products FOR DELETE
  USING (supplier_id = auth.uid());

-- RFQs: Clients can insert their own
CREATE POLICY "Clients can insert own RFQs"
  ON rfqs FOR INSERT
  WITH CHECK (client_id = auth.uid());

-- Clients can view their own RFQs
CREATE POLICY "Clients can view own RFQs"
  ON rfqs FOR SELECT
  USING (client_id = auth.uid());

-- Suppliers can view all RFQs (to quote)
CREATE POLICY "Suppliers can view all RFQs"
  ON rfqs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'SUPPLIER'
    )
  );

-- Admins can view all RFQs
CREATE POLICY "Admins can view all RFQs"
  ON rfqs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Clients can update their own RFQs
CREATE POLICY "Clients can update own RFQs"
  ON rfqs FOR UPDATE
  USING (client_id = auth.uid());

-- Quotes: Suppliers can insert their own
CREATE POLICY "Suppliers can insert own quotes"
  ON quotes FOR INSERT
  WITH CHECK (supplier_id = auth.uid());

-- Suppliers can view their own quotes
CREATE POLICY "Suppliers can view own quotes"
  ON quotes FOR SELECT
  USING (supplier_id = auth.uid());

-- Suppliers can update their own quotes
CREATE POLICY "Suppliers can update own quotes"
  ON quotes FOR UPDATE
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

-- Clients can update quotes for their RFQs (accepting)
CREATE POLICY "Clients can update quotes for their RFQs"
  ON quotes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rfqs
      WHERE rfqs.id = quotes.rfq_id AND rfqs.client_id = auth.uid()
    )
  );

-- Admins can view all quotes
CREATE POLICY "Admins can view all quotes"
  ON quotes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Admins can update all quotes (setting margins)
CREATE POLICY "Admins can update all quotes"
  ON quotes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Orders: Clients can view own orders
CREATE POLICY "Clients can view own orders"
  ON orders FOR SELECT
  USING (client_id = auth.uid());

-- Suppliers can view own orders
CREATE POLICY "Suppliers can view own orders"
  ON orders FOR SELECT
  USING (supplier_id = auth.uid());

-- Admins can view all orders
CREATE POLICY "Admins can view all orders"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- System can insert orders
CREATE POLICY "Authenticated can insert orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppliers can update their orders (status)
CREATE POLICY "Suppliers can update own orders"
  ON orders FOR UPDATE
  USING (supplier_id = auth.uid());

-- Admins can update all orders
CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

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
SELECT 'Database schema created successfully! You can now create users via Supabase Auth.' AS message;
