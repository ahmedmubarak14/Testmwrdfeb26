-- ============================================================================
-- Phase 7: Normalize mark_order_as_paid RPC behavior/signature after prior
-- migration redefinitions.
-- Date: 2026-02-08
-- ============================================================================

-- Backward-compatible 4-arg signature (legacy callers)
CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_admin_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can confirm payments';
  END IF;

  UPDATE public.orders
  SET
    status = 'PAYMENT_CONFIRMED',
    payment_confirmed_at = NOW(),
    payment_confirmed_by = v_caller,
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_notes = COALESCE(p_payment_notes, payment_notes),
    updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  UPDATE public.invoices
  SET
    status = 'PAID',
    paid_date = CURRENT_DATE
  WHERE order_id = p_order_id;

  RETURN v_order;
END;
$$;

-- Preferred 3-arg signature (auth-bound)
CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.mark_order_as_paid(
    p_order_id,
    auth.uid(),
    p_payment_reference,
    p_payment_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) TO authenticated;
