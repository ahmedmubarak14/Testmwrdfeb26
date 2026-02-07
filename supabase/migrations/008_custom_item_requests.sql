-- ============================================================================
-- MWRD MARKETPLACE - CUSTOM ITEM REQUESTS
-- Allow clients to request items not in the marketplace
-- ============================================================================

-- Custom request status enum
CREATE TYPE custom_request_status AS ENUM (
  'PENDING',        -- Submitted by client, awaiting admin review
  'UNDER_REVIEW',   -- Admin reviewing the request
  'ASSIGNED',       -- Assigned to supplier(s) for quoting
  'QUOTED',         -- Supplier provided quote
  'APPROVED',       -- Client approved quote, order created
  'REJECTED',       -- Request rejected
  'CANCELLED'       -- Client cancelled request
);

-- Request priority enum
CREATE TYPE request_priority AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT'
);

-- ============================================================================
-- CUSTOM ITEM REQUESTS TABLE
-- ============================================================================
CREATE TABLE custom_item_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Client who requested
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Request details
  item_name TEXT NOT NULL,
  description TEXT NOT NULL,
  specifications TEXT,
  category TEXT,

  -- Quantity and pricing
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  target_price DECIMAL(10, 2),  -- Client's budget/target price
  currency TEXT NOT NULL DEFAULT 'SAR',

  -- Additional info
  deadline DATE,  -- When client needs it by
  priority request_priority NOT NULL DEFAULT 'MEDIUM',
  reference_images TEXT[],  -- Array of image URLs
  attachment_urls TEXT[],   -- Documents, specs, etc.

  -- Status tracking
  status custom_request_status NOT NULL DEFAULT 'PENDING',

  -- Admin notes
  admin_notes TEXT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,  -- Assigned supplier
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- Admin who assigned

  -- Response
  supplier_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_custom_requests_client_id ON custom_item_requests(client_id);
CREATE INDEX idx_custom_requests_status ON custom_item_requests(status);
CREATE INDEX idx_custom_requests_assigned_to ON custom_item_requests(assigned_to);
CREATE INDEX idx_custom_requests_created_at ON custom_item_requests(created_at DESC);
CREATE INDEX idx_custom_requests_priority ON custom_item_requests(priority);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_custom_requests_updated_at
  BEFORE UPDATE ON custom_item_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update assigned_at when assigned
CREATE OR REPLACE FUNCTION update_assignment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND OLD.assigned_to IS NULL THEN
    NEW.assigned_at := NOW();
    NEW.status := 'ASSIGNED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_update_assignment
  BEFORE UPDATE OF assigned_to ON custom_item_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_assignment_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE custom_item_requests ENABLE ROW LEVEL SECURITY;

-- Clients can view own requests
CREATE POLICY "Clients can view own requests" ON custom_item_requests
  FOR SELECT USING (auth.uid() = client_id);

-- Clients can create requests
CREATE POLICY "Clients can create requests" ON custom_item_requests
  FOR INSERT WITH CHECK (auth.uid() = client_id AND get_user_role() = 'CLIENT');

-- Clients can update own pending requests
CREATE POLICY "Clients can update own pending requests" ON custom_item_requests
  FOR UPDATE USING (
    auth.uid() = client_id AND
    status IN ('PENDING', 'UNDER_REVIEW')
  );

-- Assigned suppliers can view their requests
CREATE POLICY "Suppliers can view assigned requests" ON custom_item_requests
  FOR SELECT USING (auth.uid() = assigned_to);

-- Admins can view all requests
CREATE POLICY "Admins can view all requests" ON custom_item_requests
  FOR SELECT USING (get_user_role() = 'ADMIN');

-- Admins can update all requests
CREATE POLICY "Admins can update all requests" ON custom_item_requests
  FOR UPDATE USING (get_user_role() = 'ADMIN');

-- Admins can delete requests
CREATE POLICY "Admins can delete requests" ON custom_item_requests
  FOR DELETE USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to assign request to supplier
CREATE OR REPLACE FUNCTION assign_custom_request(
  p_request_id UUID,
  p_supplier_id UUID,
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS custom_item_requests
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request custom_item_requests;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Verify admin role
  IF (SELECT role FROM users WHERE id = v_caller) != 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can assign requests';
  END IF;

  -- Verify supplier role
  IF (SELECT role FROM users WHERE id = p_supplier_id) != 'SUPPLIER' THEN
    RAISE EXCEPTION 'Can only assign to suppliers';
  END IF;

  -- Update request
  UPDATE custom_item_requests
  SET
    assigned_to = p_supplier_id,
    assigned_by = v_caller,
    admin_notes = COALESCE(p_notes, admin_notes),
    status = 'ASSIGNED',
    updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$ LANGUAGE plpgsql;

-- Function to get pending requests count for admin
CREATE OR REPLACE FUNCTION get_pending_requests_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM custom_item_requests
    WHERE status IN ('PENDING', 'UNDER_REVIEW')
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get client's request summary
CREATE OR REPLACE FUNCTION get_client_request_summary(p_client_id UUID)
RETURNS JSON AS $$
DECLARE
  v_summary JSON;
BEGIN
  SELECT json_build_object(
    'total', COUNT(*),
    'pending', COUNT(*) FILTER (WHERE status = 'PENDING'),
    'under_review', COUNT(*) FILTER (WHERE status = 'UNDER_REVIEW'),
    'assigned', COUNT(*) FILTER (WHERE status = 'ASSIGNED'),
    'quoted', COUNT(*) FILTER (WHERE status = 'QUOTED'),
    'approved', COUNT(*) FILTER (WHERE status = 'APPROVED')
  ) INTO v_summary
  FROM custom_item_requests
  WHERE client_id = p_client_id;

  RETURN v_summary;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'Custom Item Requests System Setup Complete!' as message;

-- Show custom request statuses
SELECT
  status,
  COUNT(*) as count
FROM custom_item_requests
GROUP BY status
ORDER BY status;
