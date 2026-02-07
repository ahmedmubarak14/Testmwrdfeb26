-- ============================================================================
-- CREDIT LIMIT ADJUSTMENTS + AUDIT TRAIL
-- Date: 2026-02-05
-- ============================================================================

-- Persist every admin credit-limit change for audit and client visibility.
CREATE TABLE IF NOT EXISTS public.credit_limit_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('SET', 'INCREASE', 'DECREASE')),
  adjustment_amount DECIMAL(12, 2) NOT NULL CHECK (adjustment_amount >= 0),
  change_amount DECIMAL(12, 2) NOT NULL,
  previous_limit DECIMAL(12, 2) NOT NULL CHECK (previous_limit >= 0),
  new_limit DECIMAL(12, 2) NOT NULL CHECK (new_limit >= 0),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_limit_adjustments_client_created_at
  ON public.credit_limit_adjustments (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_limit_adjustments_admin_created_at
  ON public.credit_limit_adjustments (admin_id, created_at DESC);

ALTER TABLE public.credit_limit_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_limit_adjustments'
      AND policyname = 'Admins can read all credit adjustments'
  ) THEN
    CREATE POLICY "Admins can read all credit adjustments"
      ON public.credit_limit_adjustments
      FOR SELECT
      TO authenticated
      USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_limit_adjustments'
      AND policyname = 'Admins can insert credit adjustments'
  ) THEN
    CREATE POLICY "Admins can insert credit adjustments"
      ON public.credit_limit_adjustments
      FOR INSERT
      TO authenticated
      WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
        AND admin_id = auth.uid()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_limit_adjustments'
      AND policyname = 'Clients can view own credit adjustments'
  ) THEN
    CREATE POLICY "Clients can view own credit adjustments"
      ON public.credit_limit_adjustments
      FOR SELECT
      TO authenticated
      USING (client_id = auth.uid());
  END IF;
END $$;

-- Atomic admin-only credit adjustment with strict validation and audit logging.
CREATE OR REPLACE FUNCTION public.admin_adjust_client_credit_limit(
  p_target_client_id UUID,
  p_adjustment_type TEXT,
  p_adjustment_amount DECIMAL(12, 2),
  p_adjustment_reason TEXT
)
RETURNS TABLE (
  id UUID,
  client_id UUID,
  admin_id UUID,
  adjustment_type TEXT,
  adjustment_amount DECIMAL(12, 2),
  change_amount DECIMAL(12, 2),
  previous_limit DECIMAL(12, 2),
  new_limit DECIMAL(12, 2),
  reason TEXT,
  created_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_role user_role;
  v_target_role user_role;
  v_previous_limit DECIMAL(12, 2);
  v_new_limit DECIMAL(12, 2);
  v_change_amount DECIMAL(12, 2);
  v_adjustment_type TEXT;
  v_reason TEXT;
BEGIN
  SELECT role
  INTO v_admin_role
  FROM public.users
  WHERE id = auth.uid();

  IF v_admin_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can adjust credit limits';
  END IF;

  SELECT role, COALESCE(credit_limit, 0)
  INTO v_target_role, v_previous_limit
  FROM public.users
  WHERE id = p_target_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF v_target_role IS DISTINCT FROM 'CLIENT' THEN
    RAISE EXCEPTION 'Credit limit adjustments are only allowed for clients';
  END IF;

  v_adjustment_type := UPPER(TRIM(COALESCE(p_adjustment_type, '')));
  IF v_adjustment_type NOT IN ('SET', 'INCREASE', 'DECREASE') THEN
    RAISE EXCEPTION 'Invalid adjustment type. Use SET, INCREASE, or DECREASE';
  END IF;

  IF p_adjustment_amount IS NULL OR p_adjustment_amount < 0 THEN
    RAISE EXCEPTION 'Adjustment amount must be a non-negative number';
  END IF;

  IF v_adjustment_type IN ('INCREASE', 'DECREASE') AND p_adjustment_amount = 0 THEN
    RAISE EXCEPTION 'Increase/decrease amount must be greater than zero';
  END IF;

  v_reason := TRIM(COALESCE(p_adjustment_reason, ''));
  IF char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Reason must be at least 5 characters';
  END IF;

  IF v_adjustment_type = 'SET' THEN
    v_new_limit := ROUND(p_adjustment_amount, 2);
  ELSIF v_adjustment_type = 'INCREASE' THEN
    v_new_limit := ROUND(v_previous_limit + p_adjustment_amount, 2);
  ELSE
    IF p_adjustment_amount > v_previous_limit THEN
      RAISE EXCEPTION 'Decrease amount exceeds current credit limit';
    END IF;
    v_new_limit := ROUND(v_previous_limit - p_adjustment_amount, 2);
  END IF;

  v_change_amount := ROUND(v_new_limit - v_previous_limit, 2);

  UPDATE public.users
  SET
    credit_limit = v_new_limit,
    updated_at = NOW()
  WHERE id = p_target_client_id;

  RETURN QUERY
  INSERT INTO public.credit_limit_adjustments (
    client_id,
    admin_id,
    adjustment_type,
    adjustment_amount,
    change_amount,
    previous_limit,
    new_limit,
    reason
  )
  VALUES (
    p_target_client_id,
    auth.uid(),
    v_adjustment_type,
    ROUND(p_adjustment_amount, 2),
    v_change_amount,
    v_previous_limit,
    v_new_limit,
    v_reason
  )
  RETURNING
    credit_limit_adjustments.id,
    credit_limit_adjustments.client_id,
    credit_limit_adjustments.admin_id,
    credit_limit_adjustments.adjustment_type,
    credit_limit_adjustments.adjustment_amount,
    credit_limit_adjustments.change_amount,
    credit_limit_adjustments.previous_limit,
    credit_limit_adjustments.new_limit,
    credit_limit_adjustments.reason,
    credit_limit_adjustments.created_at;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.admin_adjust_client_credit_limit TO authenticated;
