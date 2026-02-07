-- Phase 9: Standardize decimal precision across all monetary columns
-- All monetary/financial columns → DECIMAL(12,2) for consistency
-- Rating columns → DECIMAL(3,2) for consistency

-- ============================================================================
-- 1. Standardize monetary columns on users table
-- ============================================================================
ALTER TABLE users
  ALTER COLUMN credit_limit TYPE DECIMAL(12, 2),
  ALTER COLUMN credit_used  TYPE DECIMAL(12, 2);

-- ============================================================================
-- 2. Standardize monetary columns on products table
-- ============================================================================
ALTER TABLE products
  ALTER COLUMN cost_price     TYPE DECIMAL(12, 2),
  ALTER COLUMN retail_price   TYPE DECIMAL(12, 2),
  ALTER COLUMN stock_quantity TYPE INTEGER;

-- ============================================================================
-- 3. Standardize monetary columns on quotes table
-- ============================================================================
ALTER TABLE quotes
  ALTER COLUMN unit_price    TYPE DECIMAL(12, 2),
  ALTER COLUMN total_price   TYPE DECIMAL(12, 2),
  ALTER COLUMN final_price   TYPE DECIMAL(12, 2),
  ALTER COLUMN shipping_cost TYPE DECIMAL(12, 2);

-- ============================================================================
-- 4. Standardize monetary columns on orders table
-- ============================================================================
ALTER TABLE orders
  ALTER COLUMN total_amount TYPE DECIMAL(12, 2);

-- ============================================================================
-- 5. Standardize monetary columns on rfq_items table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rfq_items' AND column_name = 'target_price'
  ) THEN
    ALTER TABLE rfq_items ALTER COLUMN target_price TYPE DECIMAL(12, 2);
  END IF;
END $$;

-- ============================================================================
-- 6. Standardize monetary columns on payments table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'payments'
  ) THEN
    EXECUTE 'ALTER TABLE payments ALTER COLUMN amount TYPE DECIMAL(12, 2)';

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'payments' AND column_name = 'tax_amount'
    ) THEN
      EXECUTE 'ALTER TABLE payments ALTER COLUMN tax_amount TYPE DECIMAL(12, 2)';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'payments' AND column_name = 'subtotal'
    ) THEN
      EXECUTE 'ALTER TABLE payments ALTER COLUMN subtotal TYPE DECIMAL(12, 2)';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 7. Standardize monetary columns on invoices table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices'
  ) THEN
    EXECUTE 'ALTER TABLE invoices ALTER COLUMN amount TYPE DECIMAL(12, 2)';

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'tax_amount'
    ) THEN
      EXECUTE 'ALTER TABLE invoices ALTER COLUMN tax_amount TYPE DECIMAL(12, 2)';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'total_amount'
    ) THEN
      EXECUTE 'ALTER TABLE invoices ALTER COLUMN total_amount TYPE DECIMAL(12, 2)';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 8. Standardize monetary columns on refunds table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'refunds'
  ) THEN
    EXECUTE 'ALTER TABLE refunds ALTER COLUMN amount TYPE DECIMAL(12, 2)';
  END IF;
END $$;

-- ============================================================================
-- 9. Standardize monetary columns on custom_item_requests
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_item_requests' AND column_name = 'target_price'
  ) THEN
    ALTER TABLE custom_item_requests ALTER COLUMN target_price TYPE DECIMAL(12, 2);
  END IF;
END $$;

-- ============================================================================
-- 10. Standardize credit_limit_adjustments table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'credit_limit_adjustments'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'credit_limit_adjustments' AND column_name = 'previous_limit'
    ) THEN
      EXECUTE 'ALTER TABLE credit_limit_adjustments ALTER COLUMN previous_limit TYPE DECIMAL(12, 2)';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'credit_limit_adjustments' AND column_name = 'new_limit'
    ) THEN
      EXECUTE 'ALTER TABLE credit_limit_adjustments ALTER COLUMN new_limit TYPE DECIMAL(12, 2)';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'credit_limit_adjustments' AND column_name = 'adjustment_amount'
    ) THEN
      EXECUTE 'ALTER TABLE credit_limit_adjustments ALTER COLUMN adjustment_amount TYPE DECIMAL(12, 2)';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 11. Standardize rating columns → DECIMAL(3,2) everywhere
-- ============================================================================
ALTER TABLE users ALTER COLUMN rating TYPE DECIMAL(3, 2);

-- ============================================================================
-- 12. Update RPC function signatures to match new precision
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_update_user_sensitive_fields(
  target_user_id UUID,
  new_role user_role DEFAULT NULL,
  new_status user_status DEFAULT NULL,
  new_kyc_status kyc_status DEFAULT NULL,
  new_rating DECIMAL(3, 2) DEFAULT NULL,
  new_credit_limit DECIMAL(12, 2) DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only allow authenticated admins
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  UPDATE users SET
    role         = COALESCE(new_role, role),
    status       = COALESCE(new_status, status),
    kyc_status   = COALESCE(new_kyc_status, kyc_status),
    rating       = COALESCE(new_rating, rating),
    credit_limit = COALESCE(new_credit_limit, credit_limit),
    updated_at   = NOW()
  WHERE id = target_user_id;
END;
$$;

COMMENT ON MIGRATION IS 'Phase 9: Standardize all monetary columns to DECIMAL(12,2) and rating to DECIMAL(3,2)';
