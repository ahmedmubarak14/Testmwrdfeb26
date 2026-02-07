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
