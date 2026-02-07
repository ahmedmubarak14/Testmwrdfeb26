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
