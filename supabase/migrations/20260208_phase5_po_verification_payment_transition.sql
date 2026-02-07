-- ============================================================================
-- Phase 5: PO verification should transition to payment stage
-- Bank transfer is the primary MVP payment path.
-- Date: 2026-02-07
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_client_po_and_confirm_order(
  p_document_id UUID
)
RETURNS public.orders
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID;
  v_doc public.order_documents;
  v_order public.orders;
  v_quote_rfq_id UUID;
  v_item RECORD;
  v_stock_result RECORD;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can verify client POs';
  END IF;

  SELECT *
  INTO v_doc
  FROM public.order_documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_doc.document_type <> 'CLIENT_PO' THEN
    RAISE EXCEPTION 'Only CLIENT_PO documents can be verified';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = v_doc.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Idempotent exit: already verified and order already past PO stage.
  IF v_doc.verified_at IS NOT NULL
     AND v_order.admin_verified
     AND v_order.status <> 'PENDING_PO' THEN
    RETURN v_order;
  END IF;

  IF v_order.status <> 'PENDING_PO' THEN
    RAISE EXCEPTION 'Order must be in PENDING_PO status for verification';
  END IF;

  -- Prefer explicit order items payload when present.
  IF jsonb_typeof(COALESCE(v_order.items, '[]'::jsonb)) = 'array'
     AND jsonb_array_length(COALESCE(v_order.items, '[]'::jsonb)) > 0 THEN
    FOR v_item IN
      SELECT
        COALESCE(value->>'productId', value->>'product_id')::UUID AS product_id,
        GREATEST(COALESCE((value->>'quantity')::INTEGER, 0), 0) AS quantity
      FROM jsonb_array_elements(v_order.items) AS value
    LOOP
      IF v_item.product_id IS NULL OR v_item.quantity <= 0 THEN
        CONTINUE;
      END IF;

      SELECT *
      INTO v_stock_result
      FROM public.decrement_stock_atomic(v_item.product_id, v_item.quantity);

      IF NOT COALESCE(v_stock_result.success, FALSE) THEN
        RAISE EXCEPTION '%', COALESCE(
          v_stock_result.error,
          format('Failed to decrement stock for product %s', v_item.product_id)
        );
      END IF;
    END LOOP;
  ELSIF v_order.quote_id IS NOT NULL THEN
    SELECT q.rfq_id
    INTO v_quote_rfq_id
    FROM public.quotes q
    WHERE q.id = v_order.quote_id;

    IF v_quote_rfq_id IS NOT NULL THEN
      FOR v_item IN
        SELECT product_id, quantity
        FROM public.rfq_items
        WHERE rfq_id = v_quote_rfq_id
      LOOP
        SELECT *
        INTO v_stock_result
        FROM public.decrement_stock_atomic(v_item.product_id, v_item.quantity);

        IF NOT COALESCE(v_stock_result.success, FALSE) THEN
          RAISE EXCEPTION '%', COALESCE(
            v_stock_result.error,
            format('Failed to decrement stock for product %s', v_item.product_id)
          );
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.order_documents
  SET
    verified_by = v_caller,
    verified_at = NOW(),
    updated_at = NOW()
  WHERE id = v_doc.id;

  UPDATE public.orders
  SET
    status = 'PENDING_PAYMENT',
    admin_verified = TRUE,
    admin_verified_by = v_caller,
    admin_verified_at = NOW(),
    updated_at = NOW()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.verify_client_po_and_confirm_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_client_po_and_confirm_order(UUID) TO service_role;
