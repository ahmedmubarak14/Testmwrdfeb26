-- ============================================================================
-- Phase 6: Enforce valid order status transitions at the database layer.
-- Prevents invalid direct updates from any client path.
-- Date: 2026-02-07
-- ============================================================================

CREATE OR REPLACE FUNCTION public.order_status_transition_is_valid(
  p_from public.order_status,
  p_to public.order_status
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from TEXT;
  v_to TEXT;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RETURN FALSE;
  END IF;

  v_from := p_from::TEXT;
  v_to := p_to::TEXT;

  IF p_from = p_to THEN
    RETURN TRUE;
  END IF;

  CASE v_from
    WHEN 'DRAFT', 'OPEN', 'QUOTED' THEN
      RETURN v_to IN ('PENDING_PO', 'CONFIRMED', 'CANCELLED', 'CLOSED');
    WHEN 'PENDING_PO' THEN
      RETURN v_to IN ('CONFIRMED', 'PENDING_PAYMENT', 'CANCELLED');
    WHEN 'CONFIRMED' THEN
      RETURN v_to IN ('PENDING_PAYMENT', 'CANCELLED');
    WHEN 'PENDING_PAYMENT' THEN
      RETURN v_to IN ('PENDING_PO', 'AWAITING_CONFIRMATION', 'PAYMENT_CONFIRMED', 'CANCELLED');
    WHEN 'AWAITING_CONFIRMATION' THEN
      RETURN v_to IN ('PENDING_PO', 'PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'CANCELLED');
    WHEN 'PAYMENT_CONFIRMED' THEN
      RETURN v_to IN (
        'PROCESSING',
        'READY_FOR_PICKUP',
        'PICKUP_SCHEDULED',
        'OUT_FOR_DELIVERY',
        'IN_TRANSIT',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED'
      );
    WHEN 'PROCESSING' THEN
      RETURN v_to IN (
        'READY_FOR_PICKUP',
        'PICKUP_SCHEDULED',
        'OUT_FOR_DELIVERY',
        'IN_TRANSIT',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED'
      );
    WHEN 'READY_FOR_PICKUP' THEN
      RETURN v_to IN ('PICKUP_SCHEDULED', 'OUT_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    WHEN 'PICKUP_SCHEDULED' THEN
      RETURN v_to IN ('OUT_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    WHEN 'OUT_FOR_DELIVERY' THEN
      RETURN v_to IN ('IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    WHEN 'SHIPPED' THEN
      RETURN v_to IN ('IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    WHEN 'IN_TRANSIT' THEN
      RETURN v_to IN ('DELIVERED', 'CANCELLED');
    WHEN 'DELIVERED' THEN
      RETURN FALSE;
    WHEN 'CLOSED' THEN
      RETURN FALSE;
    WHEN 'CANCELLED' THEN
      RETURN FALSE;
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.order_status_transition_is_valid(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_status_transition ON public.orders;

CREATE TRIGGER trg_enforce_order_status_transition
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_status_transition();
