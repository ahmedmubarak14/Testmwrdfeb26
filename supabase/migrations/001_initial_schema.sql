-- MWRD Marketplace Database Schema
-- Initial migration: Create all tables, enums, and functions

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE user_role AS ENUM ('GUEST', 'CLIENT', 'SUPPLIER', 'ADMIN');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'REQUIRES_ATTENTION', 'DEACTIVATED');
CREATE TYPE kyc_status AS ENUM ('VERIFIED', 'IN_REVIEW', 'REJECTED', 'INCOMPLETE');
CREATE TYPE product_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE rfq_status AS ENUM ('OPEN', 'QUOTED', 'CLOSED');
CREATE TYPE quote_status AS ENUM ('PENDING_ADMIN', 'SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED');
CREATE TYPE order_status AS ENUM ('In Transit', 'Delivered', 'Cancelled');

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
