-- RPC to bulk update margin for all quotes in an RFQ
CREATE OR REPLACE FUNCTION admin_set_rfq_margin(
  p_rfq_id UUID,
  p_margin DECIMAL
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Update all quotes for this RFQ
  UPDATE public.quotes
  SET margin_percent = p_margin
  WHERE rfq_id = p_rfq_id;
END;
$$ LANGUAGE plpgsql;
