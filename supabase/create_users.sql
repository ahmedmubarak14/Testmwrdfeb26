-- =============================================================================
-- CREATE INITIAL USERS
-- =============================================================================
-- Your database tables already exist. 
-- Just create the users via the Supabase Dashboard UI instead of SQL.
-- 
-- Go to: Authentication → Users → Add User
-- Create these 3 users with the following details:
-- =============================================================================

-- USER 1: ADMIN
-- Email: admin+demo@example.com
-- Password: CHANGE_ME_ADMIN_PASSWORD
-- User Metadata (paste this JSON):
-- {"name": "Admin User", "role": "ADMIN", "companyName": "MWRD HQ"}

-- USER 2: CLIENT  
-- Email: client+demo@example.com
-- Password: CHANGE_ME_CLIENT_PASSWORD
-- User Metadata (paste this JSON):
-- {"name": "Client User", "role": "CLIENT", "companyName": "Tech Solutions"}

-- USER 3: SUPPLIER (Vendor)
-- Email: supplier+demo@example.com
-- Password: CHANGE_ME_SUPPLIER_PASSWORD
-- User Metadata (paste this JSON):
-- {"name": "Vendor User", "role": "SUPPLIER", "companyName": "Global Parts Inc"}

-- =============================================================================
-- IMPORTANT: The auth trigger (handle_new_user) will automatically create 
-- the user profiles in the "users" table when you add users via the UI.
-- =============================================================================

-- If the auth trigger doesn't exist, run this first:
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $func$
    BEGIN
      INSERT INTO public.users (id, email, name, role, company_name, verified, status, kyc_status)
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
        'CLIENT'::user_role,
        COALESCE(NEW.raw_user_meta_data->>'companyName', 'Company'),
        FALSE,
        'ACTIVE'::user_status,
        'INCOMPLETE'::kyc_status
      );
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT ALL ON public.users TO supabase_auth_admin;
  END IF;
END $$;
