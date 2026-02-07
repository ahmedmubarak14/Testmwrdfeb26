-- ============================================================================
-- Atomic inventory decrement to prevent race conditions / overselling
-- Date: 2026-02-07
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrement_stock_atomic(
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS TABLE (
  success BOOLEAN,
  previous_stock INTEGER,
  new_stock INTEGER,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_stock INTEGER;
  v_new_stock INTEGER;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Product ID is required';
    RETURN;
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Quantity must be greater than zero';
    RETURN;
  END IF;

  -- Admin-only when called with user session; service-role (auth.uid() IS NULL) is allowed.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = 'ADMIN'
     ) THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Unauthorized';
    RETURN;
  END IF;

  UPDATE public.products p
  SET
    stock_quantity = COALESCE(p.stock_quantity, 0) - p_quantity,
    updated_at = NOW()
  WHERE p.id = p_product_id
    AND COALESCE(p.stock_quantity, 0) >= p_quantity
  RETURNING
    COALESCE(p.stock_quantity, 0) + p_quantity,
    COALESCE(p.stock_quantity, 0)
  INTO
    v_previous_stock,
    v_new_stock;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, v_previous_stock, v_new_stock, NULL::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(p.stock_quantity, 0)
  INTO v_previous_stock
  FROM public.products p
  WHERE p.id = p_product_id;

  IF v_previous_stock IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Product not found';
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    FALSE,
    v_previous_stock,
    v_previous_stock,
    format('Insufficient stock. Available: %s, Requested: %s', v_previous_stock, p_quantity);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_stock_atomic(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock_atomic(UUID, INTEGER) TO service_role;
