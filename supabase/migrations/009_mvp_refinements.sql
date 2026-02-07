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
