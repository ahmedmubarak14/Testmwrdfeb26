-- ============================================================================
-- MWRD MARKETPLACE - TEST USERS
-- Creates 3 test users: Client, Supplier, Admin
-- ============================================================================

-- NOTE: This uses Supabase's admin functions to create auth users
-- Run this in Supabase SQL Editor after running the main migration

-- Function to create a complete user (auth + profile)
CREATE OR REPLACE FUNCTION create_test_user(
  p_email TEXT,
  p_password TEXT,
  p_name TEXT,
  p_role user_role,
  p_company_name TEXT,
  p_verified BOOLEAN DEFAULT TRUE,
  p_status user_status DEFAULT 'ACTIVE',
  p_kyc_status kyc_status DEFAULT 'VERIFIED'
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_user_id UUID;
BEGIN
  -- Create auth user
  new_user_id := extensions.uuid_generate_v4();

  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_name, 'role', p_role, 'companyName', p_company_name),
    FALSE,
    'authenticated'
  );

  -- Create user profile
  INSERT INTO public.users (
    id,
    email,
    name,
    role,
    company_name,
    verified,
    status,
    kyc_status
  ) VALUES (
    new_user_id,
    p_email,
    p_name,
    p_role,
    p_company_name,
    p_verified,
    p_status,
    p_kyc_status
  );

  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CREATE TEST USERS
-- ============================================================================

-- 1. CLIENT USER
-- SECURITY: Replace with non-production credentials before execution
SELECT create_test_user(
  'client+seed@example.com',
  'CHANGE_ME_CLIENT_PASSWORD',
  'John Client',
  'CLIENT',
  'Tech Solutions Ltd',
  TRUE,
  'ACTIVE',
  'VERIFIED'
);

-- 2. SUPPLIER USER
-- SECURITY: Replace with non-production credentials before execution
SELECT create_test_user(
  'supplier+seed@example.com',
  'CHANGE_ME_SUPPLIER_PASSWORD',
  'Sarah Supplier',
  'SUPPLIER',
  'Global Parts Inc',
  TRUE,
  'APPROVED',
  'VERIFIED'
);

-- 3. ADMIN USER
-- SECURITY: Replace with non-production credentials before execution
SELECT create_test_user(
  'admin+seed@example.com',
  'CHANGE_ME_ADMIN_PASSWORD',
  'Admin Alice',
  'ADMIN',
  'MWRD HQ',
  TRUE,
  'ACTIVE',
  'VERIFIED'
);

-- ============================================================================
-- VERIFY USERS CREATED
-- ============================================================================

SELECT
  id,
  email,
  name,
  role,
  company_name,
  status,
  verified
FROM users
ORDER BY role;

-- ============================================================================
-- TEST CREDENTIALS (REPLACE BEFORE RUNNING)
-- ============================================================================
-- CLIENT:   client+seed@example.com   / CHANGE_ME_CLIENT_PASSWORD
-- SUPPLIER: supplier+seed@example.com / CHANGE_ME_SUPPLIER_PASSWORD
-- ADMIN:    admin+seed@example.com    / CHANGE_ME_ADMIN_PASSWORD
-- ============================================================================
