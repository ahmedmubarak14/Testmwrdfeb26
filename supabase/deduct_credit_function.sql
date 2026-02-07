CREATE OR REPLACE FUNCTION accept_quote_and_deduct_credit(p_quote_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote RECORD;
  v_rfq RECORD;
  v_client RECORD;
  v_new_order JSONB;
  v_order_id UUID;
BEGIN
  -- 1. Get Quote
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_quote.status = 'ACCEPTED' THEN
     RAISE EXCEPTION 'Quote already accepted';
  END IF;

  -- 2. Get RFQ to find client
  SELECT * INTO v_rfq FROM rfqs WHERE id = v_quote.rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked RFQ not found';
  END IF;

  -- Caller must be the RFQ owner.
  IF auth.uid() IS NULL OR auth.uid() <> v_rfq.client_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 3. Get Client
  SELECT * INTO v_client FROM users WHERE id = v_rfq.client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  -- 4. Check Credit Limit
  IF COALESCE(v_client.credit_limit, 0) < v_quote.final_price THEN
    RAISE EXCEPTION 'Insufficient credit limit. Available: %, Required: %', COALESCE(v_client.credit_limit, 0), v_quote.final_price;
  END IF;

  -- 5. Perform Updates
  
  -- Deduct Credit
  UPDATE users 
  SET credit_limit = COALESCE(credit_limit, 0) - v_quote.final_price 
  WHERE id = v_client.id;

  -- Update Quote Status
  UPDATE quotes 
  SET status = 'ACCEPTED' 
  WHERE id = p_quote_id;

  -- Update RFQ Status
  UPDATE rfqs 
  SET status = 'CLOSED' 
  WHERE id = v_rfq.id;

  -- Create Order
  -- Note: explicit column mapping based on api.ts usage.
  -- Assuming columns exist: client_id, supplier_id, quote_id, amount, status, date
  INSERT INTO orders (client_id, supplier_id, quote_id, amount, status, date)
  VALUES (
    v_rfq.client_id,
    v_quote.supplier_id,
    p_quote_id,
    v_quote.final_price,
    'PENDING_PAYMENT',
    CURRENT_DATE
  )
  RETURNING id INTO v_order_id;

  -- Return the new order
  SELECT row_to_json(orders) INTO v_new_order FROM orders WHERE id = v_order_id;
  
  RETURN v_new_order;

END;
$$ LANGUAGE plpgsql;
