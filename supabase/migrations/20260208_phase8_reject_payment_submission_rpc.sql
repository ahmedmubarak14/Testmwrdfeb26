-- ============================================================================
-- Phase 8: Admin payment rejection RPC (auth-bound + atomic audit logging)
-- Date: 2026-02-08
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reject_payment_submission(
  p_order_id UUID,
  p_reason TEXT
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
  v_reason TEXT;
  v_admin_note TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can reject payment submissions';
  END IF;

  v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  v_admin_note := format('[Admin Action] Payment reference rejected: %s', v_reason);

  UPDATE public.orders
  SET
    status = 'PENDING_PAYMENT',
    payment_notes = CASE
      WHEN payment_notes IS NULL OR BTRIM(payment_notes) = '' THEN v_admin_note
      ELSE payment_notes || E'\n' || v_admin_note
    END,
    payment_confirmed_at = NULL,
    payment_confirmed_by = NULL,
    payment_submitted_at = NULL,
    updated_at = NOW()
  WHERE id = p_order_id
    AND status = 'AWAITING_CONFIRMATION'
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
      RAISE EXCEPTION 'Order is not awaiting confirmation';
    END IF;
    RAISE EXCEPTION 'Order not found';
  END IF;

  INSERT INTO public.payment_audit_logs (
    order_id,
    actor_user_id,
    actor_role,
    action,
    from_status,
    to_status,
    payment_reference,
    notes,
    metadata
  ) VALUES (
    v_order.id,
    v_caller,
    'ADMIN',
    'PAYMENT_REJECTED',
    'AWAITING_CONFIRMATION',
    'PENDING_PAYMENT',
    v_order.payment_reference,
    v_reason,
    jsonb_build_object(
      'source', 'rpc.reject_payment_submission'
    )
  );

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_payment_submission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_payment_submission(UUID, TEXT) TO authenticated;
