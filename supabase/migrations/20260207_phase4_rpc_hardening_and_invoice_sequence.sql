-- ============================================================================
-- Phase 4: RPC hardening + atomic invoice numbers
-- Date: 2026-02-07
-- Focus:
--   1) Remove caller-supplied admin identifiers from SECURITY DEFINER RPCs
--   2) Make invoice number generation atomic under concurrency
-- ============================================================================

-- 1) Harden assign_custom_request(): rely on auth.uid() only.
DROP FUNCTION IF EXISTS public.assign_custom_request(UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.assign_custom_request(
  p_request_id UUID,
  p_supplier_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.custom_item_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.custom_item_requests;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Custom request not found';
  END IF;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_custom_request(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_custom_request(UUID, UUID, TEXT) TO authenticated;

-- 2) Harden mark_order_as_paid(): rely on auth.uid() only.
DROP FUNCTION IF EXISTS public.mark_order_as_paid(UUID, UUID, TEXT, TEXT);

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
DECLARE
  v_order public.orders;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
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

REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) TO authenticated;

-- 3) Atomic invoice number generation (sequence-backed).
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq AS BIGINT;

DO $$
DECLARE
  v_max BIGINT;
BEGIN
  SELECT COALESCE(
    MAX((regexp_match(invoice_number, '^INV-[0-9]{4}-([0-9]+)$'))[1]::BIGINT),
    0
  )
  INTO v_max
  FROM public.invoices;

  IF v_max > 0 THEN
    PERFORM setval('public.invoice_number_seq', v_max, true);
  ELSE
    PERFORM setval('public.invoice_number_seq', 1, false);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year TEXT;
  v_sequence BIGINT;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_sequence := nextval('public.invoice_number_seq');

  RETURN 'INV-' || v_year || '-' || LPAD(v_sequence::TEXT, 6, '0');
END;
$$;

GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO service_role;

-- 4) Enforce margin bounds at the database layer.
UPDATE public.users
SET client_margin = LEAST(GREATEST(client_margin, 0), 100)
WHERE client_margin IS NOT NULL;

UPDATE public.quotes
SET margin_percent = LEAST(GREATEST(margin_percent, 0), 100);

UPDATE public.margin_settings
SET margin_percent = LEAST(GREATEST(margin_percent, 0), 100);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_client_margin_bounds'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT users_client_margin_bounds;
  END IF;

  ALTER TABLE public.users
    ADD CONSTRAINT users_client_margin_bounds
    CHECK (client_margin IS NULL OR (client_margin >= 0 AND client_margin <= 100));
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quotes_margin_percent_bounds'
      AND conrelid = 'public.quotes'::regclass
  ) THEN
    ALTER TABLE public.quotes DROP CONSTRAINT quotes_margin_percent_bounds;
  END IF;

  ALTER TABLE public.quotes
    ADD CONSTRAINT quotes_margin_percent_bounds
    CHECK (margin_percent >= 0 AND margin_percent <= 100);
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'margin_settings_margin_percent_bounds'
      AND conrelid = 'public.margin_settings'::regclass
  ) THEN
    ALTER TABLE public.margin_settings DROP CONSTRAINT margin_settings_margin_percent_bounds;
  END IF;

  ALTER TABLE public.margin_settings
    ADD CONSTRAINT margin_settings_margin_percent_bounds
    CHECK (margin_percent >= 0 AND margin_percent <= 100);
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'client_margins'
      AND relkind = 'r'
  ) THEN
    EXECUTE 'UPDATE public.client_margins
             SET margin_percent = LEAST(GREATEST(margin_percent, 0), 100)';

    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'client_margins_margin_percent_bounds'
        AND conrelid = 'public.client_margins'::regclass
    ) THEN
      EXECUTE 'ALTER TABLE public.client_margins
               DROP CONSTRAINT client_margins_margin_percent_bounds';
    END IF;

    EXECUTE 'ALTER TABLE public.client_margins
             ADD CONSTRAINT client_margins_margin_percent_bounds
             CHECK (margin_percent >= 0 AND margin_percent <= 100)';
  END IF;
END
$$;
