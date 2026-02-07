-- ============================================================================
-- SECURITY: Restrict suppliers from updating payment link fields
-- Date: 2026-02-03
-- Purpose: Ensure suppliers can only update their order status (not payment links)
-- ============================================================================

-- Drop the permissive policy (if it exists)
DROP POLICY IF EXISTS "Suppliers can update order status" ON public.orders;

-- Recreate with a WITH CHECK clause that blocks payment link changes
CREATE POLICY "Suppliers can update order status"
  ON public.orders FOR UPDATE
  USING (auth.uid() = supplier_id)
  WITH CHECK (
    auth.uid() = supplier_id
    AND payment_link_url IS NOT DISTINCT FROM (
      SELECT o.payment_link_url FROM public.orders o WHERE o.id = id
    )
    AND payment_link_sent_at IS NOT DISTINCT FROM (
      SELECT o.payment_link_sent_at FROM public.orders o WHERE o.id = id
    )
  );

