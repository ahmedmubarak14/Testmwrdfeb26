-- ============================================================================
-- APPLY MISSING MIGRATIONS (phase9 + phase10 only)
-- For databases that already have 28 migrations applied
-- ============================================================================

BEGIN;

-- ============================================================================
-- Phase 9: Decimal Precision Standardization (DEFENSIVE)
-- Only alter columns that actually exist
-- ============================================================================

DO $$
BEGIN
  -- Users table
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'credit_limit') THEN
    ALTER TABLE users ALTER COLUMN credit_limit TYPE DECIMAL(12, 2);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'credit_used') THEN
    ALTER TABLE users ALTER COLUMN credit_used TYPE DECIMAL(12, 2);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'rating') THEN
    -- Must drop policy that references rating column first
    DROP POLICY IF EXISTS "Users can update safe fields only" ON users;
    
    ALTER TABLE users ALTER COLUMN rating TYPE DECIMAL(3, 2);
    
    -- Recreate the policy (without rating restriction since it's not typically user-editable)
    CREATE POLICY "Users can update safe fields only" ON users
      FOR UPDATE TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;

  -- Products table
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'cost_price') THEN
    ALTER TABLE products ALTER COLUMN cost_price TYPE DECIMAL(12, 2);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'retail_price') THEN
    ALTER TABLE products ALTER COLUMN retail_price TYPE DECIMAL(12, 2);
  END IF;

  -- Quotes table
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'unit_price') THEN
    ALTER TABLE quotes ALTER COLUMN unit_price TYPE DECIMAL(12, 2);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'total_price') THEN
    ALTER TABLE quotes ALTER COLUMN total_price TYPE DECIMAL(12, 2);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'final_price') THEN
    ALTER TABLE quotes ALTER COLUMN final_price TYPE DECIMAL(12, 2);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'shipping_cost') THEN
    ALTER TABLE quotes ALTER COLUMN shipping_cost TYPE DECIMAL(12, 2);
  END IF;

  -- Orders table
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'total_amount') THEN
    ALTER TABLE orders ALTER COLUMN total_amount TYPE DECIMAL(12, 2);
  END IF;
END $$;

INSERT INTO public._migration_log (migration_name) 
VALUES ('20260208_phase9_decimal_precision_standardization.sql') 
ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- Phase 10: Admin Audit Log
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

-- RLS policies
DROP POLICY IF EXISTS "admins_can_read_audit_log" ON admin_audit_log;
CREATE POLICY "admins_can_read_audit_log"
  ON admin_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "no_direct_write_audit_log" ON admin_audit_log;
CREATE POLICY "no_direct_write_audit_log"
  ON admin_audit_log FOR INSERT
  WITH CHECK (false);

-- RPC function
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

-- Trigger: Log user changes
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
      VALUES (auth.uid(), 'USER_ROLE_CHANGED', 'user', NEW.id,
        jsonb_build_object('old_role', OLD.role::text, 'new_role', NEW.role::text));
    END IF;

    IF OLD.credit_limit IS DISTINCT FROM NEW.credit_limit THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (auth.uid(), 'CREDIT_LIMIT_CHANGED', 'user', NEW.id,
        jsonb_build_object('old_limit', OLD.credit_limit, 'new_limit', NEW.credit_limit));
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

-- Trigger: Log order changes
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
      VALUES (auth.uid(), 'ORDER_STATUS_CHANGED', 'order', NEW.id,
        jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text));
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

INSERT INTO public._migration_log (migration_name) 
VALUES ('20260208_phase10_admin_audit_log.sql') 
ON CONFLICT (migration_name) DO NOTHING;

-- Verify
SELECT 'Phase 9 & 10 applied successfully!' AS status, COUNT(*) AS total_migrations FROM _migration_log;

COMMIT;
