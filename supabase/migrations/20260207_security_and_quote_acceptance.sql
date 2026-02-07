-- ============================================================================
-- SECURITY + CORE FLOW HARDENING
-- Date: 2026-02-07
-- ============================================================================

-- 1) Remove permissive payment update policy.
DROP POLICY IF EXISTS "System can update payments" ON public.payments;

-- 2) Ensure credit columns exist before using atomic quote acceptance.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'client_margin'
  ) THEN
    ALTER TABLE public.users ADD COLUMN client_margin DECIMAL(5, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'credit_limit'
  ) THEN
    ALTER TABLE public.users ADD COLUMN credit_limit DECIMAL(12, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'credit_used'
  ) THEN
    ALTER TABLE public.users ADD COLUMN credit_used DECIMAL(12, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'current_balance'
  ) THEN
    ALTER TABLE public.users ADD COLUMN current_balance DECIMAL(12, 2) DEFAULT 0;
  END IF;
END $$;

-- 3) Backfill order_status enum values used by the application.
DO $$
DECLARE
  v_status TEXT;
  v_statuses TEXT[] := ARRAY[
    'PENDING_PO',
    'CONFIRMED',
    'PENDING_PAYMENT',
    'AWAITING_CONFIRMATION',
    'PAYMENT_CONFIRMED',
    'PROCESSING',
    'READY_FOR_PICKUP',
    'PICKUP_SCHEDULED',
    'OUT_FOR_DELIVERY',
    'SHIPPED',
    'IN_TRANSIT',
    'DELIVERED',
    'CANCELLED'
  ];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'order_status'
  ) THEN
    FOREACH v_status IN ARRAY v_statuses LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'order_status'
          AND e.enumlabel = v_status
      ) THEN
        EXECUTE format('ALTER TYPE public.order_status ADD VALUE %L', v_status);
      END IF;
    END LOOP;
  END IF;
END $$;

-- 4) Atomic quote acceptance + credit deduction + order creation.
CREATE OR REPLACE FUNCTION public.accept_quote_and_deduct_credit(p_quote_id UUID)
RETURNS public.orders
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote RECORD;
  v_order public.orders;
  v_total_amount DECIMAL(12, 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    q.id,
    q.rfq_id,
    q.supplier_id,
    q.status,
    COALESCE(q.final_price, 0)::DECIMAL(12, 2) AS final_price,
    r.client_id
  INTO v_quote
  FROM public.quotes q
  JOIN public.rfqs r ON r.id = q.rfq_id
  WHERE q.id = p_quote_id
  FOR UPDATE OF q, r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_quote.client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Idempotency guard: if already accepted and order exists, return it.
  IF v_quote.status = 'ACCEPTED' THEN
    SELECT *
    INTO v_order
    FROM public.orders
    WHERE quote_id = p_quote_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN v_order;
    END IF;
  END IF;

  IF v_quote.status NOT IN ('SENT_TO_CLIENT', 'PENDING_ADMIN', 'ACCEPTED') THEN
    RAISE EXCEPTION 'Quote is not available for acceptance';
  END IF;

  v_total_amount := GREATEST(v_quote.final_price, 0);
  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid quote amount';
  END IF;

  UPDATE public.users
  SET
    credit_limit = ROUND(COALESCE(credit_limit, 0) - v_total_amount, 2),
    credit_used = ROUND(COALESCE(credit_used, 0) + v_total_amount, 2),
    current_balance = ROUND(COALESCE(current_balance, 0) + v_total_amount, 2),
    updated_at = NOW()
  WHERE id = v_quote.client_id
    AND COALESCE(credit_limit, 0) >= v_total_amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient credit';
  END IF;

  UPDATE public.quotes
  SET status = 'ACCEPTED', updated_at = NOW()
  WHERE id = p_quote_id;

  UPDATE public.rfqs
  SET status = 'CLOSED', updated_at = NOW()
  WHERE id = v_quote.rfq_id;

  INSERT INTO public.orders (
    quote_id,
    client_id,
    supplier_id,
    amount,
    status,
    date
  )
  VALUES (
    v_quote.id,
    v_quote.client_id,
    v_quote.supplier_id,
    v_total_amount,
    'PENDING_PAYMENT',
    CURRENT_DATE
  )
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.accept_quote_and_deduct_credit(UUID) TO authenticated;

-- 5) Harden mark_order_as_paid by binding admin identity to auth.uid().
CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_admin_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
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
    status = 'IN_TRANSIT',
    payment_confirmed_at = NOW(),
    payment_confirmed_by = v_caller,
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_notes = COALESCE(p_payment_notes, payment_notes),
    updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  UPDATE public.invoices
  SET
    status = 'PAID',
    paid_date = CURRENT_DATE
  WHERE order_id = p_order_id;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

-- 6) Harden assign_custom_request by binding admin identity to auth.uid().
CREATE OR REPLACE FUNCTION public.assign_custom_request(
  p_request_id UUID,
  p_supplier_id UUID,
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.custom_item_requests
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.custom_item_requests;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can assign requests';
  END IF;

  IF (SELECT role FROM public.users WHERE id = p_supplier_id) <> 'SUPPLIER' THEN
    RAISE EXCEPTION 'Can only assign to suppliers';
  END IF;

  UPDATE public.custom_item_requests
  SET
    assigned_to = p_supplier_id,
    assigned_by = v_caller,
    admin_notes = COALESCE(p_notes, admin_notes),
    status = 'ASSIGNED',
    updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$ LANGUAGE plpgsql;
