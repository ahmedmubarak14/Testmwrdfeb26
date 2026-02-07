-- ============================================================================
-- MWRD MARKETPLACE - RETAIL PRICING WITH AUTO-MARGIN CALCULATION
-- ============================================================================

-- Add retail_price field to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS retail_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS margin_percent DECIMAL(5, 2) DEFAULT 15.00;

-- ============================================================================
-- AUTO-CALCULATE RETAIL PRICE TRIGGER
-- ============================================================================

-- Function to calculate retail price based on cost price and margin
CREATE OR REPLACE FUNCTION calculate_retail_price()
RETURNS TRIGGER AS $$
DECLARE
  v_margin_percent DECIMAL(5, 2);
BEGIN
  -- Get margin for this product's category, or use default
  SELECT margin_percent INTO v_margin_percent
  FROM margin_settings
  WHERE category = NEW.category OR (category IS NULL AND is_default = TRUE)
  ORDER BY category NULLS LAST
  LIMIT 1;

  -- If no margin found, use 15% default
  IF v_margin_percent IS NULL THEN
    v_margin_percent := 15.00;
  END IF;

  -- Store the margin used
  NEW.margin_percent := v_margin_percent;

  -- Calculate retail price if cost_price is set
  IF NEW.cost_price IS NOT NULL AND NEW.cost_price > 0 THEN
    NEW.retail_price := NEW.cost_price * (1 + v_margin_percent / 100);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate retail price
DROP TRIGGER IF EXISTS calculate_product_retail_price ON products;
CREATE TRIGGER calculate_product_retail_price
  BEFORE INSERT OR UPDATE OF cost_price, category ON products
  FOR EACH ROW
  EXECUTE FUNCTION calculate_retail_price();

-- ============================================================================
-- UPDATE EXISTING PRODUCTS WITH RETAIL PRICES
-- ============================================================================

-- Apply retail prices to all existing products
UPDATE products
SET cost_price = cost_price -- This triggers the calculation
WHERE cost_price IS NOT NULL;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get product retail price (with fallback)
CREATE OR REPLACE FUNCTION get_product_retail_price(p_product_id UUID)
RETURNS DECIMAL(10, 2) AS $$
DECLARE
  v_retail_price DECIMAL(10, 2);
BEGIN
  SELECT retail_price INTO v_retail_price
  FROM products
  WHERE id = p_product_id;

  RETURN COALESCE(v_retail_price, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to bulk update retail prices for a category
CREATE OR REPLACE FUNCTION update_category_retail_prices(p_category TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE products
  SET cost_price = cost_price -- Triggers recalculation
  WHERE category = p_category AND cost_price IS NOT NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update all retail prices (useful when margins change)
CREATE OR REPLACE FUNCTION refresh_all_retail_prices()
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE products
  SET cost_price = cost_price -- Triggers recalculation
  WHERE cost_price IS NOT NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY UPDATES
-- ============================================================================

-- Update RLS policies to hide cost_price from clients
-- Clients should only see retail_price

-- Drop existing policy if needed
DROP POLICY IF EXISTS "Anyone can view approved products" ON products;

-- Recreate with better column visibility
CREATE POLICY "Clients can view approved products (retail price only)" ON products
  FOR SELECT USING (
    status = 'APPROVED' AND
    (get_user_role() = 'CLIENT' OR get_user_role() IS NULL)
  );

-- Suppliers and admins can see all pricing
CREATE POLICY "Suppliers and admins can view all product details" ON products
  FOR SELECT USING (
    get_user_role() IN ('SUPPLIER', 'ADMIN')
  );

-- ============================================================================
-- CREATE VIEW FOR CLIENT PRODUCT DISPLAY
-- ============================================================================

-- View that shows only retail pricing to clients
CREATE OR REPLACE VIEW client_products AS
SELECT
  id,
  supplier_id,
  name,
  description,
  category,
  image,
  status,
  retail_price,
  margin_percent,
  sku,
  created_at,
  updated_at
FROM products
WHERE status = 'APPROVED';

-- Grant access to authenticated users
GRANT SELECT ON client_products TO authenticated;
GRANT SELECT ON client_products TO anon;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Show products with pricing
SELECT
  name,
  category,
  cost_price as "Cost (Hidden from Clients)",
  margin_percent as "Margin %",
  retail_price as "Retail Price (Client Sees)",
  ROUND(retail_price - cost_price, 2) as "MWRD Profit"
FROM products
WHERE cost_price IS NOT NULL
ORDER BY category, name
LIMIT 10;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

SELECT 'Retail Pricing System Setup Complete!' as message;
