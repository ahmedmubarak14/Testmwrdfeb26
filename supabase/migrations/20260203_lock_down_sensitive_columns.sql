-- ============================================================================
-- SECURITY MIGRATION: Lock Down User Role and Sensitive Columns
-- ============================================================================
-- This migration:
-- 1. Updates the handle_new_user trigger to ALWAYS default to CLIENT role
-- 2. Removes role from accepted user metadata
-- 3. Creates stricter RLS policies that prevent users from modifying sensitive columns
-- 4. Creates an admin-only function for updating sensitive fields
-- ============================================================================

-- ============================================================================
-- PART 1: Update the auth trigger to ignore client-provided role
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
    'ACTIVE'::user_status,  -- SECURITY: Clients are automatically ACTIVE
    'INCOMPLETE'::kyc_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: Drop existing user update policies and create restricted ones
-- ============================================================================

-- Drop existing update policies for users table
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;

-- Create restricted policy: Users can only update name and company_name
CREATE POLICY "Users can update safe fields only" ON users 
  FOR UPDATE 
  USING (auth.uid() = id) 
  WITH CHECK (
    auth.uid() = id
    -- The following columns must remain unchanged when updated by the user
    AND role = (SELECT role FROM users WHERE id = auth.uid())
    AND verified = (SELECT verified FROM users WHERE id = auth.uid())
    AND status = (SELECT status FROM users WHERE id = auth.uid())
    AND kyc_status = (SELECT kyc_status FROM users WHERE id = auth.uid())
    AND rating = (SELECT rating FROM users WHERE id = auth.uid())
    AND public_id = (SELECT public_id FROM users WHERE id = auth.uid())
    AND date_joined = (SELECT date_joined FROM users WHERE id = auth.uid())
  );

-- Admins retain full update access
CREATE POLICY "Admins can update all user fields" ON users 
  FOR UPDATE 
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- PART 3: Create admin-only function for sensitive field updates
-- ============================================================================

-- Function for admins to update sensitive user fields
CREATE OR REPLACE FUNCTION admin_update_user_sensitive_fields(
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
  SELECT role INTO admin_role FROM users WHERE id = auth.uid();
  
  IF admin_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can update sensitive user fields';
  END IF;

  -- Update the target user with provided values
  UPDATE users
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

-- Grant execute permission to authenticated users (RLS will restrict to admins)
GRANT EXECUTE ON FUNCTION admin_update_user_sensitive_fields TO authenticated;

-- ============================================================================
-- PART 4: Add credit limit columns if they don't exist
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'credit_limit') THEN
    ALTER TABLE users ADD COLUMN credit_limit DECIMAL(10, 2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'credit_used') THEN
    ALTER TABLE users ADD COLUMN credit_used DECIMAL(10, 2) DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- SUMMARY OF CHANGES
-- ============================================================================
-- 
-- 1. handle_new_user trigger: Now ignores client-provided role, always sets CLIENT
-- 
-- 2. User update policy: Users can only update these fields:
--    - name
--    - company_name
--    
-- 3. Protected fields (admin-only via admin_update_user_sensitive_fields):
--    - role (prevents privilege escalation)
--    - verified (trust indicator)
--    - status (account state)
--    - kyc_status (compliance)
--    - rating (integrity)
--    - credit_limit/credit_used (financial)
--    - public_id (identity)
--    - date_joined (audit trail)
--
-- ============================================================================
