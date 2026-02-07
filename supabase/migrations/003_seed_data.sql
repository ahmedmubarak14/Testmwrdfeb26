-- MWRD Marketplace Seed Data
-- This migration inserts initial demo data for testing
-- NOTE: Run this AFTER creating users through Supabase Auth

-- ============================================================================
-- CATEGORIES FOR MARGIN SETTINGS
-- ============================================================================

INSERT INTO margin_settings (category, margin_percent, is_default)
VALUES
  ('Footwear', 12.00, FALSE),
  ('Electronics', 15.00, FALSE),
  ('Furniture', 10.00, FALSE),
  ('Accessories', 18.00, FALSE),
  ('Kitchenware', 14.00, FALSE),
  ('Industrial', 8.00, FALSE),
  ('Safety Gear', 20.00, FALSE),
  ('Electrical', 12.00, FALSE)
ON CONFLICT (category) DO NOTHING;

-- ============================================================================
-- NOTE: User creation must be done through Supabase Auth
-- The following is a reference for the user structure
-- ============================================================================

/*
After creating users through Supabase Auth (signUp), insert their profiles:

Example for creating a test admin user:
1. Create user in Supabase Auth
2. Insert into users table:

INSERT INTO users (id, email, name, role, company_name, verified, status, kyc_status)
VALUES (
  'auth-user-id-here',
  'admin+demo@example.com',
  'Admin Alice',
  'ADMIN',
  'MWRD HQ',
  TRUE,
  'ACTIVE',
  'VERIFIED'
);
*/

-- ============================================================================
-- HELPER FUNCTION: Create demo user profile (call after Auth signup)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_user_profile(
  p_user_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_role user_role,
  p_company_name TEXT,
  p_verified BOOLEAN DEFAULT FALSE,
  p_status user_status DEFAULT 'PENDING',
  p_kyc_status kyc_status DEFAULT 'INCOMPLETE'
)
RETURNS users
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_user users;
BEGIN
  INSERT INTO users (id, email, name, role, company_name, verified, status, kyc_status)
  VALUES (p_user_id, p_email, p_name, p_role, p_company_name, p_verified, p_status, p_kyc_status)
  RETURNING * INTO new_user;

  RETURN new_user;
END;
$$ LANGUAGE plpgsql;
