-- ============================================================================
-- Phase 2 Data Integrity
-- Date: 2026-02-07
-- Focus:
--   1) Transactional RFQ creation (RFQ + items atomically)
--   2) Atomic invoice numbering with sequence
--   3) Canonical status normalization + constraints
--   4) RFQ item uniqueness guard
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Ensure canonical order statuses used by the app are present.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 2) Normalize legacy statuses in persisted rows and enforce canonical subsets.
-- ----------------------------------------------------------------------------
UPDATE public.orders
SET status = CASE status::TEXT
  WHEN 'In Transit' THEN 'IN_TRANSIT'::public.order_status
  WHEN 'Delivered' THEN 'DELIVERED'::public.order_status
  WHEN 'Cancelled' THEN 'CANCELLED'::public.order_status
  WHEN 'OPEN' THEN 'PENDING_PO'::public.order_status
  WHEN 'DRAFT' THEN 'PENDING_PO'::public.order_status
  WHEN 'QUOTED' THEN 'PENDING_PO'::public.order_status
  WHEN 'CLOSED' THEN 'DELIVERED'::public.order_status
  ELSE status
END
WHERE status::TEXT IN ('In Transit', 'Delivered', 'Cancelled', 'OPEN', 'DRAFT', 'QUOTED', 'CLOSED');

ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_status_canonical_chk;

ALTER TABLE public.orders
ADD CONSTRAINT orders_status_canonical_chk
CHECK (
  status::TEXT = ANY (
    ARRAY[
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
    ]
  )
);

UPDATE public.quotes
SET status = CASE status::TEXT
  WHEN 'PENDING' THEN 'PENDING_ADMIN'::public.quote_status
  WHEN 'SENT' THEN 'SENT_TO_CLIENT'::public.quote_status
  WHEN 'DECLINED' THEN 'REJECTED'::public.quote_status
  ELSE status
END
WHERE status::TEXT IN ('PENDING', 'SENT', 'DECLINED');

ALTER TABLE public.quotes
DROP CONSTRAINT IF EXISTS quotes_status_canonical_chk;

ALTER TABLE public.quotes
ADD CONSTRAINT quotes_status_canonical_chk
CHECK (status::TEXT = ANY (ARRAY['PENDING_ADMIN', 'SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED']));

UPDATE public.rfqs
SET status = CASE status::TEXT
  WHEN 'DRAFT' THEN 'OPEN'::public.rfq_status
  WHEN 'CANCELLED' THEN 'CLOSED'::public.rfq_status
  ELSE status
END
WHERE status::TEXT IN ('DRAFT', 'CANCELLED');

ALTER TABLE public.rfqs
DROP CONSTRAINT IF EXISTS rfqs_status_canonical_chk;

ALTER TABLE public.rfqs
ADD CONSTRAINT rfqs_status_canonical_chk
CHECK (status::TEXT = ANY (ARRAY['OPEN', 'QUOTED', 'CLOSED']));

-- ----------------------------------------------------------------------------
-- 3) Enforce unique product lines per RFQ.
-- ----------------------------------------------------------------------------
WITH duplicates AS (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY rfq_id, product_id
        ORDER BY created_at, id
      ) AS rn
    FROM public.rfq_items
  ) ranked
  WHERE ranked.rn > 1
)
DELETE FROM public.rfq_items i
USING duplicates d
WHERE i.id = d.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rfq_items_unique_product'
      AND conrelid = 'public.rfq_items'::regclass
  ) THEN
    ALTER TABLE public.rfq_items
      ADD CONSTRAINT rfq_items_unique_product UNIQUE (rfq_id, product_id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4) Transactional RFQ creation RPC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_rfq_with_items(
  p_client_id UUID,
  p_items JSONB,
  p_status TEXT DEFAULT 'OPEN',
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.rfqs
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rfq public.rfqs;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_client_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'RFQ must include at least one item';
  END IF;

  v_status := UPPER(COALESCE(NULLIF(TRIM(p_status), ''), 'OPEN'));
  IF v_status NOT IN ('OPEN', 'QUOTED', 'CLOSED') THEN
    RAISE EXCEPTION 'Invalid RFQ status';
  END IF;

  INSERT INTO public.rfqs (client_id, status, date)
  VALUES (p_client_id, v_status::public.rfq_status, COALESCE(p_date, CURRENT_DATE))
  RETURNING * INTO v_rfq;

  INSERT INTO public.rfq_items (rfq_id, product_id, quantity, notes)
  SELECT
    v_rfq.id,
    COALESCE((elem->>'product_id')::UUID, (elem->>'productId')::UUID),
    (elem->>'quantity')::INTEGER,
    NULLIF(COALESCE(elem->>'notes', elem->>'note'), '')
  FROM jsonb_array_elements(p_items) AS elem;

  RETURN v_rfq;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.create_rfq_with_items(UUID, JSONB, TEXT, DATE) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5) Atomic invoice number generation using a sequence.
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq
  INCREMENT BY 1
  MINVALUE 1
  START WITH 1;

DO $$
DECLARE
  v_max BIGINT;
BEGIN
  SELECT COALESCE(MAX((regexp_match(invoice_number, '([0-9]+)$'))[1]::BIGINT), 0)
  INTO v_max
  FROM public.invoices
  WHERE invoice_number IS NOT NULL
    AND invoice_number ~ '[0-9]+$';

  IF v_max > 0 THEN
    PERFORM setval('public.invoice_number_seq', v_max, TRUE);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_seq := nextval('public.invoice_number_seq');
  RETURN 'INV-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.auto_generate_invoice_number()
RETURNS TRIGGER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := public.generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

