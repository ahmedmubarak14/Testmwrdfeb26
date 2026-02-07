CREATE OR REPLACE FUNCTION get_admin_dashboard_stats()
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_sales NUMERIC;
  v_total_orders INTEGER;
  v_avg_margin NUMERIC;
  v_pending_products INTEGER;
  v_pending_users INTEGER;
  v_result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- 1. Total Sales (Sum of all orders that are not cancelled)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_sales 
  FROM public.orders 
  WHERE status != 'Cancelled';

  -- 2. Total Orders
  SELECT COUNT(*) INTO v_total_orders 
  FROM public.orders;

  -- 3. Average Margin (from accepted quotes)
  SELECT COALESCE(AVG(margin_percent), 0) INTO v_avg_margin 
  FROM public.quotes 
  WHERE status = 'ACCEPTED';

  -- 4. Pending Products
  SELECT COUNT(*) INTO v_pending_products 
  FROM public.products 
  WHERE status = 'PENDING';

  -- 5. Pending Users (Suppliers/Clients needing approval)
  SELECT COUNT(*) INTO v_pending_users 
  FROM public.users 
  WHERE status = 'PENDING' OR (verified = FALSE AND role != 'ADMIN');

  -- Construct JSON Result
  v_result := jsonb_build_object(
    'totalSales', v_total_sales,
    'totalOrders', v_total_orders,
    'averageMargin', ROUND(v_avg_margin, 2),
    'pendingProducts', v_pending_products,
    'pendingUsers', v_pending_users
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
