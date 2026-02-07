-- Function to adjust client credit limit securely
CREATE OR REPLACE FUNCTION admin_adjust_client_credit_limit(
  p_target_client_id UUID,
  p_adjustment_type TEXT, -- 'SET', 'INCREASE', 'DECREASE'
  p_adjustment_amount DECIMAL,
  p_adjustment_reason TEXT
)
RETURNS TABLE (
  id TEXT,
  client_id UUID,
  admin_id UUID,
  adjustment_type TEXT,
  adjustment_amount DECIMAL,
  change_amount DECIMAL,
  previous_limit DECIMAL,
  new_limit DECIMAL,
  reason TEXT,
  created_at TIMESTAMPTZ,
  admin_name TEXT -- Added to match return type expectation if needed, or join
) AS $$
DECLARE
  v_previous_limit DECIMAL;
  v_new_limit DECIMAL;
  v_change_amount DECIMAL;
  v_current_user_id UUID;
  v_admin_name TEXT;
  v_adjustment_id TEXT;
BEGIN
  -- Get current user (admin)
  v_current_user_id := auth.uid();
  
  -- Check if user is admin (optional, relies on RLS usually, but good to check)
  -- For now assuming RLS or calling context handles permission, but verification inside RP is safer
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_current_user_id AND role = 'ADMIN') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can adjust credit limits';
  END IF;

  -- Get Admin Name
  SELECT company_name INTO v_admin_name FROM public.users WHERE id = v_current_user_id;
  IF v_admin_name IS NULL THEN
     SELECT name INTO v_admin_name FROM public.users WHERE id = v_current_user_id;
  END IF;

  -- Lock the user row for update
  SELECT credit_limit INTO v_previous_limit
  FROM public.users
  WHERE id = p_target_client_id
  FOR UPDATE;

  IF v_previous_limit IS NULL THEN
    -- Initialize if null (though schema says default 0 usually)
    v_previous_limit := 0;
  END IF;

  -- Calculate new limit
  IF p_adjustment_type = 'SET' THEN
    v_new_limit := p_adjustment_amount;
    v_change_amount := v_new_limit - v_previous_limit;
  ELSIF p_adjustment_type = 'INCREASE' THEN
    v_new_limit := v_previous_limit + p_adjustment_amount;
    v_change_amount := p_adjustment_amount;
  ELSIF p_adjustment_type = 'DECREASE' THEN
    v_new_limit := v_previous_limit - p_adjustment_amount;
    IF v_new_limit < 0 THEN
      RAISE EXCEPTION 'Decrease amount exceeds current credit limit';
    END IF;
    v_change_amount := -p_adjustment_amount;
  ELSE
    RAISE EXCEPTION 'Invalid adjustment type: %', p_adjustment_type;
  END IF;

  -- Update User
  UPDATE public.users
  SET credit_limit = v_new_limit
  WHERE id = p_target_client_id;

  -- Generate ID
  v_adjustment_id := 'CLA-' || extract(epoch from now())::text;

  -- Insert Adjustment Record
  INSERT INTO public.credit_limit_adjustments (
    id,
    client_id,
    admin_id,
    adjustment_type,
    adjustment_amount,
    change_amount,
    previous_limit,
    new_limit,
    reason,
    created_at
  ) VALUES (
    v_adjustment_id,
    p_target_client_id,
    v_current_user_id,
    p_adjustment_type,
    p_adjustment_amount,
    v_change_amount,
    v_previous_limit,
    v_new_limit,
    p_adjustment_reason,
    NOW()
  );

  -- Return the adjustment record
  RETURN QUERY
  SELECT 
    v_adjustment_id as id,
    p_target_client_id as client_id,
    v_current_user_id as admin_id,
    p_adjustment_type as adjustment_type,
    p_adjustment_amount as adjustment_amount,
    v_change_amount as change_amount,
    v_previous_limit as previous_limit,
    v_new_limit as new_limit,
    p_adjustment_reason as reason,
    NOW() as created_at,
    v_admin_name as admin_name;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;
