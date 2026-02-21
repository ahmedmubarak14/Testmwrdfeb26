-- ============================================================================
-- Phase 19: Fix TEXT→payment_terms enum cast in accept_quote_and_deduct_credit
-- Date: 2026-02-21
-- Purpose:
--   The phase 15 migration declared v_order_payment_terms_text as TEXT
--   and passed it directly into the payment_terms column (an enum type),
--   causing: "Column payment_terms is of type payment_terms but expression
--   is of type text."
--   This migration replaces the function with explicit ::payment_terms casts.
-- ============================================================================

DROP FUNCTION IF EXISTS public.accept_quote_and_deduct_credit(UUID);

CREATE OR REPLACE FUNCTION public.accept_quote_and_deduct_credit(p_quote_id UUID)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote RECORD;
  v_order public.orders;
  v_actor_role TEXT;

  v_total_amount NUMERIC(12, 2);
  v_items_total NUMERIC(12, 2) := 0;
  v_credit_limit NUMERIC(12, 2);
  v_current_balance NUMERIC(12, 2);
  v_payment_terms_text TEXT := 'net_30';
  v_payment_terms_safe TEXT := 'net_30';
  v_order_payment_terms_text TEXT := 'net_30';
  v_use_direct_pay BOOLEAN := FALSE;

  v_has_is_partial BOOLEAN := FALSE;
  v_has_user_payment_terms BOOLEAN := FALSE;
  v_has_order_payment_terms BOOLEAN := FALSE;
  v_is_partial BOOLEAN := FALSE;
  v_quoted_items_count INTEGER := 0;
  v_total_items_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    q.id,
    q.rfq_id,
    q.supplier_id,
    q.status,
    COALESCE(q.final_price, 0)::NUMERIC(12, 2) AS final_price,
    r.client_id
  INTO v_quote
  FROM public.quotes q
  JOIN public.rfqs r ON r.id = q.rfq_id
  WHERE q.id = p_quote_id
  FOR UPDATE OF q, r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF auth.uid() <> v_quote.client_id THEN
    SELECT role::TEXT
    INTO v_actor_role
    FROM public.users
    WHERE id = auth.uid();

    IF COALESCE(v_actor_role, '') <> 'ADMIN' THEN
      RAISE EXCEPTION 'Only the client or admin can accept this quote';
    END IF;
  END IF;

  -- Idempotent: quote already accepted and order already exists.
  IF v_quote.status = 'ACCEPTED' THEN
    SELECT *
    INTO v_order
    FROM public.orders
    WHERE quote_id = p_quote_id
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;

    IF FOUND THEN
      RETURN v_order;
    END IF;
  END IF;

  IF v_quote.status NOT IN ('SENT_TO_CLIENT', 'PENDING_ADMIN', 'ACCEPTED') THEN
    RAISE EXCEPTION 'Quote is not available for acceptance';
  END IF;

  -- Detect optional schema elements.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'is_partial'
  ) INTO v_has_is_partial;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'payment_terms'
  ) INTO v_has_user_payment_terms;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_terms'
  ) INTO v_has_order_payment_terms;

  -- Prefer quote_items totals when available.
  IF to_regclass('public.quote_items') IS NOT NULL THEN
    EXECUTE $quote_items$
      SELECT
        COALESCE(SUM(
          CASE WHEN COALESCE(is_quoted, TRUE)
            THEN COALESCE(line_total, COALESCE(unit_price, 0) * COALESCE(quantity, 0), 0)
            ELSE 0
          END
        ), 0)::NUMERIC(12, 2),
        COUNT(*) FILTER (WHERE COALESCE(is_quoted, TRUE)),
        COUNT(*)
      FROM public.quote_items
      WHERE quote_id = $1
    $quote_items$
    INTO v_items_total, v_quoted_items_count, v_total_items_count
    USING p_quote_id;
  END IF;

  IF v_quoted_items_count > 0 THEN
    v_total_amount := GREATEST(v_items_total, 0);
  ELSE
    v_total_amount := GREATEST(v_quote.final_price, 0);
  END IF;

  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid quote amount';
  END IF;

  v_is_partial := (v_quoted_items_count > 0 AND v_quoted_items_count < v_total_items_count);

  -- Load client financials.
  IF v_has_user_payment_terms THEN
    EXECUTE $client_financials$
      SELECT
        COALESCE(credit_limit, 0)::NUMERIC(12, 2),
        COALESCE(current_balance, 0)::NUMERIC(12, 2),
        COALESCE(payment_terms::TEXT, 'net_30')
      FROM public.users WHERE id = $1 FOR UPDATE
    $client_financials$
    INTO v_credit_limit, v_current_balance, v_payment_terms_text
    USING v_quote.client_id;
  ELSE
    SELECT
      COALESCE(credit_limit, 0)::NUMERIC(12, 2),
      COALESCE(current_balance, 0)::NUMERIC(12, 2)
    INTO v_credit_limit, v_current_balance
    FROM public.users WHERE id = v_quote.client_id FOR UPDATE;
    v_payment_terms_text := 'net_30';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client financial profile not found';
  END IF;

  v_payment_terms_safe := CASE
    WHEN v_payment_terms_text IN ('prepay', 'net_15', 'net_30', 'net_45') THEN v_payment_terms_text
    ELSE 'net_30'
  END;

  -- Direct-pay: no credit limit assigned or payment_terms = prepay.
  v_use_direct_pay := (
    v_payment_terms_safe = 'prepay'
    OR COALESCE(v_credit_limit, 0) <= 0
  );

  v_order_payment_terms_text := CASE
    WHEN v_use_direct_pay THEN 'prepay'
    ELSE v_payment_terms_safe
  END;

  IF NOT v_use_direct_pay THEN
    IF (v_current_balance + v_total_amount) > v_credit_limit THEN
      RAISE EXCEPTION
        'Insufficient credit limit. Required: %, Available: %',
        v_total_amount,
        (v_credit_limit - v_current_balance);
    END IF;

    UPDATE public.users
    SET
      current_balance = ROUND(COALESCE(current_balance, 0) + v_total_amount, 2),
      credit_used     = ROUND(COALESCE(credit_used, 0)     + v_total_amount, 2),
      updated_at      = NOW()
    WHERE id = v_quote.client_id;
  END IF;

  -- Update quote status.
  IF v_has_is_partial THEN
    UPDATE public.quotes
    SET status = 'ACCEPTED', final_price = v_total_amount, is_partial = v_is_partial, updated_at = NOW()
    WHERE id = p_quote_id;
  ELSE
    UPDATE public.quotes
    SET status = 'ACCEPTED', final_price = v_total_amount, updated_at = NOW()
    WHERE id = p_quote_id;
  END IF;

  UPDATE public.quotes
  SET status = 'REJECTED', updated_at = NOW()
  WHERE rfq_id = v_quote.rfq_id AND id <> p_quote_id AND status IN ('SENT_TO_CLIENT', 'PENDING_ADMIN');

  UPDATE public.rfqs
  SET status = 'CLOSED', updated_at = NOW()
  WHERE id = v_quote.rfq_id;

  -- Insert order — with explicit enum cast to avoid TEXT vs payment_terms mismatch.
  BEGIN
    IF v_has_order_payment_terms THEN
      INSERT INTO public.orders (quote_id, client_id, supplier_id, amount, status, payment_terms, date)
      VALUES (
        p_quote_id,
        v_quote.client_id,
        v_quote.supplier_id,
        v_total_amount,
        'PENDING_PAYMENT',
        v_order_payment_terms_text::payment_terms,  -- explicit cast
        CURRENT_DATE
      )
      RETURNING * INTO v_order;
    ELSE
      INSERT INTO public.orders (quote_id, client_id, supplier_id, amount, status, date)
      VALUES (
        p_quote_id,
        v_quote.client_id,
        v_quote.supplier_id,
        v_total_amount,
        'PENDING_PAYMENT',
        CURRENT_DATE
      )
      RETURNING * INTO v_order;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%invalid input value for enum%' THEN
        -- Fallback for databases where 'PENDING_PAYMENT' is not in the enum.
        IF v_has_order_payment_terms THEN
          INSERT INTO public.orders (quote_id, client_id, supplier_id, amount, status, payment_terms, date)
          VALUES (
            p_quote_id, v_quote.client_id, v_quote.supplier_id, v_total_amount,
            'PENDING_PO', v_order_payment_terms_text::payment_terms, CURRENT_DATE
          )
          RETURNING * INTO v_order;
        ELSE
          INSERT INTO public.orders (quote_id, client_id, supplier_id, amount, status, date)
          VALUES (
            p_quote_id, v_quote.client_id, v_quote.supplier_id, v_total_amount, 'PENDING_PO', CURRENT_DATE
          )
          RETURNING * INTO v_order;
        END IF;
      ELSE
        RAISE;
      END IF;
  END;

  RETURN v_order;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to accept quote: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.accept_quote_and_deduct_credit(UUID) IS
  'Accepts quote atomically. Fixes TEXT→payment_terms cast. Clients with no credit limit are treated as direct pay.';

REVOKE ALL ON FUNCTION public.accept_quote_and_deduct_credit(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_quote_and_deduct_credit(UUID) TO authenticated;

INSERT INTO public._migration_log (migration_name)
VALUES ('20260221_phase19_fix_payment_terms_cast.sql')
ON CONFLICT (migration_name) DO NOTHING;
