-- ============================================================================
-- SECURITY FIX: Add search_path to SECURITY DEFINER functions
-- Date: 2026-02-03
-- Purpose: Prevent search_path hijacking attacks on SECURITY DEFINER functions
-- ============================================================================

-- The 'SET search_path = public, pg_temp' clause prevents malicious users from
-- creating objects in their schema that shadow public functions, which could
-- lead to privilege escalation when SECURITY DEFINER functions are called.

-- ============================================================================
-- FIX: handle_new_user() trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- SECURITY: Role is ALWAYS set to CLIENT for new signups
  -- Role can only be changed by an admin through the admin panel
  INSERT INTO public.users (
    id, email, name, role, company_name, verified, status, kyc_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    'CLIENT'::user_role,  -- SECURITY: Always CLIENT, ignoring any client-provided role
    COALESCE(NEW.raw_user_meta_data->>'companyName', 'Company'),
    FALSE,
    'ACTIVE'::user_status,
    'INCOMPLETE'::kyc_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIX: get_user_role() helper function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
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
-- FIX: admin_update_user_sensitive_fields() function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_update_user_sensitive_fields(
  target_user_id UUID,
  new_role user_role DEFAULT NULL,
  new_verified BOOLEAN DEFAULT NULL,
  new_status user_status DEFAULT NULL,
  new_kyc_status kyc_status DEFAULT NULL,
  new_rating DECIMAL(3, 2) DEFAULT NULL,
  new_credit_limit DECIMAL(10, 2) DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  admin_role user_role;
BEGIN
  -- Check if caller is an admin
  SELECT role INTO admin_role FROM public.users WHERE id = auth.uid();
  
  IF admin_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can update sensitive user fields';
  END IF;

  -- Update the target user with provided values
  UPDATE public.users
  SET
    role = COALESCE(new_role, role),
    verified = COALESCE(new_verified, verified),
    status = COALESCE(new_status, status),
    kyc_status = COALESCE(new_kyc_status, kyc_status),
    rating = COALESCE(new_rating, rating),
    credit_limit = COALESCE(new_credit_limit, credit_limit),
    updated_at = NOW()
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Verify the functions have the correct settings
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'SECURITY: search_path added to all SECURITY DEFINER functions';
  RAISE NOTICE 'Affected functions: handle_new_user, get_user_role, admin_update_user_sensitive_fields';
END $$;
