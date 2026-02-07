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
