-- Add client_margin column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_margin DECIMAL(5, 2);

-- Function to set client margin securely
CREATE OR REPLACE FUNCTION admin_set_client_margin(
  p_client_id UUID,
  p_margin DECIMAL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_user_id UUID;
  v_user_role user_role;
BEGIN
  -- Get current user
  v_current_user_id := auth.uid();
  
  -- Check if user is admin
  SELECT role INTO v_user_role FROM public.users WHERE id = v_current_user_id;
  
  IF v_user_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can set client margins';
  END IF;

  -- Validate margin
  IF p_margin < 0 OR p_margin > 100 THEN
    RAISE EXCEPTION 'Invalid margin: Must be between 0 and 100';
  END IF;

  -- Update User
  UPDATE public.users
  SET client_margin = p_margin,
      updated_at = NOW()
  WHERE id = p_client_id;

  RETURN jsonb_build_object(
    'success', true,
    'clientId', p_client_id,
    'margin', p_margin
  );
END;
$$ LANGUAGE plpgsql;
