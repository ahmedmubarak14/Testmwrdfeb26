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
