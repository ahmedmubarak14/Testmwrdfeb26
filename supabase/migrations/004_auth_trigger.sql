-- Auto-create user profile when a new user signs up via Supabase Auth
-- This trigger creates a profile in the users table when auth.users gets a new entry

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    name,
    role,
    company_name,
    verified,
    status,
    kyc_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'CLIENT'),
    COALESCE(NEW.raw_user_meta_data->>'companyName', 'Company'),
    FALSE,
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'CLIENT') = 'SUPPLIER' THEN 'PENDING'::user_status
      ELSE 'ACTIVE'::user_status
    END,
    'INCOMPLETE'::kyc_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function on new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON public.users TO supabase_auth_admin;
