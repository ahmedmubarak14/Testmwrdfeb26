-- Phase 10: General-purpose admin audit log
-- Tracks all sensitive admin operations for compliance and accountability

-- ============================================================================
-- 1. Create admin_audit_log table
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,  -- 'user', 'product', 'order', 'quote', 'rfq', 'payment', 'config'
  target_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. Indexes for efficient querying
-- ============================================================================
CREATE INDEX idx_audit_admin_id ON admin_audit_log(admin_id);
CREATE INDEX idx_audit_action ON admin_audit_log(action);
CREATE INDEX idx_audit_target ON admin_audit_log(target_type, target_id);
CREATE INDEX idx_audit_created_at ON admin_audit_log(created_at DESC);

-- ============================================================================
-- 3. RLS policies - admins can read all, system can write
-- ============================================================================
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_can_read_audit_log"
  ON admin_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- No direct INSERT/UPDATE/DELETE from client — only via RPC
CREATE POLICY "no_direct_write_audit_log"
  ON admin_audit_log FOR INSERT
  WITH CHECK (false);

-- ============================================================================
-- 4. RPC function to log admin actions (SECURITY DEFINER bypasses RLS)
-- ============================================================================
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
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_details);
END;
$$;

-- ============================================================================
-- 5. Automatic audit triggers for sensitive operations
-- ============================================================================

-- Trigger: Log user role/status changes
CREATE OR REPLACE FUNCTION audit_user_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only log if the change was made by an admin
  IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN') THEN
    -- Role change
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(), 'USER_ROLE_CHANGED', 'user', NEW.id,
        jsonb_build_object('old_role', OLD.role::text, 'new_role', NEW.role::text)
      );
    END IF;

    -- Status change
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(), 'USER_STATUS_CHANGED', 'user', NEW.id,
        jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text)
      );
    END IF;

    -- KYC status change
    IF OLD.kyc_status IS DISTINCT FROM NEW.kyc_status THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(), 'USER_KYC_CHANGED', 'user', NEW.id,
        jsonb_build_object('old_kyc', OLD.kyc_status::text, 'new_kyc', NEW.kyc_status::text)
      );
    END IF;

    -- Credit limit change
    IF OLD.credit_limit IS DISTINCT FROM NEW.credit_limit THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(), 'CREDIT_LIMIT_CHANGED', 'user', NEW.id,
        jsonb_build_object('old_limit', OLD.credit_limit, 'new_limit', NEW.credit_limit)
      );
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

-- Trigger: Log product approval/rejection
CREATE OR REPLACE FUNCTION audit_product_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN') THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(),
        CASE NEW.status::text
          WHEN 'APPROVED' THEN 'PRODUCT_APPROVED'
          WHEN 'REJECTED' THEN 'PRODUCT_REJECTED'
          ELSE 'PRODUCT_STATUS_CHANGED'
        END,
        'product', NEW.id,
        jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text, 'product_name', NEW.name)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_product_changes ON products;
CREATE TRIGGER trg_audit_product_changes
  AFTER UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION audit_product_changes();

-- Trigger: Log order status changes by admins
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
      VALUES (
        auth.uid(), 'ORDER_STATUS_CHANGED', 'order', NEW.id,
        jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text)
      );
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

COMMENT ON TABLE admin_audit_log IS 'General-purpose audit trail for all admin operations';
